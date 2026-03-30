# Feature Specification: Infrastructure Optimization (Items 1, 2, 4)

**Status**: Draft
**Owner**: AI Agent (Antigravity)
**Decisions**: [AI-01, DB-01, CS-01]

## Overview

This feature encompasses three key infrastructure optimizations for the LegalShield platform to reduce operational costs, minimize server load, and improve scalability.

1.  **AI Token Optimization**: Implementing multi-model routing to prioritize cheaper, faster models (Gemini 1.5 Flash) for preliminary analysis and text cleaning.
2.  **Database Optimization**: Implementing Postgres Materialized Views to offload complex dashboard statistics from real-time CPU-intensive queries to scheduled cache updates.
3.  **Client-side PDF Parsing**: Moving PDF text extraction from the Supabase Edge Function to the user's browser using `pdfjs-dist` to save server memory and CPU.

## Success Criteria

- [ ] AI operational costs for contract analysis reduced by at least 40%.
- [ ] Average dashboard load time reduced to under 500ms.
- [ ] Edge Function memory usage during contract upload reduced by 80% (by offloading parsing).
- [ ] System remains functional with consistent analysis results across model transitions.

## User Scenarios

### Scenario 1: Cost-Effective Contract Analysis
A user uploads a 50-page contract. The system first uses Gemini 1.5 Flash to extract and clean the text, then only sends relevant clauses to the more expensive Llama-3-70B model for deep risk review, significantly reducing total token cost.

### Scenario 2: Instant Dashboard Stats
A manager views the contract dashboard. Instead of the database recalculating risk scores across 10,000 contracts in real-time, it pulls from a Materialized View that refreshes every hour, resulting in near-instant load times.

### Scenario 3: Large File Parsing
A user uploads a 20MB PDF. Instead of the Edge Function potentially timing out or hitting memory limits while parsing, the user's browser performs the extraction and sends only the text (a few KB) to the server.

## Functional Requirements

### 1. AI Routing Logic
- [ ] Implement a `summarize` / `extract` step using Gemini 1.5 Flash in `risk-review`.
- [ ] Add logic to decide whether a clause needs "Deep Review" (Llama-3-70B) or can be handled by Gemini 1.5 Flash.

### 2. Materialized Views
- [ ] Create a `mv_contract_stats` view in Postgres.
- [ ] Implement a mechanism to refresh the view (e.g., a trigger or a scheduled Edge Function).

### 3. Client-side Parsing
- [ ] Integrate `pdfjs-dist` into the React frontend.
- [ ] Update `UploadZone` in `ContractAnalysis.tsx` to extract text locally from the `File` object.
- [ ] Update `parse-document` Edge Function to be an optional fallback for non-PDF files if needed.

## Non-Functional Requirements

- **Performance**: Browser-side parsing should not lock the UI thread (use a Web Worker if possible).
- **Security**: All text extracted on the client must still be validated on the server.
- **Scalability**: Support for up to 100 concurrent users analyzing contracts simultaneously.

## Dependencies & Assumptions

- **Dependencies**: `pdfjs-dist`, `Gemini API`, `Supabase PG_CRON` (optional).
- **Assumptions**: User's browser is modern enough to support `pdfjs-dist`.

## Open Questions / Risks

- [NEEDS CLARIFICATION: Should internal DOCX parsing also move to client-side using `mammoth`?]
- [NEEDS CLARIFICATION: What is the acceptable delay for Materialized View refreshes? (e.g., Hourly, Daily, or On-Demand?)]
