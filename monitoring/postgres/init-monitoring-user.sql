-- IMPORTANT THIS FILE IS DEPRICATED:
--  # Read-only Postgres metrics. The prometheus_monitor user is created by the
--  # Postgres entrypoint, which reads its password from Vault (secret/monitoring).

-- Dedicated, read-only user for postgres-exporter.
-- The exporter must NOT use your app/Vault credentials — it only needs
-- to read statistics, so it gets the built-in pg_monitor role and nothing else.
--
-- Run this ONCE against your database, e.g.:
--   docker exec -i trans_db_server psql -U "$(cat /dev/shm/vault-postgres-user)" \
--       -d "$DB_SERVER_DB" < monitoring/postgres/init_monitoring_user.sql
--
-- Replace 'CHANGE_ME_MONITOR_PASS' with the value you put in
-- MONITOR_PASS in your .env (must match the postgres-exporter DSN).

DO
$$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'prometheus_monitor') THEN
      CREATE USER prometheus_monitor WITH PASSWORD 'letsgo@#$';
   END IF;
END
$$;

-- pg_monitor bundles pg_read_all_settings + pg_read_all_stats + pg_stat_scan_tables.
GRANT pg_monitor TO prometheus_monitor;

-- Allow it to connect and see catalogs (read-only).
GRANT CONNECT ON DATABASE postgres TO prometheus_monitor;

