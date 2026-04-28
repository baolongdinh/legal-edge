# Performance Optimization Tasks

**Feature**: Full-stack Performance Optimization  
**Priority**: Quick Wins First  
**Status**: Task Breakdown Complete  
**Created**: 2026-04-28

## Phase 0: Quick Wins (1-2 days)

### T001: Add Debounce Utility
**Priority**: HIGH  
**Effort**: 15 min  
**Dependencies**: None  
**File**: `legalshield-web/src/lib/utils.ts`

Create debounce utility function for reuse across components.

```typescript
export const debounce = <T extends (...args: any[]) => any>(
    fn: T,
    delay: number
): ((...args: Parameters<T>) => void) => {
    let timeoutId: NodeJS.Timeout
    return (...args: Parameters<T>) => {
        clearTimeout(timeoutId)
        timeoutId = setTimeout(() => fn(...args), delay)
    }
}
```

**Acceptance Criteria**:
- [ ] Debounce function exported from utils
- [ ] Function signature correctly typed
- [ ] Cleanup on component unmount

---

### T002: Apply Debounce to Sidebar Resize
**Priority**: HIGH  
**Effort**: 15 min  
**Dependencies**: T001  
**File**: `legalshield-web/src/components/layout/Sidebar.tsx`

Apply debounce to resize handler to prevent jank.

**Acceptance Criteria**:
- [ ] Resize handler debounced to 200ms
- [ ] Cleanup on unmount
- [ ] No jank during window resize

---

### T003: Add Lazy Loading to Chat Images
**Priority**: HIGH  
**Effort**: 15 min  
**Dependencies**: None  
**File**: `legalshield-web/src/components/chat/MessageItem.tsx`

Add `loading="lazy"` and `decoding="async"` to image elements.

**Acceptance Criteria**:
- [ ] All images have loading="lazy"
- [ ] All images have decoding="async"
- [ ] Lighthouse score improves by 5+ points

---

### T004: Optimize syncUser Calls
**Priority**: HIGH  
**Effort**: 20 min  
**Dependencies**: None  
**File**: `legalshield-web/src/App.tsx`

Check if user exists in store before calling syncUser.

**Acceptance Criteria**:
- [ ] syncUser only called when user not in store
- [ ] No duplicate API calls on mount
- [ ] User state persists correctly

---

### T005: Install Compression Plugin
**Priority**: HIGH  
**Effort**: 5 min  
**Dependencies**: None  
**File**: `legalshield-web/package.json`

Install vite-plugin-compression for bundle compression.

```bash
npm install -D vite-plugin-compression
```

**Acceptance Criteria**:
- [ ] vite-plugin-compression installed
- [ ] Package.json updated
- [ ] No install errors

---

### T006: Configure Bundle Compression
**Priority**: HIGH  
**Effort**: 10 min  
**Dependencies**: T005  
**File**: `legalshield-web/vite.config.ts`

Configure gzip and brotli compression in Vite config.

**Acceptance Criteria**:
- [ ] Gzip compression configured
- [ ] Brotli compression configured
- [ ] Build produces .gz and .br files

---

### T007: Configure Console Log Removal
**Priority**: HIGH  
**Effort**: 5 min  
**Dependencies**: None  
**File**: `legalshield-web/vite.config.ts`

Configure Terser to remove console.log in production.

**Acceptance Criteria**:
- [ ] Terser configured with drop_console
- [ ] No console.log in production build
- [ ] Bundle size reduced by ~5%

---

### T008: Test Phase 0 Optimizations
**Priority**: HIGH  
**Effort**: 1 hour  
**Dependencies**: T001-T007

Test all Phase 0 optimizations and verify metrics.

**Acceptance Criteria**:
- [ ] Lighthouse score improves by 10+ points
- [ ] Bundle size reduced by 60%+
- [ ] No jank during window resize
- [ ] Images load lazily
- [ ] No console.log in production

---

### T009: Deploy Phase 0
**Priority**: HIGH  
**Effort**: 30 min  
**Dependencies**: T008

Deploy Phase 0 optimizations to production.

**Acceptance Criteria**:
- [ ] Build successful
- [ ] Deployed to production
- [ ] No errors in production
- [ ] Metrics monitored for 24 hours

---

## Phase 1: Medium Impact (3-5 days)

### T010: Install react-window
**Priority**: MEDIUM  
**Effort**: 5 min  
**Dependencies**: None  
**File**: `legalshield-web/package.json`

Install react-window for virtual scrolling.

```bash
npm install react-window
```

**Acceptance Criteria**:
- [ ] react-window installed
- [ ] Package.json updated
- [ ] No install errors

---

### T011: Implement Virtual Scrolling
**Priority**: MEDIUM  
**Effort**: 4 hours  
**Dependencies**: T010  
**File**: `legalshield-web/src/components/chat/MessageList.tsx`

Implement virtual scrolling for message list.

**Acceptance Criteria**:
- [ ] Smooth scrolling with 1000+ messages
- [ ] Memory usage constant
- [ ] Lighthouse performance score > 90
- [ ] Animations preserved

