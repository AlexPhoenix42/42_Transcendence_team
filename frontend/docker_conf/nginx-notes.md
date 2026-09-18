# Migration: owasp/modsecurity:nginx-alpine → owasp/modsecurity-crs:4.25.1-nginx-alpine-lts

## docker-compose.yml changes (frontend_nginx service)

```yaml
    ports:
      - "443:8443"       # was 443:443
      - "80:8080"        # was 80:80
    healthcheck:
      # port changed from 443 → 8443
      test: ["CMD-SHELL", "wget --no-check-certificate --quiet --tries=1 --spider https://127.0.0.1:8443/health || exit 1"]
```

Everything else in the service stays the same (volumes, depends_on, networks, etc).

## Files to DELETE

- `docker_conf/modsecurity/main.conf`
- `docker_conf/modsecurity/modsecurity.conf`

## Stub status port change

The internal stub_status server moved from port `8080` → `8081`.
Find your nginx-exporter config and update accordingly:

```bash
grep -r "stub_status\|8080" docker-compose*.yml prometheus*.yml
```

The exporter should now scrape: `http://trans_frontend_nginx:8081/stub_status`

## Summary of what changed and why

| File | Change | Reason |
|------|--------|--------|
| Dockerfile | Rewrote from scratch | New base image bundles CRS + modsecurity |
| nginx-dep.conf | Removed `load_module`, ports 80→8080/443→8443/8080→8081, new modsecurity_rules_file path | Image auto-loads module; runs unprivileged (no ports <1024); new config path layout |
| modsecurity-override.conf | NEW — replaces modsecurity.conf | Only your custom tuning; base config comes from image |
| exclusions.conf | Content unchanged, COPY target changed | New image expects exclusions at owasp-crs/rules/RESPONSE-999-*.conf |
| main.conf | DELETED | Image's setup.conf handles the include chain |
| modsecurity.conf | DELETED | Replaced by image's base + your override |

