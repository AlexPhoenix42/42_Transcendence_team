#!/usr/bin/env bash

docker compose -f docker-compose-dep.yml --env-file .env.dep up -d --no-deps --no-build frontend_nginx

