# Cache Strategy Optimization Plan

## Problem Statement
Current cache logic is too restrictive and doesn't properly account for context, leading to:
- Câu hỏi pháp lý không được cache (luôn phải RAG → chậm)
- Câu hỏi trong conversation không được cache (luôn phải RAG → chậm)
- ContextSummary chỉ 100 chars → không đủ capture context
- Semantic cache average embedding → làm mất thông tin quan trọng

**Goal**: Cải thiện cache strategy để tối ưu tốc độ nhưng KHÔNG đánh đổi sự chính xác (domain pháp lý)

---

## Current Issues

### Exact Cache (Redis)
```typescript
const canUseCache = !needsCitation && 
                   intent_eval.intent === 'general' && 
                   (isStandaloneQuestion(message) || history.length === 0)
```

**Vấn đề:**
- ❌ Chỉ cache khi KHÔNG cần citation → Câu hỏi pháp lý KHÔNG cache
- ❌ Chỉ cache khi intent là 'general' → Câu hỏi analysis/drafting KHÔNG cache
- ❌ Chỉ cache khi câu hỏi standalone → Câu hỏi trong conversation KHÔNG cache
- ❌ ContextSummary chỉ 100 chars (50 x 2) → Không đủ capture context

### Semantic Cache (pgvector)
```typescript
cacheEmbedding = queryEmbedding.map((v, i) => (v + contextEmbedding[i]) / 2)
```

**Vấn đề:**
- ❌ Average có thể làm mất thông tin quan trọng
- ❌ Không có weighting cho query vs context
- ❌ Threshold 0.05 có thể quá strict hoặc quá loose

---

## Proposed Solution

### Phase 1: Tăng Context Summary Length
**File**: `supabase/functions/legal-chat/index.ts` (line 460-462)

**Change:**
```typescript
// BEFORE: 50 chars x 2 = 100 chars
const contextSummary = history.length > 0
  ? history.slice(-2).map((h: any) => h.content.slice(0, 50)).join('|')
  : 'no-context'

// AFTER: 150 chars x 2 = 300 chars
const contextSummary = history.length > 0
  ? history.slice(-2).map((h: any) => h.content.slice(0, 150)).join('|')
  : 'no-context'
```

**Lợi ích:** Capture được nhiều hơn context của conversation

---

### Phase 2: Cải thiện Semantic Cache Embedding
**File**: `supabase/functions/legal-chat/index.ts` (line 507-510)

**Change:**
```typescript
// BEFORE: Simple average
cacheEmbedding = queryEmbedding.map((v, i) => (v + contextEmbedding[i]) / 2)

// AFTER: Weighted average (query 70%, context 30%)
cacheEmbedding = queryEmbedding.map((v, i) => (v * 0.7 + contextEmbedding[i] * 0.3))
```

**Lợi ích:** Query quan trọng hơn context, nhưng vẫn có context

---

### Phase 3: Thêm Document-Aware Cache
**File**: `supabase/functions/legal-chat/index.ts` (line 455-456)

**Change:**
```typescript
// BEFORE: Không cache khi có document
const canUseCache = !needsCitation && intent_eval.intent === 'general' && ...

// AFTER: Cache câu hỏi về document cụ thể
const canUseCache = intent_eval.intent === 'general' && 
                   (isStandaloneQuestion(message) || 
                    (effectiveDocumentHash && isDocumentRelatedQuestion(message)))
```

**Helper function cần thêm:**
```typescript
function isDocumentRelatedQuestion(message: string): boolean {
  const docKeywords = ['điều khoản', 'nội dung', 'tài liệu', 'hợp đồng', 'văn bản', 'báo cáo']
  return docKeywords.some(kw => message.toLowerCase().includes(kw))
}
```

**Lợi ích:** Có thể cache câu hỏi về document cụ thể (ví dụ: "Điều khoản này có nghĩa gì?")

---

### Phase 4: Phân loại Cache theo Confidence Level
**File**: `supabase/functions/legal-chat/index.ts` (line 806-808)

