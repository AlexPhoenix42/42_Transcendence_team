#!/usr/bin/env bash
set -euo pipefail

read -s -p "Vault bootstrap passphrase: " PASSPHRASE
echo

path="/dev/shm/${1}.env"

PASSPHRASE="$PASSPHRASE" \
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -salt \
	-in		$1 \
	-out	$path \
	-pass	env:PASSPHRASE
unset PASSPHRASE

cat $path
rm -f $path



















##!/usr/bin/env bash
#set -euo pipefail
#
#read -s -p "Vault bootstrap passphrase: " PASSPHRASE
#echo
#
#PASSPHRASE="$PASSPHRASE" \
#openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -salt \
#	-in		.env.enc \
#	-out	/dev/shm/trans_test.env \
#	-pass	env:PASSPHRASE
#unset PASSPHRASE
#
#cat /dev/shm/trans_test.env
#rm -f /dev/shm/trans_test.env

