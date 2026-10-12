# Transcendence Monitoring — Prometheus + Grafana

Rebuild of the `monitoring/` folder for the Django + React + Postgres + Redis +
`owasp/modsecurity:nginx-alpine` stack. Every fix discovered while getting this
working the first time is already applied here — read the notes, they're the
things that actually cost time.

## What you get

- **Prometheus** scraping 5 targets: itself, Django, Postgres, Redis, Nginx/WAF.
- **Grafana** with an auto-provisioned datasource + the "Transcendence Overview"
  dashboard (8 panels: target health, Django request rate, latency quantiles,
  responses by status, Postgres connections, Nginx traffic, Redis, memory).
- **Three exporters**: nginx, postgres (read-only user), redis.
- **Alert rules**: target down, Django 5xx rate, p95 latency, Postgres/Redis health.

## Folder layout

```
monitoring/
├── SETUP.md                         <- this file
├── docker-compose.monitoring.yml    <- overlay: prometheus, grafana, 3 exporters
├── nginx-additions.conf             <- 3 snippets to paste into your nginx conf
├── prometheus/
│   ├── prometheus.yml
│   └── alert_rules.yml
├── grafana/
│   ├── provisioning/
│   │   ├── datasources/datasource.yml
│   │   └── dashboards/dashboards.yml
│   └── dashboards/transcendence-overview.json
└── postgres/
    └── init_monitoring_user.sql
```

---

## Step 0 — data dirs & permissions (do this FIRST)

Prometheus runs as UID **65534**, Grafana as UID **472**. Bind-mounted data dirs
must be owned by those UIDs or the containers crash on "permission denied".
Put this in your stack build script **before** `docker compose up`:

```bash
# 11. Prepare Grafana and Prometheus data dirs
GRAFANA_DATA_DIR="$HOME/goinfre/trans_data/trans_grafana_data"
PRMTHEU_DATA_DIR="$HOME/goinfre/trans_data/trans_prometheus_data"

mkdir -p "$PRMTHEU_DATA_DIR"          # mkdir BEFORE chown, or it fails on a fresh machine
mkdir -p "$GRAFANA_DATA_DIR"

chown -R 65534:65534 "$PRMTHEU_DATA_DIR"
chown -R 472:472     "$GRAFANA_DATA_DIR"   # 472:472, not 472:0 — no need for the root group

chmod 750 "$PRMTHEU_DATA_DIR"
chmod 750 "$GRAFANA_DATA_DIR"
```

## Step 1 — Django app changes

In `config/settings.py`:

**INSTALLED_APPS** — add `django_prometheus`:
```python
INSTALLED_APPS = [
    'django_prometheus',   # <- ADD
    'channels',
    # ... rest unchanged ...
]
```

**MIDDLEWARE** — Before-middleware first, After-middleware last:
```python
MIDDLEWARE = [
    'django_prometheus.middleware.PrometheusBeforeMiddleware',   # <- ADD FIRST (starts timer)
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'config.middleware.LogOAuthDataMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'allauth.account.middleware.AccountMiddleware',
    'django_prometheus.middleware.PrometheusAfterMiddleware',    # <- ADD LAST (stops timer)
]
```

At the bottom where you insert corsheaders, change `0` to `1` so it sits AFTER
the Prometheus before-middleware:
```python
MIDDLEWARE.insert(1, 'corsheaders.middleware.CorsMiddleware')   # was insert(0, ...)
```

**DATABASES** (optional — adds DB connection/query metrics). Change only the
production branch engine; leave the test sqlite3 branch alone:
```python
'ENGINE': 'django_prometheus.db.backends.postgresql',   # was django.db.backends.postgresql
```
It's a thin wrapper over the stock backend — ORM, migrations, Vault creds all
unchanged. Skip it if you'd rather not touch the DB engine; you still get all
HTTP metrics, and postgres-exporter covers DB stats from the other side.

