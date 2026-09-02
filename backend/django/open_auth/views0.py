
#from abc import update_abstractmethods

#from abc import update_abstractmethods
#from inspect import FullArgSpec
#from typing import Counter
#
#from django.core.exceptions import RequestAborted
#from django.db.models.utils import create_namedtuple_class
#from rest_framework.views           import APIView
#from rest_framework.response        import Response
##from rest_framework.generics        import CreateAPIView, RetrieveUpdateAPIView
##from rest_framework.permissions     import AllowAny, IsAuthenticated
#from rest_framework                 import status
#
#from rest_framework_simplejwt.tokens    import AccessToken, RefreshToken
#
#from django.contrib.auth            import base_user, get_user_model
#from django.shortcuts               import redirect
#
#from django.http                    import JsonResponse
#
##from .serializers import RegisterSerializer, ProfileUpdateSerializer, User
#
#import os
#import requests
#
#User = get_user_model()
#
## ==========================================================================
#class OAuthStatusView(APIView):
#    """Check if the current user is authenticated via OAuth."""
#    permission_classes = []
#
#    def get(self, request):
#        if  request.user.is_authenticated:
#            return  Response({
#                        'authenticated'     : True,
#                        'user_id'           : request.user.pk,
#                        'username'          : request.user.username,
#                        'email'             : request.user.email,
#                    })
#        return  Response(
#                    {'authenticated': False},
#                    status=status.HTTP_401_UNAUTHORIZED
#                )
## ==========================================================================
#
## ==========================================================================
#def forty_two_login(request):
#    """Redirect to 42 OAuth login page."""
#    client_id       = os.environ['FT_CLIENT_ID']
#    redirect_uri    = os.environ['FT_REDIRECT_URI'] 
#
#    if  not client_id or not redirect_uri:
#        # handle missing creditials
#        return  Response(
#                    {"error": "OAauth credentials not configured."},
#                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
#                )
#
#    auth_url = (
#        f"https://api.intra.42.fr/oauth/authorize?"
#        f"client_id={client_id}&"
#        f"redirect_uri={redirect_uri}&"
#        f"response_type=code"
#    )
#    return redirect(auth_url)
#    #return redirect('/accounts/forty_two/login/')
## ==========================================================================
#
#
## ==========================================================================
#def forty_two_callback(request):
#    """Handle 42 OAuth callback and authenticate user."""
#    code = request.GET.get('code')
#    if  not code:
#        return  JsonResponse(
#                    {"error": "Authorization code not found."},
#                    status= 400,
#                )
#    return redirect(f"http://localhost:3000/auth/callback?code={code}")
## ==========================================================================
#
#
#
## This goes with option B:
## ==========================================================================
#class OAuthProviderView(APIView):
#    permission_classes = []
#
#    def get(self, request):
#        return  Response({
#                    'provider'      : 42,
#                    'login_url'     : '/api/auth/42/login/',
#                    'exchange_url'  : '/api/auth/42/exchange/',
#                })
## ==========================================================================
#
#
#
## ==========================================================================
#class ExchangeCodeView(APIView):
#    """Exchange OAuth code for JWT tokens."""
#    permission_classes = []
#
#    def post(self, request):
#        print("=== ExchangeCodeView called ===")
#        print("Request data:", request.data)
#        code = request.data.get('code')
#        if  not code:
#            return  Response(
#                        {"error": "Authorization code required."},
#                        status=status.HTTP_400_BAD_REQUEST,
#                    )
#
#        # Exchange code for access token (same as before)
#        client_id       = os.environ['FT_CLIENT_ID']
#        client_secret   = os.environ['FT_CLIENT_SECRET']
#        redirect_uri    = os.environ['FT_REDIRECT_URI']
#
#        token_response  = requests.post(
#            "https://api.intra.42.fr/oauth/token",
#            data={
#                "grant_type"        : "authorization_code",
#                "client_id"         : client_id,
#                "client_secret"     : client_secret,
#                "redirect_uri"      : redirect_uri,
#                "code"              : code,
#
#            }
#        )
#
#        print("Token response status:", token_response.status_code)
#        print("Token response body:", token_response.text)
#        if  token_response.status_code != 200:
#            return  Response(
#                        {"error": "Failed to obtain access token."},
#                        status=status.HTTP_400_BAD_REQUEST,
#                    )
#
#        access_token    = token_response.json().get("access_token")
#
#        user_response   = requests.get(
#            "https://api.intra.42.fr/v2/me",
#            headers={"Authorization": f"Bearer {access_token}"},
#        )
#
#        print("Token response status:", token_response.status_code)
#        print("Token response body:", token_response.text)
#        if  user_response.status_code != 200:
#            return  Response(
#                        {"error": "Failed to fetch user data from 42."},
#                        status=status.HTTP_400_BAD_REQUEST,
#                    )
#
#        user_data   = user_response.json()
#        intra_id    = user_data.get("id")
#        username    = user_data.get("login")
#        email       = user_data.get("email")
#        dispname   = user_data.get("displayname")
#
#
#        # --- core logic stats here ----
#        # ============================================================
#        # Step 1: Check by intra_id
#        # ============================================================
#        try:
#            user    = User.objects.get(intra_id=intra_id)
#            updated = False
#            if  user.email  != email:
#                user.email  = email
#                updated     = True
#
#            if  not user.dispname:
#                user.dispname  = dispname or username
#                updated         = True
#
#            if  updated:
#                user.save()
#
#            #refresh     = RefreshToken.for_user(user)
#            #frontend_redirect   = f"http://localhost:9000?access={str(refresh.access_token)}&refresh={str(refresh)}"
#            #return  redirect(frontend_redirect)
#
#            refresh     = RefreshToken.for_user(user)
#            return  Response({
#                "access"        : str(refresh.access_token),
#                "refresh"       : str(refresh),
#                "user"          : {
#                    "id"        : user.pk,
#                    "username"  : user.username,
#                    "email"     : user.email,
#                }
#                    })
#
#        except User.DoesNotExist:
#            pass
#
#        # ============================================================
#        # Step 2: Check by email
#        # ============================================================
#        if  User.objects.filter(email=email).exists():
#            #frontend_redirect = (
#            #    f"http://localhost:9000?status=email_conflict"
#            #    f"&email={email}&username={username}&provider=42"
#            #)
#            #return  redirect(frontend_redirect)
#            return  Response(
#                        {
#                            "status"    : "email_conflict",
#                            "email"     : email,
#                            "username"  : username,
#                        },
#                        status=status.HTTP_409_CONFLICT,
#                    )
#
#        # ============================================================
#        # Step 3: Check by username
#        # ============================================================
#        if  User.objects.filter(username=username).exists():
#            #frontend_redirect = (
#            #    f"http://localhost:9000?status=username_conflict"
#            #    f"&username={username}&email={email}&provider=42"
#            #)
#            #return  redirect(frontend_redirect)
#            return  Response(
#                        {
#                            "status"    : "username_conflict",
#                            "email"     : email,
#                            "username"  : username,
#                        },
#                        status=status.HTTP_409_CONFLICT,
#                    )
#
#        # ============================================================
#        # Step 4: No conflicts → create new user
#        # ============================================================
#        user    = User.objects.create(
#            intra_id=intra_id,
#            username=username,
#            email=email,
#            dispname=dispname or username,
#        )
#
#        #try:
#        #    user = User.objects.get(intra_id=intra_id)
#        #except User.DoesNotExist:
#        #    return  Response(
#        #                {"error": "User not found."},
#        #                status=status.HTTP_404_NOT_FOUND,
#        #            )
#
#        #refresh = RefreshToken.for_user(user)
#        #return  Response({
#        #            "access"    : str(refresh.access_token),
#        #            "refresh"   : str(refresh),
#        #            "user"      : {
#        #                "id"        : user.pk,
#        #                "username"  : user.username,
#        #                "email"     : user.email,   
#        #            }
#        #        })
#        refresh = RefreshToken.for_user(user)
#        return  Response({
#            "access"    : str(refresh.access_token),
#            "refresh"   : str(refresh),
#            "user"      : {
#                "id"        : user.pk,
#                "username"  : user.username,
#                "email"     : user.email,
#            }
#                })
## ==========================================================================
#
## Google OAuth
#
## ==========================================================================
#def google_login(request):
#    """Redirect to Google AOuth login page."""
#    client_id       = os.environ['GOOGLE_CLIENT_ID']
#    redirect_uri    = os.environ['GOOGLE_REDIRECT_URI']
#
#    # user the same redirect_uri you registred in Google Cloud Console
#    auth_url = (
#        f"https://accounts.google.com/o/oauth2/v2/auth?"
#        f"client_id={client_id}&"
#        f"redirect_uri={redirect_uri}&"
#        f"response_type=code&"
#        f"scope=email+profile&"
#        f"access_type=online"
#    )
#    return redirect(auth_url)
## ==========================================================================
#
#
#
## ==========================================================================
#def google_callback(request):
#    """Handle Google OAuth callback."""
#    code = request.GET.get('code')
#    if  not code:
#        return  JsonResponse(
#                    {"error": "Authorization code not found."}, status=400)
#
#    # Redirect to frontend with code (like 42)
#    return redirect(
#            f"http://localhost:3000/auth/callback?code={code}&provider=google")
## ==========================================================================
#
#
#
## ==========================================================================
#class GoogleExchangeCodeView(APIView):
#    """Exchange Google AOuth code for JWT tokens."""
#    permission_classes = []
#
#    def post(self, request):
#        code = request.data.get('code')
#        if  not code:
#            return  Response(
#                        {"error": "Authorization code required."}, 
#                        status=status.HTTP_400_BAD_REQUEST
#                    )
#
#        client_id       = os.environ['GOOGLE_CLIENT_ID']
#        client_secret   = os.environ['GOOGLE_CLIENT_SECRET']
#        redirect_uri    = os.environ['GOOGLE_REDIRECT_URI']
#
#        # Exchange code for access token
#        token_response = requests.post(
#            "https://oauth2.googleapis.com/token",
#            data={
#                "grant_type"    : "authorization_code",
#                "client_id"     : client_id,
#                "client_secret" : client_secret,
#                "redirect_uri"  : redirect_uri,
#                "code"          : code,
#            }
#        )
#
#        if  token_response.status_code != 200:
#            return  Response(
#                        {"error": "Failed to obtain access token."},
#                        status=status.HTTP_400_BAD_REQUEST
#                    )
#
#        access_token    = token_response.json().get("access_token")
#
#        # Fetch user info from Google
#        user_response = requests.get(
#            "https://www.googleapis.com/oauth2/v2/userinfo",
#            headers={"Authorization": f"Bearer {access_token}"},
#        )
#
#        if  user_response.status_code != 200:
#            return  Response(
#                        {"error": "Failed to fetch user data from Google."},
#                        status=status.HTTP_400_BAD_REQUEST
#                    )
#
#        user_data   = user_response.json()
#        google_id   = user_data.get("id")
#        email       = user_data.get("email")
#        username    = user_data.get("email").split('@')[0] # Google doesnt provide a separat login
#        dispname   = user_data.get("name", username)
#        # Optionally use 'name' or 'given_name' from user_data
#
#        if  not email:
#            return  Response(
#                        {"error": "Email not provided by Google."},
#                        status=status.HTTP_400_BAD_REQUEST
#                    )
#
#        # -- Core logic: find or create user ---
#        # Step 1: Check if user exists by email
#        try:
#            user = User.objects.get(email=email)
#            # User exists: update if needed (optional)
#            # Generate JWT and return
#            refresh = RefreshToken.for_user(user)
#            return  Response({
#                "access"    : str(refresh.access_token),
#                "refresh"   : str(refresh),
#                "user"      : {
#                    "id"    : user.pk,
#                    "username"  : user.username,
#                    "email"     : user.email,
#                }
#            })
#        except  User.DoesNotExist:
#            pass
#
#        # Step 2: check if username exists (conflict)
#        if  User.objects.filter(username=username).exists():
#            # Append a suffix to make it unique
#            base_username   = username
#            counter         = 1
#            while User.objects.filter(username=username).exists():
#                username    = f"{base_username}{counter}"
#                counter     += 1
#
#        # Step 3: Create new user
#        user = User.objects.create(
#            username=username,
#            email=email,
#            dispname=dispname,
#            # optionally set dispname from user_data.get('name')
#        )
#
#        refresh = RefreshToken.for_user(user)
#        return  Response({
#                    "access"    : str(refresh.access_token),
#                    "refresh"   : str(refresh),
#                    "user"      : {
#                        "id"        : user.pk,
#                        "username"  : user.username,
#                        "email"    : user.email,
#                    }
#                })
## ==========================================================================

    

















