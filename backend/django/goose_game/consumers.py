# goose_game/consumers.py

import json
import random
import logging
import asyncio

from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from asgiref.sync import sync_to_async
from django.core.cache import cache
from django.db.models import F

from .models import GooseGame, GoosePlayer, GooseGameStatus
from .wizard_service import generate_question

logger = logging.getLogger(__name__)

# Player colors for the board
PLAYER_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#eab308", "#a855f7", "#f97316"]

# Grey Wizard trivia mechanic
WIZARD_BOARD_SIZE      = 64  # squares 0..63
WIZARD_ANSWER_SECONDS  = 25  # time given to answer before it counts as wrong
WIZARD_CACHE_TTL       = WIZARD_ANSWER_SECONDS + 15  # buffer so the timeout task can still read the key
WIZARD_MAX_STRIKES     = 3
# He advances once per player's roll_dice, so in a 2-player game he only
# gets 2 moves per full round against the target's 1 move (avg ~7 via 2d6).
# Average step must clear 3.5 (7 / 2) so he reliably closes ground even in
# that worst case, instead of drifting backward forever.
WIZARD_STEP_MIN        = 3
WIZARD_STEP_MAX        = 6
WIZARD_REVIVE_STREAK   = 2  # correct answers needed (while eliminated) to be reintegrated
# Prisoners get an extra, unprompted revival question on this cadence, on top
# of whatever they get from the wizard physically landing on their square —
# waiting for that alone could take a long time. Never pauses the table.
PRISON_QUESTION_INTERVAL_SECONDS = 60


def _serialize_players(players):
    return [
        {
            "username": p.user.username,
            "position": p.position,
            "turn_order": p.turn_order,
            "skip_turns": p.skip_turns,
            "is_active": p.is_active,
            "wizard_strikes": p.wizard_strikes,
            "color": PLAYER_COLORS[p.turn_order % len(PLAYER_COLORS)],
        }
        for p in players
    ]


# --- Grey Wizard mechanic ---
#
# Module-level (not consumer methods) because the prison-question loop below
# needs to trigger encounters on its own schedule, independent of any single
# WebSocket connection's lifetime — mirrors pacman_game's _sync_loop pattern.

def _wizard_cache_key(game_id, username):
    return f"goose:{game_id}:pending_question:{username}"


@database_sync_to_async
def _get_asked_questions(game_id):
    game = GooseGame.objects.get(pk=game_id)
    return list(game.wizard_questions_asked)


@database_sync_to_async
def _append_asked_question(game_id, question_text):
    game = GooseGame.objects.get(pk=game_id)
    asked = list(game.wizard_questions_asked)
    asked.append(question_text)
    game.wizard_questions_asked = asked
    game.save(update_fields=["wizard_questions_asked"])


@database_sync_to_async
def _adjust_wizard_pending(game_id, delta):
    GooseGame.objects.filter(pk=game_id).update(
        wizard_pending_count=F("wizard_pending_count") + delta
    )


async def _start_wizard_encounter(channel_layer, game_group, game_id, username, is_active):
    asked = await _get_asked_questions(game_id)
    question = await generate_question(asked)
    question["paused"] = is_active  # active-player encounters pause the table; prison ones don't

    key = _wizard_cache_key(game_id, username)
    added = await sync_to_async(cache.add)(key, question, timeout=WIZARD_CACHE_TTL)
    if not added:
        return  # this player already has a question pending

    await _append_asked_question(game_id, question["question"])

    if is_active:
        await _adjust_wizard_pending(game_id, 1)

    await channel_layer.group_send(
        game_group,
        {
            "type": "broadcast_wizard_encounter",
            "target": username,
            "question": question["question"],
            "choices": question["choices"],
            "paused": is_active,
        },
    )

    asyncio.create_task(_resolve_wizard_timeout(channel_layer, game_group, game_id, username))


async def _resolve_wizard_timeout(channel_layer, game_group, game_id, username):
    await asyncio.sleep(WIZARD_ANSWER_SECONDS)

    key = _wizard_cache_key(game_id, username)
    pending = await sync_to_async(cache.get)(key)
    if not pending:
        return  # already answered in time

    await sync_to_async(cache.delete)(key)
    await _resolve_wizard_answer(channel_layer, game_group, game_id, username, pending, choice_index=-1, timed_out=True)


