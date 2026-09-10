# Makefile — stack de dev (docker-compose-dev.yml)
#
#   make            adapte .env a ce PC (IP LAN) + up + seed Vault (images existantes)
#   make build      pareil mais rebuild les images (buildx docker-container)
#   make ip         re-detecte l'IP et reecrit .env (a refaire si l'IP change)
#   make down       arrête
#   make re         rebuild complet
#   make seed       re-seed Vault + relance le backend (Vault dev = mémoire :
#                   il reperd ses secrets à chaque redémarrage)
#   make front      rebuild frontend-react/dist (Node 20 en conteneur)
#   make logs       suit les logs   |   make logs S=backend_django  (un service)
#   make sh S=...   shell dans un service
#   make ps         état des conteneurs
#   make clean      down + volumes + caches de build

COMPOSE := docker compose -f docker-compose-dev.yml
S       ?=

.DEFAULT_GOAL := up

# buildx "container" requis par les cache_to du compose
.PHONY: builder
builder:
	@docker buildx inspect trans-builder >/dev/null 2>&1 || \
		docker buildx create --name trans-builder --driver docker-container --use >/dev/null
	@docker buildx use trans-builder >/dev/null 2>&1 || true

.PHONY: ip
ip:
	@bash scripts_dev/gen-dev-env.sh

.PHONY: up
up: ip
	$(COMPOSE) up -d
	@$(MAKE) --no-print-directory seed

.PHONY: build
build: ip builder
	$(COMPOSE) up -d --build
	@$(MAKE) --no-print-directory seed

.PHONY: seed
seed:
	$(COMPOSE) up -d
	$(COMPOSE) up -d --force-recreate --no-deps vault-init
	@sleep 4
	$(COMPOSE) restart backend_django
	@sleep 6
	$(COMPOSE) up -d
	@echo "→ serveur : $$(grep ^FRONTEND_URL= .env | cut -d= -f2)"
	@echo "  les autres postes du LAN se connectent sur cette URL, login local test/test1234"

.PHONY: down
down:
	$(COMPOSE) down

.PHONY: re
re: down up

.PHONY: front
front:
	docker run --rm -v "$(CURDIR)/frontend-react":/app -w /app node:20 \
		sh -c "rm -rf node_modules && npm install --no-audit --no-fund && npx vite build"

.PHONY: logs
logs:
	$(COMPOSE) logs -f $(S)

.PHONY: sh
sh:
	$(COMPOSE) exec $(S) sh

.PHONY: ps
ps:
	$(COMPOSE) ps

.PHONY: clean
clean:
	$(COMPOSE) down -v --remove-orphans
	-rm -rf $(HOME)/goinfre/trans_cache $(HOME)/goinfre/trans_data
