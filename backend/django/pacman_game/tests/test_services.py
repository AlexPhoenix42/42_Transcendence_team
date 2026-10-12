# pacman_game/tests/test_services.py
#
# Porté de pacman_ft_transcendence (`backend/game/tests.py`, commit 2c46068).
# Mêmes cas ; adaptations : import -> pacman_game.services, time.monotonic ->
# time.time (l'état passe par Redis, cf. services.py), + tests to_dict/from_dict.

import time

from django.test import SimpleTestCase

from pacman_game.services import (
    MAP1_ROWS,
    RoomState,
    seed_dots,
    DOT_SCORE,
    PELLET_SCORE,
    GHOST_EAT_SCORE,
    DEFAULT_LIVES,
    CATCH_COOLDOWN_SECONDS,
    PRISON_SECONDS,
)


class SeedDotsTests(SimpleTestCase):
    def test_counts_dots_and_pellets(self):
        rows = [
            '=====',
            '=.*.=',
            '=...=',
            '=====',
        ]
        dots, pellets = seed_dots(rows)
        self.assertEqual(pellets, {(2, 1)})
        self.assertEqual(dots, {(1, 1), (3, 1), (1, 2), (2, 2), (3, 2)})

    def test_map1_has_the_classic_pacman_count(self):
        dots, pellets = seed_dots(MAP1_ROWS)
        self.assertEqual(len(pellets), 4)
        self.assertEqual(len(dots) + len(pellets), 224)


class RoomStateEatDotTests(SimpleTestCase):
    def _playing_room(self):
        room = RoomState()
        room.add_player('p1', 'pacman')
        room.start()
        return room

    def test_eat_dot_scores_and_removes(self):
        room = self._playing_room()
        cell = next(iter(room.dots))
        self.assertEqual(room.eat_dot('p1', *cell), 'dot')
        self.assertEqual(room.players['p1']['score'], DOT_SCORE)
        self.assertNotIn(cell, room.dots)

    def test_eat_pellet_scores_more(self):
        room = self._playing_room()
        cell = next(iter(room.pellets))
        self.assertEqual(room.eat_dot('p1', *cell), 'pellet')
        self.assertEqual(room.players['p1']['score'], PELLET_SCORE)

    def test_second_eat_of_same_tile_is_rejected(self):
        room = self._playing_room()
        cell = next(iter(room.dots))
        room.eat_dot('p1', *cell)
        self.assertIsNone(room.eat_dot('p1', *cell))

    def test_rejected_when_not_playing(self):
        room = RoomState()
        room.add_player('p1', 'pacman')
        cell = next(iter(room.dots))
        self.assertIsNone(room.eat_dot('p1', *cell))

    def test_rejected_for_non_pacman_role(self):
        room = self._playing_room()
        room.add_player('g1', 'ghost_blinky')
        cell = next(iter(room.dots))
        self.assertIsNone(room.eat_dot('g1', *cell))

    def test_rejected_for_unknown_tile(self):
        room = self._playing_room()
        self.assertIsNone(room.eat_dot('p1', 999, 999))


class RoomStateContactTests(SimpleTestCase):
    def _room(self):
        room = RoomState()
        room.add_player('p1', 'pacman')
        room.add_player('g1', 'ghost_blinky')
        room.start()
        return room

    def test_contact_costs_a_life(self):
        room = self._room()
        out = room.resolve_contact('p1', 'g1', time.time())
        self.assertEqual(out['type'], 'pacman_caught')
        self.assertEqual(out['lives'], DEFAULT_LIVES - 1)
        self.assertFalse(out['over'])

    def test_contact_cooldown_blocks_burst(self):
        room = self._room()
        now = time.time()
        room.resolve_contact('p1', 'g1', now)
        self.assertIsNone(room.resolve_contact('p1', 'g1', now + 0.1))
        later = now + CATCH_COOLDOWN_SECONDS + 0.1
        self.assertIsNotNone(room.resolve_contact('p1', 'g1', later))

    def test_last_life_ends_round_for_ghosts(self):
        room = self._room()
        room.players['p1']['lives'] = 1
        out = room.resolve_contact('p1', 'g1', time.time())
        self.assertTrue(out['over'])
        self.assertEqual(room.status, 'over')
        self.assertEqual(room.winner, 'ghosts')

    def test_frightened_window_eats_the_ghost(self):
        room = self._room()
        pellet = next(iter(room.pellets))
        room.eat_dot('p1', *pellet)  # ouvre la fenêtre « effrayé »
        out = room.resolve_contact('p1', 'g1', time.time())
        self.assertEqual(out['type'], 'ghost_home')
        self.assertEqual(out['ghost'], 'g1')
        self.assertEqual(room.players['p1']['lives'], DEFAULT_LIVES)
        self.assertEqual(room.players['p1']['score'], PELLET_SCORE + GHOST_EAT_SCORE)

    def test_contact_ignored_when_not_playing(self):
        room = RoomState()
        room.add_player('p1', 'pacman')
        self.assertIsNone(room.resolve_contact('p1', 'g1', time.time()))


