#!/usr/bin/env bash

read -s -p "Vault bootstrap passphrase: " PASSPHRASE
echo

PASSPHRASE="$PASSPHRASE" \
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -salt \
    -in ../vault/secrets/vault-bootstrap.enc \
    -pass env:PASSPHRASE | jq -r '.root_token'

unset PASSPHRASE

