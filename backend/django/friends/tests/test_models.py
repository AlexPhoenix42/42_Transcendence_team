from django.test import TestCase
from django.contrib.auth import get_user_model
from django.db import IntegrityError

from friends.models import FriendRequest

User = get_user_model()


class FriendRequestModelTests(TestCase):
    def setUp(self):
        self.user1 = User.objects.create_user(
            username="alice",
            email="alice@example.com",
            password="pass123"
        )
        self.user2 = User.objects.create_user(
            username="bob",
            email="bob@example.com",
            password="pass123"
        )

    def test_create_friend_request(self):
        friend_request = FriendRequest.objects.create(
            from_user=self.user1,
            to_user=self.user2
        )
        self.assertEqual(friend_request.from_user, self.user1)
        self.assertEqual(friend_request.to_user, self.user2)
        self.assertEqual(friend_request.status, FriendRequest.Status.PENDING)
        self.assertIsNotNone(friend_request.created_at)

    def test_friend_request_str_pending(self):
        friend_request = FriendRequest.objects.create(
            from_user=self.user1,
            to_user=self.user2
        )
        self.assertEqual(str(friend_request), "alice -> bob (pending)")

    def test_friend_request_str_accepted(self):
        friend_request = FriendRequest.objects.create(
            from_user=self.user1,
            to_user=self.user2,
            status=FriendRequest.Status.ACCEPTED,
        )
        self.assertEqual(str(friend_request), "alice -> bob (accepted)")

    def test_friend_request_unique_pending_constraint(self):
        FriendRequest.objects.create(
            from_user=self.user1,
            to_user=self.user2,
            status=FriendRequest.Status.PENDING,
        )
        with self.assertRaises(IntegrityError):
            FriendRequest.objects.create(
                from_user=self.user1,
                to_user=self.user2,
                status=FriendRequest.Status.PENDING,
            )

    def test_friend_request_reverse_relation_from_user(self):
        FriendRequest.objects.create(from_user=self.user1, to_user=self.user2)
        self.assertEqual(self.user1.sent_friend_requests.count(), 1)
        self.assertEqual(self.user1.sent_friend_requests.first().to_user, self.user2)

    def test_friend_request_reverse_relation_to_user(self):
        FriendRequest.objects.create(from_user=self.user1, to_user=self.user2)
        self.assertEqual(self.user2.recv_friend_requests.count(), 1)
        self.assertEqual(self.user2.recv_friend_requests.first().from_user, self.user1)





#from django.test import TestCase
#from django.contrib.auth import get_user_model
#from django.db import IntegrityError
#
#from friends.models import FriendRequest
#
#User = get_user_model()
#
#
#class FriendRequestModelTests(TestCase):
#    def setUp(self):
#        self.user1 = User.objects.create_user(
#            username="alice",
#            email="alice@example.com",
#            password="pass123"
#        )
#        self.user2 = User.objects.create_user(
#            username="bob",
#            email="bob@example.com",
#            password="pass123"
#        )
#
#    def test_create_friend_request(self):
#        friend_request = FriendRequest.objects.create(
#            from_user=self.user1,
#            to_user=self.user2
#        )
#        self.assertEqual(friend_request.from_user, self.user1)
#        self.assertEqual(friend_request.to_user, self.user2)
#        self.assertFalse(friend_request.accepted)
#        self.assertIsNotNone(friend_request.created_at)
#
#    def test_friend_request_str_pending(self):
#        friend_request = FriendRequest.objects.create(
#            from_user=self.user1,
#            to_user=self.user2
#        )
#        self.assertEqual(str(friend_request), "alice -> bob (pending)")
#
#    def test_friend_request_str_accepted(self):
#        friend_request = FriendRequest.objects.create(
#            from_user=self.user1,
#            to_user=self.user2,
#            accepted=True
#        )
#        self.assertEqual(str(friend_request), "alice -> bob (accepted)")
#
#    def test_friend_request_unique_together(self):
#        FriendRequest.objects.create(from_user=self.user1, to_user=self.user2)
#        with self.assertRaises(IntegrityError):
#            FriendRequest.objects.create(from_user=self.user1, to_user=self.user2)
#
#    def test_friend_request_reverse_relation_from_user(self):
#        FriendRequest.objects.create(from_user=self.user1, to_user=self.user2)
#        self.assertEqual(self.user1.sent_friend_requests.count(), 1)
#        self.assertEqual(self.user1.sent_friend_requests.first().to_user, self.user2)
#
#    def test_friend_request_reverse_relation_to_user(self):
#        FriendRequest.objects.create(from_user=self.user1, to_user=self.user2)
#        self.assertEqual(self.user2.recv_friend_requests.count(), 1)
#        self.assertEqual(self.user2.recv_friend_requests.first().from_user, self.user1)
#
