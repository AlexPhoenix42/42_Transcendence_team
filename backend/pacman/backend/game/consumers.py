import asyncio
import json
import time
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from typing import Dict, Any

from .room_cleanup import ensure_sweeper_running
from .room_state import get_room, ROOMS

# Tâches de synchro périodique de l'état partagé, une par salon actif.
_sync_tasks: Dict[str, asyncio.Task] = {}

# Cadence de la diffusion `state_sync` de secours (le gros du travail passe par
# les événements `dot_eaten` en direct).
SYNC_INTERVAL_SECONDS = 2


@database_sync_to_async
def _touch_room(name: str):
    """Crée le salon s'il n'existe pas et rafraîchit son horodatage d'activité."""
    from django.utils import timezone
    from .models import GameRoom
    GameRoom.objects.update_or_create(
        name=name,
        defaults={'last_active': timezone.now(), 'is_active': True},
    )


@database_sync_to_async
def _save_match(room_name: str, result: Dict[str, Any]):
    """Enregistre une manche terminée + met à jour les profils des joueurs."""
    from .models import MatchResult, PlayerProfile
    players = result['players']
    MatchResult.objects.create(
        room_name=room_name,
        winner=result['winner'],
        level=result['level'],
        duration_seconds=result['duration'],
        results=[
            {'name': p['name'], 'role': p['role'],
             'score': p['score'], 'lives': p['lives']}
            for p in players
        ],
    )
    for p in players:
        if not p['name']:
            continue
        profile, _ = PlayerProfile.objects.get_or_create(nickname=p['name'])
        profile.games_played += 1
        profile.total_score += p['score']
        if p['won']:
            profile.games_won += 1
        profile.save()


def _ensure_sync_task(channel_layer, room_name, room_group_name):
    """Lance (une fois par salon) la boucle de synchro périodique de l'état."""
    task = _sync_tasks.get(room_name)
    if task and not task.done():
        return
    _sync_tasks[room_name] = asyncio.ensure_future(
        _sync_loop(channel_layer, room_name, room_group_name)
    )


async def _sync_loop(channel_layer, room_name, room_group_name):
    """Diffuse un `state_sync` toutes les quelques secondes + purge les absents.

    Filet de sécurité : le gros de la synchro passe par les `dot_eaten` en
    direct. Se termine d'elle-même quand le salon est vide.
    """
    try:
        while True:
            await asyncio.sleep(SYNC_INTERVAL_SECONDS)
            room = ROOMS.get(room_name)
            if room is None:
                break
            room.prune(time.monotonic())
            if room.empty():
                ROOMS.pop(room_name, None)
                break
            await channel_layer.group_send(
                room_group_name,
                {'type': 'broadcast_state_sync', 'snapshot': room.snapshot()}
            )
    except asyncio.CancelledError:
        pass
    finally:
        _sync_tasks.pop(room_name, None)


class GameConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer pour la gestion du jeu multijoueur avec compte à rebours
    """

    async def connect(self):
        self.room_name = self.scope['url_route']['kwargs']['room_name']

        # Sanitisation
        if not self.room_name.replace('-', '').replace('_', '').isalnum():
            await self.close()
            return

        self.room_group_name = f'game_{self.room_name}'
        self._last_touch = 0.0

        # État de jeu partagé (grille de grains, scores, statut de manche).
        self.state = get_room(self.room_name)
        self.state.add_player(self.channel_name)

        # Nettoyage auto des salons vides (démarré une fois par processus).
        ensure_sweeper_running()

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()

        await _touch_room(self.room_name)

        # Notifier les autres joueurs
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'player_joined',
                'player_id': self.channel_name
            }
        )

        # Mettre le nouvel arrivant à niveau : grille de grains + scores actuels.
        await self.send(text_data=json.dumps({
            'type': 'state_sync',
            **self.state.snapshot(),
        }))

    async def disconnect(self, close_code):
        if hasattr(self, 'room_group_name'):
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'player_left',
                    'player_id': self.channel_name
                }
            )

            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name
            )

        if hasattr(self, 'state'):
            self.state.remove_player(self.channel_name)
            if self.state.empty():
                task = _sync_tasks.pop(self.room_name, None)
                if task:
                    task.cancel()
                ROOMS.pop(self.room_name, None)

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)

            message_type = data.get('type', '')
            if not isinstance(message_type, str) or len(message_type) > 50:
                return

            if len(text_data) > 10000:
                return

            # Signe de vie du joueur dans l'état partagé (anti-expiration).
            self.state.touch(self.channel_name)

            # Garder le salon « vivant » tant que des messages arrivent, sans
            # écrire en base à chaque paquet de position (~20/s).
            now = time.monotonic()
            if now - self._last_touch > 15:
                self._last_touch = now
                await _touch_room(self.room_name)

            handlers = {
                'position_update': self.handle_position_update,
                'role_assignment': self.handle_role_assignment,
                'player_ready': self.handle_player_ready,
                'start_countdown': self.handle_start_countdown,
                'game_started': self.handle_game_started,
                'collect_item': self.handle_collect_item,
                'player_died': self.handle_player_died,
                'baby_born': self.handle_baby_born,
                'wall_placed': self.handle_wall_placed,
                'wall_destroy': self.handle_wall_destroy,
                'round_start': self.handle_round_start,
                'eat_dot': self.handle_eat_dot,
                'contact': self.handle_contact,
                'request_sync': self.handle_request_sync,
                'round_restart': self.handle_round_restart,
                'power_used': self.handle_power_used,
                'baby_action': self.handle_baby_action,
                'lobby_hello': self.handle_lobby_hello,
                'lobby_start': self.handle_lobby_start,
            }

            handler = handlers.get(message_type)
            if handler:
                await handler(data)
        except json.JSONDecodeError:
            pass
        except Exception as e:
            pass

    async def handle_position_update(self, data: Dict[str, Any]):
        """Mise à jour position d'un joueur"""
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
                'direction': data.get('direction', 'right')
            }
        )

    async def handle_role_assignment(self, data: Dict[str, Any]):
        """Attribution d'un rôle (`spectator` = regarde sans jouer)."""
        role = data.get('role', '')
        allowed_roles = ['pacman', 'madame_pacman', 'baby', 'blocker', 'builder',
                         'ghost', 'spectator']

        if role not in allowed_roles:
            return

        name = str((data.get('metadata') or {}).get('name', ''))[:20]
        self.state.set_role(self.channel_name, role, name=name or None)

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'broadcast_role',
                'player_id': self.channel_name,
                'role': role,
                'metadata': data.get('metadata', {})
            }
        )

    async def handle_wall_placed(self, data: Dict[str, Any]):
        """Un Builder (ou un Blocker) pose un mur temporaire sur une tuile."""
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
            }
        )

    async def handle_wall_destroy(self, data: Dict[str, Any]):
        """Un Blocker détruit un mur (relais sans état, comme `wall_placed`)."""
        tile = data.get('tile', {})
        col = tile.get('col')
        row = tile.get('row')

        if not isinstance(col, int) or not isinstance(row, int):
            return
        if not (0 <= col < 100 and 0 <= row < 100):
            return

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'broadcast_wall_destroy',
                'tile': {'col': col, 'row': row},
            }
        )

    async def handle_round_start(self, data: Dict[str, Any]):
        """Un client signale que sa partie tourne : la manche passe « en cours »."""
        self.state.start()
        _ensure_sync_task(self.channel_layer, self.room_name, self.room_group_name)
        await self.channel_layer.group_send(
            self.room_group_name,
            {'type': 'broadcast_round_started', 'level': 1}
        )
        await self._broadcast_sync()

    async def handle_eat_dot(self, data: Dict[str, Any]):
        """Un joueur mange le grain en (col, row). Le serveur tranche."""
        col = data.get('col')
        row = data.get('row')
        if not isinstance(col, int) or not isinstance(row, int):
            return
        if not (0 <= col < 64 and 0 <= row < 64):
            return

        kind = self.state.eat_dot(self.channel_name, col, row)
        if kind is None:
            # Grain déjà mangé / mauvais rôle / manche finie : le prochain
            # `state_sync` remettra le client d'aplomb.
            return

        player = self.state.players.get(self.channel_name, {})
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'broadcast_dot_eaten',
                'col': col,
                'row': row,
                'by': self.channel_name,
                'kind': kind,
                'score': player.get('score', 0),
            }
        )

        if self.state.is_cleared() and self.state.status != 'over':
            self.state.status = 'over'
            self.state.winner = 'pacman'
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'broadcast_round_over',
                    'player_id': self.channel_name,
                    'winner': 'pacman',
                }
            )
            # Instantané final : les scores affichés sur l'écran de fin sont
            # exacts (le grain gagnant compris), sans attendre le prochain tick.
            await self._broadcast_sync()
            await self._persist_match()

    async def handle_contact(self, data: Dict[str, Any]):
        """Notre client signale qu'un fantôme a touché notre Pac-Man.

        Le serveur tranche : vie perdue (et fin de manche si tous les Pac-Man
        sont à 0) ou, en fenêtre « effrayé », fantôme renvoyé au bercail.
        """
        ghost_id = data.get('ghost')
        outcome = self.state.resolve_contact(
            self.channel_name, ghost_id, time.monotonic()
        )
        if outcome is None:
            return

        if outcome['type'] == 'ghost_home':
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'broadcast_ghost_home',
                    'ghost': ghost_id,
                    'by': self.channel_name,
                }
            )
            await self._broadcast_sync()
            return

        if outcome['type'] == 'pacman_imprisoned':
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'broadcast_player_imprisoned',
                    'pid': self.channel_name,
                    'seconds': outcome['seconds'],
                }
            )
            await self._broadcast_sync()
            return

        # pacman_caught
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'broadcast_player_caught',
                'pid': self.channel_name,
                'lives': outcome['lives'],
            }
        )
        if outcome['over']:
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'broadcast_round_over',
                    'player_id': self.channel_name,
                    'winner': 'ghosts',
                }
            )
        await self._broadcast_sync()
        if outcome['over']:
            await self._persist_match()

    async def _persist_match(self):
        """Enregistre la manche en base si elle vient de se terminer (idempotent)."""
        result = self.state.match_result()
        if result:
            await _save_match(self.room_name, result)

    async def handle_request_sync(self, data: Dict[str, Any]):
        """Renvoie un instantané complet à ce seul socket (debug / resync)."""
        await self.send(text_data=json.dumps({
            'type': 'state_sync',
            **self.state.snapshot(),
        }))

    async def handle_round_restart(self, data: Dict[str, Any]):
        """Un joueur relance une manche : le serveur repeuple la grille."""
        self.state.reset_round()
        await self.channel_layer.group_send(
            self.room_group_name,
            {'type': 'broadcast_round_restart', 'player_id': self.channel_name}
        )

    async def _broadcast_sync(self):
        await self.channel_layer.group_send(
            self.room_group_name,
            {'type': 'broadcast_state_sync', 'snapshot': self.state.snapshot()}
        )

    async def handle_lobby_hello(self, data: Dict[str, Any]):
        """Présence d'un joueur dans le salon d'attente (pseudo / rôle / prêt)."""
        name = str(data.get('name', ''))[:20]
        role = data.get('role', 'pacman')
        if role not in ('pacman', 'madame_pacman', 'baby', 'blocker', 'builder',
                         'ghost', 'spectator'):
            role = 'pacman'
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'broadcast_lobby_hello',
                'player_id': self.channel_name,
                'name': name,
                'role': role,
                'ready': bool(data.get('ready', False)),
            }
        )

    async def handle_lobby_start(self, data: Dict[str, Any]):
        """Un joueur lance la partie depuis le salon d'attente."""
        countdown = data.get('countdown', 3)
        if not isinstance(countdown, int) or not (0 <= countdown <= 10):
            countdown = 3
        await self.channel_layer.group_send(
            self.room_group_name,
            {'type': 'broadcast_lobby_start', 'countdown': countdown}
        )

    async def handle_baby_action(self, data: Dict[str, Any]):
        """Cycle de vie du bébé Pac-Man (spawn / move / escape / died)."""
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
            }
        )

    async def handle_power_used(self, data: Dict[str, Any]):
        """Un fantôme utilise un pouvoir (gel) depuis une position donnée."""
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
            }
        )

    async def handle_player_ready(self, data: Dict[str, Any]):
        """Un joueur est prêt"""
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'broadcast_player_ready',
                'player_id': self.channel_name,
                'ready': data.get('ready', True)
            }
        )

    async def handle_start_countdown(self, data: Dict[str, Any]):
        """Démarrer le compte à rebours"""
        countdown = data.get('countdown', 10)

        if not isinstance(countdown, int) or countdown < 3 or countdown > 60:
            countdown = 10

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'broadcast_countdown_start',
                'countdown': countdown
            }
        )

    async def handle_game_started(self, data: Dict[str, Any]):
        """Le jeu démarre"""
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'broadcast_game_started'
            }
        )

    async def handle_collect_item(self, data: Dict[str, Any]):
        """Un joueur collecte un item"""
        item_type = data.get('item_type', '')
        if item_type not in ['dot', 'cherry', 'strawberry', 'powerup', 'pill']:
            return

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'broadcast_item_collected',
                'player_id': self.channel_name,
                'item_type': item_type,
                'item_id': data.get('item_id', '')
            }
        )

    async def handle_player_died(self, data: Dict[str, Any]):
        """Un joueur meurt"""
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'broadcast_player_died',
                'player_id': self.channel_name,
                'killer_id': data.get('killer_id', '')
            }
        )

    async def handle_baby_born(self, data: Dict[str, Any]):
        """Naissance d'un bébé"""
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'broadcast_baby_born',
                'parent1_id': self.channel_name,
                'parent2_id': data.get('parent2_id', ''),
                'baby_id': data.get('baby_id', '')
            }
        )

    # Handlers de diffusion
    async def player_joined(self, event):
        await self.send(text_data=json.dumps({
            'type': 'player_joined',
            'player_id': event['player_id']
        }))

    async def player_left(self, event):
        await self.send(text_data=json.dumps({
            'type': 'player_left',
            'player_id': event['player_id']
        }))

    async def broadcast_position(self, event):
        await self.send(text_data=json.dumps({
            'type': 'position_update',
            'player_id': event['player_id'],
            'position': event['position'],
            'direction': event['direction']
        }))

    async def broadcast_role(self, event):
        await self.send(text_data=json.dumps({
            'type': 'role_assignment',
            'player_id': event['player_id'],
            'role': event['role'],
            'metadata': event['metadata']
        }))

    async def broadcast_wall(self, event):
        await self.send(text_data=json.dumps({
            'type': 'wall_placed',
            'player_id': event['player_id'],
            'tile': event['tile'],
            'ttl': event['ttl'],
            'kind': event.get('kind', 'builder')
        }))

    async def broadcast_wall_destroy(self, event):
        await self.send(text_data=json.dumps({
            'type': 'wall_destroy',
            'tile': event['tile']
        }))

    async def broadcast_round_over(self, event):
        await self.send(text_data=json.dumps({
            'type': 'round_over',
            'player_id': event['player_id'],
            'winner': event['winner']
        }))

    async def broadcast_round_restart(self, event):
        await self.send(text_data=json.dumps({
            'type': 'round_restart',
            'player_id': event['player_id']
        }))

    async def broadcast_round_started(self, event):
        await self.send(text_data=json.dumps({
            'type': 'round_started',
            'level': event['level']
        }))

    async def broadcast_dot_eaten(self, event):
        await self.send(text_data=json.dumps({
            'type': 'dot_eaten',
            'col': event['col'],
            'row': event['row'],
            'by': event['by'],
            'kind': event['kind'],
            'score': event['score']
        }))

    async def broadcast_state_sync(self, event):
        await self.send(text_data=json.dumps({
            'type': 'state_sync',
            **event['snapshot']
        }))

    async def broadcast_player_caught(self, event):
        await self.send(text_data=json.dumps({
            'type': 'player_caught',
            'pid': event['pid'],
            'lives': event['lives']
        }))

    async def broadcast_ghost_home(self, event):
        await self.send(text_data=json.dumps({
            'type': 'ghost_home',
            'ghost': event['ghost'],
            'by': event['by']
        }))

    async def broadcast_player_imprisoned(self, event):
        await self.send(text_data=json.dumps({
            'type': 'player_imprisoned',
            'pid': event['pid'],
            'seconds': event['seconds']
        }))

    async def broadcast_power(self, event):
        await self.send(text_data=json.dumps({
            'type': 'power_used',
            'player_id': event['player_id'],
            'kind': event['kind'],
            'position': event['position']
        }))

    async def broadcast_baby(self, event):
        await self.send(text_data=json.dumps({
            'type': 'baby_action',
            'player_id': event['player_id'],
            'kind': event['kind'],
            'position': event['position']
        }))

    async def broadcast_lobby_hello(self, event):
        await self.send(text_data=json.dumps({
            'type': 'lobby_hello',
            'player_id': event['player_id'],
            'name': event['name'],
            'role': event['role'],
            'ready': event['ready']
        }))

    async def broadcast_lobby_start(self, event):
        await self.send(text_data=json.dumps({
            'type': 'lobby_start',
            'countdown': event['countdown']
        }))

    async def broadcast_player_ready(self, event):
        await self.send(text_data=json.dumps({
            'type': 'player_ready',
            'player_id': event['player_id'],
            'ready': event['ready']
        }))

    async def broadcast_countdown_start(self, event):
        await self.send(text_data=json.dumps({
            'type': 'countdown_start',
            'countdown': event['countdown']
        }))

    async def broadcast_game_started(self, event):
        await self.send(text_data=json.dumps({
            'type': 'game_started'
        }))

    async def broadcast_item_collected(self, event):
        await self.send(text_data=json.dumps({
            'type': 'item_collected',
            'player_id': event['player_id'],
            'item_type': event['item_type'],
            'item_id': event['item_id']
        }))

    async def broadcast_player_died(self, event):
        await self.send(text_data=json.dumps({
            'type': 'player_died',
            'player_id': event['player_id'],
            'killer_id': event['killer_id']
        }))

    async def broadcast_baby_born(self, event):
        await self.send(text_data=json.dumps({
            'type': 'baby_born',
            'parent1_id': event['parent1_id'],
            'parent2_id': event['parent2_id'],
            'baby_id': event['baby_id']
        }))


class VoiceConsumer(AsyncWebsocketConsumer):
    """WebSocket consumer pour le chat vocal"""

    async def connect(self):
        self.room_name = self.scope['url_route']['kwargs']['room_name']
        if not self.room_name.replace('-', '').replace('_', '').isalnum():
            await self.close()
            return

        self.room_group_name = f'voice_{self.room_name}'

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, 'room_group_name'):
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name
            )

    async def receive(self, text_data=None, bytes_data=None):
        try:
            if text_data:
                data = json.loads(text_data)

                if len(text_data) > 50000:
                    return

                signal_type = data.get('type', '')
                allowed_types = ['offer', 'answer', 'ice-candidate', 'join', 'leave']

                if signal_type not in allowed_types:
                    return

                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'voice_signal',
                        'sender_id': self.channel_name,
                        'signal': data
                    }
                )
        except json.JSONDecodeError:
            pass
        except Exception:
            pass

    async def voice_signal(self, event):
        if event['sender_id'] != self.channel_name:
            await self.send(text_data=json.dumps({
                'sender_id': event['sender_id'],
                'signal': event['signal']
            }))
