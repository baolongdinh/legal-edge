# Implementation Plan: Agentic Legal Chat Optimization

## Overview
This plan outlines the technical implementation of the agentic legal chat optimization feature, transforming the current basic chat into an intelligent, streaming, multi-layer summarized legal assistant with comprehensive fallback mechanisms.

## Technical Context

### Current Architecture
- **Frontend**: React + Vite (legalshield-web)
- **Backend**: Supabase Edge Functions (Deno)
- **Database**: PostgreSQL with pgvector
- **LLM**: Gemini 2.5 Flash Lite
- **Caching**: Redis (Upstash)
- **Search**: Exa API (web), pgvector (local)

### Technology Decisions
- **Streaming**: Server-Sent Events (SSE) via Edge Function
- **State Management**: Zustand (client) + React Query (server)
- **Summarization**: Gemini 1.5 Flash (cheaper/faster)
- **Fallback Pattern**: Chain-of-responsibility with timeout
- **Simple Chat Cache**: Redis with 30-day TTL

### Dependencies
- **New**: Framer Motion (animations), clsx (conditional classes)
- **Existing**: Supabase JS, Zustand, React Query
- **External**: Gemini API, Exa API, JINA API, Upstash Redis

### Integration Points
- **Supabase Auth**: User authentication for conversations
- **Supabase Storage**: File uploads for documents
- **Supabase Realtime**: Real-time conversation sync
- **Edge Functions**: All business logic on serverless

## Constitution Check

### Code Quality
- ✅ TypeScript strict mode enabled
- ✅ ESLint configuration maintained
- ✅ Follow existing code patterns
- ✅ Comprehensive error handling

### Security
- ✅ RLS policies for all new tables
- ✅ Input validation on client and server
- ✅ Rate limiting for API calls
- ✅ No sensitive data in logs

### Performance
- ✅ Streaming reduces perceived latency
- ✅ Multi-layer summarization reduces token usage
- ✅ Simple chat caching reduces LLM calls
- ✅ Fallback mechanisms prevent downtime

### Cost
- ✅ Use cheaper models for summarization
- ✅ Cache aggressively to reduce API calls
- ✅ Monitor token usage per user
- ✅ Alert on cost thresholds

**Gate Result**: ✅ PASSED - No constitution violations

## Phase 0: Research & Setup

### Research Tasks

**Task 1: SSE Implementation Patterns**
- Research SSE best practices for Deno edge functions
- Evaluate client-side SSE libraries for React
- Decision: Use native EventSource API (no additional dependency)
- Rationale: Native API is well-supported, lightweight

**Task 2: Multi-layer Summarization Strategies**
- Research conversation summarization techniques
- Evaluate token counting accuracy across models
- Decision: Use approximate token count (chars/4)
- Rationale: Accurate token counting requires API call, adds latency

**Task 3: Fallback Architecture Patterns**
- Research circuit breaker patterns
- Evaluate timeout strategies for multiple fallbacks
- Decision: Sequential fallback with 5s timeout per level
- Rationale: Simple to implement, predictable behavior

**Task 4: Simple Chat Detection**
- Research Vietnamese greeting patterns
- Evaluate regex vs NLP for detection
- Decision: Regex pattern matching
- Rationale: Fast, accurate for fixed phrases, no ML overhead

### Setup Tasks
- Create branch: `optimize/chat-response` ✅ (already done)
- Install dependencies: framer-motion, clsx
- Set up environment variables for new services

**Output**: research.md (completed inline)

## Phase 1: Database & Infrastructure

### 1.1 Database Migration
**File**: `supabase/migrations/20260421000001_agentic_chat_tables.sql`

