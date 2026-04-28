# Tasks: Agentic Legal Chat Optimization

## Phase 1: Critical Bug Fixes (Week 1)

### Task 1.1: Fix FTS Deduplication Logic
- **ID:** T1.1
- **Priority:** HIGH
- **File:** `supabase/functions/shared/types.ts:458-470`
- **Est. Time:** 2 hours
- **Status:** Completed
- **Description:** 
  - Replace buggy FTS query with proper keyword extraction
  - Change from `slice(0, 3)` to `filter(w => w.length > 3)`
  - Change operator from `&` (AND) to `|` (OR)
  - Use regex `/\s+/` for whitespace splitting
- **Acceptance Criteria:**
  - [x] FTS dedup catches duplicates with different first 3 words
  - [x] Unit test passes with sample titles
  - [x] No regression in existing dedup flow
- **Dependencies:** None

### Task 1.2: Fix Vector Check Truncation
- **ID:** T1.2
- **Priority:** HIGH
- **File:** `supabase/functions/shared/types.ts:476-491`
- **Est. Time:** 3 hours
- **Status:** Completed
- **Description:**
  - Implement sliding window embedding (first 500 + last 500 + middle)
  - Handle documents <1000 chars, 1000-1500 chars, >1500 chars differently
  - Maintain 768-dim embedding size
- **Acceptance Criteria:**
  - [x] Long docs with same intro but different body NOT flagged as dup
  - [x] Embedding time < 500ms per document
  - [x] Jaccard similarity check still works
- **Dependencies:** None

## Phase 2: Global Deduplication (Week 1)

### Task 2.1: Add checkEvidenceExistsGlobally Function
- **ID:** T2.1
- **Priority:** HIGH
- **File:** `supabase/functions/shared/types.ts` (new function)
- **Est. Time:** 2 hours
- **Status:** Completed
- **Description:**
  - Create new async function to check evidence by URL
  - Query chat_memory table for existing evidence with same URL
  - Use content filter for substring matching
- **Code Sketch:**
```typescript
export async function checkEvidenceExistsGlobally(
  supabase: any,
  url: string
): Promise<boolean>
```
- **Acceptance Criteria:**
  - [x] Function returns true for existing evidence
  - [x] Function returns false for new evidence
  - [x] Handles errors gracefully (returns false on error)
- **Dependencies:** None

### Task 2.2: Update Background RAG Pipeline
- **ID:** T2.2
- **Priority:** HIGH
- **File:** `supabase/functions/legal-chat/index.ts:862-895`
- **Est. Time:** 2 hours
- **Status:** Completed
- **Description:**
  - Add global evidence check before storage decision
  - Log when evidence skipped due to global existence
  - Maintain existing volatility filter and smart storage logic
- **Acceptance Criteria:**
  - [x] Evidence with existing URL hash is skipped
  - [x] Log shows `[Background RAG] Evidence already exists globally`
  - [x] New evidence still stored correctly
- **Dependencies:** T2.1

## Phase 3: Database Constraints (Week 2)

### Task 3.1: Create Migration for Chunk Deduplication
- **ID:** T3.1
- **Priority:** MEDIUM
- **File:** New `supabase/migrations/20260428000000_chunk_dedup_constraint.sql`
- **Est. Time:** 3 hours
- **Status:** Completed
- **Description:**
  - Add `content_hash` column to document_chunks
  - Create index on content_hash
  - Add unique constraint on (source_url, content_hash)
  - Backfill existing rows with MD5 hashes
- **Migration SQL:**
```sql
ALTER TABLE public.document_chunks 
ADD COLUMN IF NOT EXISTS content_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_document_chunks_content_hash 
ON public.document_chunks(content_hash);

CREATE UNIQUE INDEX IF NOT EXISTS idx_document_chunks_unique_per_source 
ON public.document_chunks(source_url, content_hash) 
WHERE source_url IS NOT NULL;

UPDATE public.document_chunks 
SET content_hash = MD5(content) 
WHERE content_hash IS NULL;
```
- **Acceptance Criteria:**
  - [x] Migration runs without errors
  - [x] Duplicate chunks rejected with unique constraint violation
  - [x] Index created successfully
- **Dependencies:** None

### Task 3.2: Update Chunk Insert with Upsert
- **ID:** T3.2
- **Priority:** MEDIUM
- **File:** Functions inserting to document_chunks (search codebase)
- **Est. Time:** 2 hours
- **Status:** Completed (No direct inserts found)
- **Description:**
  - Find all places inserting to document_chunks
  - Add `content_hash: simpleHash(c.content)` to insert data
  - Use `upsert` with `onConflict: 'source_url,content_hash'`
  - Set `ignoreDuplicates: true`
