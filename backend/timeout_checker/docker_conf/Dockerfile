# timeout_checker Dockerfile
# Build context: backend/

FROM python:3.14-slim

WORKDIR /django

# Only the runtime library needed by psycopg (libpq)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5	\
	curl	\
	jq		\
    && rm -rf /var/lib/apt/lists/*

# Copy and install only the checker's requirements
COPY timeout_checker/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the checker's own config and manage.py
COPY timeout_checker/config/   config/
COPY timeout_checker/manage.py manage.py

# Copy only the required Django app files (models + management command)
COPY django/chess_game/__init__.py   chess_game/__init__.py
COPY django/chess_game/models.py     chess_game/models.py
COPY django/chess_game/management/   chess_game/management/

COPY timeout_checker/users/__init__.py users/__init__.py
COPY timeout_checker/users/models.py   users/models.py

# Remove any tests or migrations (not needed at runtime)
RUN rm -rf chess_game/tests chess_game/migrations users/tests users/migrations

# Non‑root user
RUN	groupadd -g 100 users 2>/dev/null || true \
	&& useradd -u 1000 -mG users django_user \
	&& chown -R django_user:django_user /django

COPY timeout_checker/docker_conf/vault-entrypoint.sh /usr/local/bin/vault-entrypoint.sh
RUN  chmod +x /usr/local/bin/vault-entrypoint.sh

USER django_user

CMD ["python", "manage.py", "check_timeouts"]

