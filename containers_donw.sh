#!/usr/bin/env bash

docker stop $(docker ps -q)   # stop all running containers
docker rm $(docker ps -aq)    # remove all containers