async def _resolve_wizard_answer(channel_layer, game_group, game_id, username, pending, choice_index, timed_out=False):
    correct = (not timed_out) and (choice_index == pending["correct_index"])
    paused = pending.get("paused", False)
    outcome = await _apply_wizard_result(game_id, username, correct)
    if outcome is None:
        return

    if paused:
        await _adjust_wizard_pending(game_id, -1)

    if outcome["wizard_wins"]:
        message = f"☠️ Le magicien a éliminé {username} — plus personne n'est actif, le Magicien Gris gagne !"
    elif outcome["eliminated"]:
        message = f"☠️ Le magicien a éliminé {username} !"
    elif outcome["revived"]:
        message = f"✨ {username} a répondu juste {WIZARD_REVIVE_STREAK} fois et revient dans la partie !"
    elif correct and not outcome["was_active"]:
        message = (
            f"✅ {username} a bien répondu au magicien "
            f"({outcome['revive_progress']}/{WIZARD_REVIVE_STREAK} pour revenir)."
        )
    elif correct:
        message = f"✅ {username} a bien répondu au magicien."
    else:
        message = f"❌ {username} s'est trompé face au magicien."

    await channel_layer.group_send(
        game_group,
        {
            "type": "broadcast_wizard_result",
            "target": username,
            "correct": correct,
            "correct_index": pending["correct_index"],
            "answered_index": None if timed_out else choice_index,
            "paused": paused,
            "eliminated": outcome["eliminated"],
            "revived": outcome["revived"],
            "strikes": outcome["strikes"],
            "revive_progress": outcome["revive_progress"],
            "players": outcome["players"],
            "message": message,
        },
    )

    if outcome["wizard_wins"]:
        await channel_layer.group_send(
            game_group,
            {
                "type": "broadcast_game_over",
                "winner": None,
                "wizard_wins": True,
            },
        )


@database_sync_to_async
def _apply_wizard_result(game_id, username, correct):
    try:
        player = GoosePlayer.objects.select_related("user").get(
            game_id=game_id, user__username=username
        )
    except GoosePlayer.DoesNotExist:
        return None

    eliminated = False
    revived = False
    was_active = player.is_active

    if player.is_active:
        if not correct:
            player.wizard_strikes += 1
            if player.wizard_strikes >= WIZARD_MAX_STRIKES:
                player.is_active = False
                player.wizard_revive_progress = 0  # fresh count for this spectator stint
                eliminated = True
            player.save(update_fields=["wizard_strikes", "is_active", "wizard_revive_progress"])
    else:
        if correct:
            player.wizard_revive_progress += 1
            if player.wizard_revive_progress >= WIZARD_REVIVE_STREAK:
                player.is_active = True
                player.position = 0
                player.wizard_strikes = 0
                player.wizard_revive_progress = 0
                revived = True
            player.save(update_fields=["is_active", "position", "wizard_strikes", "wizard_revive_progress"])

    game = GooseGame.objects.get(pk=game_id)
    all_players = list(game.players.select_related("user").order_by("turn_order"))

    wizard_wins = False
    if eliminated and all(not p.is_active for p in all_players) and game.status == GooseGameStatus.IN_PROGRESS:
        game.status = GooseGameStatus.FINISHED
        game.save(update_fields=["status", "updated_at"])
        wizard_wins = True

    return {
        "eliminated": eliminated,
        "revived": revived,
        "was_active": was_active,
        "revive_progress": player.wizard_revive_progress,
        "strikes": player.wizard_strikes,
        "players": _serialize_players(all_players),
        "wizard_wins": wizard_wins,
    }


# --- Prison question loop ---
#
# Runs once per in-progress game, independent of any single connection.
# Multiple Daphne workers can call _ensure_prison_loop for the same game
# (its players don't all land on the same worker) — cache.add (Redis SET NX)
# lets only one worker actually own the loop, same guard as pacman's
# _sync_owner_key. Self-terminates once the game is no longer IN_PROGRESS.