# ==========================================================================
# new-update but doesnt work because the 'code exchange should not happen here'
# ==========================================================================
#def forty_two_callback(request):
#    """Handle 42 OAuth callback and authenticate user."""
#    code = request.GET.get('code')
#    if  not code:
#        return  JsonResponse(
#                    {"error": "Authorization code not found."},
#                    status=400,
#                )
#
#    # Exchange code for access token
#    client_id       = os.environ['FT_CLIENT_ID']
#    client_secret   = os.environ['FT_CLIENT_SECRET']
#    redirect_uri    = os.environ['FT_REDIRECT_URI']
#
#    if  not client_id or not client_secret or not redirect_uri:
#        return  JsonResponse(
#                    {"error": "OAuth credentials not configured."},
#                    status=500,
#                )
#
#    token_response = requests.post(
#        "https://api.intra.42.fr/oauth/token",
#        data={
#            "grant_type"        : "authorization_code",
#            "client_id"         : client_id,
#            "client_secret"     : client_secret,
#            "redirect_uri"      : redirect_uri,
#            "code"              : code,
#        }
#    )
#
#    if  token_response.status_code != 200:
#        return  JsonResponse(
#                    {"error": "Failed to obtain access token."},
#                    status=400,
#                )
#
#    access_token    = token_response.json().get("access_token")
#
#    user_response   = requests.get(
#        "https://api.intra.42.fr/v2/me",
#        headers={"Authorization": f"Bearer {access_token}"},
#    )
#
#    if  user_response.status_code != 200:
#        return  JsonResponse(
#                    {"error": "Failed to fetch user data from 42."},
#                    status=400,
#                )
#
#    user_data       = user_response.json()
#
#    intra_id        = user_data.get("id")
#    username        = user_data.get("login")
#    email           = user_data.get("email")
#    dispname       = user_data.get("displayname")
#
#    if  not intra_id:
#        return  JsonResponse(
#                    {"error": "Invalid user data from 42."},
#                    status=400,
#                )
#
#    # --- core logic stats here ----
#    # ============================================================
#    # Step 1: Check by intra_id
#    # ============================================================
#    try:
#        user    = User.objects.get(intra_id=intra_id)
#        updated = False
#        if  user.email  != email:
#            user.email  = email
#            updated     = True
#
#        if  not user.dispname:
#            user.dispname  = dispname or username
#            updated         = True
#
#        if  updated:
#            user.save()
#        refresh     = RefreshToken.for_user(user)
#        frontend_redirect   = f"http://localhost:9000?access={str(refresh.access_token)}&refresh={str(refresh)}"
#
#        return  redirect(frontend_redirect)
#
#    except User.DoesNotExist:
#        pass
#
#    # ============================================================
#    # Step 2: Check by email
#    # ============================================================
#    if  User.objects.filter(email=email).exists():
#        frontend_redirect = (
#            f"http://localhost:9000?status=email_conflict"
#            f"&email={email}&username={username}&provider=42"
#        )
#        return  redirect(frontend_redirect)
#
#    # ============================================================
#    # Step 3: Check by username
#    # ============================================================
#    if  User.objects.filter(username=username).exists():
#        frontend_redirect = (
#            f"http://localhost:9000?status=username_conflict"
#            f"&username={username}&email={email}&provider=42"
#        )
#        return  redirect(frontend_redirect)
#
#    # ============================================================
#    # Step 4: No conflicts → create new user
#    # ============================================================
#    user    = User.objects.create(
#        intra_id=intra_id,
#        username=username,
#        email=email,
#        dispname=dispname or username,
#    )
#
#    # ============================================================
#    # SECURITY NOTE: Option A — Tokens in URL (Development Only)
#    # ============================================================
#    # Tokens are passed via URL parameters. This is acceptable for
#    # development but exposes tokens in browser history, referer
#    # headers, and server logs.
#    #
#    # PRODUCTION OPTIONS:
#    #   Option B: Redirect with code → Frontend exchanges code for tokens
#    #   Option C: Set secure HTTP-only session cookie → Redirect
#    # ============================================================
#
#    # ============================================================
#    # Option B: Redirect with code (more secure)
#    # ============================================================
#    # Frontend receives the code and calls an endpoint to exchange
#    # it for tokens. This prevents tokens from being exposed in URLs.
#    #
#    # frontend_redirect = f"http://localhost:3000/auth/callback?code={code}"
#    # return redirect(frontend_redirect)
#    #
#    # Then frontend calls:
#    # POST /api/open_auth/exchange/
#    # Body: { "code": "..." }
#    # Response: { "access": "...", "refresh": "..." }
#    # ============================================================
#
#    # Option A: Tokens in URL (Development Only)
#    #refresh             = RefreshToken.for_user(user)
#    #frontend_redirect   = f"http://localhost:9000?access={str(refresh.access_token)}&refresh={str(refresh)}"
#
#    # Option B: more secure:
#    frontend_redirect   = f"http://localhost:9000/auth/callback?code={code}&status=login"
#
#    return  redirect(frontend_redirect)
# ==========================================================================


