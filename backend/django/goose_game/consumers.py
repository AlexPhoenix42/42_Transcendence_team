# goose_game/consumers.py

import json
import random
import logging

from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.core.cache import cache

from .models import GooseGame, GoosePlayer, GooseGameStatus

logger = logging.getLogger(__name__)

# Player colors for the board
PLAYER_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#eab308", "#a855f7", "#f97316"]


class GooseGameConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.game_id = self.scope["url_route"]["kwargs"]["game_id"]
        self.game_group = f"goose_{self.game_id}"
        self.user = self.scope.get("user")

        if not self.user or not self.user.is_authenticated:
            await self.close(code=4001)
            return

        await self.channel_layer.group_add(self.game_group, self.channel_name)
        await self.accept()

        # Send current game state
        state = await self._get_game_state()
        if state:
            await self.send(text_data=json.dumps({
                "type": "game_state",
                **state,
            }))

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.game_group, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data:
            return

        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            await self.send(text_data=json.dumps({"error": "Invalid JSON"}))
            return

        action = data.get("action")

        if action == "roll_dice":
            await self._handle_roll_dice()
        elif action == "get_state":
            state = await self._get_game_state()
            if state:
                await self.send(text_data=json.dumps({"type": "game_state", **state}))

    async def _handle_roll_dice(self):
        result = await self._process_turn()
        if result:
            await self.channel_layer.group_send(
                self.game_group,
                {"type": "broadcast_turn", "data": result},
            )

            # Check if game ended
            if result.get("game_over"):
                await self.channel_layer.group_send(
                    self.game_group,
                    {
                        "type": "broadcast_game_over",
                        "winner": result["winner"],
                    },
                )

    @database_sync_to_async
    def _process_turn(self):
        game = GooseGame.objects.prefetch_related("players__user").get(pk=self.game_id)

        if game.status != GooseGameStatus.IN_PROGRESS:
            return None

        players = list(game.players.filter(is_active=True).order_by("turn_order"))
        if not players:
            return None

        current_player = players[game.current_turn % len(players)]

        # Only the current player can roll
        if current_player.user != self.user:
            return None

        # Roll two dice
        die1 = random.randint(1, 6)
        die2 = random.randint(1, 6)
        total = die1 + die2

        # Check skip turns
        if current_player.skip_turns > 0:
            current_player.skip_turns -= 1
            current_player.save(update_fields=["skip_turns"])

            # Advance turn
            game.current_turn = (game.current_turn + 1) % len(players)
            game.save(update_fields=["current_turn", "updated_at"])

            return {
                "type": "turn_result",
                "player": current_player.user.username,
                "die1": die1,
                "die2": die2,
                "total": total,
                "old_position": current_player.position,
                "new_position": current_player.position,
                "skipped": True,
                "message": f"{current_player.user.username} skips a turn!",
                "next_turn": players[game.current_turn % len(players)].user.username if players else None,
                "players": self._serialize_players(players),
                "game_over": False,
            }

        old_position = current_player.position
        new_position = old_position + total

        # Bounce back if overshoot
        if new_position > GooseGame.TOTAL_SQUARES:
            new_position = GooseGame.TOTAL_SQUARES - (new_position - GooseGame.TOTAL_SQUARES)

        message = f"{current_player.user.username} rolled {die1}+{die2}={total}"
        extra_roll = False

        # Apply special square rules
        new_position, message, extra_roll = self._apply_special_squares(
            current_player, new_position, message
        )

        current_player.position = new_position
        current_player.save(update_fields=["position", "skip_turns"])

        # Check for win
        game_over = False
        winner = None
        if new_position == GooseGame.TOTAL_SQUARES:
            game_over = True
            winner = current_player.user.username
            game.status = GooseGameStatus.FINISHED
            game.winner = current_player.user
            game.save(update_fields=["status", "winner", "updated_at"])

            # Update stats
            from chess_game.stats import update_player_stats
            # We'll handle goose stats separately
            self._update_goose_stats(game, players)

        if not game_over and not extra_roll:
            game.current_turn = (game.current_turn + 1) % len(players)
            game.save(update_fields=["current_turn", "updated_at"])

        # Refresh players
        players = list(game.players.filter(is_active=True).order_by("turn_order"))

        return {
            "type": "turn_result",
            "player": current_player.user.username,
            "die1": die1,
            "die2": die2,
            "total": total,
            "old_position": old_position,
            "new_position": new_position,
            "skipped": False,
            "extra_roll": extra_roll,
            "message": message,
            "next_turn": players[game.current_turn % len(players)].user.username if players and not game_over else None,
            "players": self._serialize_players(players),
            "game_over": game_over,
            "winner": winner,
        }

    def _apply_special_squares(self, player, position, message):
        extra_roll = False

        # Goose squares — double the move
        if position in GooseGame.GOOSE_SQUARES:
            # Move forward the same amount again
            move = position - player.position
            position += move
            if position > GooseGame.TOTAL_SQUARES:
                position = GooseGame.TOTAL_SQUARES - (position - GooseGame.TOTAL_SQUARES)
            message += f" → Goose! Fly to {position}!"
            extra_roll = True

        # Bridge
        elif position == GooseGame.BRIDGE_SQUARE:
            position = 12
            message += " → Bridge! Jump to 12!"

        # Inn
        elif position == GooseGame.INN_SQUARE:
            player.skip_turns = 1
            message += " → Inn! Skip next turn."

        # Well
        elif position == GooseGame.WELL_SQUARE:
            player.skip_turns = 1
            message += " → Well! Skip next turn."

        # Maze
        elif position == GooseGame.MAZE_SQUARE:
            position = 30
            message += " → Maze! Back to 30!"

        # Prison
        elif position == GooseGame.PRISON_SQUARE:
            player.skip_turns = 2
            message += " → Prison! Skip 2 turns."

        # Death
        elif position == GooseGame.DEATH_SQUARE:
            position = 0
            message += " → Death! Back to start!"

        return position, message, extra_roll

    def _update_goose_stats(self, game, players):
        """Update win/loss stats for goose game."""
        from django.db.models import F
        from django.contrib.auth import get_user_model
        User = get_user_model()

        for p in players:
            if p.user == game.winner:
                User.objects.filter(pk=p.user.pk).update(
                    wins=F("wins") + 1,
                )
            else:
                User.objects.filter(pk=p.user.pk).update(
                    loss=F("loss") + 1,
                )

    def _serialize_players(self, players):
        return [
            {
                "username": p.user.username,
                "position": p.position,
                "turn_order": p.turn_order,
                "skip_turns": p.skip_turns,
                "is_active": p.is_active,
                "color": PLAYER_COLORS[p.turn_order % len(PLAYER_COLORS)],
            }
            for p in players
        ]

    @database_sync_to_async
    def _get_game_state(self):
        try:
            game = GooseGame.objects.prefetch_related("players__user").get(pk=self.game_id)
        except GooseGame.DoesNotExist:
            return None

        players = list(game.players.filter(is_active=True).order_by("turn_order"))

        current_player = None
        if players and game.status == GooseGameStatus.IN_PROGRESS:
            current_player = players[game.current_turn % len(players)].user.username

        return {
            "game_id": game.pk,
            "status": game.status,
            "current_turn": current_player,
            "players": self._serialize_players(players),
            "winner": game.winner.username if game.winner else None,
        }

    # Broadcast handlers
    async def broadcast_turn(self, event):
        await self.send(text_data=json.dumps(event["data"]))

    async def broadcast_game_over(self, event):
        await self.send(text_data=json.dumps({
            "type": "game_over",
            "winner": event["winner"],
        }))

