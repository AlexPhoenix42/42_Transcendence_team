FROM postgres:18-alpine

USER root

RUN apk add --no-cache \
    restic curl jq tzdata ca-certificates \
    && rm -rf /var/cache/apk/*

RUN curl -L -o /usr/local/bin/supercronic \
    https://github.com/aptible/supercronic/releases/download/v0.2.33/supercronic-linux-amd64 \
    && chmod +x /usr/local/bin/supercronic

ENV TZ=Europe/Paris
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# needed by supercronic to set-up tmp cache.
ENV RESTIC_CACHE_DIR=/tmp/restic-cache

RUN addgroup -g 100 users 2>/dev/null || true && \
    adduser -S -u 100 -G users -s /bin/sh -H backupuser 2>/dev/null || true

WORKDIR /app

COPY crontab       /app/crontab
COPY backup.sh     /app/backup.sh
COPY entrypoint.sh /app/entrypoint.sh

RUN chmod +x /app/backup.sh /app/entrypoint.sh && \
    mkdir -p /app/log && \
    chown -R 100:100 /app

USER backupuser

ENTRYPOINT ["/app/entrypoint.sh"]

