# pacman_game/consumers.py
#
# Porté de pacman_ft_transcendence (`backend/game/consumers.py`, commit 2c46068)
# sur le pattern chess_game/consumers.py :
#   - identité : `self.scope["user"]` (auth cookie/session, comme chess) — anon
#     refusé (close 4001). `channel_name` reste l'id joueur SUR LE FIL (reco B),
#     `user` sert à l'auth et à ranger les scores dans le bon GamePlayer.
#   - salon : slug `room_name` -> une ligne Game (get_or_create).
#   - état live : cache Redis (`pacman:<room>`), TTL 24 h. Les `position_update`
#     et autres mouvements restent du PUR RELAIS (jamais Redis) ; seuls
#     `eat_dot` / `contact` / `round_start` / `role_assignment` / `round_restart`
#     lisent-modifient-réécrivent l'état autoritaire, comme un coup aux échecs.
#   - fin de manche : `_finish_game` -> Game (status/winner/durée) + GamePlayer.
#
# ponytail: une seule ligne Game par salon (room_name unique), réutilisée d'une
# manche à l'autre. Pas d'historique par manche (l'original avait un modèle
# MatchResult séparé) — à ajouter si l'équipe le veut.
#
# Multi-worker Daphne : `_room_lock` et `_sync_loop` supposaient un seul
# process (verrou/tâche en mémoire). Un test de charge (1000 salons x 8 rôles)
# a montré qu'un seul worker sature vite. Passage à plusieurs process Daphne
# (voir docker_conf/entrypoint.sh, `DAPHNE_WORKERS`) + verrou Redis distribué
# (`cache.lock`, django-redis) + ownership Redis pour la boucle de synchro
# (un seul process doit la faire tourner par salon, pas un par worker).

import asyncio
import json
import time
import logging

from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db                import database_sync_to_async

from django.core.cache          import cache
from django.utils               import timezone
from asgiref.sync               import sync_to_async

from .services                  import (
    RoomState, PACMAN_ROLES, GHOST_SPRITE_ROLES,
    BOT_PACMAN_ID, BOT_PACMAN_NAME, BOT_START_COL, BOT_START_ROW,
    bot_next_step, tile_to_pixel, pixel_to_tile,
)

logger = logging.getLogger(__name__)

STATE_TTL               = 86400
SYNC_INTERVAL_SECONDS   = 2
ACTIVE_ROOMS_KEY        = "pacman_active_rooms"

# Cadence des pas du bot (une tuile par tick) et rayon de contact avec un
# fantôme, aligné sur `_checkGhostCatch()` côté front (`< 18` px).
BOT_TICK_SECONDS        = 0.22
BOT_CONTACT_RADIUS_PX   = 18
# Direction (mot complet, comme envoyé par un client réel) selon le pas.
_DIRECTION_WORDS = {(0, -1): 'up', (0, 1): 'down', (-1, 0): 'left', (1, 0): 'right'}

ALLOWED_ROLES = (
    'pacman', 'madame_pacman', 'baby', 'blocker', 'builder',
    'ghost_pinky', 'ghost_blinky', 'ghost_inky', 'ghost_sue',
    'spectator',
)

# Une tâche de synchro périodique par salon actif, PAR PROCESS (chaque worker
# Daphne a son propre dict). Optimisation locale seulement : évite qu'un même
# process relance N tâches pour N connexions au même salon. La garantie
# "un seul worker fait tourner la boucle pour ce salon" vient de l'ownership
# Redis dans `_sync_loop`, pas de ce dict.
_sync_tasks = {}


def _room_key(room_name: str) -> str:
    return f"pacman:{room_name}"


# Dernière position connue de CHAQUE joueur (pas seulement les fantômes — pas
# cher de tout garder, et ça évite d'avoir à interroger `RoomState` pour
# filtrer par rôle à l'écriture). Clé PAR JOUEUR plutôt qu'un seul dict pour
# tout le salon : chaque `position_update` (~20/s/joueur) fait alors un
# `cache.set` isolé, sans lecture-modification-écriture ni verrou — même
# esprit que `touch()`/`seen_ts` (auto-correcteur, pas d'exigence de
# cohérence forte). Lu par `_bot_loop` pour savoir où sont les fantômes.
_POSITION_TTL = 5


def _pos_key(room_name: str, pid: str) -> str:
    return f"pacman:{room_name}:pos:{pid}"


# Un salon où personne ne lance la manche est fermé au bout de ça (le sujet
# "supprime les salons zombies"). Un salon vide est supprimé tout de suite.
LOBBY_IDLE_TIMEOUT = 600  # 10 min


def _purge_game_row_sync(room_name):
    """Supprime la ligne Game du salon (GamePlayer en cascade)."""
    from .models import Game
    Game.objects.filter(room_name=room_name).delete()


def _release_empty_room_sync(room_name):
    """Salon devenu vide : on NE supprime PAS tout de suite. Une manche finie
    part (rien à en faire) ; sinon on repasse le salon en WAITING pour qu'il
    reste visible et rejoignable. Le vrai ménage = timeout d'inactivité."""
    from .models import Game, GameStatus
    game = Game.objects.filter(room_name=room_name).first()
    if game is None:
        return
    if game.status == GameStatus.FINISHED:
        game.delete()
        return
    game.status      = GameStatus.WAITING
    game.started_at  = None
    game.finished_at = None
    game.winner      = None
    game.last_active = timezone.now()
    game.save(update_fields=[
        "status", "started_at", "finished_at", "winner", "last_active",
    ])


def _reset_game_to_waiting_sync(room_name):
    """Manche terminée, les joueurs veulent une revanche : la ligne Game
    redevient WAITING (visible/rejoignable comme un salon tout neuf) quel
    que soit son statut actuel (typiquement FINISHED - contrairement à
    `_release_empty_room_sync`, qui la supprimerait dans ce cas, on la garde :
    ce salon a des joueurs qui reviennent, pas personne)."""
    from .models import Game, GameStatus
    Game.objects.filter(room_name=room_name).update(
        status=GameStatus.WAITING,
        started_at=None,
        finished_at=None,
        winner=None,
        last_active=timezone.now(),
    )


