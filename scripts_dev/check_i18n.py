#!/usr/bin/env python3
"""
check_i18n.py — keep the translation layer honest.

Run:  make check-i18n

Three things drift silently and are painful to find by eye:

  1. A key added to en.ts but not to nl/ar/he. It still renders (English
     fallback), so nobody notices until a demo in Arabic.
  2. A new Django error string with no entry in serverErrors.ts. It reaches
     the user in English no matter which language they picked.
  3. A hard-coded English literal that slipped back into a component.

None of these break the build, which is exactly why they need a check.

Intentional English is allowlisted in the source, so the reason travels
with the code:

  {/* i18n-exempt: brand name */}      JSX, on the line above the literal
  // i18n-exempt: product name          TS/TSX, on the line above
  // i18n-exempt-file: legal text       whole file, in its first 10 lines

The reason after the colon is mandatory; a bare marker is reported.
"""
import ast
import re
import sys
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
MSG = ROOT / "frontend-react/src/i18n/messages"
SRC = ROOT / "frontend-react/src"
DJANGO = ROOT / "backend/django"

GREEN, RED, YELLOW, OFF = "\033[32m", "\033[31m", "\033[33m", "\033[0m"
problems = 0

# -- allowlist markers ----------------------------------------------------
#
# A reason must say WHY the text stays English. "exempt" or "ok" says nothing,
# so those count as missing.
EXEMPT = re.compile(r"i18n-exempt:(.*)")
EXEMPT_FILE = re.compile(r"i18n-exempt-file:(.*)")
FILE_MARKER_LINES = 10
bad_markers = []


def _reason(raw: str) -> str:
    """Text after the colon, minus comment closers like */ and */}."""
    return re.sub(r"\*/\}?\s*$", "", raw).strip()


def _valid(reason: str) -> bool:
    return len(reason) >= 3 and reason.lower() not in ("exempt", "ok", "todo")


def marker_on(line: str, where: str, pattern=EXEMPT) -> bool:
    """True if `line` carries a valid marker; a bare marker is recorded."""
    m = pattern.search(line)
    if not m:
        return False
    if _valid(_reason(m.group(1))):
        return True
    bad_markers.append(where)
    return False


def keys_of(path: pathlib.Path) -> set[str]:
    return set(re.findall(r'^\s+"([^"]+)":', path.read_text(encoding="utf-8"), re.M))


def duplicates_in(path: pathlib.Path) -> list[str]:
    """Keys defined twice in one file.

    Comparing sets between locales cannot see this: a file with a repeated key
    has the same key SET as a correct one. TypeScript flags it (TS1117) but
    only when someone runs tsc, and the later definition silently wins at
    runtime — so the first translation is quietly dead.
    """
    found = re.findall(r'^\s+"([^"]+)":', path.read_text(encoding="utf-8"), re.M)
    seen, dupes = set(), []
    for k in found:
        if k in seen and k not in dupes:
            dupes.append(k)
        seen.add(k)
    return dupes


# -- 1. locale key coverage -----------------------------------------------
#
# config.ts marks each locale complete: true | false. A COMPLETE locale must
# carry every key -- a gap there is a bug, because the user picked that
# language and would silently get English. A PARTIAL locale (Klingon) is
# expected to have gaps; its coverage is reported, not enforced.
#
# Either way, an UNKNOWN key is always an error: it means a typo, or a key
# that was renamed in en.ts and left stale here.
config = (SRC / "i18n/config.ts").read_text(encoding="utf-8")
completeness = {
    m.group(1): m.group(2) == "true"
    for m in re.finditer(r"^\s*(\w+):\s*\{.*?complete:\s*(true|false)", config, re.M)
}

# duplicates first -- they make every later comparison unreliable
for f in sorted(MSG.glob("*.ts")):
    if f.name == "index.ts":
        continue
    dupes = duplicates_in(f)
    if dupes:
        problems += 1
        print(f"  {RED}\u2717{OFF} {f.name}  {len(dupes)} duplicate key(s) — the LAST wins, earlier ones are dead")
        for k in dupes[:10]:
            print(f"        duplicate: {k}")

en = keys_of(MSG / "en.ts")
print(f"  en.ts defines {len(en)} keys")
for loc, is_complete in completeness.items():
    if loc == "en":
        continue
    other = keys_of(MSG / f"{loc}.ts")
    missing, extra = en - other, other - en

    if extra:
        problems += 1
        print(f"  {RED}✗{OFF} {loc}.ts  {len(extra)} key(s) not in en.ts")
        for k in sorted(extra)[:10]:
            print(f"        unknown: {k}")

    if is_complete:
        if missing:
            problems += 1
            print(f"  {RED}✗{OFF} {loc}.ts  missing {len(missing)} key(s)")
            for k in sorted(missing)[:10]:
                print(f"        missing: {k}")
        elif not extra:
            print(f"  {GREEN}✓{OFF} {loc}.ts  all {len(other)} keys present")
    else:
        pct = 100 * len(other) / len(en) if en else 0
        print(f"  {YELLOW}○{OFF} {loc}.ts  partial by design — "
              f"{len(other)}/{len(en)} keys ({pct:.0f}%), rest falls back to English")

