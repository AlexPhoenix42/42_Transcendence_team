// src/auth/auth.ts
var BASE = "";
var accessToken = null;
function setAccessToken(token) {
  accessToken = token;
}
function getAccessToken() {
  return accessToken;
}
function isAuthenticated() {
  return accessToken !== null;
}
async function logout() {
  await fetch(`${BASE}/api/auth/logout/`, { method: "POST" });
  accessToken = null;
}
async function exchangeLoginToken(loginToken) {
  const resp = await fetch(`${BASE}/api/auth/exchange/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login_token: loginToken })
  });
  if (!resp.ok) {
    throw new Error("Token exchange failed.");
  }
  const data = await resp.json();
  if (!data.access) {
    throw new Error("Token exchange response missing access token.");
  }
  setAccessToken(data.access);
}
async function verify2FA(tmpToken, code) {
  const resp = await fetch(`${BASE}/api/auth/2fa/verify/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tmp_token: tmpToken, code })
  });
  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}));
    const message = errorData.error || "2FA verification failed.";
    throw new Error(message);
  }
  const data = await resp.json();
  if (!data.access)
    throw new Error("Verify response missing access token.");
  setAccessToken(data.access);
}
async function enable2FA() {
  const resp = await fetch(`${BASE}/api/auth/2fa/enable/`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${getAccessToken()}` }
  });
  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to enable 2FA.");
  }
  return resp.json();
}
async function disable2FA({ password, code }) {
  const body = {};
  if (password) body.password = password;
  if (code) body.code = code;
  const resp = await fetch(`${BASE}/api/auth/2fa/disable/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${getAccessToken()}`
    },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to disable 2FA.");
  }
}
async function confirmEnable2FA(code) {
  const resp = await fetch(`${BASE}/api/auth/2fa/confirm-enable/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${getAccessToken()}`
    },
    body: JSON.stringify({ code })
  });
  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to confirm 2FA.");
  }
  return resp.json();
}
async function refreshAccessToken() {
  const resp = await fetch(
    `${BASE}/api/auth/refresh/`,
    {
      method: "POST",
      headers: { "X-Requested-With": "XMLHttpRequest" }
    }
  );
  if (!resp.ok) {
    accessToken = null;
    throw new Error("Refresh failed.");
  }
  const data = await resp.json();
  accessToken = data.access;
  return accessToken;
}
async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  let resp = await fetch(url, { ...options, headers });
  if (resp.status == 401 && accessToken) {
    try {
      await refreshAccessToken();
      headers.set("Authorization", `Bearer ${accessToken}`);
      resp = await fetch(url, { ...options, headers });
    } catch {
    }
  }
  return resp;
}
function loginWithProvider(providerName) {
  window.location.href = `${BASE}/api/auth/${providerName}/login/`;
}
async function loginWithPassword(username, password) {
  const resp = await fetch(`${BASE}/api/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  if (!resp.ok) {
    throw new Error("Login failed.");
  }
  const data = await resp.json();
  if (!data.access) {
    throw new Error("Login response missing access token");
  }
  setAccessToken(data.access);
}
async function register(username, email, password) {
  const resp = await fetch(`${BASE}/api/register/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password })
  });
  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}));
    const message = typeof errorData === "object" ? Object.values(errorData).flat().join(" ") || "Registration failed." : "Registration failed.";
    throw new Error(message);
  }
  return resp.json();
}
async function linkAccount(linkToken) {
  const resp = await fetch(`${BASE}/api/auth/link/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${getAccessToken()}`,
      "X-Requested-With": "XMLHttpRequest"
    },
    body: JSON.stringify({ link_token: linkToken })
  });
  if (!resp.ok) {
    throw new Error("Account linking failed.");
  }
}
async function resolveUsernameConflict(newUsername, conflictToken) {
  const resp = await fetch(`${BASE}/api/auth/resolve-username/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: newUsername, token: conflictToken })
  });
  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}));
    const message = errorData.error || "Username conflict resolution failed.";
    throw new Error(message);
  }
  const data = await resp.json();
  if (!data.login_token)
    throw new Error("Resolution response missing login token.");
  await exchangeLoginToken(data.login_token);
  return getAccessToken();
}
export {
  apiFetch,
  confirmEnable2FA,
  disable2FA,
  enable2FA,
  exchangeLoginToken,
  getAccessToken,
  isAuthenticated,
  linkAccount,
  loginWithPassword,
  loginWithProvider,
  logout,
  register,
  resolveUsernameConflict,
  setAccessToken,
  verify2FA
};
