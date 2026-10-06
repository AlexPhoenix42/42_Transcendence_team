# open_auth/views/login.py

from rest_framework.views   import APIView
from django.shortcuts       import redirect
from ..providers            import get_provider
from ..oauth_config         import oauth_config
from ..oauth_state          import generate_state

class OAuthLoginView(APIView):
    permission_classes = []

    def get(self, request, provider_name):
        # Google OAuth requires .nip.io domain — auto-redirect if needed
        if provider_name == "google":
            from urllib.parse import urlparse
            redirect_uri = oauth_config.get("GOOGLE_REDIRECT_URI", "")
            expected_host = urlparse(redirect_uri).hostname
            request_host = request.get_host().split(":")[0]
            if expected_host and request_host != expected_host:
                port = request.get_host().split(":")[1] if ":" in request.get_host() else "4443"
                return redirect(f"https://{expected_host}:{port}/api/auth/google/login/")

        provider    = get_provider(provider_name)
        state       = generate_state(request, provider_name)
        oauth_url   = provider.get_authorization_url(state)

        return redirect(oauth_url)

