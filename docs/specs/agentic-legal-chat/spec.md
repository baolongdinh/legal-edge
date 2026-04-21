# Feature Specification: Agentic Legal Chat Optimization

## 1. Overview
Transform the current basic legal consultation chat into an intelligent, agentic legal assistant with streaming responses, multi-layer conversation summarization, conversation management, comprehensive fallback mechanisms, and cost optimization strategies.

## 2. Current State Analysis

### Existing Features
- Basic request-response legal consultation
- PDF/DOCX file upload for context
- RAG-powered legal citations
- Simple caching (semantic cache, exact cache)
- Basic error handling

### Identified Gaps
1. **No Streaming**: Request-response pattern causes poor UX
2. **No Follow-up Suggestions**: Users must manually think of next questions
3. **No Conversation Management**: Can't save, organize, or revisit past chats
4. **No Multi-layer Summarization**: Full context always sent, wasting tokens
5. **No User Profile Summary**: No long-term user preference/topic tracking
6. **Limited Fallback**: Tool failures can break the entire flow
7. **No Simple Chat Optimization**: Greetings, thank you messages consume tokens unnecessarily
8. **No Conversation History**: Can't switch between different legal topics
9. **No Cost Monitoring**: No visibility into token usage and costs

## 3. Business Value & Goals
- **Improved UX**: Streaming reduces perceived latency by 60-80%
- **Higher Engagement**: Follow-up suggestions increase session length by 3-5x
- **Cost Reduction**: Multi-layer summarization reduces token usage by 60-70%
- **Better Retention**: Conversation history creates a legal knowledge base
- **Reliability**: Comprehensive fallback ensures 99.9% uptime
- **Efficiency**: Simple chat caching saves 20-30% on low-value queries

## 4. Functional Requirements

### FR-001: Streaming Chat Response
- Implement Server-Sent Events (SSE) for real-time response streaming
- Stream AI responses word-by-word or token-by-token
- Display typing indicator while streaming
- Support pause/resume streaming
- Handle connection interruptions gracefully
- Maintain streaming across network fluctuations
- Show citation markers inline during streaming
- Finalize citations after stream completes

### FR-002: Intelligent Follow-up Suggestions
- Generate 3-4 relevant follow-up questions after each AI response
- Suggestions must be context-aware based on:
  - Current conversation topic
  - Legal domain (contract, labor, property, etc.)
  - User's question intent
  - Document context (if attached)
- Display suggestions as clickable chips below AI response
- Clicking a suggestion auto-fills input and sends to LLM
- Allow users to type their own questions (suggestions are optional)
- Track suggestion click rates for optimization
- Cache suggestions for similar queries

### FR-003: Multi-layer Conversation Summarization
Implement hierarchical summarization with 3 layers:

**Layer 1 (Conversation Summary)**:
- Trigger: Every 10 messages OR when context exceeds 4000 tokens
- Scope: Last 10 messages → compressed to ~500 tokens
- Content: Main topics, key questions/answers, pending issues
- Storage: In conversation metadata

**Layer 2 (Session Summary)**:
- Trigger: Every 50 messages OR when context exceeds 8000 tokens
- Scope: Last 50 messages → compressed to ~1000 tokens
- Content: Detailed topics, legal conclusions, document references
- Storage: In conversation metadata

**Layer 3 (User Profile Summary)**:
- Trigger: Every 100 messages across all conversations OR weekly
- Scope: All user conversations → compressed to ~2000 tokens
- Content: User's legal interests, frequent topics, preferences
- Storage: In user profile metadata

**Summary Usage Strategy**:
- Always keep last 3-5 messages in full (no summarization)
- Attach appropriate summary level as system context before recent messages
- Use cheaper/faster model (Gemini 1.5 Flash) for summarization
- Cache summaries to avoid re-generation

### FR-004: Conversation Management
- Save conversations to database (not just localStorage)
- Auto-save every message with timestamp
- Allow users to:
  - Create new conversations
  - Rename conversations (default: first 50 chars of first message)
  - Archive conversations
  - Delete conversations with confirmation
  - Star/favorite conversations
  - Search conversations by content or date
