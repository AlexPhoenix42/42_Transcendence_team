# API Documentation

## Overview
This API provides authenticated user, player, leader-board, match-history, analytics, achievement, and administrative user-management functionality.  

Unless otherwise specified, endpoints require an authenticated user.

The API uses JSON for request and response bodies.

**Table of Contents:**
| Endpoints - By Section | Description |
|:-----------------------|:------------|
| [Users](#users) | Managing users, viewing users, viewing user analytics |
| [Two-factor Authentication](#two-factor-authentication) | Enabling and disabling 2fa|
| [Friends](#friends) | Managing friends, viewing friends |
| [Chess Game](#chess-game) | Creating games, joining games, leaving games |
| [Tournaments](#tournament) | Creating tournaments, joining tournaments, leaving tournaments |
| [Goose Game](#goose-game) | Creating games, joining games, leaving games |
| [Pacman](#pacman)| Creating games, joining games, leaving games |


## Base URL
https://\<server name\>:4443

## Authentication
The API supports JWT authentication and Django session authentication.  
For JWT-authenticated requests, provide the access toke using the `Authorization` header:

```
Authorization: Bearer <access_token>
```

The API views use the following authentication configuration:
* `JWT Authentication`
* `Session Authentication`

Administrative endpoints additionaly require the authenticated user to satisfy the `IsAdmin` permission.

##### Authentication requirements
All api endpoints require authentication, with some api endpoints requiring admin authentication.


## Rate Limiting

| Zone | Tracks | Defined Limit |
|:----:|:-------|:--------------|
|`api` | Requests per IP | 30 per min (10 bursts `nodelay`)|
|`auth` | Requests per IP | 5 per min (3 bursts `nodelay`)|
|`perip` | Connections per IP | max 20 concurrent connections |


## Endpoints
### Users

|Endpoint - No Admin Required | Description |
|:--------|:------------|
| [GET /api/me/](#get-apime) | Returns information about the currently authenticated user |
| [GET /api/leaderboard/](#get-apileaderboard) | Returns the top 50 active users ordered by rating and number of wins |
| [GET /api/match-history/](#get-apimatch-history) | Returns the most recent completed games for the authenticated user |
| [GET /api/match-history/\<username\>/](#get-apimatch-history-and-get-apimatch-historyusername) | Returns the match history for the user |
| [GET /api/analytics/](#get-apianalytics) | Returns statistical information about the authenticated user's completed games |
| [GET /api/achievements/](#get-apiachievements-and-get-apiachievementsusername) | Returns achivements and achievement progress for the authenticated user |
| [GET /api/achievements/\<username\>/](#get-apiachievements-and-get-apiachievementsusername) | Returns the achivements for the currently authenticated user |

|Endpoint - Admin Required | Description |
|:-------------------------|:------------|
| [GET /api/users/](#get-apiusers) | Returns a list of users for administrative purposes |
| [PATCH /api/users/\<user_id\>/](#patch-apiusersuserid) | Updates the role and/or active status of a user |
| [DELETE /api/users/\<user_id\>/delete/](#delete-apiusersuserid) | Deletes a user account |


---

#### `GET /api/me/`

**Description** Returns information about the currently authenticated user.  

  

**Parameters:** None  

****Example Request:****
```JSON
GET /api/me/
Authorization: Bearer <access_token>
```

****Example Response:****
```JSON
{
	"id": 42,	//Integer: user ID
	"username": alice, //String: username
	"email": alice@example.com, //String: email address
	"is_online": true, //Boolean: whether the user is online
	"rating": 1450, //Integer: chess rating
	"bio": "Chess Queen", //String: user biography
	"is_staff": false, //Boolean: Django staff status
	"role": "user", //String: Application role
	"avatar": "https://<server_name>:4443/media/avatars.alice.jpg", //String: Absolute url to user's avatar
}
```

****Possible error codes:****  
|HTTP status code | Description |
|:----------------|:------------|
|`401 Unauthorised` | User is not authenticated|

---
#### `GET /api/leaderboard/`
**Description:** Returns the top 50 active users ordered by rating and then number of wins. Users whose usernames begin with `stockfish_ai` are excluded. Users are ordered by rating (descending), and wins (descending).  

  

**Parameters:** None  

****Example Request:****
```JSON
GET /api/leaderboard/
Authorization Bearer <access_token>
```

****Example Response:****
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
	{etc.}
]
```

****Possible error codes:****
|HTTP status code | Description |
|:----------------|:------------|
|`401 Unauthorised` | User is not authenticated|

---
#### `GET /api/match-history/` and `GET /api/match-history/<username>/`
**Description:** Returns the most recent completed games for the authenticated user. If a username is supplied through the URL, the endpoint returns the match history for that user instead. Only finished games are returned. The endpoint returns at most 50 games, ordered by most recently updated first.  

  

**Parameters:** None  

****Example Request:** current user**
```JSON
GET /api/match-history/
Authorization: Bearer <access_token>
```
****Example Request:** specific user**
```JSON
GET /api/match-history/alice/
Authorization: Bearer <access_token>
```

****Example Response:****
```JSON
[
	{
		"id": 123,
		"opponent": "bob",
		"opponent_avatar": null,
		"result": "win", //win, loss or draw
		"result_reason": "checkmate",
		"player_color": "white", //white or black
		"moves_count": 42,
		"date": "2026-09-25T10:30:00+00:00", //time of game completion
		"player2_is_ai": false
	}
]
```

****Possible error codes:****
|HTTP status code | Description |
|:----------------|:------------|
|`401 Unauthorised` | User is not authenticated|
|`404 Not Found` | Username does not exist |

---

#### `GET /api/analytics/`

**Description** Returns statistical information about the authenticated user's completed games  

  

**Parameters:** None  

****Example Request:****
```JSON
GET /api/analytics/
Authorization: Bearer <access_token>
```

****Example Response:****
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
	"recent_from": [ //Results from the most recent games, up to 10
		"win",
		"win",
		"loss",
		"draw",
		"win"
	],
	"most_played": [ //Top five most frequently played opponents
		{
			"username": "bob",
			"games": 15,
		}
	],
	"longest_win_streak": 7,
	"current_streak": { //Current streak
		"type": "win", //Current streak type
		"count": 2 //Current streak value
	}
}
```

****Possible error codes:****
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

****Example Request:****
```JSON
GET /api/users/?search=alice/
Authorization: Bearer <admin_access_token>
```

****Example Response:****
```JSON
[
	{
		"id": 42,
		"username": alice,
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

****Possible error codes:****
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
| `user_id` | integer | Yes | ID of the user to verify|

**Example Request:**  
*<sup>Both fields in the request body are optional</sup>*
```JSON
PATCH /api/users/42/
Authorization: Bearer <admin_access_token>
Content-type: application/json

{
	"role": "moderator", //options: user, moderator, admin
	"is_active": true,
}
```

****Example Response:****
```JSON
{
	"id": 42,
	"username": "alice",
	"role": "moderator",
	"is_active": true
}
```
****Possible error codes:****
|HTTP status code | Description |
|:----------------|:------------|
|`400 Bad Request` | Invalid role |
|`400 Bad Request` | Administrator attempted to modify their ow account |
|`403 Forbidden` | Administrator attempted to modify another administrator |
|`403 Forbidden` | User is not an administrator |
|`404 Not Found` | User does not exist |

---

#### `DELETE /api/users/<user_id>/`

**Description:** Deletes a user account  

**Path Parameters:**
|Parameter | Type | Required | Description |
|:--------:|:-----|:---------|:------------|
|`user_id` | integer | Yes | ID of the user to delete |


****Example Request:****
```JSON
DELETE /api/users/42/
Authorization: Bearer <admin_access_token>
```

****Example Response:****
```JSON
{
	"status": "User 'alice' deleted."
}
```

****Possible error codes:****
|HTTP status code | Description |
|:----------------|:------------|
|`200 OK` | Request completed successfully |
|`400 Bad Request` | Request contains invalid data or violates a business rule |
|`401 Unauthorised` | Authentication is required or the authentication credentials are invalid |
|`403 Forbidden` | The authenticated users does not have permission to perform the operation |
|`404 Not Found` | User/Resource does not exist |

---

#### `GET /api/achievements/` and `GET /api/achievements/<username>/`
**Description:** Returns achievements and achievement process for the authenticated user. If a username is supplied, achievements are returned for that user instead.  

**Parameters:**
|Parameter | Location | Type | Required | Description |
|:--------:|:---------|:-----|:---------|:------------|
|`username` | Path | stirng | No | Username whose achievements should be returned |

****Example Request:** current user**
```JSON
GET /api/achievements
Authorization: Bearer <access_token>
```

****Example Request:** specific user**
```JSON
GET /api/achievements/<username>
Authorization: Bearer <access_token>
```

****Example Response:****
```JSON
{
	"achievements": [
		{
			"id": "first_blood",
			"name": "First Blood",
			"description": "Win your first game",
			"icon": "⚔️",
			"unlocked": wins >= 1
		},
		{
			"id": "veteran",
			"name": "Veteran",
			"description": "Win 10 games",
			"icon": "🎖️",
			"unlocked": wins >= 10,
			"progress": min(wins, 10),
			"target": 10
		},
	],
	"unlocked_count": 2,
	"total_count": 12
}
```

****Possible error codes:****
|HTTP status code | Description |
|:----------------|:------------|
|`401 Unauthorised` | User is not authenticated |
|`404 Not Found` | User/Resource does not exist |

---

### Two-factor Authentication

|Endpoint - No Admin Required | Description|
|:----------------------------|:-----------|
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
| Endpoint - No Admin Required | Description |
|:-----------------------------|:------------|
|[GET /api/friends/](#get-apifriends) | Returns the authenticated user's friends |
|[GET /api/friends/requests/](#get-apifriendsrequests) | Returns pending incoming friend requests for the authenticated user |
|[GET /api/friends/requests/sent/](#get-apifriendsrequestssent) | Returns pending friend requests sent by the authenticated user |
|[POST /api/friends/requests/send/](#post-apifriendsrequestssend) | Sends a friend request to another user |
|[PATCH /api/friends/requests/<request_id>/](#patch-apifriendsrequestsrequestid) | Accepts or declines a pending friend request |
|[DELETE /api/friends/requests/<request_id>/cancel/](#delete-apifriendsrequestsrequestidcancel) | Cancels a pending friend request sent by the authenticated user |
|[DELETE /api/friends/<friend_id>/](#delete-apifriendsfriendid) | Removes a user from the authenticated user's friends |


#### `GET /api/friends/`

**Description:** Returns the friends of the currently authenticated user. Friends are ordered alphabetically by username. The endpoint is paginated and returns up to 50 friends per page by default, with a maximum of 200 friends per page.  

**Query Parameters:**
|Parameters | Type | Required | Description|
|:---------:|:-----|:---------|:-----------|
|`page` | integer | No | Page number to return |
|`page_size` | integer | No | Number of friends per page. Defaults to 50 and has a maximum of 200 |

****Example Request:****
```JSON
GET /api/friends/
Authorization: Bearer <access_token>
```

****Example Response:****
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

****Possible error codes:****
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
|`401 Unauthorised` | User is not authenticated

---

#### `POST /api/friends/requests/send/`

**Description:** Sends a friend request to another user. A friend request cannot be sent to the authenticated user, to an existing friend, or to a user involved in a blocking relationship with the authenticated user. Only one pending request can exist between two users at a time.


**Parameters:**

| Parameters | Type | Required | Description|
|:----------:|:-----|:---------|:-----------|
| `username` | string | Yes | Username of the user to send the friend request to

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
|`action` | string | Yes | Action to perform. Must be accept or decline|

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
|`400 Bad Request` | Invalid action. The action must be accept or decline |
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


### Chess Game

|Endpoint - No Admin Required | Description|
|:----------------------------|:-------------|
|[GET /api/games/](#get-apigames) | Returns games available to the authenticated user |
|[POST /api/games/](#post-apigames) | Creates a new chess game|
|[GET /api/games/<game_id>/](#get-apigamesgameid) | Returns information about a specific game|
|[POST /api/games/<game_id>/join/](#post-apigamesgameidjoin-and-post-apigamesgameidleave) | Joins a waiting game|
|[DELETE /api/games/<game_id>/cancel/](#delete-apigamesgameidcancel) | Cancels a waiting game created by the authenticated user|
|[POST /api/games/<game_id>/leave/](#post-apigamesgameidjoin-and-post-apigamesgameidleave) | Leaves an in-progress game and resigns|
|[POST /api/games/ai/](#post-apigamesai) | Creates and starts a game against the AI|
|[POST /api/games/invite/accept/](#post-apigamesinviteaccept) | Accepts a game invitation|

|Endpoint - Admin Required | Description |
|:-------------------------|:-------------|
|[POST /api/games/cleanup/](#post-apigamescleanup) | Cancels stale waiting games |

#### `GET /api/games`

**Description:** Returns games associated with the authenticated user. Waiting games can be requested for lobby browsing, while live games can be requested excluding games in which the authenticated user is already a player. Results are ordered by creation date, newest first. The default page size is 20, with a maximum of 100 results per page.

**Query Parameters:**
|Parameter | Type | Required | Description|
|:---------:|:----|:---------|:------------|
|`status` | string | No | Filters games by status. WAITING returns all waiting games. LIVE returns in-progress games excluding games where the authenticated user is a player. Other values filter the authenticated user's games by the supplied status|
|`page` | integer | No | Page number |
|`page_size` | integer | No | Number of games per page, up to 100|

**Example Request:**
```JSON
GET /api/games/?status=WAITING&page=1&page_size=20
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

#### `POST /api/games`

**Description:** Creates a new chess game. The authenticated user becomes the creator and `player1`. A game may optionally be created from a supplied FEN position. The `is_practice` flag can be used to mark the game as a practice game.


**Parameters:**
|Parameter | Location | Type | Required | Description |
|:--------:|:---------|:-----|:---------|:------------|
| `fen` | Body | string | No | Initial board position in FEN format |
| `is_practice` | Body | boolean | No | Marks the game as a practice game |

**Example Request:**
```JSON
POST /api/games/
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

#### `GET /api/games/<game_id>`
**Description:** Returns information about a specific chess game.

**Example Request:**
```JSON
GET /api/games/123/
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

#### `POST /api/games/<game_id>/join` and `POST /api/games/<game_id>/leave/`

**Description:** Joins or leaves a game. Joining: The game changes to IN_PROGRESS and the players are randomly assigned white and black. The current turn is determined from the side to move in the game's FEN position. Leaving: 

**Example Request:**
```JSON
POST /api/games/123/join/
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
| `400 Bad Request`  | Game is not waiting for a player
|`400 Bad Request` | User attempted to join their own game
|`401 Unauthorised`  | User is not authenticated
|`404 Not Found` | Game does not exist
---

#### `DELETE /api/games/<game_id>/cancel/`

**Description:** Cancels a waiting game. Only the user who created the game can cancel it. The game's status is changed to `CANCELLED` and its result reason is set to `CANCELLED`.

**Example Request:**
```JSON
DELETE /api/games/123/cancel/
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

#### `POST /api/games/ai/`
**Description:** Creates and immediately starts a chess game against the AI. The AI difficulty must be easy, medium, or hard. An optional timer preset and FEN position may be supplied.

**Parameters:**
| Parameter | Location | Type | Required | Description |
|:---------:|:---------|:-----|:---------|:------------|
|`ai_difficulty` | Body | string | Yes | AI difficulty. Options: easy, medium, hard|
|`timer` | Body | string | No | Valid timer preset|
|`fen` | Body | string | No | Initial board position in FEN format|
|`is_practice` | Body | boolean | No | Marks the game as a practice game|

**Example Request:**
```JSON
POST /api/games/ai/
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

#### `POST /api/games/invite/accept`

**Description:** Accepts a game invitation. A new game is created between the user who sent the invitation and the authenticated user. The invitation is consumed after successful acceptance.

**Example Request:**
```JSON
POST /api/games/invite/accept/
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

#### `POST /api/games/cleanup`

**Description:** Cancels waiting games that were created before the configured timeout. The endpoint defaults to a 30-minute timeout. This endpoint is intended for administrative cleanup.

**Example Request:**
```JSON
POST /api/games/cleanup/
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
|[GET /api/tournaments/](#get-apitournaments-and-get-apitournamenttournamentid) | Returns a list of tournaments|
|[POST /api/tournaments/](#post-apitournaments) | Creates a tournament|
|[GET /api/tournaments/<tournament_id>/](#get-apitournaments-and-get-apitournamenttournamentid) | Returns information about a specific tournament|
|[GET /api/tournaments/<tournament_id>/participants/](#get-apitournamentstournamentidparticipants) | Returns the participants of a tournament|
|[POST /api/tournaments/<tournament_id>/join/](#post-apitournamentstournamentidjoin-and-delete-apitournamentstournamentidleave) | Joins an open tournament|
|[DELETE /api/tournaments/<tournament_id>/leave/](#delete-apitournamentstournamentiddelete) | Leaves an open tournament|
|[GET /api/tournaments/<tournament_id>/matches/](#get-apitournamentstournamentidmatches) | Returns all matches in a tournament|
|[POST /api/tournaments/<tournament_id>/matches/<match_id>/start/](#post-apitournamentstournamentidmatchesmatchidstart) | Starts a tournament match and creates the associated chess game|
|[POST /api/tournaments/<tournament_id>/forfeit/](#post-apitournamentstournamentidforfeit-and-post-apitournamentstournamentiddisqualify-and-post-apitournamentstournamentidcancel) | Forfeits the authenticated player's active tournament matches|


|Endpoint - Moderator/Admin Required | Description|
|:-----------------------------------|:-----------|
|[POST /api/tournaments/<tournament_id>/start/](#post-apitournamentstournamentidstart) | Starts a tournament and generates its bracket|
|[PATCH /api/tournaments/<tournament_id>/matches/<match_id>/](#patch-apitournamentstournamentidmatchesmatchid) | Records the winner of a tournament match|
|[POST /api/tournaments/<tournament_id>/disqualify/](#post-apitournamentstournamentidforfeit-and-post-apitournamentstournamentiddisqualify-and-post-apitournamentstournamentidcancel) | Disqualifies a participant from an ongoing tournament|
|[POST /api/tournaments/<tournament_id>/cancel/](#post-apitournamentstournamentidforfeit-and-post-apitournamentstournamentiddisqualify-and-post-apitournamentstournamentidcancel) | Cancels a tournament|
|[DELETE /api/tournaments/<tournament_id>/delete/](#delete-apitournamentstournamentiddelete) | Deletes a tournament that is not ongoing|
|[POST /api/tournaments/<tournament_id>/add-ai/](#post-apitournamentstournamentidadd-ai) | Adds AI participants to an open tournament|

#### `GET /api/tournaments/` and `GET /api/tournaments/<tournament_id>`
**Description: GET /api/tournaments:** returns a list of all tournaments. 

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
#### `GET /api/tournaments/<tournament_id>/participants`

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

#### `POST /api/tournaments/<tournament_id>/join` and `DELETE /api/tournaments/<tournament_id>/leave/`

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
**Description GET /api/tournaments/<tournament_id>/matches/:** Returns all matches belonging to a tournament. Matches are ordered by round number and then match ID

**Example Request:**
```JSON
GET /api/tournaments/123/matches/
Authorization: Bearer <access_token>
```

**Example Response**
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
|`400 Bad Request `| Tournament is not in progress|
|`400 Bad Request `| Match is not pending|
|`400 Bad Request `| A game has already been created for the match|
|`401 Unauthorised` | User is not authenticated|
|`403 Forbidden` | Authenticated user is not a player in the match|
|`404 Not Found` | Tournament or match does not exist|

---

#### `PATCH /api/tournaments/<tournament_id>/matches/<match_id>/`

**Description:** Records the winner of a pending or in-progress tournament match. The winner must be one of the match players. Finishing the match triggers the tournament bracket advancement logic.

**Parameters:**
| Parameter | Location | Type | Required | Description |
|:---------:|:---------|:-----|:---------|:------------|
|`winner` | Body | integer | Yes | ID of the use who won the match |

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
|`400 Bad Request `| Match is already finished|
|`400 Bad Request `| Tournament is not in progress|
|`400 Bad Request` | Winner is required|
|`400 Bad Request `| Winner user does not exist|
|`400 Bad Request `| Winner is not one of the match players|
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
|`400 Bad Request `| Tournament is not in progress|
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
|`400 Bad Request` | count is outside the range 1-15|
|`400 Bad Request` | Adding the requested players would exceed the tournament's maximum player count|
|`401 Unauthorised` | User is not authenticated|
|`403 Forbidden` | User is not a moderator or administrator|
|`404 Not Found` | Tournament does not exist|

---


### Goose Game

|Endpoint - No Admin Required | Description|
|:----------------------------|:-----------|
|[GET /api/goose-games/](#get-apigoose-games-and-get-apigoose-gamesgameid)| Returns all waiting and in-progress Goose games|
|[POST /api/goose-games/](#post-apigoose-games) | Creates a new Goose game|
|[GET /api/goose-games/<game_id>/](#get-apigoose-games-and-get-apigoose-gamesgameid) | Returns information about a specific Goose game|
|[POST /api/goose-games/<game_id>/join/](#post-apigoose-gamespkjoin) | Joins a waiting Goose game|
|[POST /api/goose-games/<game_id>/start/](#post-apigoose-gamespkstart-and-post-apigoose-gamespkleave) | Starts a waiting Goose game|
|[POST /api/goose-games/<game_id>/leave/](#post-apigoose-gamespkstart-and-post-apigoose-gamespkleave) | Leaves a waiting Goose game|


#### `GET /api/goose-games/` and `GET /api/goose-games/<game_id>`

**Description GET /api/goose-games/:** Returns all Goose games that are currently waiting for players or are in progress. Cancelled and completed games are not returned.

**Description GET /api/goose-games/<game_id>:** Returns information about a specific Goose game.

**Example Request:**
```JSON
GET /api/goose-games/
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
	},
	{
		"id": 124,
		"name": "Friday Goose",
		"status": "IN_PROGRESS",
		"min_players": 2,
		"max_players": 6,
		"created_by": 17,
		"players": [
			{
				"user": 17,
				"turn_order": 0
			},
			{
				"user": 42,
				"turn_order": 1
			}
		]
	}
]
```


**Possible error codes:**
| HTTP status code | Description |
|:----------------|:----------------|
| `401 Unauthorised` | User is not authenticated |


---

#### `POST /api/goose-games/`

**Description:** Creates a new Goose game. The authenticated user becomes the creator and is automatically added as the first player with turn order 0. The game defaults to 2 minimum players and 4 maximum players.


**Parameters:**
|Parameter | Location |Type | Required | Description|
|:--------:|:---------|:-----|:--------|:--------------|
|`name` | Body | string | No | Name of the game. If omitted or empty, defaults to <username>'s game |
|`min_players` | Body | integer | No | Minimum number of players required to start. Defaults to 2 |
|`max_players` | Body | integer | No | Maximum number of players. Defaults to 4; must be between 2 and 6 |


**Example Request:**
```JSON
POST /api/goose-games/
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

#### `POST /api/goose-games/<game_id/join/`

**Description:** Adds the authenticated user to a waiting Goose game. The user's turn order is assigned based on the number of players already in the game.

**Example Request:**
```JSON
POST /api/goose-games/123/join/
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

#### `POST /api/goose-games/<game_id/start/` and `POST /api/goose-games/<game_id/leave/`

**Description POST /api/goose-games/<game_id/start/:** Starts a waiting Goose game. Only the game creator can start the game, and the game must contain at least the configured minimum number of players.

**Description POST /api/goose-games/<game_id/leave/:** Removes the authenticated user from a waiting Goose game. If the creator leaves, the game is automatically cancelled. Games that are already in progress cannot be left.

**Example Request:**
```JSON
POST /api/goose-games/123/start/
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
}```

**Possible error codes:**
|HTTP status code | Description|
|:----------------|:-----------|
|`400 Bad Request` | Game is not accepting players|
|`400 Bad Request` | Game is full|
|`400 Bad Request` | User is already in the game|
|`401 Unauthorised` | User is not authenticated|
|`404 Not Found` | Goose game does not exist|

---

### Pacman
|Endpoint - No Admin Required | Description|
|:----------------------------|:-----------|
|[GET /api/pacman/](#get-apipacman)| Returns active Pac-Man game rooms|
|[POST /api/pacman/](#post-apipacman) | Creates a new Pac-Man game room|
|[GET /api/pacman/<id>/](#get-apipacmanid) | Returns information about a Pac-Man game|
|[DELETE /api/pacman/<id>/cancel/](#delete-apipacmanidcancel) | Deletes a Pac-Man game room. Only the creator can perform this action|
|[GET /api/pacman/room/<room_name>/](#get-apipacmanroomroomname)#get) | Returns information about a Pac-Man game room by its room name|


#### `GET /api/pacman/`

**Description:** Returns a paginated list of Pac-Man game rooms. By default, only active rooms created by or joined by the authenticated user are returned. Waiting rooms can be requested for lobby browsing, and in-progress rooms that the user has not joined can be requested for spectating or joining.

**Query Parameters:**
|Parameter | Type | Required | Description|
|:--------:|:-----|:---------|:-----------|
|`status` | string | No | Filters rooms by status. Supported values include WAITING, LIVE, IN_PROGRESS, and other valid game statuses|
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
|`400 Bad Request` | A roomk with the specified `room_name` already exists |
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
|`404 Not Found` | Pac

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
