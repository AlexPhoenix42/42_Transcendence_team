# friends/views.py

from rest_framework.throttling import UserRateThrottle
from rest_framework.views       import APIView
from rest_framework.response    import Response
from rest_framework             import status
from rest_framework.permissions import IsAuthenticated

from rest_framework.pagination  import PageNumberPagination

from django.db                  import models, transaction, IntegrityError

from .models                    import FriendRequest
from .serializers               import FriendRequestSerializer

from django.contrib.auth        import get_user_model
from typing                     import TYPE_CHECKING

if  TYPE_CHECKING:
    from users.models import User as User
else:
    User = get_user_model()


# ===========================================================================
class FriendListPagination(PageNumberPagination):
    page_size               = 50
    page_size_query_param   = 'page_size'
    max_page_size           = 200
# ===========================================================================


# ===========================================================================
class FriendListView(APIView):
    permission_classes  = [IsAuthenticated]
    pagination_class    = FriendListPagination

    def get(self, request):
        friends     = request.user.friends.order_by('username').all()
        paginator   = self.pagination_class()
        page        = paginator.paginate_queryset(friends, request, view=self)

        if  page is None:
            return Response({"error": "Pagination error"}, status=400)

        data        = [
            {
                "id"        : friend.pk,
                "username"  : friend.username,
                "is_online" : friend.is_online,
            }
            for friend in page
        ]

        return paginator.get_paginated_response(data)
# ===========================================================================


# ===========================================================================
class FriendRequestPagination(PageNumberPagination):
    page_size               = 20
    page_size_query_param   = 'page_size'
    max_page_size           = 100
# ===========================================================================


# ===========================================================================
class FriendRequestListView(APIView):
    permission_classes  = [IsAuthenticated]
    pagination_class    = FriendRequestPagination

    def get(self, request):
        requests    = FriendRequest.objects.filter(
            status=FriendRequest.Status.PENDING
        ).exclude(
            sent_by=request.user
        ).filter(
            models.Q(from_user=request.user) | models.Q(to_user=request.user)
        ).order_by('id')
        paginator   = self.pagination_class()
        page        = paginator.paginate_queryset(requests, request, view=self)
        serializer  = FriendRequestSerializer(page, many=True)

        return paginator.get_paginated_response(serializer.data)
# ===========================================================================


# ===========================================================================
class SentFriendRequestListView(APIView):
    permission_classes  = [IsAuthenticated]
    pagination_class    = FriendRequestPagination

    def get(self, request):
        requests    = FriendRequest.objects.filter(
            sent_by=request.user,
            status=FriendRequest.Status.PENDING,
        ).order_by('id')
        paginator   = self.pagination_class()
        page        = paginator.paginate_queryset(requests, request, view=self)
        serializer  = FriendRequestSerializer(page, many=True)

        return paginator.get_paginated_response(serializer.data)
# ===========================================================================


