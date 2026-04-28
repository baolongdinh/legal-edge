# LegalShield Agentic Legal Chat Optimization

## Background

Sau khi review toàn bộ flow core agentic legal chat, phát hiện các vấn đề cần tối ưu trong hệ thống RAG, deduplication, và memory management.

## Issues Identified

### 1. FTS Deduplication Bug (HIGH PRIORITY)
**File:** `supabase/functions/shared/types.ts:462`

**Problem:**
```typescript
// Current buggy implementation:
.textSearch('fts_tokens', e.title.split(' ').slice(0, 3).join(' & '))
```

- Chỉ check 3 từ đầu của title
- Có thể miss duplicates nếu titles khác nhau ở 3 từ đầu
- Logic `&` (AND) quá strict - yêu cầu cả 3 từ đều phải match

**Impact:** Evidence duplicates slip through Layer 2 deduplication

### 2. Vector Check Only Uses First 500 Chars (MEDIUM PRIORITY)
**File:** `supabase/functions/shared/types.ts:477`

**Problem:**
```typescript
const embedding = await embedText(e.content.slice(0, 500), ...)
```

- Long documents with same intro but different body flagged as duplicates
- Information loss from truncation

**Impact:** False positive deduplication

### 3. No Global Evidence Deduplication (HIGH PRIORITY)
**File:** `supabase/functions/shared/types.ts:1472-1493`

**Problem:**
- Evidence stored per user (`user_id`)
- Same legal source searched by different users = multiple storage
- No check against existing evidence before storing

**Impact:** Memory bloat, redundant storage

### 4. Content-Based Memory Deduplication Only (MEDIUM PRIORITY)
**File:** `supabase/functions/shared/types.ts:1364-1386`

**Problem:**
```typescript
const seenContents = new Set<string>()
// ...
if (!seenContents.has(m.content)) {
```

- Only dedups by exact content text
- Misses semantic duplicates with different wording

**Impact:** Redundant memory entries

### 5. No Chunk-Level Deduplication in Database (MEDIUM PRIORITY)
**Migration:** `20260402010000_chat_memory.sql`

**Problem:**
- No unique constraint on `(source_url, content_hash)` for document_chunks
- Same chunk can be stored multiple times

**Impact:** Database bloat

## Goals

1. **Fix FTS deduplication logic** - Use proper keyword extraction
2. **Implement global evidence dedup** - URL-based dedup across all users
3. **Add semantic memory dedup** - Vector similarity check before storage
4. **Add database-level constraints** - Prevent duplicate chunks at DB level
5. **Optimize vector embedding** - Full content or sliding window approach

## Non-Goals

- Không thay đổi Exa search strategy
- Không thay đổi Jina rerank logic
- Không thay đổi LLM generation
- Không thay đổi streaming response format

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Evidence duplicate rate | ~15-20% | <5% |
| Memory storage per session | ~20 entries | ~12 entries |
| Database chunk duplicates | Unknown | Zero |
| FTS dedup accuracy | ~60% | >90% |

## Technical Constraints

- Must maintain backward compatibility
- Changes should be deployable without migration downtime
- Background tasks must remain non-blocking
- Redis required for global dedup locks

## Dependencies

- `supabase/functions/shared/types.ts` - Main functions to modify
- `supabase/migrations/` - Database constraints
- Redis - For distributed dedup locking

## References

- `supabase/functions/legal-chat/index.ts` - Background RAG pipeline
- `supabase/functions/shared/types.ts:419-547` - Deduplication logic
- `supabase/migrations/20260402010000_chat_memory.sql` - Memory schema
