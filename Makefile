# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# LegalShield — Management Makefile
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

.PHONY: help deploy-supabase deploy-frontend dev test test-frontend test-backend test-e2e

help:
	@echo "LegalShield Management Commands:"
	@echo "  make dev             - Start frontend development server"
	@echo "  make deploy-supabase - Push migrations, set secrets, and deploy Edge Functions"
	@echo "  make deploy-frontend - Deploy React app to Vercel"
	@echo "  make test            - Run all complete testing logic (Frontend, Backend, E2E)"
	@echo "  make test-frontend   - Run Vitest for UI components"
	@echo "  make test-backend    - Run Deno tests for Edge Functions"
	@echo "  make test-e2e        - Run Playwright tests for complete browser workflows"

dev:
	cd legalshield-web && npm run dev

# Deploy Supabase (DB + Secrets + Functions)
# Loads secrets from ./supabase/.env
deploy-supabase:
	@echo "▶ Pushing database migrations..."
	@set -a && . ./supabase/.env && set +a && \
	npx supabase db push --password "$$SUPABASE_DB_PASSWORD"
	@echo "▶ Setting Edge Function secrets from supabase/.env..."
	@set -a && . ./supabase/.env && set +a && \
	npx supabase secrets set --project-ref "$$SUPABASE_PROJECT_ID" \
		GEMINI_API_KEYS="$$GEMINI_API_KEYS" \
		GROQ_API_KEYS="$$GROQ_API_KEYS" \
		EXA_API_KEYS="$$EXA_API_KEYS" \
		UPSTASH_REDIS_REST_URL="$$UPSTASH_REDIS_REST_URL" \
		UPSTASH_REDIS_REST_TOKEN="$$UPSTASH_REDIS_REST_TOKEN" \
		JINA_API_KEY="$$JINA_API_KEY" \
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
	@set -a && . ./supabase/.env && set +a && \
	npx supabase functions deploy risk-review --project-ref "$$SUPABASE_PROJECT_ID" --no-verify-jwt && \
	npx supabase functions deploy generate-contract --project-ref "$$SUPABASE_PROJECT_ID" --no-verify-jwt && \
	npx supabase functions deploy parse-document --project-ref "$$SUPABASE_PROJECT_ID" --no-verify-jwt && \
	npx supabase functions deploy ingest-contract --project-ref "$$SUPABASE_PROJECT_ID" --no-verify-jwt && \
	npx supabase functions deploy legal-chat --project-ref "$$SUPABASE_PROJECT_ID" --no-verify-jwt && \
	npx supabase functions deploy export-pdf --project-ref "$$SUPABASE_PROJECT_ID" --no-verify-jwt && \
	npx supabase functions deploy create-checkout-session --project-ref "$$SUPABASE_PROJECT_ID" --no-verify-jwt && \
	npx supabase functions deploy momo-payment --project-ref "$$SUPABASE_PROJECT_ID" --no-verify-jwt && \
	npx supabase functions deploy vnpay-payment --project-ref "$$SUPABASE_PROJECT_ID" --no-verify-jwt && \
	npx supabase functions deploy payment-webhook --project-ref "$$SUPABASE_PROJECT_ID" --no-verify-jwt && \
	npx supabase functions deploy contract-qa --project-ref "$$SUPABASE_PROJECT_ID" --no-verify-jwt
	@echo "✅ Supabase deployment complete!"

# Deploy Frontend to Vercel
# Loads VITE_ vars from ./legalshield-web/.env
deploy-frontend:
	@echo "▶ Deploying Frontend to Vercel..."
	@set -a && . ./legalshield-web/.env && set +a && \
	cd legalshield-web && vercel --prod \
		--env VITE_SUPABASE_URL="$$VITE_SUPABASE_URL" \
		--env VITE_SUPABASE_ANON_KEY="$$VITE_SUPABASE_ANON_KEY"

# Testing Suites
test-frontend:
	@echo "▶ Running Frontend Unit Tests (Vitest)..."
	cd legalshield-web && npx vitest run

test-backend:
	@echo "▶ Running Backend Edge Function Tests (Supabase CLI)..."
	npx supabase functions test

test-e2e:
	@echo "▶ Running Playwright E2E Tests..."
	cd legalshield-web && npx playwright test

test: test-frontend test-backend test-e2e
	@echo "✅ All test suites passed successfully!"
