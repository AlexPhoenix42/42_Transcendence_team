#!/usr/bin/env bash
# -------------------------------------------------------------------------
#  check_logical_css.sh -- fail if any PHYSICAL direction class is used.
#
#  The app supports Arabic, which renders under dir="rtl". Logical Tailwind
#  utilities (ms-*, me-*, ps-*, pe-*, start-*, end-*, text-start/end) flip
#  automatically with the document direction; physical ones (ml-*, mr-*,
#  left-*, right-*, text-left/right) do not, and produce layouts that are
#  silently wrong in Arabic while looking perfect in English.
#
#  Run:   make check-rtl
#  Or as a pre-commit hook -- see the bottom of this file.
# -------------------------------------------------------------------------
set -uo pipefail

SRC="${1:-frontend-react/src}"

# Matches a class at a boundary (start, quote, space, brace, backtick),
# optionally with a leading hyphen for Tailwind's negative offsets (-right-3),
# and also allows variant prefixes such as md: or hover:.
PATTERN='(^|[" `{(])([a-z0-9]+:)*-?(ml|mr|pl|pr|border-l|border-r|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br|left|right|space-x|divide-x|scroll-ml|scroll-mr|float-left|float-right)-[a-z0-9./]+|(^|[" `{(])([a-z0-9]+:)*(text-left|text-right|float-left|float-right)([" `}]|$)'

# i18n message files legitimately contain the words "right-to-left" in
# comments, and are not layout.
hits=$(grep -rnoE "$PATTERN" \
         --include='*.tsx' --include='*.ts' --include='*.css' \
         "$SRC" 2>/dev/null \
       | grep -v '/i18n/messages/' \
       | grep -vE ':[[:space:]]*(right-to|left-to)([^a-z0-9./]|$)')

# The filter drops the English phrases "right-to-left" / "left-to-right",
# which appear in comments explaining this very subject and which the pattern
# happily matches as though "right-to" were a utility class.
#
# Note the [[:space:]]* -- grep -o emits the leading boundary character that
# the pattern captures, so a match arrives as ": right-to", with a space.
#
# This is the honest cost of a grep rather than an AST-aware lint. The escape
# hatch is narrow: "right-to" and "left-to" are not valid Tailwind utilities,
# so no real class can hide behind it. A physical class written inside a code
# comment would still be reported -- a false positive, but a harmless one.

if [ -z "$hits" ]; then
    printf '\033[32m✓\033[0m no physical direction classes in %s\n' "$SRC"
    exit 0
fi

printf '\033[31m✗ physical direction classes found\033[0m\n\n'
echo "$hits" | sed 's/^/    /'
cat <<'HELP'

  These do not flip under dir="rtl". Replace with the logical equivalent:

      ml-*          ->  ms-*           margin-inline-start
      mr-*          ->  me-*           margin-inline-end
      pl-*          ->  ps-*           padding-inline-start
      pr-*          ->  pe-*           padding-inline-end
      left-*        ->  start-*        inset-inline-start
      right-*       ->  end-*          inset-inline-end
      -right-3      ->  -end-3         (negative offsets too)
      text-left     ->  text-start
      text-right    ->  text-end
      border-l-*    ->  border-s-*
      rounded-l-*   ->  rounded-s-*

  If a physical class is genuinely correct — something that must NOT mirror,
  such as the chessboard or move notation — do not use a physical class for
  it either. Pin the CONTAINER with dir="ltr" and keep logical classes
  inside; they then resolve left-to-right on their own.

HELP
exit 1

# -- Install as a pre-commit hook ----------------------------------------
#   printf '#!/bin/sh\nexec ./scripts_dev/check_logical_css.sh\n' \
#       > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
#
# .git/hooks is not version-controlled, so each developer installs it once.
