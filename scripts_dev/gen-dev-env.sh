#!/usr/bin/env bash
# Génère .env (git-ignoré) pour ce PC-serveur, à partir de :
#   - .env.dev.template   (committé, placeholders __IP__ / __ORIGINS__, 0 secret)
#   - .env.secrets.enc    (chiffré) -> creds OAuth  [optionnel]
#
# Interroge la machine pour son IP LAN (interface de la route par défaut) et
# adapte toutes les URLs / hosts pour que d'autres postes du réseau se
# connectent sur http://<IP>:3000. Idempotent.
#
# Les conteneurs lisent .env au démarrage : une fois écrit, un redémarrage ne
# re-détecte rien. Changement d'IP -> relancer (`make ip`).
set -euo pipefail
cd "$(dirname "$0")/.."

TEMPLATE=".env.dev.template"
SECRETS_ENC=".env.secrets.enc"
OUT=".env"

[ -f "$TEMPLATE" ] || { echo "!! $TEMPLATE introuvable"; exit 1; }

# --- IP LAN ---------------------------------------------------------------
IP="$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')"
[ -n "${IP:-}" ] || IP="$(hostname -I | awk '{print $1}')"
[ -n "${IP:-}" ] || { echo "!! IP LAN indétectable"; exit 1; }
HOSTN="$(hostname)"
ORIGINS="http://localhost:3000,http://127.0.0.1:3000,http://${IP}:3000,http://${IP}.nip.io:3000,http://${HOSTN}:3000"

# --- template -> .env ---------------------------------------------------
sed -e "s|__IP__|${IP}|g" -e "s|__ORIGINS__|${ORIGINS}|g" "$TEMPLATE" > "$OUT.tmp"

# --- creds OAuth depuis .env.secrets.enc (si dispo) --------------------
CREDS=""
if [ -f "$SECRETS_ENC" ]; then
    PASS="${VAULT_BOOTSTRAP_PASSPHRASE:-}"
    if [ -z "$PASS" ] && [ -t 0 ]; then
        read -rs -p "Passphrase .env.secrets.enc (Entrée pour ignorer) : " PASS; echo
    fi
    if [ -n "$PASS" ]; then
        CREDS="$(PASSPHRASE="$PASS" openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -salt \
            -in "$SECRETS_ENC" -pass env:PASSPHRASE 2>/dev/null \
            | grep -E '^(FT|GOOGLE)_CLIENT_(ID|SECRET)=' || true)"
        unset PASS
    fi
fi

if [ -n "$CREDS" ]; then
    { echo ""; echo "# --- OAuth client creds (depuis $SECRETS_ENC) ---"; echo "$CREDS"; } >> "$OUT.tmp"
    echo "→ creds OAuth injectés depuis $SECRETS_ENC"
else
    { echo ""
      echo "# creds OAuth non injectés (pas de passphrase) -> placeholders,"
      echo "# le login 42/Google ne marchera pas tant qu'ils ne sont pas remplis."
      echo "FT_CLIENT_ID=placeholder"
      echo "FT_CLIENT_SECRET=placeholder"
      echo "GOOGLE_CLIENT_ID=placeholder"
      echo "GOOGLE_CLIENT_SECRET=placeholder"
    } >> "$OUT.tmp"
    echo "→ creds OAuth = placeholders (login local uniquement)"
fi

mv "$OUT.tmp" "$OUT"
echo "  autres postes du LAN : ces URLs, login local test/test1234"
echo "→ .env généré. Accès : http://${IP}:3000  ou  http://${IP}.nip.io:3000 (OAuth)"
