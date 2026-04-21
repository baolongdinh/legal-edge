# Implementation Tasks: Agentic Legal Chat Optimization

## Feature Overview
Transform the current basic legal consultation chat into an intelligent, agentic legal assistant with streaming responses, multi-layer conversation summarization, conversation management, comprehensive fallback mechanisms, and cost optimization strategies.

## Implementation Strategy
**MVP First**: Start with Phase 1 (Database & Infrastructure) + Phase 2 (Streaming) for immediate value, then incrementally add other features.

**Incremental Delivery**: Each user story phase can be independently tested and deployed.

---

## Phase 1: Setup & Prerequisites

### Goal
Set up development environment, install dependencies, and prepare infrastructure.

### Independent Test Criteria
- All dependencies installed without errors
- Environment variables configured
- Branch created and ready for development

### Tasks

- [ ] T001 Create feature branch `optimize/chat-response` from main
- [ ] T002 [P] Install frontend dependencies in legalshield-web: framer-motion, clsx, @tanstack/react-query
- [ ] T003 [P] Configure environment variables for new services (JINA reranking, simple chat cache TTL)
- [ ] T004 [P] Verify Supabase CLI is configured for project xrfhkyjwesxpybsooeot
- [ ] T005 [P] Create docs/specs/agentic-legal-chat directory structure if not exists

---

## Phase 2: Foundational - Database & Infrastructure

### Goal
Create database schema, RLS policies, and edge function scaffolding.

### Independent Test Criteria
- All tables created with correct schema
- RLS policies enforce user isolation
- Edge function stubs deploy successfully
- Can query tables via Supabase client

### Tasks

- [ ] T006 Create database migration file: supabase/migrations/20260421000001_agentic_chat_tables.sql
- [ ] T007 [P] Implement conversations table schema with all fields (id, user_id, title, is_archived, is_starred, folder, summary_level_1/2/3, summary_last_updated, message_count, total_tokens, created_at, updated_at)
- [ ] T008 [P] Implement messages table schema with all fields (id, conversation_id, role, content, citations, follow_up_suggestions, document_context, token_count, created_at)
- [ ] T009 [P] Implement user_legal_profile table schema with all fields (user_id, profile_summary, frequent_topics, preferences, total_conversations, total_tokens, updated_at)
- [ ] T010 [P] Add CHECK constraint for messages.role to enforce 'user', 'assistant', 'system'
- [ ] T011 [P] Create performance indexes: idx_conversations_user_updated, idx_conversations_folder, idx_messages_conversation, idx_conversations_starred, idx_conversations_archived
- [ ] T012 [P] Create update_updated_at_column() trigger function
- [ ] T013 [P] Add triggers for conversations and user_legal_profile updated_at
- [ ] T014 [P] Enable RLS on all three tables
- [ ] T015 [P] Create RLS policies for conversations table (SELECT, INSERT, UPDATE, DELETE for own user)
- [ ] T016 [P] Create RLS policies for messages table (SELECT, INSERT, UPDATE for own conversations)
- [ ] T017 [P] Create RLS policies for user_legal_profile table (SELECT, INSERT, UPDATE for own user)
- [ ] T018 [P] Grant execute permissions on triggers and functions
- [ ] T019 Apply migration to local Supabase instance via `supabase db push`
- [ ] T020 Create edge function scaffolding: supabase/functions/legal-chat-stream/index.ts
- [ ] T021 [P] Create edge function scaffolding: supabase/functions/save-conversation/index.ts
- [ ] T022 [P] Create edge function scaffolding: supabase/functions/save-message/index.ts
- [ ] T023 [P] Create edge function scaffolding: supabase/functions/summarize-conversation/index.ts
- [ ] T024 [P] Create edge function scaffolding: supabase/functions/generate-suggestions/index.ts
- [ ] T025 [P] Create edge function scaffolding: supabase/functions/get-conversations/index.ts
- [ ] T026 [P] Create edge function scaffolding: supabase/functions/get-messages/index.ts
- [ ] T027 [P] Create frontend store: legalshield-web/src/store/chatStore.ts with Zustand
- [ ] T028 [P] Create frontend store: legalshield-web/src/store/conversationStore.ts with Zustand
- [ ] T029 [P] Create API client: legalshield-web/src/lib/conversation-api.ts for Supabase calls
- [ ] T030 [P] Create hook: legalshield-web/src/hooks/useStreamingChat.ts for SSE logic
- [ ] T031 [P] Create hook: legalshield-web/src/hooks/useConversation.ts for conversation operations
- [ ] T032 Deploy all edge function stubs to verify deployment works

