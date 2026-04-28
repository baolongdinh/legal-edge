# Implementation Plan: Agentic Legal Chat Optimization

## Overview
Tối ưu hệ thống RAG, deduplication và memory management cho agentic legal chat.

## Phase 1: Critical Bug Fixes (Priority: HIGH)

### Task 1.1: Fix FTS Deduplication Logic
**File:** `supabase/functions/shared/types.ts:458-470`

**Current (Buggy):**
```typescript
.textSearch('fts_tokens', e.title.split(' ').slice(0, 3).join(' & '))
```

**Target:**
```typescript
.textSearch('fts_tokens', e.title.split(/\s+/).filter(w => w.length > 3).join(' | '))
```

**Changes:**
- Extract meaningful keywords (>3 chars) instead of first 3 words
- Use OR (`|`) instead of AND (`&`) for broader matching
- Handle multiple whitespace types with regex `/\s+/`

**Testing:**
- Unit test with sample titles
- Verify dedup accuracy improvement

### Task 1.2: Fix Vector Check Truncation
**File:** `supabase/functions/shared/types.ts:476-477`

**Current:**
```typescript
const embedding = await embedText(e.content.slice(0, 500), undefined, 768)
```

**Target Options:**

**Option A: Sliding Window (Recommended)**
```typescript
// Embed first 500 + last 500 + middle excerpt
const contentLength = e.content.length
const firstPart = e.content.slice(0, 500)
const lastPart = contentLength > 1000 ? e.content.slice(-500) : ''
const middlePart = contentLength > 1500 
  ? e.content.slice(Math.floor(contentLength/2) - 250, Math.floor(contentLength/2) + 250)
  : ''
const embeddingText = [firstPart, middlePart, lastPart].filter(Boolean).join(' ... ')
const embedding = await embedText(embeddingText, undefined, 768)
```

**Option B: Full Content (Slower but accurate)**
```typescript
const embedding = await embedText(e.content, undefined, 768) // No truncation
```

**Decision:** Implement Option A (balanced accuracy/performance)

## Phase 2: Global Deduplication (Priority: HIGH)

### Task 2.1: Add Global Evidence Lookup
**File:** `supabase/functions/shared/types.ts`

**New Function:**
```typescript
/**
 * Check if evidence exists globally (any user) by URL hash
 */
export async function checkEvidenceExistsGlobally(
  supabase: any,
  url: string,
  contentHash: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('chat_memory')
    .select('id')
    .eq('content_type', 'evidence')
    .filter('content', 'like', `%${url}%`) // URL substring match
    .limit(1)
  
  if (error) {
    console.warn('[Global Dedup] Check failed:', error)
    return false
  }
  
  return data && data.length > 0
}
```

### Task 2.2: Update Evidence Storage Flow
**File:** `supabase/functions/legal-chat/index.ts:862-895`

**Modify Background RAG Pipeline:**
```typescript
// Before storing, check global dedup
const urlHash = simpleHash(evidence.map(e => e.url).join('|'))
const existsGlobally = await checkEvidenceExistsGlobally(supabase, urlHash)

if (existsGlobally) {
  console.log('[Background RAG] Evidence already exists globally, skipping storage')
  return
}
```

## Phase 3: Database Constraints (Priority: MEDIUM)

### Task 3.1: Add Unique Constraint Migration
**File:** New migration `20260428000000_chunk_dedup_constraint.sql`

```sql
-- Add content hash column for efficient dedup
ALTER TABLE public.document_chunks 
ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- Create index for hash lookups
CREATE INDEX IF NOT EXISTS idx_document_chunks_content_hash 
ON public.document_chunks(content_hash);

-- Add unique constraint per source
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_chunks_unique_per_source 
ON public.document_chunks(source_url, content_hash) 
WHERE source_url IS NOT NULL;

-- Update existing rows with hashes
UPDATE public.document_chunks 
SET content_hash = MD5(content) 
WHERE content_hash IS NULL;
```

### Task 3.2: Update Chunk Insert Logic
**File:** Functions that insert to `document_chunks`

**Add ON CONFLICT handling:**
```typescript
const { error } = await supabase
  .from('document_chunks')
  .upsert(chunks.map(c => ({
    ...c,
    content_hash: simpleHash(c.content)
  })), { 
    onConflict: 'source_url,content_hash',
    ignoreDuplicates: true 
  })
```