**Change:**
```typescript
// BEFORE: Cache tất cả
if (answerCacheKey && !payload.abstained) {
  setCachedLegalAnswer(answerCacheKey, payload, 3600).catch(() => { })
}

// AFTER: Chỉ cache câu trả lời chất lượng cao
const canCachePayload = !payload.abstained && 
                        (payload.citations?.length > 0 || 
                         payload.confidence_score >= 0.8)

if (answerCacheKey && canCachePayload) {
  setCachedLegalAnswer(answerCacheKey, payload, 3600).catch(() => { })
}
```

**Lợi ích:** Chỉ cache câu trả lời chất lượng cao

---

### Phase 5: Cache Invalidation khi Document Thay đổi
**File**: `supabase/functions/shared/types.ts` (thêm function mới)

**Change:**
```typescript
// Thêm function mới
export async function invalidateDocumentCache(
  redis: any,
  documentHash: string
): Promise<void> {
  const pattern = `cache:legal_answer:*:${documentHash}:*`
  const keys = await redis.keys(pattern)
  if (keys.length > 0) {
    await redis.del(keys)
    console.log(`[Cache] Invalidated ${keys.length} cache entries for document ${documentHash}`)
  }
}
```

**Gọi khi document được update/re-upload** (trong ingest-contract hoặc parse-document)

---

## Implementation Order

### Step 1: Tăng Context Summary Length
- File: `supabase/functions/legal-chat/index.ts`
- Line: 460-462
- Priority: HIGH (đơn giản, impact lớn)
- Risk: LOW

### Step 2: Cải thiện Semantic Cache Embedding
- File: `supabase/functions/legal-chat/index.ts`
- Line: 507-510
- Priority: HIGH (đơn giản, impact lớn)
- Risk: LOW

### Step 3: Thêm Document-Aware Cache
- File: `supabase/functions/legal-chat/index.ts`
- Line: 455-456
- Priority: MEDIUM (cần thêm helper function)
- Risk: MEDIUM (cần test kỹ)

### Step 4: Phân loại Cache theo Confidence Level
- File: `supabase/functions/legal-chat/index.ts`
- Line: 806-808
- Priority: MEDIUM (cần confidence score từ LLM)
- Risk: MEDIUM (cần test)

### Step 5: Cache Invalidation
- File: `supabase/functions/shared/types.ts`
- Priority: LOW (nice to have)
- Risk: LOW

---

## Testing Strategy

### Unit Tests
1. Test contextSummary length (300 chars)
2. Test weighted average embedding
3. Test isDocumentRelatedQuestion function
4. Test canCachePayload logic

### Integration Tests
1. Test cache hit với document context
2. Test cache miss khi context thay đổi
3. Test cache invalidation khi document update
4. Test semantic cache với weighted average

### Manual Tests
1. Upload document → hỏi về document → cache hit?
2. Hỏi câu pháp lý → cache miss (đúng behavior)?
3. Hỏi trong conversation → cache hit với context?
4. Update document → hỏi lại → cache invalidation?

---

## Deployment Plan

### Staging
1. Deploy từng step riêng biệt
2. Monitor cache hit rate
3. Monitor response time
4. Monitor accuracy (manual check)

### Production
1. Deploy Step 1 + 2 (context + embedding)
2. Monitor 24h
3. Deploy Step 3 (document-aware cache)
4. Monitor 24h
5. Deploy Step 4 (confidence level)
6. Monitor 24h
7. Deploy Step 5 (invalidation) - optional

---

## Rollback Plan
Nếu có vấn đề:
1. Revert từng step theo ngược order
2. Monitor cache hit rate
3. Monitor response time
4. Monitor accuracy

---

## Success Metrics

### Performance
- Cache hit rate: Target 20-30% (hiện tại < 10%)
- Response time: Giảm 15-20% cho cache hit cases
- RAG calls: Giảm 20-30%

### Accuracy
- False positive rate: < 5% (cache trả lời sai context)
- False negative rate: < 10% (không cache khi nên cache)
- User feedback: Không có complaint về accuracy

---

## Timeline
- **Step 1-2**: 1 ngày (implement + test)
- **Step 3**: 1 ngày (implement + test)
- **Step 4**: 1 ngày (implement + test)
- **Step 5**: 0.5 ngày (implement + test)
- **Total**: 3.5 ngày
