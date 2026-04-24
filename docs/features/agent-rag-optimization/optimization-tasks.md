# Core Logic Optimization Tasks

## Phase 1: Quick Wins (Backend)

- [ ] T001 Add heuristic intent evaluation for simple questions in `supabase/functions/legal-chat/index.ts`
  - Check if message is standalone (< 100 chars, no context)
  - Return default intent_eval without LLM call
  - Fallback to LLM if heuristics fail
  - Expected impact: -300ms for 40% of traffic

- [ ] T002 Make intent evaluation and standalone query generation parallel in `supabase/functions/legal-chat/index.ts`
  - Wrap in Promise.all: evaluateIntent + buildStandaloneQuery
  - Handle cases where intent_eval.suggested_standalone_query is used
  - Ensure no race conditions
  - Expected impact: -300ms for complex queries

- [ ] T003 Move user message save to background in `legalshield-web/src/hooks/useStreamingChat.ts`
  - Remove await from messageApi.saveUserMessage
  - Add catch for error handling
  - Ensure streaming starts immediately
  - Expected impact: -100ms latency

## Phase 2: Medium Impact (Backend)

- [ ] T004 Parallelize Jina reranking with retrieval in `supabase/functions/legal-chat/index.ts`
  - Start jinaRerank with candidate texts in Promise.all
  - Combine results after all promises resolve
  - Handle reranking failures gracefully
  - Expected impact: -200ms

- [ ] T005 Make HyDE generation async/non-blocking in `supabase/functions/legal-chat/index.ts`
  - Start HyDE generation in background promise
  - Use query embedding immediately for retrieval
  - Await HyDE only when needed for local RAG
  - Expected impact: -200ms for high complexity queries

## Phase 3: Medium Impact (Frontend)

- [ ] T006 Parallelize document upload and file reading in `legalshield-web/src/hooks/useStreamingChat.ts`
  - Use Promise.all for uploadToCloudinary + FileReader
  - Combine results into single document object
  - Handle both text and binary files
  - Expected impact: -500ms for text documents

- [ ] T007 [P] Implement optimistic assistant message save in `legalshield-web/src/hooks/useStreamingChat.ts`
  - Remove await from messageApi.saveAssistantMessage
  - Add catch for error handling with UI rollback
  - Use local ID for message display immediately
  - Expected impact: -100ms perceived latency

- [ ] T008 [P] Add optimistic attachment display in `legalshield-web/src/hooks/useStreamingChat.ts`
  - Show attachment preview immediately when upload starts
  - Update with real URL after upload completes
  - Handle upload errors with retry UI
  - Expected impact: Better UX, no waiting for upload

- [ ] T009 [P] Implement error rollback mechanism in `legalshield-web/src/hooks/useStreamingChat.ts`
  - If saveUserMessage fails, remove from chat
  - If saveAssistantMessage fails, show error indicator
  - Allow user to retry failed saves
  - Expected impact: Robust error handling

- [ ] T010 [P] Add local state persistence in `legalshield-web/src/hooks/useStreamingChat.ts`
  - Cache messages in localStorage/IndexedDB
  - Sync with BE in background
  - Restore messages on page reload
  - Expected impact: Better offline experience

## Phase 4: UX Improvements

- [ ] T011 Implement debounced summary generation in `legalshield-web/src/hooks/useStreamingChat.ts`
  - Add useRef for debounce timer
  - Clear previous timeout on new message
  - Trigger all 3 summary levels in parallel after 5s delay
  - Remove individual setTimeout calls
  - Expected impact: Better UX, fewer API calls

- [ ] T012 Add upload progress tracking in `legalshield-web/src/hooks/useStreamingChat.ts`
  - Track individual upload progress
  - Update streamingStatus with percentage
  - Show user feedback during long uploads
  - Expected impact: Better UX

- [ ] T013 [P] Add skeleton loading states in `legalshield-web/src/components/chat/MessageList.tsx`
  - Show skeleton UI while loading messages
  - Smooth transition when data arrives
  - Prevent layout shift
  - Expected impact: Better perceived performance

- [ ] T014 [P] Implement error boundary in `legalshield-web/src/components/chat/MessageList.tsx`
  - Catch React errors gracefully
  - Show fallback UI with retry option
  - Log errors for debugging
  - Expected impact: Robust error handling

