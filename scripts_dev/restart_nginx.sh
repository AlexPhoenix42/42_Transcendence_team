#!/usr/bin/env bash

docker compose -f docker-compose.yml --env-file .env up -d --no-deps --no-build frontend_nginx

