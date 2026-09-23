# Pre-existing test failures — `chess_game` and `tournament`

**Date:** 2026-09-23
**Found by:** automated regression check while merging branch `3D-tmp` into `3D` (unrelated task — these failures exist independently of that merge and were confirmed present on `3D` *before* the merge, via `git worktree` on commit `bc57b40`).
**Scope:** these are the only two apps with actual test failures/errors in the whole backend test suite. `goose_game` and `pacman_game` (51 tests) pass cleanly. `chess_coach`, `open_auth`, `two_factor_auth` have no tests at all (0 collected) — a coverage gap, not a failure.

**How to reproduce every number in this report:**
```bash
docker exec trans_backend_django python manage.py test chess_game -v 2
docker exec trans_backend_django python manage.py test tournament -v 2
```
(Run each app separately — running the full suite in one `manage.py test` with no args currently crashes on an unrelated test-discovery bug in `chat`/`friends`/`local_auth`/`users`, described in Issue 5 below, before it even gets to these apps.)

---

## Summary table

| # | App | Failure type | Count | Root cause | Fix effort |
|---|-----|--------------|-------|------------|------------|
| 1 | `chess_game` | ERROR | 53 | Tests `mock.patch()` a `get_redis_connection` symbol in `chess_game/views.py` that no longer exists there | Low — mechanical |
| 2 | `chess_game` | ERROR | 3 | Stale duplicate test file `test_views.py` creates two users with no email → UNIQUE constraint violation | Low — delete or fix file |
| 3 | `chess_game` | ERROR | 1 | Test calls a synchronous ORM operation from inside an async test coroutine without `sync_to_async` | Low — one-line fix |
| 4 | `chess_game` | FAIL | 2 | Tests hardcode URL prefix `/api/games/...`; the real registered prefix is `/api/chess/...` | Low — fix URL in tests |
| 5 | `tournament` | ERROR | 39 | **Real application bug** in `tournament/bracket.py::build_bracket()` — assigns a `TournamentParticipant` object where a `User` is required | **Medium — real bug, breaks starting any tournament** |
| 6 | `tournament` | FAIL | 2 | Test expects `403` for two `/api/chat/...` endpoints when unauthenticated, but they return `401` | Low — decide + align test or view |
| 7 | (all apps) | test-runner crash | n/a | `manage.py test` with no args (or naming `chat`/`friends`/`local_auth`/`users`) throws `ImportError: 'tests' module incorrectly imported` | Unknown — needs investigation |

**Total: 95 ERROR + 4 FAIL = 99 pre-existing test failures**, all outside the scope of the `3D-tmp`→`3D` merge that was being verified when these were found.

---

## Issue 1 — `chess_game`: 53 errors, `get_redis_connection` no longer exists

**Affected test files and error counts:**
- `chess_game/tests/test_all.py` — 33 errors (all of `GameAPITests` + the `GameSerializerTests` class defined in this file)
- `chess_game/tests/test_consumers0.py` — 11 errors (all of `GameConsumerTests`)
- `chess_game/tests/test_ai_consumer.py` — 6 errors (all of `AIConsumerTests`)
- `chess_game/tests/test_consumers_edge.py` — 3 errors (all of `GameConsumerEdgeTests`)

**Exact error (identical for all 53):**
```
Traceback (most recent call last):
  File "/django/chess_game/tests/test_all.py", line 200, in setUp
    self._redis_patcher.start()
  File ".../unittest/mock.py", line 1510, in __enter__
    original, local = self.get_original()
  File ".../unittest/mock.py", line 1480, in get_original
    raise AttributeError(...)
AttributeError: <module 'chess_game.views' from '/django/chess_game/views.py'> does not have the attribute 'get_redis_connection'
```

**Root cause:** every one of these `setUp()` methods does something like:
```python
self._redis_patcher = mock.patch("chess_game.views.get_redis_connection")
self._redis_patcher.start()
```
`mock.patch` needs the target attribute to actually exist on the module at patch time. But `backend/django/chess_game/views.py` no longer imports or defines `get_redis_connection` — the Redis "active games" tracking code was commented out there:
```python
# backend/django/chess_game/views.py, lines 208-209, 320-321, 407-408
#redis_client    = get_redis_connection("default")
#redis_client.sadd("active_games", game.pk)
```
`views.py` imports `from django.core.cache import cache` instead (line 20), which suggests the Redis-based tracking was replaced by Django's cache framework — but the test suite was never updated to match, so every test whose `setUp()` tries to mock the now-nonexistent symbol fails before the actual test body ever runs.