class RoomStateBlockerTests(SimpleTestCase):
    def _room(self):
        room = RoomState()
        room.add_player('p1', 'blocker')
        room.add_player('g1', 'ghost_blinky')
        room.start()
        return room

    def test_contact_imprisons_instead_of_killing(self):
        room = self._room()
        out = room.resolve_contact('p1', 'g1', time.time())
        self.assertEqual(out['type'], 'pacman_imprisoned')
        self.assertEqual(out['seconds'], PRISON_SECONDS)
        self.assertEqual(room.players['p1']['lives'], DEFAULT_LIVES)

    def test_imprison_cooldown_blocks_burst(self):
        room = self._room()
        now = time.time()
        room.resolve_contact('p1', 'g1', now)
        self.assertIsNone(room.resolve_contact('p1', 'g1', now + 0.1))
        later = now + CATCH_COOLDOWN_SECONDS + 0.1
        self.assertIsNotNone(room.resolve_contact('p1', 'g1', later))

    def test_frightened_window_still_eats_the_ghost(self):
        room = self._room()
        pellet = next(iter(room.pellets))
        room.eat_dot('p1', *pellet)  # ouvre la fenêtre « effrayé »
        out = room.resolve_contact('p1', 'g1', time.time())
        self.assertEqual(out['type'], 'ghost_home')
        self.assertEqual(room.players['p1']['lives'], DEFAULT_LIVES)

    def test_reset_round_restores_lives(self):
        room = self._room()
        room.players['p1']['lives'] = 0
        room.reset_round()
        self.assertEqual(room.players['p1']['lives'], DEFAULT_LIVES)
        self.assertEqual(room.frightened_until, 0.0)


class RoomStateMatchResultTests(SimpleTestCase):
    def _over_room(self, winner='pacman'):
        room = RoomState()
        room.set_role('p1', 'pacman', name='Alice')
        room.set_role('g1', 'ghost_blinky', name='Bob')
        room.start()
        room.players['p1']['score'] = 240
        room.status = 'over'
        room.winner = winner
        return room

    def test_match_result_once_then_none(self):
        room = self._over_room()
        res = room.match_result()
        self.assertIsNotNone(res)
        self.assertIsNone(room.match_result())

    def test_match_result_shape_and_winning_flags(self):
        res = self._over_room('pacman').match_result()
        self.assertEqual(res['winner'], 'pacman')
        by_name = {p['name']: p for p in res['players']}
        self.assertEqual(by_name['Alice']['score'], 240)
        self.assertTrue(by_name['Alice']['won'])
        self.assertFalse(by_name['Bob']['won'])

    def test_match_result_ghosts_win(self):
        res = self._over_room('ghosts').match_result()
        by_name = {p['name']: p for p in res['players']}
        self.assertTrue(by_name['Bob']['won'])
        self.assertFalse(by_name['Alice']['won'])

    def test_match_result_carries_user_id(self):
        room = RoomState()
        room.add_player('p1', 'pacman', name='Alice', user_id=42)
        room.start()
        room.status = 'over'
        room.winner = 'pacman'
        res = room.match_result()
        self.assertEqual(res['players'][0]['user_id'], 42)

    def test_none_when_not_over(self):
        room = RoomState()
        room.set_role('p1', 'pacman')
        room.start()
        self.assertIsNone(room.match_result())

    def test_reset_round_rearms_result(self):
        room = self._over_room()
        room.match_result()
        room.reset_round()
        room.status = 'over'
        self.assertIsNotNone(room.match_result())