@database_sync_to_async
def _persist_result_sync(room_name, room):
    """Enregistre le résultat de la manche en base. Prend `room_name` (pas
    `game_id`) pour être appelable depuis `_bot_loop`, qui n'a pas de
    consumer/self — un id de salon suffit, une ligne `Game` de plus à lire."""
    result = room.match_result()
    if not result:
        return
    from .models import Game, GamePlayer, GameStatus
    game = Game.objects.filter(room_name=room_name).only('pk').first()
    if not game:
        return
    updated = Game.objects.filter(pk=game.pk).update(
        status=GameStatus.FINISHED,
        winner=result['winner'],
        level=result['level'],
        finished_at=timezone.now(),
        duration_seconds=result['duration'],
    )
    if not updated:
        return
    for p in result['players']:
        uid = p.get('user_id')
        if uid is None:
            continue
        GamePlayer.objects.update_or_create(
            game_id=game.pk,
            user_id=uid,
            defaults={
                'role':  p['role'],
                'score': p['score'],
                'lives': p['lives'],
                'won':   p['won'],
            },
        )


async def _finish_game(room_name, room):
    await _persist_result_sync(room_name, room)
    await sync_to_async(cache.delete)(_room_key(room_name))
    await sync_to_async(_drop_active_sync)(room_name)


def _lobby_idle_age_sync(room_name):
    """Secondes d'inactivité si le salon est en attente, sinon None."""
    from .models import Game, GameStatus
    game = Game.objects.filter(room_name=room_name).only(
        "status", "last_active",
    ).first()
    if game is None or game.status != GameStatus.WAITING:
        return None
    return (timezone.now() - game.last_active).total_seconds()


def _touch_room_active_sync(room_name):
    from .models import Game
    Game.objects.filter(room_name=room_name).update(last_active=timezone.now())


def _valid_room(room_name) -> bool:
    return (
        isinstance(room_name, str)
        and 0 < len(room_name) <= 100
        and room_name.replace('-', '').replace('_', '').isalnum()
    )


# --- helpers cache synchrones (partagés avec la boucle de synchro) -----------

def _load_state_sync(room_name):
    data = cache.get(_room_key(room_name))
    return RoomState.from_dict(data) if data else None


def _save_state_sync(room_name, room):
    cache.set(_room_key(room_name), room.to_dict(), timeout=STATE_TTL)


def _mark_active_sync(room_name):
    active = set(cache.get(ACTIVE_ROOMS_KEY, set()))
    if room_name not in active:
        active.add(room_name)
        cache.set(ACTIVE_ROOMS_KEY, active, timeout=None)


def _drop_active_sync(room_name):
    active = set(cache.get(ACTIVE_ROOMS_KEY, set()))
    if room_name in active:
        active.discard(room_name)
        cache.set(ACTIVE_ROOMS_KEY, active, timeout=None)


# --- boucle de synchro de secours ------------------------------------------

def _sync_owner_key(room_name: str) -> str:
    return f"pacman_sync_owner:{room_name}"


async def _sync_loop(channel_layer, room_name, group_name):
    """Rediffuse un `state_sync` toutes les 2 s + purge les joueurs absents.

    Filet de sécurité : le gros de la synchro passe par les événements en direct
    (`dot_eaten`, ...). Se termine d'elle-même quand le salon est vide.

    Avec plusieurs workers Daphne, `connect()` peut appeler `_ensure_sync_task`
    depuis N process différents pour le même salon (ses 8 joueurs ne tombent
    pas forcément tous sur le même worker) - sans garde-fou, chacun lancerait
    SA PROPRE boucle -> `state_sync` diffusé en double/triple. `cache.add` (SET
    NX côté Redis) ne laisse qu'un seul process obtenir la clé d'ownership ;
    les autres retournent tout de suite, leur entrée locale de `_sync_tasks`
    reste juste un no-op déjà terminé.
    """
    owner_key = _sync_owner_key(room_name)
    got_ownership = await sync_to_async(cache.add)(
        owner_key, 1, timeout=SYNC_INTERVAL_SECONDS * 3,
    )
    if not got_ownership:
        return

    _tick = 0
    try:
        while True:
            await asyncio.sleep(SYNC_INTERVAL_SECONDS)
            # Renouvelle l'ownership avant qu'elle expire (TTL = 3 ticks de
            # marge) - sinon un autre worker pourrait la prendre pendant que
            # cette boucle tourne encore.
            await sync_to_async(cache.set)(
                owner_key, 1, timeout=SYNC_INTERVAL_SECONDS * 3,
            )
            room = await sync_to_async(_load_state_sync)(room_name)
            if room is None:
                break
            room.prune(time.time())
            if room.empty():
                await sync_to_async(cache.delete)(_room_key(room_name))
                await sync_to_async(_drop_active_sync)(room_name)
                await sync_to_async(_release_empty_room_sync)(room_name)
                break

            _tick += 1
            if _tick % 15 == 0:  # ~30 s
                await sync_to_async(_touch_room_active_sync)(room_name)

            idle = await sync_to_async(_lobby_idle_age_sync)(room_name)
            if idle is not None and idle > LOBBY_IDLE_TIMEOUT:
                await channel_layer.group_send(
                    group_name, {'type': 'broadcast_lobby_closed'},
                )
                await sync_to_async(cache.delete)(_room_key(room_name))
                await sync_to_async(_drop_active_sync)(room_name)
                await sync_to_async(_purge_game_row_sync)(room_name)
                break

            await sync_to_async(_save_state_sync)(room_name, room)
            await channel_layer.group_send(
                group_name,
                {'type': 'broadcast_state_sync', 'snapshot': room.snapshot()},
            )
    except asyncio.CancelledError:
        pass
    finally:
        _sync_tasks.pop(room_name, None)
        await sync_to_async(cache.delete)(owner_key)


def _ensure_sync_task(channel_layer, room_name, group_name):
    task = _sync_tasks.get(room_name)
    if task and not task.done():
        return
    _sync_tasks[room_name] = asyncio.ensure_future(
        _sync_loop(channel_layer, room_name, group_name)
    )


