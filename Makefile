# ─────────────────────────────────────────────────────────────────────────────
#  Safeheld — Makefile shortcuts
#  Run `make help` to list all targets.
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: help up down build logs migrate seed shell-api backup restore secrets health

help:
	@echo ""
	@echo "Safeheld deployment shortcuts"
	@echo "─────────────────────────────"
	@echo "  make secrets   Generate random secrets (paste into .env)"
	@echo "  make up        Build images and start all services"
	@echo "  make down      Stop all services (data preserved)"
	@echo "  make build     Rebuild images without starting"
	@echo "  make logs      Stream logs from all services"
	@echo "  make migrate   Run Prisma database migrations"
	@echo "  make seed      Seed the admin user"
	@echo "  make shell     Open a shell in the API container"
	@echo "  make health    Check all service health endpoints"
	@echo "  make backup    Dump PostgreSQL to backup_YYYYMMDD.sql"
	@echo "  make ps        Show running containers and health status"
	@echo ""

secrets:
	@bash scripts/generate-secrets.sh

up:
	docker compose up -d --build
	@echo ""
	@echo "Services starting. Run 'make logs' to watch progress."
	@echo "Once healthy, run 'make migrate' then 'make seed' (first time only)."

down:
	docker compose down

build:
	docker compose build

logs:
	docker compose logs -f

ps:
	docker compose ps

migrate:
	docker compose exec api npm run migrate

seed:
	docker compose exec api npm run seed

shell:
	docker compose exec api sh

health:
	@bash scripts/healthcheck.sh

backup:
	@FILENAME="backup_$$(date +%Y%m%d_%H%M%S).sql"; \
	docker compose exec postgres pg_dump -U $${POSTGRES_USER:-safeheld} $${POSTGRES_DB:-safeheld} > $$FILENAME; \
	echo "Backup saved to $$FILENAME"

restore:
	@if [ -z "$(FILE)" ]; then echo "Usage: make restore FILE=backup_20260101.sql"; exit 1; fi
	@cat $(FILE) | docker compose exec -T postgres psql -U $${POSTGRES_USER:-safeheld} $${POSTGRES_DB:-safeheld}
	@echo "Restore complete from $(FILE)"
