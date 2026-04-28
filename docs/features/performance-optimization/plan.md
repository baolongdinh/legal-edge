# Performance Optimization Plan

**Feature**: Full-stack Performance Optimization  
**Priority**: Quick Wins First  
**Status**: Planning  
**Created**: 2026-04-28

## Technical Context

### Current Stack
- **Frontend**: React 19, Vite 8, TypeScript, TailwindCSS, Framer Motion
- **State Management**: Zustand with IndexedDB persistence
- **Backend**: Supabase (PostgreSQL, Edge Functions, Storage)
- **File Storage**: Cloudinary (images, documents)
- **Build**: Vite with PWA support, code splitting configured

### Current Performance Issues Identified

1. **Sidebar resize listener** - No debouncing, fires on every pixel resize
2. **Message rendering** - No virtual scrolling for long conversations
3. **Image loading** - No lazy loading for chat attachments
4. **API calls** - No request deduplication or rate limiting
5. **Bundle size** - Missing compression (gzip/brotli)
6. **User sync** - Redundant syncUser calls on every mount
7. **Streaming errors** - No retry logic for failed streams
8. **Memory leaks** - Blob URLs not cleaned up on unmount

### Constitution Check

From `.specify/memory/constitution.md`:
- **Performance**: "All user-facing operations must complete within 200ms perceived latency"
- **Reliability**: "All API calls must have retry logic with exponential backoff"
- **UX**: "Loading states must be provided for all async operations"

**Status**: ⚠️ VIOLATIONS DETECTED
- Sidebar resize can cause jank (violates performance principle)
- No retry logic for streaming (violates reliability principle)
- Missing skeleton states in some components (violates UX principle)

**Justification**: These are legacy issues from initial MVP. Plan addresses all violations.

## Phase 0: Quick Wins (1-2 days)

### 0.1 Debounce Sidebar Resize (30 min)
**File**: `legalshield-web/src/components/layout/Sidebar.tsx`  
**Impact**: Eliminates jank during window resize  
**Effort**: 30 min

```typescript
// Add debounce utility
const debounce = <T extends (...args: any[]) => any>(
    fn: T,
    delay: number
): ((...args: Parameters<T>) => void) => {
    let timeoutId: NodeJS.Timeout
    return (...args: Parameters<T>) => {
        clearTimeout(timeoutId)
        timeoutId = setTimeout(() => fn(...args), delay)
    }
}

// Apply to resize handler
const handleResize = debounce(() => {
    const isMobile = window.innerWidth < 768
    useUIStore.setState({ sidebarExpanded: !isMobile })
}, 200)
```

**Acceptance Criteria**:
- [ ] Resize handler fires max once per 200ms
- [ ] No jank during window resize
- [ ] Cleanup on unmount

### 0.2 Add Image Lazy Loading (15 min)
**File**: `legalshield-web/src/components/chat/MessageItem.tsx`  
**Impact**: Reduces initial page load by ~30% for image-heavy chats  
**Effort**: 15 min

```typescript
<img 
    src={url} 
    alt={`Ảnh ${idx + 1}`} 
    className="w-full h-full object-cover"
    loading="lazy"
    decoding="async"
/>
```

**Acceptance Criteria**:
- [ ] Images load only when scrolled into view
- [ ] Lighthouse score improves by 5+ points

### 0.3 Optimize syncUser Calls (20 min)
**File**: `legalshield-web/src/App.tsx`  
**Impact**: Reduces unnecessary API calls by ~50%  
**Effort**: 20 min

```typescript
useEffect(() => {
    const user = useUserStore.getState().user
    if (!hasSyncedUserRef.current && !user) {
        syncUser()
        hasSyncedUserRef.current = true
    }
}, [])
```

**Acceptance Criteria**:
- [ ] syncUser only called when user not in store
- [ ] No duplicate API calls on mount

### 0.4 Add Bundle Compression (10 min)
**File**: `legalshield-web/vite.config.ts`  
**Impact**: Reduces bundle size by ~70% with gzip/brotli  
**Effort**: 10 min

```bash
npm install -D vite-plugin-compression
```

```typescript
import viteCompression from 'vite-plugin-compression'

export default defineConfig({
    plugins: [
        react(),
        viteCompression({
            algorithm: 'gzip',
            ext: '.gz',
        }),
        viteCompression({
            algorithm: 'brotliCompress',
            ext: '.br',
        }),
        // ... existing plugins
    ],
})
```

**Acceptance Criteria**:
- [ ] Build produces .gz and .br files
- [ ] Bundle size reduced by 60-70%

### 0.5 Add Console Log Removal (5 min)
**File**: `legalshield-web/vite.config.ts`  
**Impact**: Reduces bundle size by ~5%  
**Effort**: 5 min

```typescript
build: {
    minify: 'terser',
    terserOptions: {
        compress: {
            drop_console: true,
        },
    },
}
```

**Acceptance Criteria**:
- [ ] No console.log in production build
- [ ] Bundle size reduced by ~5%

## Phase 1: Medium Impact (3-5 days)

