import time

from django.test import SimpleTestCase

from game.room_state import (
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
        room.add_player('g1', 'ghost')
        cell = next(iter(room.dots))
        self.assertIsNone(room.eat_dot('g1', *cell))

    def test_rejected_for_unknown_tile(self):
        room = self._playing_room()
        self.assertIsNone(room.eat_dot('p1', 999, 999))


class RoomStateContactTests(SimpleTestCase):
    def _room(self):
        room = RoomState()
        room.add_player('p1', 'pacman')
        room.add_player('g1', 'ghost')
        room.start()
        return room

    def test_contact_costs_a_life(self):
        room = self._room()
        out = room.resolve_contact('p1', 'g1', time.monotonic())
        self.assertEqual(out['type'], 'pacman_caught')
        self.assertEqual(out['lives'], DEFAULT_LIVES - 1)
        self.assertFalse(out['over'])

    def test_contact_cooldown_blocks_burst(self):
        room = self._room()
        now = time.monotonic()
        room.resolve_contact('p1', 'g1', now)
        self.assertIsNone(room.resolve_contact('p1', 'g1', now + 0.1))
        later = now + CATCH_COOLDOWN_SECONDS + 0.1
        self.assertIsNotNone(room.resolve_contact('p1', 'g1', later))

    def test_last_life_ends_round_for_ghosts(self):
        room = self._room()
        room.players['p1']['lives'] = 1
        out = room.resolve_contact('p1', 'g1', time.monotonic())
        self.assertTrue(out['over'])
        self.assertEqual(room.status, 'over')
        self.assertEqual(room.winner, 'ghosts')

    def test_frightened_window_eats_the_ghost(self):
        room = self._room()
        pellet = next(iter(room.pellets))
        room.eat_dot('p1', *pellet)  # ouvre la fenêtre « effrayé »
        out = room.resolve_contact('p1', 'g1', time.monotonic())
        self.assertEqual(out['type'], 'ghost_home')
        self.assertEqual(out['ghost'], 'g1')
        self.assertEqual(room.players['p1']['lives'], DEFAULT_LIVES)
        self.assertEqual(room.players['p1']['score'], PELLET_SCORE + GHOST_EAT_SCORE)

    def test_contact_ignored_when_not_playing(self):
        room = RoomState()
        room.add_player('p1', 'pacman')
        self.assertIsNone(room.resolve_contact('p1', 'g1', time.monotonic()))


class RoomStateBlockerTests(SimpleTestCase):
    def _room(self):
        room = RoomState()
        room.add_player('p1', 'blocker')
        room.add_player('g1', 'ghost')
        room.start()
        return room

    def test_contact_imprisons_instead_of_killing(self):
        room = self._room()
        out = room.resolve_contact('p1', 'g1', time.monotonic())
        self.assertEqual(out['type'], 'pacman_imprisoned')
        self.assertEqual(out['seconds'], PRISON_SECONDS)
        self.assertEqual(room.players['p1']['lives'], DEFAULT_LIVES)

    def test_imprison_cooldown_blocks_burst(self):
        room = self._room()
        now = time.monotonic()
        room.resolve_contact('p1', 'g1', now)
        self.assertIsNone(room.resolve_contact('p1', 'g1', now + 0.1))
        later = now + CATCH_COOLDOWN_SECONDS + 0.1
        self.assertIsNotNone(room.resolve_contact('p1', 'g1', later))

    def test_frightened_window_still_eats_the_ghost(self):
        room = self._room()
        pellet = next(iter(room.pellets))
        room.eat_dot('p1', *pellet)  # ouvre la fenêtre « effrayé »
        out = room.resolve_contact('p1', 'g1', time.monotonic())
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
        room.set_role('g1', 'ghost', name='Bob')
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
        room.add_player('p2', 'ghost')
        room.players['p1']['seen_ts'] = time.monotonic() - 999
        room.prune(time.monotonic())
        self.assertEqual(list(room.players), ['p2'])

    def test_snapshot_shape(self):
        room = RoomState()
        room.add_player('p1', 'pacman')
        room.add_player('g1', 'ghost')
        snap = room.snapshot()
        self.assertEqual(snap['level'], 1)
        self.assertEqual(snap['scores'], {'p1': 0, 'g1': 0})
        self.assertEqual(snap['roles'], {'p1': 'pacman', 'g1': 'ghost'})
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
        room.set_role('s1', 'ghost')
        self.assertIn('s1', room.players)
        self.assertNotIn('s1', room.spectators)
        self.assertEqual(room.players['s1']['role'], 'ghost')

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