# ===========================================================================
class CancelFriendRequestView(APIView):
    permission_classes  = [IsAuthenticated]
    throttle_classes    = [UserRateThrottle]

    def delete(self, request, request_id):
        try:
            friend_request = FriendRequest.objects.get(
                pk=request_id,
                sent_by=request.user,
                status=FriendRequest.Status.PENDING,
            )
        except FriendRequest.DoesNotExist:
            return Response(
                {"error": "Friend request not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        friend_request.delete()

        return Response({"status": "Friend request cancelled."})
# ===========================================================================


# ===========================================================================
class SendFriendRequestView(APIView):
    permission_classes  = [IsAuthenticated]
    throttle_classes    = [UserRateThrottle]

    def post(self, request):
        username = request.data.get("username")

        if not username:
            return  Response(
                        {"error": "username is required."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

        try:
            to_user = User.objects.get(username=username)
        except User.DoesNotExist:
            return  Response(
                        {"error": "Cannot send friend request."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

        # cannot send to yourself
        if  to_user == request.user:
            return  Response(
                        {"error": "You cannot send a friend request to yourself."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

        # check if already friends
        if  request.user.friends.filter(pk=to_user.pk).exists():
            return  Response(
                        {"error": "You are already friends."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

        # check if either user has blocked the other
        from chat.models import BlockedUser
        if  BlockedUser.objects.filter(blocker=request.user, blocked=to_user).exists():
            return  Response(
                        {"error": "You have blocked this user."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
        if  BlockedUser.objects.filter(blocker=to_user, blocked=request.user).exists():
            return  Response(
                        {"error": "Cannot send friend request."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

        # Atomically check for any existing pending request in either direction
        try:
            with transaction.atomic():
                # Lock both possible directions to prevent race conditions
                existing = FriendRequest.objects.select_for_update().filter(
                    from_user=request.user,
                    to_user=to_user,
                    status=FriendRequest.Status.PENDING,
                ).exists()

                if  existing:
                    return Response(
                        {"error": "A pending request already pending."},
                        status=status.HTTP_409_CONFLICT,
                    )
                
                existing_reverse = FriendRequest.objects.select_for_update().filter(
                    from_user=to_user,
                    to_user=request.user,
                    status=FriendRequest.Status.PENDING,
                ).exists()

                if  existing_reverse:
                    return Response(
                        {"error": "A pending request already pending."},
                        status=status.HTTP_409_CONFLICT,
                    )

                if  request.user.pk > to_user.pk:
                    from_user, to_user = to_user, request.user
                else:
                    from_user, to_user = request.user, to_user

                friend_request = FriendRequest.objects.create(
                    from_user=from_user,
                    to_user=to_user,
                    sent_by=request.user,
                    status=FriendRequest.Status.PENDING,
                )

        except IntegrityError:
            # Fallback in case of extremely rare race condition
            return Response(
                {"error": "A pending request already pending."},
                status=status.HTTP_409_CONFLICT,
            )

        serializer = FriendRequestSerializer(friend_request)

        return Response(serializer.data, status=status.HTTP_201_CREATED)
# ===========================================================================


# ===========================================================================
class ResponseFriendRequestView(APIView):
    permission_classes  = [IsAuthenticated]
    throttle_classes    = [UserRateThrottle]

    def patch(self, request, request_id):
        try:
            friend_request  = FriendRequest.objects.get(
                pk=request_id,
                status=FriendRequest.Status.PENDING,
            )
        except FriendRequest.DoesNotExist:
            return Response(
                {"error": "Friend request not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Only the recipient (not the sender) can accept/decline
        if  friend_request.sent_by == request.user:
            return Response(
                {"error": "You cannot respond to your own request."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Must be involved in the request
        if  request.user not in [friend_request.from_user, friend_request.to_user]:
            return Response(
                {"error": "Friend request not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        action = request.data.get("action")

        if  action == 'accept':
            with transaction.atomic():
                friend_request.status = FriendRequest.Status.ACCEPTED
                friend_request.save()
                friend_request.from_user.friends.add(friend_request.to_user)
                friend_request.to_user.friends.add(friend_request.from_user)

            return Response({"status": "Friend request accepted."})

        elif action == "decline":
            friend_request.status = FriendRequest.Status.DECLINED
            friend_request.save()
            return Response({"status": "Friend request declined."})

        else:
            return Response(
                {"error": "Invalid action. Use 'accept' or 'decline'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
# ===========================================================================


# ===========================================================================
class RemoveFriendView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, friend_id):
        try:
            friend = User.objects.get(pk=friend_id)
        except User.DoesNotExist:
            return  Response(
                        {"error": "Unable to remove friend."},
                        status=status.HTTP_404_NOT_FOUND,
                    )

        if  not request.user.friends.filter(pk=friend.pk).exists():
            return  Response(
                        {"error": "Unable to remove friend."},
                        status=status.HTTP_404_NOT_FOUND,
                    )

        with transaction.atomic():
            request.user.friends.remove(friend)
            friend.friends.remove(request.user)
            FriendRequest.objects.filter(
                from_user__in=[request.user, friend],
                to_user__in=[request.user, friend],
                status=FriendRequest.Status.ACCEPTED,
            ).update(status=FriendRequest.Status.DECLINED)

        return Response({"status": "Friend removed."})
# ===========================================================================

