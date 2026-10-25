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
DEMO_IP 		?= 203.0.113.42

.PHONY: all help build up down clean softclean fclean nukclean re logs status check

# ── Default ───────────────────────────────────────────────────────

all:
	@printf "\n"
	@printf "  $(ROCKET_ICON)$(RAINBOW_ICON) $(BOLD)$(MAGENTA)$(NAME) Phoenix Edition $(PHOENIX_ICON)$(RESET)\n"
	@printf "  $(BOLD)─────────────────────────────────────────$(RESET)\n"
	@printf "\n"
	@printf "  $(GREEN)1)$(RESET)  Build images and start all containers            $(DIM)(compose up build)$(RESET)\n"
	@printf "  $(GREEN)2)$(RESET)  Start containers from existing images            $(DIM)(compose up)$(RESET)\n"
	@printf "  $(GREEN)3)$(RESET)  Stop all containers                              $(DIM)(compose down remove-orphans)$(RESET)\n"
	@printf "  $(RED)4)$(RESET)  Full clean and re-build                          $(DIM)(fclean + build)$(RESET)\n"
	@printf "  $(RED)5)$(RESET)  Clean containers and images                      $(DIM)(compose down rmi all)$(RESET)\n"
	@printf "  $(RED)6)$(RESET)  Soft clean, volumes and data (keep images)       $(DIM)(softclean)$(RESET)\n"
	@printf "  $(RED)7)$(RESET)  Full clean, volumes, all project images, data    $(DIM)(fclean)$(RESET)\n"
	@printf "  $(RED)8)$(RESET)  Nuclear: wipe ALL Docker artifacts on system     $(DIM)(nukclean)$(RESET)\n"
	@printf "  $(YELLOW)9)$(RESET)  Display containers status                        $(DIM)(compose ps)$(RESET)\n"
	@printf "  $(YELLOW)10)$(RESET) Stream service logs                              $(DIM)(compose logs -f)$(RESET)\n"
	@printf "  $(YELLOW)11)$(RESET) Environment check                                $(DIM)(docker inventory)$(RESET)\n"
	@printf "  $(GREEN)12)$(RESET) Security panel  (ban, unban, status)             $(DIM)(fail2ban + firewall)$(RESET)\n"
	@printf "  $(DIM)0)  Exit without action$(RESET)\n"
	@printf "\n"
	@read -p "  Pick an option [0-12]: " choice; \
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
		4) printf "\n  $(WARN_ICON)  This will wipe all project artifacts and rebuild.\n"; \
		   printf "  $(NUKE_ICON) $(BOLD)(1)$(RESET) Confirm  /  $(SHIELD_ICON) $(BOLD)(0)$(RESET) Cancel: "; \
		   read confirm; \
		   if [ "$$confirm" = "1" ]; then $(MAKE) --no-print-directory re; \
		   else printf "  $(SHIELD_ICON) $(DIM)Cancelled.$(RESET)\n"; fi ;; \
		5) printf "\n  $(WARN_ICON)  This will remove all containers and images.\n"; \
		   printf "  $(NUKE_ICON) $(BOLD)(1)$(RESET) Confirm  /  $(SHIELD_ICON) $(BOLD)(0)$(RESET) Cancel: "; \
		   read confirm; \
		   if [ "$$confirm" = "1" ]; then $(MAKE) --no-print-directory clean; \
		   else printf "  $(SHIELD_ICON) $(DIM)Cancelled.$(RESET)\n"; fi ;; \
		6) printf "\n  $(WARN_ICON)  This will wipe volumes and data but keep images.\n"; \
		   printf "  $(NUKE_ICON) $(BOLD)(1)$(RESET) Confirm  /  $(SHIELD_ICON) $(BOLD)(0)$(RESET) Cancel: "; \
		   read confirm; \
		   if [ "$$confirm" = "1" ]; then $(MAKE) --no-print-directory softclean; \
		   else printf "  $(SHIELD_ICON) $(DIM)Cancelled.$(RESET)\n"; fi ;; \
		7) printf "\n  $(WARN_ICON)  This will wipe all project volumes, images, and data.\n"; \
		   printf "  $(NUKE_ICON) $(BOLD)(1)$(RESET) Confirm  /  $(SHIELD_ICON) $(BOLD)(0)$(RESET) Cancel: "; \
		   read confirm; \
		   if [ "$$confirm" = "1" ]; then $(MAKE) --no-print-directory fclean; \
		   else printf "  $(SHIELD_ICON) $(DIM)Cancelled.$(RESET)\n"; fi ;; \
		8) printf "\n  $(WARN_ICON)  $(RED)This will destroy ALL Docker artifacts on this system!$(RESET)\n"; \
		   printf "  $(NUKE_ICON) $(BOLD)(1)$(RESET) Confirm  /  $(SHIELD_ICON) $(BOLD)(0)$(RESET) Cancel: "; \
		   read confirm; \
		   if [ "$$confirm" = "1" ]; then $(MAKE) --no-print-directory nukclean; \
		   else printf "  $(SHIELD_ICON) $(DIM)Cancelled.$(RESET)\n"; fi ;; \
		9) $(MAKE) --no-print-directory status ;; \
		10) $(MAKE) --no-print-directory logs ;; \
		11) $(MAKE) --no-print-directory check ;; \
		12) $(MAKE) --no-print-directory security ;; \
		0) printf "  $(DIM)Exiting.$(RESET)\n" ;; \
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
	@printf "    $(CYAN)make softclean$(RESET)      Soft clean: volumes and data (keep images)\n"
	@printf "    $(CYAN)make fclean$(RESET)         Full clean: volumes, all project images, data\n"
	@printf "    $(CYAN)make nukclean$(RESET)       Nuclear: wipe ALL Docker artifacts on system\n"
	@printf "\n"
	@printf "  $(YELLOW)$(BOLD)Monitoring$(RESET)\n"
	@printf "    $(CYAN)make status$(RESET)         Display containers status\n"
	@printf "    $(CYAN)make check$(RESET)          Environment check (containers, images, volumes)\n"
	@printf "    $(CYAN)make logs$(RESET)           Stream service logs (interactive picker)\n"
	@printf "    $(CYAN)make logs-<svc>$(RESET)     Stream logs for a specific service\n"
	@printf "\n"
	@printf "  $(SHIELD_ICON) $(BOLD)Security$(RESET)\n"
	@printf "    $(CYAN)make ban IP=x.x.x.x$(RESET)  Manually ban an IP\n"
	@printf "    $(CYAN)make unban IP=x.x.x.x$(RESET) Manually unban an IP\n"
	@printf "    $(CYAN)make banned$(RESET)          List all currently banned IPs\n"
	@printf "    $(CYAN)make f2b-status$(RESET)      Show fail2ban jail status\n"
	@printf "    $(CYAN)make f2b-logs$(RESET)        Stream fail2ban logs\n"
	@printf "    $(CYAN)make fw-logs$(RESET)         Stream firewall-agent logs\n"
	@printf "    $(CYAN)make f2b-demo$(RESET)        Full chain demo (detection + ban + iptables)\n"
	@printf "    $(CYAN)make f2b-demo-nat$(RESET)    NAT evidence — why auto-ban can't fire\n"
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

