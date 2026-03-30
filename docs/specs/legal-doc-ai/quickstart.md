# Quickstart: Legal Doc AI

This guide helps you spin up the serverless backend for Legal Doc AI locally.

## Prerequisites
- Docker (for local Supabase)
- Supabase CLI installed (`npm i -g supabase`)
- API Keys:
  - `GEMINI_API_KEY` (Google AI Studio)
  - `GROQ_API_KEY` (Groq Cloud)

## Setup Steps

1. **Initialize Supabase**
   ```bash
   supabase init
   supabase start
   ```

2. **Apply Database Migrations**
   The project includes migrations for `pgvector` and the data schema.
   ```bash
   supabase db reset
   ```

3. **Configure Secrets**
   Set the API keys in your local Supabase Edge Functions environment:
   ```bash
   supabase secrets set "GEMINI_API_KEY=your_gemini_key"
   supabase secrets set "GROQ_API_KEY=your_groq_key"
   ```

4. **Serve Edge Functions Locally**
   Start the local edge function server:
   ```bash
   supabase functions serve
   ```

5. **Test Ingestion Script**
   Run the dummy ingestion script to insert some test law chunks:
   ```bash
   npm run ingest:test
   ```

## Next Steps
- Implement frontend UI in your preferred framework using `@supabase/supabase-js`.
- Connect the frontend to `/functions/v1/generate-contract`.
