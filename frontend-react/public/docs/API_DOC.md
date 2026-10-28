# API Documentation

## Overview
This API provides authenticated user, player, leader-board, match-history, analytics, achievement, and administrative user-management functionality.  

Unless otherwise specified, endpoints require an authenticated user.

The API uses JSON for request and response bodies.

**Table of Contents:**
| Endpoints - By Section | Description |
|:-----------------------|:------------|
| [Authentication](#authentication) | Registration, login, profile, email verification, password reset |
| [OAuth](#oauth) | OAuth login, token exchange, account linking, logout |
| [Users](#users) | Managing users, viewing users, viewing user analytics |
| [API Key Management](#api-key-management) | Generating, revoking, and checking API keys |
| [GDPR & Data](#gdpr--data) | Data export, import, account deletion |
| [Two-factor Authentication](#two-factor-authentication) | Enabling and disabling 2FA |
| [Friends](#friends) | Managing friends, viewing friends |
| [Chat](#chat) | Rooms, messages, blocking, muting, translation |
| [Chess Game](#chess-game) | Creating games, joining games, leaving games |
| [Tournaments](#tournament) | Creating tournaments, joining tournaments, leaving tournaments |
| [Goose Game](#goose-game) | Creating games, joining games, leaving games |
| [Pacman](#pacman) | Creating games, joining games, leaving games |
| [Audit & Security](#audit--security) | Audit logs, account unlock, suspicious activity |
| [Health](#health) | Health checks and readiness probes |


## Base URL
https://\<server name\>:4443

## Authentication
The API supports JWT authentication and Django session authentication.  
For JWT-authenticated requests, provide the access token using the `Authorization` header:

```
Authorization: Bearer <access_token>
```

The API views use the following authentication configuration:
* `JWT Authentication`
* `Session Authentication`

Administrative endpoints additionally require the authenticated user to satisfy the `IsAdmin` permission.

##### Authentication requirements
All api endpoints require authentication, with some api endpoints requiring admin authentication.


## Rate Limiting

| Zone | Tracks | Defined Limit |
|:----:|:-------|:--------------|
|`api` | Requests per IP | 30 per min (10 bursts `nodelay`)|
|`auth` | Requests per IP | 5 per min (3 bursts `nodelay`)|
|`perip` | Connections per IP | max 20 concurrent connections |


## Endpoints

### Authentication

|Endpoint | Description |
|:--------|:------------|
| [POST /api/login/](#post-apilogin) | Authenticates a user and returns JWT tokens |
| [POST /api/register/](#post-apiregister) | Creates a new user account |
| [GET /api/profile/](#get-apiprofile) | Returns the authenticated user's editable profile |
| [PATCH /api/profile/](#patch-apiprofile) | Updates the authenticated user's profile |
| [GET /api/profile/\<username\>/](#get-apiprofileusername) | Returns a user's public profile |
| [GET /api/verify-email/](#get-apiverify-email) | Verifies a user's email address via token link |
| [POST /api/resend-verification/](#post-apiresend-verification) | Resends the email verification link |
| [POST /api/password-reset/request/](#post-apipassword-resetrequest) | Sends a password reset email |
| [POST /api/password-reset/confirm/](#post-apipassword-resetconfirm) | Resets the password using the emailed token |
| [POST /api/2fa-reset/request/](#post-api2fa-resetrequest) | Sends a 2FA reset email |
| [POST /api/2fa-reset/confirm/](#post-api2fa-resetconfirm) | Disables 2FA using the emailed token |

---

#### `POST /api/login/`

**Description:** Authenticates a user with username and password. Returns a JWT access token in the response body and sets the refresh token as an httpOnly cookie. If the user has 2FA enabled, returns a temporary token instead — the client must then call `/api/2fa/verify/` to complete authentication. Locked accounts are rejected with 403.

**Parameters:**
| Parameter | Type | Required | Description |
|:---------:|:-----|:---------|:------------|
| `username` | string | Yes | Username |
| `password` | string | Yes | Password |

**Example Request:**
```JSON
POST /api/login/
Content-Type: application/json

{
	"username": "alice",
	"password": "securepassword123"
}
```

**Example Response (no 2FA):**
```JSON
{
	"access": "<access_token>"
}
```

**Example Response (2FA required):**
```JSON
{
	"requires_2fa": true,
	"tmp_token": "<temporary_token>"
}
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `400 Bad Request` | Invalid credentials |
| `403 Forbidden` | Account temporarily locked |
| `429 Too Many Requests` | Rate limit exceeded |

---

#### `POST /api/register/`

**Description:** Creates a new user account. A verification email is sent upon successful registration. Username must be 3–30 characters (letters, digits, underscore, hyphen). Password must be 8–128 characters and pass Django's password validators. Email must have a valid domain with MX records.

**Parameters:**
| Parameter | Type | Required | Description |
|:---------:|:-----|:---------|:------------|
| `username` | string | Yes | Unique username (3–30 chars) |
| `email` | string | Yes | Valid email address |
| `password` | string | Yes | Password (8–128 chars) |

**Example Request:**
```JSON
POST /api/register/
Content-Type: application/json

{
	"username": "alice",
	"email": "alice@example.com",
	"password": "securepassword123"
}
```

**Example Response:**
```JSON
{
	"id": 42,
	"username": "alice"
}
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `400 Bad Request` | Invalid registration data (username taken, email taken, weak password, invalid email domain) |
| `429 Too Many Requests` | Rate limit exceeded |

---

#### `GET /api/profile/`

**Description:** Returns the authenticated user's profile. Editable fields: `dispname`, `avatar`, `bio`. Read-only fields: `username`, `rating`, `wins`, `loss`, `draw`, `is_online`, `role`.

**Example Request:**
```JSON
GET /api/profile/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
{
	"username": "alice",
	"dispname": "Alice",
	"avatar": "https://<server_name>:4443/media/avatars/alice.jpg",
	"bio": "Chess Queen",
	"rating": 1450,
	"wins": 20,
	"loss": 10,
	"draw": 5,
	"is_online": true,
	"role": "user"
}
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `401 Unauthorised` | User is not authenticated |

---

#### `PATCH /api/profile/`

**Description:** Updates the authenticated user's profile. Only `dispname`, `avatar`, and `bio` are writable.

**Example Request:**
```JSON
PATCH /api/profile/
Authorization: Bearer <access_token>
Content-Type: application/json

{
	"dispname": "Alice W.",
	"bio": "Grandmaster in training"
}
```

**Example Response:**
```JSON
{
	"username": "alice",
	"dispname": "Alice W.",
	"avatar": "https://<server_name>:4443/media/avatars/alice.jpg",
	"bio": "Grandmaster in training",
	"rating": 1450,
	"wins": 20,
	"loss": 10,
	"draw": 5,
	"is_online": true,
	"role": "user"
}
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `400 Bad Request` | Invalid data |
| `401 Unauthorised` | User is not authenticated |

---

#### `GET /api/profile/<username>/`

**Description:** Returns a user's public profile.

**Example Request:**
```JSON
GET /api/profile/alice/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
{
	"id": 42,
	"username": "alice",
	"dispname": "Alice",
	"bio": "Chess Queen",
	"avatar": "https://<server_name>:4443/media/avatars/alice.jpg",
	"rating": 1450,
	"wins": 20,
	"loss": 10,
	"draw": 5,
	"is_online": true,
	"friends_cnt": 15,
	"role": "user"
}
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `401 Unauthorised` | User is not authenticated |
| `404 Not Found` | User does not exist |

---

#### `GET /api/verify-email/`

**Description:** Verifies a user's email address. This endpoint is called via the link sent to the user's email. On success, redirects to the frontend with `?status=verified`. On failure, redirects with `?status=verify_error&reason=<reason>`.

**Query Parameters:**
| Parameter | Type | Required | Description |
|:---------:|:-----|:---------|:------------|
| `token` | string | Yes | Verification token from the email |
| `uid` | string | Yes | User ID |

**Example Request:**
```
GET /api/verify-email/?token=abc123&uid=42
```

**Response:** Redirects to the frontend URL.

---

#### `POST /api/resend-verification/`

**Description:** Resends the email verification link. Returns a generic success message regardless of whether the email exists or is already verified, to prevent email enumeration.

**Parameters:**
| Parameter | Type | Required | Description |
|:---------:|:-----|:---------|:------------|
| `email` | string | Yes | Email address |

**Example Request:**
```JSON
POST /api/resend-verification/
Content-Type: application/json

{
	"email": "alice@example.com"
}
```

**Example Response:**
```JSON
{
	"status": "If the email is registered and not verified, a new link has been sent."
}
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `400 Bad Request` | Email not provided |
| `429 Too Many Requests` | Rate limit exceeded |

---

#### `POST /api/password-reset/request/`

**Description:** Sends a password reset email. Returns a generic success message regardless of whether the email exists, to prevent email enumeration.

**Parameters:**
| Parameter | Type | Required | Description |
|:---------:|:-----|:---------|:------------|
| `email` | string | Yes | Email address |

**Example Request:**
```JSON
POST /api/password-reset/request/
Content-Type: application/json

{
	"email": "alice@example.com"
}
```

**Example Response:**
```JSON
{
	"status": "If the email is registered, a reset link has been sent."
}
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `400 Bad Request` | Email not provided |
| `429 Too Many Requests` | Rate limit exceeded |

---

#### `POST /api/password-reset/confirm/`

**Description:** Resets the user's password using the token from the reset email. The new password must pass Django's password validators.

**Parameters:**
| Parameter | Type | Required | Description |
|:---------:|:-----|:---------|:------------|
| `token` | string | Yes | Reset token from the email |
| `uid` | string | Yes | User ID |
| `new_password` | string | Yes | New password |

**Example Request:**
```JSON
POST /api/password-reset/confirm/
Content-Type: application/json

{
	"token": "abc123",
	"uid": "42",
	"new_password": "newsecurepassword456"
}
```

**Example Response:**
```JSON
{
	"status": "Password has been reset."
}
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `400 Bad Request` | Missing token, uid, or new_password |
| `400 Bad Request` | Invalid or expired token |
| `400 Bad Request` | Password does not meet strength requirements |
| `429 Too Many Requests` | Rate limit exceeded |

---

#### `POST /api/2fa-reset/request/`

**Description:** Sends a 2FA reset email. Returns a generic success message regardless of whether the email exists, to prevent email enumeration.

**Parameters:**
| Parameter | Type | Required | Description |
|:---------:|:-----|:---------|:------------|
| `email` | string | Yes | Email address |

**Example Request:**
```JSON
POST /api/2fa-reset/request/
Content-Type: application/json

{
	"email": "alice@example.com"
}
```

**Example Response:**
```JSON
{
	"status": "If the email is registered, a reset link has been sent."
}
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `400 Bad Request` | Email not provided |
| `429 Too Many Requests` | Rate limit exceeded |

---

#### `POST /api/2fa-reset/confirm/`

**Description:** Disables 2FA for a user using the token from the reset email. All TOTP devices are deleted.

**Parameters:**
| Parameter | Type | Required | Description |
|:---------:|:-----|:---------|:------------|
| `token` | string | Yes | Reset token from the email |
| `uid` | string | Yes | User ID |

**Example Request:**
```JSON
POST /api/2fa-reset/confirm/
Content-Type: application/json

{
	"token": "abc123",
	"uid": "42"
}
```

**Example Response:**
```JSON
{
	"status": "2FA has been reset"
}
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `400 Bad Request` | Missing token or uid |
| `400 Bad Request` | Invalid or expired token |
| `429 Too Many Requests` | Rate limit exceeded |

---

### OAuth

| Endpoint | Description |
|:---------|:------------|
| [GET /api/auth/\<provider\>/login/](#get-apiauthproviderlogin) | Starts an OAuth login flow |
| [GET /api/auth/\<provider\>/callback/](#get-apiauthprovidercallback) | Handles the OAuth provider callback |
| [POST /api/auth/exchange/](#post-apiauthexchange) | Exchanges a login token for JWT tokens |
| [POST /api/auth/refresh/](#post-apiauthrefresh) | Refreshes the access token using the httpOnly cookie |
| [POST /api/auth/link/](#post-apiauthlink) | Links an OAuth account to an existing user |
| [POST /api/auth/resolve-username/](#post-apiauthresolve-username) | Resolves a username conflict during OAuth registration |
| [POST /api/auth/logout/](#post-apiauthlogout) | Logs out the user and invalidates tokens |

---

#### `GET /api/auth/<provider>/login/`

**Description:** Starts the OAuth login flow for the specified provider. Generates a state parameter and redirects the user to the provider's authorization page. Supported providers: `google`, `42`.

**Example Request:**
```
GET /api/auth/google/login/
```

**Response:** 302 redirect to the OAuth provider's authorization URL.

---

#### `GET /api/auth/<provider>/callback/`

**Description:** Handles the OAuth provider's callback after user authorization. Validates the state parameter, exchanges the authorization code for an access token, fetches user info, and resolves or creates the local user. On success, redirects to the frontend with a `login_token`. On conflict (email or username), redirects with conflict details and a `link_token` or `resolve_token`.

**Query Parameters:**
| Parameter | Type | Required | Description |
|:---------:|:-----|:---------|:------------|
| `state` | string | Yes | OAuth state parameter |
| `code` | string | Yes | Authorization code from the provider |

**Response:** 302 redirect to the frontend with one of:
- `?login_token=<token>` — successful authentication
- `?status=email_conflict&email=<email>&link_token=<token>` — email already in use
- `?status=username_conflict&username=<name>&token=<resolve_token>&link_token=<token>` — username taken
- `?status=linked_email_conflict&current_email=<email>&new_email=<email>` — linked email mismatch

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `400 Bad Request` | Invalid state parameter or missing authorization code |
| `502 Bad Gateway` | Token exchange or user info fetch failed |

---

#### `POST /api/auth/exchange/`

**Description:** Exchanges a one-time `login_token` (from the OAuth callback redirect) for JWT tokens. If the user has 2FA enabled, returns a temporary token instead. Sets the refresh token as an httpOnly cookie.

**Parameters:**
| Parameter | Type | Required | Description |
|:---------:|:-----|:---------|:------------|
| `login_token` | string | Yes | One-time token from the OAuth callback |

**Example Request:**
```JSON
POST /api/auth/exchange/
Content-Type: application/json

{
	"login_token": "<login_token>"
}
```

**Example Response (no 2FA):**
```JSON
{
	"access": "<access_token>",
	"user": {
		"id": 42,
		"username": "alice",
		"email": "alice@example.com"
	}
}
```

**Example Response (2FA required):**
```JSON
{
	"tmp_token": "<temporary_token>",
	"requires_2fa": true
}
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `400 Bad Request` | Missing or invalid/expired login token |
| `400 Bad Request` | User not found |
| `403 Forbidden` | Account is deactivated or frozen (unverified email after 3 days) |
| `429 Too Many Requests` | Rate limit exceeded |

---

#### `POST /api/auth/refresh/`

**Description:** Refreshes the access token using the refresh token stored in the httpOnly cookie. The old refresh token is blacklisted (one-time use rotation). Requires the `X-Requested-With: XMLHttpRequest` header for CSRF protection.

**Headers:**
| Header | Required | Value |
|:------:|:---------|:------|
| `X-Requested-With` | Yes | `XMLHttpRequest` |

**Example Request:**
```JSON
POST /api/auth/refresh/
X-Requested-With: XMLHttpRequest
Cookie: refresh_token=<refresh_token>
```

**Example Response:**
```JSON
{
	"access": "<new_access_token>"
}
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `400 Bad Request` | Missing X-Requested-With header |
| `400 Bad Request` | Account is deactivated |
| `401 Unauthorised` | No refresh token cookie, or token is invalid/expired |

---

#### `POST /api/auth/link/`

**Description:** Links an OAuth account to the authenticated user's existing account. Used when the OAuth callback detected an email or username conflict and the user chose to link their accounts. Requires the `X-Requested-With: XMLHttpRequest` header for CSRF protection.

**Headers:**
| Header | Required | Value |
|:------:|:---------|:------|
| `X-Requested-With` | Yes | `XMLHttpRequest` |

**Parameters:**
| Parameter | Type | Required | Description |
|:---------:|:-----|:---------|:------------|
| `link_token` | string | Yes | Token from the OAuth callback redirect |

**Example Request:**
```JSON
POST /api/auth/link/
Authorization: Bearer <access_token>
X-Requested-With: XMLHttpRequest
Content-Type: application/json

{
	"link_token": "<link_token>"
}
```

**Example Response:**
```JSON
{
	"status": "linked"
}
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `400 Bad Request` | Missing or invalid/expired link token |
| `401 Unauthorised` | User is not authenticated |
| `403 Forbidden` | Email or username mismatch — authenticated user does not own the conflicting account |
| `409 Conflict` | Account already linked |

---

#### `POST /api/auth/resolve-username/`

**Description:** Resolves a username conflict during OAuth registration. The user provides a new username and the resolve token from the OAuth callback redirect. On success, creates the account and returns a `login_token` for exchange.

**Parameters:**
| Parameter | Type | Required | Description |
|:---------:|:-----|:---------|:------------|
| `username` | string | Yes | Desired username |
| `token` | string | Yes | Resolve token from the OAuth callback redirect |

**Example Request:**
```JSON
POST /api/auth/resolve-username/
Content-Type: application/json

{
	"username": "alice_new",
	"token": "<resolve_token>"
}
```

**Example Response:**
```JSON
{
	"login_token": "<login_token>"
}
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `400 Bad Request` | Missing username or token |
| `400 Bad Request` | Invalid or expired token |
| `409 Conflict` | Username is already taken |

---

#### `POST /api/auth/logout/`

**Description:** Logs out the user. Blacklists the refresh token, disconnects WebSocket connections, sets the user offline, flushes the Django session, and clears the `refresh_token` and `sessionid` cookies.

**Example Request:**
```JSON
POST /api/auth/logout/
Cookie: refresh_token=<refresh_token>
```

**Example Response:**
```JSON
{
	"status": "logged out"
}
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `429 Too Many Requests` | Rate limit exceeded |

---

### Users

|Endpoint - No Admin Required | Description |
|:--------|:------------|
| [GET /api/me/](#get-apime) | Returns information about the currently authenticated user |
| [GET /api/leaderboard/](#get-apileaderboard) | Returns the top 50 active users ordered by rating and number of wins |
| [GET /api/match-history/](#get-apimatch-history-and-get-apimatch-historyusername) | Returns the most recent completed games for the authenticated user |
| [GET /api/match-history/\<username\>/](#get-apimatch-history-and-get-apimatch-historyusername) | Returns the match history for the user |
| [GET /api/analytics/](#get-apianalytics) | Returns statistical information about the authenticated user's completed games |
| [GET /api/achievements/](#get-apiachievements-and-get-apiachievementsusername) | Returns achievements and achievement progress for the authenticated user |
| [GET /api/achievements/\<username\>/](#get-apiachievements-and-get-apiachievementsusername) | Returns the achievements for a specific user |

|Endpoint - Admin Required | Description |
|:-------------------------|:------------|
| [GET /api/users/](#get-apiusers) | Returns a list of users for administrative purposes |
| [PATCH /api/users/\<user_id\>/](#patch-apiusersuserid) | Updates the role and/or active status of a user |
| [DELETE /api/users/\<user_id\>/delete/](#delete-apiusersuseriddelete) | Deletes a user account |


---

#### `GET /api/me/`

**Description** Returns information about the currently authenticated user.  

  

**Parameters:** None  

**Example Request:**
```JSON
GET /api/me/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
{
	"id": 42,
	"username": "alice",
	"email": "alice@example.com",
	"is_online": true,
	"rating": 1450,
	"bio": "Chess Queen",
	"is_staff": false,
	"role": "user",
	"avatar": "https://<server_name>:4443/media/avatars/alice.jpg"
}
```

**Possible error codes:**  
|HTTP status code | Description |
|:----------------|:------------|
|`401 Unauthorised` | User is not authenticated|

---
#### `GET /api/leaderboard/`
**Description:** Returns the top 50 active users ordered by rating and then number of wins. Users whose usernames begin with `stockfish_ai` are excluded. Users are ordered by rating (descending), and wins (descending).  

  

**Parameters:** None  

**Example Request:**
```JSON
GET /api/leaderboard/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
[
	{
		"rank": 1,
		"username": "alice",
		"dispname": "Alice",
		"rating": 1450,
		"wins": 120,
		"loss": 30,
		"draw": 10,
		"avatar": "https://<server_name>:4443/media/avatars/alice.jpg",
		"is_online": true,
		"role": "user"
	},
	{
		"rank": 2,
		"username": "bob",
		"dispname": "Bob",
		"rating": 1200,
		"wins": 110,
		"loss": 50,
		"draw": 20,
		"avatar": null,
		"is_online": false,
		"role": "moderator"
	}
]
```

**Possible error codes:**
|HTTP status code | Description |
|:----------------|:------------|
|`401 Unauthorised` | User is not authenticated|

---
#### `GET /api/match-history/` and `GET /api/match-history/<username>/`
**Description:** Returns the most recent completed games for the authenticated user. If a username is supplied through the URL, the endpoint returns the match history for that user instead. Only finished games are returned. The endpoint returns at most 50 games, ordered by most recently updated first.  

  

**Parameters:** None  

**Example Request: current user**
```JSON
GET /api/match-history/
Authorization: Bearer <access_token>
```
**Example Request: specific user**
```JSON
GET /api/match-history/alice/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
[
	{
		"id": 123,
		"opponent": "bob",
		"opponent_avatar": null,
		"result": "win",
		"result_reason": "checkmate",
		"player_color": "white",
		"moves_count": 42,
		"date": "2026-09-25T10:30:00+00:00",
		"player2_is_ai": false
	}
]
```

**Possible error codes:**
|HTTP status code | Description |
|:----------------|:------------|
|`401 Unauthorised` | User is not authenticated|
|`404 Not Found` | Username does not exist |

---

#### `GET /api/analytics/`

**Description** Returns statistical information about the authenticated user's completed games  

  

**Parameters:** None  

**Example Request:**
```JSON
GET /api/analytics/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
{
	"total_games": 120,
	"win_rate": 58.3,
	"games_this_week": 8,
	"games_this_month": 25,
	"white_wins": 40,
	"white_total": 65,
	"black_wins": 30,
	"black_total": 55,
	"ai_wins": 20,
	"ai_total": 30,
	"human_wins": 50,
	"human_total": 90,
	"avg_moves": 38.4,
	"recent_from": [
		"win",
		"win",
		"loss",
		"draw",
		"win"
	],
	"most_played": [
		{
			"username": "bob",
			"games": 15
		}
	],
	"longest_win_streak": 7,
	"current_streak": {
		"type": "win",
		"count": 2
	}
}
```

**Possible error codes:**
|HTTP status code | Description |
|:----------------|:------------|
|`401 Unauthorised` | User is not authenticated|

---

#### `GET /api/users/`

**Description:** Returns a list of users for administrative purposes. Users are ordered by registration date, newest first. The result is limited to 100 users.  



**Query Parameters:**
|Parameters | Type | Required | Description |
|:---------:|:-----|:---------|:------------|
| `search` | string | No | Searches username, and display name |

**Example Request:**
```JSON
GET /api/users/?search=alice
Authorization: Bearer <admin_access_token>
```

**Example Response:**
```JSON
[
	{
		"id": 42,
		"username": "alice",
		"email": "alice@example.com",
		"dispname": "Alice",
		"role": "user",
		"is_active": true,
		"is_online": true,
		"rating": 1450,
		"wins": 20,
		"loss": 10,
		"draw": 5,
		"date_joined": "2026-01-15T12:00:00+00:00",
		"avatar": "https://<server_name>:4443/media/avatars/alice.jpg"
	}
]
```

**Possible error codes:**
|HTTP status code | Description |
|:----------------|:------------|
|`401 Unauthorised` | User is not authenticated|
|`403 Forbidden` | User is not an administrator |

---

#### `PATCH /api/users/<user_id>/`
**Description:** Updates the role and/or active status of the user



**Path Parameters:**
|Parameter | Type | Required | Description |
|:--------:|:-----|:---------|:------------|
| `user_id` | integer | Yes | ID of the user to update|

**Example Request:**  
*<sup>Both fields in the request body are optional</sup>*
```JSON
PATCH /api/users/42/
Authorization: Bearer <admin_access_token>
Content-type: application/json

{
	"role": "moderator",
	"is_active": true
}
```

**Example Response:**
```JSON
{
	"id": 42,
	"username": "alice",
	"role": "moderator",
	"is_active": true
}
```
**Possible error codes:**
|HTTP status code | Description |
|:----------------|:------------|
|`400 Bad Request` | Invalid role |
|`400 Bad Request` | Administrator attempted to modify their own account |
|`403 Forbidden` | Administrator attempted to modify another administrator |
|`403 Forbidden` | User is not an administrator |
|`404 Not Found` | User does not exist |

---

#### `DELETE /api/users/<user_id>/delete/`

**Description:** Deletes a user account  

**Path Parameters:**
|Parameter | Type | Required | Description |
|:--------:|:-----|:---------|:------------|
|`user_id` | integer | Yes | ID of the user to delete |


**Example Request:**
```JSON
DELETE /api/users/42/delete/
Authorization: Bearer <admin_access_token>
```

**Example Response:**
```JSON
{
	"status": "User 'alice' deleted."
}
```

**Possible error codes:**
|HTTP status code | Description |
|:----------------|:------------|
|`400 Bad Request` | Request contains invalid data or violates a business rule |
|`401 Unauthorised` | User is not authenticated |
|`403 Forbidden` | The authenticated user does not have permission to perform the operation |
|`404 Not Found` | User does not exist |

---

#### `GET /api/achievements/` and `GET /api/achievements/<username>/`
**Description:** Returns achievements and achievement progress for the authenticated user. If a username is supplied, achievements are returned for that user instead.  

**Parameters:**
|Parameter | Location | Type | Required | Description |
|:--------:|:---------|:-----|:---------|:------------|
|`username` | Path | string | No | Username whose achievements should be returned |

**Example Request: current user**
```JSON
GET /api/achievements/
Authorization: Bearer <access_token>
```

**Example Request: specific user**
```JSON
GET /api/achievements/alice/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
{
	"achievements": [
		{
			"id": "first_blood",
			"name": "First Blood",
			"description": "Win your first game",
			"icon": "⚔️",
			"unlocked": true
		},
		{
			"id": "veteran",
			"name": "Veteran",
			"description": "Win 10 games",
			"icon": "🎖️",
			"unlocked": false,
			"progress": 7,
			"target": 10
		}
	],
	"unlocked_count": 2,
	"total_count": 12
}
```

**Possible error codes:**
|HTTP status code | Description |
|:----------------|:------------|
|`401 Unauthorised` | User is not authenticated |
|`404 Not Found` | User does not exist |

---

### API Key Management

| Endpoint | Description |
|:---------|:------------|
| [GET /api/me/api-key/](#get-apimeapi-key) | Returns API key status |
| [POST /api/me/api-key/generate/](#post-apimeapi-keygenerate) | Generates a new API key |
| [POST /api/me/api-key/revoke/](#post-apimeapi-keyrevoke) | Revokes the current API key |

---

#### `GET /api/me/api-key/`

**Description:** Returns whether the authenticated user has an API key and its prefix.

**Example Request:**
```JSON
GET /api/me/api-key/
Authorization: Bearer <access_token>
```

**Example Response (key exists):**
```JSON
{
	"has_key": true,
	"prefix": "bt_a1b2",
	"created_at": "2026-09-25T10:30:00+00:00"
}
```

**Example Response (no key):**
```JSON
{
	"has_key": false
}
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `401 Unauthorised` | User is not authenticated |

---

#### `POST /api/me/api-key/generate/`

**Description:** Generates a new API key for the authenticated user. If a key already exists, it is replaced. The plain-text key is returned only once — it cannot be retrieved again.

**Example Request:**
```JSON
POST /api/me/api-key/generate/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
{
	"api_key": "bt_a1b2c3d4e5f6...",
	"message": "Save this key — it won't be shown again."
}
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `401 Unauthorised` | User is not authenticated |

---

#### `POST /api/me/api-key/revoke/`

**Description:** Revokes the authenticated user's API key.

**Example Request:**
```JSON
POST /api/me/api-key/revoke/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
{
	"status": "API key revoked."
}
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `401 Unauthorised` | User is not authenticated |
| `404 Not Found` | No API key found |

---

### GDPR & Data

| Endpoint | Description |
|:---------|:------------|
| [GET /api/me/export/](#get-apimeexport) | Exports all user data |
| [POST /api/me/import/](#post-apimeimport) | Imports user data from a JSON file |
| [POST /api/me/delete/](#post-apimedelete) | Requests account deletion (sends confirmation email) |
| [POST /api/me/delete/confirm/](#post-apimedeleteconfirm) | Confirms and executes account deletion |

---

#### `GET /api/me/export/`

**Description:** Exports all data associated with the authenticated user. Supports JSON, CSV, and XML formats. The export includes: profile, friends, friend requests, chess games, tournaments, goose games, pacman games, direct messages, OAuth links, and achievements. Also accepts API key authentication.

**Query Parameters:**
| Parameter | Type | Required | Description |
|:---------:|:-----|:---------|:------------|
| `export_format` | string | No | Export format: `json` (default), `csv`, or `xml` |

**Example Request:**
```JSON
GET /api/me/export/?export_format=json
Authorization: Bearer <access_token>
```

**Example Response (JSON):**
```JSON
{
	"profile": {
		"username": "alice",
		"email": "alice@example.com",
		"display_name": "Alice",
		"bio": "Chess Queen",
		"rating": 1450,
		"wins": 20,
		"losses": 10,
		"draws": 5,
		"date_joined": "2026-01-15T12:00:00+00:00",
		"role": "user"
	},
	"friends": ["bob", "charlie"],
	"friend_requests_sent": [],
	"friend_requests_received": [],
	"chess_games": [],
	"tournaments": [],
	"goose_games": [],
	"pacman_games": [],
	"direct_messages": [],
	"oauth_links": [],
	"achievements_unlocked": ["First Blood", "Veteran"]
}
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `400 Bad Request` | Unsupported export format |
| `401 Unauthorised` | User is not authenticated |
| `500 Internal Server Error` | Export failed |

---

#### `POST /api/me/import/`

**Description:** Imports user data from a JSON file or JSON body. Only safe profile fields are imported (`display_name`, `bio`). Friends can be bulk-imported — accepted friend requests are created automatically. Unsafe fields (username, email, rating, wins, etc.) are skipped. Also accepts API key authentication. Maximum file size: 10 MB.

**Parameters:** JSON body or file upload with key `file`.

**Example Request:**
```JSON
POST /api/me/import/
Authorization: Bearer <access_token>
Content-Type: application/json

{
	"profile": {
		"display_name": "Alice W.",
		"bio": "Updated bio"
	},
	"friends": ["bob", "charlie"]
}
```

**Example Response:**
```JSON
{
	"status": "Import completed.",
	"updated": ["display_name", "bio", "friends (2 added)"],
	"skipped": ["profile.username (read-only)", "profile.email (read-only)"],
	"errors": []
}
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `400 Bad Request` | Invalid JSON file or body, or file too large |
| `401 Unauthorised` | User is not authenticated |
| `500 Internal Server Error` | Import failed |

---

#### `POST /api/me/delete/`

**Description:** Requests account deletion. Sends a confirmation email with a link that expires in 1 hour. The email explains what data will be permanently deleted.

**Example Request:**
```JSON
POST /api/me/delete/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
{
	"status": "Confirmation email sent."
}
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `401 Unauthorised` | User is not authenticated |
| `500 Internal Server Error` | Failed to send confirmation email |

---

#### `POST /api/me/delete/confirm/`

**Description:** Confirms and permanently deletes the user account using the token from the confirmation email. This action cannot be undone. Clears the refresh token cookie.

**Parameters:**
| Parameter | Type | Required | Description |
|:---------:|:-----|:---------|:------------|
| `token` | string | Yes | Deletion token from the confirmation email |
| `uid` | string | Yes | User ID |

**Example Request:**
```JSON
POST /api/me/delete/confirm/
Content-Type: application/json

{
	"token": "abc123",
	"uid": "42"
}
```

**Example Response:**
```JSON
{
	"status": "Account 'alice' has been permanently deleted."
}
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `400 Bad Request` | Missing token or uid |
| `400 Bad Request` | Invalid or expired token |
| `404 Not Found` | User not found |
| `500 Internal Server Error` | Deletion failed |

---

### Two-factor Authentication

|Endpoint | Description|
|:--------|:-----------|
|[GET /api/2fa/status/](#get-api2fastatus) | Returns whether two-factor authentication is enabled for the authenticated user|
|[POST /api/2fa/enable/](#post-api2faenable) | Creates a new inactive TOTP device and returns the provisioning information|
|[POST /api/2fa/confirm-enable/](#post-api2faconfirm-enable) | Confirms the TOTP setup and enables two-factor authentication|
|[POST /api/2fa/verify/](#post-api2faverify) | Verifies a TOTP or recovery code and completes authentication|
|[POST /api/2fa/disable/](#post-api2fadisable) | Disables two-factor authentication after password or TOTP verification|

#### `GET /api/2fa/status/`

**Description:** Returns whether two-factor authentication is currently enabled for the authenticated user.

**Example Request:**
```JSON
GET /api/2fa/status/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
{
	"has_2fa": true
}
```

**Possible error codes:**
|HTTP status code | Description |
|:----------------|:------------|
|`401 Unauthorised` | User is not authenticated |


---

#### `POST /api/2fa/enable/`

**Description:** Starts the two-factor authentication setup process. Creates an inactive TOTP device and returns the provisioning URI and secret. The device is not activated until the TOTP code is confirmed using `/api/2fa/confirm-enable/`.

**Example Request:**
```JSON
POST /api/2fa/enable/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
{
	"provisioning_uri": "...",
	"secret": "..."
}
```

**Possible error codes:**
|HTTP status code | Description |
|:----------------|:------------|
|`401 Unauthorised` | User is not authenticated |
|`409 Conflict` | A 2FA device is already configured |

---

#### `POST /api/2fa/confirm-enable/`

**Description:** Confirms the two-factor authentication setup using a TOTP code. The code is verified against the inactive TOTP device created by /api/2fa/enable/. On successful confirmation, 2FA is enabled and a set of recovery codes is generated. Recovery codes are returned only during this response.

**Request Parameters:**
|Parameter | Type | Required | Description |
|:--------:|:-----|:---------|:------------|
|`code` | string | Yes | Current TOTP code generated by the authenticator application |

**Example Request:**
```JSON
POST /api/2fa/confirm-enable/
Authorization: Bearer <access_token>
Content-Type: application/json

{
	"code": "123456"
}
```

**Example Response:**
```JSON
{
	"status": "2fa enabled",
	"recovery_codes": [
		"8F4K-2M7P",
		"Q9L3-X6TZ",
		"R5N8-W2HC"
	]
}
```

**Possible error codes:**
|HTTP status code | Description|
|:----------------|:------------|
|`400 Bad Request` | TOTP code is missing|
|`400 Bad Request` | Invalid TOTP code|
|`401 Unauthorised` | User is not authenticated|
|`404 Not Found` | No pending 2FA setup exists|


---

#### `POST /api/2fa/verify/`

**Description:** Verifies a TOTP code or recovery code using a temporary authentication token. On successful verification, the temporary token is consumed, the user is authenticated, and final JWT access and refresh tokens are issued.

**Request Parameters:**
| Parameter | Type | Required | Description |
|:---------:|:-----|:---------|:------------|
| `tmp_token` | string | Yes | Temporary token issued during the initial authentication flow |
| `code` | string | Yes | TOTP code or valid recovery code |

**Example Request:**
```JSON
POST /api/2fa/verify/
Content-Type: application/json

{
	"tmp_token": "<temporary_token>",
	"code": "123456"
}
```

**Example Response:**
```JSON
{
	"access": "<access_token>",
	"user": {
		"id": 42,
		"username": "alice",
		"email": "alice@example.com"
	}
}
```

**Possible error codes:**
|HTTP status code | Description|
|:----------------|:-----------|
|`400 Bad Request` | tmp_token or code is missing|
|`400 Bad Request` | Temporary token is invalid or expired|
|`400 Bad Request` | User does not exist|
|`400 Bad Request` | 2FA is not enabled for the user|
|`400 Bad Request` | Invalid TOTP or recovery code|
|`403 Forbidden` | User account is deactivated|
|`403 Forbidden` | User account is frozen because email verification is incomplete|

---

#### `POST /api/2fa/disable/`
**Description:** Disables two-factor authentication for the authenticated user. The request must be confirmed using either the user's password or an active TOTP code.

**Request Parameters:**
| Parameter | Type | Required | Description |
|:---------:|:-----|:---------|:------------|
|`password` | string | Conditional | User's current password. Required when `code` is not supplied|
|`code` | string | Conditional | Current TOTP code. Required when `password` is not supplied |

**Example Request: password confirmation**
```JSON
POST /api/2fa/disable/
Authorization: Bearer <access_token>
Content-Type: application/json

{
	"password": "<password>"
}
```

**Example Request: TOTP confirmation**
```JSON
POST /api/2fa/disable/
Authorization: Bearer <access_token>
Content-Type: application/json

{
	"code": "123456"
}
```

**Example Response:**
```JSON
{
	"status": "2fa disabled"
}
```

**Possible error codes:**
|HTTP status code | Description|
|:----------------|:------------|
|`400 Bad Request` | Neither a password nor a TOTP code was supplied|
|`400 Bad Request` | Invalid password|
|`400 Bad Request` | Invalid TOTP code|
|`400 Bad Request`| 2FA is not enabled|
|`401 Unauthorised` | User is not authenticated|

---

### Friends
| Endpoint | Description |
|:---------|:------------|
|[GET /api/friends/](#get-apifriends) | Returns the authenticated user's friends |
|[GET /api/friends/requests/](#get-apifriendsrequests) | Returns pending incoming friend requests for the authenticated user |
|[GET /api/friends/requests/sent/](#get-apifriendsrequestssent) | Returns pending friend requests sent by the authenticated user |
|[POST /api/friends/requests/send/](#post-apifriendsrequestssend) | Sends a friend request to another user |
|[PATCH /api/friends/requests/\<request_id\>/](#patch-apifriendsrequestsrequestid) | Accepts or declines a pending friend request |
|[DELETE /api/friends/requests/\<request_id\>/cancel/](#delete-apifriendsrequestsrequestidcancel) | Cancels a pending friend request sent by the authenticated user |
|[DELETE /api/friends/\<friend_id\>/](#delete-apifriendsfriendid)| Removes a user from the authenticated user's friends |


#### `GET /api/friends/`

**Description:** Returns the friends of the currently authenticated user. Friends are ordered alphabetically by username. The endpoint is paginated and returns up to 50 friends per page by default, with a maximum of 200 friends per page.  

**Query Parameters:**
|Parameters | Type | Required | Description|
|:---------:|:-----|:---------|:-----------|
|`page` | integer | No | Page number to return |
|`page_size` | integer | No | Number of friends per page. Defaults to 50 and has a maximum of 200 |

**Example Request:**
```JSON
GET /api/friends/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
{
	"count": 2,
	"next": null,
	"previous": null,
	"results": [
		{
			"id": 42,
			"username": "alice",
			"is_online": true
		},
		{
			"id": 43,
			"username": "bob",
			"is_online": false
		}
	]
}
```

**Possible error codes:**
|HTTP status code | Description |
|:----------------|:------------|
|`401 Unauthorised` | User is not authenticated|
|`400 Bad Request` | Pagination error|

---

#### `GET /api/friends/requests/`

**Description:** Returns pending incoming friend requests for the currently authenticated user. Requests sent by the authenticated user are excluded. The endpoint is paginated and returns up to 20 requests per page by default, with a maximum of 100 requests per page.

**Query Parameters:**
|Parameters | Type | Required | Description |
|:---------:|:-----|:---------|:-----------|
|`page`| integer | No | Page number to return |
|`page_size` | integer | No | Number of requests per page. Defaults to 20 and has a maximum of 100 |

**Example Request:**
```JSON
GET /api/friends/requests/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
{
	"count": 1,
	"next": null,
	"previous": null,
	"results": [
		{
			"id": 123,
			"from_user": 43,
			"to_user": 42,
			"sent_by": 43,
			"status": "pending"
		}
	]
}
```

**Possible error codes:**
|HTTP status code | Description|
|:----------------|:-----------|
|`401 Unauthorised` | User is not authenticated|

---

#### `GET /api/friends/requests/sent/`

**Description:** Returns pending friend requests sent by the currently authenticated user. The endpoint is paginated and returns up to 20 requests per page by default, with a maximum of 100 requests per page.

**Query Parameters:**
|Parameters | Type | Required | Description|
|:---------:|:-----|:---------|:-----------|
|`page` | integer | No | Page number to return|
|`page_size` | integer | No | Number of requests per page. Defaults to 20 and has a maximum of 100|

**Example Request:**
```JSON
GET /api/friends/requests/sent/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
{
	"count": 1,
	"next": null,
	"previous": null,
	"results": [
		{
			"id": 123,
			"from_user": 42,
			"to_user": 43,
			"sent_by": 42,
			"status": "pending"
		}
	]
}
```

**Possible error codes:**
|HTTP status code | Description|
|:----------------|:-----------|
|`401 Unauthorised` | User is not authenticated|

---

#### `POST /api/friends/requests/send/`

**Description:** Sends a friend request to another user. A friend request cannot be sent to the authenticated user, to an existing friend, or to a user involved in a blocking relationship with the authenticated user. Only one pending request can exist between two users at a time.

**Parameters:**
| Parameters | Type | Required | Description|
|:----------:|:-----|:---------|:-----------|
| `username` | string | Yes | Username of the user to send the friend request to |

**Example Request:**
```JSON
POST /api/friends/requests/send/
Authorization: Bearer <access_token>
Content-Type: application/json

{
	"username": "bob"
}
```

**Example Response:**
```JSON
{
	"id": 123,
	"from_user": 42,
	"to_user": 43,
	"sent_by": 42,
	"status": "pending"
}
```

**Possible error codes:**
| HTTP status code | Description|
|:------------------|:----------|
|`201 Created` | Friend request was successfully created|
|`400 Bad Request` | Username is missing, user does not exist, user is already a friend, the request is being sent to yourself, or a blocking relationship prevents the request|
|`401 Unauthorised` | User is not authenticated|
|`409 Conflict` | A pending friend request already exists between the two users|

---

#### `PATCH /api/friends/requests/<request_id>/`

**Description:** Accepts or declines a pending friend request. Only the recipient of a friend request can respond to it. When a request is accepted, both users are added to each other's friends list. When a request is declined, the request is marked as declined and the users are not added as friends.

**Parameters:**
|Parameters | Type | Required | Description|
|:---------:|:-----|:---------|:-----------|
|`request_id` | integer | Yes | ID of the friend request|
|`action` | string | Yes | Action to perform. Must be `accept` or `decline`|

**Example Request - Accept:**
```JSON
PATCH /api/friends/requests/123/
Authorization: Bearer <access_token>
Content-Type: application/json

{
	"action": "accept"
}
```

**Example Response - Accept:**
```JSON
{
	"status": "Friend request accepted."
}
```

**Example Request - Decline:**
```JSON
PATCH /api/friends/requests/123/
Authorization: Bearer <access_token>
Content-Type: application/json

{
	"action": "decline"
}
```

**Example Response - Decline:**
```JSON
{
	"status": "Friend request declined."
}
```

**Possible error codes:**
|HTTP status code | Description|
|:-----------------|:-----------|
|`400 Bad Request` | Invalid action. The action must be `accept` or `decline` |
|`401 Unauthorised` | User is not authenticated |
|`403 Forbidden` | The authenticated user sent the friend request and cannot respond to it |
|`404 Not Found` | Friend request does not exist, is no longer pending, or the authenticated user is not involved in the request |

---

#### `DELETE /api/friends/requests/<request_id>/cancel/`

**Description:** Cancels a pending friend request sent by the currently authenticated user. Only pending requests sent by the authenticated user can be cancelled.

**Parameters:** None

**Example Request:**
```JSON
DELETE /api/friends/requests/123/cancel/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
{
	"status": "Friend request cancelled."
}
```

**Possible error codes:**
|HTTP status code | Description|
|:----------------|:------------|
|`401 Unauthorised` | User is not authenticated|
|`404 Not Found` | Friend request does not exist, is not pending, or was not sent by the authenticated user|

---

#### `DELETE /api/friends/<friend_id>/`

**Description:** Removes a user from the authenticated user's friends list. The friendship is removed for both users. The associated accepted friend request is also marked as declined.

**Parameters:**
|Parameters | Type | Required | Description|
|:---------:|:-----|:---------|:-------------|
|`friend_id` | integer | Yes | ID of the friend to remove|

**Example Request:**
```JSON
DELETE /api/friends/43/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
{
	"status": "Friend removed."
}
```

**Possible error codes:**
|HTTP status code | Description |
|:----------------|:------------|
|`401 Unauthorised` | User is not authenticated |
|`404 Not Found`  | The specified user does not exist or is not a friend of the authenticated user |

---

### Chat

| Endpoint | Description |
|:---------|:------------|
| [GET /api/chat/rooms/\<room_id\>/messages/](#get-apichatroomsroomidmessages) | Returns messages in a chat room |
| [GET /api/chat/rooms/global/](#get-apichatroomsglobal) | Returns the global chat room ID |
| [POST /api/chat/rooms/dm/\<user_id\>/](#post-apichatroomsdmuserid) | Creates or retrieves a DM room with a user |
| [GET /api/chat/rooms/game/\<game_id\>/](#get-apichatroomsgamegameid) | Returns the chat room for a game |
| [GET /api/chat/rooms/tournament/\<tournament_id\>/](#get-apichatroomstournamenttournamentid) | Returns the chat room for a tournament |
| [POST /api/chat/block/\<user_id\>/](#post-apichatblockuserid) | Blocks a user |
| [DELETE /api/chat/unblock/\<user_id\>/](#delete-apichatunblockuserid) | Unblocks a user |
| [GET /api/chat/blocked/](#get-apichatblocked) | Returns the blocked users list |
| [POST /api/chat/rooms/\<room_id\>/read/](#post-apichatroomsroomidread) | Marks a room as read |
| [GET /api/chat/unread/](#get-apichatunread) | Returns unread message counts |
| [GET /api/chat/rooms/\<room_id\>/read-status/](#get-apichatroomsroomidread-status) | Returns read status for a room |
| [DELETE /api/chat/messages/\<message_id\>/delete/](#delete-apichatmessagesmessageiddelete) | Deletes a message (moderator/admin) |
| [POST /api/chat/mute/](#post-apichatmute) | Mutes a user (moderator/admin) |
| [POST /api/chat/unmute/](#post-apichatunmute) | Unmutes a user (moderator/admin) |
| [POST /api/chat/translate/](#post-apichattranslate) | Translates a message via DeepL |

---

#### `GET /api/chat/rooms/<room_id>/messages/`

**Description:** Returns messages in a chat room, ordered by creation date. For global rooms, the last 100 messages are returned. For other rooms, the last 200 messages are returned. DM rooms are restricted to their members.

**Example Request:**
```JSON
GET /api/chat/rooms/1/messages/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
[
	{
		"id": 456,
		"sender": "alice",
		"sender_role": "user",
		"content": "Hello everyone!",
		"created_at": "2026-09-25T10:30:00+00:00"
	}
]
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `401 Unauthorised` | User is not authenticated |
| `403 Forbidden` | User is not a member of the DM room |
| `404 Not Found` | Room does not exist |

---

#### `GET /api/chat/rooms/global/`

**Description:** Returns the global chat room ID. Creates the room if it does not exist.

**Example Request:**
```JSON
GET /api/chat/rooms/global/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
{
	"room_id": 1
}
```

---

#### `POST /api/chat/rooms/dm/<user_id>/`

**Description:** Creates or retrieves a DM room with the specified user. Cannot create a DM with yourself. Blocked users cannot exchange DMs.

**Example Request:**
```JSON
POST /api/chat/rooms/dm/43/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
{
	"room_id": 5
}
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `400 Bad Request` | Cannot create DM with yourself, or user not found |
| `400 Bad Request` | You have blocked this user |
| `401 Unauthorised` | User is not authenticated |
| `403 Forbidden` | This user has blocked you |

---

#### `GET /api/chat/rooms/game/<game_id>/`

**Description:** Returns the chat room for a game. Creates the room if it does not exist.

**Example Request:**
```JSON
GET /api/chat/rooms/game/123/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
{
	"room_id": 8
}
```

---

#### `GET /api/chat/rooms/tournament/<tournament_id>/`

**Description:** Returns the chat room for a tournament. Creates the room if it does not exist.

**Example Request:**
```JSON
GET /api/chat/rooms/tournament/456/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
{
	"room_id": 12
}
```

---

#### `POST /api/chat/block/<user_id>/`

**Description:** Blocks a user. Also removes the friendship and cancels any pending friend requests between the two users.

**Example Request:**
```JSON
POST /api/chat/block/43/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
{
	"status": "blocked"
}
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `400 Bad Request` | Cannot block yourself |
| `400 Bad Request` | User already blocked |
| `401 Unauthorised` | User is not authenticated |
| `404 Not Found` | User not found |

---

#### `DELETE /api/chat/unblock/<user_id>/`

**Description:** Unblocks a previously blocked user.

**Example Request:**
```JSON
DELETE /api/chat/unblock/43/
Authorization: Bearer <access_token>
```

**Response:** `204 No Content`

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `400 Bad Request` | User not blocked |
| `401 Unauthorised` | User is not authenticated |

---

#### `GET /api/chat/blocked/`

**Description:** Returns the list of users blocked by the authenticated user.

**Example Request:**
```JSON
GET /api/chat/blocked/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
[
	{
		"id": 43,
		"username": "bob",
		"blocked_at": "2026-09-25T10:30:00+00:00"
	}
]
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `401 Unauthorised` | User is not authenticated |

---

#### `POST /api/chat/rooms/<room_id>/read/`

**Description:** Marks a chat room as read up to the current time. Broadcasts a read receipt to other room members via WebSocket.

**Example Request:**
```JSON
POST /api/chat/rooms/1/read/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
{
	"status": "read"
}
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `401 Unauthorised` | User is not authenticated |
| `404 Not Found` | Room does not exist |

---

#### `GET /api/chat/unread/`

**Description:** Returns unread message counts across all rooms the user has access to (global, DMs, rooms they have messaged in). Only rooms with unread messages are included.

**Example Request:**
```JSON
GET /api/chat/unread/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
[
	{
		"room_id": 1,
		"room_type": "GLOBAL",
		"unread": 5
	},
	{
		"room_id": 5,
		"room_type": "DM",
		"unread": 2,
		"user_id": 43
	}
]
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `401 Unauthorised` | User is not authenticated |

---

#### `GET /api/chat/rooms/<room_id>/read-status/`

**Description:** Returns the read status for a chat room. For DM rooms, returns only the other member's read status. For non-DM rooms, returns all members' read status (excluding the requesting user).

**Example Request:**
```JSON
GET /api/chat/rooms/5/read-status/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
[
	{
		"username": "bob",
		"last_read_at": "2026-09-25T10:30:00+00:00"
	}
]
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `401 Unauthorised` | User is not authenticated |
| `404 Not Found` | Room does not exist |

---

#### `DELETE /api/chat/messages/<message_id>/delete/`

**Description:** Deletes a chat message. Requires moderator or admin role. Moderators cannot delete messages from admins or other moderators. Broadcasts a deletion event to the room via WebSocket.

**Example Request:**
```JSON
DELETE /api/chat/messages/456/delete/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
{
	"status": "deleted"
}
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `401 Unauthorised` | User is not authenticated |
| `403 Forbidden` | User is not a moderator/admin, or attempted to delete a staff message |
| `404 Not Found` | Message does not exist |

---

#### `POST /api/chat/mute/`

**Description:** Mutes a user for a specified duration. Requires moderator or admin role. Staff members cannot be muted. Broadcasts a system message to the room. Muting can be global (no `room_id`) or room-specific.

**Parameters:**
| Parameter | Type | Required | Description |
|:---------:|:-----|:---------|:------------|
| `user_id` | integer | Yes | ID of the user to mute |
| `duration` | integer | No | Duration in minutes (1–1440). Defaults to 10 |
| `reason` | string | No | Reason for muting |
| `room_id` | integer | No | Room to mute in. Null = global mute |

**Example Request:**
```JSON
POST /api/chat/mute/
Authorization: Bearer <access_token>
Content-Type: application/json

{
	"user_id": 43,
	"duration": 30,
	"reason": "Spamming"
}
```

**Example Response:**
```JSON
{
	"status": "muted",
	"username": "bob",
	"expires_at": "2026-09-25T11:00:00+00:00"
}
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `400 Bad Request` | user_id not provided, or invalid duration |
| `401 Unauthorised` | User is not authenticated |
| `403 Forbidden` | User is not a moderator/admin, or target is a staff member |
| `404 Not Found` | Target user does not exist |

---

#### `POST /api/chat/unmute/`

**Description:** Unmutes a previously muted user. Requires moderator or admin role. Broadcasts a system message to the room.

**Parameters:**
| Parameter | Type | Required | Description |
|:---------:|:-----|:---------|:------------|
| `user_id` | integer | Yes | ID of the user to unmute |
| `room_id` | integer | No | Room to unmute in. Must match the original mute scope |

**Example Request:**
```JSON
POST /api/chat/unmute/
Authorization: Bearer <access_token>
Content-Type: application/json

{
	"user_id": 43
}
```

**Example Response:**
```JSON
{
	"status": "unmuted"
}
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `400 Bad Request` | user_id not provided, or user is not muted |
| `401 Unauthorised` | User is not authenticated |
| `403 Forbidden` | User is not a moderator/admin |
| `404 Not Found` | Target user does not exist |

---

#### `POST /api/chat/translate/`

**Description:** Translates a message using the DeepL API. The source language is auto-detected.

**Parameters:**
| Parameter | Type | Required | Description |
|:---------:|:-----|:---------|:------------|
| `text` | string | Yes | Text to translate |
| `target_lang` | string | Yes | Target language code (e.g. `en`, `fr`, `nl`, `ar`, `he`) |

**Example Request:**
```JSON
POST /api/chat/translate/
Authorization: Bearer <access_token>
Content-Type: application/json

{
	"text": "Bonjour tout le monde!",
	"target_lang": "en"
}
```

**Example Response:**
```JSON
{
	"translated_text": "Hello everyone!"
}
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `400 Bad Request` | Missing text or target_lang |
| `400 Bad Request` | Unsupported target language |
| `401 Unauthorised` | User is not authenticated |
| `502 Bad Gateway` | Translation service failed |

---

### Chess Game

|Endpoint - No Admin Required | Description|
|:----------------------------|:-------------|
|[GET /api/chess/](#get-apichess) | Returns games available to the authenticated user |
|[POST /api/chess/](#post-apichess) | Creates a new chess game|
|[GET /api/chess/\<game_id\>/](#get-apichessgameid) | Returns information about a specific game|
|[POST /api/chess/\<game_id\>/join/](#post-apichessgameidjoin-and-post-apichessgameidleave) | Joins a waiting game|
|[POST /api/chess/\<game_id\>/leave/](#post-apichessgameidjoin-and-post-apichessgameidleave) | Leaves an in-progress game and resigns|
|[DELETE /api/chess/\<game_id\>/cancel/](#delete-apichessgameidcancel) | Cancels a waiting game created by the authenticated user|
|[POST /api/chess/ai/](#post-apichessai) | Creates and starts a game against the AI|
|[POST /api/chess/invite/accept/](#post-apichessinviteaccept) | Accepts a game invitation|

|Endpoint - Admin Required | Description |
|:-------------------------|:-------------|
|[POST /api/chess/cleanup/](#post-apichesscleanup) | Cancels stale waiting games |

#### `GET /api/chess/`

**Description:** Returns games associated with the authenticated user. Waiting games can be requested for lobby browsing, while live games can be requested excluding games in which the authenticated user is already a player. Results are ordered by creation date, newest first. The default page size is 20, with a maximum of 100 results per page.

**Query Parameters:**
|Parameter | Type | Required | Description|
|:---------:|:----|:---------|:------------|
|`status` | string | No | Filters games by status. `WAITING` returns all waiting games. `LIVE` returns in-progress games excluding games where the authenticated user is a player. Other values filter the authenticated user's games by the supplied status|
|`page` | integer | No | Page number |
|`page_size` | integer | No | Number of games per page, up to 100|

**Example Request:**
```JSON
GET /api/chess/?status=WAITING&page=1&page_size=20
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
{
	"count": 2,
	"next": null,
	"previous": null,
	"results": [
		{
			"id": 123
		},
		{
			"id": 122
		}
	]
}
```
**Possible error codes:**
| HTTP status code | Description |
|:-----------------|:------------|
|`401 Unauthorised` | User is not authenticated |

---

#### `POST /api/chess/`

**Description:** Creates a new chess game. The authenticated user becomes the creator and `player1`. A game may optionally be created from a supplied FEN position. The `is_practice` flag can be used to mark the game as a practice game.

**Parameters:**
|Parameter | Location | Type | Required | Description |
|:--------:|:---------|:-----|:---------|:------------|
| `fen` | Body | string | No | Initial board position in FEN format |
| `is_practice` | Body | boolean | No | Marks the game as a practice game |

**Example Request:**
```JSON
POST /api/chess/
Authorization: Bearer <access_token>
Content-Type: application/json

{
	"fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
	"is_practice": false
}
```
**Example Response:**
```JSON
{
	"id": 123
}
```
**Possible error codes:**
| HTTP status code | Description |
|:-----------------|:------------|
|`201 Created` | Game created successfully |
|`400 Bad Request` | Invalid FEN |
|`401 Unauthorised` | User is not authenticated |

---

#### `GET /api/chess/<game_id>/`
**Description:** Returns information about a specific chess game.

**Example Request:**
```JSON
GET /api/chess/123/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
{
	"id": 123
}
```
**Possible error codes:**
|HTTP status code | Description|
|:----------------|:------------|
|`401 Unauthorised` | User is not authenticated |
|`404 Not Found` | Game does not exist |

---

#### `POST /api/chess/<game_id>/join/` and `POST /api/chess/<game_id>/leave/`

**Description:** Joins or leaves a game. Joining: The game changes to IN_PROGRESS and the players are randomly assigned white and black. The current turn is determined from the side to move in the game's FEN position. Leaving: The player resigns and the game is marked as finished.

**Example Request:**
```JSON
POST /api/chess/123/join/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
{
	"id": 123
}
```
**Possible error codes:**
| HTTP status code | Description |
|:-----------------|:-------------|
| `400 Bad Request`  | Game is not waiting for a player|
|`400 Bad Request` | User attempted to join their own game|
|`401 Unauthorised`  | User is not authenticated|
|`404 Not Found` | Game does not exist|

---

#### `DELETE /api/chess/<game_id>/cancel/`

**Description:** Cancels a waiting game. Only the user who created the game can cancel it. The game's status is changed to `CANCELLED` and its result reason is set to `CANCELLED`.

**Example Request:**
```JSON
DELETE /api/chess/123/cancel/
Authorization: Bearer <access_token>
```

**Possible error codes:**
| HTTP status code | Description |
|:-----------------|:------------|
|`204 No Content` | Game cancelled successfully |
|`400 Bad Request` | Game is not in WAITING status|
|`401 Unauthorised` | User is not authenticated|
|`403 Forbidden` | Authenticated user is not the game creator|
|`404 Not Found` | Game does not exist|

---

#### `POST /api/chess/ai/`
**Description:** Creates and immediately starts a chess game against the AI. The AI difficulty must be easy, medium, or hard. An optional timer preset and FEN position may be supplied.

**Parameters:**
| Parameter | Location | Type | Required | Description |
|:---------:|:---------|:-----|:---------|:------------|
|`ai_difficulty` | Body | string | Yes | AI difficulty. Options: `easy`, `medium`, `hard`|
|`timer` | Body | string | No | Valid timer preset|
|`fen` | Body | string | No | Initial board position in FEN format|
|`is_practice` | Body | boolean | No | Marks the game as a practice game|

**Example Request:**
```JSON
POST /api/chess/ai/
Authorization: Bearer <access_token>
Content-Type: application/json

{
	"ai_difficulty": "medium",
	"timer": "10+5",
	"fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
	"is_practice": false
}
```
**Example Response:**
```JSON
{
	"id": 123
}
```
**Possible error codes:**
|HTTP status code | Description|
|:----------------|:-----------|
|`201 Created` | AI game created successfully|
|`400 Bad Request` | Invalid AI difficulty|
|`400 Bad Request` | Invalid timer preset|
|`400 Bad Request` | Invalid FEN|
|`400 Bad Request` | AI user does not exist|
|`401 Unauthorised` | User is not authenticated|
|`500 Internal Server Error` | Starting turn could not be determined|

---

#### `POST /api/chess/invite/accept/`

**Description:** Accepts a game invitation. A new game is created between the user who sent the invitation and the authenticated user. The invitation is consumed after successful acceptance.

**Example Request:**
```JSON
POST /api/chess/invite/accept/
Authorization: Bearer <access_token>
Content-Type: application/json

{
	"invite_id": "abc123"
}
```

**Example Response:**
```JSON
{
	"id": 123
}
```

**Possible error codes:**
|HTTP status code | Description|
|:----------------|:-----------|
|`400 Bad Request` | invite_id is missing|
|`400 Bad Request` | Invitation is expired or invalid|
|`400 Bad Request` | User attempted to accept their own invitation|
|`401 Unauthorised` | User is not authenticated|

---

#### `POST /api/chess/cleanup/`

**Description:** Cancels waiting games that were created before the configured timeout. The endpoint defaults to a 30-minute timeout. This endpoint is intended for administrative cleanup.

**Example Request:**
```JSON
POST /api/chess/cleanup/
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
	"timeout": 30
}
```

**Example Response:**
```JSON
{
	"status": "Cleanup completed",
	"cancelled": 3
}
```

**Possible error codes:**
|HTTP Status code | Description |
|:----------------|:------------|
|`401 Unauthorised` | User is not authenticated |
|`403 Forbidden` | User is not an administrator |

---


### Tournament

| Endpoint - No Admin Required | Description|
|:-----------------------------|:-----------|
|[GET /api/tournaments/](#get-apitournaments-and-get-apitournamentstournamentid) | Returns a list of tournaments|
|[POST /api/tournaments/](#post-apitournaments) | Creates a tournament|
|[GET /api/tournaments/\<tournament_id\>/](#get-apitournaments-and-get-apitournamentstournamentid)| Returns information about a specific tournament|
|[GET /api/tournaments/\<tournament_id\>/participants/](#get-apitournamentstournamentidparticipants)| Returns the participants of a tournament|
|[POST /api/tournaments/\<tournament_id\>/join/](#post-apitournamentstournamentidjoin-and-delete-apitournamentstournamentidleave) | Joins an open tournament|
|[DELETE /api/tournaments/\<tournament_id\>/leave/](#post-apitournamentstournamentidjoin-and-delete-apitournamentstournamentidleave) | Leaves an open tournament|
|[GET /api/tournaments/\<tournament_id\>/matches/](#get-apitournamentstournamentidmatches) | Returns all matches in a tournament|
|[POST /api/tournaments/\<tournament_id\>/matches/\<match_id\>/start/](#post-apitournamentstournamentidmatchesmatchidstart) | Starts a tournament match and creates the associated chess game|
|[POST /api/tournaments/\<tournament_id\>/forfeit/](#post-apitournamentstournamentidforfeit-and-post-apitournamentstournamentiddisqualify-and-post-apitournamentstournamentidcancel) | Forfeits the authenticated player's active tournament matches|


|Endpoint - Moderator/Admin Required | Description|
|:-----------------------------------|:-----------|
|[POST /api/tournaments/\<tournament_id\>/start/](#post-apitournamentstournamentidstart) | Starts a tournament and generates its bracket|
|[PATCH /api/tournaments/\<tournament_id\>/matches/\<match_id\>/](#patch-apitournamentstournamentidmatchesmatchid) | Records the winner of a tournament match|
|[POST /api/tournaments/\<tournament_id\>/disqualify/](#post-apitournamentstournamentidforfeit-and-post-apitournamentstournamentiddisqualify-and-post-apitournamentstournamentidcancel) | Disqualifies a participant from an ongoing tournament|
|[POST /api/tournaments/\<tournament_id\>/cancel/](#post-apitournamentstournamentidforfeit-and-post-apitournamentstournamentiddisqualify-and-post-apitournamentstournamentidcancel) | Cancels a tournament|
|[DELETE /api/tournaments/\<tournament_id\>/delete/](#delete-apitournamentstournamentiddelete) | Deletes a tournament that is not ongoing|
|[POST /api/tournaments/\<tournament_id\>/add-ai/](#post-apitournamentstournamentidadd-ai) | Adds AI participants to an open tournament|

#### `GET /api/tournaments/` and `GET /api/tournaments/<tournament_id>/`
**Description: GET /api/tournaments/:** returns a list of all tournaments. 

**Description: GET /api/tournaments/<tournament_id>/:** returns information about a specific tournament

**Example Request:**
```JSON
GET /api/tournaments/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
[
	{
		"id": 123
	}
]
```

**Possible error codes:**
|HTTP status code | Description|
|:----------------|:-----------|
|`401 Unauthorised` | User is not authenticated |

---


#### `POST /api/tournaments/`

**Description:** Creates a new tournament. Although authentication is required for the endpoint, only staff users can create tournaments. The authenticated staff user is stored as the tournament creator.

**Example Request:**
```JSON
POST /api/tournaments/
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
	"name": "Spring Chess Championship"
}
```

**Example Response:**
```JSON
{
	"id": 123
}
```

|HTTP status code | Description|
|:----------------|:-------------|
|`401 Unauthorised` | User is not authenticated|
|`403 Forbidden` | User is not a staff member|
|`400 Bad Request` | Request contains invalid tournament data|

---
#### `GET /api/tournaments/<tournament_id>/participants/`

**Description:** Returns all participants registered for a tournament, ordered by the time they joined.

**Example Request:**
```JSON
GET /api/tournaments/123/participants/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
[
	{
		"id": 456,
		"player": 42
	}
]
```

**Possible error codes:**
|HTTP status code |Description|
|:----------------|:----------|
|`401 Unauthorised` | User is not authenticated|
|`404 Not Found` | Tournament does not exist|

---

#### `POST /api/tournaments/<tournament_id>/join/` and `DELETE /api/tournaments/<tournament_id>/leave/`

**Description: POST /api/tournaments/<tournament_id>/join/:**
Adds the authenticated user to an open tournament. A user cannot join the same tournament more than once, and the tournament cannot exceed its configured maximum number of players.

**Description: DELETE /api/tournaments/<tournament_id>/leave/:**
Removes the authenticated user from an open tournament. Users cannot leave tournaments that have already started.

**Example Request:**
```JSON
POST /api/tournaments/123/join/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
{
	"id": 456,
	"player": 42
}
```
**Possible error codes:**
| HTTP status code | Description |
|:-----------------|:-------------|
| `400 Bad Request` | Tournament is not open for joining|
|`400 Bad Request` | User has already joined the tournament|
|`400 Bad Request` | Tournament is full|
|`401 Unauthorised` | User is not authenticated|
|`404 Not Found` | Tournament does not exist |


---


#### `POST /api/tournaments/<tournament_id>/start/`
**Description:** Starts an open tournament. At least two participants are required. A complete tournament bracket is generated and the tournament status is changed to ONGOING. Any AI-versus-AI matches in the first round are automatically started.

**Example Request:**
```JSON
POST /api/tournaments/123/start/
Authorization: Bearer <moderator_access_token>
```

**Example Response:**
```JSON
{
	"status": "Tournament started.",
	"matches": [
		{
			"id": 1
		},
		{
			"id": 2
		}
	]
}
```

**Possible error codes:**

|HTTP status code | Description |
|:----------------|:-------------|
|`400 Bad Request` | Tournament is not open|
|`400 Bad Request` | At least 2 participants are required|
|`401 Unauthorised` | User is not authenticated|
|`403 Forbidden` | User is not a moderator or administrator|
|`404 Not Found` | Tournament does not exist|

---

#### `GET /api/tournaments/<tournament_id>/matches/` 
**Description:** Returns all matches belonging to a tournament. Matches are ordered by round number and then match ID.

**Example Request:**
```JSON
GET /api/tournaments/123/matches/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
[
	{
		"id": 1
	},
	{
		"id": 2
	}
]
```

**Possible error codes:**
|HTTP Status code | Description |
|:----------------|:-------------|
| `401 Unauthorised` | User is not authenticated |
|`404 Not Found` | Tournament does not exist |

---

#### `POST /api/tournaments/<tournament_id>/matches/<match_id>/start/`

**Description:** Starts a pending tournament match. The authenticated user must be one of the match players. Starting the match creates an associated chess game using the tournament's time control, assigns player colors randomly, and changes the match status to IN_PROGRESS.

**Example Request:**
```JSON
POST /api/tournaments/123/matches/1/start/
Authorization: Bearer <access_token>
```
**Example Response:**
```JSON
{
	"id": 789
}
```

**Possible error codes:**
|HTTP status code | Description|
|:----------------|:-----------|
|`400 Bad Request`| Tournament is not in progress|
|`400 Bad Request`| Match is not pending|
|`400 Bad Request`| A game has already been created for the match|
|`401 Unauthorised` | User is not authenticated|
|`403 Forbidden` | Authenticated user is not a player in the match|
|`404 Not Found` | Tournament or match does not exist|

---

#### `PATCH /api/tournaments/<tournament_id>/matches/<match_id>/`

**Description:** Records the winner of a pending or in-progress tournament match. The winner must be one of the match players. Finishing the match triggers the tournament bracket advancement logic.

**Parameters:**
| Parameter | Location | Type | Required | Description |
|:---------:|:---------|:-----|:---------|:------------|
|`winner` | Body | integer | Yes | ID of the user who won the match |

**Example Request:**
```JSON
PATCH /api/tournaments/123/matches/1/
Authorization: Bearer <moderator_access_token>
Content-Type: application/json

{
	"winner": 42
}
```
**Example Response:**
```JSON
{
	"status": "Match result recorded",
	"match_id": 1
}
```

**Possible error codes:**
|HTTP status code | Description|
|:----------------|:------------|
|`400 Bad Request`| Match is already finished|
|`400 Bad Request`| Tournament is not in progress|
|`400 Bad Request` | Winner is required|
|`400 Bad Request`| Winner user does not exist|
|`400 Bad Request`| Winner is not one of the match players|
|`401 Unauthorised` | User is not authenticated|
|`403 Forbidden` | User is not a moderator or administrator|
|`404 Not Found` | Match does not exist|

---

#### `POST /api/tournaments/<tournament_id>/forfeit/` and `POST /api/tournaments/<tournament_id>/disqualify/` and `POST /api/tournaments/<tournament_id>/cancel/`

**Description POST /api/tournaments/<tournament_id>/forfeit/:** Forfeits all active matches involving the authenticated participant in an ongoing tournament. For each active match, the opponent is recorded as the winner, the match is finished, and the participant is removed from the tournament.

**Description POST /api/tournaments/<tournament_id>/disqualify/:** Disqualifies a participant from an ongoing tournament. All active matches involving the participant are finished with the opponent recorded as the winner, and the participant is removed from the tournament.

**Description POST /api/tournaments/<tournament_id>/cancel/:** Cancels a tournament. Finished and already cancelled tournaments cannot be cancelled again.

**Example Request:**
```JSON
POST /api/tournaments/123/forfeit/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
{
	"status": "Forfeit Process",
	"player": "alice",
	"updated_matches": [1, 3]
}
```

**Possible error codes:**
|HTTP status code | Description|
|:----------------|:------------|
|`400 Bad Request`| Tournament is not in progress|
|`400 Bad Request` | User is not a participant in the tournament|
|`400 Bad Request` | No active matches to forfeit|
|`401 Unauthorised` | User is not authenticated|
|`404 Not Found` | Tournament does not exist|

---

#### `DELETE /api/tournaments/<tournament_id>/delete/`

**Description:** Deletes a tournament. Ongoing tournaments must be cancelled before they can be deleted.

**Example Request:**
```JSON
DELETE /api/tournaments/123/delete/
Authorization: Bearer <moderator_access_token>
```

**Possible error codes:**
|HTTP status code | Description|
|:----------------|:-----------|
|`400 Bad Request` | Tournament is ongoing and must be cancelled before deletion|
|`401 Unauthorised` | User is not authenticated|
|`403 Forbidden` | User is not a moderator or administrator|
|`404 Not Found` | Tournament does not exist|

---

#### `POST /api/tournaments/<tournament_id>/add-ai/`

**Description:** Adds Stockfish AI users as participants to an open tournament. Between 1 and 15 AI players can be requested. The number of participants cannot exceed the tournament's configured maximum. Existing AI participants with the same username are skipped.

**Parameters:**
| Parameter | Location | Type | Required | Description |
|:---------:|:---------|:-----|:---------|:------------|
|`count` | Body | integer | Yes | Number of AI participants to add. Must be between 1 and 15 |

**Example Request:**
```JSON
POST /api/tournaments/123/add-ai/
Authorization: Bearer <moderator_access_token>
Content-Type: application/json

{
	"count": 4
}
```

**Example Response:**
```JSON
{
	"status": "Added 4 AI players",
	"added": [
		"stockfish_ai_1",
		"stockfish_ai_2",
		"stockfish_ai_3",
		"stockfish_ai_4"
	]
}
```

**Possible error codes:**
|HTTP status code | Description|
|:----------------|:-----------|
|`400 Bad Request` | Tournament is not open|
|`400 Bad Request` | count is not a number|
|`400 Bad Request` | count is outside the range 1–15|
|`400 Bad Request` | Adding the requested players would exceed the tournament's maximum player count|
|`401 Unauthorised` | User is not authenticated|
|`403 Forbidden` | User is not a moderator or administrator|
|`404 Not Found` | Tournament does not exist|

---


### Goose Game

|Endpoint | Description|
|:--------|:-----------|
|[GET /api/goose/](#get-apigoose-and-get-apigoosegameid)| Returns all waiting and in-progress Goose games|
|[POST /api/goose/](#post-apigoose) | Creates a new Goose game|
|[GET /api/goose/\<game_id\>/](#get-apigoose-and-get-apigoosegameid) | Returns information about a specific Goose game|
|[POST /api/goose/\<game_id\>/join/](#post-apigoosegameidjoin)| Joins a waiting Goose game|
|[POST /api/goose/\<game_id\>/start/](#post-apigoosegameidstart) | Starts a waiting Goose game|
|[POST /api/goose/\<game_id\>/leave/](#post-apigoosegameidleave) | Leaves a waiting Goose game|
|[DELETE /api/goose/\<game_id\>/cancel/](#delete-apigoosegameidcancel) | Cancels/deletes a Goose game (creator only)|


#### `GET /api/goose/` and `GET /api/goose/<game_id>/`

**Description GET /api/goose/:** Returns all Goose games that are currently waiting for players or are in progress. Cancelled and completed games are not returned.

**Description GET /api/goose/<game_id>/:** Returns information about a specific Goose game.

**Example Request:**
```JSON
GET /api/goose/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
[
	{
		"id": 123,
		"name": "Alice's game",
		"status": "WAITING",
		"min_players": 2,
		"max_players": 4,
		"created_by": 42,
		"players": [
			{
				"user": 42,
				"turn_order": 0
			}
		]
	}
]
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `401 Unauthorised` | User is not authenticated |

---

#### `POST /api/goose/`

**Description:** Creates a new Goose game. The authenticated user becomes the creator and is automatically added as the first player with turn order 0. The game defaults to 2 minimum players and 4 maximum players.

**Parameters:**
|Parameter | Location |Type | Required | Description|
|:--------:|:---------|:-----|:--------|:--------------|
|`name` | Body | string | No | Name of the game. If omitted or empty, defaults to `<username>'s game` |
|`min_players` | Body | integer | No | Minimum number of players required to start. Defaults to 2 |
|`max_players` | Body | integer | No | Maximum number of players. Defaults to 4; must be between 2 and 6 |

**Example Request:**
```JSON
POST /api/goose/
Authorization: Bearer <access_token>
Content-Type: application/json

{
	"name": "Friday Goose",
	"min_players": 2,
	"max_players": 4
}
```

**Example Response:**
```JSON
{
	"id": 123,
	"name": "Friday Goose",
	"status": "WAITING",
	"min_players": 2,
	"max_players": 4,
	"created_by": 42,
	"players": [
		{
			"user": 42,
			"turn_order": 0
		}
	]
}
```
**Possible error codes:**
|HTTP status code | Description|
|:----------------|:-----------|
|`400 Bad Request` | Maximum players is not between 2 and 6|
|`400 Bad Request` | Minimum players is less than 2 or greater than the maximum|
|`401 Unauthorised` | User is not authenticated|

---

#### `POST /api/goose/<game_id>/join/`

**Description:** Adds the authenticated user to a waiting Goose game. The user's turn order is assigned based on the number of players already in the game.

**Example Request:**
```JSON
POST /api/goose/123/join/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
{
	"id": 123,
	"name": "Friday Goose",
	"status": "WAITING",
	"min_players": 2,
	"max_players": 4,
	"created_by": 42,
	"players": [
		{
			"user": 42,
			"turn_order": 0
		},
		{
			"user": 17,
			"turn_order": 1
		}
	]
}
```

**Possible error codes:**
| HTTP status code | Description |
|:-----------------|:------------|
|`400 Bad Request` | Game is not accepting players|
|`400 Bad Request` | Game is full|
|`400 Bad Request` | User is already in the game|
|`401 Unauthorised` | User is not authenticated|
|`404 Not Found` | Goose game does not exist|

---

#### `POST /api/goose/<game_id>/start/`

**Description:** Starts a waiting Goose game. Only the game creator can start the game. All `max_players` slots must be filled before the game can start.

**Example Request:**
```JSON
POST /api/goose/123/start/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
{
	"id": 123,
	"name": "Friday Goose",
	"status": "IN_PROGRESS",
	"min_players": 2,
	"max_players": 4,
	"created_by": 42,
	"players": [
		{
			"user": 42,
			"turn_order": 0
		},
		{
			"user": 17,
			"turn_order": 1
		}
	]
}
```

**Possible error codes:**
|HTTP status code | Description|
|:----------------|:-----------|
|`400 Bad Request` | Game already started|
|`400 Bad Request` | Waiting for all players to join|
|`401 Unauthorised` | User is not authenticated|
|`403 Forbidden` | Only the creator can start|
|`404 Not Found` | Goose game does not exist|

---

#### `POST /api/goose/<game_id>/leave/`

**Description:** Removes the authenticated user from a waiting Goose game. If the creator leaves, the game is automatically cancelled. Games that are already in progress cannot be left.

**Example Request:**
```JSON
POST /api/goose/123/leave/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
{
	"status": "left"
}
```

**Possible error codes:**
|HTTP status code | Description|
|:----------------|:-----------|
|`400 Bad Request` | Cannot leave a game in progress|
|`400 Bad Request` | Not in this game|
|`401 Unauthorised` | User is not authenticated|
|`404 Not Found` | Goose game does not exist|

---

#### `DELETE /api/goose/<game_id>/cancel/`

**Description:** Deletes a Goose game room. Only the creator can perform this action. Connected players are notified via WebSocket that the room has been closed.

**Example Request:**
```JSON
DELETE /api/goose/123/cancel/
Authorization: Bearer <access_token>
```

**Response:** `204 No Content`

**Possible error codes:**
|HTTP status code | Description|
|:----------------|:-----------|
|`401 Unauthorised` | User is not authenticated|
|`403 Forbidden` | Only the creator can delete this room|
|`404 Not Found` | Goose game does not exist|

---

### Pacman
|Endpoint | Description|
|:--------|:-----------|
|[GET /api/pacman/](#get-apipacman)| Returns active Pac-Man game rooms|
|[POST /api/pacman/](#post-apipacman) | Creates a new Pac-Man game room|
|[GET /api/pacman/\<id\>/](#get-apipacmanid) | Returns information about a Pac-Man game|
|[GET /api/pacman/room/\<room_name\>/](#get-apipacmanroomroomname) | Returns information about a Pac-Man game room by its room name|
|[DELETE /api/pacman/\<id\>/cancel/](#delete-apipacmanidcancel) | Deletes a Pac-Man game room (creator only)|


#### `GET /api/pacman/`

**Description:** Returns a paginated list of Pac-Man game rooms. By default, only active rooms created by or joined by the authenticated user are returned. Waiting rooms can be requested for lobby browsing, and in-progress rooms that the user has not joined can be requested for spectating or joining.

**Query Parameters:**
|Parameter | Type | Required | Description|
|:--------:|:-----|:---------|:-----------|
|`status` | string | No | Filters rooms by status. Supported values include `WAITING`, `LIVE`, `IN_PROGRESS`, and other valid game statuses|
|`page` | integer | No | Page number|
|`page_size` | integer | No | Number of rooms per page, up to 100. Default is 20|

**Example Request:**
```JSON
GET /api/pacman/?status=WAITING
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
{
	"count": 2,
	"next": null,
	"previous": null,
	"results": [
		{
			"id": 123,
			"room_name": "friday-night",
			"status": "WAITING",
			"created_by": 42,
			"players": []
		},
		{
			"id": 124,
			"room_name": "pacman-party",
			"status": "WAITING",
			"created_by": 17,
			"players": []
		}
	]
}
```

**Possible error codes:**
| HTTP status code | Description |
|:-----------------|:------------|
|`401 Unauthorised` | User is not authenticated |

---

#### `POST /api/pacman/`

**Description:** Creates a new Pac-Man game room. The authenticated user becomes the creator of the room, and the room initially has WAITING status.

**Request Parameters:**
|Parameter | Type | Required | Description|
|:---------|:-----|:---------|:-----------|
|`room_name` | string | Yes | Unique name of the game room |
|`name` | string | No | Other game name fields accepted by the serializer |

**Example Request:**
```JSON
POST /api/pacman/
Authorization: Bearer <access_token>
Content-Type: application/json

{
	"room_name": "friday-night"
}
```
**Example Response:**
```JSON
{
	"id": 123,
	"room_name": "friday-night",
	"status": "WAITING",
	"created_by": 42,
	"players": []
}
```

**Possible error codes:**
|HTTP status code | Description |
|:----------------|:------------|
|`400 Bad Request` | Request contains invalid data |
|`400 Bad Request` | A room with the specified `room_name` already exists |
|`401 Unauthorised` | User is not authenticated |

---

#### `GET /api/pacman/<id>/`

**Description:** Returns information about a Pac-Man game room.

**Example Request:**
```JSON
GET /api/pacman/123/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
{
	"id": 123,
	"room_name": "friday-night",
	"status": "WAITING",
	"created_by": 42,
	"players": []
}
```

**Possible error codes:**
| HTTP status code | Description |
|:-----------------|:------------|
|`401 Unauthorised` | User is not authenticated |
|`404 Not Found` | Pac-Man game does not exist |

---

#### `GET /api/pacman/room/<room_name>/`

**Description:** Returns information about a Pac-Man game room identified by its room name. If the room does not exist, the endpoint returns 204 No Content.

**Example Request:**
```JSON
GET /api/pacman/room/friday-night/
Authorization: Bearer <access_token>
```

**Example Response:**
```JSON
{
	"id": 123,
	"room_name": "friday-night",
	"status": "WAITING",
	"created_by": 42,
	"players": []
}
```

**Possible error codes:**
|HTTP status code | Description |
|:----------------|:-------------|
|`204 No Content` | The specified room does not exist |
|`401 Unauthorised` | User is not authenticated |

---

#### `DELETE /api/pacman/<id>/cancel/`

**Description:** Deletes a Pac-Man game room. Only the creator of the room can perform this action. Connected players are notified that the lobby has been closed.

**Example Request:**
```JSON
DELETE /api/pacman/123/cancel/
Authorization: Bearer <access_token>
```

**Possible error codes:**
|HTTP status code | Description |
|:----------------|:-------------|
| `401 Unauthorised` | User is not authenticated |
| `403 Forbidden` | The authenticated user is not the creator of the game |
| `404 Not Found` | Pac-Man game does not exist |

---

### Audit & Security

| Endpoint - Moderator/Admin Required | Description |
|:-------------------------------------|:------------|
| [GET /api/audit/logs/](#get-apiauditlogs) | Returns paginated audit logs |
| [POST /api/audit/unlock/](#post-apiauditunlock) | Manually unlocks a locked account |
| [GET /api/audit/suspicious/](#get-apiauditsuspicious) | Returns suspicious activity in the last 24 hours |

---

#### `GET /api/audit/logs/`

**Description:** Returns paginated audit logs with optional filters. Requires moderator or admin role. Page size is 50.

**Query Parameters:**
| Parameter | Type | Required | Description |
|:---------:|:-----|:---------|:------------|
| `event_type` | string | No | Filter by event type (e.g. `login_failed`, `password_reset`, `account_locked`) |
| `username` | string | No | Filter by username (exact match) |
| `from_date` | string | No | ISO date — include events from this date |
| `to_date` | string | No | ISO date — include events up to this date |
| `page` | integer | No | Page number (default 1) |

**Example Request:**
```JSON
GET /api/audit/logs/?event_type=login_failed&page=1
Authorization: Bearer <admin_access_token>
```

**Example Response:**
```JSON
{
	"results": [
		{
			"id": 1,
			"event_type": "login_failed",
			"username": "bob",
			"ip_address": "192.168.1.100",
			"user_agent": "Mozilla/5.0...",
			"success": false,
			"metadata": {},
			"timestamp": "2026-09-25T10:30:00+00:00"
		}
	],
	"total": 1,
	"page": 1,
	"page_size": 50,
	"total_pages": 1
}
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `401 Unauthorised` | User is not authenticated |
| `403 Forbidden` | User is not a moderator or administrator |

---

#### `POST /api/audit/unlock/`

**Description:** Manually unlocks a locked user account. Requires moderator or admin role. An audit log entry is created for the unlock action.

**Parameters:**
| Parameter | Type | Required | Description |
|:---------:|:-----|:---------|:------------|
| `username` | string | Yes | Username of the account to unlock |

**Example Request:**
```JSON
POST /api/audit/unlock/
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
	"username": "bob"
}
```

**Example Response:**
```JSON
{
	"status": "Account 'bob' unlocked."
}
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `400 Bad Request` | Username not provided |
| `401 Unauthorised` | User is not authenticated |
| `403 Forbidden` | User is not a moderator or administrator |
| `404 Not Found` | User does not exist |

---

#### `GET /api/audit/suspicious/`

**Description:** Returns accounts with suspicious patterns in the last 24 hours: users with 3+ failed logins, recent account lockouts, and recent password resets. Requires moderator or admin role.

**Example Request:**
```JSON
GET /api/audit/suspicious/
Authorization: Bearer <admin_access_token>
```

**Example Response:**
```JSON
{
	"failed_logins": [
		{
			"username": "bob",
			"ip_address": "192.168.1.100",
			"count": 5
		}
	],
	"lockouts": [
		{
			"username": "bob",
			"timestamp": "2026-09-25T10:30:00+00:00",
			"metadata": {}
		}
	],
	"password_resets": [],
	"since": "2026-09-24T10:30:00+00:00"
}
```

**Possible error codes:**
| HTTP status code | Description |
|:----------------|:------------|
| `401 Unauthorised` | User is not authenticated |
| `403 Forbidden` | User is not a moderator or administrator |

---

### Health

| Endpoint | Description |
|:---------|:------------|
| `GET /healthz/` | Basic health check |
| `GET /api/health/` | System health status |
| `GET /api/health/ready` | Readiness probe |

These endpoints are used by Docker health checks and monitoring tools. No authentication required.

---

