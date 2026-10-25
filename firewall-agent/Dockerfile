# firewall-agent/Dockerfile
#
# Minimal privilege-separated firewall agent.
# This is the ONLY container with CAP_NET_ADMIN — it applies
# iptables rules on DOCKER-USER chain via commands received
# from fail2ban through a Unix socket.
#
# ~80 lines of auditable shell. If fail2ban is compromised,
# the attacker still cannot touch firewall rules.
#
# Hardening (in docker-compose.yml):
#   - cap_drop: ALL + cap_add: NET_ADMIN, NET_RAW
#   - read_only: true
#   - no-new-privileges: true
#   - pids_limit: 20
#   - mem_limit: 32m
#   - Every BAN/UNBAN/REJECTED is logged to stdout

FROM		alpine:3.20

RUN			apk add --no-cache iptables iptables-legacy socat && \
			ln -sf /sbin/xtables-legacy-multi /sbin/iptables && \
			addgroup -S -g 1500 firewall-sock

COPY		firewall-agent.sh	/usr/local/bin/firewall-agent.sh
RUN			chmod 700 /usr/local/bin/firewall-agent.sh

# Socket directory, shared with fail2ban via named volume
#RUN			mkdir -p /var/run/firewall-agent
RUN			mkdir -p /var/run/firewall-agent && \
			chown root:firewall-sock /var/run/firewall-agent && \
			chmod 2770 /var/run/firewall-agent

# Runs as root: needs CAP_NET_ADMIN for iptables.
# cap_drop ALL + cap_add NET_ADMIN in docker-compose.yml
# ensures this is the only privilege it gets.
ENTRYPOINT	["/usr/local/bin/firewall-agent.sh"]

