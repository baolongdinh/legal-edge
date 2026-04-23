# Frontend API Optimization Tasks

## Feature: API Call Optimization
**Goal**: Eliminate duplicate and unnecessary API calls when switching conversations and throughout the application flow.

---

## Phase 1: Fix Critical Issues (Immediate)

### Story Goal
Prevent duplicate API calls and race conditions when switching conversations.

### Independent Test Criteria
- Switching conversations rapidly does not trigger duplicate API calls.
- Filter/search changes do not cause unnecessary message re-fetches.
- In-flight API requests are properly cancelled when switching conversations.
- No race conditions causing wrong messages to display.
- Only one instance of useConversation hook fetches conversations.

### Implementation Tasks

- [x] T001 Fix ChatPage useEffect dependencies to prevent unnecessary re-fetches in src/pages/ChatPage.tsx
- [x] T002 Add AbortController to selectConversation in src/hooks/useConversation.ts
- [x] T003 Add loading state to prevent concurrent conversation selections in src/hooks/useConversation.ts
- [x] T012 Remove duplicate useConversation hook instance from ConversationSidebar in src/components/chat/ConversationSidebar.tsx
- [ ] T004 Test conversation switching with rapid clicks to verify no duplicate API calls

---

## Phase 2: Optimize Summary Regeneration

### Story Goal
Eliminate wasteful API calls when regenerating conversation summaries.

### Independent Test Criteria
- Regenerating summary does not fetch entire conversation list
- Only necessary API calls are made for summary regeneration
- Updated conversation data is retrieved efficiently

### Implementation Tasks

- [x] T005 Replace conversationApi.list with efficient single-conversation fetch in src/pages/ChatPage.tsx
- [ ] T006 Test summary regeneration to verify minimal API calls
- [ ] T007 Consider updating summarization API to return updated conversation data

---

## Phase 3: Cache Management

### Story Goal
Ensure message cache is properly invalidated and kept fresh.

### Independent Test Criteria
- Cache is invalidated when new messages are added
- Cache has TTL to prevent stale data
- Switching back to a conversation shows latest messages

### Implementation Tasks

- [x] T008 Add cache invalidation in useStreamingChat when messages are added in src/hooks/useStreamingChat.ts
- [x] T009 Add TTL (5 minutes) to message cache in src/store/chatStore.ts
- [x] T010 Add cache freshness check in selectConversation in src/hooks/useConversation.ts (handled by TTL in getCachedMessages)
- [ ] T011 Test cache invalidation after sending new messages

---

## Phase 4: Monitoring & Debugging (Optional)

### Story Goal
Add visibility into API call patterns to help identify future optimization opportunities.

### Independent Test Criteria
- API calls are logged with timestamps
- Performance metrics are tracked for slow endpoints
- Logs help identify duplicate call patterns

### Implementation Tasks

- [ ] T012 [P] Add API call logging utility in src/lib/api-logger.ts
- [ ] T013 [P] Add performance tracking for API calls in src/lib/conversation-api.ts
- [ ] T014 Integrate logging into all API calls
- [ ] T015 Test logging output to verify visibility

---

## Dependencies

```
Phase 1 (Critical) → Phase 2 (High) → Phase 3 (Medium) → Phase 4 (Optional)
```

- Phase 1 tasks are independent and can be done in parallel
- Phase 2 depends on Phase 1 completion (no race conditions interfering)
- Phase 3 depends on Phase 2 (cache system stable)
- Phase 4 is optional and can be done anytime after Phase 1

## Parallel Execution Examples

**Phase 1 Parallel Tasks:**
- T001, T002, T003 can be done in parallel (different files, no dependencies)
- T004 must wait for T001-T003 completion

**Phase 2 Parallel Tasks:**
- T005 is standalone
- T006 depends on T005
- T007 is optional and can be done in parallel with T006

**Phase 3 Parallel Tasks:**
- T008, T009, T010 can be done in parallel (different files)
- T011 must wait for T008-T010 completion

**Phase 4 Parallel Tasks:**
- T012, T013 can be done in parallel
- T014 depends on T012-T013
- T015 depends on T014

## Implementation Strategy

**MVP Scope (Phase 1 only):**
- Focus on fixing the critical race condition and duplicate call issues
- This provides immediate performance improvement
- Can be deployed independently

**Incremental Delivery:**
- After Phase 1: Deploy and monitor for race condition fixes
- After Phase 2: Deploy and monitor summary regeneration efficiency
- After Phase 3: Deploy and monitor cache hit rates
- Phase 4: Deploy if monitoring reveals need for deeper visibility

## Task Summary

- **Total Tasks**: 15
- **Phase 1 (Critical)**: 4 tasks
- **Phase 2 (High)**: 3 tasks
- **Phase 3 (Medium)**: 4 tasks
- **Phase 4 (Optional)**: 4 tasks
- **Parallel Opportunities**: 8 tasks marked as parallelizable
