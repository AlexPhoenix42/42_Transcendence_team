# firends/tests/test_views.py

from django.test import TestCase
from django.urls import reverse
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from friends.models import FriendRequest

User = get_user_model()

from django.test import override_settings

class FriendViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
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
        self.user3 = User.objects.create_user(
            username="charlie",
            email="charlie@example.com",
            password="pass123"
        )
        self.client.force_authenticate(user=self.user1)

    def test_friend_list_empty(self):
        response = self.client.get(reverse("friend_list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 0)
        self.assertEqual(response.data["results"], [])

    def test_friend_list_with_friends(self):
        self.user1.friends.add(self.user2)
        response = self.client.get(reverse("friend_list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["username"], "bob")

    def test_friend_list_unauthenticated(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(reverse("friend_list"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class FriendRequestListViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
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
        self.user3 = User.objects.create_user(
            username="charlie",
            email="charlie@example.com",
            password="pass123"
        )
        self.client.force_authenticate(user=self.user1)

    def test_friend_request_list_empty(self):
        response = self.client.get(reverse("friend_requests"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["results"], [])

    def test_friend_request_list_with_pending(self):
        FriendRequest.objects.create(
            from_user=self.user2,
            to_user=self.user1,
            status=FriendRequest.Status.PENDING
        )
        FriendRequest.objects.create(
            from_user=self.user3,
            to_user=self.user1,
            status=FriendRequest.Status.PENDING
        )
        response = self.client.get(reverse("friend_requests"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 2)
        self.assertEqual(response.data["results"][0]["from_user"], "bob")
        self.assertEqual(response.data["results"][1]["from_user"], "charlie")

    def test_friend_request_list_only_incoming(self):
        FriendRequest.objects.create(
            from_user=self.user1,
            to_user=self.user2,
            status=FriendRequest.Status.PENDING
        )
        FriendRequest.objects.create(
            from_user=self.user3,
            to_user=self.user1,
            status=FriendRequest.Status.PENDING
        )
        response = self.client.get(reverse("friend_requests"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["from_user"], "charlie")

    def test_friend_request_list_excludes_accepted(self):
        FriendRequest.objects.create(
            from_user=self.user2,
            to_user=self.user1,
            status=FriendRequest.Status.ACCEPTED
        )
        response = self.client.get(reverse("friend_requests"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["results"], [])

@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.dummy.DummyCache'}})
class SendFriendRequestViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
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
        self.client.force_authenticate(user=self.user1)

    def test_send_friend_request_success(self):
        response = self.client.post(
            reverse("send_friend_request"),
            {"username": "bob"},
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["from_user"], "alice")
        self.assertEqual(response.data["to_user"], "bob")
        self.assertEqual(response.data["status"], "pending")
        self.assertTrue(
            FriendRequest.objects.filter(
                from_user=self.user1,
                to_user=self.user2
            ).exists()
        )

    def test_send_friend_request_missing_username(self):
        response = self.client.post(
            reverse("send_friend_request"),
            {},
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"], "username is required.")

    def test_send_friend_request_user_not_found(self):
        response = self.client.post(
            reverse("send_friend_request"),
            {"username": "nonexistent"},
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"], "Cannot send friend request.")

    def test_send_friend_request_to_self(self):
        response = self.client.post(
            reverse("send_friend_request"),
            {"username": "alice"},
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["error"],
            "You cannot send a friend request to yourself."
        )

    def test_send_friend_request_already_friends(self):
        self.user1.friends.add(self.user2)
        response = self.client.post(
            reverse("send_friend_request"),
            {"username": "bob"},
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"], "You are already friends.")

    def test_send_friend_request_duplicate(self):
        FriendRequest.objects.create(
            from_user=self.user1,
            to_user=self.user2,
            status=FriendRequest.Status.PENDING
        )
        response = self.client.post(
            reverse("send_friend_request"),
            {"username": "bob"},
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(
            response.data["error"],
            "A pending request already pending."
        )
        # Only one request should exist
        self.assertEqual(
            FriendRequest.objects.filter(
                from_user=self.user1,
                to_user=self.user2
            ).count(),
            1
        )

    def test_send_friend_request_incoming_pending(self):
        FriendRequest.objects.create(
            from_user=self.user2,
            to_user=self.user1,
            status=FriendRequest.Status.PENDING
        )
        response = self.client.post(
            reverse("send_friend_request"),
            {"username": "bob"},
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(
            response.data["error"],
            "A pending request already pending."
        )
        # Still only the original incoming request
        self.assertEqual(
            FriendRequest.objects.filter(
                from_user=self.user2,
                to_user=self.user1
            ).count(),
            1
        )

@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.dummy.DummyCache'}})
class ResponseFriendRequestViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
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
        self.client.force_authenticate(user=self.user1)
        self.friend_request = FriendRequest.objects.create(
            from_user=self.user2,
            to_user=self.user1,
            status=FriendRequest.Status.PENDING
        )

    def test_accept_friend_request(self):
        response = self.client.patch(
            reverse("respond_friend_request", args=[self.friend_request.pk]),
            {"action": "accept"},
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "Friend request accepted.")
        self.friend_request.refresh_from_db()
        self.assertEqual(
            self.friend_request.status,
            FriendRequest.Status.ACCEPTED
        )
        self.assertTrue(
            self.user1.friends.filter(pk=self.user2.pk).exists()
        )
        self.assertTrue(
            self.user2.friends.filter(pk=self.user1.pk).exists()
        )

    def test_decline_friend_request(self):
        response = self.client.patch(
            reverse("respond_friend_request", args=[self.friend_request.pk]),
            {"action": "decline"},
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "Friend request declined.")
        self.friend_request.refresh_from_db()
        self.assertEqual(
            self.friend_request.status,
            FriendRequest.Status.DECLINED
        )

    def test_respond_friend_request_invalid_action(self):
        response = self.client.patch(
            reverse("respond_friend_request", args=[self.friend_request.pk]),
            {"action": "invalid"},
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["error"],
            "Invalid action. Use 'accept' or 'decline'."
        )

    def test_respond_friend_request_not_found(self):
        response = self.client.patch(
            reverse("respond_friend_request", args=[999]),
            {"action": "accept"},
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(
            response.data["error"],
            "Friend request not found."
        )

    def test_respond_friend_request_unauthorized(self):
        self.client.force_authenticate(user=None)
        response = self.client.patch(
            reverse("respond_friend_request", args=[self.friend_request.pk]),
            {"action": "accept"},
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class RemoveFriendViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
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
        self.client.force_authenticate(user=self.user1)
        self.user1.friends.add(self.user2)

    def test_remove_friend_success(self):
        response = self.client.delete(
            reverse("remove_friend", args=[self.user2.pk])
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "Friend removed.")
        self.assertFalse(
            self.user1.friends.filter(pk=self.user2.pk).exists()
        )

    def test_remove_friend_not_found(self):
        response = self.client.delete(
            reverse("remove_friend", args=[999])
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(
            response.data["error"],
            "Unable to remove friend."
        )

    def test_remove_friend_not_friend(self):
        self.user1.friends.remove(self.user2)
        response = self.client.delete(
            reverse("remove_friend", args=[self.user2.pk])
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(
            response.data["error"],
            "Unable to remove friend."
        )

    def test_remove_friend_unauthenticated(self):
        self.client.force_authenticate(user=None)
        response = self.client.delete(
            reverse("remove_friend", args=[self.user2.pk])
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)









# =====================================================

#from django.test import TestCase
#from django.urls import reverse
#from django.contrib.auth import get_user_model
#from rest_framework.test import APIClient
#from rest_framework import status
#
#from friends.models import FriendRequest
#
#User = get_user_model()
#
#
#class FriendViewTests(TestCase):
#    def setUp(self):
#        self.client = APIClient()
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
#        self.user3 = User.objects.create_user(
#            username="charlie",
#            email="charlie@example.com",
#            password="pass123"
#        )
#        self.client.force_authenticate(user=self.user1)
#
#    def test_friend_list_empty(self):
#        response = self.client.get(reverse("friend_list"))
#        self.assertEqual(response.status_code, status.HTTP_200_OK)
#        self.assertEqual(response.data["count"], 0)
#        self.assertEqual(response.data["friends"], [])
#
#    def test_friend_list_with_friends(self):
#        self.user1.friends.add(self.user2)
#        response = self.client.get(reverse("friend_list"))
#        self.assertEqual(response.status_code, status.HTTP_200_OK)
#        self.assertEqual(response.data["count"], 1)
#        self.assertEqual(response.data["friends"][0]["username"], "bob")
#
#    def test_friend_list_unauthenticated(self):
#        self.client.force_authenticate(user=None)
#        response = self.client.get(reverse("friend_list"))
#        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
#
#
#class FriendRequestListViewTests(TestCase):
#    def setUp(self):
#        self.client = APIClient()
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
#        self.user3 = User.objects.create_user(
#            username="charlie",
#            email="charlie@example.com",
#            password="pass123"
#        )
#        self.client.force_authenticate(user=self.user1)
#
#    def test_friend_request_list_empty(self):
#        response = self.client.get(reverse("friend_requests"))
#        self.assertEqual(response.status_code, status.HTTP_200_OK)
#        self.assertEqual(response.data, [])
#
#    def test_friend_request_list_with_pending(self):
#        FriendRequest.objects.create(from_user=self.user2, to_user=self.user1)
#        FriendRequest.objects.create(from_user=self.user3, to_user=self.user1)
#        response = self.client.get(reverse("friend_requests"))
#        self.assertEqual(response.status_code, status.HTTP_200_OK)
#        self.assertEqual(len(response.data), 2)
#        self.assertEqual(response.data[0]["from_user"], "bob")
#        self.assertEqual(response.data[1]["from_user"], "charlie")
#
#    def test_friend_request_list_only_incoming(self):
#        # User1 sends to User2 (outgoing, should not appear)
#        FriendRequest.objects.create(from_user=self.user1, to_user=self.user2)
#        # User3 sends to User1 (incoming, should appear)
#        FriendRequest.objects.create(from_user=self.user3, to_user=self.user1)
#        response = self.client.get(reverse("friend_requests"))
#        self.assertEqual(response.status_code, status.HTTP_200_OK)
#        self.assertEqual(len(response.data), 1)
#        self.assertEqual(response.data[0]["from_user"], "charlie")
#
#    def test_friend_request_list_excludes_accepted(self):
#        FriendRequest.objects.create(from_user=self.user2, to_user=self.user1, accepted=True)
#        response = self.client.get(reverse("friend_requests"))
#        self.assertEqual(response.status_code, status.HTTP_200_OK)
#        self.assertEqual(response.data, [])
#
#
#class SendFriendRequestViewTests(TestCase):
#    def setUp(self):
#        self.client = APIClient()
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
#        self.client.force_authenticate(user=self.user1)
#
#    def test_send_friend_request_success(self):
#        response = self.client.post(
#            reverse("send_friend_request"),
#            {"username": "bob"},
#            format="json"
#        )
#        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
#        self.assertEqual(response.data["from_user"], "alice")
#        self.assertEqual(response.data["to_user"], "bob")
#        self.assertFalse(response.data["accepted"])
#        self.assertTrue(FriendRequest.objects.filter(from_user=self.user1, to_user=self.user2).exists())
#
#    def test_send_friend_request_missing_username(self):
#        response = self.client.post(
#            reverse("send_friend_request"),
#            {},
#            format="json"
#        )
#        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
#        self.assertEqual(response.data["error"], "username is required.")
#
#    def test_send_friend_request_user_not_found(self):
#        response = self.client.post(
#            reverse("send_friend_request"),
#            {"username": "nonexistent"},
#            format="json"
#        )
#        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
#        self.assertEqual(response.data["error"], "User does not exist.")
#
#    def test_send_friend_request_to_self(self):
#        response = self.client.post(
#            reverse("send_friend_request"),
#            {"username": "alice"},
#            format="json"
#        )
#        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
#        self.assertEqual(response.data["error"], "You cannot send a friend request to yourself.")
#
#    def test_send_friend_request_already_friends(self):
#        self.user1.friends.add(self.user2)
#        response = self.client.post(
#            reverse("send_friend_request"),
#            {"username": "bob"},
#            format="json"
#        )
#        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
#        self.assertEqual(response.data["error"], "You are already friends.")
#
#    def test_send_friend_request_duplicate(self):
#        FriendRequest.objects.create(from_user=self.user1, to_user=self.user2)
#        response = self.client.post(
#            reverse("send_friend_request"),
#            {"username": "bob"},
#            format="json"
#        )
#        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
#        self.assertEqual(response.data["error"], "Friend request already sent.")
#
#    def test_send_friend_request_incoming_pending(self):
#        # User2 already sent a request to User1
#        FriendRequest.objects.create(from_user=self.user2, to_user=self.user1)
#        response = self.client.post(
#            reverse("send_friend_request"),
#            {"username": "bob"},
#            format="json"
#        )
#        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
#        self.assertEqual(response.data["error"], "This user already sent you a request.")
#
#
#class ResponseFriendRequestViewTests(TestCase):
#    def setUp(self):
#        self.client = APIClient()
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
#        self.client.force_authenticate(user=self.user1)
#        self.friend_request = FriendRequest.objects.create(
#            from_user=self.user2,
#            to_user=self.user1
#        )
#
#    def test_accept_friend_request(self):
#        response = self.client.patch(
#            reverse("respond_friend_request", args=[self.friend_request.pk]),
#            {"action": "accept"},
#            format="json"
#        )
#        self.assertEqual(response.status_code, status.HTTP_200_OK)
#        self.assertEqual(response.data["status"], "Friend request accepted")
#        self.friend_request.refresh_from_db()
#        self.assertTrue(self.friend_request.accepted)
#        self.assertTrue(self.user1.friends.filter(pk=self.user2.pk).exists())
#        self.assertTrue(self.user2.friends.filter(pk=self.user1.pk).exists())
#
#    def test_decline_friend_request(self):
#        response = self.client.patch(
#            reverse("respond_friend_request", args=[self.friend_request.pk]),
#            {"action": "decline"},
#            format="json"
#        )
#        self.assertEqual(response.status_code, status.HTTP_200_OK)
#        self.assertEqual(response.data["status"], "Friend request declined.")
#        self.assertFalse(FriendRequest.objects.filter(pk=self.friend_request.pk).exists())
#
#    def test_respond_friend_request_invalid_action(self):
#        response = self.client.patch(
#            reverse("respond_friend_request", args=[self.friend_request.pk]),
#            {"action": "invalid"},
#            format="json"
#        )
#        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
#        self.assertEqual(response.data["error"], "Invalid action. Use 'accept' or 'decline'.")
#
#    def test_respond_friend_request_not_found(self):
#        response = self.client.patch(
#            reverse("respond_friend_request", args=[999]),
#            {"action": "accept"},
#            format="json"
#        )
#        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
#        self.assertEqual(response.data["error"], "Friend request not found.")
#
#    def test_respond_friend_request_unauthorized(self):
#        self.client.force_authenticate(user=None)
#        response = self.client.patch(
#            reverse("respond_friend_request", args=[self.friend_request.pk]),
#            {"action": "accept"},
#            format="json"
#        )
#        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
#
#
#class RemoveFriendViewTests(TestCase):
#    def setUp(self):
#        self.client = APIClient()
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
#        self.client.force_authenticate(user=self.user1)
#        self.user1.friends.add(self.user2)
#
#    def test_remove_friend_success(self):
#        response = self.client.delete(
#            reverse("remove_friend", args=[self.user2.pk])
#        )
#        self.assertEqual(response.status_code, status.HTTP_200_OK)
#        self.assertEqual(response.data["status"], "Friend removed.")
#        self.assertFalse(self.user1.friends.filter(pk=self.user2.pk).exists())
#
#    def test_remove_friend_not_found(self):
#        response = self.client.delete(
#            reverse("remove_friend", args=[999])
#        )
#        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
#        self.assertEqual(response.data["error"], "User not found")
#
#    def test_remove_friend_not_friend(self):
#        self.user1.friends.remove(self.user2)
#        response = self.client.delete(
#            reverse("remove_friend", args=[self.user2.pk])
#        )
#        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
#        self.assertEqual(response.data["error"], "User is not your friend.")
#
#    def test_remove_friend_unauthenticated(self):
#        self.client.force_authenticate(user=None)
#        response = self.client.delete(
#            reverse("remove_friend", args=[self.user2.pk])
#        )
#        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
#