# ==========================================================================
#def forty_two_callback(request):
#    """Handle 42 OAuth callback and authenticate user."""
#    code = request.GET.get('code')
#    if  not code:
#        return  Response(
#                    {"error": "Authorization code not found."},
#                    status=status.HTTP_400_BAD_REQUEST,
#                )
#
#    # Exchange code for access token
#    client_id       = os.environ['FT_CLIENT_ID']
#    client_secret   = os.environ['FT_CLIENT_SECRET']
#    redirect_uri    = os.environ['FT_REDIRECT_URI']
#
#    if  not client_id or not client_secret or not redirect_uri:
#        return  Response(
#                    {"error": "OAuth credentials not configured."},
#                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
#                )
#
#    token_response = requests.post(
#        "https://api.intra.42.fr/oauth/token",
#        data={
#            "grant_type"        : "authorization_code",
#            "client_id"         : client_id,
#            "client_secret"     : client_secret,
#            "redirect_uri"      : redirect_uri,
#            "code"              : code,
#        }
#    )
#
#    if  token_response.status_code != 200:
#        return  Response(
#                    {"error": "Failed to obtain access token."},
#                    status=status.HTTP_400_BAD_REQUEST,
#                )
#
#    access_token    = token_response.json().get("access_token")
#
#    user_response   = requests.get(
#        "https://api.intra.42.fr/v2/me",
#        headers={"Authorization": f"Bearer {access_token}"},
#    )
#
#    if  user_response.status_code != 200:
#        return  Response(
#                    {"error": "Failed to fetch user data from 42."},
#                    status=status.HTTP_400_BAD_REQUEST,
#                )
#
#    user_data       = user_response.json()
#
#    intra_id        = user_data.get("id")
#    username        = user_data.get("login")
#    email           = user_data.get("email")
#    dispname       = user_data.get("displayname")
#
#    if  not intra_id:
#        return  Response(
#                    {"error": "Invalid user data from 42."},
#                    status=status.HTTP_400_BAD_REQUEST,
#                )
#
#    # --- core logic stats here ----
#    # ============================================================
#    # Step 1: Check by intra_id
#    # ============================================================
#    try:
#        user    = User.objects.get(intra_id=intra_id)
#        updated = False
#        if  user.email  != email:
#            user.email  = email
#            updated     = True
#
#        if  not user.dispname:
#            user.dispname  = dispname or username
#            updated         = True
#
#        if  updated:
#            user.save()
#        refresh     = RefreshToken.for_user(user)
#        frontend_redirect   = f"http://localhost:9000?access={str(refresh.access_token)}&refresh={str(refresh)}"
#
#        return  redirect(frontend_redirect)
#
#    except User.DoesNotExist:
#        pass
#
#    # ============================================================
#    # Step 2: Check by email
#    # ============================================================
#    if  User.objects.filter(email=email).exists():
#        frontend_redirect = (
#            f"http://localhost:9000?status=email_conflict"
#            f"&email={email}&username={username}&provider=42"
#        )
#        return  redirect(frontend_redirect)
#
#    # ============================================================
#    # Step 3: Check by username
#    # ============================================================
#    if  User.objects.filter(username=username).exists():
#        frontend_redirect = (
#            f"http://localhost:9000?status=username_conflict"
#            f"&username={username}&email={email}&provider=42"
#        )
#        return  redirect(frontend_redirect)
#
#    # ============================================================
#    # Step 4: No conflicts → create new user
#    # ============================================================
#    user    = User.objects.create(
#        intra_id=intra_id,
#        username=username,
#        email=email,
#        dispname=dispname or username,
#    )
#
#    # ============================================================
#    # SECURITY NOTE: Option A — Tokens in URL (Development Only)
#    # ============================================================
#    # Tokens are passed via URL parameters. This is acceptable for
#    # development but exposes tokens in browser history, referer
#    # headers, and server logs.
#    #
#    # PRODUCTION OPTIONS:
#    #   Option B: Redirect with code → Frontend exchanges code for tokens
#    #   Option C: Set secure HTTP-only session cookie → Redirect
#    # ============================================================
#
#    # ============================================================
#    # Option B: Redirect with code (more secure)
#    # ============================================================
#    # Frontend receives the code and calls an endpoint to exchange
#    # it for tokens. This prevents tokens from being exposed in URLs.
#    #
#    # frontend_redirect = f"http://localhost:3000/auth/callback?code={code}"
#    # return redirect(frontend_redirect)
#    #
#    # Then frontend calls:
#    # POST /api/open_auth/exchange/
#    # Body: { "code": "..." }
#    # Response: { "access": "...", "refresh": "..." }
#    # ============================================================
#
#    # Option A: Tokens in URL (Development Only)
#    refresh             = RefreshToken.for_user(user)
#    frontend_redirect   = f"http://localhost:9000?access={str(refresh.access_token)}&refresh={str(refresh)}"
#
#    return  redirect(frontend_redirect)
# ==========================================================================

