_prison_tasks = {}


def _prison_owner_key(game_id):
    return f"goose_prison_owner:{game_id}"


@database_sync_to_async
def _game_status_and_prisoners(game_id):
    try:
        game = GooseGame.objects.get(pk=game_id)
    except GooseGame.DoesNotExist:
        return None, []
    if game.status != GooseGameStatus.IN_PROGRESS:
        return game.status, []
    prisoners = list(
        game.players.filter(is_active=False).values_list("user__username", flat=True)
    )
    return game.status, prisoners


async def _prison_loop(channel_layer, game_group, game_id):
    owner_key = _prison_owner_key(game_id)
    got_ownership = await sync_to_async(cache.add)(
        owner_key, 1, timeout=PRISON_QUESTION_INTERVAL_SECONDS * 3,
    )
    if not got_ownership:
        return

    try:
        while True:
            await asyncio.sleep(PRISON_QUESTION_INTERVAL_SECONDS)
            await sync_to_async(cache.set)(
                owner_key, 1, timeout=PRISON_QUESTION_INTERVAL_SECONDS * 3,
            )

            status, prisoners = await _game_status_and_prisoners(game_id)
            if status != GooseGameStatus.IN_PROGRESS:
                break

            for username in prisoners:
                await _start_wizard_encounter(channel_layer, game_group, game_id, username, is_active=False)
    except asyncio.CancelledError:
        pass
    finally:
        _prison_tasks.pop(game_id, None)
        await sync_to_async(cache.delete)(owner_key)