# -- 2. every backend message is mapped -----------------------------------
#
# Parsed with ast rather than a regex: a regex cannot tell a string delimiter
# from an apostrophe inside it ("it won't be shown" used to be cut at "won"),
# and it also matched text in comments and docstrings. Here only real dict
# literals count: {"error" | "detail" | "message": "<plain string>"}.
# f-strings (ast.JoinedStr) are skipped -- a dynamic string cannot be mapped.

# Skip chess_game/internal_views.py — its error responses are
# consumed by the timeout checker (a Django management command),
# never by the user interface. Adding these to serverErrors.ts
# would create dead mappings.
BACKEND_SKIP = {"chess_game/internal_views.py"}
MESSAGE_KEYS = {"error", "detail", "message"}

# Backend messages the UI never reads; exempt from mapping.
EXEMPT_MESSAGES = {
    "Save this key — it won't be shown again":
        "dead message; UI shows its own apiKey.saveWarning "
        "(Profile.tsx)",
}

backend = set()
unreadable = []
for f in sorted(DJANGO.rglob("*.py")):
    rel = f.relative_to(DJANGO).as_posix()
    if "migrations" in str(f) or "/tests/" in str(f) or rel in BACKEND_SKIP:
        continue
    try:
        txt = f.read_text(encoding="utf-8")
        tree = ast.parse(txt, filename=str(f))
    except (OSError, UnicodeDecodeError, SyntaxError) as e:
        unreadable.append(f"{rel}: {type(e).__name__}")
        continue
    for node in ast.walk(tree):
        if not isinstance(node, ast.Dict):
            continue
        for k, v in zip(node.keys, node.values):
            if not (isinstance(k, ast.Constant) and k.value in MESSAGE_KEYS):
                continue
            if not (isinstance(v, ast.Constant) and isinstance(v.value, str)):
                continue
            s = v.value.strip()
            if not (3 <= len(s) <= 120) or not s[0].isupper() or s.startswith(("http", "{")):
                continue
            if s.rstrip(".") in EXEMPT_MESSAGES:
                continue
            backend.add(s)

if unreadable:
    problems += 1
    print(f"  {RED}✗{OFF} {len(unreadable)} backend file(s) could not be parsed")
    for u in unreadable[:10]:
        print(f"        {u}")


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip()).rstrip(".").lower()


mapped = set(re.findall(
    r'^\s*"([^"]+)":\s*"srv\.',
    (SRC / "i18n/serverErrors.ts").read_text(encoding="utf-8"), re.M))
uncovered = sorted(s for s in backend if norm(s) not in mapped)

if uncovered:
    problems += 1
    print(f"  {RED}✗{OFF} {len(uncovered)} of {len(backend)} backend messages unmapped")
    for s in uncovered[:15]:
        print(f'        "{s}"')
    print(f"\n     Add each to frontend-react/src/i18n/serverErrors.ts and give it")
    print(f"     an srv.* key in all four message files.")
else:
    print(f"  {GREEN}✓{OFF} all {len(backend)} backend messages mapped")

# -- 3. no hard-coded English left in components --------------------------
#
# Comment lines are skipped: // lines, and {/* */} or /* */ blocks, including
# ones that span several lines. They cannot render, so a literal inside one is
# not a leak.
literal = re.compile(r'>[A-Z][A-Za-z ]{3,40}<|placeholder="[^"]+"|setError\("[^"]+"\)')
skip = re.compile(r"Content-Type|XMLHttp|X-Requested")
leaks = []
for f in sorted(SRC.rglob("*.tsx")):
    if "/i18n/" in str(f):
        continue
    rel = f.relative_to(ROOT)
    lines = f.read_text(encoding="utf-8").split("\n")
    if any(marker_on(l, f"{rel}:{n}", EXEMPT_FILE)
           for n, l in enumerate(lines[:FILE_MARKER_LINES], 1)):
        continue
    in_block = False
    for i, line in enumerate(lines, 1):
        s = line.strip()
        if in_block:
            in_block = "*/" not in s
            continue
        if s.startswith(("{/*", "/*")):
            in_block = "*/" not in s
            continue
        if s.startswith("//"):
            continue
        if literal.search(line) and not skip.search(line):
            if i >= 2 and marker_on(lines[i - 2], f"{rel}:{i - 1}"):
                continue
            leaks.append(f"{rel}:{i}")
if leaks:
    problems += 1
    print(f"  {RED}✗{OFF} {len(leaks)} hard-coded English literal(s)")
    for l in leaks[:12]:
        print(f"        {l}")
else:
    print(f"  {GREEN}✓{OFF} no hard-coded English literals in components")

if bad_markers:
    problems += 1
    print(f"  {RED}✗{OFF} {len(bad_markers)} i18n-exempt marker(s) without a meaningful reason")
    for b in bad_markers[:10]:
        print(f"        {b}")

print()
if problems:
    print(f"{RED}✗ {problems} i18n problem(s){OFF}")
    sys.exit(1)
print(f"{GREEN}✓ i18n is consistent{OFF}")
