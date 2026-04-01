#!/usr/bin/env bash
# ====================================================
# LegalShield — Full Deploy Script
# Usage: ./scripts/deploy.sh
# Requires: supabase CLI, vercel CLI, git
# ====================================================
set -e

echo "╔══════════════════════════════════════════════╗"
echo "║   LegalShield — Deploy Script                ║"
echo "╚══════════════════════════════════════════════╝"

# 1. Push Supabase database migrations
echo ""
echo "▶  Pushing Supabase DB migrations..."
supabase db push

# 2. Set Edge Function secrets
echo ""
echo "▶  Setting Edge Function secrets..."
supabase secrets set \
  GEMINI_API_KEYS="${GEMINI_API_KEYS}" \
  GROQ_API_KEYS="${GROQ_API_KEYS}" \
  CLOUDINARY_CLOUD_NAME="${CLOUDINARY_CLOUD_NAME}" \
  CLOUDINARY_API_KEY="${CLOUDINARY_API_KEY}" \
  CLOUDINARY_API_SECRET="${CLOUDINARY_API_SECRET}" \
  CLOUDINARY_UPLOAD_PREFIX="${CLOUDINARY_UPLOAD_PREFIX}" \
  STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY}" \
  STRIPE_PRICE_PRO_MONTHLY="${STRIPE_PRICE_PRO_MONTHLY}" \
  STRIPE_PRICE_ENTERPRISE_MONTHLY="${STRIPE_PRICE_ENTERPRISE_MONTHLY}" \
  BROWSERLESS_TOKEN="${BROWSERLESS_TOKEN}"

# 3. Deploy all Edge Functions
echo ""
echo "▶  Deploying Supabase Edge Functions..."
supabase functions deploy risk-review
supabase functions deploy delete-file-assets
supabase functions deploy generate-contract
supabase functions deploy parse-document
supabase functions deploy export-pdf
supabase functions deploy create-checkout-session
supabase functions deploy query-law

# 4. Deploy frontend to Vercel
echo ""
echo "▶  Deploying frontend to Vercel..."
cd legalshield-web
vercel --prod \
  --env VITE_SUPABASE_URL="${VITE_SUPABASE_URL}" \
  --env VITE_SUPABASE_ANON_KEY="${VITE_SUPABASE_ANON_KEY}"

echo ""
echo "✅  Deploy complete!"
echo "    Frontend: https://legalshield.vercel.app"
echo "    Supabase: ${VITE_SUPABASE_URL}"