---

## Phase 3: User Story 1 - Streaming Chat Response (FR-001)

### Goal
Implement Server-Sent Events (SSE) for real-time streaming responses with typing indicators and inline citations.

### Independent Test Criteria
- SSE endpoint returns streaming response
- Client receives chunks incrementally
- Typing indicator shows during streaming
- Citations display inline during stream
- Connection interruptions handled gracefully
- First token latency <100ms

### Tasks

- [ ] T033 [US1] Implement SSE streaming handler in supabase/functions/legal-chat-stream/index.ts with ReadableStream
- [ ] T034 [US1] Add authentication check in legal-chat-stream to verify user token
- [ ] T035 [US1] Parse request body (message, history, conversation_id) in legal-chat-stream
- [ ] T036 [US1] Implement context building logic with conversation history in legal-chat-stream
- [ ] T037 [US1] Integrate existing LLM call logic with streaming support in legal-chat-stream
- [ ] T038 [US1] Format SSE chunks with type field (chunk, done, error) in legal-chat-stream
- [ ] T039 [US1] Add timeout handling for streaming operations in legal-chat-stream
- [ ] T040 [US1] Implement error handling and graceful degradation in legal-chat-stream
- [ ] T041 [US1] Add citation marker logic for inline display in legal-chat-stream
- [ ] T042 [US1] Implement finalize-citations logic after stream completes in legal-chat-stream
- [ ] T043 [US1] Test streaming endpoint with curl or Postman
- [ ] T044 [US1] Implement SSE client in useStreamingChat.ts hook with EventSource or fetch
- [ ] T045 [US1] Add streaming state management (isStreaming, streamedContent) in useStreamingChat.ts
- [ ] T046 [US1] Implement chunk parsing logic for SSE format in useStreamingChat.ts
- [ ] T047 [US1] Add connection error handling and retry logic in useStreamingChat.ts
- [ ] T048 [US1] Implement pause/resume functionality in useStreamingChat.ts
- [ ] T049 [US1] Create StreamingMessage component in legalshield-web/src/components/chat/StreamingMessage.tsx
- [ ] T050 [US1] Add typing indicator animation in StreamingMessage.tsx
- [ ] T051 [US1] Implement incremental content display in StreamingMessage.tsx
- [ ] T052 [US1] Add streaming error UI with retry button in StreamingMessage.tsx
- [ ] T053 [US1] Integrate StreamingMessage into existing chat UI in legalshield-web
- [ ] T054 [US1] Test streaming flow end-to-end with real LLM call

---

## Phase 4: User Story 2 - Multi-layer Summarization (FR-003)

### Goal
Implement hierarchical summarization with 3 layers to reduce token usage by 60-70%.

### Independent Test Criteria
- Layer 1 summary triggers at 10 messages
- Layer 2 summary triggers at 50 messages
- Layer 3 summary triggers at 100 messages or weekly
- Summaries stored in conversation metadata
- Context building uses appropriate summary level
- Summary generation <3s (Level 1), <8s (Level 2)

### Tasks

- [ ] T055 [US2] Implement getMessages function in supabase/functions/shared/types.ts to fetch messages by conversation_id with limit
- [ ] T056 [US2] Implement summarizeConversation function in supabase/functions/summarize-conversation/index.ts
- [ ] T057 [US2] Add message limit logic based on summary level (10/50/1000) in summarize-conversation
- [ ] T058 [US2] Build summarization prompt with legal focus in summarize-conversation
- [ ] T059 [US2] Integrate Gemini 1.5 Flash for cheaper summarization in summarize-conversation
- [ ] T060 [US2] Implement summary storage logic to appropriate field (summary_level_1/2/3) in summarize-conversation
- [ ] T061 [US2] Add error handling and logging in summarize-conversation
- [ ] T062 [US2] Test summary generation with sample conversation
- [ ] T063 [US2] Implement summary trigger check in supabase/functions/save-message/index.ts
- [ ] T064 [US2] Add message count and token count tracking in save-message
- [ ] T065 [US2] Implement trigger logic: 10 messages → Level 1, 50 messages → Level 2 in save-message
- [ ] T066 [US2] Add token threshold trigger (>=4000 tokens → Level 2) in save-message
- [ ] T067 [US2] Implement fire-and-forget async call to summarize-conversation in save-message
- [ ] T068 [US2] Test summary triggers with sequential message saves
- [ ] T069 [US2] Implement buildContextWithSummary function in supabase/functions/legal-chat-stream/index.ts
- [ ] T070 [US2] Add conversation metadata fetch in buildContextWithSummary
- [ ] T071 [US2] Implement summary level selection logic based on message_count in buildContextWithSummary
- [ ] T072 [US2] Replace full history with summary + recent messages (last 3-5) in buildContextWithSummary
- [ ] T073 [US2] Add fallback to full history when no summary exists in buildContextWithSummary
- [ ] T074 [US2] Test context building with different summary levels
- [ ] T075 [US2] Implement Layer 3 user profile summary in summarize-conversation
- [ ] T076 [US2] Add user profile aggregation logic across all conversations in summarize-conversation
- [ ] T077 [US2] Implement weekly trigger for Layer 3 summary via scheduled job
- [ ] T078 [US2] Test end-to-end summarization flow with real conversation