- Organize conversations into folders/tags (e.g., "Labor Law", "Contracts", "Property")
- Sync conversations across devices (via Supabase auth)
- Display conversation list with:
  - Title
  - Last message preview
  - Message count
  - Summary badge (if summarized)
  - Star indicator
  - Updated timestamp

### FR-005: Comprehensive Fallback Mechanisms
All tool calls must have fallback logic:

**LLM API Fallback**:
- Primary: Gemini 2.5 Flash Lite
- Fallback 1: Gemini 1.5 Flash
- Fallback 2: Gemini 1.5 Pro
- Fallback 3: Cached response if available
- Fallback 4: Predefined legal disclaimer

**Vector Search Fallback**:
- Primary: pgvector similarity search
- Fallback 1: Keyword search using full-text search
- Fallback 2: Return recent documents without ranking

**RAG Fallback**:
- Primary: Exa API for web search
- Fallback 1: Local document chunks only
- Fallback 2: No citations, answer from LLM knowledge

**JINA Reranking Fallback**:
- Primary: JINA API reranking
- Fallback 1: Simple keyword matching scoring
- Fallback 2: Return top 5 candidates without reranking

**Embedding Fallback**:
- Primary: OpenAI embeddings
- Fallback 1: Cohere embeddings
- Fallback 2: Skip embedding, use keyword matching

**Cache Fallback**:
- Primary: Redis cache
- Fallback 1: Supabase cache table
- Fallback 2: In-memory cache (edge function)
- Fallback 3: No cache, proceed without

Each fallback must:
- Log the failure and fallback action
- Add metadata to response indicating which path was used
- Not break the entire flow
- Have timeout (max 5 seconds per fallback level)

### FR-006: Simple Chat Optimization
- Detect simple greetings: "xin chào", "chào", "hello", "hi"
- Detect simple acknowledgments: "cảm ơn", "thanks", "thank you"
- Detect simple confirmations: "ok", "được", "vâng", "yes"
- Cache these simple responses permanently (TTL: 30 days)
- Return cached response instantly (<50ms)
- No LLM call for cached simple chats
- Track cache hit rate for monitoring
- Support Vietnamese and English

### FR-007: Cost Monitoring & Optimization
- Track token usage per:
  - User (daily/monthly)
  - Conversation (total)
  - Message (individual)
- Display cost estimates in UI
- Alert users when approaching limits
- Implement automatic cost optimization:
  - Use cheaper models for non-critical queries
  - Reduce summary frequency for cost-conscious users
  - Suggest using document upload instead of web search
- Provide cost breakdown in user dashboard
- Export usage reports (CSV, JSON)

### FR-008: Conversation Context Switching
- Allow users to attach/detach documents mid-conversation
- Show current context indicator (e.g., "Analyzing: contract.pdf")
- Allow switching between multiple documents in same conversation
- Maintain separate chat threads per document
- Merge conversations when documents are related
- Preserve context when switching conversations
- Quick switch between recent conversations

## 5. Non-Functional Requirements

### Performance
- Streaming latency: <100ms to first token
- Follow-up suggestions: <2 seconds
- Simple chat cache: <50ms response
- Conversation switch: <500ms
- Summary generation: 
  - Layer 1: <3 seconds
  - Layer 2: <8 seconds
  - Layer 3: <15 seconds

### Scalability
- Support 1000+ concurrent users
- Handle 10000+ messages/hour
- Pagination for conversation list (50 per page)
- Horizontal scaling for edge functions

### Reliability
- 99.9% uptime for chat functionality
- All critical paths have fallback
- Graceful degradation when services fail
- No single point of failure

### Security
- Encrypt conversation content at rest
- Implement RLS for conversation access
- Rate limit API calls (per user)
- Sanitize file content before parsing
- Validate file types on both client and server

### Cost Efficiency
- Target: 60-70% token reduction via summarization
- Target: 20-30% savings via simple chat caching
- Target: 40-50% cost reduction via model optimization
- Monthly cost monitoring and alerts

## 6. Technical Architecture

### Database Schema (New Tables)

