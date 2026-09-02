# syntax=docker/dockerfile:1

# --- system: OS-level deps only, shared by both dev and dep ---
FROM	python:3.14-slim AS system

WORKDIR /django

# System packages needed to build/run the Python deps (psycopg2, cryptography,
# cffi, pyOpenSSL) plus netcat for the entrypoint's wait-for-service checks.
RUN		--mount=type=cache,target=/var/cache/apt,sharing=locked \
		--mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
		apt-get update && apt-get install -y --no-install-recommends \
			build-essential	\
			libssl-dev		\
			libpq-dev		\
			libffi-dev		\
			pkg-config		\
			netcat-traditional

# Shared group and user for services that need Vault access
RUN		groupadd -g 100 users || true \
		&& useradd -u 1000 -mG users django_user

# ---- dev: adds debugging tools + dev-only Python deps (mypy, stubs) ----
# Branches from system DIRECTLY, not from dep -- this means a
# requirements.txt change no longer invalidates this apt-get layer,
# they're now independent branches.
FROM	system AS dev
RUN		--mount=type=cache,target=/var/cache/apt,sharing=locked \
		--mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
		apt-get update && apt-get install -y --no-install-recommends \
			vim				\
			less			\
			iputils-ping	\
			iproute2		\
			dnsutils		\
			curl			\
			procps

COPY	requirements.txt .
RUN		--mount=type=cache,target=/root/.cache/pip \
		pip install -r requirements.txt

COPY	requirements-dev.txt .
RUN		--mount=type=cache,target=/root/.cache/pip \
		pip install -r requirements-dev.txt

#RUN		useradd -u 1000 -m django_user
USER	django_user

COPY	--chown=django_user . .
COPY	--chown=django_user docker_conf/entrypoint.sh /entrypoint.sh
RUN		chmod +x /entrypoint.sh

EXPOSE		9000
ENTRYPOINT	["/entrypoint.sh"]

# ---- dep: deployment/eval image, no dev tools, no dev Python deps ----
# Branches from system directly too -- base was collapsed into this
# stage since nothing else was branching from it separately.
# This is the LAST stage in the file on purpose: if `target` is not
# specified in docker-compose.yml, the build defaults to this one.
FROM	system AS dep

COPY	requirements.txt .
RUN		--mount=type=cache,target=/root/.cache/pip \
		pip install -r requirements.txt

#RUN		useradd -u 1000 -m django_user
USER	django_user

COPY	--chown=django_user . .
COPY	--chown=django_user docker_conf/entrypoint.sh /entrypoint.sh
RUN		chmod +x /entrypoint.sh

EXPOSE		9000
ENTRYPOINT	["/entrypoint.sh"]