**Tables to create**:
```sql
-- Conversations table
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

-- Messages table
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  citations JSONB DEFAULT '[]'::jsonb,
  follow_up_suggestions TEXT[] DEFAULT '{}',
  document_context JSONB DEFAULT '{}'::jsonb,
  token_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User legal profile table
CREATE TABLE user_legal_profile (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_summary TEXT,
  frequent_topics TEXT[] DEFAULT '{}',
  preferences JSONB DEFAULT '{}'::jsonb,
  total_conversations INT DEFAULT 0,
  total_tokens INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Indexes**:
```sql
CREATE INDEX idx_conversations_user_updated ON conversations(user_id, updated_at DESC);
CREATE INDEX idx_conversations_folder ON conversations(user_id, folder) WHERE folder IS NOT NULL;
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
```

**RLS Policies**:
- Users can CRUD own conversations
- Users can CRUD messages in own conversations
- Users can update own profile

**Estimated Time**: 2 hours

### 1.2 Edge Function Setup
**Files to create**:
- `supabase/functions/legal-chat-stream/index.ts` - Streaming endpoint
- `supabase/functions/save-conversation/index.ts` - Conversation CRUD
- `supabase/functions/save-message/index.ts` - Message persistence
- `supabase/functions/summarize-conversation/index.ts` - Summarization
- `supabase/functions/generate-suggestions/index.ts` - Follow-up questions
- `supabase/functions/get-conversations/index.ts` - List conversations
- `supabase/functions/get-messages/index.ts` - Load messages

**Estimated Time**: 8 hours (1 hour per function)

### 1.3 Client-side Setup
**Files to create**:
- `legalshield-web/src/store/chatStore.ts` - Zustand store for chat
- `legalshield-web/src/store/conversationStore.ts` - Conversation state
- `legalshield-web/src/lib/conversation-api.ts` - API client
- `legalshield-web/src/hooks/useStreamingChat.ts` - SSE hook
- `legalshield-web/src/hooks/useConversation.ts` - Conversation hook

**Dependencies to install**:
```bash
cd legalshield-web
npm install framer-motion clsx
npm install @tanstack/react-query
```

**Estimated Time**: 4 hours

## Phase 2: Streaming Implementation

### 2.1 SSE Edge Function
**File**: `supabase/functions/legal-chat-stream/index.ts`

**Implementation**:
```typescript
export const handler = async (req: Request): Promise<Response> => {
  // 1. Authenticate request
  // 2. Parse message, history, conversation_id
  // 3. Build context with summarization
  // 4. Call LLM with streaming
  // 5. Stream chunks via SSE
  // 6. Handle errors and fallbacks
}

// SSE format
const stream = new ReadableStream({
  async start(controller) {
    const encoder = new TextEncoder()
    // Stream chunks
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({type: 'chunk', content: text})}\n\n`))
    // Final payload
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({type: 'done', payload})}\n\n`))
  }
})
```

**Estimated Time**: 4 hours

### 2.2 Client-side SSE Hook
**File**: `legalshield-web/src/hooks/useStreamingChat.ts`

**Implementation**:
```typescript
export function useStreamingChat() {
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamedContent, setStreamedContent] = useState('')
  
  const streamChat = async (message, history, conversationId) => {
    const response = await fetch('/functions/v1/legal-chat-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history, conversation_id })
    })
    
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      const chunk = decoder.decode(value)
      // Parse SSE format
      const lines = chunk.split('\n')
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6))
          if (data.type === 'chunk') {
            setStreamedContent(prev => prev + data.content)
          }
        }
      }
    }
  }
}
```

**Estimated Time**: 3 hours

### 2.3 Streaming UI Component
**File**: `legalshield-web/src/components/chat/StreamingMessage.tsx`

**Features**:
- Typing indicator while streaming
- Display streamed content incrementally
- Handle streaming errors
- Show citation markers inline

**Estimated Time**: 2 hours

## Phase 3: Multi-layer Summarization

### 3.1 Summary Generation Logic
**File**: `supabase/functions/summarize-conversation/index.ts`

**Implementation**:
```typescript
export async function summarizeConversation(conversationId: string, level: 1 | 2 | 3) {
  // Fetch messages based on level
  const messageLimit = level === 1 ? 10 : level === 2 ? 50 : 1000
  const messages = await getMessages(conversationId, messageLimit)
  
  // Build summarization prompt
  const prompt = `Summarize this legal consultation conversation:
  - Focus on main legal topics
  - Include key questions and answers
  - Note important conclusions
  - List unresolved issues
  
  Target: ${level === 1 ? '500 tokens' : level === 2 ? '1000 tokens' : '2000 tokens'}
  
  Conversation: ${messagesText}`
  
  // Use cheaper model for summarization
  const summary = await callGeminiFlash(prompt)
  
  // Store in appropriate field
  const field = level === 1 ? 'summary_level_1' : level === 2 ? 'summary_level_2' : 'summary_level_3'
  await updateConversation(conversationId, { [field]: summary })
}
```

**Estimated Time**: 4 hours

### 3.2 Summary Trigger Logic
**File**: `supabase/functions/save-message/index.ts`

**Implementation**:
```typescript
// After saving message, check if summary needed
const messageCount = conversation.message_count + 1
const totalTokens = conversation.total_tokens + tokenCount

