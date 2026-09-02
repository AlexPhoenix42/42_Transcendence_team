Step 5 – **Callback endpoint**

This is the most complex part, so I’ll break it into small, logical pieces. I’ll explain each piece before showing its code, and we’ll write it together one piece at a time. No jumps.

---

### The big picture (no code yet)

The callback endpoint is the URL 42 redirects the user’s browser to after a successful login. The URL looks like:

`/api/auth/42/callback/?code=...&state=...`

The backend must:

1. Validate the `state` (CSRF protection, single‑use).
2. Exchange the `code` for an access token (server‑to‑server).
3. Fetch the user’s info from 42.
4. Find or create the local user (we’ll build this logic separately later; for now we’ll stub it).
5. Generate a temporary `login_token`, store it in cache with the user’s ID.
6. Redirect the browser to the frontend with that `login_token` in the URL.

---

### Piece 1 – The skeleton

We’ll create `views/callback.py` with the minimal structure. It will just validate `state` and exchange the code for now. We’ll add more after you confirm.

```python
from rest_framework.views import APIView
from rest_framework.response import Response
from django.shortcuts import redirect
from django.core.cache import cache
from providers import get_provider
from oauth_state import check_state
from oauth_config import oauth_config
from .exceptions import TokenExchangeError, UserInfoError

class OAuthCallbackView(APIView):
    permission_classes = []

    def get(self, request, provider_name):
        provider = get_provider(provider_name)

        # 1. Validate state
        state = request.GET.get("state")
        if not state or not check_state(request, provider_name, state):
            return Response({"error": "Invalid state parameter"}, status=400)

        # 2. Exchange code
        code = request.GET.get("code")
        if not code:
            return Response({"error": "Missing authorization code"}, status=400)

        try:
            access_token = provider.exchange_code(code)
        except TokenExchangeError:
            return Response({"error": "Token exchange failed"}, status=502)
```

At this point, we have a valid access token. I’ll pause here. Does this first part make sense?

==========================================

---

### Step 5 – Callback endpoint: complete plan

The callback endpoint is `/api/auth/<provider>/callback/`. 42 redirects here with `?code=...&state=...`.  
The backend must perform these **6 tasks**, and we will build them as **5 sequential pieces** (some pieces combine two simple tasks).

| Piece | Tasks covered | What we will build |
|-------|---------------|-------------------|
| **Piece 1** | 1. Validate `state`<br>2. Exchange `code` for access token | The view class with only state validation and token exchange. No other imports. |
| **Piece 2** | 3. Fetch user info from 42 | Add `get_user_info` call and `UserInfoError` handling inside the view. |
| **Piece 3** | 4. Find or create the local user | Build `user_resolution.py` first, then call `resolve_user(oauth_user)` inside the callback. We will not touch the callback until the resolution module is ready. |
| **Piece 4** | 5. Generate temporary `login_token`<br>6. Redirect to frontend with that token | Add cache store and redirect. Only now we import `cache` and `redirect`. |

---

### How we will work through this plan
- I will show **only the code for the current piece** – no other imports, no forward-looking placeholders.
- I will **wait for your confirmation** before moving to the next piece.
- I will **not import anything** until the piece that actually needs it.

---

STEP 5 - CALLBACK ENDPOINT PLAN

Piece 1
  Tasks:
    1. Validate state
    2. Exchange code for access token
  What we build:
    The view class with only state validation and token exchange.

Piece 2
  Tasks:
    3. Fetch user info from 42
  What we build:
    Add get_user_info call and UserInfoError handling inside the view.

Piece 3
  Tasks:
    4. Find or create the local user
  What we build:
    Build user_resolution.py first, then call resolve_user(oauth_user)
    inside the callback. We will not touch the callback until the
    resolution module is ready.

Piece 4
  Tasks:
    5. Generate temporary login_token
    6. Redirect to frontend with that token
  What we build:
    Add cache store and redirect.



Piece 3 – Build user_resolution.py
We will create a single function resolve_user(oauth_user, provider_name) that takes the standardized OAuthUserData and returns either:

A User instance (success),

None (conflict that requires frontend handling — email or username collision).

The function will do this, in order, inside a database transaction:

Look up by OAuthLink

Check if a row exists with provider and provider_unique_id.

If found, retrieve the linked user.

Optionally update the user’s email and disp_name if they changed, but only if the new email does not belong to a different user. If it does, raise a conflict (return None).

Return the user.

Check email conflict

If no OAuthLink exists, check if any user already has this email.

If yes, return None — the frontend must let the user link accounts or resolve the conflict.

Check username conflict

If the email is free, check if the username from the provider is already taken.

If taken, we could auto‑rename (append a number) or return None. To keep it simple and consistent, we’ll auto‑rename by appending a counter until a free username is found.

Create the user and the link

Create the user with the final username, email, and disp_name.

Create an OAuthLink with provider, provider_unique_id, and the new user.

Both operations are wrapped in transaction.atomic(). If any integrity error occurs (e.g., another request just created the same username or email), the transaction rolls back and we return None.

Why this is production‑proof:

The unique constraint on OAuthLink prevents two requests from creating duplicate links for the same external identity.

transaction.atomic() ensures the user and link are created together or not at all — no orphaned user without a link.

Email uniqueness is preserved by checking before creation, and the database's own unique constraint on email is the final safety net.

No intra_id on the User model; everything goes through OAuthLink.