class RoomStateRoundTests(SimpleTestCase):
    def test_is_cleared_only_when_both_sets_empty(self):
        room = RoomState()
        room.add_player('p1', 'pacman')
        room.start()
        room.dots.clear()
        self.assertFalse(room.is_cleared())
        room.pellets.clear()
        self.assertTrue(room.is_cleared())

    def test_reset_round_reseeds_and_zeroes_scores(self):
        room = RoomState()
        room.add_player('p1', 'pacman')
        room.start()
        room.players['p1']['score'] = 120
        room.dots.clear()
        room.pellets.clear()

        room.reset_round()

        self.assertEqual(room.status, 'lobby')
        self.assertIsNone(room.winner)
        self.assertEqual(room.players['p1']['score'], 0)
        self.assertEqual(len(room.dots) + len(room.pellets), 224)

    def test_prune_drops_stale_players(self):
        room = RoomState()
        room.add_player('p1', 'pacman')
        room.add_player('p2', 'ghost_blinky')
        room.players['p1']['seen_ts'] = time.time() - 999
        room.prune(time.time())
        self.assertEqual(list(room.players), ['p2'])

    def test_snapshot_shape(self):
        room = RoomState()
        room.add_player('p1', 'pacman')
        room.add_player('g1', 'ghost_blinky')
        snap = room.snapshot()
        self.assertEqual(snap['level'], 1)
        self.assertEqual(snap['scores'], {'p1': 0, 'g1': 0})
        self.assertEqual(snap['roles'], {'p1': 'pacman', 'g1': 'ghost_blinky'})
        self.assertEqual(snap['spectators'], 0)
        self.assertEqual(len(snap['dots']) + len(snap['pellets']), 224)


class RoomStateSpectatorTests(SimpleTestCase):
    def test_set_role_spectator_leaves_the_player_list(self):
        room = RoomState()
        room.add_player('s1', 'pacman')
        room.set_role('s1', 'spectator')
        self.assertNotIn('s1', room.players)
        self.assertIn('s1', room.spectators)
        self.assertEqual(room.snapshot()['spectators'], 1)
        self.assertEqual(room.snapshot()['scores'], {})

    def test_add_player_ignores_a_known_spectator(self):
        room = RoomState()
        room.set_role('s1', 'spectator')
        room.add_player('s1', 'pacman')
        self.assertNotIn('s1', room.players)

    def test_spectator_back_to_player(self):
        room = RoomState()
        room.set_role('s1', 'spectator')
        room.set_role('s1', 'ghost_blinky')
        self.assertIn('s1', room.players)
        self.assertNotIn('s1', room.spectators)
        self.assertEqual(room.players['s1']['role'], 'ghost_blinky')

    def test_remove_player_clears_spectator(self):
        room = RoomState()
        room.set_role('s1', 'spectator')
        room.remove_player('s1')
        self.assertNotIn('s1', room.spectators)
        self.assertTrue(room.empty())

    def test_spectator_only_room_is_not_empty(self):
        room = RoomState()
        room.set_role('s1', 'spectator')
        self.assertFalse(room.empty())


class RoomStateRoleTakenTests(SimpleTestCase):
    def test_role_taken_by_another_player(self):
        room = RoomState()
        room.add_player('p1', 'pacman')
        self.assertTrue(room.role_taken('pacman', exclude_pid='p2'))

    def test_role_not_taken_when_excluding_the_holder_itself(self):
        room = RoomState()
        room.add_player('p1', 'pacman')
        self.assertFalse(room.role_taken('pacman', exclude_pid='p1'))

    def test_role_free_when_nobody_has_it(self):
        room = RoomState()
        room.add_player('p1', 'pacman')
        self.assertFalse(room.role_taken('ghost_blinky', exclude_pid='p2'))

    def test_spectator_is_never_taken(self):
        room = RoomState()
        room.set_role('p1', 'spectator')
        room.set_role('p2', 'spectator')
        self.assertFalse(room.role_taken('spectator', exclude_pid='p3'))

    def test_baby_is_never_taken(self):
        room = RoomState()
        room.add_player('p1', 'baby')
        self.assertFalse(room.role_taken('baby', exclude_pid='p2'))


