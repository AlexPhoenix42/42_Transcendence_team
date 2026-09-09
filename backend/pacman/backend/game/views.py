from django.shortcuts import render
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q
from .models import GameRoom, Player, GameState, Friendship, PlayerProfile, MatchResult
from .serializers import (
    GameRoomSerializer, PlayerSerializer, GameStateSerializer,
    FriendshipSerializer, PlayerProfileSerializer, MatchResultSerializer,
)
from .room_cleanup import sweep_stale_rooms


class GameRoomViewSet(viewsets.ModelViewSet):
    """API pour gérer les salles de jeu"""
    queryset = GameRoom.objects.all()
    serializer_class = GameRoomSerializer

    def get_queryset(self):
        """Retourne uniquement les salles actives (après nettoyage des salons vides)."""
        sweep_stale_rooms()
        return GameRoom.objects.filter(is_active=True)

    @action(detail=True, methods=['post'])
    def join(self, request, pk=None):
        """Rejoindre une salle"""
        room = self.get_object()
        session_id = request.data.get('session_id')
        nickname = request.data.get('nickname', 'Joueur')

        if not session_id or len(session_id) > 255:
            return Response({'error': 'Session ID invalide'}, status=status.HTTP_400_BAD_REQUEST)

        if len(nickname) > 50:
            nickname = nickname[:50]

        # Créer ou récupérer le profil
        profile, _ = PlayerProfile.objects.get_or_create(nickname=nickname)

        player, created = Player.objects.get_or_create(
            session_id=session_id,
            defaults={'room': room, 'nickname': nickname}
        )

        return Response(PlayerSerializer(player).data)

    @action(detail=True, methods=['get'])
    def players(self, request, pk=None):
        """Liste des joueurs dans la salle"""
        room = self.get_object()
        players = room.players.all()
        return Response(PlayerSerializer(players, many=True).data)

    @action(detail=True, methods=['post'])
    def start_countdown(self, request, pk=None):
        """Démarrer le compte à rebours"""
        room = self.get_object()
        countdown = request.data.get('countdown', 10)

        if countdown < 3 or countdown > 60:
            countdown = 10

        room.countdown_started = True
        room.countdown_value = countdown
        room.save()

        return Response({'countdown': countdown})


class PlayerViewSet(viewsets.ModelViewSet):
    """API pour gérer les joueurs"""
    queryset = Player.objects.all()
    serializer_class = PlayerSerializer

    @action(detail=True, methods=['post'])
    def update_role(self, request, pk=None):
        """Mettre à jour le rôle d'un joueur"""
        player = self.get_object()
        role = request.data.get('role')

        allowed_roles = ['pacman', 'madame_pacman', 'baby', 'builder', 'ghost']
        if role not in allowed_roles:
            return Response({'error': 'Rôle invalide'}, status=status.HTTP_400_BAD_REQUEST)

        player.role = role
        player.save()
        return Response(PlayerSerializer(player).data)

    @action(detail=True, methods=['post'])
    def set_ready(self, request, pk=None):
        """Marquer le joueur comme prêt"""
        player = self.get_object()
        player.is_ready = request.data.get('ready', True)
        player.save()
        return Response(PlayerSerializer(player).data)


class FriendshipViewSet(viewsets.ModelViewSet):
    """API pour gérer les amis"""
    queryset = Friendship.objects.all()
    serializer_class = FriendshipSerializer

    @action(detail=False, methods=['post'])
    def send_request(self, request):
        """Envoyer une demande d'ami"""
        player1 = request.data.get('from_nickname')
        player2 = request.data.get('to_nickname')

        if not player1 or not player2:
            return Response({'error': 'Pseudos manquants'}, status=status.HTTP_400_BAD_REQUEST)

        if player1 == player2:
            return Response({'error': 'Vous ne pouvez pas vous ajouter vous-même'}, status=status.HTTP_400_BAD_REQUEST)

        # Vérifier si la relation existe déjà
        existing = Friendship.objects.filter(
            Q(player1_nickname=player1, player2_nickname=player2) |
            Q(player1_nickname=player2, player2_nickname=player1)
        ).first()

        if existing:
            return Response({'error': 'Demande déjà existante'}, status=status.HTTP_400_BAD_REQUEST)

        friendship = Friendship.objects.create(
            player1_nickname=player1,
            player2_nickname=player2,
            status='pending'
        )

        return Response(FriendshipSerializer(friendship).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        """Accepter une demande d'ami"""
        friendship = self.get_object()
        friendship.status = 'accepted'
        friendship.save()
        return Response(FriendshipSerializer(friendship).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Refuser une demande d'ami"""
        friendship = self.get_object()
        friendship.status = 'rejected'
        friendship.save()
        return Response(FriendshipSerializer(friendship).data)

    @action(detail=False, methods=['get'])
    def my_friends(self, request):
        """Liste des amis d'un joueur"""
        nickname = request.query_params.get('nickname')

        if not nickname:
            return Response({'error': 'Pseudo manquant'}, status=status.HTTP_400_BAD_REQUEST)

        friends = Friendship.objects.filter(
            Q(player1_nickname=nickname) | Q(player2_nickname=nickname),
            status='accepted'
        )

        return Response(FriendshipSerializer(friends, many=True).data)

    @action(detail=False, methods=['get'])
    def pending_requests(self, request):
        """Demandes en attente pour un joueur"""
        nickname = request.query_params.get('nickname')

        if not nickname:
            return Response({'error': 'Pseudo manquant'}, status=status.HTTP_400_BAD_REQUEST)

        requests = Friendship.objects.filter(
            player2_nickname=nickname,
            status='pending'
        )

        return Response(FriendshipSerializer(requests, many=True).data)


class PlayerProfileViewSet(viewsets.ModelViewSet):
    """API pour les profils de joueurs"""
    queryset = PlayerProfile.objects.all()
    serializer_class = PlayerProfileSerializer
    lookup_field = 'nickname'

    @action(detail=False, methods=['get'])
    def search(self, request):
        """Rechercher des joueurs avec minimum de lettres"""
        query = request.query_params.get('q', '')

        if len(query) < 2:
            return Response({'error': 'Minimum 2 caractères'}, status=status.HTTP_400_BAD_REQUEST)

        # Limiter à 20 résultats
        profiles = PlayerProfile.objects.filter(
            nickname__icontains=query
        )[:20]

        return Response(PlayerProfileSerializer(profiles, many=True).data)

    @action(detail=False, methods=['get'])
    def leaderboard(self, request):
        """Classement des meilleurs joueurs"""
        limit = int(request.query_params.get('limit', 10))

        if limit > 100:
            limit = 100

        profiles = PlayerProfile.objects.order_by('-total_score')[:limit]

        return Response(PlayerProfileSerializer(profiles, many=True).data)


class MatchResultViewSet(viewsets.ReadOnlyModelViewSet):
    """Historique des manches terminées. `?player=<pseudo>` / `?room=<nom>` / `?limit`."""
    queryset = MatchResult.objects.all()
    serializer_class = MatchResultSerializer

    def get_queryset(self):
        qs = MatchResult.objects.all()
        room = self.request.query_params.get('room')
        if room:
            qs = qs.filter(room_name=room)
        return qs

    def list(self, request, *args, **kwargs):
        try:
            limit = min(int(request.query_params.get('limit', 50)), 200)
        except ValueError:
            limit = 50
        matches = list(self.get_queryset()[:limit])
        player = request.query_params.get('player')
        if player:
            matches = [
                m for m in matches
                if any(r.get('name') == player for r in m.results)
            ]
        return Response(MatchResultSerializer(matches, many=True).data)