```sql
-- Conversations
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_archived BOOLEAN DEFAULT FALSE,
  is_starred BOOLEAN DEFAULT FALSE,
  folder TEXT,
  summary_level_1 TEXT,
  summary_level_2 TEXT,
  summary_level_3 TEXT,
  summary_last_updated TIMESTAMPTZ,
  message_count INT DEFAULT 0,
  total_tokens INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  citations JSONB,
  follow_up_suggestions TEXT[],
  document_context JSONB,
  token_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Profile (for Layer 3 summary)
CREATE TABLE user_legal_profile (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_summary TEXT,
  frequent_topics TEXT[],
  preferences JSONB,
  total_conversations INT DEFAULT 0,
  total_tokens INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Edge Functions

1. **legal-chat-stream**: Streaming chat with SSE
2. **save-conversation**: Create/update conversation
3. **save-message**: Append message to conversation
4. **summarize-conversation**: Generate multi-layer summaries
5. **generate-suggestions**: Generate follow-up questions
6. **get-conversations**: List user conversations
7. **get-messages**: Load conversation messages
8. **analytics-summary**: Get usage statistics

### Client-Side Enhancements

1. **SSE Client**: For streaming responses
2. **React Query**: For conversation sync
3. **Zustand**: For chat state management
4. **Framer Motion**: For suggestion animations
5. **IndexedDB**: For offline conversation cache

### Fallback Architecture

```
Primary Service
  ↓ (fail with timeout)
Fallback Service 1
  ↓ (fail with timeout)
Fallback Service 2
  ↓ (fail with timeout)
Default/Cached Response
```

## 7. Dependencies & Assumptions

### External Services
- **Gemini API**: For LLM (multiple models)
- **Exa API**: For web search
- **JINA API**: For reranking
- **Redis/Upstash**: For caching
- **Supabase**: For database and auth

### Assumptions
- Users have modern browsers supporting SSE
- Mobile users have stable internet for streaming
- Simple chat patterns are consistent across users
- Fallback services are available when needed
- Cost optimization doesn't significantly impact quality

## 8. Implementation Phases

### Phase 1: Streaming Infrastructure (Week 1)
- SSE edge function implementation
- Client-side SSE client
- Streaming UI components
- Error handling for streaming

### Phase 2: Conversation Management (Week 2)
- Database schema migrations
- Conversation CRUD operations
- Conversation list UI
- Search and filtering

### Phase 3: Multi-layer Summarization (Week 3-4)
- Summary generation logic
- Layer 1 implementation
- Layer 2 implementation
- Layer 3 implementation
- Summary context building

### Phase 4: Follow-up Suggestions (Week 4)
- Suggestion generation logic
- Suggestion UI components
- Click-to-send functionality
- Suggestion caching

### Phase 5: Comprehensive Fallback (Week 5)
- Fallback architecture design
- Implement fallback for each service
- Fallback logging and monitoring
- Fallback testing

### Phase 6: Simple Chat Optimization (Week 5)
- Simple chat detection logic
- Simple chat cache implementation
- Cache hit/miss tracking
- Performance monitoring

### Phase 7: Cost Monitoring (Week 6)
- Token usage tracking
- Cost calculation
- UI for cost display
- Alerting system

### Phase 8: Testing & Polish (Week 6-7)
- E2E testing
- Performance testing
- Fallback testing
- Cost validation
- User acceptance testing

## 9. Out of Scope
- Real-time video consultation
- Multi-user collaboration on conversations
- Voice commands (beyond basic speech-to-text)
- Integration with external legal databases (beyond current RAG)
- AI-powered contract negotiation
- Legal document generation (separate feature)

## 10. Success Criteria

### Performance Metrics
- **Streaming**: First token latency <100ms
- **Simple Chat**: Cache hit rate >80%, response <50ms
- **Token Reduction**: 60-70% reduction via summarization
- **Cost Reduction**: 40-50% overall cost reduction

### Engagement Metrics
- **Session Length**: Increase by 50% due to follow-up suggestions
- **Conversation Saves**: 50% of users save at least one conversation
- **Suggestion Usage**: 60% of users click follow-up suggestions

### Reliability Metrics
- **Uptime**: 99.9% for chat functionality
- **Fallback Success Rate**: 95% of failures handled gracefully
- **Error Rate**: <0.1% user-facing errors

### User Satisfaction
- **CSAT Score**: >4.5/5
- **Task Completion**: >90% of legal queries resolved
- **User Retention**: 7-day return rate increases by 30%