def _ensure_prison_loop(channel_layer, game_group, game_id):
    task = _prison_tasks.get(game_id)
    if task and not task.done():
        return
    _prison_tasks[game_id] = asyncio.ensure_future(
        _prison_loop(channel_layer, game_group, game_id)
    )


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

        _ensure_prison_loop(self.channel_layer, self.game_group, self.game_id)

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
        elif action == "wizard_answer":
            await self._handle_wizard_answer(data.get("choice_index"))

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
                return

            players_by_username = {p["username"]: p for p in result.get("players", [])}
            for username in result.get("wizard_targets", []):
                is_active = players_by_username.get(username, {}).get("is_active", True)
                await _start_wizard_encounter(self.channel_layer, self.game_group, self.game_id, username, is_active)

    async def _handle_wizard_answer(self, choice_index):
        if not isinstance(choice_index, int):
            return

        username = self.user.username
        key = _wizard_cache_key(self.game_id, username)
        pending = await sync_to_async(cache.get)(key)
        if not pending:
            return  # expired, already answered, or never asked

        await sync_to_async(cache.delete)(key)
        await _resolve_wizard_answer(self.channel_layer, self.game_group, self.game_id, username, pending, choice_index)

    @database_sync_to_async
    def _process_turn(self):
        game = GooseGame.objects.prefetch_related("players__user").get(pk=self.game_id)

        if game.status != GooseGameStatus.IN_PROGRESS:
            return None

        # The whole table pauses while an active player is being interrogated
        # by the wizard — everyone watches, only the target answers.
        if game.wizard_pending_count > 0:
            return None

        all_players = list(game.players.order_by("turn_order"))
        active_players = [p for p in all_players if p.is_active]
        if not active_players:
            return None

        current_player = active_players[game.current_turn % len(active_players)]

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
            game.current_turn = (game.current_turn + 1) % len(active_players)
            game.save(update_fields=["current_turn", "updated_at"])

            wizard_step, wizard_targets = self._advance_wizard(game, all_players)

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
                "next_turn": active_players[game.current_turn % len(active_players)].user.username,
                "players": _serialize_players(all_players),
                "wizard_position": game.wizard_position,
                "wizard_step": wizard_step,
                "wizard_targets": wizard_targets,
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

            self._update_goose_stats(game, active_players)

        if not game_over and not extra_roll:
            game.current_turn = (game.current_turn + 1) % len(active_players)
            game.save(update_fields=["current_turn", "updated_at"])

        wizard_step, wizard_targets = (0, []) if game_over else self._advance_wizard(game, all_players)

        # Refresh players
        all_players = list(game.players.order_by("turn_order"))
        active_players = [p for p in all_players if p.is_active]

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
            "next_turn": active_players[game.current_turn % len(active_players)].user.username if active_players and not game_over else None,
            "players": _serialize_players(all_players),
            "wizard_position": game.wizard_position,
            "wizard_step": wizard_step,
            "wizard_targets": wizard_targets,
            "game_over": game_over,
            "winner": winner,
        }

    def _advance_wizard(self, game, all_players):
        """Moves the Grey Wizard 3-6 squares toward whoever he's currently
        hunting, wrapping around the board either way. He always has a
        target (picked from active or eliminated players) so he's guaranteed
        to reach someone eventually instead of wandering forever. Returns
        (step, usernames) where step is signed (e.g. -2 or +3) and usernames
        lists every player he lands on."""
        step = self._compute_wizard_step(game, all_players)
        game.wizard_position = (game.wizard_position + step) % WIZARD_BOARD_SIZE
        game.save(update_fields=["wizard_position", "wizard_target", "updated_at"])
        targets = [p.user.username for p in all_players if p.position == game.wizard_position]
        return step, targets

    def _compute_wizard_step(self, game, all_players):
        target = None
        if game.wizard_target_id:
            target = next((p for p in all_players if p.id == game.wizard_target_id), None)

        if target is None:
            target = random.choice(all_players)
            game.wizard_target = target

        if target.position == game.wizard_position:
            # Already standing on them (rare) — take a small random hop and
            # hunt someone new afterwards.
            game.wizard_target = None
            return random.choice([-3, -2, -1, 1, 2, 3])

        forward = (target.position - game.wizard_position) % WIZARD_BOARD_SIZE
        backward = WIZARD_BOARD_SIZE - forward

        if forward <= backward:
            max_step = min(forward, WIZARD_STEP_MAX)
            step = random.randint(min(WIZARD_STEP_MIN, max_step), max_step)
        else:
            max_step = min(backward, WIZARD_STEP_MAX)
            step = -random.randint(min(WIZARD_STEP_MIN, max_step), max_step)

        if (game.wizard_position + step) % WIZARD_BOARD_SIZE == target.position:
            game.wizard_target = None  # arriving this turn — hunt someone new next time

        return step

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

    @database_sync_to_async
    def _get_game_state(self):
        try:
            game = GooseGame.objects.prefetch_related("players__user").get(pk=self.game_id)
        except GooseGame.DoesNotExist:
            return None

        all_players = list(game.players.order_by("turn_order"))
        active_players = [p for p in all_players if p.is_active]

        current_player = None
        if active_players and game.status == GooseGameStatus.IN_PROGRESS:
            current_player = active_players[game.current_turn % len(active_players)].user.username

        return {
            "game_id": game.pk,
            "status": game.status,
            "current_turn": current_player,
            "players": _serialize_players(all_players),
            "wizard_position": game.wizard_position,
            "wizard_paused": game.wizard_pending_count > 0,
            "winner": game.winner.username if game.winner else None,
        }

    # Broadcast handlers
    async def broadcast_turn(self, event):
        await self.send(text_data=json.dumps(event["data"]))

    async def broadcast_game_over(self, event):
        await self.send(text_data=json.dumps({
            "type": "game_over",
            "winner": event["winner"],
            "wizard_wins": event.get("wizard_wins", False),
        }))

    async def broadcast_wizard_encounter(self, event):
        await self.send(text_data=json.dumps({
            "type": "wizard_encounter",
            "target": event["target"],
            "question": event["question"],
            "choices": event["choices"],
            "paused": event["paused"],
        }))

    async def broadcast_wizard_result(self, event):
        await self.send(text_data=json.dumps({
            "type": "wizard_result",
            "target": event["target"],
            "correct": event["correct"],
            "correct_index": event["correct_index"],
            "answered_index": event["answered_index"],
            "paused": event["paused"],
            "eliminated": event["eliminated"],
            "revived": event["revived"],
            "strikes": event["strikes"],
            "revive_progress": event["revive_progress"],
            "players": event["players"],
            "message": event["message"],
        }))

