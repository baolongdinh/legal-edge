# Cache Optimization Tasks

## Overview
Improve cache strategy to optimize response time without sacrificing accuracy (legal domain).

## Implementation Strategy
- Incremental deployment: Deploy each step separately with monitoring
- Priority: Step 1-2 (HIGH) → Step 3-4 (MEDIUM) → Step 5 (LOW)
- Rollback plan: Revert in reverse order if issues arise

---

## Phase 1: Context Summary Length Increase (HIGH Priority)

### Goal
Increase contextSummary from 100 chars to 300 chars to capture more conversation context.

### Tasks
- [ ] T001 Update contextSummary length from 50 to 150 chars in supabase/functions/legal-chat/index.ts (line 460-462)
- [ ] T002 Test contextSummary generation with various conversation lengths
- [ ] T003 Deploy to staging and monitor cache hit rate
- [ ] T004 Deploy to production and monitor for 24h

### Expected Outcome
- Better context capture for cache keys
- Reduced false cache hits (same question, different context)

---

## Phase 2: Semantic Cache Embedding Improvement (HIGH Priority)

### Goal
Change from simple average to weighted average (query 70%, context 30%) for semantic cache.

### Tasks
- [ ] T005 Update semantic cache embedding to weighted average (query 0.7, context 0.3) in supabase/functions/legal-chat/index.ts (line 507-510)
- [ ] T006 Test weighted average embedding with sample queries
- [ ] T007 Deploy to staging and monitor semantic cache hit rate
- [ ] T008 Deploy to production and monitor for 24h

### Expected Outcome
- Query prioritized over context in semantic similarity
- Better semantic cache accuracy

---

## Phase 3: Document-Aware Cache (MEDIUM Priority)

### Goal
Enable caching for questions about specific uploaded documents.

### Tasks
- [ ] T009 Add isDocumentRelatedQuestion helper function in supabase/functions/legal-chat/index.ts
- [ ] T010 Update canUseCache condition to include document-aware logic (line 455-456)
- [ ] T011 Test document-aware cache with uploaded document scenarios
- [ ] T012 Deploy to staging and monitor document cache hit rate
- [ ] T013 Deploy to production and monitor for 24h

### Expected Outcome
- Cache hits for document-related questions (e.g., "Điều khoản này có nghĩa gì?")
- Reduced RAG calls for repeated document questions

---

## Phase 4: Confidence-Based Cache (MEDIUM Priority)

### Goal
Only cache high-confidence responses (confidence ≥ 0.8 or has citations).

### Tasks
- [ ] T014 Add confidence_score to payload structure if not present
- [ ] T015 Update cache save logic to check confidence level (line 806-808)
- [ ] T016 Test confidence-based cache with various response qualities
- [ ] T017 Deploy to staging and monitor cache quality
- [ ] T018 Deploy to production and monitor for 24h

### Expected Outcome
- Only high-quality responses cached
- Reduced false cache hits (low-quality responses)

---

## Phase 5: Cache Invalidation (LOW Priority)

### Goal
Invalidate cache when documents are updated/re-uploaded.

### Tasks
- [ ] T019 Add invalidateDocumentCache function in supabase/functions/shared/types.ts
- [ ] T020 Call invalidateDocumentCache in ingest-contract function
- [ ] T021 Call invalidateDocumentCache in parse-document function
- [ ] T022 Test cache invalidation with document update scenarios
- [ ] T023 Deploy to staging and monitor invalidation
- [ ] T024 Deploy to production (optional)

### Expected Outcome
- Cache invalidated when document changes
- No stale cache responses for updated documents

---

## Parallel Execution Opportunities

### Phase 1 & 2 (Can run in parallel)
- T001 (contextSummary) and T005 (weighted embedding) are independent
- Both can be implemented and tested simultaneously
- Deploy together for combined impact

### Phase 3 & 4 (Can run in parallel after Phase 1-2)
- T009-013 (document-aware) and T014-018 (confidence-based) are independent
- Both can be implemented and tested simultaneously
- Deploy separately for monitoring

---

## Dependencies

### Phase 1 & 2
- No dependencies
- Can start immediately

### Phase 3
- Depends on Phase 1 (contextSummary used in cache key)
- Can start after Phase 1 deployment verified

### Phase 4
- No dependencies on other phases
- Can start anytime after Phase 1-2

### Phase 5
- Depends on Phase 3 (document-aware cache)
- Can start after Phase 3 deployment verified

---

## Testing Strategy

### Unit Tests
- Test contextSummary length (T002)
- Test weighted average embedding (T006)
- Test isDocumentRelatedQuestion function (T011)
- Test confidence-based cache logic (T016)

### Integration Tests
- Test cache hit with document context (T011)
- Test cache miss when context changes (T002)
- Test semantic cache with weighted average (T006)
- Test cache invalidation when document updates (T022)

### Manual Tests
1. Upload document → ask about document → verify cache hit
2. Ask legal question → verify cache miss (correct behavior)
3. Ask in conversation → verify cache hit with context
4. Update document → ask again → verify cache invalidation

---

## Success Metrics

### Performance
- Cache hit rate: Target 20-30% (currently < 10%)
- Response time: Reduce 15-20% for cache hit cases
- RAG calls: Reduce 20-30%

### Accuracy
- False positive rate: < 5% (cache returns wrong context)
- False negative rate: < 10% (doesn't cache when it should)
- User feedback: No accuracy complaints

---

## Rollback Plan

If issues arise:
1. Revert Phase 5 → Phase 4 → Phase 3 → Phase 2 → Phase 1
2. Monitor cache hit rate after each revert
3. Monitor response time after each revert
4. Monitor accuracy (manual check)

---

## Timeline

- **Phase 1-2**: 1 day (implement + test + deploy)
- **Phase 3**: 1 day (implement + test + deploy)
- **Phase 4**: 1 day (implement + test + deploy)
- **Phase 5**: 0.5 day (implement + test + deploy)
- **Total**: 3.5 days

---

## MVP Scope (Recommended First Iteration)

Implement Phase 1-2 only:
- T001-T004: Context summary length increase
- T005-T008: Semantic cache embedding improvement

**Rationale**: High impact, low risk, quick wins
