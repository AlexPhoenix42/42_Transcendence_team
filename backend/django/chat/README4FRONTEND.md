
---

## Chat API Specification

### Authentication

- **REST endpoints:** JWT Bearer token in `Authorization` header (as used throughout the app).
- **WebSocket:** Django session cookie (`sessionid`). Browser sends it automatically on the WebSocket upgrade if the cookie is set (same domain). Ensure `credentials: "include"` or equivalent on the frontend when connecting.

---

### WebSocket

**Endpoint:**  
`ws://<host>/ws/chat/<room_id>/`

**Connection:**  
Send a standard WebSocket upgrade request. The session cookie will authenticate the user.  
- If unauthenticated → connection closed with code `4001`.  
- If room does not exist → code `4004` (or close without accept).  
- If forbidden (DM room non‑member) → code `4003`.  
- If scope invalid → code `4000`.  
- On success → connection stays open, client added to the room.

**Sending a message:**  
Send JSON:
```json
{ "content": "Hello, world!" }
```
- Max length: 2000 characters, non‑empty.
- Rate limit: 10 messages per 10 seconds per user. Exceeding returns an error JSON (see below).

**Receiving messages:**  
The server broadcasts a `chat_message` event to all clients in the room:
```json
{
  "id": 42,
  "sender": "alice",
  "content": "Hello, world!",
  "created_at": "2026-08-01T12:34:56.789Z"
}
```

**Error responses (only sent to the sender):**
```json
{ "error": "Invalid JSON" }
{ "error": "Empty message." }
{ "error": "Message content must be 2000 max chars." }
{ "error": "Rate limit exceeded. Please slow down." }
```

**Disconnect:**  
When closing the connection, the client is automatically removed from the room. No special teardown required.

---

### REST: Message History

**Endpoint:**  
`GET /api/chat/rooms/<room_id>/messages/`

**Authentication:** JWT Bearer token required.

**Query parameters:**
- `page` (int) – page number (default 1)
- `page_size` (int) – items per page (default 50, max 100)

**Response (paginated):**
```json
{
  "count": 150,
  "next": "http://.../messages/?page=2",
  "previous": null,
  "results": [
    {
      "id": 1,
      "sender": "alice",
      "content": "Hello",
      "created_at": "2026-08-01T12:00:00Z"
    },
    ...
  ]
}
```
Messages are ordered oldest-first. Paginate backwards to fetch earlier messages.

**Access control:**
- Any authenticated user can read Global / Tournament / Game rooms.
- DM rooms can only be read by their two members (403 otherwise).
- Non‑existent room → 404.

---

### Room Types & IDs

- **Global chat:** A single global room is automatically created. To get its ID, use the endpoint:
  `GET /api/chat/rooms/global/`  
  (This returns `{ "room_id": <id> }` — not yet implemented; your teammate can currently hardcode the ID after looking it up once, or we can add this endpoint now.)
- **Tournament rooms:** One per tournament. The room ID corresponds to the tournament ID; the room is created when the tournament is created. The frontend will receive the `tournament_id` from the tournament API and connect to `/ws/chat/<tournament_id>/` (the actual room ID may differ; we need to decide if room_id == tournament_id or we provide a mapping endpoint). This will be clarified when tournament backend is built.
- **Game spectator rooms:** Same pattern as tournaments – one per game, mapped to `game_id`.

**Recommendation:** Build a small endpoint `GET /api/chat/rooms/resolve/?type=global|tournament|game&id=<entity_id>` that returns the `room_id` to connect to. This prevents coupling between room primary keys and business IDs. If you want me to implement this now, say so.

---

### Summary for Frontend Colleague

1. **Join global chat:** Get global room ID → open WebSocket to that room → listen for `chat_message` events → send messages as JSON.
2. **Show history:** Call `GET /api/chat/rooms/<id>/messages/?page=1` → display results, load older pages on scroll.
3. **Auth:** REST uses JWT; WebSocket uses the session cookie (already set after login).
4. **Errors:** Always check for `error` field in WebSocket responses; show rate-limit warnings gracefully.

---
