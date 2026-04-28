# Performance Optimization Specification

**Feature**: Full-stack Performance Optimization  
**Priority**: Quick Wins First  
**Status**: Specified  
**Created**: 2026-04-28

## Overview

This specification defines the performance optimization plan for LegalEdge, prioritizing quick wins that deliver maximum impact with minimal effort. The plan is organized into three phases:

- **Phase 0**: Quick Wins (1-2 days) - High impact, low effort
- **Phase 1**: Medium Impact (3-5 days) - Moderate impact, moderate effort
- **Phase 2**: Advanced Optimizations (5-7 days) - Lower impact, higher effort

## Current State Assessment

### Performance Issues
1. **Sidebar resize listener** - No debouncing, fires on every pixel resize
2. **Message rendering** - No virtual scrolling for long conversations
3. **Image loading** - No lazy loading for chat attachments
4. **API calls** - No request deduplication or rate limiting
5. **Bundle size** - Missing compression (gzip/brotli)
6. **User sync** - Redundant syncUser calls on every mount
7. **Streaming errors** - No retry logic for failed streams
8. **Memory leaks** - Blob URLs not cleaned up on unmount

### Current Metrics (Estimated)
- Lighthouse Performance Score: ~65
- First Contentful Paint (FCP): ~2.5s
- Time to Interactive (TTI): ~5s
- Bundle Size: ~1.2MB (uncompressed)
- API Response Time: ~500ms p95
- Streaming Success Rate: ~95%
- API Error Rate: ~3%

## Target Metrics

### Performance Targets
- Lighthouse Performance Score: 90+
- First Contentful Paint (FCP): < 1.5s
- Time to Interactive (TTI): < 3s
- Bundle Size: < 500KB gzipped
- API Response Time: < 200ms p95

### Reliability Targets
- Streaming Success Rate: 99%+
- API Error Rate: < 1%
- Memory Leaks: 0 detected

### UX Targets
- Perceived Latency: < 200ms for all interactions
- Loading States: 100% coverage
- Error Recovery: Auto-retry for all transient failures

## Phase 0: Quick Wins (1-2 days)

### 0.1 Debounce Sidebar Resize
**Impact**: Eliminates jank during window resize  
**Effort**: 30 min  
**File**: `legalshield-web/src/components/layout/Sidebar.tsx`

Add debounce utility to prevent resize handler from firing on every pixel change.

### 0.2 Add Image Lazy Loading
**Impact**: Reduces initial page load by ~30% for image-heavy chats  
**Effort**: 15 min  
**File**: `legalshield-web/src/components/chat/MessageItem.tsx`

Add `loading="lazy"` and `decoding="async"` to all image elements.

### 0.3 Optimize syncUser Calls
**Impact**: Reduces unnecessary API calls by ~50%  
**Effort**: 20 min  
**File**: `legalshield-web/src/App.tsx`

Check if user exists in store before calling syncUser.

### 0.4 Add Bundle Compression
**Impact**: Reduces bundle size by ~70% with gzip/brotli  
**Effort**: 10 min  
**File**: `legalshield-web/vite.config.ts`

Install and configure `vite-plugin-compression` for gzip and brotli compression.

### 0.5 Add Console Log Removal
**Impact**: Reduces bundle size by ~5%  
**Effort**: 5 min  
**File**: `legalshield-web/vite.config.ts`

Configure Terser to remove console.log in production builds.

## Phase 1: Medium Impact (3-5 days)

### 1.1 Virtual Scrolling for Message List
**Impact**: Enables smooth scrolling for 1000+ message conversations  
**Effort**: 4 hours  
**File**: `legalshield-web/src/components/chat/MessageList.tsx`

Implement `react-window` for virtual scrolling to render only visible messages.

### 1.2 Request Deduplication
**Impact**: Prevents duplicate API calls for same resource  
**Effort**: 2 hours  
**File**: `legalshield-web/src/lib/request-cache.ts` (new)

Create request cache to deduplicate concurrent requests for same resource.

### 1.3 Streaming Retry Logic
**Impact**: Improves reliability of chat streaming  
**Effort**: 2 hours  
**File**: `legalshield-web/src/lib/conversation-api.ts`

Add exponential backoff retry logic for failed streaming requests.

### 1.4 Request Queue with Rate Limiting
**Impact**: Prevents API overload and rate limiting errors  
**Effort**: 3 hours  
**File**: `legalshield-web/src/lib/request-queue.ts` (new)

Implement request queue with max 5 concurrent requests.