let needsSummary = false
let summaryLevel = 1

if (messageCount >= 50) {
  needsSummary = true
  summaryLevel = 2
} else if (messageCount >= 10) {
  needsSummary = true
  summaryLevel = 1
}

if (totalTokens >= 4000) {
  needsSummary = true
  summaryLevel = 2
}

if (needsSummary) {
  // Fire-and-forget: don't await
  summarizeConversation(conversationId, summaryLevel)
}
```

**Estimated Time**: 2 hours

### 3.3 Context Building with Summary
**File**: `supabase/functions/legal-chat-stream/index.ts`

**Implementation**:
```typescript
async function buildContextWithSummary(history, conversationId) {
  const conv = await getConversation(conversationId)
  
  let summaryLevel = 1
  let summaryText = conv.summary_level_1
  
  if (conv.message_count >= 50) {
    summaryLevel = 2
    summaryText = conv.summary_level_2
  } else if (conv.message_count >= 100) {
    summaryLevel = 3
    summaryText = conv.summary_level_3
  }
  
  if (!summaryText) {
    return history // No summary, use full history
  }
  
  const recentMessages = history.slice(-5)
  const summaryMessage = {
    role: 'system',
    content: `Summary of previous conversation:\n${summaryText}\n\nRecent messages:`
  }
  
  return [summaryMessage, ...recentMessages]
}
```

**Estimated Time**: 2 hours

## Phase 4: Follow-up Suggestions

### 4.1 Suggestion Generation
**File**: `supabase/functions/generate-suggestions/index.ts`

**Implementation**:
```typescript
export async function generateSuggestions(lastMessage, aiResponse, documentContext) {
  const prompt = `Based on this legal consultation, generate 3-4 relevant follow-up questions:
  
  Last user question: ${lastMessage}
  AI response: ${aiResponse}
  Document context: ${documentContext || 'None'}
  
  Requirements:
  - Questions should encourage deeper exploration
  - Questions should be context-aware
  - Questions should be in Vietnamese
  - Maximum 3-4 questions
  
  Suggestions:`
  
  const response = await callGeminiFlash(prompt)
  const suggestions = parseSuggestions(response)
  
  return suggestions
}
```

**Estimated Time**: 3 hours

### 4.2 Suggestion UI Component
**File**: `legalshield-web/src/components/chat/FollowUpSuggestions.tsx`

**Features**:
- Display suggestions as clickable chips
- Smooth animations (Framer Motion)
- Click to auto-fill and send
- Optional (user can type own question)

**Estimated Time**: 2 hours

### 4.3 Suggestion Caching
**Implementation**:
- Cache suggestions by message hash
- TTL: 24 hours
- Cache key: `suggestions:${hash(message + response)}`

**Estimated Time**: 1 hour

## Phase 5: Conversation Management

### 5.1 Conversation CRUD Edge Functions
**Files**:
- `supabase/functions/save-conversation/index.ts` ✅ (already in stash)
- `supabase/functions/get-conversations/index.ts` ✅ (already in stash)

**Estimated Time**: 2 hours (review and deploy)

### 5.2 Conversation Sidebar UI
**File**: `legalshield-web/src/components/chat/ConversationSidebar.tsx` ✅ (already in stash)

**Features**:
- List conversations with preview
- Filter (all, starred, archived)
- Search by title/content
- Folder organization
- Create new conversation

**Estimated Time**: 2 hours (review and deploy)

### 5.3 State Management
**Files**:
- `legalshield-web/src/store/chatStore.ts` ✅ (already in stash)
- `legalshield-web/src/store/conversationStore.ts` ✅ (already in stash)

**Estimated Time**: 1 hour (review and deploy)

## Phase 6: Comprehensive Fallbacks

### 6.1 Fallback Architecture
**Pattern**: Chain-of-responsibility with timeout

**Implementation**:
```typescript
async function withFallback<T>(
  primary: () => Promise<T>,
  fallbacks: Array<() => Promise<T>>,
  timeoutMs = 5000
): Promise<T> {
  let lastError: Error | null = null
  
  for (const fn of [primary, ...fallbacks]) {
    try {
      const result = await Promise.race([
        fn(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), timeoutMs)
        )
      ])
      return result
    } catch (error) {
      lastError = error as Error
      console.warn('Fallback failed:', error)
    }
  }
  
  throw lastError || new Error('All fallbacks failed')
}
```

**Estimated Time**: 3 hours

### 6.2 Implement Fallbacks for Each Service

**LLM Fallback**:
```typescript
async function callLLMWithFallback(prompt) {
  return withFallback(
    () => callGeminiFlashLite(prompt),
    [
      () => callGeminiFlash(prompt),
      () => callGeminiPro(prompt),
      () => getCachedResponse(prompt),
      () => getDefaultResponse()
    ]
  )
}
```

**RAG Fallback**:
```typescript
async function retrieveEvidenceWithFallback(query) {
  return withFallback(
    () => searchExa(query),
    [
      () => searchLocalDocuments(query),
      () => [] // No citations
    ]
  )
}
```

**JINA Fallback**:
```typescript
async function rerankWithFallback(query, candidates) {
  return withFallback(
    () => jinaRerank(query, candidates),
    [
      () => keywordScoring(query, candidates),
      () => candidates.slice(0, 5)
    ]
  )
}
```

**Estimated Time**: 4 hours

### 6.3 Fallback Logging
**Implementation**:
- Log which path was taken
- Add metadata to response
- Track fallback rates for monitoring

**Estimated Time**: 2 hours

## Phase 7: Simple Chat Optimization

### 7.1 Simple Chat Detection
**File**: `supabase/functions/legal-chat-stream/index.ts`

**Implementation**:
```typescript
const SIMPLE_PATTERNS = [
  /^(xin chào|chào|hello|hi|hey)/i,
  /^(cảm ơn|thanks|thank you|cảm ơn bạn)/i,
  /^(ok|được|vâng|yes|yeah)/i,
  /^(tạm biệt|bye|goodbye)/i
]

