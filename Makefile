# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# LegalShield — Management Makefile
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

.PHONY: help deploy-supabase deploy-frontend dev

help:
	@echo "LegalShield Management Commands:"
	@echo "  make dev             - Start frontend development server"
	@echo "  make deploy-supabase - Push migrations, set secrets, and deploy Edge Functions"
	@echo "  make deploy-frontend - Deploy React app to Vercel"

dev:
	cd legalshield-web && npm run dev

# Deploy Supabase (DB + Secrets + Functions)
# Loads secrets from ./supabase/.env
deploy-supabase:
	@echo "▶ Pushing database migrations..."
	supabase db push
	@echo "▶ Setting Edge Function secrets from supabase/.env..."
	@set -a && . ./supabase/.env && set +a && \
	supabase secrets set \
		GEMINI_API_KEYS="$$GEMINI_API_KEYS" \
		GROQ_API_KEYS="$$GROQ_API_KEYS" \
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
	supabase functions deploy risk-review
	supabase functions deploy generate-contract
	supabase functions deploy parse-document
	supabase functions deploy export-pdf
	supabase functions deploy create-checkout-session
	supabase functions deploy momo-payment
	supabase functions deploy vnpay-payment
	supabase functions deploy payment-webhook
	@echo "✅ Supabase deployment complete!"

# Deploy Frontend to Vercel
# Loads VITE_ vars from ./legalshield-web/.env
deploy-frontend:
	@echo "▶ Deploying Frontend to Vercel..."
	@set -a && . ./legalshield-web/.env && set +a && \
	cd legalshield-web && vercel --prod \
		--env VITE_SUPABASE_URL="$$VITE_SUPABASE_URL" \
		--env VITE_SUPABASE_ANON_KEY="$$VITE_SUPABASE_ANON_KEY"