---

## Phase 5: User Story 3 - Follow-up Suggestions (FR-002)

### Goal
Generate 3-4 context-aware follow-up questions after each AI response to increase engagement.

### Independent Test Criteria
- 3-4 suggestions generated after each response
- Suggestions are context-aware (topic, domain, intent)
- Suggestions display as clickable chips
- Clicking suggestion auto-fills and sends
- Suggestions generated in <2 seconds
- Suggestions cache hit for similar queries

### Tasks

- [ ] T079 [US3] Implement generateSuggestions function in supabase/functions/generate-suggestions/index.ts
- [ ] T080 [US3] Build suggestion generation prompt with context (last message, AI response, document context) in generate-suggestions
- [ ] T081 [US3] Integrate Gemini 1.5 Flash for suggestion generation in generate-suggestions
- [ ] T082 [US3] Parse suggestion response into array of strings in generate-suggestions
- [ ] T083 [US3] Add Vietnamese language requirement to prompt in generate-suggestions
- [ ] T084 [US3] Implement suggestion caching logic with message hash in generate-suggestions
- [ ] T085 [US3] Set 24-hour TTL for suggestion cache in generate-suggestions
- [ ] T086 [US3] Add error handling and fallback to default suggestions in generate-suggestions
- [ ] T087 [US3] Test suggestion generation with various conversation contexts
- [ ] T088 [US3] Call generateSuggestions after AI response completes in legal-chat-stream
- [ ] T089 [US3] Store suggestions in message.follow_up_suggestions field in save-message
- [ ] T090 [US3] Create FollowUpSuggestions component in legalshield-web/src/components/chat/FollowUpSuggestions.tsx
- [ ] T091 [US3] Add Framer Motion animations for suggestion chips in FollowUpSuggestions.tsx
- [ ] T092 [US3] Implement click handler to auto-fill and send suggestion in FollowUpSuggestions.tsx
- [ ] T093 [US3] Add conditional styling with clsx in FollowUpSuggestions.tsx
- [ ] T094 [US3] Integrate FollowUpSuggestions into chat UI below AI response
- [ ] T095 [US3] Track suggestion click rate via analytics in FollowUpSuggestions.tsx
- [ ] T096 [US3] Test suggestion flow end-to-end with real conversation

---

## Phase 6: User Story 4 - Conversation Management (FR-004)

### Goal
Enable users to save, organize, search, and switch between conversations.

### Independent Test Criteria
- Conversations persist to database
- Auto-save on every message
- Can create, rename, archive, delete, star conversations
- Can organize into folders
- Can search conversations by content/date
- Conversation list displays with metadata
- Conversations sync across devices
- Conversation switch <500ms

### Tasks