function isSimpleChat(message: string): boolean {
  return SIMPLE_PATTERNS.some(pattern => pattern.test(message.trim()))
}
```

**Estimated Time**: 1 hour

### 7.2 Simple Chat Cache
**Implementation**:
```typescript
const SIMPLE_RESPONSES = {
  greeting: "Xin chào! Tôi có thể giúp gì cho bạn về pháp luật hôm nay?",
  thanks: "Rất vui được giúp đỡ! Nếu bạn có câu hỏi khác, hãy cứ hỏi nhé.",
  ok: "Được rồi! Bạn có cần tôi giải thích thêm điều gì không?",
  bye: "Tạm biệt! Chúc bạn một ngày tốt lành!"
}

async function handleSimpleChat(message: string): Promise<string | null> {
  if (/^(xin chào|chào)/i.test(message)) {
    return SIMPLE_RESPONSES.greeting
  }
  if (/^(cảm ơn|thanks)/i.test(message)) {
    return SIMPLE_RESPONSES.thanks
  }
  // ... other patterns
  
  return null // Not a simple chat
}
```

**Estimated Time**: 2 hours

### 7.3 Cache Integration
**Implementation**:
```typescript
// In legal-chat-stream handler
const simpleResponse = await handleSimpleChat(message)
if (simpleResponse) {
  return jsonResponse({ 
    reply: simpleResponse, 
    simple_chat: true,
    cached: true 
  })
}
```

**Estimated Time**: 1 hour

## Phase 8: Cost Monitoring

### 8.1 Token Tracking
**Implementation**:
- Track tokens per message in `messages.token_count`
- Track total tokens in `conversations.total_tokens`
- Track user tokens in `user_legal_profile.total_tokens`

**Estimated Time**: 2 hours

### 8.2 Cost Calculation
**Implementation**:
```typescript
const TOKEN_COSTS = {
  'gemini-2.5-flash-lite': 0.000001, // per token
  'gemini-1.5-flash': 0.000002,
  'gemini-1.5-pro': 0.00001
}