softclean:
	@printf "$(CLEAN_ICON) $(YELLOW)$(BOLD)Soft cleanup: containers, volumes, data (keeping images)...$(RESET)\n"
	@$(COMPOSE) down --volumes --remove-orphans 2>/dev/null || true
	@printf "$(CLEAN_ICON) $(BLUE)Wiping data directory:$(RESET) $(YELLOW)$(DATA_DIR)$(RESET)\n"
	@sudo rm -rf $(DATA_DIR)
	@printf "$(SUCCESS_ICON) $(GREEN)Soft cleanup complete (images kept).$(RESET)\n"

fclean:
	@printf "$(NUKE_ICON) $(RED)$(BOLD)Full cleanup: containers, volumes, images, data...$(RESET)\n"
	@$(COMPOSE) down --volumes --rmi all --remove-orphans 2>/dev/null || true
	@docker rm -f $$(docker ps -a -q --filter "label=com.docker.compose.project" 2>/dev/null) 2>/dev/null || true
	@docker rmi $$(docker images -q --filter "reference=trans-*" 2>/dev/null) 2>/dev/null || true
	@$(COMPOSE) config --images 2>/dev/null | xargs -r docker rmi -f 2>/dev/null || true
	@docker volume prune -f 2>/dev/null || true
	@printf "$(CLEAN_ICON) $(BLUE)Wiping data directory:$(RESET) $(YELLOW)$(DATA_DIR)$(RESET)\n"
	@sudo rm -rf $(DATA_DIR)
	@printf "$(SUCCESS_ICON) $(GREEN)Full cleanup complete.$(RESET)\n"

