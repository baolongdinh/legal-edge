# ⚙️ LegalShield - Setup & Installation Guide

Follow these steps to initialize and deploy your own instance of the LegalShield Regulatory Search Engine.

## 📋 Prerequisites

- **Node.js**: v18+ (LTS recommended)
- **Supabase CLI**: For database sync and Edge Function deployment.
- **Docker**: Required for local testing of Edge Functions.
- **API Keys**: Access to Gemini (Google), Exa, and Jina AI.

---

## 🛠 Installation

### 1. Repository Setup
```bash
git clone <your-repo-url>
cd LegalEdge
```

### 2. Frontend Configuration
```bash
cd legalshield-web
npm install

# Create local environment file
cat <<EOF > .env.local
VITE_SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
EOF
```

---

## ☁️ Deployment

### 1. Database & Edge Functions
We use a **Makefile** to streamline the multi-step deployment process.

1.  **Link to Supabase**:
    ```bash
    npx supabase link --project-ref your-project-id
    ```

2.  **Configure Secrets**:
    Update `supabase/.env` with your API keys, then run:
    ```bash
    make deploy-supabase
    ```

### 2. Frontend (Vercel)
Ensure you have the Vercel CLI installed, then run:
```bash
make deploy-frontend-vercel
```

---

## 🧠 Knowledge Ingestion (RAG)

LegalShield requires a "seeded" database to provide accurate legal context.

### 1. Seed Legal Templates
```bash
# Crawl, Promote, and Embed documents
make sync-templates
```

### 2. Verification
Check the `public.templates` table in your Supabase Dashboard to ensure vectors (768D) have been generated.

---

## 🚀 Development Workflow

### Start Frontend Dev Server
```bash
make dev
# or
cd legalshield-web && npm run dev
```

### Run Test Suite
```bash
make test
```

---
*For product overview and features, see [README.md](file:///home/aiozlong/DATA/CODE/SELF_PROD/LegalEdge/README.md).*
