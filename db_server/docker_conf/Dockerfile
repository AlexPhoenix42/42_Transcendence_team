# syntax=docker/dockerfile:1

# Postgresql
# ---- base: shared by both dev and dep, nothing extra installed here ----
FROM	postgres:18-bookworm AS base

# Install curl/jq for Vault startup and copy the Vault entrypoint
RUN		apt-get update && apt-get install -y --no-install-recommends \
		curl			\
		jq

RUN		rm -rf /var/lib/apt/lists/*
RUN		groupadd -g 100 users 2>/dev/null || true \
		&& usermod -aG users postgres

COPY	docker_conf/vault-entrypoint.sh /usr/local/bin/vault-entrypoint.sh
RUN		chmod +x /usr/local/bin/vault-entrypoint.sh

# ---- dev: adds debugging/network tools for local development ----
FROM	base AS dev
RUN		--mount=type=cache,target=/var/cache/apt,sharing=locked \
		--mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
		apt-get update && apt-get install -y --no-install-recommends \
		less			\
		vim				\
		iputils-ping	\
		iproute2		\
		dnsutils

# ---- dep: deployment/eval image, no extra tools, stays lean ----
# This is the LAST stage in the file on purpose: if `target` is not
# specified in docker-compose.yml, the build defaults to this one.
FROM	base AS dep

