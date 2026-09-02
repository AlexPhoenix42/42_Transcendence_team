# chat/urls.py

from django.urls        import path

from .views             import MessageListView, RoomDMResolveView, RoomResolveView, RoomTournamentResolveView

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
    )
]

