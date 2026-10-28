#!/usr/bin/env bash
docker exec trans_backend_django python manage.py makemigrations "$@"
docker exec trans_backend_django python manage.py migrate

