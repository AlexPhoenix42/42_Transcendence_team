# friends/urls.py

from django.urls import path

from friends.views import (
        FriendListView,
        FriendRequestListView,
        SentFriendRequestListView,
        SendFriendRequestView,
        CancelFriendRequestView,
        ResponseFriendRequestView,
        RemoveFriendView,
)

urlpatterns = [
    path
    (
        '',
        FriendListView.as_view(),
        name='friend_list'
    ),

    path
    (
        'requests/',
        FriendRequestListView.as_view(),
        name='friend_requests'
    ),

    path
    (
        'requests/sent/',
        SentFriendRequestListView.as_view(),
        name='sent_friend_requests'
    ),

    path
    (
        'requests/send/',
        SendFriendRequestView.as_view(),
        name='send_friend_request'
    ),

    path
    (
        'requests/<int:request_id>/',
        ResponseFriendRequestView.as_view(),
        name='respond_friend_request'
    ),

    path
    (
        'requests/<int:request_id>/cancel/',
        CancelFriendRequestView.as_view(),
        name='cancel_friend_request'
    ),

    path(
        '<int:friend_id>/',
        RemoveFriendView.as_view(),
        name='remove_friend'
    ),
]

