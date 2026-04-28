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

## Prioritized Task Breakdown

### 🚀 **Quick Wins (High Impact, Low Effort)**
*Implement first for immediate benefits*

#### **QW1: Deduplication (T009)**
**Priority:** P0 (Critical) | **Effort:** 2h | **Impact:** High
**Why:** Reduces memory bloat immediately, simple URL + hash logic
**Trade-off:** Minimal - just adds O(n) deduplication pass
**Implementation:**
```typescript
function deduplicateLegalEvidence(evidence: LegalSourceEvidence[]): LegalSourceEvidence[] {
  const seen = new Set<string>()
  return evidence.filter(e => {
    const key = `${e.url}-${simpleHash(e.content.slice(0, 200))}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
```
**Risk:** None - pure function, no side effects

#### **QW2: Volatility Filter (T010)**
**Priority:** P0 (Critical) | **Effort:** 3h | **Impact:** High
**Why:** Prevents storing volatile info that becomes stale quickly
**Trade-off:** May filter some useful info, but reduces stale data risk
**Implementation:**
```typescript
function isVolatileLegalSource(evidence: LegalSourceEvidence): boolean {
  const domain = getDomainFromUrl(evidence.url)
  const volatileDomains = ['vnexpress.net', 'tuoitre.vn', 'thanhnien.vn']
  if (volatileDomains.some(d => domain.includes(d))) return true
  return false
}
```
**Risk:** Low - conservative filter, can whitelist domains later

#### **QW3: Integrate Deduplication (T013)**
**Priority:** P0 (Critical) | **Effort:** 1h | **Impact:** High
**Why:** Activates QW1 in production
**Trade-off:** None - just adds function call
**Implementation:**
```typescript
// In legal-chat/index.ts, before memory storage
combinedEvidence = deduplicateLegalEvidence(combinedEvidence)
console.log(`[Dedup] ${combinedEvidence.length} unique evidence after dedup`)
```
**Risk:** None - safe integration

#### **QW4: Integrate Volatility Filter (T014)**
**Priority:** P0 (Critical) | **Effort:** 1h | **Impact:** High
**Why:** Activates QW2 in production
**Trade-off:** None - just adds filter
**Implementation:**
```typescript
// In legal-chat/index.ts, before memory storage
const beforeFilter = combinedEvidence.length
combinedEvidence = combinedEvidence.filter(e => !isVolatileLegalSource(e))
console.log(`[Volatility] Filtered ${beforeFilter - combinedEvidence.length} volatile sources`)
```
**Risk:** None - safe integration

---

### 🔧 **Core Implementation (Medium Effort, High Impact)**
*Implement after Quick Wins for full functionality*

#### **CI1: RAG Existence Checker (T008)**
**Priority:** P1 (High) | **Effort:** 4h | **Impact:** Very High
**Why:** Prevents storing evidence already in RAG, reduces duplicate storage
**Trade-off:** Adds vector similarity search (extra ~100ms per query)
**Implementation:**
```typescript
async function checkEvidenceExistsInRAG(evidence: LegalSourceEvidence[]): Promise<boolean> {
  for (const e of evidence) {
    const embedding = await embedText(e.content.slice(0, 500), undefined, 768)
    const { data } = await supabase.rpc('match_document_chunks', {
      query_embedding: embedding,
      match_threshold: 0.9,
      match_count: 1,
      p_query_text: e.title
    })
    if (data && data.length > 0) return true
  }
  return false
}
```
**Risk:** Medium - adds latency, need to monitor performance

#### **CI2: Smart Storage Decision (T011)**
**Priority:** P1 (High) | **Effort:** 2h | **Impact:** High
**Why:** Combines all checks into single decision function
**Trade-off:** None - orchestration function
**Implementation:**
```typescript
async function shouldStoreInMemory(evidence: LegalSourceEvidence[]): Promise<boolean> {
  if (evidence.length === 0) return false
  const existsInRAG = await checkEvidenceExistsInRAG(evidence)
  if (existsInRAG) return false
  const deduplicated = deduplicateLegalEvidence(evidence)
  const hasVolatile = deduplicated.some(e => isVolatileLegalSource(e))
  return !hasVolatile
}
```
**Risk:** None - pure orchestration

#### **CI3: Integrate Pre-RAG Check (T012)**
**Priority:** P1 (High) | **Effort:** 1h | **Impact:** High
**Why:** Activates CI1 in production
**Trade-off:** Adds latency if RAG check enabled
**Implementation:**
```typescript
// In legal-chat/index.ts, after combinedEvidence is built
const shouldStore = await shouldStoreInMemory(combinedEvidence)
if (!shouldStore) {
  console.log('[Memory] Skipping storage - evidence exists in RAG or is volatile')
  // Continue with streaming, just skip memory storage
}
```
**Risk:** Low - conditional skip, doesn't break flow

#### **CI4: Update storeChatMemory Metadata (T015)**
**Priority:** P2 (Medium) | **Effort:** 2h | **Impact:** Medium
**Why:** Enables tracking of storage decisions for monitoring
**Trade-off:** Requires schema migration
**Implementation:**
```typescript
// Add columns to chat_memory table:
// - source_type: text (official, secondary, volatile)
// - volatility_score: int (0-100)
// - rag_check_result: boolean

