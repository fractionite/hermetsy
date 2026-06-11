.PHONY: all install dev build docker-build docker-run prod prod-stop migrate studio reset-db clean test help

# Default target
all: dev

# Install all dependencies
install:
	@echo "Installing workspace dependencies..."
	npm install

# Run development environment
dev:
	@echo "Starting local Docker development environment..."
	docker compose up --build

# Build all workspaces for production checks
build:
	@echo "Building workspace packages..."
	npm run build --workspaces --if-present

# Docker targets
docker-build:
	@echo "Building Docker images..."
	docker compose build

docker-run:
	@echo "Running Docker Compose stack..."
	docker compose up

# Production-like compose targets
prod:
	@echo "Starting production-like containers..."
	docker compose up --build -d

prod-stop:
	@echo "Stopping production-like containers..."
	docker compose down

# Prisma migration targets
migrate:
	@echo "Applying Prisma migration to Postgres..."
	docker compose up -d postgres redis api
	docker compose exec api npm run db:migrate --workspace @etsybot/database
	@echo "Seeding local mock data..."
	docker compose exec api npm run db:seed --workspace @etsybot/database

seed:
	@echo "Seeding local mock data..."
	docker compose up -d postgres redis api
	docker compose exec api npm run db:seed --workspace @etsybot/database

studio:
	@echo "Opening Prisma Studio..."
	docker compose up -d postgres redis api
	docker compose exec api npm run db:studio --workspace @etsybot/database

reset-db:
	@echo "Resetting Prisma database..."
	docker compose up -d postgres redis api
	docker compose exec api npm run db:reset --workspace @etsybot/database

# Testing
test:
	@echo "Running workspace tests..."
	npm test --workspaces --if-present

# Clean up build artifacts
clean:
	@echo "Cleaning build artifacts..."
	rm -rf apps/web/.next
	rm -rf apps/api/dist
	rm -rf apps/worker/dist
	rm -rf packages/shared/dist
	rm -rf packages/database/dist

# Help
help:
	@echo "Available targets:"
	@echo "  make install      - Install workspace dependencies"
	@echo "  make dev          - Start the local Docker development environment"
	@echo "  make build        - Build all workspaces"
	@echo "  make docker-build - Build Docker images"
	@echo "  make docker-run   - Run the Docker Compose stack"
	@echo "  make prod         - Start containers in detached mode"
	@echo "  make prod-stop    - Stop containers"
	@echo "  make migrate      - Apply Prisma migrations inside the api container"
	@echo "  make seed         - Seed the database with mock Etsy shop/listings"
	@echo "  make studio       - Open Prisma Studio inside the api container"
	@echo "  make reset-db     - Reset the Prisma database"
	@echo "  make test         - Run workspace tests"
	@echo "  make clean        - Remove build artifacts"