---

### T012: Create Request Cache Module
**Priority**: MEDIUM  
**Effort**: 2 hours  
**Dependencies**: None  
**File**: `legalshield-web/src/lib/request-cache.ts` (new)

Create request deduplication cache.

**Acceptance Criteria**:
- [ ] Request cache module created
- [ ] Deduplication logic implemented
- [ ] Cache cleanup on unmount
- [ ] TypeScript types defined

---

### T013: Integrate Request Cache
**Priority**: MEDIUM  
**Effort**: 1 hour  
**Dependencies**: T012  
**File**: `legalshield-web/src/lib/conversation-api.ts`

Integrate request cache into API calls.

**Acceptance Criteria**:
- [ ] Request cache applied to API calls
- [ ] No duplicate API calls
- [ ] Cache works correctly
- [ ] No performance regression

---

### T014: Add Streaming Retry Logic
**Priority**: MEDIUM  
**Effort**: 2 hours  
**Dependencies**: None  
**File**: `legalshield-web/src/lib/conversation-api.ts`

Add exponential backoff retry for streaming.

**Acceptance Criteria**:
- [ ] Retry logic implemented
- [ ] Exponential backoff configured
- [ ] Max 3 retries
- [ ] User notified on failure

---

### T015: Create Request Queue Module
**Priority**: MEDIUM  
**Effort**: 3 hours  
**Dependencies**: None  
**File**: `legalshield-web/src/lib/request-queue.ts` (new)

Create request queue with rate limiting.

**Acceptance Criteria**:
- [ ] Request queue module created
- [ ] Max 5 concurrent requests
- [ ] Queue logic implemented
- [ ] TypeScript types defined

---

### T016: Integrate Request Queue
**Priority**: MEDIUM  
**Effort**: 1 hour  
**Dependencies**: T015  
**File**: `legalshield-web/src/lib/conversation-api.ts`

Integrate request queue into API calls.

**Acceptance Criteria**:
- [ ] Request queue applied to API calls
- [ ] Max 5 concurrent requests enforced
- [ ] Queue works correctly
- [ ] No rate limiting errors

---

### T017: Implement Route Preloading
**Priority**: MEDIUM  
**Effort**: 1 hour  
**Dependencies**: None  
**File**: `legalshield-web/src/App.tsx`

Add route preloading on nav hover.

**Acceptance Criteria**:
- [ ] Routes preload on hover
- [ ] Navigation delay < 100ms
- [ ] No unnecessary preloads
- [ ] Works with lazy loading

---

### T018: Enhance Service Worker Caching
**Priority**: MEDIUM  
**Effort**: 1 hour  
**Dependencies**: None  
**File**: `legalshield-web/vite.config.ts`

Add cache strategies for Cloudinary and API.

**Acceptance Criteria**:
- [ ] Cloudinary images cached for 7 days
- [ ] API responses cached for 5 minutes
- [ ] Cache-first for images
- [ ] Network-first for API

---

### T019: Test Phase 1 Optimizations
**Priority**: MEDIUM  
**Effort**: 4 hours  
**Dependencies**: T010-T018

Test all Phase 1 optimizations and verify metrics.

**Acceptance Criteria**:
- [ ] Smooth scrolling with 1000+ messages
- [ ] No duplicate API calls
- [ ] Streaming success rate 99%+
- [ ] Navigation delay < 100ms
- [ ] No rate limiting errors

---

### T020: Deploy Phase 1
**Priority**: MEDIUM  
**Effort**: 1 hour  
**Dependencies**: T019

Deploy Phase 1 optimizations to production.

**Acceptance Criteria**:
- [ ] Build successful
- [ ] Deployed to production
- [ ] No errors in production
- [ ] Metrics monitored for 24 hours

---

## Phase 2: Advanced Optimizations (5-7 days)

### T021: Add Blob URL Cleanup
**Priority**: LOW  
**Effort**: 2 hours  
**Dependencies**: None  
**File**: `legalshield-web/src/pages/ChatPage.tsx`

Cleanup blob URLs on component unmount.

**Acceptance Criteria**:
- [ ] Blob URLs revoked on unmount
- [ ] No memory leaks in DevTools
- [ ] Heap size stable over time

---

### T022: Install Sentry
**Priority**: LOW  
**Effort**: 5 min  
**Dependencies**: None  
**File**: `legalshield-web/package.json`

Install @sentry/react for error monitoring.

```bash
npm install @sentry/react
```

**Acceptance Criteria**:
- [ ] Sentry installed
- [ ] Package.json updated
- [ ] No install errors

---

### T023: Configure Sentry
**Priority**: LOW  
**Effort**: 2 hours  
**Dependencies**: T022  
**File**: `legalshield-web/src/main.tsx`

Configure Sentry for error tracking and performance monitoring.

**Acceptance Criteria**:
- [ ] Sentry initialized
- [ ] Error tracking enabled
- [ ] Performance monitoring enabled
- [ ] Session replays enabled

