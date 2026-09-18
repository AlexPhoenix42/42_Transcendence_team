# frontend/docker_conf/Dockerfile

FROM			owasp/modsecurity-crs:4.25.1-nginx-alpine-lts

USER			root

# Add nginx to users group for vault cert access
RUN				addgroup nginx users

# Override nginx config template
COPY			docker_conf/nginx-dep.conf \
				/etc/nginx/templates/nginx.conf.template

# ModSecurity tuning, override the image's env-var-driven template
COPY			docker_conf/modsecurity/modsecurity-override.conf \
				/etc/nginx/templates/modsecurity.d/modsecurity-override.conf.template

# CRS exclusions (load after CRS rules)
COPY			docker_conf/modsecurity/exclusions.conf \
				/etc/modsecurity.d/owasp-crs/rules/RESPONSE-999-EXCLUSION-RULES-AFTER-CRS.conf

USER			nginx

EXPOSE			4443 8000

