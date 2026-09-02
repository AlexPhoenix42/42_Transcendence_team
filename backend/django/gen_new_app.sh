#!/usr/bin/env bash

mkdir -p $1/migrations
touch $1/__init__.py $1/migrations/__init__.py $1/services.py $1/consumers.py $1/routing.py $1/apps.py

