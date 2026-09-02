# ============================================================
# Stage 1 – Base build environment (Alpine + g++ + make)
# ============================================================
From		alpine:3.19 AS base
RUN			apk add --no-cache g++ make openssl-dev

# ============================================================
# Stage 2 – Build the binary (uses Makefile + source)
# ============================================================
FROM		base AS build
WORKDIR		/app
COPY		srcs/		./srcs/
COPY		incs/		./incs/
COPY		Makefile	./
RUN			make

# ============================================================
# Stage 3 – Production runtime (binary only)
# ============================================================
FROM		alpine:3.19 AS dep
EXPOSE		4190
COPY		--from=build /app/bin/chess_engine /usr/local/bin/chess_engine

RUN			addgroup -S chess && adduser -S chess -G chess
USER		chess

ENTRYPOINT	["/usr/local/bin/chess_engine"]

