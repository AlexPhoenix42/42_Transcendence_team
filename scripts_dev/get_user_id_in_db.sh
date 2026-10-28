#!/usr/bin/env bash
read -p "Username: " USER && docker exec trans_db_server bash -c "PGPASSWORD=\"\$(cat /dev/shm/vault-postgres-password)\" psql -h /var/run/postgresql -U \"\$(cat /dev/shm/vault-postgres-user)\" -d trans_server_db -c \"SELECT id, username, email, dispname FROM users WHERE username = '$USER';\""

