# Agent RAG Optimization - Smart Legal Evidence Memory

## Overview
Implement smart legal evidence memory system that:
- Checks RAG before storing to avoid duplicates
- Filters volatile/time-sensitive information
- Deduplicates legal evidence before storage
- Optimizes memory usage while improving agent intelligence

## Implementation Strategy

### Phase 1: Analysis & Design
- Analyze current RAG system (local law chunks, Exa retrieval)
- Design deduplication logic
- Design volatility filter rules
- Design pre-RAG check mechanism

### Phase 2: Core Implementation
- Implement RAG existence checker
- Implement legal evidence deduplicator
- Implement volatility filter
- Integrate into legal-chat flow

### Phase 3: Memory Management
- Implement smart storage policy
- Implement cleanup policy
- Add monitoring for cache efficiency

---

## Tasks

### Phase 1: Analysis & Design

- [ ] T001 Analyze current RAG system structure in supabase/functions/legal-chat/index.ts
- [ ] T002 Analyze local law chunks schema and retrieval logic
- [ ] T003 Analyze Exa evidence retrieval flow
- [ ] T004 Design deduplication strategy for legal evidence (URL + content hash)
- [ ] T005 Design volatility filter rules (time-sensitive vs stable legal sources)
- [ ] T006 Design pre-RAG check mechanism (vector similarity search)
- [ ] T007 Document storage policy in docs/features/agent-rag-optimization/design.md

### Phase 2: Core Implementation

- [ ] T008 [P] Create RAG existence checker function in supabase/functions/shared/types.ts
  - Function: `checkEvidenceExistsInRAG(evidence: LegalSourceEvidence[]): Promise<boolean>`
  - Use vector similarity search against local law chunks
  - Return true if similar evidence exists (threshold > 0.9)

- [ ] T009 [P] Create legal evidence deduplicator in supabase/functions/shared/types.ts
  - Function: `deduplicateLegalEvidence(evidence: LegalSourceEvidence[]): LegalSourceEvidence[]`
  - Use URL + content hash for deduplication
  - Remove duplicates from array

- [ ] T010 [P] Create volatility filter in supabase/functions/shared/types.ts
  - Function: `isVolatileLegalSource(evidence: LegalSourceEvidence): boolean`
  - Filter rules:
    - ❌ Volatile: News articles, blog posts, forum discussions
    - ❌ Volatile: Recent laws (< 30 days old)
    - ✅ Stable: Official government sites
    - ✅ Stable: Court decisions (published)
    - ✅ Stable: Established legal codes

- [ ] T011 [P] Create smart storage decision function in supabase/functions/shared/types.ts
  - Function: `shouldStoreInMemory(evidence: LegalSourceEvidence[]): Promise<boolean>`
  - Check: RAG existence → deduplication → volatility filter
  - Return true only if evidence is new and stable

- [ ] T012 Integrate pre-RAG check into legal-chat/index.ts
  - Add check before storing legal evidence in memory
  - Location: After combinedEvidence is built
  - Skip storage if evidence exists in RAG

- [ ] T013 Integrate deduplication into legal-chat/index.ts
  - Apply deduplication before storage
  - Location: Before memory storage
  - Log deduplication stats

- [ ] T014 Integrate volatility filter into legal-chat/index.ts
  - Filter out volatile sources before storage
  - Location: Before memory storage
  - Log filtered count

- [ ] T015 Update storeChatMemory to support legal evidence metadata
  - Add fields: source_type, volatility_score, rag_check_result
  - Update schema if needed

### Phase 3: Memory Management

- [ ] T016 [P] Create memory cleanup policy function in supabase/functions/shared/types.ts
  - Function: `cleanupStaleLegalMemory(userId: string): Promise<void>`
  - TTL based on source type:
    - Official gov: 30 days
    - Verified legal: 14 days
    - General: 7 days
    - Unverified: 1 day

- [ ] T017 [P] Create memory usage monitor in supabase/functions/shared/types.ts
  - Function: `getMemoryUsageStats(userId: string): Promise<MemoryStats>`
  - Track: total entries, deduplication rate, cache hit rate

- [ ] T018 Create scheduled cleanup job (Edge Function or cron)
  - Function: supabase/functions/cleanup-legal-memory/index.ts
  - Run daily to clean stale entries
  - Log cleanup stats

- [ ] T019 Add monitoring dashboard queries
  - Create SQL queries for monitoring memory usage
  - Track deduplication efficiency
  - Track cache hit rate

### Phase 4: Testing & Validation

- [ ] T020 Test RAG existence checker with known legal sources
- [ ] T021 Test deduplication with duplicate evidence
- [ ] T022 Test volatility filter with various source types
- [ ] T023 Test end-to-end legal-chat flow with new logic
- [ ] T024 Monitor memory usage over 1 week
- [ ] T025 Validate cache hit rate improvement

### Phase 5: Documentation

- [ ] T026 Document RAG check mechanism in docs/features/agent-rag-optimization/rag-check.md
- [ ] T027 Document deduplication strategy in docs/features/agent-rag-optimization/deduplication.md
- [ ] T028 Document volatility filter rules in docs/features/agent-rag-optimization/volatility-filter.md
- [ ] T029 Update API documentation with new functions
- [ ] T030 Create user-facing documentation for legal memory feature

---

## Dependencies

```
Phase 1 (Analysis) → Phase 2 (Implementation) → Phase 3 (Management) → Phase 4 (Testing) → Phase 5 (Documentation)
```

## Parallel Execution Opportunities

**Phase 2 (Core Implementation):**
- T008, T009, T010 can run in parallel (independent functions)
- T011 depends on T008, T009, T010
- T012, T013, T014 can run in parallel after T011

**Phase 3 (Memory Management):**
- T016, T017 can run in parallel

## Independent Test Criteria

**Phase 1:**
- Design document approved with clear rules

**Phase 2:**
- RAG check returns correct results for test cases
- Deduplication removes all duplicates
- Volatility filter correctly categorizes sources
- Integration doesn't break existing legal-chat flow

**Phase 3:**
- Cleanup job removes stale entries
- Monitor returns accurate stats

**Phase 4:**
- All tests pass
- Memory usage reduced by >30%
- Cache hit rate >60%

## MVP Scope

**Minimum Viable Product:**
- T001-T007 (Analysis & Design)
- T008-T015 (Core Implementation - basic deduplication + volatility filter)
- T020-T023 (Basic testing)

**Enhanced Version:**
- All tasks including advanced monitoring and documentation
