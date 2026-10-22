#!/usr/bin/env bash
docker exec -i trans_backend_django python manage.py shell < analytics_mock.py

