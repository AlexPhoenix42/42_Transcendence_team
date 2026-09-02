
---

We now have everything needed to begin.

**Progress update on the question list:**

1. ✅ Chat scope  
2. ✅ Auth mechanism  
3. ✅ Friendship model  
4. ✅ ASGI setup — seen: plain ASGI, no Channels yet. We’ll upgrade it.  
5. ✅ Redis usage — already used as cache at `redis://redis:6379/1`. We’ll add a `CHANNEL_LAYERS` config using the same Redis instance (separate DB number like `2` for channels).  
6. ⏳ Message history — will be decided after models.

We’re ready to start coding. Here’s the plan — **no implementation yet, just the roadmap so you can green-light it**:

---

### Step 1 — Create the `chat` app and models

New app `chat`. Three models:

- **`ChatRoom`** — fields: `room_type` (enum: `DM`, `GLOBAL`, `TOURNAMENT`, `GAME`), `name` (nullable for DM), `tournament_id` / `game_id` (nullable, for those scoped rooms). For DM rooms, members are two specific users; we’ll enforce that via a unique constraint and a through table.
- **`RoomMembership`** — through model linking `User` and `ChatRoom` with `joined_at`. This lets us efficiently query “which rooms does a user belong to” and control access.
- **`Message`** — fields: `room` (FK to ChatRoom), `sender` (FK to User), `content` (text), `created_at` (auto). Index on `(room, created_at)` for fast history pagination.

All messages persisted in PostgreSQL. Recent messages (e.g., last 50) sent via WebSocket when a user joins a room; older ones fetched through REST with cursor pagination.

---

### Step 2 — Install & configure Django Channels

- Add `daphne` to requirements (if not already) and `channels` to `INSTALLED_APPS` (at the top, before `django.contrib.staticfiles`).
- Add `CHANNEL_LAYERS` in settings using Redis channel layer on `redis://redis:6379/2`.
- Rewrite `config/asgi.py` to use `ProtocolTypeRouter` — HTTP handled by Django’s ASGI app, WebSocket routed to our `chat` consumer.

---

### Step 3 — WebSocket authentication

Write a custom JWT authentication for WebSocket that mimics `JWTAuthentication`. The token will be taken from the `token` query parameter (since browsers don’t support custom headers for WS). We’ll validate it, retrieve the user, and attach it to the connection scope. Unauthorized connections get rejected immediately.

---

### Step 4 — `ChatConsumer`

Handles:

- **`connect`** — authenticate, determine room from URL, verify membership (friends for DM, public for global, registered for tournament/game if applicable), add to group.
- **`disconnect`** — remove from group, update online status.
- **`receive`** — validate input (length, sanitisation), persist message to DB, broadcast to group including sender.
- **Security** — rate limiting per user (using Django cache), HTML escaping, max message length 2000 chars.

---

### Step 5 — REST endpoint for message history

A paginated `GET /chat/rooms/<id>/messages/` that returns messages in chronological order. Only accessible to room members.

---

Does this plan look good? If yes, we’ll start with **Step 1 — models**. I’ll give you the exact code for `chat/models.py`, no filler.