nukclean:
	@printf "$(NUKE_ICON) $(RED)$(BOLD)Nuclear cleanup: EVERYTHING on Docker...$(RESET)\n"
	@docker rm -f $$(docker ps -a -q 2>/dev/null) 2>/dev/null || true
	@docker system prune -af 2>/dev/null || true
	@docker volume prune -f 2>/dev/null || true
	@printf "$(CLEAN_ICON) $(BLUE)Wiping data directory:$(RESET) $(YELLOW)$(DATA_DIR)$(RESET)\n"
	@sudo rm -rf vault/approle/ vault/certs/ vault/secrets/
	@sudo rm -rf $(DATA_DIR)
	@printf "$(SUCCESS_ICON) $(GREEN)Nuclear cleanup complete.$(RESET)\n"

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

check:
	@printf "\n"
	@printf "  $(STATUS_ICON) $(BOLD)$(MAGENTA)$(NAME)$(RESET) — $(BOLD)Environment Check$(RESET)\n"
	@printf "  $(BOLD)─────────────────────────────────────────$(RESET)\n"
	@printf "\n"
	@printf "  $(BOLD)Containers:$(RESET)  "; \
	cnt=$$(docker ps -a -q 2>/dev/null | wc -l); \
	if [ "$$cnt" -eq 0 ]; then printf "$(GREEN)None$(RESET)\n"; \
	else printf "$(RED)$$cnt found$(RESET)\n"; fi
	@printf "  $(BOLD)Images:$(RESET)      "; \
	img=$$(docker images -q 2>/dev/null | wc -l); \
	if [ "$$img" -eq 0 ]; then printf "$(GREEN)None$(RESET)\n"; \
	else printf "$(YELLOW)$$img found$(RESET)\n"; fi
	@printf "  $(BOLD)Volumes:$(RESET)     "; \
	vol=$$(docker volume ls -q 2>/dev/null | wc -l); \
	if [ "$$vol" -eq 0 ]; then printf "$(GREEN)None$(RESET)\n"; \
	else printf "$(RED)$$vol found$(RESET)\n"; fi
	@printf "  $(BOLD)Networks:$(RESET)    "; \
	net=$$(docker network ls --format '{{.Name}}' 2>/dev/null | grep -vcE '^(bridge|host|none)$$'); \
	if [ "$$net" -eq 0 ]; then printf "$(GREEN)None (only defaults)$(RESET)\n"; \
	else printf "$(YELLOW)$$net custom$(RESET)\n"; fi
	@printf "  $(BOLD)Data dir:$(RESET)    "; \
	if [ ! -d "$(DATA_DIR)" ]; then printf "$(GREEN)Clean$(RESET)\n"; \
	else printf "$(YELLOW)Exists$(RESET)\n"; fi
	@printf "\n"

# ── Security (fail2ban + firewall-agent) ──────────────────────────

.PHONY: ban unban banned f2b-status f2b-logs fw-logs security

ban:
	@if [ -z "$(IP)" ]; then \
		printf "  $(ERROR_ICON) $(RED)Usage: make ban IP=1.2.3.4$(RESET)\n"; \
	else \
		printf "  $(SHIELD_ICON) $(BOLD)Banning $(RESET)$(RED)$(IP)$(RESET)...\n"; \
		docker exec trans_fail2ban sh -c 'echo "BAN $(IP)" | socat - UNIX-CONNECT:/var/run/firewall-agent/firewall.sock'; \
	fi

unban:
	@if [ -z "$(IP)" ]; then \
		printf "  $(ERROR_ICON) $(RED)Usage: make unban IP=1.2.3.4$(RESET)\n"; \
	else \
		printf "  $(SHIELD_ICON) $(BOLD)Unbanning $(RESET)$(GREEN)$(IP)$(RESET)...\n"; \
		docker exec trans_fail2ban sh -c 'echo "UNBAN $(IP)" | socat - UNIX-CONNECT:/var/run/firewall-agent/firewall.sock'; \
	fi

banned:
	@printf "\n"
	@printf "  $(SHIELD_ICON) $(BOLD)$(MAGENTA)$(NAME)$(RESET) — $(BOLD)Banned IPs (DOCKER-USER chain)$(RESET)\n"
	@printf "  $(BOLD)─────────────────────────────────────────$(RESET)\n"
	@printf "\n"
	@sudo iptables -L DOCKER-USER -n --line-numbers 2>/dev/null | grep DROP || \
		printf "  $(GREEN)No banned IPs$(RESET)\n"
	@printf "\n"