function calculateCost(tokens: number, model: string): number {
  return tokens * (TOKEN_COSTS[model] || 0.000001)
}
```

**Estimated Time**: 1 hour

### 8.3 Cost Dashboard UI
**File**: `legalshield-web/src/pages/CostDashboard.tsx`

**Features**:
- Display token usage per day/week/month
- Show cost breakdown by model
- Alert on approaching limits
- Export usage reports

**Estimated Time**: 4 hours

## Phase 9: Testing & Deployment

### 9.1 Unit Tests
**Files to test**:
- Edge functions: All new functions
- Client hooks: useStreamingChat, useConversation
- Stores: chatStore, conversationStore
- Utilities: fallback logic, simple chat detection

**Estimated Time**: 8 hours

### 9.2 Integration Tests
**Scenarios**:
- Full streaming flow
- Summary generation and usage
- Conversation CRUD operations
- Fallback mechanisms
- Simple chat caching

**Estimated Time**: 6 hours

### 9.3 E2E Tests
**Scenarios**:
- Create conversation, send message, receive stream
- Follow-up suggestion click and send
- Summary trigger after 10 messages
- Fallback when primary service fails
- Simple chat cache hit

**Estimated Time**: 4 hours

### 9.4 Performance Testing
**Metrics to validate**:
- Streaming latency <100ms to first token
- Simple chat response <50ms
- Summary generation <3s (Level 1), <8s (Level 2)
- Conversation switch <500ms

**Estimated Time**: 4 hours

### 9.5 Deployment
**Steps**:
1. Deploy database migrations
2. Deploy edge functions
3. Deploy frontend changes
4. Monitor for errors
5. Validate fallback mechanisms

**Estimated Time**: 2 hours

## Timeline Summary

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 0: Research | 1 day | None |
| Phase 1: Database & Infrastructure | 2 days | Phase 0 |
| Phase 2: Streaming | 2 days | Phase 1 |
| Phase 3: Multi-layer Summarization | 2 days | Phase 1 |
| Phase 4: Follow-up Suggestions | 1 day | Phase 2 |
| Phase 5: Conversation Management | 1 day | Phase 1 |
| Phase 6: Comprehensive Fallbacks | 2 days | Phase 1 |
| Phase 7: Simple Chat Optimization | 1 day | Phase 1 |
| Phase 8: Cost Monitoring | 1 day | Phase 1 |
| Phase 9: Testing & Deployment | 3 days | All phases |
| **Total** | **16 days (~3.2 weeks)** | |

## Notes

- Some components already exist in stash (conversation management) - can reuse
- Prioritize streaming and fallbacks for immediate value
- Summarization can be deployed incrementally
- Cost monitoring is nice-to-have, can be deferred
- All fallbacks must be tested thoroughly before production