- [ ] T097 [US4] Review existing save-conversation edge function in stash and deploy to supabase/functions/save-conversation/index.ts
- [ ] T098 [US4] Implement createConversation function with default title (first 50 chars) in save-conversation
- [ ] T099 [US4] Implement updateConversation function for rename, archive, star, folder in save-conversation
- [ ] T100 [US4] Implement deleteConversation function with confirmation in save-conversation
- [ ] T097 [US4] Add RLS check for user ownership in save-conversation
- [ ] T101 [US4] Review existing get-conversations edge function in stash and deploy to supabase/functions/get-conversations/index.ts
- [ ] T102 [US4] Implement listConversations function with pagination in get-conversations
- [ ] T103 [US4] Add filter logic (all, starred, archived) in get-conversations
- [ ] T104 [US4] Implement search by title/content in get-conversations
- [ ] T105 [US4] Add folder filtering in get-conversations
- [ ] T106 [US4] Implement sorting by updated_at DESC in get-conversations
- [ ] T107 [US4] Review existing get-messages edge function in stash and deploy to supabase/functions/get-messages/index.ts
- [ ] T108 [US4] Implement loadMessages function with pagination in get-messages
- [ ] T109 [US4] Add conversation_id validation in get-messages
- [ ] T110 [US4] Implement auto-save logic in save-message to update conversation.updated_at
- [ ] T111 [US4] Add message_count increment in save-message
- [ ] T112 [US4] Add total_tokens increment in save-message
- [ ] T113 [US4] Review existing chatStore in stash and deploy to legalshield-web/src/store/chatStore.ts
- [ ] T114 [US4] Add currentConversationId state in chatStore
- [ ] T115 [US4] Add streaming state management in chatStore
- [ ] T116 [US4] Review existing conversationStore in stash and deploy to legalshield-web/src/store/conversationStore.ts
- [ ] T117 [US4] Implement conversations list state in conversationStore
- [ ] T118 [US4] Implement selected conversation state in conversationStore
- [ ] T119 [US4] Add filter state (all, starred, archived) in conversationStore
- [ ] T120 [US4] Add search query state in conversationStore
- [ ] T121 [US4] Implement fetchConversations action in conversationStore
- [ ] T122 [US4] Implement createConversation action in conversationStore
- [ ] T123 [US4] Implement updateConversation action in conversationStore
- [ ] T124 [US4] Implement deleteConversation action in conversationStore
- [ ] T125 [US4] Implement switchConversation action in conversationStore
- [ ] T126 [US4] Review existing ConversationSidebar in stash and deploy to legalshield-web/src/components/chat/ConversationSidebar.tsx
- [ ] T127 [US4] Implement conversation list rendering in ConversationSidebar.tsx
- [ ] T128 [US4] Add conversation preview (title, last message, count) in ConversationSidebar.tsx
- [ ] T129 [US4] Implement filter UI (tabs for all/starred/archived) in ConversationSidebar.tsx
- [ ] T130 [US4] Add search input in ConversationSidebar.tsx
- [ ] T131 [US4] Implement folder organization UI in ConversationSidebar.tsx
- [ ] T132 [US4] Add create new conversation button in ConversationSidebar.tsx
- [ ] T133 [US4] Implement conversation item click to switch in ConversationSidebar.tsx
- [ ] T134 [US4] Add star/archive/delete actions per conversation in ConversationSidebar.tsx
- [ ] T135 [US4] Integrate ConversationSidebar into main chat layout
- [ ] T136 [US4] Implement conversation title edit (rename) functionality
- [ ] T137 [US4] Test conversation CRUD operations end-to-end
- [ ] T138 [US4] Test conversation search and filtering
- [ ] T139 [US4] Test conversation switching performance

---

## Phase 7: User Story 5 - Comprehensive Fallback Mechanisms (FR-005)

### Goal
Implement chain-of-responsibility fallback for all external services to ensure 99.9% uptime.

### Independent Test Criteria
- LLM fallback chain works (Gemini 2.5 Flash → Gemini 1.5 Flash → Gemini 1.5 Pro → cache → default)
- Vector search fallback works (pgvector → keyword → recent docs)
- RAG fallback works (Exa → local docs → no citations)
- JINA reranking fallback works (JINA → keyword scoring → top 5)
- Embedding fallback works (OpenAI → Cohere → keyword)
- Cache fallback works (Redis → Supabase table → in-memory → no cache)
- All fallbacks log path taken
- All fallbacks have 5s timeout per level
- Fallback success rate >95%

### Tasks

