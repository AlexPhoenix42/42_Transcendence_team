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

import asyncio
import json
import time
import logging

from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db                import database_sync_to_async

from django.core.cache          import cache
from django.utils               import timezone
from asgiref.sync               import sync_to_async

from .services                  import RoomState

logger = logging.getLogger(__name__)

STATE_TTL               = 86400
SYNC_INTERVAL_SECONDS   = 2
ACTIVE_ROOMS_KEY        = "pacman_active_rooms"

ALLOWED_ROLES = (
    'pacman', 'madame_pacman', 'baby', 'blocker', 'builder', 'ghost', 'spectator',
)

# Une tâche de synchro périodique par salon actif. Comme l'original (et comme le
# set `active_games` de chess_game), ça suppose un seul worker daphne.
_sync_tasks = {}


def _room_key(room_name: str) -> str:
    return f"pacman:{room_name}"


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

async def _sync_loop(channel_layer, room_name, group_name):
    """Rediffuse un `state_sync` toutes les 2 s + purge les joueurs absents.

    Filet de sécurité : le gros de la synchro passe par les événements en direct
    (`dot_eaten`, ...). Se termine d'elle-même quand le salon est vide.
    """
    _tick = 0
    try:
        while True:
            await asyncio.sleep(SYNC_INTERVAL_SECONDS)
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


def _ensure_sync_task(channel_layer, room_name, group_name):
    task = _sync_tasks.get(room_name)
    if task and not task.done():
        return
    _sync_tasks[room_name] = asyncio.ensure_future(
        _sync_loop(channel_layer, room_name, group_name)
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

            self.game_id = await self._get_or_create_game()

            await self.channel_layer.group_add(self.room_group_name, self.channel_name)
            await self.accept()

            room = await self._load_room()
            room.add_player(
                self.channel_name,
                name=self._display_name(),
                user_id=self.user.pk,
            )
            await self._save_room(room)
            await sync_to_async(_mark_active_sync)(self.room_name)

            _ensure_sync_task(self.channel_layer, self.room_name, self.room_group_name)

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

        await self.channel_layer.group_send(
            self.room_group_name,
            {'type': 'player_left', 'player_id': self.channel_name},
        )
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

        data = await sync_to_async(cache.get)(_room_key(self.room_name))
        if data is None:
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
        else:
            await self._save_room(room)

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
    def _get_or_create_game(self) -> int:
        from .models import Game, GameStatus
        game, _ = Game.objects.get_or_create(
            room_name=self.room_name,
            defaults={'created_by': self.user, 'status': GameStatus.WAITING},
        )
        return game.pk

    @database_sync_to_async
    def _rehydrate_from_db(self) -> RoomState:
        from .models import Game, GameStatus
        room = RoomState()
        game = Game.objects.filter(pk=self.game_id).first()
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
        await self._persist_result(room)
        await sync_to_async(cache.delete)(_room_key(self.room_name))
        await sync_to_async(_drop_active_sync)(self.room_name)

    @database_sync_to_async
    def _persist_result(self, room: RoomState):
        result = room.match_result()
        if not result:
            return
        from .models import Game, GamePlayer, GameStatus
        updated = Game.objects.filter(pk=self.game_id).update(
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
                game_id=self.game_id,
                user_id=uid,
                defaults={
                    'role':  p['role'],
                    'score': p['score'],
                    'lives': p['lives'],
                    'won':   p['won'],
                },
            )

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
        room = await self._load_room()
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
        room = await self._load_room()
        room.start()
        await self._save_room(room)
        await self._mark_in_progress()
        _ensure_sync_task(self.channel_layer, self.room_name, self.room_group_name)
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
        room = await self._load_room()
        outcome = room.resolve_contact(self.channel_name, ghost_id, time.time())
        if outcome is None:
            return
        await self._save_room(room)

        if outcome['type'] == 'ghost_home':
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'broadcast_ghost_home',
                    'ghost': ghost_id,
                    'by': self.channel_name,
                },
            )
            await self._broadcast_sync(room)
            return

        if outcome['type'] == 'pacman_imprisoned':
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'broadcast_player_imprisoned',
                    'pid': self.channel_name,
                    'seconds': outcome['seconds'],
                },
            )
            await self._broadcast_sync(room)
            return

        # pacman_caught
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'broadcast_player_caught',
                'pid': self.channel_name,
                'lives': outcome['lives'],
            },
        )
        if outcome['over']:
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'broadcast_round_over',
                    'player_id': self.channel_name,
                    'winner': 'ghosts',
                },
            )
        await self._broadcast_sync(room)
        if outcome['over']:
            await self._finish_game(room)

    async def handle_round_restart(self, data):
        room = await self._load_room()
        room.reset_round()
        await self._save_room(room)
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
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'broadcast_position',
                'player_id': self.channel_name,
                'position': {'x': float(x), 'y': float(y)},
                'direction': data.get('direction', 'right'),
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