# Un verrou par salon pour sérialiser les séquences lecture-modif-écriture sur
# l'état Redis (`add_player` à la connexion, `role_assignment`, `eat_dot`,
# ...). Sans lui, deux connexions concurrentes (typiquement plusieurs joueurs
# qui se (re)connectent au même instant, cf. le retour au salon d'attente
# après une manche) peuvent chacune charger l'état AVANT que l'autre ait
# sauvegardé le sien : la deuxième écriture écrase la première en silence et
# le joueur qu'elle contenait disparaît du salon - symptôme observé côté
# joueurs : "tout le monde ne se retrouve pas dans la même partie".
#
# Verrou Redis (`cache.lock`, django-redis - SET NX + expiration côté Redis,
# libéré via un script Lua qui vérifie le token du détenteur) plutôt qu'un
# `asyncio.Lock` en mémoire du process : deux connexions du MÊME salon qui
# tombent sur deux workers Daphne différents doivent se voir mutuellement,
# ce qu'un lock en mémoire ne peut pas faire. `timeout` = durée de vie max du
# verrou côté Redis (garde-fou si un worker crashe en le tenant) ; les
# sections critiques ici sont un aller-retour Redis, largement sous la
# seconde.
_ROOM_LOCK_TIMEOUT = 10


class _RedisRoomLock:
    """Wrapper `async with` autour de `cache.lock()` (bloquant/sync côté
    redis-py) - `acquire`/`release` passent par `sync_to_async` pour ne pas
    geler la boucle asyncio pendant l'attente.

    `thread_sensitive=False` est essentiel ici, pas juste une option : par
    défaut `sync_to_async` fait tourner tout le code sync d'UN MÊME process
    sur un seul thread partagé (pour imiter Django classique). Un `acquire()`
    qui attend plusieurs secondes sur ce thread unique bloquait TOUT le reste
    du travail sync_to_async du process pendant l'attente, y compris le
    `release()` du salon qui tenait le verrou -> interblocage (constaté : les
    connexions restaient ouvertes mais plus aucun rôle n'était jamais
    confirmé). `thread_sensitive=False` fait tourner acquire/release sur le
    pool de threads normal (plusieurs threads).

    Deuxième piège, plus subtil, trouvé en testant avec plusieurs centaines de
    connexions d'un coup : `acquire(blocking=True)` de redis-py attend en
    bloquant LE THREAD pendant tout le poll (sleep entre essais compris) - un
    thread du pool est donc immobilisé toute la durée de l'attente, pas
    seulement le temps d'un essai. Avec un pool de taille fixe, ça sature vite
    sous forte concurrence (beaucoup de connexions qui attendent le même
    verrou de salon en même temps) et tout ralentit en cascade. On boucle donc
    nous-mêmes sur des tentatives `blocking=False` (un aller-retour Redis
    quasi instantané, le thread est rendu tout de suite) et on attend entre
    deux essais avec `asyncio.sleep` - qui ne coûte rien en threads, juste de
    la planification sur la boucle asyncio.
    """

    _POLL_INTERVAL = 0.05

    def __init__(self, room_name: str):
        # thread_local=False : redis-py range sinon le jeton d'acquisition
        # dans un `threading.local()`, or acquire()/release() peuvent tourner
        # sur deux threads différents du pool (thread_sensitive=False, voir
        # plus haut) - release() plantait avec "'_thread._local' object has
        # no attribute 'token'" dès que ça arrivait. Sûr ici : chaque instance
        # de _RedisRoomLock n'a qu'un seul propriétaire logique (un `async
        # with`), peu importe le thread réel qui exécute chaque étape.
        self._lock = cache.lock(
            f"pacman_room_lock:{room_name}", timeout=_ROOM_LOCK_TIMEOUT, thread_local=False,
        )

    async def __aenter__(self):
        while not await sync_to_async(self._lock.acquire, thread_sensitive=False)(blocking=False):
            await asyncio.sleep(self._POLL_INTERVAL)
        return self

    async def __aexit__(self, exc_type, exc, tb):
        await sync_to_async(self._lock.release, thread_sensitive=False)()


def _room_lock(room_name: str) -> _RedisRoomLock:
    return _RedisRoomLock(room_name)


# --- Bot Pac-Man (aucun humain n'a pris un rôle PACMAN_ROLES) ---------------
#
# `handle_round_start` ajoute un joueur virtuel `BOT_PACMAN_ID` à `room.players`
# si personne n'a de rôle `PACMAN_ROLES` au lancement, puis démarre cette
# boucle. Elle avance le bot d'une case par tick (`bot_next_step`, BFS vers le
# grain le plus proche en évitant les fantômes non effrayés), diffuse sa
# position comme le ferait un vrai client (`broadcast_position`), et
# appelle les MÊMES méthodes de `RoomState` que les handlers humains
# (`eat_dot`, `resolve_contact`) pour que score/vies/fin de manche restent
# une seule source de vérité. Ownership Redis par salon, même schéma que
# `_sync_loop` : plusieurs workers Daphne peuvent appeler `_ensure_bot_task`
# pour le même salon, un seul doit réellement faire avancer le bot.

_bot_tasks = {}


def _bot_owner_key(room_name: str) -> str:
    return f"pacman_bot_owner:{room_name}"


async def _broadcast_contact_outcome(channel_layer, room_name, group_name, pacman_id, ghost_id, outcome, room):
    """Diffuse le résultat d'un `resolve_contact()` déjà appliqué et
    sauvegardé. Partagé par `handle_contact` (joueur humain) et `_bot_loop`
    (le bot est traité exactement comme un Pac-Man de plus)."""
    if outcome['type'] == 'ghost_home':
        await channel_layer.group_send(
            group_name,
            {'type': 'broadcast_ghost_home', 'ghost': ghost_id, 'by': pacman_id},
        )
        await channel_layer.group_send(
            group_name, {'type': 'broadcast_state_sync', 'snapshot': room.snapshot()},
        )
        return

    if outcome['type'] == 'pacman_imprisoned':
        await channel_layer.group_send(
            group_name,
            {
                'type': 'broadcast_player_imprisoned',
                'pid': pacman_id,
                'seconds': outcome['seconds'],
            },
        )
        await channel_layer.group_send(
            group_name, {'type': 'broadcast_state_sync', 'snapshot': room.snapshot()},
        )
        return

    # pacman_caught
    await channel_layer.group_send(
        group_name,
        {'type': 'broadcast_player_caught', 'pid': pacman_id, 'lives': outcome['lives']},
    )
    if outcome['over']:
        await channel_layer.group_send(
            group_name,
            {'type': 'broadcast_round_over', 'player_id': pacman_id, 'winner': 'ghosts'},
        )
    await channel_layer.group_send(
        group_name, {'type': 'broadcast_state_sync', 'snapshot': room.snapshot()},
    )
    if outcome['over']:
        await _finish_game(room_name, room)