- [ ] T140 [US5] Create withFallback utility function in supabase/functions/shared/fallback.ts
- [ ] T141 [US5] Implement sequential fallback logic with timeout in withFallback
- [ ] T142 [US5] Add error logging for each fallback attempt in withFallback
- [ ] T143 [US5] Add metadata tracking for which path was taken in withFallback
- [ ] T144 [US5] Test withFallback with simulated failures
- [ ] T145 [US5] Implement callLLMWithFallback in supabase/functions/shared/llm.ts
- [ ] T146 [US5] Add Gemini 2.5 Flash Lite as primary in callLLMWithFallback
- [ ] T147 [US5] Add Gemini 1.5 Flash as fallback 1 in callLLMWithFallback
- [ ] T148 [US5] Add Gemini 1.5 Pro as fallback 2 in callLLMWithFallback
- [ ] T149 [US5] Add getCachedResponse as fallback 3 in callLLMWithFallback
- [ ] T150 [US5] Add getDefaultResponse (legal disclaimer) as fallback 4 in callLLMWithFallback
- [ ] T151 [US5] Replace existing LLM calls with callLLMWithFallback in legal-chat-stream
- [ ] T152 [US5] Implement retrieveEvidenceWithFallback in supabase/functions/shared/rag.ts
- [ ] T153 [US5] Add Exa API search as primary in retrieveEvidenceWithFallback
- [ ] T154 [US5] Add local document search as fallback 1 in retrieveEvidenceWithFallback
- [ ] T155 [US5] Add empty array (no citations) as fallback 2 in retrieveEvidenceWithFallback
- [ ] T156 [US5] Replace existing evidence retrieval with retrieveEvidenceWithFallback in legal-chat-stream
- [ ] T157 [US5] Implement rerankWithFallback in supabase/functions/shared/rerank.ts
- [ ] T158 [US5] Add JINA API reranking as primary in rerankWithFallback
- [ ] T159 [US5] Add keyword matching scoring as fallback 1 in rerankWithFallback
- [ ] T160 [US5] Add top 5 candidates without reranking as fallback 2 in rerankWithFallback
- [ ] T161 [US5] Replace existing jinaRerank calls with rerankWithFallback in legal-chat-stream
- [ ] T162 [US5] Implement embedTextWithFallback in supabase/functions/shared/embeddings.ts
- [ ] T163 [US5] Add OpenAI embeddings as primary in embedTextWithFallback
- [ ] T164 [US5] Add Cohere embeddings as fallback 1 in embedTextWithFallback
- [ ] T165 [US5] Add skip embedding (keyword matching) as fallback 2 in embedTextWithFallback
- [ ] T166 [US5] Replace existing embedText calls with embedTextWithFallback in legal-chat-stream
- [ ] T167 [US5] Implement getCacheWithFallback in supabase/functions/shared/cache.ts
- [ ] T168 [US5] Add Redis cache as primary in getCacheWithFallback
- [ ] T169 [US5] Add Supabase cache table as fallback 1 in getCacheWithFallback
- [ ] T170 [US5] Add in-memory cache as fallback 2 in getCacheWithFallback
- [ ] T171 [US5] Add no cache (proceed without) as fallback 3 in getCacheWithFallback
- [ ] T172 [US5] Replace existing cache calls with getCacheWithFallback in legal-chat-stream
- [ ] T173 [US5] Add fallback path logging to response metadata in legal-chat-stream
- [ ] T174 [US5] Implement fallback rate tracking in analytics
- [ ] T175 [US5] Test each fallback chain individually
- [ ] T176 [US5] Test full fallback chain with multiple service failures
- [ ] T177 [US5] Verify fallback timeouts work correctly

---

## Phase 8: User Story 6 - Simple Chat Optimization (FR-006)

### Goal
Detect and cache simple greetings, acknowledgments, and confirmations to save 20-30% on low-value queries.

### Independent Test Criteria
- Simple greetings detected (xin chào, chào, hello, hi)
- Simple acknowledgments detected (cảm ơn, thanks, thank you)
- Simple confirmations detected (ok, được, vâng, yes)
- Cached responses returned in <50ms
- No LLM call for cached simple chats
- Cache TTL 30 days
- Cache hit rate >80% for simple patterns
- Supports Vietnamese and English

### Tasks

