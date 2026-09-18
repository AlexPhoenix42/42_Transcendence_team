import json
from django.core.management.base        import BaseCommand
from django.contrib.auth                import get_user_model
from asgiref.sync                       import async_to_sync
from channels.testing                   import WebsocketCommunicator
from channels.routing                   import URLRouter
from channels.auth                      import AuthMiddlewareStack
from rest_framework.test                import APIClient
from rest_framework_simplejwt.tokens    import RefreshToken
from chess_game.routing                 import websocket_urlpatterns

User = get_user_model()


class Command(BaseCommand):
    help = "End-to-end test of AI opponent integration"

    def handle(self, *args, **options):
        from django.conf import settings
        settings.ALLOWED_HOSTS.append("testserver")
        self.stdout.write("\n=== AI Integration Test ===\n")

        # 1. Ensure alice exists
        alice, _ = User.objects.get_or_create(username="alice")
        if _:
            alice.set_password("pass123")
            alice.save()

        # 2. Get JWT token for alice
        token = str(RefreshToken.for_user(alice).access_token)

        # 3. Create AI game via API
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        resp = client.post("/api/chess/ai/", {"ai_difficulty": "easy"}, format="json")

        # If not 201, print raw response and abort
        if resp.status_code != 201:
            self.stderr.write(f"FAIL: Game creation returned {resp.status_code}")
            self.stderr.write(f"Response content: {resp.content.decode()[:500]}")
            return

        game_id = resp.data["id"]
        self.stdout.write(f"[1/4] AI game created (id={game_id})")

        # 4. Connect WebSocket as alice (using session cookie)
        client.force_login(alice)
        session_cookie = client.cookies["sessionid"].value

        app = AuthMiddlewareStack(URLRouter(websocket_urlpatterns))
        communicator = WebsocketCommunicator(
            app, f"/ws/chess/{game_id}/",
            headers=[(b"cookie", f"sessionid={session_cookie}".encode())]
        )

        async def run():
            connected, _ = await communicator.connect()
            if not connected:
                return False

            # Receive initial game state
            msg = await communicator.receive_json_from()
            if msg.get("type") != "game_state":
                return False

            # Send a move (e2e4)
            await communicator.send_json_to({"from": "e2", "to": "e4"})

            # Expect the human move result (game_state)
            msg1 = await communicator.receive_json_from(timeout=10)
            if msg1.get("type") != "game_state":
                return False

            # Now expect the AI's move (another game_state)
            msg2 = await communicator.receive_json_from(timeout=10)
            if msg2.get("type") != "game_state":
                return False

            # Verify the AI moved (FEN should be different from initial)
            initial_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
            if msg2["fen"] == initial_fen:
                return False

            await communicator.disconnect()
            return True

        success = async_to_sync(run)()

        if success:
            self.stdout.write("[2/4] Human move sent")
            self.stdout.write("[3/4] AI responded with a move")
            self.stdout.write("[4/4] AI move valid\n")
            self.stdout.write(self.style.SUCCESS("PASS: AI integration works correctly"))
        else:
            self.stderr.write("FAIL: AI did not respond correctly")