- [ ] T015 [P] Add virtual scrolling for message list in `legalshield-web/src/components/chat/MessageList.tsx`
  - Use react-window or similar
  - Only render visible messages
  - Improve performance for long conversations
  - Expected impact: Better performance for 100+ messages

- [ ] T016 [P] Implement progressive image loading in `legalshield-web/src/components/chat/MessageList.tsx`
  - Show blur-up placeholder
  - Lazy load images below fold
  - Use intersection observer
  - Expected impact: Faster initial render

- [ ] T017 [P] Add code splitting for heavy components in `legalshield-web/src/App.tsx`
  - Lazy load PDF viewer
  - Lazy load document editor
  - Reduce initial bundle size
  - Expected impact: Faster initial load

## Phase 5: Testing & Validation

- [ ] T018 Add latency logging to `supabase/functions/legal-chat/index.ts`
  - Log start time at function entry
  - Log time after each major operation (intent, retrieval, streaming)
  - Calculate total latency
  - Log to telemetry for monitoring

- [ ] T019 Test simple query latency (< 2s target)
  - Test with standalone questions
  - Verify heuristic intent path works
  - Measure actual latency reduction
  - Confirm cache hit rate

- [ ] T020 Test complex query latency (< 3s target)
  - Test with legal analysis questions
  - Verify parallel operations work
  - Measure actual latency reduction
  - Confirm RAG quality maintained

- [ ] T021 Test attachment upload latency
  - Test with multiple images
  - Test with text documents
  - Verify parallel uploads work
  - Confirm file reading doesn't block

- [ ] T022 Test optimistic UI updates
  - Verify messages appear immediately
  - Test error rollback mechanism
  - Verify local state persistence
  - Confirm offline experience works

## Phase 6: Deployment

- [ ] T023 Deploy backend optimizations to Supabase
  - Run make deploy-supabase
  - Verify deployment success
  - Check function logs for errors

- [ ] T024 Deploy frontend optimizations to Vercel
  - Run make deploy-frontend-vercel
  - Verify deployment success
  - Test in production environment

- [ ] T025 Monitor latency metrics post-deployment
  - Check P50, P95 latency in logs
  - Verify cache hit rate improvement
  - Monitor error rate
  - Compare to baseline metrics

## Dependencies

- T001 must complete before T002 (intent logic changes)
- T002 must complete before T004 (parallel execution needs both operations)
- T003 can run in parallel with T001-T002 (frontend independent)
- T004-T005 can run in parallel with T006-T010 (backend/frontend independent)
- T007-T010 are parallel safe (all optimistic UI tasks)
- T011-T012 depend on T006 (summary/progress after upload optimization)
- T013-T017 are parallel safe (all UI enhancements, independent)
- T018-T022 depend on all optimization tasks
- T023-T025 depend on T001-T017 completion

## Parallel Execution Opportunities

**Phase 1 (Parallel Safe):**
- T001, T003 can run in parallel (different files, no dependencies)

**Phase 2 (Parallel Safe):**
- T004, T006 can run in parallel (backend/frontend independent)

**Phase 3 (Parallel Safe):**
- T007, T008, T009, T010 can run in parallel (all optimistic UI tasks, independent)

**Phase 4 (Parallel Safe):**
- T011 depends on T006
- T012 depends on T006
- T013, T014, T015, T016, T017 can run in parallel (all UI enhancements, independent)

**Phase 5 (Parallel Safe):**
- T018, T019, T020, T021, T022 can run in parallel (independent tests)

**Phase 6 (Sequential):**
- T023 before T024 before T025

## MVP Scope

**Minimum Viable Optimization (Phase 1):**
- T001: Skip intent eval for simple questions (-300ms)
- T002: Parallel intent + query (-300ms)
- T003: Background save user message (-100ms)

**Total Impact with MVP:** -700ms average latency

**UX-First Optimization (Phase 1 + Phase 3):**
- T001-T003 (Quick Wins)
- T007-T010 (Optimistic UI)

**Total Impact with UX-First:** -1.2s perceived latency (better UX)

**Performance-First Optimization (Phase 1 + Phase 3 + Phase 4):**
- T001-T003 (Quick Wins)
- T007-T010 (Optimistic UI)
- T013-T017 (UI Performance Enhancements)

**Total Impact with Performance-First:** -1.5s perceived latency + significantly better UX

**Full Optimization Scope:**
- All 25 tasks
- **Total Impact:** -2.0s average latency + significantly better UX + robust error handling