### 1.1 Virtual Scrolling for Message List (4 hours)
**File**: `legalshield-web/src/components/chat/MessageList.tsx`  
**Impact**: Enables smooth scrolling for 1000+ message conversations  
**Effort**: 4 hours

```bash
npm install react-window
```

```typescript
import { FixedSizeList as List } from 'react-window'

const Row = ({ index, style, data }: any) => (
    <div style={style}>
        <MessageItem message={data[index]} />
    </div>
)

<List
    height={600}
    itemCount={messages.length}
    itemSize={200}
    itemData={messages}
    width="100%"
>
    {Row}
</List>
```

**Acceptance Criteria**:
- [ ] Smooth scrolling with 1000+ messages
- [ ] Memory usage constant regardless of message count
- [ ] Lighthouse performance score > 90

### 1.2 Request Deduplication (2 hours)
**File**: `legalshield-web/src/lib/request-cache.ts` (new)  
**Impact**: Prevents duplicate API calls for same resource  
**Effort**: 2 hours

```typescript
const pendingRequests = new Map<string, Promise<any>>()

export async function dedupeRequest<T>(
    key: string,
    fn: () => Promise<T>
): Promise<T> {
    if (pendingRequests.has(key)) {
        return pendingRequests.get(key) as Promise<T>
    }
    
    const promise = fn().finally(() => {
        pendingRequests.delete(key)
    })
    
    pendingRequests.set(key, promise)
    return promise
}
```

**Acceptance Criteria**:
- [ ] Concurrent requests for same resource deduplicated
- [ ] No duplicate API calls in network tab
- [ ] Cache cleared on component unmount

### 1.3 Streaming Retry Logic (2 hours)
**File**: `legalshield-web/src/lib/conversation-api.ts`  
**Impact**: Improves reliability of chat streaming  
**Effort**: 2 hours

```typescript
async streamWithRetry(
    message: string,
    history: Message[],
    conversationId: string | undefined,
    documentContext: any | undefined,
    onChunk: (chunk: string) => void,
    onDone: (payload: any) => void,
    onError: (error: string) => void,
    maxRetries = 3
) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            await this.stream(message, history, conversationId, documentContext, onChunk, onDone, onError)
            return
        } catch (err) {
            if (i === maxRetries - 1) {
                onError(err instanceof Error ? err.message : 'Stream failed after retries')
                return
            }
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000))
        }
    }
}
```

**Acceptance Criteria**:
- [ ] Failed streams auto-retry up to 3 times
- [ ] Exponential backoff between retries
- [ ] User notified after all retries exhausted

### 1.4 Request Queue with Rate Limiting (3 hours)
**File**: `legalshield-web/src/lib/request-queue.ts` (new)  
**Impact**: Prevents API overload and rate limiting errors  
**Effort**: 3 hours

```typescript
class RequestQueue {
    private queue: Array<() => Promise<any>> = []
    private active = 0
    private maxConcurrent = 5

    async add<T>(fn: () => Promise<T>): Promise<T> {
        if (this.active >= this.maxConcurrent) {
            await new Promise(resolve => this.queue.push(resolve as any))
        }
        
        this.active++
        try {
            return await fn()
        } finally {
            this.active--
            const next = this.queue.shift()
            if (next) next()
        }
    }
}

export const requestQueue = new RequestQueue()
```

**Acceptance Criteria**:
- [ ] Max 5 concurrent API calls
- [ ] Requests queued when limit reached
- [ ] No rate limiting errors from Supabase

### 1.5 Route Preloading (1 hour)
**File**: `legalshield-web/src/App.tsx`  
**Impact**: Reduces navigation delay by ~200ms  
**Effort**: 1 hour

```typescript
const preloadRoute = (path: string) => {
    const link = document.createElement('link')
    link.rel = 'prefetch'
    link.href = path
    document.head.appendChild(link)
}

// In nav items
<Link
    key={to}
    to={to}
    onMouseEnter={() => preloadRoute(to)}
>
```

**Acceptance Criteria**:
- [ ] Routes preloaded on nav hover
- [ ] Navigation delay < 100ms
- [ ] No unnecessary preloads

### 1.6 Enhanced Service Worker Caching (1 hour)
**File**: `legalshield-web/vite.config.ts`  
**Impact**: Improves offline capability and reduces API calls  
**Effort**: 1 hour

```typescript
workbox: {
    runtimeCaching: [
        {
            urlPattern: /^https:\/\/api\.cloudinary\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
                cacheName: 'cloudinary-cache',
                expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
        },
        {
            urlPattern: /\/functions\/v1\//i,
            handler: 'NetworkFirst',
            options: {
                cacheName: 'api-cache',
                networkTimeoutSeconds: 10,
                expiration: { maxEntries: 100, maxAgeSeconds: 60 * 5 },
            },
        },
    ],
}
```

**Acceptance Criteria**:
- [ ] Cloudinary images cached for 7 days
- [ ] API responses cached for 5 minutes
- [ ] Offline capability maintained

## Phase 2: Advanced Optimizations (5-7 days)

### 2.1 Memory Leak Prevention (2 hours)
**File**: `legalshield-web/src/pages/ChatPage.tsx`  
**Impact**: Prevents memory leaks from blob URLs  
**Effort**: 2 hours

