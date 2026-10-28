# django/chess_game/internal_views.py 

from rest_framework.views       import APIView
from rest_framework.response    import Response
from rest_framework.permissions import AllowAny
from .models                    import Game

import logging
logger = logging.getLogger(__name__)

class GameFinishedNotify(APIView):
    """Internal endpoint called by the timeout checker to trigger post_save signals."""
    permission_classes  = [AllowAny]
    authentication_classes = []


    def post(self, request):
        logger.error("INTERNAL NOTIFY: host=%s remote=%s data=%s", 
                     request.get_host(), request.META.get("REMOTE_ADDR"), request.data)
        
        remote = request.META.get("REMOTE_ADDR", "")
        if not remote.startswith("172."):
            return Response({"error": "Forbidden"}, status=403)

        game_id = request.data.get("game_id")
        if not game_id:
            return Response({"error": "game_id required"}, status=400)

        try:
            game = Game.objects.get(pk=game_id)
            game.save(update_fields=["status", "winner", "result_reason"])
            return Response({"status": "ok"})
        except Game.DoesNotExist:
            return Response({"error": "Game not found"}, status=404)
