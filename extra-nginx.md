Good. So the complete final design is now:

**Files to create/modify:**
```
.env.dev                          ← current .env renamed, dev values unchanged
.env.dep                          ← new, dep values (https, DEBUG=False)

docker-compose-dev.yml            ← current file, essentially unchanged
docker-compose-dep.yml            ← existing file, frontend_nginx section upgraded

run_dep_secure.sh                 ← one line change: --env-file .env.dep

vault-init/gen_vault_cert.sh      ← add nginx cert generation at the end

frontend/docker_conf/
  Dockerfile                      ← new, FROM owasp/modsecurity-crs:nginx-alpine
  nginx.dev.conf                  ← current nginx.conf renamed
  nginx.dep.conf                  ← new, HTTPS + WAF + all Django routes
  modsecurity/
    modsecurity.conf              ← new
    exclusions.conf               ← new
```

**Nothing else changes** — postgres, redis, vault, vault-init, mailpit, chess_engine, stockfish_ai, timeout_checker all stay identical in both compose files.

---

PLAN:

Here is the complete step-by-step plan:

---

**Step 1 — `settings.py`**
Add `BEHIND_PROXY` flag for `SECURE_PROXY_SSL_HEADER`.

**Step 2 — `vault-init/gen_vault_cert.sh`**
Add nginx cert generation at the end, same pattern as vault cert, writing `nginx-cert.pem` and `nginx-key.pem` to `/vault/certs/`.

**Step 3 — `.env.dep`**
Create dep env file with https values, `BEHIND_PROXY=true`, `DEBUG=True` for now.

**Step 4 — `.env.dev`**
Rename/update current `.env` with `BEHIND_PROXY=false`.

**Step 5 — `frontend/docker_conf/modsecurity/modsecurity.conf`**
Create ModSecurity core config, `DetectionOnly` to start.

**Step 6 — `frontend/docker_conf/modsecurity/exclusions.conf`**
Create Django/DRF/WebSocket/allauth exclusion rules.

**Step 7 — `frontend/docker_conf/nginx.dep.conf`**
Create full nginx config with HTTPS, WAF, all Django routes, rate limiting.

**Step 8 — `frontend/docker_conf/Dockerfile`**
New Dockerfile with `owasp/modsecurity-crs:nginx-alpine`.

**Step 9 — `docker-compose-dep.yml`**
Update `frontend_nginx` section with new image, ports, volumes, depends_on, healthcheck.

**Step 10 — `run_dep_secure.sh`**
Update to use `--env-file .env.dep`.

**Step 11 — `docker-compose-dev.yml`**
Update dev compose to use `nginx.dev.conf` and `.env.dev`.

**Step 12 — Test in DetectionOnly mode**
Bring up dep stack, run through all features, watch audit log, fix false positives.

**Step 13 — Switch to `SecRuleEngine On`**
Once clean, enable enforcement.

---

Each step only when you give the green light. Ready for Step 1?



