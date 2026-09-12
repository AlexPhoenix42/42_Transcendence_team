# pacman_game/tests/test_consumers.py
#
# `_room_lock` sérialise les séquences lecture-modif-écriture Redis (voir son
# commentaire dans consumers.py) : un salon -> toujours le même verrou, pour
# que deux connexions concurrentes sur le même salon s'excluent bien
# mutuellement. Test unitaire pur (pas besoin de WebsocketCommunicator/Redis) :
# `_room_lock` est une fonction sync ordinaire, seul son usage est `async with`.

import asyncio

from django.test import SimpleTestCase

from pacman_game.consumers import _room_lock, _room_locks


class RoomLockTests(SimpleTestCase):
    def setUp(self):
        _room_locks.clear()

    def test_same_room_returns_the_same_lock(self):
        a = _room_lock('room1')
        b = _room_lock('room1')
        self.assertIs(a, b)

    def test_different_rooms_get_different_locks(self):
        a = _room_lock('room1')
        b = _room_lock('room2')
        self.assertIsNot(a, b)

    def test_returns_an_asyncio_lock(self):
        self.assertIsInstance(_room_lock('room1'), asyncio.Lock)
