FROM		owasp/modsecurity:nginx-alpine

# Download OWASP CRS v4.25.0 LTS
ARG			CRS_VERSION=4.25.0

RUN			wget -qO /tmp/crs.tar.gz \
				https://github.com/coreruleset/coreruleset/archive/refs/tags/v${CRS_VERSION}.tar.gz \
			&& mkdir -p /etc/modsecurity/crs \
			&& tar xzf /tmp/crs.tar.gz -C /etc/modsecurity/crs --strip-components=1 \
			&& cp /etc/modsecurity/crs/crs-setup.conf.example \
				  /etc/modsecurity/crs/crs-setup.conf \
			&& rm /tmp/crs.tar.gz

# Remove templates and crash-prone script. we are managing the config ourselves
RUN			rm -rf /etc/nginx/templates
RUN			rm -f /docker-entrypoint.d/90-copy-modsecurity-config.sh
RUN			rm -f /docker-entrypoint.d/92-update-real_ip.sh
# 91 runs `sed -i` on /etc/nginx/nginx.conf, which fails with "Resource busy"
# whenever that file is bind-mounted (as docker-compose-dev.yml does), sending
# the container into a restart loop. We manage the resolver directive
# ourselves -- same reasoning as 90 and 92 above.
RUN			rm -f /docker-entrypoint.d/91-update-resolver.sh

# Create audit log directory
#RUN			mkdir -p /var/log/modsecurity/trans
RUN			mkdir -p /var/log/modsecurity
RUN			chown	nginx:nginx		/var/log/modsecurity

# Add nginx to users group for vault cert access
RUN			addgroup nginx users

# nginx config
COPY		docker_conf/nginx-dep.conf		/etc/nginx/nginx.conf

# ModSecurity main config (chains modsecurity.conf + CRS)
COPY		docker_conf/modsecurity/main.conf		/etc/modsecurity/main.conf
COPY		docker_conf/modsecurity/modsecurity.conf \
			/etc/modsecurity.d/modsecurity.conf
#COPY		docker_conf/modsecurity/override.conf	/etc/modsecurity/override.conf

# logs exclusions
COPY		docker_conf/modsecurity/exclusions.conf /etc/modsecurity/exclusions.conf

EXPOSE		443 80