await supabase.from('chat_memory').insert({
  ...memoryData,
  source_type: classifySourceType(evidence.url),
  volatility_score: isVolatileLegalSource(evidence) ? 80 : 20,
  rag_check_result: existsInRAG
})
```
**Risk:** Low - additive schema change, backward compatible

---

### 📊 **Advanced Features (Higher Effort, Nice-to-Have)**
*Implement only if Quick Wins + Core show good results*

#### **AF1: Memory Cleanup Policy (T016)**
**Priority:** P3 (Low) | **Effort:** 3h | **Impact:** Medium
**Why:** Prevents memory bloat over time
**Trade-off:** Requires scheduled job/cron
**Implementation:**
```typescript
async function cleanupStaleLegalMemory(userId: string): Promise<void> {
  const ttlMap = { official: 30, verified: 14, general: 7, unverified: 1 }
  await supabase.from('chat_memory')
    .delete()
    .eq('user_id', userId)
    .eq('content_type', 'evidence')
    .lt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
}
```
**Risk:** Low - can be tuned later

#### **AF2: Memory Usage Monitor (T017)**
**Priority:** P3 (Low) | **Effort:** 2h | **Impact:** Low
**Why:** Enables observability
**Trade-off:** Nice-to-have, not blocking
**Implementation:**
```typescript
async function getMemoryUsageStats(userId: string): Promise<MemoryStats> {
  const { data } = await supabase.from('chat_memory')
    .select('id, created_at, source_type')
    .eq('user_id', userId)
    .eq('content_type', 'evidence')
  return {
    total: data.length,
    bySourceType: groupBy(data, 'source_type'),
    avgAge: calculateAvgAge(data)
  }
}
```
**Risk:** None - read-only function

#### **AF3: Scheduled Cleanup Job (T018)**
**Priority:** P3 (Low) | **Effort:** 4h | **Impact:** Medium
**Why:** Automates cleanup
**Trade-off:** Requires cron/scheduler setup
**Implementation:**
```typescript
// supabase/functions/cleanup-legal-memory/index.ts
Deno.serve(async (req) => {
  const users = await getAllActiveUsers()
  for (const user of users) {
    await cleanupStaleLegalMemory(user.id)
  }
  return jsonResponse({ cleaned: users.length })
})
```
**Risk:** Low - can be triggered manually first

#### **AF4: Monitoring Dashboard (T019)**
**Priority:** P4 (Very Low) | **Effort:** 6h | **Impact:** Low
**Why:** Nice-to-have for ops
**Trade-off:** High effort for low immediate value
**Implementation:** SQL queries + Grafana/Supabase dashboard
**Risk:** None - optional

---

### 🧪 **Testing & Validation**

#### **TV1: Unit Tests (T020-T022)**
**Priority:** P1 (High) | **Effort:** 4h | **Impact:** High
**Why:** Validates core logic before production
**Trade-off:** Essential investment
**Implementation:**
```typescript
// Test deduplication
assert(deduplicateLegalEvidence([e1, e1, e2]).length === 2)

