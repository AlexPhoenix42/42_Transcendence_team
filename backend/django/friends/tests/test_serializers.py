from django.test import TestCase
from django.contrib.auth import get_user_model

from friends.serializers import FriendRequestSerializer
from friends.models import FriendRequest

User = get_user_model()


class FriendRequestSerializerTests(TestCase):
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
        self.friend_request = FriendRequest.objects.create(
            from_user=self.user1,
            to_user=self.user2
        )

    def test_serializer_fields(self):
        serializer = FriendRequestSerializer(self.friend_request)
        data = serializer.data
        self.assertIn("id", data)
        self.assertIn("from_user", data)
        self.assertIn("to_user", data)
        self.assertIn("created_at", data)
        self.assertIn("status", data)

    def test_serializer_read_only_fields(self):
        serializer = FriendRequestSerializer(self.friend_request)
        data = serializer.data
        self.assertEqual(data["from_user"], "alice")
        self.assertEqual(data["to_user"], "bob")
        self.assertEqual(data["status"], "pending")

    def test_serializer_multiple_requests(self):
        self.user3 = User.objects.create_user(
            username="charlie",
            email="charlie@example.com",
            password="pass123"
        )
        FriendRequest.objects.create(from_user=self.user2, to_user=self.user3)
        requests = FriendRequest.objects.all()
        serializer = FriendRequestSerializer(requests, many=True)
        self.assertEqual(len(serializer.data), 2)


























#from django.test import TestCase
#from django.contrib.auth import get_user_model
#
#from friends.serializers import FriendRequestSerializer
#from friends.models import FriendRequest
#
#User = get_user_model()
#
#
#class FriendRequestSerializerTests(TestCase):
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
#        self.friend_request = FriendRequest.objects.create(
#            from_user=self.user1,
#            to_user=self.user2
#        )
#
#    def test_serializer_fields(self):
#        serializer = FriendRequestSerializer(self.friend_request)
#        data = serializer.data
#        self.assertIn("id", data)
#        self.assertIn("from_user", data)
#        self.assertIn("to_user", data)
#        self.assertIn("created_at", data)
#        self.assertIn("accepted", data)
#
#    def test_serializer_read_only_fields(self):
#        serializer = FriendRequestSerializer(self.friend_request)
#        data = serializer.data
#        self.assertEqual(data["from_user"], "alice")
#        self.assertEqual(data["to_user"], "bob")
#        self.assertFalse(data["accepted"])
#
#    def test_serializer_multiple_requests(self):
#        self.user3 = User.objects.create_user(
#            username="charlie",
#            email="charlie@example.com",
#            password="pass123"
#        )
#        FriendRequest.objects.create(from_user=self.user2, to_user=self.user3)
#        requests = FriendRequest.objects.all()
#        serializer = FriendRequestSerializer(requests, many=True)
#        self.assertEqual(len(serializer.data), 2)
#