- [ ] T178 [US6] Define SIMPLE_PATTERNS regex array in supabase/functions/legal-chat-stream/index.ts
- [ ] T179 [US6] Add patterns for greetings: /^(xin chào|chào|hello|hi|hey)/i
- [ ] T180 [US6] Add patterns for acknowledgments: /^(cảm ơn|thanks|thank you|cảm ơn bạn)/i
- [ ] T181 [US6] Add patterns for confirmations: /^(ok|được|vâng|yes|yeah)/i
- [ ] T182 [US6] Add patterns for goodbyes: /^(tạm biệt|bye|goodbye)/i
- [ ] T183 [US6] Implement isSimpleChat function with pattern matching in legal-chat-stream
- [ ] T184 [US6] Define SIMPLE_RESPONSES object with Vietnamese responses in legal-chat-stream
- [ ] T185 [US6] Implement handleSimpleChat function to return appropriate response in legal-chat-stream
- [ ] T186 [US6] Add simple chat cache check at start of handler in legal-chat-stream
- [ ] T187 [US6] Implement cache key generation for simple chats (pattern-based)
- [ ] T188 [US6] Set 30-day TTL for simple chat cache in legal-chat-stream
- [ ] T189 [US6] Add simple_chat=true flag to response metadata in legal-chat-stream
- [ ] T190 [US6] Add cached=true flag to response metadata in legal-chat-stream
- [ ] T191 [US6] Skip LLM call when simple chat detected in legal-chat-stream
- [ ] T192 [US6] Implement cache hit/miss tracking in legal-chat-stream
- [ ] T193 [US6] Test simple chat detection with various inputs
- [ ] T194 [US6] Test simple chat cache hit/miss flow
- [ ] T195 [US6] Verify response time <50ms for cached simple chats
- [ ] T196 [US6] Test Vietnamese and English patterns

---

## Phase 9: User Story 7 - Cost Monitoring (FR-007)

### Goal
Track token usage and costs per user, conversation, and message with UI dashboard and alerts.

### Independent Test Criteria
- Token count tracked per message
- Total tokens tracked per conversation
- Total tokens tracked per user
- Cost calculated based on model pricing
- Token usage displayed in UI
- Cost breakdown by model shown
- Alerts trigger when approaching limits
- Usage reports exportable (CSV, JSON)

### Tasks

- [ ] T197 [US7] Implement token counting utility in supabase/functions/shared/tokens.ts
- [ ] T198 [US7] Use approximate token count (chars/4) for performance in tokens.ts
- [ ] T199 [US7] Track input tokens in legal-chat-stream and save to message
- [ ] T200 [US7] Track output tokens in legal-chat-stream and save to message
- [ ] T201 [US7] Update messages.token_count on message save in save-message
- [ ] T202 [US7] Update conversations.total_tokens on message save in save-message
- [ ] T203 [US7] Update user_legal_profile.total_tokens on message save in save-message
- [ ] T204 [US7] Define TOKEN_COSTS constant with model pricing in supabase/functions/shared/tokens.ts
- [ ] T205 [US7] Implement calculateCost function in tokens.ts
- [ ] T206 [US7] Add cost tracking to message metadata in save-message
- [ ] T207 [US7] Create analytics-summary edge function in supabase/functions/analytics-summary/index.ts
- [ ] T208 [US7] Implement getUserUsageStats function in analytics-summary
- [ ] T209 [US7] Implement getConversationUsageStats function in analytics-summary
- [ ] T210 [US7] Implement getDailyUsageStats function in analytics-summary
- [ ] T211 [US7] Add date range filtering in analytics-summary
- [ ] T212 [US7] Create CostDashboard component in legalshield-web/src/pages/CostDashboard.tsx
- [ ] T213 [US7] Implement token usage chart (daily/weekly/monthly) in CostDashboard.tsx
- [ ] T214 [US7] Implement cost breakdown by model in CostDashboard.tsx
- [ ] T215 [US7] Add cost per conversation display in CostDashboard.tsx
- [ ] T216 [US7] Implement alert system for approaching limits in CostDashboard.tsx
- [ ] T217 [US7] Add export functionality (CSV, JSON) in CostDashboard.tsx
- [ ] T218 [US7] Integrate CostDashboard into navigation
- [ ] T219 [US7] Test token tracking accuracy
- [ ] T220 [US7] Test cost calculation accuracy
- [ ] T221 [US7] Test alert triggers

---

## Phase 10: User Story 8 - Conversation Context Switching (FR-008)

### Goal
Allow users to attach/detach documents mid-conversation and switch between multiple documents.

### Independent Test Criteria
- Can attach document mid-conversation
- Can detach document mid-conversation
- Context indicator shows current document
- Can switch between documents in same conversation
- Separate chat threads per document
- Context preserved when switching conversations
- Quick switch between recent conversations

### Tasks

- [ ] T222 [US8] Add document_context field handling in legal-chat-stream
- [ ] T223 [US8] Implement attachDocument function in save-conversation
- [ ] T224 [US8] Implement detachDocument function in save-conversation
- [ ] T225 [US8] Store document metadata in messages.document_context in save-message
- [ ] T226 [US8] Create ContextIndicator component in legalshield-web/src/components/chat/ContextIndicator.tsx
- [ ] T227 [US8] Display current document name in ContextIndicator.tsx
- [ ] T228 [US8] Add detach button in ContextIndicator.tsx
- [ ] T229 [US8] Integrate ContextIndicator into chat UI
- [ ] T230 [US8] Implement document switcher UI in chat
- [ ] T231 [US8] Add document threading logic in chatStore
- [ ] T232 [US8] Test document attach/detach flow
- [ ] T233 [US8] Test context switching between documents

