#!/usr/bin/env bash
docker exec trans_backend_django python manage.py makemigrations users
docker exec trans_backend_django python manage.py migrate

