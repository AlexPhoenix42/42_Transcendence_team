# fail2ban/Dockerfile
#
# Unprivileged fail2ban — NO CAP_NET_ADMIN, NO iptables.
# Reads nginx/modsecurity logs, detects bad IPs, sends BAN/UNBAN
# commands to the firewall-agent via Unix socket. If this container is
# compromised, the attacker cannot modify firewall rules.

FROM		alpine:3.20

RUN			apk add --no-cache fail2ban socat

# Remove default jails, we only use our own
RUN			rm -f /etc/fail2ban/jail.d/*.conf	2>/dev/null; \
			rm -f /etc/fail2ban/jail.local		2>/dev/null; true

# Copy our config
COPY		jail.d/		/etc/fail2ban/jail.d/
COPY		filter.d/	/etc/fail2ban/filter.d/
COPY		action.d/	/etc/fail2ban/action.d/

RUN			addgroup	-S -g 101 nginx-logs						&& \
			addgroup	-S -g 1500 firewall-sock					&& \
			addgroup	-S fail2ban									&& \
			adduser		-S -G fail2ban fail2ban						&& \
			addgroup	fail2ban nginx-logs							&& \
			addgroup	fail2ban firewall-sock						&& \
			mkdir -p	/var/run/fail2ban	/var/lib/fail2ban		&& \
			chown -R	fail2ban:fail2ban	/var/run/fail2ban		   \
						/var/lib/fail2ban	/etc/fail2ban
					
USER		fail2ban

# No dangerous capabilities, can only read logs and talk to firewall-agent socket.
# It can only read logs and write to the firewall-agent socket.
ENTRYPOINT	["fail2ban-server", "-f", "--loglevel", "INFO", "--logtarget", "STDOUT"]

