# Data Model: Agentic Legal Chat Optimization

## Entities

### Conversation
Represents a legal consultation conversation between a user and the AI.

**Fields**:
- `id` (UUID, PK) - Unique identifier
- `user_id` (UUID, FK) - Owner of the conversation
- `title` (TEXT, NOT NULL) - Conversation title (default: first 50 chars of first message)
- `is_archived` (BOOLEAN, DEFAULT FALSE) - Whether conversation is archived
- `is_starred` (BOOLEAN, DEFAULT FALSE) - Whether conversation is starred/favorited
- `folder` (TEXT, NULLABLE) - Folder/category for organization (e.g., "Labor Law", "Contracts")
- `summary_level_1` (TEXT, NULLABLE) - Summary of last 10 messages (~500 tokens)
- `summary_level_2` (TEXT, NULLABLE) - Summary of last 50 messages (~1000 tokens)
- `summary_level_3` (TEXT, NULLABLE) - Summary of entire conversation (~2000 tokens)
- `summary_last_updated` (TIMESTAMPTZ, NULLABLE) - When summary was last generated
- `message_count` (INT, DEFAULT 0) - Total number of messages
- `total_tokens` (INT, DEFAULT 0) - Total tokens consumed
- `created_at` (TIMESTAMPTZ, DEFAULT NOW) - Creation timestamp
- `updated_at` (TIMESTAMPTZ, DEFAULT NOW) - Last update timestamp

**Relationships**:
- One-to-many with Messages
- Many-to-one with User (via user_id)

**Validation Rules**:
- `title` cannot be empty
- `message_count` >= 0
- `total_tokens` >= 0
- `summary_level_1` only set when message_count >= 10
- `summary_level_2` only set when message_count >= 50
- `summary_level_3` only set when message_count >= 100

**State Transitions**:
- `is_archived`: FALSE → TRUE (archive) → FALSE (unarchive)
- `is_starred`: FALSE → TRUE (star) → FALSE (unstar)

---

### Message
Represents a single message in a conversation.

**Fields**:
- `id` (UUID, PK) - Unique identifier
- `conversation_id` (UUID, FK) - Parent conversation
- `role` (TEXT, NOT NULL) - Message role: 'user', 'assistant', or 'system'
- `content` (TEXT, NOT NULL) - Message content
- `citations` (JSONB, DEFAULT '[]') - Array of citation objects
- `follow_up_suggestions` (TEXT[], DEFAULT '{}') - Array of suggested follow-up questions
- `document_context` (JSONB, DEFAULT '{}') - Attached document metadata
- `token_count` (INT, DEFAULT 0) - Tokens in this message
- `created_at` (TIMESTAMPTZ, DEFAULT NOW) - Creation timestamp

**Citation Object Structure**:
```json
{
  "citation_text": "string",
  "citation_url": "string",
  "source_domain": "string",
  "source_title": "string",
  "verification_status": "official_verified | secondary_verified | unsupported | conflicted | unverified"
}
```

**Relationships**:
- Many-to-one with Conversation (via conversation_id)

**Validation Rules**:
- `role` must be one of: 'user', 'assistant', 'system'
- `content` cannot be empty
- `token_count` >= 0
- `citations` must be valid JSON array
- `follow_up_suggestions` must be valid text array

---

### UserLegalProfile
Represents a user's legal consultation profile and preferences.

**Fields**:
- `user_id` (UUID, PK, FK) - User identifier
- `profile_summary` (TEXT, NULLABLE) - Layer 3 summary of all user conversations
- `frequent_topics` (TEXT[], DEFAULT '{}') - Array of frequent legal topics
- `preferences` (JSONB, DEFAULT '{}') - User preferences (e.g., default language, citation style)
- `total_conversations` (INT, DEFAULT 0) - Total conversations created
- `total_tokens` (INT, DEFAULT 0) - Total tokens consumed across all conversations
- `updated_at` (TIMESTAMPTZ, DEFAULT NOW) - Last update timestamp

**Preferences Object Structure**:
```json
{
  "language": "vietnamese | english",
  "citation_style": "formal | casual",
  "summary_preference": "aggressive | balanced | minimal",
  "notification_enabled": true
}
```

**Relationships**:
- One-to-one with User (via user_id)

**Validation Rules**:
- `total_conversations` >= 0
- `total_tokens` >= 0
- `frequent_topics` must be valid text array
- `preferences` must be valid JSON object

---

## Indexes

### Performance Indexes

```sql
-- Conversation lookup by user, ordered by recency
CREATE INDEX idx_conversations_user_updated 
  ON conversations(user_id, updated_at DESC);

-- Conversation filtering by folder
CREATE INDEX idx_conversations_folder 
  ON conversations(user_id, folder) 
  WHERE folder IS NOT NULL;

-- Message retrieval by conversation
CREATE INDEX idx_messages_conversation 
  ON messages(conversation_id, created_at);

-- Starred conversations quick access
CREATE INDEX idx_conversations_starred 
  ON conversations(user_id, is_starred) 
  WHERE is_starred = TRUE;

-- Archived conversations filtering
CREATE INDEX idx_conversations_archived 
  ON conversations(user_id, is_archived) 
  WHERE is_archived = TRUE;
```

---

## Security Policies (RLS)

### Conversations Table
```sql
-- Users can view their own conversations
CREATE POLICY "Users can view own conversations"
  ON conversations FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own conversations
CREATE POLICY "Users can insert own conversations"
  ON conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own conversations
CREATE POLICY "Users can update own conversations"
  ON conversations FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own conversations
CREATE POLICY "Users can delete own conversations"
  ON conversations FOR DELETE
  USING (auth.uid() = user_id);
```

### Messages Table
```sql
-- Users can view messages in their own conversations
CREATE POLICY "Users can view messages in own conversations"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND conversations.user_id = auth.uid()
    )
  );

-- Users can insert messages in their own conversations
CREATE POLICY "Users can insert messages in own conversations"
  ON messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND conversations.user_id = auth.uid()
    )
  );

-- Users can update messages in their own conversations
CREATE POLICY "Users can update messages in own conversations"
  ON messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND conversations.user_id = auth.uid()
    )
  );
```

### UserLegalProfile Table
```sql
-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON user_legal_profile FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile"
  ON user_legal_profile FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON user_legal_profile FOR UPDATE
  USING (auth.uid() = user_id);
```

---

## Triggers

### Auto-update updated_at
```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_legal_profile_updated_at
  BEFORE UPDATE ON user_legal_profile
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## Migration Order

1. Create tables (Conversations, Messages, UserLegalProfile)
2. Create indexes
3. Create triggers
4. Enable RLS
5. Create RLS policies
6. Grant permissions
