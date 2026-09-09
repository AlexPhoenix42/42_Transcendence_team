# tournament/urls.py

from django.urls        import path

#from .views             import (
#    TournamentCancelView, TournamentDeleteView, TournamentForfeitView, TournamentListCreateView, TournamentParticipantListView, TournamentJoinView, TournamentLeaveView, TournamentStartView,
#    MatchResultUpdateView, TournamentDisqualifyView, TournamentMatchListView,
#    MatchStartView, TournamentDetailView,
#)

from .views import (
    TournamentAddAIView, TournamentForfeitView, TournamentListCreateView, TournamentDetailView,
    TournamentParticipantListView, TournamentCancelView, TournamentDeleteView,
    TournamentJoinView, TournamentLeaveView, 
    TournamentStartView, MatchResultUpdateView, TournamentDisqualifyView, TournamentMatchListView, MatchStartView,
)

urlpatterns = [
    path('', TournamentListCreateView.as_view(), name="tournament-list-create"),

    path(
        '<int:tournament_id>/participants/',
        TournamentParticipantListView.as_view(),
        name="tournament-participant-list",
    ),

    path(
        '<int:tournament_id>/join/',
        TournamentJoinView.as_view(),
        name="tournament-join",
    ),

    path(
        '<int:tournament_id>/leave/',
        TournamentLeaveView.as_view(),
        name="tournament-leave",
    ),

    path(
        '<int:tournament_id>/matches/<int:match_id>/start/',
        MatchStartView.as_view(),
        name="tournament-match-start",
    ),

    path(
        '<int:tournament_id>/start/',
        TournamentStartView.as_view(),
        name="tournament-start",
    ),

    path(
        '<int:tournament_id>/matches/<int:match_id>/',
        MatchResultUpdateView.as_view(),
        name="tournament-match-update",
    ),

    path(
        '<int:tournament_id>/forfeit/',
        TournamentForfeitView.as_view(),
        name="tournament-forfeit",
    ),

    path(
        '<int:tournament_id>/disqualify/',
        TournamentDisqualifyView.as_view(),
        name="tournament-disqualify",
    ),

    path(
        '<int:tournament_id>/matches/',
        TournamentMatchListView.as_view(),
        name="tournament-matches-list",
    ),

    path(
        '<int:tournament_id>/',
        TournamentDetailView.as_view(),
        name="tournament-detail"),

    path(
        '<int:tournament_id>/cancel/',
        TournamentCancelView.as_view(),
        name="tournament-cancel",
    ),

    path(
        '<int:tournament_id>/delete/',
        TournamentDeleteView.as_view(),
        name="tournament-delete",
    ),

    path(
        '<int:tournament_id>/add-ai/',
        TournamentAddAIView.as_view(),
        name="tournament-add-ai",
    ),
]

