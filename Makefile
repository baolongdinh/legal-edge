# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# LegalShield — Management Makefile
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SHELL := /usr/bin/env bash

WEB_DIR := legalshield-web
SUPABASE_ENV := ./supabase/.env
WEB_ENV := ./legalshield-web/.env

SUPABASE_CLI := npx supabase
SUPABASE_PROJECT_ID := xrfhkyjwesxpybsooeot
COLOR_YELLOW := \033[1;33m
COLOR_GREEN := \033[1;32m
COLOR_RESET := \033[0m

.PHONY: help dev install-frontend deploy deploy-frontend-vercel deploy-supabase crawl-templates promote-templates snapshot-templates refine-templates render-template-pdfs publish-template-assets sync-templates init-templates test test-frontend test-backend test-e2e

help:
	@echo "LegalShield Management Commands:"
	@echo "  make dev                   - Start frontend development server"
	@echo "  make deploy                - Deploy frontend production to Vercel"
	@echo "  make deploy-supabase       - Push migrations, set secrets, and deploy Edge Functions"
	@echo "  make crawl-templates       - Crawl candidate legal templates from the web into repo JSON"
	@echo "  make promote-templates     - Promote crawled JSON into templates/library markdown + manifest entries"
	@echo "  make snapshot-templates    - Fetch and store original source artifacts for promoted web templates"
	@echo "  make refine-templates      - Clean promoted template content from captured source HTML"
	@echo "  make render-template-pdfs  - Render clean PDF deliverables for templates without original DOC/PDF files"
	@echo "  make publish-template-assets - Copy template files into frontend public assets for runtime viewing"
	@echo "  make sync-templates        - Run crawl -> promote -> snapshot -> refine -> render -> publish -> init as one end-to-end template pipeline"
	@echo "  make init-templates        - Seed repo templates into public.templates and synchronize existing rows"
	@echo "  make test                  - Run all complete testing logic (Frontend, Backend, E2E)"
	@echo "  make test-frontend         - Run Vitest for UI components"
	@echo "  make test-backend          - Run Deno tests for Edge Functions"
	@echo "  make test-e2e              - Run Playwright tests for complete browser workflows"

dev:
	cd $(WEB_DIR) && npm run dev

install-frontend:
	@echo "▶ Installing frontend dependencies..."
	cd $(WEB_DIR) && npm install

deploy:
	@$(MAKE) deploy-frontend-vercel

deploy-frontend-vercel:
	@echo "$(COLOR_YELLOW)Deploying frontend to Vercel...$(COLOR_RESET)"
	@set -a && . $(WEB_ENV) && set +a && \
	cd $(WEB_DIR) && npx vercel --prod \
		--build-env VITE_SUPABASE_URL="$$VITE_SUPABASE_URL" \
		--build-env VITE_SUPABASE_ANON_KEY="$$VITE_SUPABASE_ANON_KEY" \
		--env VITE_SUPABASE_URL="$$VITE_SUPABASE_URL" \
		--env VITE_SUPABASE_ANON_KEY="$$VITE_SUPABASE_ANON_KEY"
	@echo "$(COLOR_GREEN)✓ Frontend deployment to Vercel completed$(COLOR_RESET)"

# Deploy Supabase (DB + Secrets + Functions)
# Loads secrets from ./supabase/.env
deploy-supabase:
	@echo "▶ Pushing database migrations..."
	@set -a && . $(SUPABASE_ENV) && set +a && \
	$(SUPABASE_CLI) db push --password "$$SUPABASE_DB_PASSWORD"
	@echo "▶ Setting Edge Function secrets from supabase/.env..."
	@set -a && . $(SUPABASE_ENV) && set +a && \
	$(SUPABASE_CLI) secrets set --project-ref $(SUPABASE_PROJECT_ID) \
		GEMINI_API_KEYS="$$GEMINI_API_KEYS" \
		GROQ_API_KEYS="$$GROQ_API_KEYS" \
		EXA_API_KEYS="$$EXA_API_KEYS" \
		UPSTASH_REDIS_REST_URL="$$UPSTASH_REDIS_REST_URL" \
		UPSTASH_REDIS_REST_TOKEN="$$UPSTASH_REDIS_REST_TOKEN" \
		JINA_API_KEYS="$$JINA_API_KEYS" \
		CLOUDINARY_CLOUD_NAME="$$CLOUDINARY_CLOUD_NAME" \
		CLOUDINARY_API_KEY="$$CLOUDINARY_API_KEY" \
		CLOUDINARY_API_SECRET="$$CLOUDINARY_API_SECRET" \
		CLOUDINARY_UPLOAD_PREFIX="$$CLOUDINARY_UPLOAD_PREFIX" \
		STRIPE_SECRET_KEY="$$STRIPE_SECRET_KEY" \
		STRIPE_PRICE_PRO_MONTHLY="$$STRIPE_PRICE_PRO_MONTHLY" \
		STRIPE_PRICE_ENTERPRISE_MONTHLY="$$STRIPE_PRICE_ENTERPRISE_MONTHLY" \
		BROWSERLESS_TOKEN="$$BROWSERLESS_TOKEN" \
		MOMO_PARTNER_CODE="$$MOMO_PARTNER_CODE" \
		MOMO_ACCESS_KEY="$$MOMO_ACCESS_KEY" \
		MOMO_SECRET_KEY="$$MOMO_SECRET_KEY" \
		VNPAY_TMN_CODE="$$VNPAY_TMN_CODE" \
		VNPAY_HASH_SECRET="$$VNPAY_HASH_SECRET" \
		R2_BUCKET="$$R2_BUCKET" \
		R2_ACCESS_KEY_ID="$$R2_ACCESS_KEY_ID" \
		R2_SECRET_ACCESS_KEY="$$R2_SECRET_ACCESS_KEY" \
		R2_ENDPOINT="$$R2_ENDPOINT" \
		R2_PUBLIC_DOMAIN="$$R2_PUBLIC_DOMAIN"
	@echo "▶ Deploying all Edge Functions..."
	@set -a && . $(SUPABASE_ENV) && set +a && \
	$(SUPABASE_CLI) functions deploy risk-review --project-ref $(SUPABASE_PROJECT_ID) --use-api && \
	$(SUPABASE_CLI) functions deploy delete-file-assets --project-ref $(SUPABASE_PROJECT_ID) --use-api && \
	$(SUPABASE_CLI) functions deploy generate-contract --project-ref $(SUPABASE_PROJECT_ID) --use-api && \
	$(SUPABASE_CLI) functions deploy parse-document --project-ref $(SUPABASE_PROJECT_ID) --use-api && \
	$(SUPABASE_CLI) functions deploy ingest-contract --project-ref $(SUPABASE_PROJECT_ID) --use-api && \
	$(SUPABASE_CLI) functions deploy legal-chat --project-ref $(SUPABASE_PROJECT_ID) --use-api && \
	$(SUPABASE_CLI) functions deploy create-checkout-session --project-ref $(SUPABASE_PROJECT_ID) --use-api && \
	$(SUPABASE_CLI) functions deploy momo-payment --project-ref $(SUPABASE_PROJECT_ID) --use-api && \
	$(SUPABASE_CLI) functions deploy vnpay-payment --project-ref $(SUPABASE_PROJECT_ID) --use-api && \
	$(SUPABASE_CLI) functions deploy payment-webhook --project-ref $(SUPABASE_PROJECT_ID) --use-api && \
	$(SUPABASE_CLI) functions deploy contract-qa --project-ref $(SUPABASE_PROJECT_ID) --use-api && \
	$(SUPABASE_CLI) functions deploy get-conversations --project-ref $(SUPABASE_PROJECT_ID) --use-api && \
	$(SUPABASE_CLI) functions deploy get-messages --project-ref $(SUPABASE_PROJECT_ID) --use-api && \
	$(SUPABASE_CLI) functions deploy save-conversation --project-ref $(SUPABASE_PROJECT_ID) --use-api && \
	$(SUPABASE_CLI) functions deploy save-message --project-ref $(SUPABASE_PROJECT_ID) --use-api && \
	$(SUPABASE_CLI) functions deploy generate-suggestions --project-ref $(SUPABASE_PROJECT_ID) --use-api && \
	$(SUPABASE_CLI) functions deploy summarize-conversation --project-ref $(SUPABASE_PROJECT_ID) --use-api
	@echo "✅ Supabase deployment complete!"

deploy-frontend:
	@$(MAKE) deploy

crawl-templates:
	@echo "▶ Crawling web template candidates into templates/crawled ..."
	@set -a && . $(SUPABASE_ENV) && set +a && \
	node ./scripts/crawl_templates.mjs

promote-templates:
	@echo "▶ Promoting crawled templates into templates/library ..."
	@set -a && . $(SUPABASE_ENV) && set +a && \
	node ./scripts/promote_templates.mjs

snapshot-templates:
	@echo "▶ Capturing original source artifacts for promoted templates ..."
	@set -a && . $(SUPABASE_ENV) && set +a && \
	node ./scripts/snapshot_template_sources.mjs

refine-templates:
	@echo "▶ Refining promoted template content from captured sources ..."
	@set -a && . $(SUPABASE_ENV) && set +a && \
	node ./scripts/refine_promoted_templates.mjs

render-template-pdfs:
	@echo "▶ Rendering clean PDF versions for HTML-only templates ..."
	@set -a && . $(SUPABASE_ENV) && set +a && \
	node ./scripts/render_template_pdfs.mjs

publish-template-assets:
	@echo "▶ Publishing template file assets to frontend public directory ..."
	node ./scripts/publish_template_assets.mjs

sync-templates: crawl-templates promote-templates snapshot-templates refine-templates render-template-pdfs publish-template-assets init-templates
	@echo "✅ Template crawl/promote/init pipeline completed"

init-templates:
	@echo "▶ Seeding repo templates into public.templates ..."
	@set -a && . $(SUPABASE_ENV) && . $(WEB_ENV) && set +a && \
	INIT_INCLUDE_CRAWLED=today node ./scripts/init_templates.mjs

# Testing Suites
test-frontend:
	@echo "▶ Running Frontend Unit Tests (Vitest)..."
	cd $(WEB_DIR) && npx vitest run

test-backend:
	@echo "▶ Running Backend Edge Function Tests (Supabase CLI)..."
	npx supabase functions test

test-e2e:
	@echo "▶ Running Playwright E2E Tests..."
	cd $(WEB_DIR) && npx playwright test

test: test-frontend test-backend test-e2e
	@echo "✅ All test suites passed successfully!"