async def _bot_move_and_eat(channel_layer, room_name, group_name, current_tile, room):
    """Un pas du bot vers le grain atteignable le plus proche (en évitant les
    fantômes non effrayés quand un chemin le permet), diffusion de sa
    position, et prise en compte s'il atterrit sur un grain. Retourne la
    tuile (col, row) après ce tick — inchangée si aucun coup n'est possible."""
    now = time.time()
    frightened = now < room.frightened_until

    ghost_pids = [pid for pid, p in room.players.items() if p.get('role') in GHOST_SPRITE_ROLES]
    positions = {}
    if ghost_pids:
        positions = await sync_to_async(cache.get_many, thread_sensitive=False)(
            [_pos_key(room_name, pid) for pid in ghost_pids]
        )

    ghost_pixels = {}
    blocked = set()
    for pid in ghost_pids:
        pos = positions.get(_pos_key(room_name, pid))
        if not pos:
            continue
        ghost_pixels[pid] = (pos['x'], pos['y'])
        if not frightened:
            col, row = pixel_to_tile(pos['x'], pos['y'])
            blocked.add((col, row))
            for dcol, drow in ((0, -1), (0, 1), (-1, 0), (1, 0)):
                blocked.add((col + dcol, row + drow))

    next_tile = bot_next_step(current_tile, room.dots | room.pellets, blocked, map_choice=room.map_choice)
    if next_tile is None:
        return current_tile  # rien à manger d'atteignable ce tick

    dcol = next_tile[0] - current_tile[0]
    if abs(dcol) > 1:  # tuile de tunnel qui boucle d'un bord à l'autre
        dcol = -1 if dcol > 0 else 1
    drow = next_tile[1] - current_tile[1]
    direction = _DIRECTION_WORDS.get((dcol, drow), 'right')
    x, y = tile_to_pixel(*next_tile)

    await sync_to_async(cache.set, thread_sensitive=False)(
        _pos_key(room_name, BOT_PACMAN_ID),
        {'x': x, 'y': y, 'direction': direction},
        timeout=_POSITION_TTL,
    )
    await channel_layer.group_send(
        group_name,
        {
            'type': 'broadcast_position',
            'player_id': BOT_PACMAN_ID,
            'position': {'x': float(x), 'y': float(y)},
            'direction': direction,
        },
    )

    col, row = next_tile
    async with _room_lock(room_name):
        fresh = await sync_to_async(_load_state_sync)(room_name)
        if fresh is None:
            return next_tile
        kind = fresh.eat_dot(BOT_PACMAN_ID, col, row)
        cleared = kind is not None and fresh.is_cleared() and fresh.status != 'over'
        if cleared:
            fresh.status = 'over'
            fresh.winner = 'pacman'
        if kind is not None:
            await sync_to_async(_save_state_sync)(room_name, fresh)

    if kind is not None:
        bot_player = fresh.players.get(BOT_PACMAN_ID, {})
        await channel_layer.group_send(
            group_name,
            {
                'type': 'broadcast_dot_eaten',
                'col': col, 'row': row,
                'by': BOT_PACMAN_ID,
                'kind': kind,
                'score': bot_player.get('score', 0),
            },
        )
        if cleared:
            await channel_layer.group_send(
                group_name,
                {'type': 'broadcast_round_over', 'player_id': BOT_PACMAN_ID, 'winner': 'pacman'},
            )
            await channel_layer.group_send(
                group_name, {'type': 'broadcast_state_sync', 'snapshot': fresh.snapshot()},
            )
            await _finish_game(room_name, fresh)
            return next_tile

    # Contact avec un fantôme dont on connaît la position (pixels, même
    # rayon que `_checkGhostCatch()` côté front).
    for ghost_id, (gx, gy) in ghost_pixels.items():
        if abs(x - gx) < BOT_CONTACT_RADIUS_PX and abs(y - gy) < BOT_CONTACT_RADIUS_PX:
            async with _room_lock(room_name):
                fresh2 = await sync_to_async(_load_state_sync)(room_name)
                if fresh2 is None:
                    break
                outcome = fresh2.resolve_contact(BOT_PACMAN_ID, ghost_id, time.time())
                if outcome is None:
                    continue
                await sync_to_async(_save_state_sync)(room_name, fresh2)
            await _broadcast_contact_outcome(
                channel_layer, room_name, group_name, BOT_PACMAN_ID, ghost_id, outcome, fresh2,
            )
            break

    return next_tile


async def _bot_loop(channel_layer, room_name, group_name):
    owner_key = _bot_owner_key(room_name)
    got_ownership = await sync_to_async(cache.add)(
        owner_key, 1, timeout=BOT_TICK_SECONDS * 6,
    )
    if not got_ownership:
        return

    current_tile = (BOT_START_COL, BOT_START_ROW)
    try:
        while True:
            await asyncio.sleep(BOT_TICK_SECONDS)
            await sync_to_async(cache.set, thread_sensitive=False)(owner_key, 1, timeout=BOT_TICK_SECONDS * 6)

            room = await sync_to_async(_load_state_sync, thread_sensitive=False)(room_name)
            if room is None or room.status != 'playing' or BOT_PACMAN_ID not in room.players:
                break

            current_tile = await _bot_move_and_eat(
                channel_layer, room_name, group_name, current_tile, room,
            )
    except asyncio.CancelledError:
        pass
    finally:
        _bot_tasks.pop(room_name, None)
        await sync_to_async(cache.delete)(owner_key)
        await sync_to_async(cache.delete)(_pos_key(room_name, BOT_PACMAN_ID))


def _ensure_bot_task(channel_layer, room_name, group_name):
    task = _bot_tasks.get(room_name)
    if task and not task.done():
        return
    _bot_tasks[room_name] = asyncio.ensure_future(
        _bot_loop(channel_layer, room_name, group_name)
    )


