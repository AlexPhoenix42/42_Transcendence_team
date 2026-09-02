#!/usr/bin/env bash

docker exec trans_backend_django python two_factor_auth/2fa_test.py $1 $2