# ==========================================================================
#def forty_two_callback(request):
#    """Handle 42 OAuth callback and authenticate user."""
#    code = request.GET.get('code')
#    if  not code:
#        return  Response(
#                    {"error": "Authorization code not found."},
#                    status=status.HTTP_400_BAD_REQUEST,
#                )
#
#    # Exchange code for access token
#    client_id       = os.environ['FT_CLIENT_ID']
#    client_secret   = os.environ['FT_CLIENT_SECRET']
#    redirect_uri    = os.environ['FT_REDIRECT_URI']
#
#    if  not client_id or not client_secret or not redirect_uri:
#        return  Response(
#                    {"error": "OAuth credentials not configured."},
#                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
#                )
#
#    token_response  = requests.post(
#        "https://api.intra.42.fr/oauth/token",
#        data={
#            "grant_type"    : "authorization_code",
#            "client_id"     : client_id,
#            "client_secret" : client_secret,
#            "redirect_uri"  : redirect_uri,
#            "code"          : code,
#        }
#    )
#
#    if  token_response.status_code != 200:
#        return  Response(
#                    {"error": "Failed to obtain access token."},
#                    status=status.HTTP_400_BAD_REQUEST,
#                )
#
#    access_token = token_response.json().get("access_token")
#
#    # Fetch user data from 42 API
#    user_response = requests.get(
#        "https://api.intra.42.fr/v2/me",
#        headers={"Authorization": f"Bearer {access_token}"}
#    )
#
#    if  user_response.status_code != 200:
#        return  Response(
#                    {"error": "Failed to fetch user data from 42."},
#                    status=status.HTTP_400_BAD_REQUEST,
#                )
#
#    user_data = user_response.json()
#
#    # Create or update local user
#    intra_id    = user_data.get("id")
#    username    = user_data.get("login")
#    email       = user_data.get("email")
#    dispname   = user_data.get("displayname")
#
#    if  not intra_id:
#        return  Response(
#                    {"error": "Invalid user data from 42."},
#                    status=status.HTTP_400_BAD_REQUEST,
#                )
#
#    # ========================== buged code ================================
#    ## Create or get user
#    #user, created = User.objects.get_or_create(
#    #    intra_id=intra_id,
#    #    defaults={
#    #        "username"  : username,
#    #        "email"     : email,
#    #        "dispname" : dispname or username,
#    #    }
#    #)
#
#    ## Update username and email if changed (dispname is user-editable)
#    ## If user already exists, update their info
#    #if  not created:
#    #    updated = False
#    #    if  user.username   != username:    # pyright: ignore[reportAttributeAccessIssue]
#    #        user.username   = username      # pyright: ignore[reportAttributeAccessIssue]
#    #        updated         = True
#
#    #    if  user.email      != email:       # pyright: ignore[reportAttributeAccessIssue]
#    #        user.email      = email         # pyright: ignore[reportAttributeAccessIssue]
#    #        updated         = True
#
#    #    if  updated:
#    #        user.save()
#    # ========================== buged code ================================
#
#    # create or update local user:
#    # Case 1: user already has intra_id -> update:
#    try:
#        user    = User.objects.get(intra_id=intra_id)
#        created = False
#        updated = False
#        if  user.username   != username:
#            user.username   = username
#            updated         = True
#
#        if  user.email      != email:
#            user.email      = email
#            updated         = True
#
#        # dispname is Not AUTO-UPDATED (user-editable)
#        if  updated:
#            user.save()
#    # Case 2: user not found -> create new
#    except User.DoesNotExist:
#        user    = User.objects.create(
#            intra_id=intra_id,
#            username=username,
#            email=email,
#            dispname=dispname or username,
#        )
#
#    # Generate JWT tokens
#    refresh         = RefreshToken.for_user(user)
#    access          = str(refresh.access_token)
#    refresh_token   = str(refresh)
#
#    # ============================================================
#    # SECURITY NOTE: Option A — Tokens in URL (Development Only)
#    # ============================================================
#    # Tokens are passed via URL parameters. This is acceptable for
#    # development but exposes tokens in browser history, referer
#    # headers, and server logs.
#    #
#    # PRODUCTION OPTIONS:
#    #   Option B: Redirect with code → Frontend exchanges code for tokens
#    #   Option C: Set secure HTTP-only session cookie → Redirect
#    # ============================================================
#
#    # ============================================================
#    # Option B: Redirect with code (more secure)
#    # ============================================================
#    # Frontend receives the code and calls an endpoint to exchange
#    # it for tokens. This prevents tokens from being exposed in URLs.
#    #
#    # frontend_redirect = f"http://localhost:3000/auth/callback?code={code}"
#    # return redirect(frontend_redirect)
#    #
#    # Then frontend calls:
#    # POST /api/open_auth/exchange/
#    # Body: { "code": "..." }
#    # Response: { "access": "...", "refresh": "..." }
#    # ============================================================
#
#    # Option A: Tokens in URL (Development Only)
#    frontend_redirect = f"http://localhost:9000?access={access}&refresh={refresh_token}"
#
#    return redirect(frontend_redirect)
# ==========================================================================