f2b-status:
	@printf "\n"
	@printf "  $(SHIELD_ICON) $(BOLD)$(MAGENTA)$(NAME)$(RESET) — $(BOLD)fail2ban Jail Status$(RESET)\n"
	@printf "  $(BOLD)─────────────────────────────────────────$(RESET)\n"
	@printf "\n"
	@docker exec trans_fail2ban fail2ban-client status transcendence-auth 2>/dev/null || \
		printf "  $(RED)fail2ban not running$(RESET)\n"
	@printf "\n"
	@docker exec trans_fail2ban fail2ban-client status transcendence-waf 2>/dev/null || true
	@printf "\n"

f2b-logs:
	@printf "$(LOGS_ICON) $(BOLD)Streaming logs for $(RESET)$(CYAN)fail2ban$(RESET)...\n"
	@$(COMPOSE) logs -f fail2ban

fw-logs:
	@printf "$(LOGS_ICON) $(BOLD)Streaming logs for $(RESET)$(CYAN)firewall-agent$(RESET)...\n"
	@$(COMPOSE) logs -f firewall-agent


security:
	@printf "\n"
	@printf "  $(SHIELD_ICON) $(BOLD)$(MAGENTA)$(NAME)$(RESET) — $(BOLD)Security Panel$(RESET)\n"
	@printf "  $(BOLD)─────────────────────────────────────────$(RESET)\n"
	@printf "\n"
	@printf "  $(GREEN)1)$(RESET)  Show banned IPs                                  $(DIM)(iptables DOCKER-USER)$(RESET)\n"
	@printf "  $(GREEN)2)$(RESET)  Show fail2ban jail status                        $(DIM)(fail2ban-client)$(RESET)\n"
	@printf "  $(RED)3)$(RESET)  Ban an IP                                        $(DIM)(manual ban)$(RESET)\n"
	@printf "  $(RED)4)$(RESET)  Unban an IP                                      $(DIM)(manual unban)$(RESET)\n"
	@printf "  $(YELLOW)5)$(RESET)  Stream fail2ban logs                             $(DIM)(compose logs -f)$(RESET)\n"
	@printf "  $(YELLOW)6)$(RESET)  Stream firewall-agent logs                       $(DIM)(compose logs -f)$(RESET)\n"
	@printf "  $(GREEN)7)$(RESET)  Run full chain demo                             $(DIM)(f2b-demo)$(RESET)\n"
	@printf "  $(GREEN)8)$(RESET)  Show NAT evidence                               $(DIM)(f2b-demo-nat)$(RESET)\n"
	@printf "  $(DIM)0)  Back$(RESET)\n"
	@printf "\n"
	@read -p "  Pick an option [0-8]: " choice; \
	case $$choice in \
		1) $(MAKE) --no-print-directory banned ;; \
		2) $(MAKE) --no-print-directory f2b-status ;; \
		3) printf "  Enter IP to ban: "; read ip; \
		   $(MAKE) --no-print-directory ban IP=$$ip ;; \
		4) printf "  Enter IP to unban: "; read ip; \
		   $(MAKE) --no-print-directory unban IP=$$ip ;; \
		5) $(MAKE) --no-print-directory f2b-logs ;; \
		6) $(MAKE) --no-print-directory fw-logs ;; \
		7) $(MAKE) --no-print-directory f2b-demo ;; \
		8) $(MAKE) --no-print-directory f2b-demo-nat ;; \
		0) printf "  $(DIM)Back.$(RESET)\n" ;; \
		*) printf "  $(ERROR_ICON) $(RED)Invalid option.$(RESET)\n" ;; \
	esac