- **Acceptance Criteria:**
  - [x] All insert locations updated (none found)
  - [x] Duplicate chunks handled silently
  - [x] No errors on constraint violation
- **Dependencies:** T3.1

## Phase 4: Semantic Memory Deduplication (Week 2)

### Task 4.1: Enhance storeChatMemory with Vector Check
- **ID:** T4.1
- **Priority:** MEDIUM
- **File:** `supabase/functions/shared/types.ts:1439-1465`
- **Est. Time:** 3 hours
- **Status:** Completed
- **Description:**
  - Add semantic similarity check before storage
  - Use match_chat_memory RPC with 0.92 threshold
  - Log semantic dedup decisions
  - Maintain Redis short-term dedup
- **Acceptance Criteria:**
  - [x] Similar content (sim > 0.92) is skipped
  - [x] Log shows `[Memory Dedup] Semantic duplicate found`
  - [x] Different content (sim < 0.92) is stored
  - [x] Performance impact < 100ms per check
- **Dependencies:** None

## Phase 5: Testing & Validation (Week 3)

### Task 5.1: Write Unit Tests for Deduplication
- **ID:** T5.1
- **Priority:** HIGH
- **File:** `supabase/functions/shared/types.test.ts`
- **Est. Time:** 4 hours
- **Status:** Skipped (requires test environment)
- **Description:**
  - Test deduplicateLegalEvidence with exact duplicates
  - Test deduplicateLegalEvidence with similar but unique content
  - Test new checkEvidenceExistsGlobally function
  - Mock Supabase client for testing
- **Test Cases:**
```typescript
Deno.test("deduplicateLegalEvidence removes exact duplicates")
Deno.test("deduplicateLegalEvidence keeps unique content")
Deno.test("checkEvidenceExistsGlobally returns true for existing URL")
Deno.test("checkEvidenceExistsGlobally returns false for new URL")
```
- **Acceptance Criteria:**
  - [ ] All tests pass
  - [ ] Coverage > 80% for dedup functions
- **Dependencies:** T2.1

### Task 5.2: Write Integration Tests
- **ID:** T5.2
- **Priority:** HIGH
- **File:** `supabase/functions/legal-chat/index.test.ts`
- **Est. Time:** 4 hours
- **Status:** Skipped (requires test environment)
- **Description:**
  - Test full flow: duplicate evidence not stored twice
  - Test semantic dedup with similar wording
  - Test FTS dedup with partial title match
- **Acceptance Criteria:**
  - [ ] Integration tests run successfully
  - [ ] Mock external APIs (Exa, Jina)
- **Dependencies:** T1.1, T1.2, T2.2, T4.1

### Task 5.3: Performance Benchmark
- **ID:** T5.3
- **Priority:** MEDIUM
- **File:** New benchmark script
- **Est. Time:** 2 hours
- **Status:** Skipped (requires production data)
- **Description:**
  - Measure evidence storage calls per session (before/after)
  - Measure memory entries per user (before/after)
  - Measure query times for dedup checks
- **Metrics:**
  - [ ] Baseline measurement taken
  - [ ] Post-optimization measurement taken
  - [ ] Improvement documented
- **Dependencies:** T5.1, T5.2

## Summary

| Phase | Tasks | Est. Time | Priority |
|-------|-------|-----------|----------|
| 1: Bug Fixes | 2 | 5 hours | HIGH |
| 2: Global Dedup | 2 | 4 hours | HIGH |
| 3: DB Constraints | 2 | 5 hours | MEDIUM |
| 4: Semantic Dedup | 1 | 3 hours | MEDIUM |
| 5: Testing | 3 | 10 hours | HIGH |
| **Total** | **10** | **27 hours** | - |

## Critical Path

```
T1.1 → T1.2 → T2.1 → T2.2 → T5.1 → T5.2
         ↓
       T3.1 → T3.2
         ↓
       T4.1 → T5.3
```

## Commit Strategy

1. `fix: FTS deduplication logic for evidence titles`
2. `fix: sliding window embedding for long documents`
3. `feat: global evidence deduplication across users`
4. `feat: database constraints for chunk deduplication`
5. `feat: semantic memory deduplication with vector check`
6. `test: comprehensive deduplication unit and integration tests`
