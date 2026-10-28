I think point 2 is an excellent security design. Seriously. That's proper privilege separation — the same principle behind how `sshd` drops privileges, or how `postfix` separates mail processing from delivery.

Here's why it's smart and how I'd architect it:

## The Problem with Standard fail2ban

Standard fail2ban needs `CAP_NET_ADMIN` to call iptables directly. If fail2ban gets compromised (CVE in its Python code, a malicious log injection), the attacker has full firewall control.

## Your Architecture: Privilege Separation via Unix Socket

```
┌─────────────────────────────┐     ┌──────────────────────────┐
│  fail2ban container         │     │  fw-agent container      │
│  (unprivileged, no caps)    │     │  (CAP_NET_ADMIN only)    │
│                             │     │                          │
│  reads nginx logs           │     │  tiny bash/C script      │
│  detects bad IPs            │     │  ~50 lines, auditable    │
│  sends: BAN 1.2.3.4         │────▶│  validates: is it an IP? │
│  sends: UNBAN 1.2.3.4       │     │  runs: iptables -I/-D    │
│                             │     │  on DOCKER-USER chain    │
└─────────────────────────────┘     └──────────────────────────┘
         via shared Unix socket
```

**Two containers, one socket:**

| Component | Privileges | Role |
|-----------|-----------|------|
| `fail2ban` | None. No caps, no root network access | Log analysis only. Sends `BAN <ip>` / `UNBAN <ip>` to socket |
| `fw-agent` | `CAP_NET_ADMIN` + `network_mode: host` | Minimal script. Validates input is a valid IPv4/IPv6, applies iptables rule. Rejects everything else |

**Why Unix socket over a pipe or file:**

- Bidirectional — fw-agent can reply `OK` or `REJECTED` so fail2ban knows the ban worked
- Proper framing — one command per connection, no race conditions
- Permission-controlled — socket file permissions restrict who can connect
- No polling — the agent blocks on `accept()`, zero CPU when idle

**For point 1 (Vault):** fail2ban needs zero secrets. It only reads log files and writes to a socket. No Vault integration needed. The fw-agent also needs zero secrets — it only does iptables. Clean separation.

**Revised file plan:**

| File | Purpose |
|------|---------|
| `fail2ban/Dockerfile` | fail2ban, **no** iptables, **no** caps |
| `fail2ban/jail.d/transcendence.conf` | Jail config |
| `fail2ban/filter.d/transcendence-auth.conf` | Nginx log regex |
| `fail2ban/filter.d/transcendence-modsec.conf` | ModSecurity log regex |
| `fail2ban/action.d/socket-ban.conf` | Custom action: sends to socket instead of calling iptables |
| `fw-agent/Dockerfile` | Minimal Alpine + iptables |
| `fw-agent/fw-agent.sh` | ~50 lines. Listens on socket, validates IP, runs iptables. That's it |
| `docker-compose.yml` | Both services + shared socket volume + nginx log volume |