---

## Phase 11: Polish & Cross-cutting Concerns

### Goal
Finalize UI, add error boundaries, optimize performance, and prepare for production.

### Tasks

- [ ] T234 Add error boundaries to all major components in legalshield-web
- [ ] T235 Implement loading skeletons for conversation list in ConversationSidebar.tsx
- [ ] T236 Add empty state illustrations for no conversations
- [ ] T237 Implement toast notifications for errors and successes
- [ ] T238 Add keyboard shortcuts (Ctrl+K for search, Ctrl+N for new conversation)
- [ ] T239 Optimize bundle size with code splitting
- [ ] T240 Add service worker for offline support (optional)
- [ ] T241 Implement rate limiting for edge functions
- [ ] T242 Add request ID tracking for debugging
- [ ] T243 Implement structured logging across edge functions
- [ ] T244 Add performance monitoring (Sentry or similar)
- [ ] T245 Verify all environment variables are documented
- [ ] T246 Update README with new features
- [ ] T247 Add API documentation for new edge functions
- [ ] T248 Create user guide for new features

---

## Phase 12: Testing

### Unit Tests

- [ ] T249 Write unit tests for withFallback utility in supabase/functions/shared/fallback.test.ts
- [ ] T250 [P] Write unit tests for isSimpleChat in supabase/functions/legal-chat-stream.test.ts
- [ ] T251 [P] Write unit tests for summarizeConversation in supabase/functions/summarize-conversation.test.ts
- [ ] T252 [P] Write unit tests for generateSuggestions in supabase/functions/generate-suggestions.test.ts
- [ ] T253 [P] Write unit tests for chatStore in legalshield-web/src/store/chatStore.test.ts
- [ ] T254 [P] Write unit tests for conversationStore in legalshield-web/src/store/conversationStore.test.ts
- [ ] T255 [P] Write unit tests for useStreamingChat in legalshield-web/src/hooks/useStreamingChat.test.ts
- [ ] T256 [P] Write unit tests for useConversation in legalshield-web/src/hooks/useConversation.test.ts

### Integration Tests

- [ ] T257 Write integration test for full streaming flow in legalshield-web/tests/integration/streaming.test.ts
- [ ] T258 [P] Write integration test for summary generation and usage in legalshield-web/tests/integration/summarization.test.ts
- [ ] T259 [P] Write integration test for conversation CRUD operations in legalshield-web/tests/integration/conversations.test.ts
- [ ] T260 [P] Write integration test for fallback mechanisms in legalshield-web/tests/integration/fallbacks.test.ts
- [ ] T261 [P] Write integration test for simple chat caching in legalshield-web/tests/integration/simple-chat.test.ts

### E2E Tests

- [ ] T262 Write E2E test for create conversation, send message, receive stream in legalshield-web/tests/e2e/chat-flow.spec.ts
- [ ] T263 [P] Write E2E test for follow-up suggestion click and send in legalshield-web/tests/e2e/suggestions.spec.ts
- [ ] T264 [P] Write E2E test for summary trigger after 10 messages in legalshield-web/tests/e2e/summarization.spec.ts
- [ ] T265 [P] Write E2E test for fallback when primary service fails in legalshield-web/tests/e2e/fallbacks.spec.ts
- [ ] T266 [P] Write E2E test for simple chat cache hit in legalshield-web/tests/e2e/simple-chat.spec.ts

### Performance Tests

- [ ] T267 Measure streaming latency to first token (target <100ms)
- [ ] T268 Measure simple chat response time (target <50ms)
- [ ] T269 Measure summary generation time Level 1 (target <3s)
- [ ] T270 Measure summary generation time Level 2 (target <8s)
- [ ] T271 Measure conversation switch time (target <500ms)
- [ ] T272 Load test with 100 concurrent users
- [ ] T273 Validate token reduction (target 60-70%)

---

## Phase 13: Deployment

### Tasks