# ── fail2ban demo targets ────────────────────────────────────────
f2b-demo:
	@printf "\n  $(SHIELD_ICON) $(BOLD)fail2ban chain demo$(RESET)\n"
	@printf "  ─────────────────────────────────────\n\n"
	@sudo -v || { printf "  $(RED)This target needs sudo (iptables verification)$(RESET)\n"; exit 1; }

	@printf "  $(BOLD)[1/3] Detection: fail2ban filter test$(RESET)\n"
	@docker exec trans_fail2ban fail2ban-regex /var/log/nginx/access.log \
		/etc/fail2ban/filter.d/transcendence-auth.conf 2>/dev/null \
		| grep -E '^Lines:|Failregex:' | sed 's/^/    /' || true

	@printf "\n  $(BOLD)[2/3] Environment: source IPs seen by nginx$(RESET)\n"
	@printf "    (VBox NAT masks every external client as the same gateway)\n"
	@docker exec trans_frontend_nginx tail -100 /var/log/nginx/access.log 2>/dev/null \
		| cut -d' ' -f1 | sort | uniq -c | sort -rn | head -3 | sed 's/^/    /' || true

	@printf "\n  $(BOLD)[3/3] Chain: fail2ban → firewall-agent → iptables$(RESET)\n"
	@printf "    Sending BAN $(DEMO_IP) to firewall-agent...\n"
	@printf "    Reply: "
	@docker exec trans_fail2ban sh -c 'echo "BAN $(DEMO_IP)" | socat - UNIX-CONNECT:/var/run/firewall-agent/firewall.sock' 2>/dev/null || echo "(failed)"
	@sleep 0.3

	@printf "\n    iptables DOCKER-USER chain AFTER ban:\n"
	@{ sudo -n iptables -L DOCKER-USER -n --line-numbers 2>/dev/null || echo "(could not read iptables)"; } | sed 's/^/      /'
	@printf "\n    Matching rule for $(DEMO_IP):\n"
	@sudo -n iptables -L DOCKER-USER -n 2>/dev/null \
		| grep "$(DEMO_IP)" | sed 's/^/      /' \
		|| printf "      $(RED)none — ban failed$(RESET)\n"

	@printf "\n    Sending UNBAN $(DEMO_IP) to firewall-agent...\n"
	@printf "    Reply: "
	@docker exec trans_fail2ban sh -c 'echo "UNBAN $(DEMO_IP)" | socat - UNIX-CONNECT:/var/run/firewall-agent/firewall.sock' 2>/dev/null || echo "(failed)"
	@sleep 0.3

	@printf "\n    iptables DOCKER-USER chain AFTER unban:\n"
	@sudo -n iptables -L DOCKER-USER -n --line-numbers 2>/dev/null \
		| sed 's/^/      /' || printf "      (could not read iptables)\n"
	@printf "\n    Matching rule for $(DEMO_IP):\n"
	@if sudo -n iptables -L DOCKER-USER -n 2>/dev/null | grep -q "$(DEMO_IP)"; then \
		printf "      $(RED)still present ❌$(RESET)\n"; \
	else \
		printf "      $(GREEN)removed ✅$(RESET)\n"; \
	fi

	@printf "\n  $(BOLD)Note:$(RESET) auto-ban cannot fire in this VBox NAT setup.\n"
	@printf "  All external clients appear as 10.0.2.2 (gateway), which is in\n"
	@printf "  fail2ban ignoreip. Run 'make f2b-demo-nat' for the full evidence.\n\n"

.PHONY: f2b-demo


f2b-demo-nat:
	@printf "\n  $(SHIELD_ICON) $(BOLD)NAT evidence — why auto-ban cannot fire$(RESET)\n"
	@printf "  ─────────────────────────────────────\n\n"

	@printf "  $(BOLD)[1/4] VM routing table$(RESET)\n"
	@printf "    Default gateway should be 10.0.2.2 (VBox NAT):\n"
	@ip route 2>/dev/null | sed 's/^/    /' || true

	@printf "\n  $(BOLD)[2/4] What nginx logs for every request$(RESET)\n"
	@printf "    Last 5 POST /api/login lines:\n"
	@docker exec trans_frontend_nginx grep 'POST /api/login/' /var/log/nginx/access.log 2>/dev/null \
		| tail -5 | sed 's/^/    /' || true

	@printf "\n  $(BOLD)[3/4] Unique source IPs in the whole log$(RESET)\n"
	@printf "    If only 10.0.2.2 and 172.x appear, external IPs are masked:\n"
	@docker exec trans_frontend_nginx awk '{print $$1}' /var/log/nginx/access.log 2>/dev/null \
		| sort | uniq -c | sort -rn | head -5 | sed 's/^/    /' || true

	@printf "\n  $(BOLD)[4/4] fail2ban's ignoreip (why 10.0.2.2 is skipped)$(RESET)\n"
	@docker exec trans_fail2ban fail2ban-client get transcendence-auth ignoreip 2>/dev/null \
		| sed 's/^/    /' || true

	@printf "\n  $(BOLD)Conclusion:$(RESET)\n"
	@printf "    - VBox NAT rewrites every external client to 10.0.2.2\n"
	@printf "    - 10.0.2.2 is inside 10.0.0.0/8, which is in ignoreip\n"
	@printf "    - fail2ban sees the attacks but correctly skips the IP\n"
	@printf "    - Fix: VBox 'Bridged Adapter' mode (or host-only + proxy)\n"
	@printf "    - Chain proof via 'make f2b-demo' (manual ban works)\n\n"

.PHONY: f2b-demo-nat