class RoomStateBabyTests(SimpleTestCase):
    def _room(self):
        room = RoomState()
        room.add_player('papa', 'pacman')
        room.add_player('mama', 'madame_pacman')
        room.add_player('g1', 'ghost_blinky')
        return room

    def test_escaped_baby_gives_a_life_to_the_pacman_team(self):
        room = self._room()
        room.baby_event('papa', 'spawn')
        self.assertTrue(room.baby_event('papa', 'escape'))
        self.assertEqual(room.players['papa']['lives'], DEFAULT_LIVES + 1)
        self.assertEqual(room.players['mama']['lives'], DEFAULT_LIVES + 1)
        self.assertEqual(room.players['g1']['lives'], DEFAULT_LIVES)

    def test_one_life_per_baby_only(self):
        room = self._room()
        room.baby_event('papa', 'spawn')
        room.baby_event('papa', 'escape')
        self.assertFalse(room.baby_event('papa', 'escape'))
        self.assertEqual(room.players['papa']['lives'], DEFAULT_LIVES + 1)

    def test_dead_baby_gives_nothing(self):
        room = self._room()
        room.baby_event('papa', 'spawn')
        room.baby_event('papa', 'died')
        self.assertFalse(room.baby_event('papa', 'escape'))
        self.assertEqual(room.players['papa']['lives'], DEFAULT_LIVES)

    def test_only_papa_announces_the_baby(self):
        room = self._room()
        room.baby_event('g1', 'spawn')
        self.assertFalse(room.baby_event('g1', 'escape'))
        self.assertEqual(room.players['papa']['lives'], DEFAULT_LIVES)

    def test_baby_state_survives_redis_round_trip(self):
        room = self._room()
        room.baby_event('papa', 'spawn')
        clone = RoomState.from_dict(room.to_dict())
        self.assertTrue(clone.baby_event('papa', 'escape'))


class RoomStateStartProblemTests(SimpleTestCase):
    def test_distinct_characters_can_start(self):
        room = RoomState()
        room.add_player('p1', 'pacman')
        room.add_player('g1', 'ghost_blinky')
        self.assertIsNone(room.start_problem())

    def test_same_character_twice_blocks_start(self):
        room = RoomState()
        room.add_player('p1', 'pacman')
        room.add_player('p2', 'pacman')
        self.assertIsNotNone(room.start_problem())

    def test_player_without_character_blocks_start(self):
        room = RoomState()
        room.add_player('p1', 'pacman')
        room.add_player('p2', 'spectator')   # arrivé, pas encore choisi
        self.assertIsNotNone(room.start_problem())

    def test_no_player_blocks_start(self):
        room = RoomState()
        room.set_role('s1', 'spectator')
        self.assertIsNotNone(room.start_problem())

    def test_real_spectators_do_not_block_start(self):
        room = RoomState()
        room.add_player('p1', 'pacman')
        room.set_role('s1', 'spectator')
        self.assertIsNone(room.start_problem())


class RoomStateFindPidByUserTests(SimpleTestCase):
    def test_finds_the_stale_pid_for_the_same_user(self):
        room = RoomState()
        room.add_player('old-pid', 'pacman', user_id=42)
        self.assertEqual(room.find_pid_by_user(42, exclude_pid='new-pid'), 'old-pid')

    def test_excludes_the_pid_making_the_request(self):
        room = RoomState()
        room.add_player('p1', 'pacman', user_id=42)
        self.assertIsNone(room.find_pid_by_user(42, exclude_pid='p1'))

    def test_none_when_no_other_player_has_that_user(self):
        room = RoomState()
        room.add_player('p1', 'pacman', user_id=42)
        self.assertIsNone(room.find_pid_by_user(99, exclude_pid='p2'))

    def test_none_user_id_never_matches(self):
        room = RoomState()
        room.add_player('p1', 'pacman')  # user_id=None (défaut)
        self.assertIsNone(room.find_pid_by_user(None, exclude_pid='p2'))


class RoomStateRedisRoundTripTests(SimpleTestCase):
    def test_to_dict_from_dict_preserves_state(self):
        room = RoomState()
        room.add_player('p1', 'pacman', name='Alice', user_id=7)
        room.add_player('g1', 'ghost_blinky', name='Bob', user_id=8)
        room.set_role('s1', 'spectator')
        room.start()
        cell = next(iter(room.dots))
        room.eat_dot('p1', *cell)

        clone = RoomState.from_dict(room.to_dict())

        self.assertEqual(clone.dots, room.dots)
        self.assertEqual(clone.pellets, room.pellets)
        self.assertEqual(clone.status, 'playing')
        self.assertEqual(clone.players['p1']['score'], DOT_SCORE)
        self.assertEqual(clone.players['p1']['user_id'], 7)
        self.assertEqual(clone.spectators, {'s1'})

    def test_to_dict_is_json_safe(self):
        import json
        room = RoomState()
        room.add_player('p1', 'pacman')
        json.dumps(room.to_dict())          # ne lève pas
        json.dumps(room.snapshot())
