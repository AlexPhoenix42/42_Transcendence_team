# Colors
GREEN		:= \033[0;32m
RED			:= \033[0;31m
YELLOW		:= \033[38;5;220m
BROWN		:= \033[0;33m
BLUE		:= \033[0;34m
CYAN		:= \033[0;36m
MAGENTA		:= \033[0;35m
WHITE		:= \033[1;37m
BOLD		:= \033[1m
DIM			:= \033[2m
RESET		:= \033[0m

# Icons
ROCKET_ICON		:= 🚀
CLEAN_ICON		:= 🧹
SUCCESS_ICON	:= ✅
ERROR_ICON		:= ❌
LOGS_ICON		:= 📜
STATUS_ICON		:= 📊
STOP_ICON		:= 🛑
NUKE_ICON		:= 💀
SHIELD_ICON		:= 🛡️
WARN_ICON		:= ⚠️
PHOENIX_ICON	:= 🐦‍🔥
RAINBOW_ICON	:= 🌈

NAME			:= Born2Transcendence
COMPOSE_FILE	:= docker-compose.yml
COMPOSE			:= docker compose -f $(COMPOSE_FILE)
DATA_DIR		:= $(HOME)/goinfre/trans_data

.PHONY: all help build up down clean fclean re logs status

# ── Default ───────────────────────────────────────────────────────

all:
	@printf "\n"
	@printf "  $(ROCKET_ICON)$(RAINBOW_ICON) $(BOLD)$(MAGENTA)$(NAME) Phoenix Edition $(PHOENIX_ICON)$(RESET)\n"
	@printf "  $(BOLD)─────────────────────────────────────────$(RESET)\n"
	@printf "\n"
	@printf "  $(GREEN)1)$(RESET) Build images and start all containers            $(DIM)(compose up build)$(RESET)\n"
	@printf "  $(GREEN)2)$(RESET) Start containers from existing images            $(DIM)(compose up)$(RESET)\n"
	@printf "  $(GREEN)3)$(RESET) Stop all containers                              $(DIM)(compose down remove-orphans)$(RESET)\n"
	@printf "  $(RED)4)$(RESET) Full clean and re-build images and containers    $(DIM)(fclean + build)$(RESET)\n"
	@printf "  $(RED)5)$(RESET) Clean containers and images                      $(DIM)(compose down rmi all)$(RESET)\n"
	@printf "  $(RED)6)$(RESET) Full clean, volumes, images, and trans data      $(DIM)(fclean)$(RESET)\n"
	@printf "  $(YELLOW)7)$(RESET) Stream service logs                              $(DIM)(compose logs -f)$(RESET)\n"
	@printf "  $(YELLOW)8)$(RESET) Display containers status                        $(DIM)(compose ps)$(RESET)\n"
	@printf "  $(DIM)9) Exit without action$(RESET)\n"
	@printf "\n"
	@read -p "  Pick an option [1-9]: " choice; \
	case $$choice in \
		1) printf "\n  $(ROCKET_ICON) This will build images and start all containers.\n"; \
		   printf "  $(NUKE_ICON) $(BOLD)(1)$(RESET) Confirm  /  $(SHIELD_ICON) $(BOLD)(0)$(RESET) Cancel: "; \
		   read confirm; \
		   if [ "$$confirm" = "1" ]; then $(MAKE) --no-print-directory build; \
		   else printf "  $(SHIELD_ICON) $(DIM)Cancelled.$(RESET)\n"; fi ;; \
		2) printf "\n  $(ROCKET_ICON) This will start containers from existing images.\n"; \
		   printf "  $(NUKE_ICON) $(BOLD)(1)$(RESET) Confirm  /  $(SHIELD_ICON) $(BOLD)(0)$(RESET) Cancel: "; \
		   read confirm; \
		   if [ "$$confirm" = "1" ]; then $(MAKE) --no-print-directory up; \
		   else printf "  $(SHIELD_ICON) $(DIM)Cancelled.$(RESET)\n"; fi ;; \
		3) printf "\n  $(STOP_ICON) This will stop all containers.\n"; \
		   printf "  $(NUKE_ICON) $(BOLD)(1)$(RESET) Confirm  /  $(SHIELD_ICON) $(BOLD)(0)$(RESET) Cancel: "; \
		   read confirm; \
		   if [ "$$confirm" = "1" ]; then $(MAKE) --no-print-directory down; \
		   else printf "  $(SHIELD_ICON) $(DIM)Cancelled.$(RESET)\n"; fi ;; \
		4) printf "\n  $(WARN_ICON)  This will wipe everything and rebuild.\n"; \
		   printf "  $(NUKE_ICON) $(BOLD)(1)$(RESET) Confirm  /  $(SHIELD_ICON) $(BOLD)(0)$(RESET) Cancel: "; \
		   read confirm; \
		   if [ "$$confirm" = "1" ]; then $(MAKE) --no-print-directory re; \
		   else printf "  $(SHIELD_ICON) $(DIM)Cancelled.$(RESET)\n"; fi ;; \
		5) printf "\n  $(WARN_ICON)  This will remove all containers and images.\n"; \
		   printf "  $(NUKE_ICON) $(BOLD)(1)$(RESET) Confirm  /  $(SHIELD_ICON) $(BOLD)(0)$(RESET) Cancel: "; \
		   read confirm; \
		   if [ "$$confirm" = "1" ]; then $(MAKE) --no-print-directory clean; \
		   else printf "  $(SHIELD_ICON) $(DIM)Cancelled.$(RESET)\n"; fi ;; \
		6) printf "\n  $(WARN_ICON)  This will wipe all volumes, images, and trans data.\n"; \
		   printf "  $(NUKE_ICON) $(BOLD)(1)$(RESET) Confirm  /  $(SHIELD_ICON) $(BOLD)(0)$(RESET) Cancel: "; \
		   read confirm; \
		   if [ "$$confirm" = "1" ]; then $(MAKE) --no-print-directory fclean; \
		   else printf "  $(SHIELD_ICON) $(DIM)Cancelled.$(RESET)\n"; fi ;; \
		7) $(MAKE) --no-print-directory logs ;; \
		8) $(MAKE) --no-print-directory status ;; \
		9) printf "  $(DIM)Exiting.$(RESET)\n" ;; \
		*) printf "  $(ERROR_ICON) $(RED)Invalid option.$(RESET)\n" ;; \
	esac

help:
	@printf "\n"
	@printf "  $(ROCKET_ICON) $(BOLD)$(MAGENTA)$(NAME)$(RESET) — $(BOLD)Available commands$(RESET)\n"
	@printf "  $(BOLD)─────────────────────────────────────────$(RESET)\n"
	@printf "\n"
	@printf "  $(GREEN)$(BOLD)Core$(RESET)\n"
	@printf "    $(CYAN)make build$(RESET)          Build images and start all containers\n"
	@printf "    $(CYAN)make up$(RESET)             Start containers from existing images\n"
	@printf "    $(CYAN)make down$(RESET)           Stop all containers\n"
	@printf "    $(CYAN)make re$(RESET)             Full clean and re-build\n"
	@printf "\n"
	@printf "  $(RED)$(BOLD)Cleanup$(RESET)\n"
	@printf "    $(CYAN)make clean$(RESET)          Clean containers and images\n"
	@printf "    $(CYAN)make fclean$(RESET)         Full clean, volumes, images, and trans data\n"
	@printf "\n"
	@printf "  $(YELLOW)$(BOLD)Monitoring$(RESET)\n"
	@printf "    $(CYAN)make logs$(RESET)           Stream service logs (interactive picker)\n"
	@printf "    $(CYAN)make logs-<svc>$(RESET)     Stream logs for a specific service\n"
	@printf "    $(CYAN)make status$(RESET)         Display containers status\n"
	@printf "\n"

# ── Core ──────────────────────────────────────────────────────────

build:
	@printf "$(ROCKET_ICON) $(BOLD)Building & starting $(RESET)$(MAGENTA)$(NAME)$(RESET)...\n"
	@sudo ./run_dep_secure.sh
	@printf "$(SUCCESS_ICON) $(GREEN)$(NAME) is up and running.$(RESET)\n"

up:
	@printf "$(ROCKET_ICON) $(BOLD)Starting $(RESET)$(MAGENTA)$(NAME)$(RESET)...\n"
	@sudo ./up_dep_secure.sh
	@printf "$(SUCCESS_ICON) $(GREEN)$(NAME) is up and running.$(RESET)\n"

down:
	@printf "$(STOP_ICON) $(BOLD)Stopping $(RESET)$(MAGENTA)$(NAME)$(RESET)...\n"
	@$(COMPOSE) down --remove-orphans
	@printf "$(SUCCESS_ICON) $(GREEN)All containers stopped.$(RESET)\n"

re: fclean build

# ── Cleanup ───────────────────────────────────────────────────────

clean:
	@printf "$(CLEAN_ICON) $(BLUE)Cleaning containers and images...$(RESET)\n"
	@$(COMPOSE) down --rmi all --remove-orphans 2>/dev/null || true
	@printf "$(SUCCESS_ICON) $(GREEN)Clean complete.$(RESET)\n"

fclean:
	@printf "$(NUKE_ICON) $(RED)$(BOLD)Full cleanup: containers, volumes, images, data...$(RESET)\n"
	@$(COMPOSE) down --volumes --rmi all --remove-orphans 2>/dev/null || true
	@printf "$(CLEAN_ICON) $(BLUE)Wiping data directory:$(RESET) $(YELLOW)$(DATA_DIR)$(RESET)\n"
	@sudo rm -rf $(DATA_DIR)/trans_db_server_data
	@sudo rm -rf $(DATA_DIR)/trans_vault_data
	@sudo rm -rf $(DATA_DIR)/trans_prometheus_data
	@sudo rm -rf $(DATA_DIR)/trans_grafana_data
	@sudo rm -rf $(DATA_DIR)/trans_backups
	@printf "$(SUCCESS_ICON) $(GREEN)Full cleanup complete.$(RESET)\n"

# ── Logs ──────────────────────────────────────────────────────────

logs:
	@printf "\n"
	@printf "  $(LOGS_ICON) $(BOLD)Select a service$(RESET)\n"
	@printf "  $(BOLD)─────────────────────────────────────────$(RESET)\n"
	@printf "\n"
	@services=$$($(COMPOSE) config --services | sort); \
	i=1; \
	for svc in $$services; do \
		printf "  $(CYAN)%2d)$(RESET) %s\n" "$$i" "$$svc"; \
		i=$$((i+1)); \
	done; \
	printf "  $(GREEN) 0)$(RESET) $(BOLD)All services$(RESET)\n"; \
	printf "\n"; \
	read -p "  Pick a service: " pick; \
	if [ "$$pick" = "0" ]; then \
		$(COMPOSE) logs -f; \
	else \
		target=$$(echo "$$services" | sed -n "$${pick}p"); \
		if [ -z "$$target" ]; then \
			printf "  $(ERROR_ICON) $(RED)Invalid selection.$(RESET)\n"; \
		else \
			printf "  $(LOGS_ICON) $(BOLD)Streaming logs for $(RESET)$(CYAN)$$target$(RESET)...\n"; \
			$(COMPOSE) logs -f $$target; \
		fi; \
	fi

logs-%:
	@printf "$(LOGS_ICON) $(BOLD)Streaming logs for $(RESET)$(CYAN)$*$(RESET)...\n"
	@$(COMPOSE) logs -f $*

# ── Status ────────────────────────────────────────────────────────

status:
	@printf "\n"
	@printf "  $(STATUS_ICON) $(BOLD)$(MAGENTA)$(NAME)$(RESET) — $(BOLD)Container Status$(RESET)\n"
	@printf "  $(BOLD)─────────────────────────────────────────$(RESET)\n"
	@printf "\n"
	@printf "  $(BOLD)$(BLUE)%-14s$(RESET) $(BOLD)$(WHITE)%-26s$(RESET) $(BOLD)$(GREEN)%s$(RESET)\n" "CONTAINER ID" "NAMES" "STATUS"
	@printf "  $(DIM)──────────────────────────────────────────────────────────────$(RESET)\n"
	@docker ps --format '{{.ID}}\t{{.Names}}\t{{.Status}}' | while IFS='	' read -r id name stat; do \
		color="$(GREEN)"; \
		case "$$stat" in \
			*Exited*|*exited*) color="$(RED)" ;; \
			*unhealthy*)       color="$(YELLOW)" ;; \
		esac; \
		printf "  $(BROWN)%-14s$(RESET) $(WHITE)%-26s$(RESET) $${color}%s$(RESET)\n" "$$id" "$$name" "$$stat"; \
	done
	@printf "\n"