// Test volatility filter
assert(isVolatileLegalSource({ url: 'https://vnexpress.net/...' }) === true)
assert(isVolatileLegalSource({ url: 'https://moj.gov.vn/...' }) === false)
```
**Risk:** None - prevents regressions

#### **TV2: Integration Test (T023)**
**Priority:** P1 (High) | **Effort:** 2h | **Impact:** High
**Why:** Validates end-to-end flow
**Trade-off:** Essential for confidence
**Implementation:** Manual test with real legal queries
**Risk:** None - validation step

#### **TV3: Monitoring (T024-T025)**
**Priority:** P2 (Medium) | **Effort:** Ongoing | **Impact:** Medium
**Why:** Validates ROI of implementation
**Trade-off:** Time-consuming but valuable
**Implementation:** Log metrics, analyze after 1 week
**Risk:** None - observational

---

### 📝 **Documentation**

#### **DOC1: Technical Docs (T026-T028)**
**Priority:** P3 (Low) | **Effort:** 4h | **Impact:** Low
**Why:** Knowledge transfer
**Trade-off:** Can be deferred
**Implementation:** Markdown docs in docs/features/
**Risk:** None - nice-to-have

#### **DOC2: API Docs (T029)**
**Priority:** P3 (Low) | **Effort:** 2h | **Impact:** Low
**Why:** Developer experience
**Trade-off:** Can be auto-generated
**Implementation:** JSDoc comments
**Risk:** None - documentation

#### **DOC3: User Docs (T030)**
**Priority:** P4 (Very Low) | **Effort:** 3h | **Impact:** Very Low
**Why:** End-user transparency
**Trade-off:** Not needed for internal feature
**Implementation:** Optional
**Risk:** None - optional

---

## Recommended Implementation Order

### **Sprint 1 (Week 1): Quick Wins - 7 hours**
1. **T009** Deduplication (2h)
2. **T010** Volatility Filter (3h)
3. **T013** Integrate Deduplication (1h)
4. **T014** Integrate Volatility Filter (1h)
5. **T023** Integration Test (2h)

**Expected Outcome:** 30-50% reduction in memory bloat, immediate impact

### **Sprint 2 (Week 2): Core Implementation - 9 hours**
1. **T008** RAG Existence Checker (4h)
2. **T011** Smart Storage Decision (2h)
3. **T012** Integrate Pre-RAG Check (1h)
4. **T015** Update Metadata (2h)
5. **T020-T022** Unit Tests (4h)

**Expected Outcome:** 60-80% reduction in duplicate storage, smarter memory usage

### **Sprint 3 (Week 3): Advanced (Optional) - 15 hours**
1. **T016** Cleanup Policy (3h)
2. **T017** Memory Monitor (2h)
3. **T018** Scheduled Cleanup (4h)
4. **T019** Dashboard (6h)
5. **T024-T025** Monitoring (Ongoing)

**Expected Outcome:** Sustainable memory management, observability

### **Sprint 4 (Week 4): Documentation (Optional) - 9 hours**
1. **T026-T028** Technical Docs (4h)
2. **T029** API Docs (2h)
3. **T030** User Docs (3h)

**Expected Outcome:** Knowledge transfer, maintainability

---

## Total Effort Summary

| Phase | Tasks | Hours | Priority |
|-------|-------|-------|----------|
| Quick Wins | T009, T010, T013, T014, T023 | 7h | P0 |
| Core Implementation | T008, T011, T012, T015, T020-T022 | 13h | P1 |
| Advanced | T016-T019, T024-T025 | 15h | P2-P3 |
| Documentation | T026-T030 | 9h | P3-P4 |
| **Total** | **30 tasks** | **44h** | - |

**MVP (Quick Wins + Core):** 20h - 45% of total effort for 80% of value

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Deduplication removes useful info | Low | Medium | Whitelist domains, manual review |
| Volatility filter too aggressive | Low | Medium | Conservative rules, whitelist |
| RAG check adds latency | Medium | Low | Monitor, threshold tuning |
| Schema migration fails | Low | High | Backup, rollback plan |
| Cleanup deletes needed data | Low | Medium | Conservative TTL, manual review |

---

## Success Metrics

### **Quick Wins (Sprint 1)**
- Memory entries reduced by 30-50%
- No increase in latency
- No user complaints

### **Core Implementation (Sprint 2)**
- Duplicate storage reduced by 60-80%
- Cache hit rate > 50%
- Latency increase < 200ms

### **Advanced (Sprint 3)**
- Memory stable over time
- Cleanup job runs successfully
- Dashboard shows meaningful metrics
