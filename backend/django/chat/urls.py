# chat/urls.py

from django.urls        import path

from .views import (
    MessageListView, RoomDMResolveView, RoomGameResolveView,
    RoomResolveView, RoomTournamentResolveView,
    BlockUserView, UnblockUserView, BlockedListView,
    MarkReadView, UnreadCountsView, RoomReadStatusView,
    DeleteMessageView, MuteUserView, UnmuteUserView,
)

urlpatterns = [
    path(
        'rooms/<int:room_id>/messages/',
        MessageListView.as_view(),
        name="chat-message-List",
    ),

    path(
        'rooms/global/',
        RoomResolveView.as_view(),
        name="chat-global-room",
    ),


    path(
        'rooms/tournament/<int:tournament_id>/',
        RoomTournamentResolveView.as_view(),
        name="chat-tournament-room",
    ),

    path(
        'rooms/dm/<int:user_id>/',
        RoomDMResolveView.as_view(),
        name="chat-dm-room",
    ),

    path(
        'rooms/game/<int:game_id>/',
        RoomGameResolveView.as_view(),
        name="chat-game-room",
    ),

    path(
        'block/<int:user_id>/',
        BlockUserView.as_view(),
        name="block-user",
    ),

    path(
        'unblock/<int:user_id>/',
        UnblockUserView.as_view(),
        name="unblock-user",
    ),

    path(
        'blocked/',
        BlockedListView.as_view(),
        name="blocked-list"
    ),

    path(
        'rooms/<int:room_id>/read/',
        MarkReadView.as_view(),
        name="mark-read"
    ),

    path(
        'unread/',
        UnreadCountsView.as_view(),
        name="unread-counts"
    ),

    path(
        'rooms/<int:room_id>/read-status/', 
        RoomReadStatusView.as_view(),
        name="room-read-status",

    ),

    path(
        'messages/<int:message_id>/delete/',
        DeleteMessageView.as_view(),
        name="delete-message"
    ),

    path(
        'mute/',
        MuteUserView.as_view(),
        name="mute-user"
    ),

    path(
        'unmute/',
        UnmuteUserView.as_view(),
        name="unmute-user"
    ),
]