- [ ] T274 Review all database migrations and apply to staging
- [ ] T275 Deploy all edge functions to staging
- [ ] T276 Deploy frontend changes to staging
- [ ] T277 Run integration tests on staging
- [ ] T278 Monitor for errors in staging logs
- [ ] T279 Validate fallback mechanisms work in staging
- [ ] T280 Apply database migrations to production
- [ ] T281 Deploy edge functions to production
- [ ] T282 Deploy frontend changes to production
- [ ] T283 Verify production deployment
- [ ] T284 Monitor production metrics for 24 hours
- [ ] T285 Create rollback plan if needed

---

## Dependencies

### User Story Dependencies

```
Phase 1 (Setup)
  ↓
Phase 2 (Database & Infrastructure) [BLOCKS ALL]
  ↓
  ├─→ Phase 3 (US1: Streaming) [INDEPENDENT]
  ├─→ Phase 4 (US2: Summarization) [INDEPENDENT]
  ├─→ Phase 5 (US3: Follow-up) [DEPENDS ON US1]
  ├─→ Phase 6 (US4: Conversations) [INDEPENDENT]
  ├─→ Phase 7 (US5: Fallbacks) [INDEPENDENT]
  ├─→ Phase 8 (US6: Simple Chat) [INDEPENDENT]
  ├─→ Phase 9 (US7: Cost Monitoring) [DEPENDS ON US4]
  └─→ Phase 10 (US8: Context Switching) [DEPENDS ON US4]
  ↓
Phase 11 (Polish) [DEPENDS ON ALL US PHASES]
  ↓
Phase 12 (Testing) [DEPENDS ON ALL US PHASES]
  ↓
Phase 13 (Deployment) [DEPENDS ON ALL PHASES]
```

### Parallel Execution Opportunities

**Phase 2 (Database & Infrastructure)**:
- T007-T017 can run in parallel (table schema, indexes, RLS policies)
- T020-T031 can run in parallel (edge function scaffolding + frontend stores/hooks)

**Phase 3 (US1: Streaming)**:
- T044-T047 can run in parallel (client-side SSE hook)
- T049-T052 can run in parallel (UI components)

**Phase 4 (US2: Summarization)**:
- T055-T061 can run in parallel (summary generation logic)
- T069-T073 can run in parallel (context building logic)

**Phase 5 (US3: Follow-up)**:
- T090-T095 can run in parallel (UI components)

**Phase 6 (US4: Conversations)**:
- T097-T112 can run in parallel (edge functions)
- T113-T125 can run in parallel (stores)
- T126-T135 can run in parallel (UI components)

**Phase 7 (US5: Fallbacks)**:
- T145-T172 can run in parallel (individual fallback implementations)

**Phase 12 (Testing)**:
- T250-T256 can run in parallel (unit tests)
- T258-T261 can run in parallel (integration tests)
- T263-T266 can run in parallel (E2E tests)

---

## MVP Scope

**Recommended MVP**: Phase 1 + Phase 2 + Phase 3 (US1: Streaming) + Phase 7 (US5: Fallbacks)

**Rationale**:
- Streaming provides immediate UX improvement
- Fallbacks ensure reliability
- Foundation for all other features
- Can be delivered in ~5 days

**Post-MVP additions** (in priority order):
1. Phase 4 (US2: Summarization) - Cost reduction
2. Phase 6 (US4: Conversations) - User retention
3. Phase 5 (US3: Follow-up) - Engagement
4. Phase 8 (US6: Simple Chat) - Cost optimization
5. Phase 9 (US7: Cost Monitoring) - Visibility
6. Phase 10 (US8: Context Switching) - Advanced feature

---

## Task Summary

- **Total Tasks**: 285
- **Setup Tasks**: 5 (T001-T005)
- **Foundational Tasks**: 27 (T006-T032)
- **US1 (Streaming)**: 22 tasks (T033-T054)
- **US2 (Summarization)**: 24 tasks (T055-T078)
- **US3 (Follow-up)**: 18 tasks (T079-T096)
- **US4 (Conversations)**: 43 tasks (T097-T139)
- **US5 (Fallbacks)**: 38 tasks (T140-T177)
- **US6 (Simple Chat)**: 19 tasks (T178-T196)
- **US7 (Cost Monitoring)**: 25 tasks (T197-T221)
- **US8 (Context Switching)**: 12 tasks (T222-T233)
- **Polish**: 15 tasks (T234-T248)
- **Testing**: 25 tasks (T249-T273)
- **Deployment**: 12 tasks (T274-T285)

**Parallelizable Tasks**: ~40% (marked with [P])
