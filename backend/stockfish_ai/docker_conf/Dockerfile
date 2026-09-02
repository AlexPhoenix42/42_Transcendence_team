# Stockfish AI HTTP service
# Build context: backend/stockfish_ai

# --- build stage ---
FROM    alpine:3.19 AS builder

RUN     apk add --no-cache g++ make git

WORKDIR /app

# Compile Stockfish from source (static, musl‑compatible)
RUN     git clone --depth 1 https://github.com/official-stockfish/Stockfish.git /tmp/sf \
        && cd /tmp/sf/src \
        && make -j$(nproc) build ARCH=x86-64-avx2 \
        && cp stockfish /app/stockfish

# Build the HTTP wrapper
COPY    incs/           incs/
COPY    srcs/           srcs/
COPY    Makefile        .
RUN     make

# --- runtime ---
FROM    alpine:3.19

RUN     apk add --no-cache libstdc++ libgcc

WORKDIR /app

# Copy both static binaries
COPY    --from=builder  /app/bin/stockfish_ai_wrapper ./stockfish_ai_wrapper
COPY    --from=builder  /app/stockfish               ./stockfish

ENV     ENGINE_PORT=4191
ENV		PATH="/app:$PATH"
EXPOSE  4191

RUN		chmod +x	./stockfish_ai_wrapper	./stockfish
RUN		addgroup -S stockfish && adduser -S stockfish -G stockfish
USER	stockfish

CMD     ["./stockfish_ai_wrapper"]

