# Backend Production-Readiness Audit

**Scope:** `backend/` (Django app + chess_engine, stockfish_ai, timeout_checker C++ services), plus `docker-compose.yml` and `.env` insofar as they configure the backend.
**Method:** Read-only review (no files modified), split across 6 parallel audits: config/infra, auth (open_auth/local_auth/two_factor_auth/users), game, chat, tournament/friends, and the C++ engine services.
**Date:** 2026-08-12

Findings are grouped by severity. Each entry gives file:line, the concrete failure, and why it matters. "Verified sound" sections list what was checked and found correct, so you know what's already covered.

---

## CRITICAL — fix before any deployment

### 1. `.env` is committed to git with live secrets, and `DEBUG=True` is active
- `/.env` is tracked by git (commit `cbc2a02`: *"I commented out '.env' from my '.gitignore'. I want to save it in my personal fork."*) and contains `SECRET_KEY`, `DB_SERVER_PASS`, `FT_CLIENT_ID`/`FT_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` in plaintext, in git history.
- The active `.env` also has `DEBUG=True`, read directly by `config/settings.py:48`, and `settings.py:50` has `DEBUG_PROPAGATE_EXCEPTIONS = True`. Any unhandled exception currently returns a full Django debug traceback (source, local variables, settings) to the client.
- **Action:** rotate every credential in this file before this fork is ever pushed anywhere public, remove `.env` from tracking, set `DEBUG=False` for any real deployment.

