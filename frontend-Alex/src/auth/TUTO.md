
### 1. OAuth callback handler (runs on page load)

When the user returns from 42/Google, the URL contains either  
`?login_token=...` or `?status=email_conflict&link_token=...`.  
The React app must check this **once** when the app starts.

**Where:** in the root component’s `useEffect` (or a dedicated `AuthCallback` component).

**What it does:**
```typescript
const params = new URLSearchParams(window.location.search);
if (params.has('login_token')) {
    await exchangeLoginToken(params.get('login_token')!);
    // then redirect to main page
} else if (params.get('status') === 'email_conflict') {
    // store the link_token and email, show a login form
    // after user logs in, call linkAccount(linkToken)
}
```

---

### 2. Login form (local login)

A form that calls `loginWithPassword(username, password)`.  
On success, redirect to the main page.

---

### 3. OAuth login buttons

Simple buttons that call `loginWithProvider('42')` or `loginWithProvider('google')`.  
No async logic needed — these just redirect the browser.

---

### 4. API calls (every authenticated request)

Replace all `fetch` calls with `apiFetch(url, options)`.  
It automatically attaches the access token and refreshes on 401.

Example:
```typescript
const resp = await apiFetch('/api/me/');
const user = await resp.json();
```

---

### 5. Email conflict linking flow

1. After callback, app detects `?status=email_conflict&link_token=...`  
   → store the `link_token` in memory (not in the URL) and show a login form.
2. User logs in with existing account → `loginWithPassword(username, password)`.
3. After successful login, call `linkAccount(linkToken)`.
4. On success, redirect to main page; the OAuth identity is now linked.

---