```typescript
useEffect(() => {
    return () => {
        const state = useChatStore.getState()
        state.attachedImages.forEach(img => URL.revokeObjectURL(img.url))
        state.clearAttachedImages()
    }
}, [])
```

**Acceptance Criteria**:
- [ ] Blob URLs revoked on unmount
- [ ] No memory leaks in Chrome DevTools
- [ ] Heap size stable over time

### 2.2 Performance Monitoring Setup (3 hours)
**Files**: `legalshield-web/src/main.tsx`  
**Impact**: Enables real-time performance tracking  
**Effort**: 3 hours

```bash
npm install @sentry/react
```

```typescript
import * as Sentry from '@sentry/react'

Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.1,
})
```

**Acceptance Criteria**:
- [ ] Errors tracked in Sentry
- [ ] Performance metrics collected
- [ ] Session replays enabled

### 2.3 Analytics Integration (2 hours)
**File**: `legalshield-web/src/App.tsx`  
**Impact**: Enables usage analytics  
**Effort**: 2 hours

```bash
npm install @vercel/analytics
```

```typescript
import { Analytics } from '@vercel/analytics/react'

export default function App() {
    return (
        <BrowserRouter>
            <Analytics />
            {/* ... */}
        </BrowserRouter>
    )
}
```

**Acceptance Criteria**:
- [ ] Page views tracked
- [ ] Custom events for key actions
- [ ] No performance impact

### 2.4 Font Loading Optimization (1 hour)
**File**: `legalshield-web/src/index.css`  
**Impact**: Reduces FCP by ~100ms  
**Effort**: 1 hour

```css
@font-face {
    font-family: 'Manrope';
    font-display: swap;
    src: url('/fonts/Manrope.woff2') format('woff2');
}
```

**Acceptance Criteria**:
- [ ] Fonts use font-display: swap
- [ ] FCP reduced by 100ms
- [ ] No flash of unstyled text

### 2.5 Skeleton Loading States (4 hours)
**Files**: Multiple components  
**Impact**: Improves perceived performance  
**Effort**: 4 hours

Add skeleton states to:
- Dashboard
- ContractAnalysis
- DraftEditor
- Profile

**Acceptance Criteria**:
- [ ] Skeleton states for all async operations
- [ ] Smooth transitions to real content
- [ ] Consistent design across components

## Implementation Order

### Week 1: Quick Wins (Phase 0)
1. Day 1: 0.1, 0.2, 0.3, 0.5 (1.5 hours total)
2. Day 2: 0.4 + testing + deployment (2 hours)

### Week 2: Medium Impact (Phase 1)
1. Day 1: 1.1 (Virtual scrolling)
2. Day 2: 1.2, 1.3 (Request deduplication + retry)
3. Day 3: 1.4, 1.5 (Queue + preloading)
4. Day 4: 1.6 + testing
5. Day 5: Deployment + monitoring

### Week 3: Advanced (Phase 2)
1. Day 1: 2.1, 2.4 (Memory + fonts)
2. Day 2: 2.2, 2.3 (Monitoring + analytics)
3. Day 3: 2.5 (Skeleton states)
4. Day 4: Testing + performance audit
5. Day 5: Deployment

## Success Metrics

### Performance Targets
- **Lighthouse Performance Score**: 90+ (currently ~65)
- **First Contentful Paint (FCP)**: < 1.5s (currently ~2.5s)
- **Time to Interactive (TTI)**: < 3s (currently ~5s)
- **Bundle Size**: < 500KB gzipped (currently ~1.2MB)
- **API Response Time**: < 200ms p95 (currently ~500ms)

### Reliability Targets
- **Streaming Success Rate**: 99%+ (currently ~95%)
- **API Error Rate**: < 1% (currently ~3%)
- **Memory Leaks**: 0 detected

### UX Targets
- **Perceived Latency**: < 200ms for all interactions
- **Loading States**: 100% coverage
- **Error Recovery**: Auto-retry for all transient failures

## Risks & Mitigations

### Risk 1: Virtual Scrolling Breaks Animations
**Mitigation**: Test thoroughly with Framer Motion, use `react-window` with `react-window-infinite-loader`

### Risk 2: Request Queue Delays Critical Operations
**Mitigation**: Implement priority queue, allow bypass for critical operations

### Risk 3: Bundle Compression Increases Build Time
**Mitigation**: Acceptable tradeoff, can be parallelized

### Risk 4: Service Worker Cache Staleness
**Mitigation**: Implement cache versioning, add manual refresh button

## Rollback Plan

Each optimization will be deployed as a separate PR:
- If any issue detected, revert specific PR
- Monitor metrics for 24 hours before proceeding
- Feature flags for critical changes

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

## Next Steps

1. **Immediate**: Start Phase 0 quick wins (can be done in 1 day)
2. **Week 1**: Deploy Phase 0 and monitor metrics
3. **Week 2**: Begin Phase 1 medium impact optimizations
4. **Week 3**: Complete Phase 2 advanced optimizations
5. **Post-launch**: Continuous monitoring and iteration
