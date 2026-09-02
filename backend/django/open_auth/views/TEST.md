Understood. Here is the complete, self‑contained test plan. Follow it from top to bottom. No back‑and‑forth.

---

### 1. Delete the existing user and link
Run this in your terminal:

```bash
docker exec -it trans_backend_django python manage.py shell -c "
from django.contrib.auth import get_user_model
User = get_user_model()
User.objects.filter(email='miky@42.fr').delete()
print('User deleted')
"
```

---

### 2. Get a fresh login_token from the 42 flow
Open a browser and go to:

```
http://localhost:9000/api/auth/42/login/
```

Authorise on 42. You will be redirected to:

```
http://localhost:3000?login_token=<SOME-UUID>
```

Copy the UUID after `login_token=`.

---

### 3. Exchange the login_token for JWT + httpOnly cookie
Replace `<PASTE_LOGIN_TOKEN>` with the UUID you just copied and run:

```bash
curl -v -X POST http://localhost:9000/api/auth/exchange/ \
  -H "Content-Type: application/json" \
  -d '{"login_token": "<PASTE_LOGIN_TOKEN>"}'
```

**Save the following from the output:**
- `access` token from the JSON body (`"access":"eyJ..."`)
- `refresh_token` cookie from the `Set-Cookie` header (value between `refresh_token=` and the first `;`)

---

### 4. Test the access token on a protected endpoint
Replace `<ACCESS_TOKEN>` and run immediately:

```bash
curl -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:9000/api/me/
```

**Expected:** 200 OK with your user data (id, username, email, etc.).

---

### 5. Test the refresh endpoint
Replace `<REFRESH_TOKEN>` with the cookie value you saved and run:

```bash
curl -v -X POST http://localhost:9000/api/auth/refresh/ \
  -H "X-Requested-With: XMLHttpRequest" \
  --cookie "refresh_token=<REFRESH_TOKEN>"
```

**Expected:** 200 OK with a new `access` token in the body and a new `Set-Cookie` header (the refresh token is rotated).

---

### 6. Use the new access token
Copy the `access` token from the refresh response and run immediately:

```bash
curl -H "Authorization: Bearer <NEW_ACCESS_TOKEN>" http://localhost:9000/api/me/
```

**Expected:** 200 OK with your user data.

---

If every step returns the expected result, the entire OAuth pipeline is production‑verified. If any step fails, paste the full output of that single command and I’ll debug only that step.