# ==========================================================================
#class OAuthStatusView(APIView):
#    """Check if the current user is authenticated via OAuth."""
#    permission_classes = []
#
#    def get(self, request):
#        if  request.user.is_authenticated:
#            return  Response({
#                        'authenticated'     : True,
#                        'user_id'           : request.user.pk,
#                        'username'          : request.user.username,
#                        'email'             : request.user.email,
#                    })
#        return  Response(
#                    {'authenticated': False},
#                    status=status.HTTP_401_UNAUTHORIZED
#                )
# ==========================================================================


# This goes with option A:
# ==========================================================================
#class OAuthProviderView(APIView):
#    """Get OAuth provider information."""
#    permission_classes = []
#
#    def get(self, request):
#        return  Response({
#                    'provider'  : 42,
#                    'login_url' : '/api/open_auth/login/',
#                })
# ==========================================================================









#from rest_framework.views import APIView
#from rest_framework.response import Response
#from rest_framework import status
#from rest_framework_simplejwt.tokens import RefreshToken
#from django.contrib.auth import get_user_model
#
#User = get_user_model()
#
#
#class ExchangeCodeView(APIView):
#    """Exchange OAuth code for JWT tokens."""
#    permission_classes = []
#
#    def post(self, request):
#        code = request.data.get('code')
#        if not code:
#            return Response(
#                {"error": "Authorization code required."},
#                status=status.HTTP_400_BAD_REQUEST,
#            )
#
#        # Exchange code for access token (same as before)
#        client_id = os.environ.get('FT_CLIENT_ID')
#        client_secret = os.environ.get('FT_CLIENT_SECRET')
#        redirect_uri = os.environ.get('FT_REDIRECT_URI')
#
#        token_response = requests.post(
#            "https://api.intra.42.fr/oauth/token",
#            data={
#                "grant_type": "authorization_code",
#                "client_id": client_id,
#                "client_secret": client_secret,
#                "redirect_uri": redirect_uri,
#                "code": code,
#            }
#        )
#
#        if token_response.status_code != 200:
#            return Response(
#                {"error": "Failed to obtain access token."},
#                status=status.HTTP_400_BAD_REQUEST,
#            )
#
#        access_token = token_response.json().get("access_token")
#
#        user_response = requests.get(
#            "https://api.intra.42.fr/v2/me",
#            headers={"Authorization": f"Bearer {access_token}"},
#        )
#
#        if user_response.status_code != 200:
#            return Response(
#                {"error": "Failed to fetch user data from 42."},
#                status=status.HTTP_400_BAD_REQUEST,
#            )
#
#        user_data = user_response.json()
#        intra_id = user_data.get("id")
#
#        try:
#            user = User.objects.get(intra_id=intra_id)
#        except User.DoesNotExist:
#            return Response(
#                {"error": "User not found."},
#                status=status.HTTP_404_NOT_FOUND,
#            )
#
#        refresh = RefreshToken.for_user(user)
#        return Response({
#            "access": str(refresh.access_token),
#            "refresh": str(refresh),
#            "user": {
#                "id": user.id,
#                "username": user.username,
#                "email": user.email,
#            }
#        })
#