**Whoever fixes this needs to decide:**
1. If the cache-based replacement is the intended final design → delete/rewrite these `mock.patch("chess_game.views.get_redis_connection")` calls to instead patch whatever `django.core.cache.cache` calls replaced them (or remove the mocking entirely if Redis isn't used here anymore).
2. If Redis tracking was supposed to stay and got disabled by accident → uncomment it in `views.py` and re-add the import, which would make these tests pass unchanged.

Either way, this needs someone who knows *why* the redis lines got commented out (check `git blame` / `git log -p` on `chess_game/views.py` around those lines) — this report is not making that product decision.

---

## Issue 2 — `chess_game`: 3 errors, stale duplicate test file `test_views.py`

**Affected tests:** `chess_game/tests/test_views.py::GameSerializerTests::{test_read_only_fields, test_serializer_fields, test_string_related_fields}`

**Exact error:**
```
File "/django/chess_game/tests/test_views.py", line 39, in setUp
    self.p2 = User.objects.create_user(username="bob", password="pass")
...
sqlite3.IntegrityError: UNIQUE constraint failed: users.email
django.db.utils.IntegrityError: UNIQUE constraint failed: users.email
```

**Root cause:** `test_views.py` defines a class named `GameSerializerTests` that duplicates a class of the **exact same name** already present in `chess_game/tests/test_all.py` (which passes fine — see Issue 1, its errors are the redis one, not this one). `test_views.py`'s `setUp()` creates two users without passing an `email=` argument, so both get the model's default empty-string email, and the `User.email` field apparently has a unique constraint — the second `create_user()` call collides with the first and raises `IntegrityError`.

This strongly looks like an **old/orphaned copy of `test_all.py`** left behind after a refactor, not a file anyone is actively maintaining (identical class name + overlapping test names across two files is not something anyone would write on purpose).

**Suggested fix:** confirm with `git log --follow backend/django/chess_game/tests/test_views.py` whether this file predates `test_all.py`; if so, just delete `test_views.py` — its tests are already covered by `test_all.py`. If it needs to stay, fix `setUp()` to pass distinct, non-empty `email=` values for both users.

---

## Issue 3 — `chess_game`: 1 error, sync DB call inside async test

**Affected test:** `chess_game/tests/test_consumers00.py::DebugConsumerTest::test_connect_and_debug`

**Exact error:**
```
File "/django/chess_game/tests/test_consumers00.py", line 37, in run
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(p2).access_token}")
...
File ".../rest_framework_simplejwt/tokens.py", line 344, in for_user
    OutstandingToken.objects.create(...)
...
django.core.exceptions.SynchronousOnlyOperation: You cannot call this from an async context - use a thread or sync_to_async.
```

**Root cause:** `test_connect_and_debug` defines `async def run(): ...` (run via `async_to_sync(run)()`) and, inside that coroutine, calls `RefreshToken.for_user(p2)` directly. `RefreshToken.for_user()` internally does a synchronous Django ORM write (`OutstandingToken.objects.create(...)`), which Django's async-safety guard rejects when called from a real async context.

**Suggested fix:** move the `RefreshToken.for_user(p2)` call outside the `async def run():` block (compute the token synchronously before defining/calling `run`), or wrap it with `await sync_to_async(RefreshToken.for_user)(p2)` if it must stay inside.

---

## Issue 4 — `chess_game`: 2 failures, tests hit the wrong URL prefix (404 instead of 200)

**Affected tests:**
- `chess_game/tests/test_debug2.py::DebugConnectTest::test_connect_as_valid_player`
- `chess_game/tests/test_single.py::FinalTest::test_connect_and_initial_state`

**Exact error:**
```
File "/django/chess_game/tests/test_debug2.py", line 54, in setUp
    self.assertEqual(resp.status_code, 200)
AssertionError: 404 != 200
```

**Root cause:** both tests' `setUp()` do:
```python
resp = self.client.post(f"/api/games/{self.game.pk}/join/", {}, format="json")
self.assertEqual(resp.status_code, 200)
```
But the actual registered route (see `backend/django/config/urls.py` line 33 and `backend/django/chess_game/urls.py`) is:
```python
path('api/chess/', include('chess_game.urls'))   # config/urls.py
path('<int:pk>/join/', GameJoinView.as_view(), name="game-join")   # chess_game/urls.py
```
i.e. the real URL is `/api/chess/<pk>/join/`, not `/api/games/<pk>/join/`. These two test files were written against (or never updated from) an older URL scheme where the chess app was presumably mounted at `/api/games/`.

**Suggested fix:** change `/api/games/` → `/api/chess/` in both files (2-line fix total).

---

## Issue 5 — `tournament`: 39 errors — **real application bug**, not a stale test

This is the one item in this report that is an actual product bug, not test debt. It breaks **starting any tournament with 2 or more participants** in the current codebase.

**Exact error (from `POST /api/tournaments/<id>/start/`):**
```
File "/django/tournament/views.py", line 174, in post
    build_bracket(tournament)
File "/django/tournament/bracket.py", line 74, in build_bracket
    match = Match.objects.create(
        tournament=tournament, round_nb=round_nb, player1=p1, player2=p2, ...
    )
...
ValueError: Cannot assign "<TournamentParticipant: alice in Ongoing Cup (OPEN)>": "Match.player1" must be a "User" instance.
```

**Root cause — `backend/django/tournament/bracket.py`, lines 34-78:**
```python
participants = list(tournament.participants.all())   # line 35 — these are TournamentParticipant objects
...
slots[i] = participants[p_idx]                        # line 53 — TournamentParticipant goes straight into the bracket slots
...
match = Match.objects.create(
    tournament=tournament,
    round_nb=round_nb,
    player1=p1,     # line 77 — p1 is a TournamentParticipant, but Match.player1 is a ForeignKey to User
    player2=p2,
    status=MatchStatus.PENDING,
    game=None,
)
```
`tournament.participants` is a related manager over the `TournamentParticipant` model (a join/wrapper model — the error's `repr` is `<TournamentParticipant: alice in Ongoing Cup (OPEN)>`), but `Match.player1`/`Match.player2` are `ForeignKey(User)`. Nothing in `build_bracket()` unwraps the participant to get the underlying `User` before assigning it.

**Suggested fix:** wherever the `TournamentParticipant` model stores its user reference (check `tournament/models.py` — commonly a field like `.user`), change lines 53/66-67 (or the assignment at 77-78) to store/pass `participant.user` instead of the bare `participant`. This is a one-symbol-per-line fix, but **verify the exact field name on `TournamentParticipant` first** — don't guess at `.user`, confirm it in `tournament/models.py`.

**Why this affects 39 (not just a handful) of the 41 tournament test failures:** almost every other tournament test (`test_disq_forf.py`, `test_match_list.py`, `test_match_results.py`, and several in `test_all2.py`) calls "start the tournament" in its own `setUp()` as a precondition before testing forfeits/disqualification/bracket progression/results — so they all inherit this same crash. Fixing `bracket.py` alone should resolve the large majority of these 39 errors; re-run the suite after the fix rather than assuming all 39 are cleared, since some tests may have their own separate assertions further down.

---

## Issue 6 — `tournament`: 2 failures — chat endpoints return 401 instead of expected 403

**Affected tests:**
- `tournament/tests/test_all.py::TournamentAPITests::test_unauthenticated_denied`
- `tournament/tests/test_all2.py::TournamentAPITests::test_unauthenticated_denied` (same test, duplicated in a second file)

**Exact error:**
```
AssertionError: 401 not found in [403] : Unexpected status 401 for /api/chat/rooms/global/
```

**Root cause / context — from `tournament/tests/test_all.py` lines 66-73:**
```python
urls = [
    ("/api/tournaments/", "get", [401, 403]),
    ("/api/tournaments/1/join/", "post", [403]),        # was [401]
    ("/api/tournaments/1/leave/", "delete", [403]),     # was [401]
    ("/api/tournaments/1/participants/", "get", [403]), # was [401]
    ("/api/chat/rooms/global/", "get", [403]),
    ("/api/chat/rooms/tournament/1/", "get", [403]),
]
```
The `# was [401]` comments show that someone deliberately updated the **tournament** endpoints' expected unauthenticated status from `401` to `403` at some point (presumably after a permission-class change on those views), but the two `/api/chat/...` lines right below were not updated the same way — they still expect `403` while the chat endpoints currently return `401`.

**This needs a product decision, not just a test edit:**
- If `401` is the correct/intended behavior for the chat endpoints (e.g. they use default DRF `IsAuthenticated` behavior, unlike the tournament views which got a custom permission class) → update these two lines' expected codes to `[401]` (or `[401, 403]`).
- If `403` should be the behavior for consistency with the other endpoints → the chat view's permission handling needs the same change the tournament views already got.

Check `chat/views.py`'s permission_classes / authentication_classes for `rooms/global` and `rooms/tournament/<id>` and compare against whatever was changed on the tournament views to figure out which side is "wrong."

---

## Issue 7 — Test-runner crash: `ImportError: 'tests' module incorrectly imported` (chat, friends, local_auth, users)

**Repro:**
```bash
docker exec trans_backend_django python manage.py test          # no args — crashes immediately
docker exec trans_backend_django python manage.py test chat     # crashes
docker exec trans_backend_django python manage.py test friends  # crashes
docker exec trans_backend_django python manage.py test local_auth   # crashes
docker exec trans_backend_django python manage.py test users    # crashes
```

**Exact error (same shape for all four apps, only the path changes):**
```
File ".../unittest/loader.py", line 455, in _find_test_path
    raise ImportError(
        msg % (mod_name, module_dir, expected_dir))
ImportError: 'tests' module incorrectly imported from '/django/friends/tests'. Expected '/django/friends'. Is this module globally installed?
```

**Status: unresolved, needs investigation.** What's been ruled out already, to save whoever picks this up some time:
- Not a stale `__pycache__`/bytecode issue — cleared `friends/__pycache__` entirely and the error persists identically.
- Not a duplicate/shadowing package — there is no `tests`, `chat`, `friends`, `users`, or `local_auth` package anywhere in `site-packages`, and `import tests` fails with `ModuleNotFoundError` as expected when run standalone.
- All four affected apps' `tests/` directories **do** have `__init__.py` (confirmed identical structure to the unaffected apps: `chess_game`, `tournament`, `pacman_game`, `goose_game`, which all discover and run fine, individually or combined).
- It reproduces identically whether the app is tested alone or as part of a combined run — so it is not cross-app pollution within one process.

This points to something specific about these four apps' test *contents* (an internal import inside one of their test files, an `apps.py`/`admin.py` autodiscovery quirk, or something in `INSTALLED_APPS` ordering) rather than a generic environment problem, but pinning it down needs someone to actually step through `unittest.loader.TestLoader._find_test_path`/`_get_name_from_path` with tracing (e.g. monkey-patch `_get_module_from_name` to print every module name it tries to import, then diff the sequence for a working app like `pacman_game` vs a broken one like `friends`) — this report stops here rather than guessing further.

**Practical impact today:** you cannot run `manage.py test` with no arguments at all in this project — it always crashes on `chat` before reaching anything else. You must test app-by-app, explicitly excluding `chat`, `friends`, `local_auth`, `users` from any "run everything" command, e.g.:
```bash
docker exec trans_backend_django python manage.py test chess_coach chess_game goose_game local_auth open_auth pacman_game tournament two_factor_auth users
# ^ this itself will still crash on local_auth/users — list only the apps confirmed to discover cleanly:
docker exec trans_backend_django python manage.py test chess_coach chess_game goose_game open_auth pacman_game tournament two_factor_auth
```

---

## Coverage gap (not a failure, just noting it)

`chess_coach`, `open_auth`, and `two_factor_auth` currently report "Ran 0 tests" — there is no test file (or no `TestCase` subclasses) in these apps at all. Not urgent, but worth knowing if someone assumes these are covered.

---

## What was *not* investigated further (out of scope for this report)

- A `401 Unauthorized` on `POST /api/auth/refresh/` was observed once during a live browser session immediately after a fresh login (via Puppeteer, unrelated to writing this report). It was not chased down — it may be expected behavior (no refresh cookie yet on a brand-new session) or a real minor bug. Flagging it here only so it isn't lost; needs someone to actually check `open_auth`'s refresh view logic against what the frontend does on load.
- The dev Vault container runs in dev-mode/in-memory: **every Vault container restart wipes its secrets**, which makes `trans_backend_django` crash-loop with `KeyError: "Secret path 'django' not found"` until you re-run `docker compose -f docker-compose-dev.yml up -d --force-recreate --no-deps vault-init` and restart the backend. This is a known, already-documented local dev-environment quirk (not a code bug), included here only for completeness since it will otherwise block anyone trying to reproduce the numbers in this report.
