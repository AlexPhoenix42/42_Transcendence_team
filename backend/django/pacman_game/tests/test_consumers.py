# pacman_game/tests/test_consumers.py
#
# `_room_lock` sérialise les séquences lecture-modif-écriture Redis (voir son
# commentaire dans consumers.py) : un salon -> toujours le même verrou Redis,
# pour que deux connexions concurrentes sur le même salon (y compris sur deux
# workers Daphne différents, voir `_RedisRoomLock`) s'excluent bien
# mutuellement. `_room_lock` retourne désormais un nouveau wrapper
# `_RedisRoomLock` à chaque appel (plus de dict `_room_locks` en mémoire de
# process - ça ne marcherait pas avec plusieurs workers) ; ce qui doit rester
# stable pour un même salon, c'est la clé Redis sous-jacente, pas l'identité
# de l'objet Python. Test unitaire pur (pas besoin de WebsocketCommunicator ni
# de Redis vivant : `cache.lock()` ne se connecte qu'à `acquire()`).

from django.test import SimpleTestCase

from pacman_game.consumers import _RedisRoomLock, _room_lock


class RoomLockTests(SimpleTestCase):
    def test_same_room_gives_the_same_redis_lock_key(self):
        a = _room_lock('room1')
        b = _room_lock('room1')
        self.assertEqual(a._lock.name, b._lock.name)

    def test_different_rooms_get_different_redis_lock_keys(self):
        a = _room_lock('room1')
        b = _room_lock('room2')
        self.assertNotEqual(a._lock.name, b._lock.name)

    def test_returns_a_redis_room_lock(self):
        self.assertIsInstance(_room_lock('room1'), _RedisRoomLock)