---

### T024: Install Vercel Analytics
**Priority**: LOW  
**Effort**: 5 min  
**Dependencies**: None  
**File**: `legalshield-web/package.json`

Install @vercel/analytics for usage tracking.

```bash
npm install @vercel/analytics
```

**Acceptance Criteria**:
- [ ] Vercel Analytics installed
- [ ] Package.json updated
- [ ] No install errors

---

### T025: Integrate Analytics
**Priority**: LOW  
**Effort**: 1 hour  
**Dependencies**: T024  
**File**: `legalshield-web/src/App.tsx`

Integrate Vercel Analytics component.

**Acceptance Criteria**:
- [ ] Analytics component added
- [ ] Page views tracked
- [ ] Custom events tracked
- [ ] No performance impact

---

### T026: Optimize Font Loading
**Priority**: LOW  
**Effort**: 1 hour  
**Dependencies**: None  
**File**: `legalshield-web/src/index.css`

Add font-display: swap to font-face declarations.

**Acceptance Criteria**:
- [ ] font-display: swap added
- [ ] FCP reduced by 100ms
- [ ] No flash of unstyled text

---

### T027: Add Skeleton to Dashboard
**Priority**: LOW  
**Effort**: 1 hour  
**Dependencies**: None  
**File**: `legalshield-web/src/pages/Dashboard.tsx`

Add skeleton loading state to Dashboard.

**Acceptance Criteria**:
- [ ] Skeleton state implemented
- [ ] Smooth transition to content
- [ ] Consistent design

---

### T028: Add Skeleton to ContractAnalysis
**Priority**: LOW  
**Effort**: 1 hour  
**Dependencies**: None  
**File**: `legalshield-web/src/pages/ContractAnalysis.tsx`

Add skeleton loading state to ContractAnalysis.

**Acceptance Criteria**:
- [ ] Skeleton state implemented
- [ ] Smooth transition to content
- [ ] Consistent design

---

### T029: Add Skeleton to DraftEditor
**Priority**: LOW  
**Effort**: 1 hour  
**Dependencies**: None  
**File**: `legalshield-web/src/pages/DraftEditor.tsx`

Add skeleton loading state to DraftEditor.

**Acceptance Criteria**:
- [ ] Skeleton state implemented
- [ ] Smooth transition to content
- [ ] Consistent design

---

### T030: Add Skeleton to Profile
**Priority**: LOW  
**Effort**: 1 hour  
**Dependencies**: None  
**File**: `legalshield-web/src/pages/Profile.tsx`

Add skeleton loading state to Profile.

**Acceptance Criteria**:
- [ ] Skeleton state implemented
- [ ] Smooth transition to content
- [ ] Consistent design

---

### T031: Test Phase 2 Optimizations
**Priority**: LOW  
**Effort**: 4 hours  
**Dependencies**: T021-T030

Test all Phase 2 optimizations and verify metrics.

**Acceptance Criteria**:
- [ ] No memory leaks detected
- [ ] Performance monitoring active
- [ ] Analytics tracking enabled
- [ ] FCP reduced by 100ms
- [ ] Skeleton states for all async operations

---

### T032: Deploy Phase 2
**Priority**: LOW  
**Effort**: 1 hour  
**Dependencies**: T031

Deploy Phase 2 optimizations to production.

**Acceptance Criteria**:
- [ ] Build successful
- [ ] Deployed to production
- [ ] No errors in production
- [ ] Metrics monitored for 24 hours

---

### T033: Final Performance Audit
**Priority**: LOW  
**Effort**: 4 hours  
**Dependencies**: T032

Conduct final performance audit and generate report.

**Acceptance Criteria**:
- [ ] Lighthouse score 90+
- [ ] FCP < 1.5s
- [ ] TTI < 3s
- [ ] Bundle size < 500KB gzipped
- [ ] API response time < 200ms p95
- [ ] Streaming success rate 99%+
- [ ] API error rate < 1%
- [ ] No memory leaks

---

## Task Dependencies

```
Phase 0:
T001 → T002
T005 → T006
T001-T007 → T008 → T009

Phase 1:
T010 → T011
T012 → T013
T015 → T016
T010-T018 → T019 → T020

Phase 2:
T022 → T023
T024 → T025
T021-T030 → T031 → T032 → T033
```

## Parallel Execution Opportunities

**Phase 0** (can be done in parallel):
- T001, T003, T004, T007 (no dependencies)
- T005 (independent)
- T002 (after T001)
- T006 (after T005)

**Phase 1** (can be done in parallel):
- T010 (independent)
- T012 (independent)
- T015 (independent)
- T017 (independent)
- T018 (independent)
- T014 (independent)
- T011 (after T010)
- T013 (after T012)
- T016 (after T015)

**Phase 2** (can be done in parallel):
- T021 (independent)
- T022 (independent)
- T024 (independent)
- T026 (independent)
- T027-T030 (independent of each other)
- T023 (after T022)
- T025 (after T024)
