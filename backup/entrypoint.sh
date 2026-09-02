#!/bin/sh
set -e

# Ensure log file exists
mkdir -p /app/log
touch /app/log/backup.log

# Optional initial backup on container start (set RUN_INITIAL_BACKUP=true in compose to enable)
if	[ "${RUN_INITIAL_BACKUP:-false}" = "true" ]; then
	echo "Running initial backup..."
	/app/backup.sh
fi

echo "Starting supercronic..."
exec /usr/local/bin/supercronic /app/crontab

