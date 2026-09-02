from django.test import TestCase
from django.urls import reverse
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from django.test import override_settings

from friends.models import FriendRequest

User = get_user_model()


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.dummy.DummyCache'}})
class FriendIntegrationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.alice = User.objects.create_user(
            username="alice",
            email="alice@example.com",
            password="pass123"
        )
        self.bob = User.objects.create_user(
            username="bob",
            email="bob@example.com",
            password="pass123"
        )
        self.charlie = User.objects.create_user(
            username="charlie",
            email="charlie@example.com",
            password="pass123"
        )

    def test_full_friend_request_flow(self):
        """Alice sends request → Bob accepts → Friends list shows both"""
        self.client.force_authenticate(user=self.alice)

        # 1. Alice sends friend request to Bob
        response = self.client.post(
            reverse("send_friend_request"),
            {"username": "bob"},
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        request_id = response.data["id"]

        # 2. Bob accepts the request
        self.client.force_authenticate(user=self.bob)
        response = self.client.patch(
            reverse("respond_friend_request", args=[request_id]),
            {"action": "accept"},
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "Friend request accepted.")

        # 3. Alice's friend list shows Bob (paginated)
        self.client.force_authenticate(user=self.alice)
        response = self.client.get(reverse("friend_list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["username"], "bob")

        # 4. Bob's friend list shows Alice
        self.client.force_authenticate(user=self.bob)
        response = self.client.get(reverse("friend_list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["username"], "alice")

        # 5. Alice removes Bob
        self.client.force_authenticate(user=self.alice)
        response = self.client.delete(
            reverse("remove_friend", args=[self.bob.pk])
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "Friend removed.")

        # 6. Alice's friend list is empty
        response = self.client.get(reverse("friend_list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 0)
        self.assertEqual(response.data["results"], [])

        # 7. Bob's friend list is also empty (removed from both sides)
        self.client.force_authenticate(user=self.bob)
        response = self.client.get(reverse("friend_list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 0)
        self.assertEqual(response.data["results"], [])

    def test_decline_friend_request_flow(self):
        """Alice sends request → Bob declines → No friends added, request status DECLINED"""
        self.client.force_authenticate(user=self.alice)

        response = self.client.post(
            reverse("send_friend_request"),
            {"username": "bob"},
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        request_id = response.data["id"]

        # Bob declines
        self.client.force_authenticate(user=self.bob)
        response = self.client.patch(
            reverse("respond_friend_request", args=[request_id]),
            {"action": "decline"},
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "Friend request declined.")

        # Request still exists but is declined
        declined_request = FriendRequest.objects.get(pk=request_id)
        self.assertEqual(declined_request.status, FriendRequest.Status.DECLINED)

        # Alice's friend list is empty
        self.client.force_authenticate(user=self.alice)
        response = self.client.get(reverse("friend_list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 0)
        self.assertEqual(response.data["results"], [])

    def test_accept_already_accepted_request(self):
        """Accepting an already accepted request should return 404"""
        self.client.force_authenticate(user=self.alice)
        response = self.client.post(
            reverse("send_friend_request"),
            {"username": "bob"},
            format="json"
        )
        request_id = response.data["id"]

        # Bob accepts
        self.client.force_authenticate(user=self.bob)
        response = self.client.patch(
            reverse("respond_friend_request", args=[request_id]),
            {"action": "accept"},
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Try to accept again
        response = self.client.patch(
            reverse("respond_friend_request", args=[request_id]),
            {"action": "accept"},
            format="json"
        )
        # Request no longer pending → 404
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data["error"], "Friend request not found.")

    def test_accept_request_from_already_friend(self):
        """Accepting a request from someone already your friend"""
        # Make them friends first
        self.alice.friends.add(self.bob)
        self.bob.friends.add(self.alice)

        # Alice sends another request (should fail)
        self.client.force_authenticate(user=self.alice)
        response = self.client.post(
            reverse("send_friend_request"),
            {"username": "bob"},
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"], "You are already friends.")

    def test_send_request_to_user_who_already_sent_you_one(self):
        """Bob sends request to Alice → Alice tries to send request to Bob → Should return 409"""
        # Bob sends request to Alice
        self.client.force_authenticate(user=self.bob)
        response = self.client.post(
            reverse("send_friend_request"),
            {"username": "alice"},
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Alice tries to send request to Bob (should fail with 409)
        self.client.force_authenticate(user=self.alice)
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

    def test_multiple_friend_requests_to_different_users(self):
        """Alice sends requests to Bob and Charlie → Both appear in pending list"""
        self.client.force_authenticate(user=self.alice)
        self.client.post(
            reverse("send_friend_request"),
            {"username": "bob"},
            format="json"
        )
        self.client.post(
            reverse("send_friend_request"),
            {"username": "charlie"},
            format="json"
        )

        # Bob's pending list shows Alice (paginated)
        self.client.force_authenticate(user=self.bob)
        response = self.client.get(reverse("friend_requests"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["from_user"], "alice")

        # Charlie's pending list shows Alice
        self.client.force_authenticate(user=self.charlie)
        response = self.client.get(reverse("friend_requests"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["from_user"], "alice")

    def test_send_request_to_user_who_already_declined(self):
        """Send request → decline → send again → should work (new request)"""
        # Alice sends request to Bob
        self.client.force_authenticate(user=self.alice)
        response = self.client.post(
            reverse("send_friend_request"),
            {"username": "bob"},
            format="json"
        )
        request_id = response.data["id"]

        # Bob declines
        self.client.force_authenticate(user=self.bob)
        self.client.patch(
            reverse("respond_friend_request", args=[request_id]),
            {"action": "decline"},
            format="json"
        )

        # Alice sends again (should succeed)
        self.client.force_authenticate(user=self.alice)
        response = self.client.post(
            reverse("send_friend_request"),
            {"username": "bob"},
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            FriendRequest.objects.filter(
                from_user=self.alice,
                to_user=self.bob,
                status=FriendRequest.Status.PENDING,
            ).exists()
        )

    def test_remove_friend_removes_from_both_lists(self):
        """Removing a friend removes from both users' friend lists"""
        # Make them friends
        self.alice.friends.add(self.bob)
        self.bob.friends.add(self.alice)

        # Alice removes Bob
        self.client.force_authenticate(user=self.alice)
        response = self.client.delete(
            reverse("remove_friend", args=[self.bob.pk])
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Alice's list is empty
        response = self.client.get(reverse("friend_list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 0)
        self.assertEqual(response.data["results"], [])

        # Bob's list is also empty
        self.client.force_authenticate(user=self.bob)
        response = self.client.get(reverse("friend_list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 0)
        self.assertEqual(response.data["results"], [])

    def test_send_request_to_nonexistent_user(self):
        """Send friend request to a user that doesn't exist"""
        self.client.force_authenticate(user=self.alice)
        response = self.client.post(
            reverse("send_friend_request"),
            {"username": "nonexistent"},
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"], "Cannot send friend request.")

    def test_friend_request_list_unauthenticated(self):
        """Unauthenticated user cannot view friend requests"""
        self.client.force_authenticate(user=None)
        response = self.client.get(reverse("friend_requests"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # --- New edge-case tests ---

    def test_remove_friend_updates_friend_request_status(self):
        """After removal, the old accepted FriendRequest should be marked DECLINED"""
        # Alice sends request
        self.client.force_authenticate(user=self.alice)
        response = self.client.post(
            reverse("send_friend_request"),
            {"username": "bob"},
            format="json"
        )
        request_id = response.data["id"]

        # Bob accepts
        self.client.force_authenticate(user=self.bob)
        self.client.patch(
            reverse("respond_friend_request", args=[request_id]),
            {"action": "accept"},
            format="json"
        )

        # Alice removes Bob
        self.client.force_authenticate(user=self.alice)
        self.client.delete(reverse("remove_friend", args=[self.bob.pk]))

        # The original friend request should now be declined
        fr = FriendRequest.objects.get(pk=request_id)
        self.assertEqual(fr.status, FriendRequest.Status.DECLINED)

    def test_accept_declined_request(self):
        """Accepting a request that has already been declined should 404"""
        # Bob sends request to Alice
        self.client.force_authenticate(user=self.bob)
        response = self.client.post(
            reverse("send_friend_request"),
            {"username": "alice"},
            format="json"
        )
        request_id = response.data["id"]

        # Alice declines
        self.client.force_authenticate(user=self.alice)
        self.client.patch(
            reverse("respond_friend_request", args=[request_id]),
            {"action": "decline"},
            format="json"
        )

        # Try to accept the declined request
        response = self.client.patch(
            reverse("respond_friend_request", args=[request_id]),
            {"action": "accept"},
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data["error"], "Friend request not found.")

    def test_send_request_after_declining_reverse(self):
        """Bob sends to Alice → Alice declines → Alice sends to Bob (should work)"""
        # Bob sends request to Alice
        self.client.force_authenticate(user=self.bob)
        response = self.client.post(
            reverse("send_friend_request"),
            {"username": "alice"},
            format="json"
        )
        request_id = response.data["id"]

        # Alice declines
        self.client.force_authenticate(user=self.alice)
        self.client.patch(
            reverse("respond_friend_request", args=[request_id]),
            {"action": "decline"},
            format="json"
        )

        # Now Alice sends her own request to Bob
        response = self.client.post(
            reverse("send_friend_request"),
            {"username": "bob"},
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            FriendRequest.objects.filter(
                from_user=self.alice,
                to_user=self.bob,
                status=FriendRequest.Status.PENDING,
            ).exists()
        )































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
#class FriendIntegrationTests(TestCase):
#    def setUp(self):
#        self.client = APIClient()
#        self.alice = User.objects.create_user(
#            username="alice",
#            email="alice@example.com",
#            password="pass123"
#        )
#        self.bob = User.objects.create_user(
#            username="bob",
#            email="bob@example.com",
#            password="pass123"
#        )
#        self.charlie = User.objects.create_user(
#            username="charlie",
#            email="charlie@example.com",
#            password="pass123"
#        )
#
#    def test_full_friend_request_flow(self):
#        """Alice sends request → Bob accepts → Friends list shows both"""
#        self.client.force_authenticate(user=self.alice)
#
#        # 1. Alice sends friend request to Bob
#        response = self.client.post(
#            reverse("send_friend_request"),
#            {"username": "bob"},
#            format="json"
#        )
#        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
#        request_id = response.data["id"]
#
#        # 2. Bob accepts the request
#        self.client.force_authenticate(user=self.bob)
#        response = self.client.patch(
#            reverse("respond_friend_request", args=[request_id]),
#            {"action": "accept"},
#            format="json"
#        )
#        self.assertEqual(response.status_code, status.HTTP_200_OK)
#        self.assertEqual(response.data["status"], "Friend request accepted")
#
#        # 3. Alice's friend list shows Bob
#        self.client.force_authenticate(user=self.alice)
#        response = self.client.get(reverse("friend_list"))
#        self.assertEqual(response.status_code, status.HTTP_200_OK)
#        self.assertEqual(response.data["count"], 1)
#        self.assertEqual(response.data["friends"][0]["username"], "bob")
#
#        # 4. Bob's friend list shows Alice
#        self.client.force_authenticate(user=self.bob)
#        response = self.client.get(reverse("friend_list"))
#        self.assertEqual(response.status_code, status.HTTP_200_OK)
#        self.assertEqual(response.data["count"], 1)
#        self.assertEqual(response.data["friends"][0]["username"], "alice")
#
#        # 5. Alice removes Bob
#        self.client.force_authenticate(user=self.alice)
#        response = self.client.delete(
#            reverse("remove_friend", args=[self.bob.pk])
#        )
#        self.assertEqual(response.status_code, status.HTTP_200_OK)
#        self.assertEqual(response.data["status"], "Friend removed.")
#
#        # 6. Alice's friend list is empty
#        response = self.client.get(reverse("friend_list"))
#        self.assertEqual(response.status_code, status.HTTP_200_OK)
#        self.assertEqual(response.data["count"], 0)
#
#        # 7. Bob's friend list is also empty (removed from both sides)
#        self.client.force_authenticate(user=self.bob)
#        response = self.client.get(reverse("friend_list"))
#        self.assertEqual(response.status_code, status.HTTP_200_OK)
#        self.assertEqual(response.data["count"], 0)
#
#    def test_decline_friend_request_flow(self):
#        """Alice sends request → Bob declines → No friends added"""
#        self.client.force_authenticate(user=self.alice)
#
#        response = self.client.post(
#            reverse("send_friend_request"),
#            {"username": "bob"},
#            format="json"
#        )
#        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
#        request_id = response.data["id"]
#
#        # Bob declines
#        self.client.force_authenticate(user=self.bob)
#        response = self.client.patch(
#            reverse("respond_friend_request", args=[request_id]),
#            {"action": "decline"},
#            format="json"
#        )
#        self.assertEqual(response.status_code, status.HTTP_200_OK)
#        self.assertEqual(response.data["status"], "Friend request declined.")
#
#        # Request no longer exists
#        self.assertFalse(FriendRequest.objects.filter(pk=request_id).exists())
#
#        # Alice's friend list is empty
#        self.client.force_authenticate(user=self.alice)
#        response = self.client.get(reverse("friend_list"))
#        self.assertEqual(response.status_code, status.HTTP_200_OK)
#        self.assertEqual(response.data["count"], 0)
#
#    def test_accept_already_accepted_request(self):
#        """Accepting an already accepted request should return 404"""
#        self.client.force_authenticate(user=self.alice)
#        response = self.client.post(
#            reverse("send_friend_request"),
#            {"username": "bob"},
#            format="json"
#        )
#        request_id = response.data["id"]
#
#        # Bob accepts
#        self.client.force_authenticate(user=self.bob)
#        response = self.client.patch(
#            reverse("respond_friend_request", args=[request_id]),
#            {"action": "accept"},
#            format="json"
#        )
#        self.assertEqual(response.status_code, status.HTTP_200_OK)
#
#        # Try to accept again
#        response = self.client.patch(
#            reverse("respond_friend_request", args=[request_id]),
#            {"action": "accept"},
#            format="json"
#        )
#        # Request no longer exists because it was accepted
#        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
#        self.assertEqual(response.data["error"], "Friend request not found.")
#
#    def test_accept_request_from_already_friend(self):
#        """Accepting a request from someone already your friend"""
#        # Make them friends first
#        self.alice.friends.add(self.bob)
#        self.bob.friends.add(self.alice)
#
#        # Alice sends another request (should fail)
#        self.client.force_authenticate(user=self.alice)
#        response = self.client.post(
#            reverse("send_friend_request"),
#            {"username": "bob"},
#            format="json"
#        )
#        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
#        self.assertEqual(response.data["error"], "You are already friends.")
#
#    def test_send_request_to_user_who_already_sent_you_one(self):
#        """Bob sends request to Alice → Alice tries to send request to Bob → Should fail"""
#        # Bob sends request to Alice
#        self.client.force_authenticate(user=self.bob)
#        response = self.client.post(
#            reverse("send_friend_request"),
#            {"username": "alice"},
#            format="json"
#        )
#        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
#
#        # Alice tries to send request to Bob (should fail)
#        self.client.force_authenticate(user=self.alice)
#        response = self.client.post(
#            reverse("send_friend_request"),
#            {"username": "bob"},
#            format="json"
#        )
#        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
#        self.assertEqual(response.data["error"], "This user already sent you a request.")
#
#    def test_multiple_friend_requests_to_different_users(self):
#        """Alice sends requests to Bob and Charlie → Both appear in pending list"""
#        self.client.force_authenticate(user=self.alice)
#        self.client.post(
#            reverse("send_friend_request"),
#            {"username": "bob"},
#            format="json"
#        )
#        self.client.post(
#            reverse("send_friend_request"),
#            {"username": "charlie"},
#            format="json"
#        )
#
#        # Bob's pending list shows Alice
#        self.client.force_authenticate(user=self.bob)
#        response = self.client.get(reverse("friend_requests"))
#        self.assertEqual(response.status_code, status.HTTP_200_OK)
#        self.assertEqual(len(response.data), 1)
#        self.assertEqual(response.data[0]["from_user"], "alice")
#
#        # Charlie's pending list shows Alice
#        self.client.force_authenticate(user=self.charlie)
#        response = self.client.get(reverse("friend_requests"))
#        self.assertEqual(response.status_code, status.HTTP_200_OK)
#        self.assertEqual(len(response.data), 1)
#        self.assertEqual(response.data[0]["from_user"], "alice")
#
#    def test_send_request_to_user_who_already_declined(self):
#        """Send request → decline → send again → should work (new request)"""
#        # Alice sends request to Bob
#        self.client.force_authenticate(user=self.alice)
#        response = self.client.post(
#            reverse("send_friend_request"),
#            {"username": "bob"},
#            format="json"
#        )
#        request_id = response.data["id"]
#
#        # Bob declines
#        self.client.force_authenticate(user=self.bob)
#        self.client.patch(
#            reverse("respond_friend_request", args=[request_id]),
#            {"action": "decline"},
#            format="json"
#        )
#
#        # Alice sends again
#        self.client.force_authenticate(user=self.alice)
#        response = self.client.post(
#            reverse("send_friend_request"),
#            {"username": "bob"},
#            format="json"
#        )
#        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
#        self.assertTrue(FriendRequest.objects.filter(from_user=self.alice, to_user=self.bob).exists())
#
#    def test_remove_friend_removes_from_both_lists(self):
#        """Removing a friend removes from both users' friend lists"""
#        # Make them friends
#        self.alice.friends.add(self.bob)
#        self.bob.friends.add(self.alice)
#
#        # Alice removes Bob
#        self.client.force_authenticate(user=self.alice)
#        response = self.client.delete(
#            reverse("remove_friend", args=[self.bob.pk])
#        )
#        self.assertEqual(response.status_code, status.HTTP_200_OK)
#
#        # Alice's list is empty
#        response = self.client.get(reverse("friend_list"))
#        self.assertEqual(response.status_code, status.HTTP_200_OK)
#        self.assertEqual(response.data["count"], 0)
#
#        # Bob's list is also empty
#        self.client.force_authenticate(user=self.bob)
#        response = self.client.get(reverse("friend_list"))
#        self.assertEqual(response.status_code, status.HTTP_200_OK)
#        self.assertEqual(response.data["count"], 0)
#
#    def test_send_request_to_nonexistent_user(self):
#        """Send friend request to a user that doesn't exist"""
#        self.client.force_authenticate(user=self.alice)
#        response = self.client.post(
#            reverse("send_friend_request"),
#            {"username": "nonexistent"},
#            format="json"
#        )
#        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
#        self.assertEqual(response.data["error"], "User does not exist.")
#
#    def test_friend_request_list_unauthenticated(self):
#        """Unauthenticated user cannot view friend requests"""
#        self.client.force_authenticate(user=None)
#        response = self.client.get(reverse("friend_requests"))
#        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
#