### 1.5 Route Preloading
**Impact**: Reduces navigation delay by ~200ms  
**Effort**: 1 hour  
**File**: `legalshield-web/src/App.tsx`

Prefetch routes on nav hover using `<link rel="prefetch">`.

### 1.6 Enhanced Service Worker Caching
**Impact**: Improves offline capability and reduces API calls  
**Effort**: 1 hour  
**File**: `legalshield-web/vite.config.ts`

Add cache-first for Cloudinary images, network-first for API calls.

## Phase 2: Advanced Optimizations (5-7 days)

### 2.1 Memory Leak Prevention
**Impact**: Prevents memory leaks from blob URLs  
**Effort**: 2 hours  
**File**: `legalshield-web/src/pages/ChatPage.tsx`

Cleanup blob URLs on component unmount.

### 2.2 Performance Monitoring Setup
**Impact**: Enables real-time performance tracking  
**Effort**: 3 hours  
**File**: `legalshield-web/src/main.tsx`

Integrate Sentry for error tracking and performance monitoring.

### 2.3 Analytics Integration
**Impact**: Enables usage analytics  
**Effort**: 2 hours  
**File**: `legalshield-web/src/App.tsx`

Integrate Vercel Analytics for usage tracking.

### 2.4 Font Loading Optimization
**Impact**: Reduces FCP by ~100ms  
**Effort**: 1 hour  
**File**: `legalshield-web/src/index.css`

Add `font-display: swap` to font-face declarations.

### 2.5 Skeleton Loading States
**Impact**: Improves perceived performance  
**Effort**: 4 hours  
**Files**: Multiple components

Add skeleton loading states to Dashboard, ContractAnalysis, DraftEditor, Profile.

## Implementation Timeline

### Week 1: Quick Wins (Phase 0)
- Day 1: 0.1, 0.2, 0.3, 0.5 (1.5 hours total)
- Day 2: 0.4 + testing + deployment (2 hours)

### Week 2: Medium Impact (Phase 1)
- Day 1: 1.1 (Virtual scrolling)
- Day 2: 1.2, 1.3 (Request deduplication + retry)
- Day 3: 1.4, 1.5 (Queue + preloading)
- Day 4: 1.6 + testing
- Day 5: Deployment + monitoring

### Week 3: Advanced (Phase 2)
- Day 1: 2.1, 2.4 (Memory + fonts)
- Day 2: 2.2, 2.3 (Monitoring + analytics)
- Day 3: 2.5 (Skeleton states)
- Day 4: Testing + performance audit
- Day 5: Deployment

## Success Criteria

### Phase 0 Success
- [ ] Lighthouse score improves by 10+ points
- [ ] Bundle size reduced by 60%+
- [ ] No jank during window resize
- [ ] Images load lazily

### Phase 1 Success
- [ ] Smooth scrolling with 1000+ messages
- [ ] No duplicate API calls
- [ ] Streaming success rate 99%+
- [ ] Navigation delay < 100ms

### Phase 2 Success
- [ ] No memory leaks detected
- [ ] Performance monitoring active
- [ ] Analytics tracking enabled
- [ ] FCP reduced by 100ms
- [ ] Skeleton states for all async operations

## Risks & Mitigations

### Risk 1: Virtual Scrolling Breaks Animations
**Mitigation**: Test thoroughly with Framer Motion, use `react-window` with `react-window-infinite-loader`

### Risk 2: Request Queue Delays Critical Operations
**Mitigation**: Implement priority queue, allow bypass for critical operations

### Risk 3: Bundle Compression Increases Build Time
**Mitigation**: Acceptable tradeoff, can be parallelized

### Risk 4: Service Worker Cache Staleness
**Mitigation**: Implement cache versioning, add manual refresh button

## Dependencies

### External Packages
- `react-window` - Virtual scrolling
- `vite-plugin-compression` - Bundle compression
- `@sentry/react` - Error monitoring
- `@vercel/analytics` - Analytics

### Internal Changes
- No breaking changes to existing APIs
- All changes additive or performance-only
- Backward compatible with existing data

## Testing Strategy

### Performance Testing
- Lighthouse CI/CD integration
- WebPageTest for real-world metrics
- Load testing with k6 for API endpoints

### Regression Testing
- E2E tests with Playwright
- Visual regression tests
- Manual testing on mobile devices

### Monitoring
- Sentry for error tracking
- Vercel Analytics for usage
- Custom performance dashboard

## Rollback Plan

Each optimization will be deployed as a separate PR:
- If any issue detected, revert specific PR
- Monitor metrics for 24 hours before proceeding
- Feature flags for critical changes