class GameConsumer(AsyncWebsocketConsumer):
    """WebSocket du jeu Pac-Man multijoueur (temps réel, autoritaire serveur)."""

    async def connect(self):
        try:
            user = self.scope.get("user")
            if user is None or user.is_anonymous:
                await self.close(code=4001)
                return

            kwargs = (self.scope.get("url_route") or {}).get("kwargs") or {}
            room_name = kwargs.get("room_name")
            if not _valid_room(room_name):
                await self.close(code=4000)
                return

            self.user               = user
            self.room_name          = room_name
            self.room_group_name    = f"pacman_{room_name}"
            self._last_seen_touch   = 0.0

            self.game_id = await self._get_game_id()
            if self.game_id is None:
                await self.close(code=4004)
                return

            await self.channel_layer.group_add(self.room_group_name, self.channel_name)
            await self.accept()

            # Sent directly (not a group broadcast) and first, so it always
            # reaches this connection before its own `player_joined` echo -
            # the client used to guess "the first `join` I receive is me",
            # which races another player's `player_joined` arriving first
            # when several sockets open together (every round start): both
            # ended up believing they were the SAME id, so each one either
            # never drew the other or drew itself as the opponent.
            await self.send(text_data=json.dumps({
                'type': 'self_id',
                'player_id': self.channel_name,
            }))

            stale_pid = None
            async with _room_lock(self.room_name):
                room = await self._load_room()
                stale_pid = room.find_pid_by_user(self.user.pk, exclude_pid=self.channel_name)
                if stale_pid:
                    room.remove_player(stale_pid)
                room.add_player(
                    self.channel_name,
                    name=self._display_name(),
                    user_id=self.user.pk,
                )
                await self._save_room(room)
            await sync_to_async(_mark_active_sync)(self.room_name)

            _ensure_sync_task(self.channel_layer, self.room_name, self.room_group_name)

            if stale_pid:
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {'type': 'player_left', 'player_id': stale_pid},
                )
            await self.channel_layer.group_send(
                self.room_group_name,
                {'type': 'player_joined', 'player_id': self.channel_name},
            )
            await self.send(text_data=json.dumps({
                'type': 'state_sync',
                **room.snapshot(),
            }))
        except Exception:
            logger.exception(
                "Pacman connect crashed for user %s", self.scope.get("user")
            )
            await self.close(code=1011)

    async def disconnect(self, code):
        if not hasattr(self, 'room_group_name'):
            return

        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

        async with _room_lock(self.room_name):
            data = await sync_to_async(cache.get)(_room_key(self.room_name))
            if data is None:
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {'type': 'player_left', 'player_id': self.channel_name},
                )
                return
            room = RoomState.from_dict(data)
            room.remove_player(self.channel_name)
            if room.empty():
                await sync_to_async(cache.delete)(_room_key(self.room_name))
                await sync_to_async(_drop_active_sync)(self.room_name)
                await sync_to_async(_release_empty_room_sync)(self.room_name)
                task = _sync_tasks.pop(self.room_name, None)
                if task:
                    task.cancel()
                bot_task = _bot_tasks.pop(self.room_name, None)
                if bot_task:
                    bot_task.cancel()
            else:
                await self._save_room(room)

        await self.channel_layer.group_send(
            self.room_group_name,
            {'type': 'player_left', 'player_id': self.channel_name},
        )

    async def receive(self, text_data=None, bytes_data=None):
        if text_data is None or len(text_data) > 10000:
            return
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            return

        message_type = data.get('type', '')
        if not isinstance(message_type, str) or len(message_type) > 50:
            return

        # Signe de vie throttlé : éviter un aller-retour Redis à chaque paquet de
        # position (~20/s). L'état autoritaire est réécrit par les handlers qui
        # le modifient, pas ici.
        now = time.time()
        if now - self._last_seen_touch > 5:
            self._last_seen_touch = now
            await self._touch_seen()

        handlers = {
            'position_update':  self.handle_position_update,
            'role_assignment':  self.handle_role_assignment,
            'player_ready':     self.handle_player_ready,
            'start_countdown':  self.handle_start_countdown,
            'game_started':     self.handle_game_started,
            'collect_item':     self.handle_collect_item,
            'player_died':      self.handle_player_died,
            'baby_born':        self.handle_baby_born,
            'wall_placed':      self.handle_wall_placed,
            'wall_destroy':     self.handle_wall_destroy,
            'round_start':      self.handle_round_start,
            'eat_dot':          self.handle_eat_dot,
            'contact':          self.handle_contact,
            'request_sync':     self.handle_request_sync,
            'round_restart':    self.handle_round_restart,
            'power_used':       self.handle_power_used,
            'baby_action':      self.handle_baby_action,
            'lobby_hello':      self.handle_lobby_hello,
            'lobby_start':      self.handle_lobby_start,
        }
        handler = handlers.get(message_type)
        if handler:
            try:
                await handler(data)
            except Exception:
                logger.exception(
                    "Pacman handler %s crashed in room %s", message_type, self.room_name
                )

    # --- état : chargement / sauvegarde -----------------------------------

    async def _load_room(self) -> RoomState:
        data = await sync_to_async(cache.get)(_room_key(self.room_name))
        if data:
            return RoomState.from_dict(data)

        # Clé absente/expirée : reconstruire un état minimal depuis la ligne Game
        # (équivalent de `_rehydrate_state_from_db` de chess_game). Le DB ne
        # stocke ni la grille ni les scores en cours -> grille pleine, scores 0.
        room = await self._rehydrate_from_db()
        return room

    async def _save_room(self, room: RoomState):
        await sync_to_async(cache.set)(
            _room_key(self.room_name), room.to_dict(), timeout=STATE_TTL,
        )

    async def _broadcast_sync(self, room: RoomState):
        await self.channel_layer.group_send(
            self.room_group_name,
            {'type': 'broadcast_state_sync', 'snapshot': room.snapshot()},
        )

    async def _touch_seen(self):
        data = await sync_to_async(cache.get)(_room_key(self.room_name))
        if not data:
            return
        room = RoomState.from_dict(data)
        # ponytail: read-modify-write non atomique — un tick de synchro (2 s)
        # répare tout écrasement de grain accidentel.
        room.touch(self.channel_name)
        await self._save_room(room)

    # --- accès base ------------------------------------------------------

    @database_sync_to_async
    def _get_game_id(self):
        """pk du salon, ou None s'il n'existe pas. On ne crée JAMAIS un salon
        depuis le WebSocket : un salon = une ligne Game créée via
        POST /api/pacman/ (bouton "Créer"). Sinon la liste du lobby se
        remplirait de salons fantômes créés en tapant une URL au hasard."""
        from .models import Game
        game = Game.objects.filter(room_name=self.room_name).only("pk").first()
        return game.pk if game else None

    @database_sync_to_async
    def _rehydrate_from_db(self) -> RoomState:
        from .models import Game, GameStatus
        game = Game.objects.filter(pk=self.game_id).first()
        room = RoomState(map_choice=game.map_choice if game else 1)
        if game and game.status == GameStatus.IN_PROGRESS:
            room.status = 'playing'
            room.started_wall = (
                game.started_at.timestamp() if game.started_at else time.time()
            )
        return room

    @database_sync_to_async
    def _mark_in_progress(self):
        from .models import Game, GameStatus
        Game.objects.filter(pk=self.game_id).exclude(
            status=GameStatus.IN_PROGRESS,
        ).update(
            status=GameStatus.IN_PROGRESS,
            started_at=timezone.now(),
            finished_at=None,
            winner=None,
        )

    async def _finish_game(self, room: RoomState):
        await _finish_game(self.room_name, room)

    def _display_name(self) -> str:
        name = getattr(self.user, 'dispname', '') or self.user.get_username()
        return str(name)[:20]

    # --- handlers autoritaires (lecture-modif-écriture Redis) ------------

    async def handle_role_assignment(self, data):
        role = data.get('role', '')
        if role not in ALLOWED_ROLES:
            return
        # Le pseudo vient du compte authentifié, pas du client (reco B).
        name = self._display_name()
        async with _room_lock(self.room_name):
            room = await self._load_room()
            if room.role_taken(role, exclude_pid=self.channel_name):
                # Un autre joueur a déjà ce personnage (choix simultané, ou
                # rôle par défaut à la connexion) : on refuse et on renvoie au
                # SEUL demandeur son rôle réellement en vigueur, pour qu'il
                # corrige son affichage (il l'avait mis à jour de façon
                # optimiste).
                current = room.players.get(self.channel_name, {}).get('role', 'spectator')
                await self.send(text_data=json.dumps({
                    'type': 'role_rejected',
                    'role': role,
                    'current_role': current,
                }))
                return
            room.set_role(self.channel_name, role, name=name)
            player = room.players.get(self.channel_name)
            if player is not None:
                player['user_id'] = self.user.pk
            await self._save_room(room)
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'broadcast_role',
                'player_id': self.channel_name,
                'role': role,
                'metadata': {'name': name},
            },
        )

    async def handle_round_start(self, data):
        bot_needed = False
        async with _room_lock(self.room_name):
            room = await self._load_room()
            room.start()
            bot_needed = not any(p.get('role') in PACMAN_ROLES for p in room.players.values())
            if bot_needed:
                # Personne n'a pris pacman/madame_pacman/blocker : sans ça,
                # chaque client fige son Pac-Man local (`_setupLocalAvatar`)
                # et la manche ne peut jamais se terminer — le bot joue à sa
                # place (voir `_bot_loop`).
                room.add_player(BOT_PACMAN_ID, role='pacman', name=BOT_PACMAN_NAME)
            await self._save_room(room)
        await self._mark_in_progress()
        _ensure_sync_task(self.channel_layer, self.room_name, self.room_group_name)
        if bot_needed:
            _ensure_bot_task(self.channel_layer, self.room_name, self.room_group_name)
        await self.channel_layer.group_send(
            self.room_group_name,
            {'type': 'broadcast_round_started', 'level': 1},
        )
        await self._broadcast_sync(room)

    async def handle_eat_dot(self, data):
        col = data.get('col')
        row = data.get('row')
        if not isinstance(col, int) or not isinstance(row, int):
            return
        if not (0 <= col < 64 and 0 <= row < 64):
            return

        async with _room_lock(self.room_name):
            room = await self._load_room()
            kind = room.eat_dot(self.channel_name, col, row)
            if kind is None:
                # Grain déjà mangé / mauvais rôle / manche finie : le prochain
                # `state_sync` remettra le client d'aplomb.
                return

            cleared = room.is_cleared() and room.status != 'over'
            if cleared:
                room.status = 'over'
                room.winner = 'pacman'
            await self._save_room(room)

        player = room.players.get(self.channel_name, {})
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'broadcast_dot_eaten',
                'col': col, 'row': row,
                'by': self.channel_name,
                'kind': kind,
                'score': player.get('score', 0),
            },
        )

        if kind == 'pellet' and not cleared:
            # `dot_eaten` ne porte pas `frightened_ms` - sans ce sync immédiat,
            # les AUTRES joueurs n'apprenaient la fenêtre "effrayé" que via le
            # prochain tick de `_sync_loop` (jusqu'à 2 s plus tard, sur une
            # fenêtre de 6 s) - la teinte bleue d'un fantôme distant semblait
            # ne jamais s'afficher côté observateurs.
            await self._broadcast_sync(room)

        if cleared:
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'broadcast_round_over',
                    'player_id': self.channel_name,
                    'winner': 'pacman',
                },
            )
            await self._broadcast_sync(room)
            await self._finish_game(room)

    async def handle_contact(self, data):
        ghost_id = data.get('ghost')
        async with _room_lock(self.room_name):
            room = await self._load_room()
            outcome = room.resolve_contact(self.channel_name, ghost_id, time.time())
            if outcome is None:
                return
            await self._save_room(room)

        await _broadcast_contact_outcome(
            self.channel_layer, self.room_name, self.room_group_name,
            self.channel_name, ghost_id, outcome, room,
        )

    async def handle_round_restart(self, data):
        # Ne rejoue PAS la manche en place : `_finish_game` a déjà supprimé
        # l'état Redis autoritaire à la fin de la manche précédente, donc
        # `room = await self._load_room()` ici reconstruirait un salon fantôme
        # vide (aucun `players` enregistré - `_rehydrate_from_db` ne restaure
        # que pour un statut IN_PROGRESS) : les contacts/scores de tout le
        # monde seraient ensuite rejetés en silence, désynchronisant la partie.
        # On repasse simplement le salon en WAITING ; chaque client revient au
        # salon d'attente (écran « prêt ») et refera un `round_start` propre,
        # qui réenregistre chaque joueur normalement (comme au tout premier
        # lancement).
        await sync_to_async(cache.delete)(_room_key(self.room_name))
        await sync_to_async(_drop_active_sync)(self.room_name)
        await sync_to_async(_reset_game_to_waiting_sync)(self.room_name)
        await self.channel_layer.group_send(
            self.room_group_name,
            {'type': 'broadcast_round_restart', 'player_id': self.channel_name},
        )

    async def handle_request_sync(self, data):
        room = await self._load_room()
        await self.send(text_data=json.dumps({
            'type': 'state_sync',
            **room.snapshot(),
        }))

    # --- handlers de pur relais (aucun état serveur) --------------------

    async def handle_position_update(self, data):
        position = data.get('position', {})
        x = position.get('x', 0)
        y = position.get('y', 0)
        if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
            return
        if x < 0 or x > 10000 or y < 0 or y > 10000:
            return
        direction = data.get('direction', 'right')
        # Pur relais vers les autres clients (comme avant) + une écriture
        # best-effort, hors verrou, pour que `_bot_loop` sache où sont les
        # fantômes (voir `_pos_key`). `thread_sensitive=False` est important
        # ici : ce handler tourne à haute fréquence (~20/s/joueur) ; par
        # défaut `sync_to_async` sérialise TOUT le code sync du process sur
        # UN SEUL thread partagé (même piège déjà documenté sur le verrou de
        # salon plus haut) — sans ça, ce `cache.set` en rafale suffit à
        # saturer ce thread et fait déborder les files des groupes de
        # diffusion ("N channels over capacity"), voire fait traîner
        # l'authentification de nouvelles connexions WS jusqu'au rejet.
        await sync_to_async(cache.set, thread_sensitive=False)(
            _pos_key(self.room_name, self.channel_name),
            {'x': float(x), 'y': float(y), 'direction': direction},
            timeout=_POSITION_TTL,
        )
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'broadcast_position',
                'player_id': self.channel_name,
                'position': {'x': float(x), 'y': float(y)},
                'direction': direction,
            },
        )

    async def handle_wall_placed(self, data):
        tile = data.get('tile', {})
        col = tile.get('col')
        row = tile.get('row')
        ttl = data.get('ttl', 10)
        kind = data.get('kind', 'builder')
        if not isinstance(col, int) or not isinstance(row, int):
            return
        if not (0 <= col < 100 and 0 <= row < 100):
            return
        if not isinstance(ttl, (int, float)) or not (1 <= ttl <= 60):
            ttl = 10
        if kind not in ('builder', 'blocker'):
            kind = 'builder'
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'broadcast_wall',
                'player_id': self.channel_name,
                'tile': {'col': col, 'row': row},
                'ttl': ttl,
                'kind': kind,
            },
        )

    async def handle_wall_destroy(self, data):
        tile = data.get('tile', {})
        col = tile.get('col')
        row = tile.get('row')
        if not isinstance(col, int) or not isinstance(row, int):
            return
        if not (0 <= col < 100 and 0 <= row < 100):
            return
        await self.channel_layer.group_send(
            self.room_group_name,
            {'type': 'broadcast_wall_destroy', 'tile': {'col': col, 'row': row}},
        )

    async def handle_baby_action(self, data):
        kind = data.get('kind', '')
        if kind not in ('spawn', 'move', 'escape', 'died'):
            return
        pos = data.get('position', {})
        x = pos.get('x', 0)
        y = pos.get('y', 0)
        if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
            return
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'broadcast_baby',
                'player_id': self.channel_name,
                'kind': kind,
                'position': {'x': float(x), 'y': float(y)},
            },
        )

    async def handle_power_used(self, data):
        kind = data.get('kind', '')
        if kind not in ('freeze',):
            return
        pos = data.get('position', {})
        x = pos.get('x')
        y = pos.get('y')
        if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
            return
        if not (0 <= x <= 10000 and 0 <= y <= 10000):
            return
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'broadcast_power',
                'player_id': self.channel_name,
                'kind': kind,
                'position': {'x': float(x), 'y': float(y)},
            },
        )

    async def handle_player_ready(self, data):
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'broadcast_player_ready',
                'player_id': self.channel_name,
                'ready': data.get('ready', True),
            },
        )

    async def handle_start_countdown(self, data):
        countdown = data.get('countdown', 10)
        if not isinstance(countdown, int) or countdown < 3 or countdown > 60:
            countdown = 10
        await self.channel_layer.group_send(
            self.room_group_name,
            {'type': 'broadcast_countdown_start', 'countdown': countdown},
        )

    async def handle_game_started(self, data):
        await self.channel_layer.group_send(
            self.room_group_name,
            {'type': 'broadcast_game_started'},
        )

    async def handle_collect_item(self, data):
        item_type = data.get('item_type', '')
        if item_type not in ['dot', 'cherry', 'strawberry', 'powerup', 'pill']:
            return
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'broadcast_item_collected',
                'player_id': self.channel_name,
                'item_type': item_type,
                'item_id': data.get('item_id', ''),
            },
        )

    async def handle_player_died(self, data):
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'broadcast_player_died',
                'player_id': self.channel_name,
                'killer_id': data.get('killer_id', ''),
            },
        )

    async def handle_baby_born(self, data):
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'broadcast_baby_born',
                'parent1_id': self.channel_name,
                'parent2_id': data.get('parent2_id', ''),
                'baby_id': data.get('baby_id', ''),
            },
        )

    async def handle_lobby_hello(self, data):
        name = self._display_name()
        role = data.get('role', 'pacman')
        if role not in ALLOWED_ROLES:
            role = 'pacman'
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'broadcast_lobby_hello',
                'player_id': self.channel_name,
                'name': name,
                'role': role,
                'ready': bool(data.get('ready', False)),
            },
        )

    async def handle_lobby_start(self, data):
        countdown = data.get('countdown', 3)
        if not isinstance(countdown, int) or not (0 <= countdown <= 10):
            countdown = 3
        await self.channel_layer.group_send(
            self.room_group_name,
            {'type': 'broadcast_lobby_start', 'countdown': countdown},
        )

    # --- diffusion vers le socket -------------------------------------

    async def player_joined(self, event):
        await self.send(text_data=json.dumps({
            'type': 'player_joined', 'player_id': event['player_id'],
        }))

    async def player_left(self, event):
        await self.send(text_data=json.dumps({
            'type': 'player_left', 'player_id': event['player_id'],
        }))

    async def broadcast_position(self, event):
        await self.send(text_data=json.dumps({
            'type': 'position_update',
            'player_id': event['player_id'],
            'position': event['position'],
            'direction': event['direction'],
        }))

    async def broadcast_role(self, event):
        await self.send(text_data=json.dumps({
            'type': 'role_assignment',
            'player_id': event['player_id'],
            'role': event['role'],
            'metadata': event['metadata'],
        }))

    async def broadcast_wall(self, event):
        await self.send(text_data=json.dumps({
            'type': 'wall_placed',
            'player_id': event['player_id'],
            'tile': event['tile'],
            'ttl': event['ttl'],
            'kind': event.get('kind', 'builder'),
        }))

    async def broadcast_wall_destroy(self, event):
        await self.send(text_data=json.dumps({
            'type': 'wall_destroy', 'tile': event['tile'],
        }))

    async def broadcast_round_over(self, event):
        await self.send(text_data=json.dumps({
            'type': 'round_over',
            'player_id': event['player_id'],
            'winner': event['winner'],
        }))

    async def broadcast_round_restart(self, event):
        await self.send(text_data=json.dumps({
            'type': 'round_restart', 'player_id': event['player_id'],
        }))

    async def broadcast_round_started(self, event):
        await self.send(text_data=json.dumps({
            'type': 'round_started', 'level': event['level'],
        }))

    async def broadcast_dot_eaten(self, event):
        await self.send(text_data=json.dumps({
            'type': 'dot_eaten',
            'col': event['col'],
            'row': event['row'],
            'by': event['by'],
            'kind': event['kind'],
            'score': event['score'],
        }))

    async def broadcast_state_sync(self, event):
        await self.send(text_data=json.dumps({
            'type': 'state_sync',
            **event['snapshot'],
        }))

    async def broadcast_player_caught(self, event):
        await self.send(text_data=json.dumps({
            'type': 'player_caught',
            'pid': event['pid'],
            'lives': event['lives'],
        }))

    async def broadcast_ghost_home(self, event):
        await self.send(text_data=json.dumps({
            'type': 'ghost_home',
            'ghost': event['ghost'],
            'by': event['by'],
        }))

    async def broadcast_player_imprisoned(self, event):
        await self.send(text_data=json.dumps({
            'type': 'player_imprisoned',
            'pid': event['pid'],
            'seconds': event['seconds'],
        }))

    async def broadcast_power(self, event):
        await self.send(text_data=json.dumps({
            'type': 'power_used',
            'player_id': event['player_id'],
            'kind': event['kind'],
            'position': event['position'],
        }))

    async def broadcast_baby(self, event):
        await self.send(text_data=json.dumps({
            'type': 'baby_action',
            'player_id': event['player_id'],
            'kind': event['kind'],
            'position': event['position'],
        }))

    async def broadcast_lobby_hello(self, event):
        await self.send(text_data=json.dumps({
            'type': 'lobby_hello',
            'player_id': event['player_id'],
            'name': event['name'],
            'role': event['role'],
            'ready': event['ready'],
        }))

    async def broadcast_lobby_start(self, event):
        await self.send(text_data=json.dumps({
            'type': 'lobby_start', 'countdown': event['countdown'],
        }))

    async def broadcast_lobby_closed(self, event):
        await self.send(text_data=json.dumps({'type': 'lobby_closed'}))
        await self.close(code=4002)

    async def broadcast_player_ready(self, event):
        await self.send(text_data=json.dumps({
            'type': 'player_ready',
            'player_id': event['player_id'],
            'ready': event['ready'],
        }))

    async def broadcast_countdown_start(self, event):
        await self.send(text_data=json.dumps({
            'type': 'countdown_start', 'countdown': event['countdown'],
        }))

    async def broadcast_game_started(self, event):
        await self.send(text_data=json.dumps({'type': 'game_started'}))

    async def broadcast_item_collected(self, event):
        await self.send(text_data=json.dumps({
            'type': 'item_collected',
            'player_id': event['player_id'],
            'item_type': event['item_type'],
            'item_id': event['item_id'],
        }))

    async def broadcast_player_died(self, event):
        await self.send(text_data=json.dumps({
            'type': 'player_died',
            'player_id': event['player_id'],
            'killer_id': event['killer_id'],
        }))

    async def broadcast_baby_born(self, event):
        await self.send(text_data=json.dumps({
            'type': 'baby_born',
            'parent1_id': event['parent1_id'],
            'parent2_id': event['parent2_id'],
            'baby_id': event['baby_id'],
        }))


class VoiceConsumer(AsyncWebsocketConsumer):
    """Chat vocal WebRTC (signalisation relayée). Auth requise, comme le jeu."""

    async def connect(self):
        user = self.scope.get("user")
        if user is None or user.is_anonymous:
            await self.close(code=4001)
            return

        kwargs = (self.scope.get("url_route") or {}).get("kwargs") or {}
        room_name = kwargs.get("room_name")
        if not _valid_room(room_name):
            await self.close(code=4000)
            return

        self.room_group_name = f"pacman_voice_{room_name}"
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        if hasattr(self, 'room_group_name'):
            await self.channel_layer.group_discard(
                self.room_group_name, self.channel_name
            )

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data or len(text_data) > 50000:
            return
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            return
        if data.get('type', '') not in ('offer', 'answer', 'ice-candidate', 'join', 'leave'):
            return
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'voice_signal',
                'sender_id': self.channel_name,
                'signal': data,
            },
        )

    async def voice_signal(self, event):
        if event['sender_id'] != self.channel_name:
            await self.send(text_data=json.dumps({
                'sender_id': event['sender_id'],
                'signal': event['signal'],
            }))
