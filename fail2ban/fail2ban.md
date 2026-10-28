# fail2ban + firewall-agent — Privilege-Separated Network Security

## Overview

This module adds **automated IP banning** to the Transcendence stack.
It detects brute-force attacks and WAF repeat offenders in the Nginx
access log, then bans them at the **network level** (iptables) before
they even reach the application.

The key design decision: **privilege separation**. The log analysis
(fail2ban) and the firewall control (firewall-agent) run in separate
containers with different privilege levels.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Host (iptables)                              │
│                                                                     │
│  ┌──────────────────┐    Unix socket    ┌──────────────────────┐    │
│  │   fail2ban       │ ──── BAN/UNBAN ──▶│  firewall-agent      │    │
│  │                  │ ◀──── OK/REJECTED │                      │    │
│  │  • Unprivileged  │                   │  • CAP_NET_ADMIN     │    │
│  │  • No iptables   │                   │  • ~80 lines         │    │
│  │  • Reads logs    │                   │  • iptables only     │    │
│  │  • Non-root user │                   │  • read_only: true   │    │
│  └──────────────────┘                   └──────────────────────┘    │
│         ▲                                          │                │
│         │ reads                                    │ applies        │
│  ┌──────┴──────┐                        ┌──────────▼─────────┐      │
│  │ Nginx logs  │                        │ DOCKER-USER chain  │      │
│  │ (access.log)│                        │ -s <ip> -j DROP    │      │
│  └─────────────┘                        └────────────────────┘      │
└─────────────────────────────────────────────────────────────────────┘
```

## Why privilege separation?

Running fail2ban as root with `CAP_NET_ADMIN` is the common approach,
but it means a compromised fail2ban (complex regex engine, log parsing,
socat) gets full firewall control. Our design:

| Container        | Runs as | Capabilities     | Attack surface          |
|------------------|---------|------------------|------------------------|
| fail2ban         | `fail2ban` user | None       | Large (regex, logs, socat) |
| firewall-agent   | root    | `NET_ADMIN` only | Minimal (~80 lines)    |

If fail2ban is compromised, the attacker can only send `BAN`/`UNBAN`
commands — they **cannot** execute arbitrary iptables rules. The
firewall-agent validates every command: strict IPv4 only, no injection,
no trailing junk.

## Architecture

### fail2ban (unprivileged)

- Runs as dedicated `fail2ban` user (non-root)
- `cap_drop: ALL` — zero Linux capabilities
- Reads Nginx access log via bind mount (read-only)
- Sends `BAN <ip>` / `UNBAN <ip>` to firewall-agent via Unix socket
- Two jails:
  - **transcendence-auth**: 5 failed auth attempts in 15min → ban 30min
  - **transcendence-waf**: 15 WAF/rate-limit blocks in 5min → ban 1h

### firewall-agent (minimal privilege)

- Only container with `CAP_NET_ADMIN`
- ~80 lines of auditable shell script
- Hardened in docker-compose.yml:
  - `cap_drop: ALL` + `cap_add: NET_ADMIN, NET_RAW`
  - `read_only: true` — zero writable filesystems
  - `no-new-privileges: true`
  - `pids_limit: 20` — prevents fork bombs
  - `mem_limit: 32m` — prevents memory exhaustion
- Listens on Unix socket, validates commands, applies iptables rules
- Uses `DOCKER-USER` chain (respected by Docker's own routing)
- Logs every action to stdout (Docker captures it)

### Communication protocol

```
Client → Server:  BAN <ipv4>    or  UNBAN <ipv4>
Server → Client:  OK <detail>   or  REJECTED <reason>

Details:    banned, unbanned, already_banned, not_banned
Rejections: empty_input, trailing_junk, missing_fields,
            invalid_ip, unknown_command
```

### IPC: Unix socket via named volume

The two containers share a Unix socket through a Docker named volume
(`firewall_agent_socket`). Named volume because:

- The socket is ephemeral (recreated on every restart)
- Docker manages cleanup automatically
- No host path dependency
- Permission-controlled (`mode=0660`)

## Files

```
fail2ban/
├── Dockerfile                          # Unprivileged container, non-root
├── jail.d/
│   └── transcendence.conf              # Jail definitions (auth + WAF)
├── filter.d/
│   ├── transcendence-auth.conf         # Regex for failed auth attempts
│   └── transcendence-waf.conf          # Regex for WAF/rate-limit blocks
└── action.d/
    └── socket-ban.conf                 # Custom action: send to socket

firewall-agent/
├── Dockerfile                          # Minimal Alpine + iptables + socat
└── firewall-agent.sh                   # ~80 line firewall agent
```

## Jails

### transcendence-auth

Catches brute-force on authentication endpoints:
- `/api/login/`, `/api/register/`, `/api/password-reset/`,
  `/api/auth/`, `/api/2fa-reset/`
- Triggers on HTTP 401, 403, 429
- **5 failures in 15 minutes → ban for 30 minutes**
- Mirrors the app-level account lockout at the network level

### transcendence-waf

Catches repeat offenders blocked by ModSecurity or rate limiting:
- Any endpoint returning 403 (WAF block) or 429 (rate limit)
- Excludes auth endpoints (handled by the auth jail with stricter thresholds)
- **15 blocks in 5 minutes → ban for 1 hour**
- Higher threshold because some 403s can be false positives

## Why Nginx access log instead of ModSecurity audit log?

- ModSecurity's serial audit format is hard to parse with fail2ban
- Every ModSecurity block shows up as 403 in the Nginx access log
- The client IP in the access log is always correct
- One log source for both WAF blocks and rate-limit hits

## Security guarantees

1. **fail2ban compromised?** Attacker can only send BAN/UNBAN commands
   with validated IPv4 addresses. Cannot run arbitrary iptables rules,
   cannot escalate privileges, cannot write to any filesystem.

2. **firewall-agent compromised?** Attacker has `NET_ADMIN` only.
   Cannot read/write files (`read_only: true`), cannot spawn processes
   beyond limit (`pids_limit: 20`), cannot consume memory (`mem_limit: 32m`),
   cannot escalate (`no-new-privileges`).

3. **Socket compromised?** Only containers with the named volume mounted
   can access it. Permission `0660` restricts read/write access.

4. **No secrets anywhere.** Neither container needs Vault, API keys,
   or any credentials. fail2ban reads logs. firewall-agent runs iptables.

## Testing

To verify fail2ban is working, check the logs:

```bash
# fail2ban logs (jail status, bans, unbans)
docker logs trans_fail2ban

# firewall-agent logs (every BAN/UNBAN/REJECTED with timestamp)
docker logs trans_fw_agent

# Currently banned IPs (from host)
sudo iptables -L DOCKER-USER -n

# Manually test the socket (from inside fail2ban container)
docker exec trans_fail2ban sh -c 'echo "BAN 192.168.99.99" | socat - UNIX-CONNECT:/var/run/firewall-agent/firewall.sock'

# Verify the ban was applied
sudo iptables -L DOCKER-USER -n | grep 192.168.99.99

# Unban
docker exec trans_fail2ban sh -c 'echo "UNBAN 192.168.99.99" | socat - UNIX-CONNECT:/var/run/firewall-agent/firewall.sock'
```

