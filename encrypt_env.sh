#!/usr/bin/env bash
set -euo pipefail

read -s -p "Vault bootstrap passphrase: " PASSPHRASE
echo

PASSPHRASE="$PASSPHRASE" \
	openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt \
	-in		.env.secrets \
	-out	.env.secrets.enc \
	-pass	env:PASSPHRASE

unset PASSPHRASE