## Phase 4: Semantic Memory Deduplication (Priority: MEDIUM)

### Task 4.1: Add Vector Similarity Check Before Storage
**File:** `supabase/functions/shared/types.ts:1439-1465`

**Enhance `storeChatMemory`:**
```typescript
export async function storeChatMemory(
  supabase: any,
  entry: ChatMemoryEntry
) {
  // Layer 1: Redis short-term dedup (existing)
  const redis = getRedisClient()
  if (redis) {
    const dedupKey = `mem:dedup:${entry.user_id}:${simpleHash(entry.content.slice(0, 200))}`
    const exists = await redis.get(dedupKey)
    if (exists) return
    await redis.set(dedupKey, 1, { ex: 600 })
  }
  
  // Layer 2: Vector similarity check (NEW)
  if (entry.embedding) {
    const { data: similar } = await supabase.rpc('match_chat_memory', {
      query_embedding: entry.embedding,
      match_threshold: 0.92, // High threshold for semantic dedup
      match_count: 1,
      p_user_id: entry.user_id
    })
    
    if (similar && similar.length > 0) {
      console.log(`[Memory Dedup] Semantic duplicate found (sim: ${similar[0].similarity.toFixed(2)}), skipping`)
      return
    }
  }
  
  // Store if no duplicates found
  const { error } = await supabase.from('chat_memory').insert(entry)
  if (error) console.error('Error storing chat memory:', error)
}
```

## Phase 5: Testing & Validation (Priority: HIGH)

### Task 5.1: Unit Tests for Deduplication
**File:** `supabase/functions/shared/types.test.ts`

```typescript
Deno.test("deduplicateLegalEvidence removes exact URL+content duplicates", () => {
  const evidence = [
    { url: 'http://example.com/1', content: 'Same content', title: 'Doc 1' },
    { url: 'http://example.com/1', content: 'Same content', title: 'Doc 1 dup' },
    { url: 'http://example.com/2', content: 'Different', title: 'Doc 2' }
  ]
  const result = deduplicateLegalEvidence(evidence)
  assertEquals(result.length, 2)
})

Deno.test("checkEvidenceExistsGlobally finds existing evidence by URL", async () => {
  // Mock test with test data
})
```

### Task 5.2: Integration Test for Full Flow
**File:** `supabase/functions/legal-chat/index.test.ts`

Test scenarios:
1. Duplicate evidence from same URL → should not store twice
2. Similar content different wording → semantic dedup should catch
3. FTS dedup with partial title match → should work with OR operator

### Task 5.3: Performance Benchmark

**Metrics to measure:**
- Evidence storage calls per chat session (before/after)
- Memory entries per user (before/after)
- Database query times for dedup checks

## Implementation Order

1. **Week 1:** Task 1.1, 1.2 (Critical bug fixes)
2. **Week 1:** Task 2.1, 2.2 (Global dedup)
3. **Week 2:** Task 3.1, 3.2 (DB constraints)
4. **Week 2:** Task 4.1 (Semantic dedup)
5. **Week 3:** Task 5.1, 5.2, 5.3 (Testing)

## Rollback Plan

- Each task is independent and can be rolled back separately
- Database migration uses `IF NOT EXISTS` for safety
- New functions are additive (old functions still work)
- Feature flags can disable new dedup logic if needed

## Monitoring

Add logging for:
- `[Dedup] FTS skipped duplicate: ${title}`
- `[Dedup] Vector skipped duplicate: ${title} (sim: ${similarity})`
- `[Dedup] Global evidence exists: ${url}`
- `[Memory] Semantic duplicate skipped: ${similarity}`

## Success Verification

Run these queries after deployment:

```sql
-- Check chunk duplicates
SELECT content_hash, COUNT(*) 
FROM document_chunks 
GROUP BY content_hash 
HAVING COUNT(*) > 1;

-- Check evidence storage rate
SELECT DATE_TRUNC('day', created_at), COUNT(*)
FROM chat_memory
WHERE content_type = 'evidence'
GROUP BY 1
ORDER BY 1 DESC
LIMIT 7;
```
