
---

**What's already done and stays unchanged:**
```
Step 1  ✅ settings.py (BEHIND_PROXY)
Step 2  ✅ vault-init (gen_nginx_cert.sh, init_unseal_vault.sh, Dockerfile)
Step 3  ✅ .env.dep
Step 4  ✅ .env.dev
Step 9  ✅ docker-compose-dep.yml (frontend_nginx section)
Step 10 ✅ run_dep_secure.sh (.env.dep)
```

**What needs to be redone (3 files):**

```
A. frontend/docker_conf/Dockerfile
   - Change FROM to owasp/modsecurity:nginx-alpine
   - Download CRS rules
   - Remove templates and crash-prone script
   - Create audit log dir, add nginx to users group
   - COPY nginx-dep.conf and main.conf

B. frontend/docker_conf/nginx-dep.conf
   - One line change: modsecurity_rules_file path

C. frontend/docker_conf/modsecurity/main.conf  (NEW file)
   - 3 lines: chains modsecurity.conf + CRS setup + CRS rules
```

**What gets deleted:**
```
frontend/docker_conf/modsecurity/modsecurity.conf  (Step 5 — no longer needed, base image has it)
```

**After these 3 files are done:**
```
Step 12 — bring up dep stack, test, read audit log
Step 13 — write exclusions based on audit log
Step 14 — switch SecRuleEngine On
Step 11 — docker-compose-dev.yml (last)
```

---

