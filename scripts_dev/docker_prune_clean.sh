#!/usr/bin/env bash

# Graceful stop first (SIGTERM, waits for clean shutdown) -- this is
# what your old script's "docker rm -f" skipped, causing Postgres to
# force-shutdown mid-operation and need WAL crash-recovery on next boot.
docker compose stop

# Removes this project's containers and network. --rmi local only
# removes images BUILT by this project's Dockerfiles (backend_django,
# postgres) -- it deliberately leaves pulled images (redis:8-alpine)
# alone, so you're not force-deleting things you'd just re-download.
# --remove-orphans cleans up containers for services no longer in the
# compose file. All of this is scoped to THIS project only -- nothing
# else on the machine is touched.
docker compose down --rmi local --remove-orphans

# NOT run by default, since these delete real data:
# Uncomment only when you want a genuinely fresh start --
# wipes the Postgres data volume and the BuildKit cache.
# rm -rf ${HOME}/goinfre/trans_data/trans_db_server_data
# rm -rf ${HOME}/goinfre/trans_cache

















##!/usr/bin/env bash
#
## 1. Stop and Remove All Containers
## Uses xargs -r to skip the command if no containers exist
#docker ps -aq | xargs -r docker rm -f
#
## 2. Remove All Images
## Uses xargs -r to skip the command if no images exist
#docker images -aq | xargs -r docker rmi -f
#
## 3. Remove All Volumes
## 'docker volume prune' handles empty lists gracefully, no xargs needed
#docker volume prune -a -f
#
## 4. Remove All Unused Networks
## 'docker network prune' handles empty lists gracefully, no xargs needed
#docker network prune -f