In `config/urls.py`:
```python
from django.urls import path, include

urlpatterns = [
    path('', include('django_prometheus.urls')),   # <- ADD (exposes /metrics)
    # ... rest unchanged ...
]
```

Add the dependency and **rebuild the image** (this bit me — editing settings
without rebuilding gives `ModuleNotFoundError: No module named 'django_prometheus'`):
```bash
echo "django-prometheus" >> backend/django/requirements.txt
docker compose build backend_django
```

## Step 2 — the Django network alias (the DisallowedHost fix)

Django rejects any Host header with underscores → `trans_backend_django:9000`
gives `DisallowedHost` / HTTP 400 forever, no matter what's in ALLOWED_HOSTS.
Fix: give Django a hyphen-only network alias and point Prometheus at that.

In your **main** compose (`docker-compose.yml`), on the Django service:
```yaml
  backend_django:
    ...
    networks:
      trans_net:
        aliases:
          - backend-django
```

In `.env`, add `backend-django` to ALLOWED_HOSTS — **no leading space**
(a stray space becomes part of the hostname and won't match):
```
ALLOWED_HOSTS=localhost,127.0.0.1,mi-r1-p4,10.3.1.4,10.3.1.4.nip.io,trans_backend_django,backend-django
```

`prometheus/prometheus.yml` already targets `backend-django:9000`.

## Step 3 — nginx additions

Paste the three snippets from `nginx-additions.conf` into your
`docker_conf/nginx-dep.conf`: (1) the `stub_status` server on port 8080 for the
nginx-exporter, (2) the `/grafana/` reverse proxy, (3) the `/metrics` deny.
Rebuild the nginx/WAF image if your config is baked in at build time.

## Step 4 — Postgres monitoring user

Set `MONITOR_PASS` in `.env`, put the same value into
`postgres/init_monitoring_user.sql` (replace `CHANGE_ME_MONITOR_PASS`), then:
```bash
docker exec -i trans_db_server psql -U "$(cat /dev/shm/vault-postgres-user)" \
    -d "$DB_SERVER_DB" < monitoring/postgres/init_monitoring_user.sql
```

## Step 5 — env vars

In `.env` (or `.env`):
```
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=<something strong>
MONITOR_PASS=<matches the SQL above>
```

## Step 6 — bring it up

Main stack first (it creates `trans_net`), then the overlay:
```bash
docker compose -f docker-compose.yml -f monitoring/docker-compose.monitoring.yml up -d
```

---

## Verify

```bash
# All 5 targets should read UP
curl -s http://localhost:9090/api/v1/targets | python3 -c "
import json,sys
for t in json.load(sys.stdin)['data']['activeTargets']:
    print(f\"{t['labels']['job']:>12}: {t['health']} {t['lastError'] or ''}\")"

# Django actually serving metrics (run inside the container)
docker exec trans_backend_django python3 -c \
  "import urllib.request; print(urllib.request.urlopen('http://localhost:9000/metrics').read()[:300].decode())"

# Grafana health
curl -s http://localhost:3001/api/health
```

Then open `http://localhost:3001` (or `https://<host>/grafana/`), log in, and
find **Transcendence Overview** in the **Transcendence** folder.

## Gotcha you already hit: Grafana slow after wiping its volume

If you delete `trans_grafana_data` and restart, Grafana is **not broken** — it's
running all its DB migrations from scratch (tables, indexes, default dashboards).
`/api/health` returns "connection reset" until that finishes. Wait ~30s:
```bash
sleep 30 && curl -s http://localhost:3001/api/health
```
Subsequent restarts are fast because the data persists.

## Quick reference

- Prometheus UI: `http://localhost:9090` — `/targets`, `/graph` (try `up`), `/alerts`
- Grafana: `http://localhost:3001` or `https://<host>/grafana/`
- Prometheus collects & stores; Grafana just visualizes it.

