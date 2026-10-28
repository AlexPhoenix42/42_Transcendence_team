# open_auth/views/callback.py

from rest_framework.views       import APIView
from rest_framework.response    import Response

from django.shortcuts           import redirect
from django.core.cache          import cache

from ..providers                import get_provider

from ..oauth_config             import oauth_config
from ..oauth_state              import check_state

from ..providers.exceptions     import TokenExchangeError, UserInfoError

class OAuthCallbackView(APIView):
    permission_classes = []

    def get(self, request, provider_name):
        provider = get_provider(provider_name)

        # 1. Validate state
        state = request.GET.get("state")
        if  not state or not check_state(request, provider_name, state):
            return  Response({"error": "Invalid state parameter."}, status=400)
    
        # 2. Exchange code
        code = request.GET.get("code")
        if  not code:
            return  Response({"error": "Missing authorization code."}, status=400)

        try:
            access_token = provider.exchange_code(code)
        except TokenExchangeError:
            return  Response({"error": "Token exchange failed."}, status=502)

        # 3. Fetch user info
        try:
            oauth_user = provider.get_user_info(access_token)
        except UserInfoError:
            return  Response({"error": "Failed to fetch user info."}, status=502)

        # 4. resovle or create local user
        from ..user_resolution import (
            resolve_user,
            AuthSuccess,
            EmailConflict,
            UsernameConflict,
            LinkedEmailConflict,
        )

        result = resolve_user(oauth_user, provider_name)

        if  isinstance(result, AuthSuccess):
            import uuid
            login_token = str(uuid.uuid4())
            cache.set(f"login_token:{login_token}", result.user.pk, timeout=60)

            frontend_url = oauth_config['FRONTEND_URL']

            return  redirect(f"{frontend_url}?login_token={login_token}")

        elif isinstance(result, EmailConflict):
            import uuid
            link_token = str(uuid.uuid4())
            cache.set(
                f"link_token:{link_token}",
                {
                    "provider"      : provider_name,
                    "provider_id"   : oauth_user.provider_id,
                    "email"         : oauth_user.email,
                    "username"      : oauth_user.username,
                    "dispname"      : oauth_user.dispname,
                },
                timeout=600,    # 10 minutes
            )

            frontend_url = oauth_config['FRONTEND_URL']
            return  redirect(
                f"{frontend_url}?status=email_conflict"
                f"&email={result.email}"
                f"&link_token={link_token}"
            )

        elif isinstance(result, UsernameConflict):
            import uuid
            resolve_token = str(uuid.uuid4())

            cache.set(
                f"resolve_username:{resolve_token}",
                {
                    "provider"      : provider_name,
                    "provider_id"   : oauth_user.provider_id,
                    "email"         : oauth_user.email,
                    "dispname"      : oauth_user.dispname,
                },
                timeout=600,
            )

            # Token for "log in and link"
            link_token = str(uuid.uuid4())
            cache.set(
                f"link_token:{link_token}",
                {
                    "provider"      : provider_name,
                    "provider_id"   : oauth_user.provider_id,
                    "email"         : oauth_user.email,
                    "username"      : oauth_user.username,
                    "dispname"      : oauth_user.dispname,
                    "conflict_type" : "username",
                },
                timeout=600,
            )

            frontend_url = oauth_config['FRONTEND_URL']

            return redirect(
                f"{frontend_url}?status=username_conflict"
                f"&username={result.username}"
                f"&token={resolve_token}"
                f"&link_token={link_token}"
            )

        elif isinstance(result, LinkedEmailConflict):
            frontend_url = oauth_config['FRONTEND_URL']
            return  redirect(
                f"{frontend_url}?status=linked_email_conflict"
                f"&current_email={result.current_email}"
                f"&new_email={result.new_email}"
            )

