# ══════════════════════════════════════════════════════════════════════════
#  ft_transcendence — local development
#
#  Runs the entire stack on localhost. No VM, no host npm, no host node.
#  The frontend runs the Vite dev server (HMR) inside a node:22 container,
#  because this machine's node is v18 and vite 8 requires >=20.19.
#
#      make            build everything and start it
#      make help       every target, with a one-line description
#
#  Then open http://localhost:3000
# ══════════════════════════════════════════════════════════════════════════

COMPOSE_DEV     := docker-compose-dev.yml
COMPOSE_LOCAL   := docker-compose-local.yml
DC              := docker compose -f $(COMPOSE_DEV) -f $(COMPOSE_LOCAL)

ENV_FILE        := .env
FRONT_URL       := http://localhost:3000
API_URL         := http://localhost:9000
MAIL_URL        := http://localhost:8025
VAULT_UI        := http://localhost:8200

# Data that lives outside the repo, on /goinfre (the big disk)
DATA_DIR        := $(HOME)/goinfre/trans_data
CACHE_DIR       := $(HOME)/goinfre/trans_cache

# ── colours ───────────────────────────────────────────────────────────────
C_OFF  := \033[0m
C_DIM  := \033[2m
C_B    := \033[1m
C_GRN  := \033[32m
C_YEL  := \033[33m
C_RED  := \033[31m
C_CYN  := \033[36m

.DEFAULT_GOAL := up

.PHONY: up dev down stop restart re front front-install logs logs-front logs-api \
        ps status health shell-api shell-front psql redis-cli migrate makemigrations \
        superuser seed-vault nginx build env check clean fclean nuke-vault-data prune du help

# ══ run ═══════════════════════════════════════════════════════════════════

## up: build images if needed, start everything in the background
up: check env
	@printf "$(C_CYN)▶ building and starting the stack...$(C_OFF)\n"
	@$(DC) up -d --build
	@$(MAKE) --no-print-directory urls

## dev: start in the foreground with all logs attached (ctrl-c to stop)
dev: check env
	@$(DC) up --build

## front: frontend only — enough for UI/i18n work, no backend needed
front: check env
	@printf "$(C_CYN)▶ starting the vite dev server only$(C_OFF)\n"
	@$(DC) up --build frontend_dev

## down: stop and remove containers (database and vault data are KEPT)
down:
	@$(DC) down --remove-orphans
	@printf "$(C_GRN)✓ stopped$(C_OFF)\n"

## stop: pause containers without removing them
stop:
	@$(DC) stop

## restart: restart every service
restart:
	@$(DC) restart
	@$(MAKE) --no-print-directory urls

## re: full rebuild from scratch, keeping your data
re: down build up

## build: rebuild images without starting anything
build: check env
	@$(DC) build

## nginx: serve the production build through nginx+modsecurity instead of vite
##        (needs frontend/dist to exist — see the note in docker-compose-local.yml)
nginx: check env
	@$(DC) --profile nginx up -d --build frontend_nginx

# ══ inspect ═══════════════════════════════════════════════════════════════

## ps: one line per service — state and health
ps status:
	@$(DC) ps --format 'table {{.Service}}\t{{.State}}\t{{.Status}}\t{{.Ports}}'

## health: wait until django reports healthy, then print the URLs
health:
	@printf "$(C_CYN)▶ waiting for backend_django to become healthy...$(C_OFF)\n"
	@for i in $$(seq 1 60); do \
		s=$$(docker inspect -f '{{.State.Health.Status}}' trans_backend_django 2>/dev/null || echo missing); \
		if [ "$$s" = "healthy" ]; then printf "$(C_GRN)✓ django is healthy$(C_OFF)\n"; \
		  $(MAKE) --no-print-directory urls; exit 0; fi; \
		printf "  %s (%ss)\r" "$$s" "$$((i*2))"; sleep 2; \
	done; \
	printf "\n$(C_RED)✗ django never became healthy. try: make logs-api$(C_OFF)\n"; exit 1

## logs: follow logs from every service
logs:
	@$(DC) logs -f --tail=100

## logs-front: follow the vite dev server only
logs-front:
	@$(DC) logs -f --tail=100 frontend_dev

## logs-api: follow django only
logs-api:
	@$(DC) logs -f --tail=100 backend_django

# ══ shells ════════════════════════════════════════════════════════════════

## shell-api: a shell inside the django container
shell-api:
	@$(DC) exec backend_django sh

## shell-front: a shell inside the vite container
shell-front:
	@$(DC) exec frontend_dev sh

## psql: an interactive postgres prompt
psql:
	@$(DC) exec postgres psql -U $$(grep -E '^DB_SERVER_USER=' $(ENV_FILE) | cut -d= -f2) \
		-d $$(grep -E '^DB_SERVER_DB=' $(ENV_FILE) | cut -d= -f2)

## redis-cli: an interactive redis prompt
redis-cli:
	@$(DC) exec redis redis-cli

# ══ django ════════════════════════════════════════════════════════════════

## migrate: apply database migrations
migrate:
	@$(DC) exec backend_django python manage.py migrate

## makemigrations: generate new migrations from model changes
makemigrations:
	@$(DC) exec backend_django python manage.py makemigrations

## superuser: create a django admin user interactively
superuser:
	@$(DC) exec backend_django python manage.py createsuperuser

## seed-vault: re-run the vault seeder (after changing secrets in .env)
seed-vault:
	@$(DC) up --force-recreate --no-deps vault-init

# ══ frontend ══════════════════════════════════════════════════════════════

## front-install: reinstall node_modules in the named volume (after package.json changes)
front-install:
	@$(DC) run --rm frontend_dev npm ci
	@printf "$(C_GRN)✓ dependencies reinstalled$(C_OFF)\n"

# ══ housekeeping ══════════════════════════════════════════════════════════

## env: fail early with instructions if .env is missing
env:
	@if [ ! -f $(ENV_FILE) ]; then \
		printf "$(C_RED)✗ $(ENV_FILE) is missing.$(C_OFF)\n"; \
		printf "  compose needs it to interpolate \$${DB_SERVER_USER} and friends.\n"; \
		printf "  copy .env.dep and point every URL at localhost, or ask a teammate.\n"; \
		exit 1; \
	fi

## check: verify docker and docker compose are usable
check:
	@command -v docker >/dev/null 2>&1 || { printf "$(C_RED)✗ docker is not installed$(C_OFF)\n"; exit 1; }
	@docker compose version >/dev/null 2>&1 || { printf "$(C_RED)✗ 'docker compose' is unavailable$(C_OFF)\n"; exit 1; }
	@docker info >/dev/null 2>&1 || { printf "$(C_RED)✗ the docker daemon is not reachable$(C_OFF)\n"; exit 1; }

## clean: down + drop the node_modules volume (database data is KEPT)
clean: down
	@$(DC) down -v --remove-orphans 2>/dev/null || true
	@printf "$(C_GRN)✓ containers and the node_modules volume removed$(C_OFF)\n"

## fclean: clean + remove built images and the LOCAL postgres database
##         DESTRUCTIVE — asks first. Vault data is deliberately NOT touched.
fclean: clean
	@printf "$(C_YEL)\u26a0 this removes:$(C_OFF)\n"
	@printf "    \u00b7 every image this stack built\n"
	@printf "    \u00b7 the local postgres database\n"
	@printf "      $(DATA_DIR)/trans_db_server_data\n"
	@printf "\n"
	@printf "  $(C_DIM)it does NOT touch $(DATA_DIR)/trans_vault_data.$(C_OFF)\n"
	@printf "  $(C_DIM)the dev vault is in-memory and re-seeded on every 'make up',$(C_OFF)\n"
	@printf "  $(C_DIM)so there is nothing to gain locally — but docker-compose-dep.yml$(C_OFF)\n"
	@printf "  $(C_DIM)mounts that same path for its PERSISTENT sealed storage, which$(C_OFF)\n"
	@printf "  $(C_DIM)is unrecoverable without vault/secrets/tokens.json.$(C_OFF)\n"
	@printf "\n"
	@printf "  type 'yes' to continue: "
	@read ans; [ "$$ans" = "yes" ] || { printf "$(C_DIM)aborted$(C_OFF)\n"; exit 1; }
	@$(DC) down --rmi local -v --remove-orphans 2>/dev/null || true
	@# Postgres writes as container-uid 999, which rootless docker maps to a
	@# subuid the host user does not own — a plain `rm -rf` here fails with
	@# "Permission denied" and leaves the directory half-deleted. Deleting from
	@# inside a container works, because root there has CAP_DAC_OVERRIDE in its
	@# own user namespace.
	@docker run --rm -v "$(DATA_DIR)/trans_db_server_data:/target" alpine \
		find /target -mindepth 1 -delete 2>/dev/null || true
	@printf "$(C_GRN)\u2713 images and database removed \u00b7 vault data preserved$(C_OFF)\n"

## nuke-vault-data: delete the PERSISTENT vault storage used by the dep stack.
##                  Almost never what you want. Asks twice.
nuke-vault-data:
	@printf "$(C_RED)\u26a0 $(DATA_DIR)/trans_vault_data is the DEP stack's sealed storage.$(C_OFF)\n"
	@printf "  without vault/secrets/tokens.json this cannot be recovered.\n"
	@printf "  the local dev stack does not use it at all.\n"
	@printf "  type 'destroy vault data' to continue: "
	@read ans; [ "$$ans" = "destroy vault data" ] || { printf "$(C_DIM)aborted$(C_OFF)\n"; exit 1; }
	@docker run --rm -v "$(DATA_DIR)/trans_vault_data:/target" alpine \
		find /target -mindepth 1 -delete 2>/dev/null || true
	@printf "$(C_GRN)\u2713 vault data destroyed$(C_OFF)\n"

## prune: reclaim disk from dangling images and build cache
prune:
	@docker system prune -f
	@# `docker builder prune` only touches the DAEMON's default builder. This
	@# project builds with a buildx builder named transbuilder, whose cache
	@# lives inside its own container volume — the daemon cannot see it, and
	@# `docker system df` reports it as 0B. Prune the selected builder too.
	@docker buildx prune -f 2>/dev/null || true
	@printf "$(C_GRN)\u2713 pruned$(C_OFF)\n"
	@$(MAKE) --no-print-directory du

## du: where docker disk actually goes (daemon AND buildx builders)
du:
	@printf "\n  $(C_B)daemon$(C_OFF)\n"
	@docker system df
	@printf "\n  $(C_B)buildx builders$(C_OFF)  $(C_DIM)(invisible to 'system df')$(C_OFF)\n"
	@for b in $$(docker buildx ls --format '{{.Name}}' 2>/dev/null | sort -u); do \
		r=$$(docker buildx du --builder $$b 2>/dev/null | grep -i '^Reclaimable:' | awk '{print $$2}'); \
		t=$$(docker buildx du --builder $$b 2>/dev/null | grep -i '^Total:' | awk '{print $$2}'); \
		{ [ -n "$$t" ] && printf "    %-22s total %-10s reclaimable %s\n" "$$b" "$$t" "$$r"; } || true; \
	done
	@printf "\n  $(C_B)disk$(C_OFF)\n"
	@df -h /goinfre $(HOME) 2>/dev/null | awk 'NR==1 || /goinfre|home/ {printf "    %s\n", $$0}'
	@printf "\n"

# ══ meta ══════════════════════════════════════════════════════════════════

.PHONY: urls
urls:
	@printf "\n"
	@printf "  $(C_B)$(C_GRN)the app$(C_OFF)   $(C_B)$(FRONT_URL)$(C_OFF)\n"
	@printf "  $(C_DIM)django    $(API_URL)$(C_OFF)\n"
	@printf "  $(C_DIM)mailpit   $(MAIL_URL)$(C_OFF)\n"
	@printf "  $(C_DIM)vault     $(VAULT_UI)  (token: root)$(C_OFF)\n"
	@printf "\n"
	@printf "  $(C_DIM)make ps · make logs-front · make health · make down$(C_OFF)\n\n"

## help: this list
help:
	@printf "\n  $(C_B)ft_transcendence — local development$(C_OFF)\n"
	@printf "  $(C_DIM)docker compose -f $(COMPOSE_DEV) -f $(COMPOSE_LOCAL)$(C_OFF)\n\n"
	@grep -E '^## [a-z-]+( [a-z-]+)*:' $(MAKEFILE_LIST) \
		| sed -e 's/^## //' \
		| awk -F': ' '{ printf "  $(C_CYN)%-16s$(C_OFF) %s\n", $$1, $$2 }'
	@printf "\n  $(C_DIM)default target: up$(C_OFF)\n\n"
