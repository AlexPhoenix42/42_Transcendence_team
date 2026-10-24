setup:
	@command -v python3 >/dev/null || { \
		echo "❌ python3 not found"; \
		if command -v apt >/dev/null; then \
			echo "   → sudo apt install python3"; \
		elif command -v xbps-install >/dev/null; then \
			echo "   → sudo xbps-install python3"; \
		fi; \
		exit 1; \
	}
	@python3 -c "import venv" 2>/dev/null || { \
		echo "❌ python3-venv not installed"; \
		if command -v apt >/dev/null; then \
			echo "   → sudo apt install python3-venv"; \
		elif command -v xbps-install >/dev/null; then \
			echo "   → sudo xbps-install python3"; \
		fi; \
		exit 1; \
	}
	@python3 -m venv .venv
	@PIP_DISABLE_PIP_VERSION_CHECK=1 .venv/bin/pip install pygame-ce pygbag

build:
	@rm -rf src/build
	@.venv/bin/pygbag --build src/main.py

run:
	@cd src && ../.venv/bin/python3 main.py

serve:
	@python3 -m http.server 8000 -d src/build/web/

clean:
	@rm -rf src/build

fclean: clean
	@find src -type d -name __pycache__ -exec rm -rf {} +
	@rm -f src/highscores.json
	@rm -rf .venv

re: fclean build

.PHONY: all build run serve clean fclean re setup