### 2. Shell command injection / RCE in `stockfish_ai`
- `backend/stockfish_ai/srcs/main.cpp:37-45` (`get_best_move`): the `fen` field from the untrusted JSON request body is interpolated verbatim into a shell command string and executed via `popen(cmd.str().c_str(), "r")`. No validation, no escaping — unlike the sibling `chess_engine` service, this file has no `isValidFen`-style check at all.
- Any caller able to influence `fen` sent to `/bestmove` (via `;`, `` ` ``, `$()`, `|`, newline) gets arbitrary command execution inside the container. The container also runs as root (no `USER` in `backend/stockfish_ai/docker_conf/Dockerfile`), so RCE there = root.
- Mitigated somewhat by `stockfish_ai` being `expose:`-only (not `ports:`) in `docker-compose.yml`, so it's not reachable from outside the Docker network directly — but anything on the network, or a bug in the Django call path, can still trigger it.

### 3. Chat endpoints return 500 for every real authenticated user
- `backend/django/chat/views.py:29,49,61`: `MessageListView`, `RoomResolveView`, and `RoomTournamentResolveView` all set `permission_classes = [IsAuthenticated, JWTAuthentication]`. `JWTAuthentication` belongs in `authentication_classes`, not `permission_classes` — it has no `has_permission` method.
- DRF's `APIView.check_permissions()` calls `.has_permission()` on every entry in `permission_classes`. `IsAuthenticated` passes, then `JWTAuthentication().has_permission(...)` raises an uncaught `AttributeError`, which DRF can't convert to a response.
- **This breaks chat message history and both room-resolve endpoints for every logged-in user.** Not confirmed by running the test suite (would have touched `db.sqlite3`), but the DRF control-flow is unambiguous from source.

### 4. Tournament bracket advancement is broken for any non-power-of-2 participant count
- `backend/django/tournament/bracket.py:11-50`, called from `tournament/views.py:177-207` and `tournament/signals.py:52`. `advanced_bracket()` pairs matches by index within the round's match list (0-1, 2-3, ...), not by real seeding/byes.
- **6 participants:** round 1 has 3 matches (odd). The 3rd has no index-sibling, falls into the `elif len(round_matches) > 1` branch, and its winner gets an unearned bye into round 2.
- **5 participants:** the round-1 bye-match is created directly with `status=FINISHED`, never linked to a `Game`. Since `advanced_bracket()` only fires from the `Game` post_save signal or match-result/forfeit views, it's **never invoked with the bye-match**. The bye player is stranded in round 1 permanently; once the sole round-2 match finishes, no `PENDING`/`IN_PROGRESS` matches remain, so the tournament is marked `FINISHED` without the bye player ever playing their final match.
- Only tournaments sized as exact powers of two (2, 4, 8, 16...) produce a correct bracket. Existing tests only cover 2-participant/power-of-2 cases.

### 5. Bracket advancement has no concurrency protection
- `backend/django/tournament/bracket.py:32-39`, called from `signals.py:25-52` (fires on every `Game` → `FINISHED` transition, e.g. from the WebSocket consumer). The only guard against duplicate next-round matches is `Match.objects.get_or_create(...)` — no `transaction.atomic()`, no `select_for_update()`, and no DB-level unique constraint on `Match` covering `(tournament, round_nb, player1, player2)`.
- If two sibling games finish within the same race window (e.g. both players resign near-simultaneously), both signal invocations can pass the sibling-finished check and both execute the SELECT-then-INSERT, producing duplicate `Match` rows for the same pairing. `MatchResultUpdateView` (`views.py:227-285`) has the identical gap — no `transaction.atomic()`, unlike the forfeit/disqualify views which do wrap correctly.

### 6. Game clock/disconnect timeout enforcement never fires in production
- `backend/django/game/management/commands/check_timeouts.py:29` hardcodes Redis `db=2` for the process deployed by `backend/timeout_checker`. Every writer of live game state (`GameConsumer`, `GameJoinView`, `GameCreateAIView`, `GameLeaveView`) uses Django's `"default"` cache pointed at `redis://redis:6379/1` (`config/settings.py:351`). The `active_games` set the checker polls on db 2 is therefore always empty — **the checker's main loop never finds any games.**
- A second, independent bug would still block it even if the DB index were fixed: game state is written through `django_redis`'s `PickleSerializer` with versioned/prefixed keys (`:1:game:123`), while the checker does a raw `redis_client.get(f"game:{game_id}")` + `json.loads(...)`, which won't find the key or parse pickled bytes as JSON.
- **Net effect:** a player can let their clock hit zero, or disconnect permanently, and the opponent is never awarded the win — the game hangs forever.

---

## HIGH

- **`backend/django/game/consumers.py`** — lost-update race on Redis game state. `receive()` (193-310) and `GameLeaveView.post()` (views.py:322-331) do non-atomic read → mutate → `cache.set` with no lock/WATCH/version check. `receive()` re-reads `status` at step 8 to catch a concurrent resignation but then writes back the *original* state object read at step 4 — any Redis change in that window is silently clobbered, and the re-check only guards `status`, not e.g. `disconnected`. Same pattern in `_process_ai_turn`, `connect()`, `disconnect()`.
- **No HTTPS anywhere in the stack** — `frontend_nginx` only publishes `3000:80` (no TLS). `settings.py:71` hardcodes `SESSION_COOKIE_SECURE = False`; no `SECURE_SSL_REDIRECT`, `SECURE_HSTS_SECONDS`, or `SECURE_PROXY_SSL_HEADER` anywhere. All auth/session/JWT traffic, including OAuth codes, runs over plain HTTP.
- **`docker-compose.yml` builds the `dev` target for what's meant to be production** — `backend_django` (line 110) and `postgres` (line 6) both pin `target: dev`, which installs dev tooling (vim, curl, mypy) and bind-mounts a live-editable source tree (`./backend/django:/django`, line 128) instead of shipping an immutable image. There's no separate prod compose file.
- **Out-of-bounds array read via crafted UCI move in `chess_engine`** — `backend/chess_engine/incs/chess.hpp:417`, `Square::is_valid()` only checks the upper bound (`< 64`), never checks `>= 0`. `Square(std::string_view)` (line 328) computes an index from raw character arithmetic with no range validation, so a malformed move string can produce a negative index. `uciToMove()` (chess.hpp:5312-5324) accepts it, then `board.at(source)` indexes a fixed array with no bounds check (the `assert` guard is compiled out in this release build). Reachable directly from `POST /validate`'s `move` field (`engine_server.cpp:100`); it's undefined behavior, not a thrown exception, so the surrounding try/catch doesn't save it — potential crash/DoS or memory disclosure.
- **`local_auth/views.py:205`** (`PasswordResetRequestConfirmView`) — `user.set_password(new_password)` applies zero validation (no length check, no `validate_password`), unlike `RegisterSerializer.validate_password` (local_auth/serializers.py:109-121). A password reset can set an arbitrarily weak password.
- **`open_auth/views/refresh.py`** (`TokenRefreshView`) — never checks `user.is_active` before issuing new tokens, inconsistent with `exchange.py:55` and `two_factor_auth/views.py:203` which both gate on it. A deactivated user can keep refreshing valid sessions indefinitely.
- **`config/settings.py:395-399`** — `CORS_ALLOWED_CREDENTIALS = True` is not a real django-cors-headers setting (should be `CORS_ALLOW_CREDENTIALS`). As written, credentialed cross-origin requests (cookies, including the refresh-token cookie) from `localhost:3000` are silently **not** permitted.
- **`config/settings.py:71`** — `SESSION_COOKIE_SECURE = False` is hardcoded, not tied to `DEBUG` (unlike the JWT cookie logic in `open_auth/views/exchange.py:106`). Under real HTTPS the Django session cookie (OAuth state, admin) would still go out unencrypted.

---

## MEDIUM

- `game/consumers.py:287,430` — `engine_data["new_fen"]` accessed with `[]` instead of `.get()` after only checking `.get("legal")`/`.raise_for_status()`. A 200 response missing `new_fen` raises an unhandled `KeyError` inside `receive()`/`_process_ai_turn()` (not wrapped in try/except there, unlike `connect()`), killing that consumer's message handling.
- `game/consumers.py:197` — no reconciliation if the `game:{id}` Redis key expires (24h TTL) while `game.status` is still `IN_PROGRESS`: `receive()` just returns `STATE_UNAVAILABLE`, never re-hydrates from the DB — permanent soft-lock on any game idle past the TTL.
- No scheduled/cron invocation of `cleanup_stale_games` or `GameCleanupView` anywhere in `docker-compose.yml` — `WAITING` games nobody joins accumulate in the DB forever.
- `tournament/views.py:92-108` (`TournamentJoinView`) — TOCTOU race on `max_players`: the capacity check and `TournamentParticipant.objects.create()` aren't wrapped in `transaction.atomic()`/`select_for_update()`, and there's no DB constraint capping participants. Concurrent joins near the limit can oversubscribe. (Duplicate-join by the same player *is* safely blocked via `unique_together`.)
- `chat/consumers.py:104-120` — `_check_membership` unconditionally returns `True` for `GLOBAL`, `TOURNAMENT`, and `GAME` room types (no `RoomMembership` rows are ever created for them). Any authenticated user can join/post in any tournament's or any game's chat by guessing the integer `room_id`. May be intentional (spectator chat) but worth confirming against product intent, since it also makes tournament chat public to non-entrants.
- `config/settings.py:172` vs `config/asgi.py` — `ASGI_APPLICATION = 'config.asgi.asgi_app'`, but `asgi.py` only defines `application`/`django_asgi_app`; no `asgi_app` exists anywhere. Currently masked because `entrypoint.sh` launches daphne with an explicit path, but will break Channels' `runserver` override or any utility relying on the setting.
- `docker-compose.yml:19-20` — Postgres port `${DB_PORT}:5432` is published via `ports:` (exposed outside the docker network) rather than `expose:` like the internal C++ services; `DB_SERVER_PASS` is only 6 characters.
- `config/middleware.py:10` — `LogOAuthDataMiddleware` unconditionally `print()`s OAuth callback GET params (authorization codes/state) to stdout on every request to the Google callback URL, no `DEBUG` guard.
- `config/settings.py:112` — `django.db.backends` logger hardcoded to `DEBUG` level regardless of the `DEBUG` setting — logs every SQL query with bound parameter values (can include passwords/tokens/PII) to console in production.
- `open_auth/providers/forty_two.py:35,49` and `open_auth/providers/google.py:34,47` — `requests.post`/`get` calls to the 42/Google APIs have no `timeout=`. A slow upstream hangs the request thread indefinitely.
- `stockfish_ai/srcs/main.cpp:31-34` — `wtime`/`btime`/`winc`/`binc` are parsed but the parameters are literally commented out and unused; `get_best_move` always sends `go movetime 1000`. The AI opponent ignores real game clocks/increments.

---

## LOW / cleanup

- `friends/models.py:34-49` — `unique_pending_request` and `unique_pending_request_reverse` `UniqueConstraint`s list the same two fields in different order, which is functionally identical (a constraint is a column set, order doesn't matter) — the comment claiming it blocks the reverse direction is wrong. `SendFriendRequestView` does guard both directions in application code via `select_for_update()`, but that doesn't block a concurrent phantom insert under Postgres `READ COMMITTED`, so two users requesting each other simultaneously could still both succeed.
- `game/management/commands/check_timeouts0.py` — dead, unused duplicate of `check_timeouts.py` with a latent `UnboundLocalError` (references `state` before assignment); still shipped into the `timeout_checker` image.
- `docker-compose.yml:164` — `REDIS_POST: ${REDIS_PORT}` (typo for `REDIS_PORT`) on the `timeout_checker` service; currently harmless because `.env`'s `REDIS_PORT` (6379) is picked up anyway via `env_file`, masking the bug.
- `game/management/commands/cleanup_stale_games.py:37` — cancels stale games without setting `result_reason=CANCELLED`, inconsistent with `GameCleanupView` which does set it.
- `docker_conf/entrypoint.sh:16-19` — runs `"$@"` before `migrate`/`collectstatic` without `exec`ing it; harmless with no Dockerfile `CMD`, but if the container is ever run with an override command, that command runs and then the script *still* falls through into `migrate`/`collectstatic`/daphne inside that one-off container.
- `config/urls.py:41` / `config/views.py:9-10` — `root_debug` view mounted at `/` in all environments (not gated by `DEBUG`), reflects GET query params back as JSON. Not directly exploitable but a debug leftover shipped everywhere.
- `config/settings.py` — unconditional `print(f"SOCIALACCOUNT_ADAPTER = ...")` (line 81), several commented-out dead blocks (duplicate `DATABASES`, logging filter, old `SOCIALACCOUNT_PROVIDERS` block); `CORS_ALLOWED_ORIGINS` hardcoded to `http://localhost:3000` with no env override; no `CSRF_TRUSTED_ORIGINS` anywhere despite CORS being cross-origin.
- `chat/consumers.py:221` — rate limiter fails open (`except Exception: return True`) if Redis/cache is unreachable — unlimited messages during a cache outage. Reasonable tradeoff, worth knowing.
- `chat/signals.py:37` — `logger.exception("...%s", user.pk)` typo'd as `*s`; pk isn't interpolated (cosmetic, only on an already-exceptional path).
- `chat/signals.py` — `force_disconnect_on_logout` is effectively dead code in the real JWT-cookie logout flow: `open_auth/views/logout.py` already force-disconnects manually before calling `django.contrib.auth.logout()`, and by then `request.user` is `AnonymousUser` (JWT is cookie-based, not header-based), so the signal's receiver early-returns. Harmless, just confusing.
- `open_auth/state.py` duplicates `open_auth/oauth_state.py` (unused, nothing imports it); `open_auth/views0.py` (1047 lines, fully commented out) and a commented-out block atop `open_auth/urls.py` are dead code left in the shipped app.
- `local_auth/verification.py:95` — `user.save(update_fields=["email_verfd", "is_active"])` lists `is_active` but the function never sets it; harmless today (nothing currently flips `is_active` for unverified accounts) but misleading and would silently no-op if that logic is ever added.
- Neither `chess_engine` nor `stockfish_ai` Dockerfiles set a non-root `USER` (contrast with `timeout_checker`, which does) — compounds the blast radius of Critical #2.
- `chess_engine` (via cpp-httplib's default behavior, no custom `exception_handler_` registered) sets an `EXCEPTION_WHAT` response header with the raw `e.what()` on uncaught exceptions — minor internal-error info disclosure to whatever reaches these internal-only endpoints.

---

## Verified sound (checked, no issue found)

- **Tournament:** `player1 == player2` self-match blocked by DB `CheckConstraint`; all state-gating (OPEN/ONGOING/FINISHED/CANCELLED checks) present on relevant views; `MatchStartView` correctly uses `transaction.atomic()` + `select_for_update()`; admin-only actions correctly use `IsAdminUser`; no obvious N+1 in reviewed endpoints.
- **Friends:** `FriendRequestListView`/`ResponseFriendRequestView`/`RemoveFriendView` correctly scope to `to_user=request.user` — no IDOR.
- **Chat:** pagination `max_page_size=100` enforced server-side; `select_related("sender")` used where needed; DM/tournament/game room uniqueness is DB-level, not just app logic.
- **Game:** DB-level `CheckConstraint` on `player1 != player2`; correct `select_for_update` locking in join/leave/cancel views; fully read-only serializer fields (no mass-assignment of score/winner/status); timeouts present on all `httpx` calls to the engine/AI services.
- **Auth:** OAuth `state` CSRF protection sound; reset/verification token generation and hashing sound; TOTP secret encryption (Fernet + HKDF from `SECRET_KEY`) sound; recovery-code hashing + single-use tmp_token 2FA flow sound; avatar upload validated via extension allowlist + `PIL.Image.verify()` + size cap + non-traversable path; password-reset flow resists email enumeration; account-linking ownership check in `link.py` sound.
- **C++ services:** `timeout_checker`'s Python polling loop wraps every iteration in broad exception handling plus `restart: unless-stopped`, so no single bad game state kills timeout enforcement process-wide (separate from the Redis-db-mismatch bug above, which stops it from ever finding games at all); cpp-httplib's internal try/catch does correctly turn genuine C++ exceptions into clean 500s (the OOB read in Critical/High #4 is UB, not an exception, so it isn't caught by this).

---

## Suggested priority order

1. Rotate all secrets in `.env`, stop tracking it, set `DEBUG=False` for anything beyond local dev.
2. Fix the `stockfish_ai` command injection (Critical #2) — this is remote code execution.
3. Fix the chat `permission_classes`/`authentication_classes` swap (Critical #3) — chat is currently non-functional for real users.
4. Fix the Redis db mismatch in `check_timeouts.py` (Critical #6) — timeouts silently never fire.
5. Redesign bracket advancement to handle non-power-of-2 participant counts and wrap it in `transaction.atomic()` + `select_for_update()` (Critical #4, #5).
6. Everything else in High, roughly in the order listed.

---

## Fix Tracking Checklist

Check items off as you resolve them. Mirrors the sections above.

### Critical
- [ ] 1. `.env` committed with live secrets + `DEBUG=True` active
- [ ] 2. Shell command injection / RCE in `stockfish_ai` (`main.cpp:37-45`)
- [ ] 3. Chat endpoints 500 for all users — `permission_classes`/`authentication_classes` swap (`chat/views.py:29,49,61`)
- [ ] 4. Tournament bracket broken for non-power-of-2 participant counts (`tournament/bracket.py:11-50`)
- [ ] 5. Bracket advancement race condition — no locking/atomicity (`tournament/bracket.py:32-39`, `signals.py:25-52`)
- [ ] 6. Game timeout enforcement never fires — Redis db/serialization mismatch (`check_timeouts.py:29`)

### High
- [ ] Lost-update race on Redis game state (`game/consumers.py`, `views.py:322-331`)
- [ ] No HTTPS anywhere in the stack (nginx, `SESSION_COOKIE_SECURE`, missing HSTS/SSL-redirect settings)
- [ ] `docker-compose.yml` builds `dev` target for production (`backend_django`, `postgres`)
- [ ] Out-of-bounds array read via crafted UCI move in `chess_engine` (`chess.hpp:417`, `328`, `5312-5324`)
- [ ] Password reset accepts unvalidated/weak passwords (`local_auth/views.py:205`)
- [ ] `TokenRefreshView` doesn't check `user.is_active` (`open_auth/views/refresh.py`)
- [ ] `CORS_ALLOWED_CREDENTIALS` wrong setting name — credentialed CORS silently broken (`settings.py:395-399`)
- [ ] `SESSION_COOKIE_SECURE = False` hardcoded, not tied to `DEBUG` (`settings.py:71`)

### Medium
- [ ] `engine_data["new_fen"]` KeyError on malformed engine response (`game/consumers.py:287,430`)
- [ ] No reconciliation when Redis game key expires while game `IN_PROGRESS` (`game/consumers.py:197`)
- [ ] No scheduled job for `cleanup_stale_games` / `GameCleanupView`
- [ ] TOCTOU race on tournament `max_players` (`tournament/views.py:92-108`)
- [ ] No membership check for GLOBAL/TOURNAMENT/GAME chat rooms (`chat/consumers.py:104-120`) — confirm intended behavior
- [ ] `ASGI_APPLICATION` points to nonexistent `config.asgi.asgi_app`
- [ ] Postgres port published via `ports:` instead of `expose:` (`docker-compose.yml:19-20`)
- [ ] OAuth callback data logged unconditionally (`config/middleware.py:10`)
- [ ] SQL logged at DEBUG level unconditionally (`settings.py:112`)
- [ ] No `timeout=` on 42/Google OAuth provider HTTP calls (`forty_two.py`, `google.py`)
- [ ] `stockfish_ai` ignores real game clocks/increments (`main.cpp:31-34`)

### Low / cleanup
- [ ] Misleading duplicate `UniqueConstraint` in `FriendRequest` (`friends/models.py:34-49`)
- [ ] Dead `check_timeouts0.py` with latent `UnboundLocalError`, still shipped into image
- [ ] `REDIS_POST` typo in `docker-compose.yml:164`
- [ ] `cleanup_stale_games` doesn't set `result_reason=CANCELLED` (`cleanup_stale_games.py:37`)
- [ ] `entrypoint.sh` doesn't `exec "$@"`, runs migrate/collectstatic after override commands
- [ ] Unauthenticated `root_debug` view mounted at `/` in all environments
- [ ] Settings cleanup: stray `print()`, dead commented blocks, hardcoded `CORS_ALLOWED_ORIGINS`, missing `CSRF_TRUSTED_ORIGINS`
- [ ] Chat rate limiter fails open on cache outage (`chat/consumers.py:221`) — acceptable tradeoff, confirm intentional
- [ ] Logging format bug `*s` instead of `%s` (`chat/signals.py:37`)
- [ ] Dead code: `force_disconnect_on_logout` signal never reached in real logout flow
- [ ] Dead files: `open_auth/state.py`, `open_auth/views0.py`, commented block in `open_auth/urls.py`
- [ ] Misleading no-op `update_fields=["is_active"]` (`local_auth/verification.py:95`)
- [ ] Non-root `USER` missing in `chess_engine`/`stockfish_ai` Dockerfiles
- [ ] `EXCEPTION_WHAT` header leaks raw exception text in `chess_engine`
