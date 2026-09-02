
---

Your `auth.ts` is clean and ready. Integrating it into React requires **very little code** — just a few calls in the right places. Here's the plan with exact instructions for the React developer.

---

## What the React developer needs to know

### 1. Import the module

```typescript
import {
  loginWithProvider,
  exchangeLoginToken,
  loginWithPassword,
  linkAccount,
  apiFetch,
  getAccessToken,
  setAccessToken,
} from '../auth/auth';
```

### 2. OAuth callback — run on app startup

In the root component (e.g., `App.tsx`), inside a `useEffect` that runs once:

```typescript
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const loginToken = params.get('login_token');
  const linkToken = params.get('link_token');
  const status = params.get('status');

  if (loginToken) {
    exchangeLoginToken(loginToken).then(() => {
      // redirect to main page, e.g. /dashboard
    }).catch(console.error);
  } else if (status === 'email_conflict' && linkToken) {
    // store linkToken in state/context, show a login form
    // after user logs in with password, call linkAccount(linkToken)
  }
}, []);
```

### 3. Login buttons

```tsx
<button onClick={() => loginWithProvider('42')}>Login with 42</button>
<button onClick={() => loginWithProvider('google')}>Login with Google</button>
```

### 4. Local login form

```tsx
const handleLocalLogin = async (username: string, password: string) => {
  await loginWithPassword(username, password);
  // redirect to main page
};
```

### 5. Account linking (email conflict flow)

```tsx
// 1. User sees the conflict message (from the callback)
// 2. User logs in with password (see #4)
// 3. After successful login, call:
await linkAccount(storedLinkToken);
// 4. Then start the OAuth flow again — it will succeed without conflict
```

### 6. All API calls use `apiFetch` instead of `fetch`

```typescript
const resp = await apiFetch('/api/me/');
const user = await resp.json();
```

This automatically attaches the access token and refreshes on 401.

### 7. Nothing else

The React developer does **not** need to:
- Store tokens in localStorage
- Handle refresh logic manually
- Deal with CSRF headers for refresh

Everything is handled by the module.

---

That's it. Give this to the React developer and the backend is fully integrated. You've built a complete, production‑proof authentication system from scratch.

