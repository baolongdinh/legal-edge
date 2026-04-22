-- Migration: Agentic Legal Chat Optimization Tables
-- Created: 2026-04-21
-- Description: Creates tables for conversation management, messages, and user legal profiles

-- ============================================
-- 1. CONVERSATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS conversations (
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
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Validation constraints
  CONSTRAINT title_not_empty CHECK (title <> ''),
  CONSTRAINT message_count_non_negative CHECK (message_count >= 0),
  CONSTRAINT total_tokens_non_negative CHECK (total_tokens >= 0)
);

-- ============================================
-- 2. MESSAGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  citations JSONB DEFAULT '[]'::jsonb,
  follow_up_suggestions TEXT[] DEFAULT '{}',
  document_context JSONB DEFAULT '{}'::jsonb,
  token_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Validation constraints
  CONSTRAINT role_check CHECK (role IN ('user', 'assistant', 'system')),
  CONSTRAINT content_not_empty CHECK (content <> ''),
  CONSTRAINT token_count_non_negative CHECK (token_count >= 0),
  CONSTRAINT citations_is_array CHECK (jsonb_typeof(citations) = 'array'),
  CONSTRAINT document_context_is_object CHECK (jsonb_typeof(document_context) = 'object')
);

-- ============================================
-- 3. USER LEGAL PROFILE TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS user_legal_profile (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_summary TEXT,
  frequent_topics TEXT[] DEFAULT '{}',
  preferences JSONB DEFAULT '{}'::jsonb,
  total_conversations INT DEFAULT 0,
  total_tokens INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Validation constraints
  CONSTRAINT total_conversations_non_negative CHECK (total_conversations >= 0),
  CONSTRAINT total_tokens_non_negative CHECK (total_tokens >= 0),
  CONSTRAINT frequent_topics_is_array CHECK (frequent_topics IS NULL OR array_length(frequent_topics, 1) IS NOT NULL OR frequent_topics = '{}'),
  CONSTRAINT preferences_is_object CHECK (jsonb_typeof(preferences) = 'object')
);

-- ============================================
-- 4. PERFORMANCE INDEXES
-- ============================================

-- Conversation lookup by user, ordered by recency
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated 
  ON conversations(user_id, updated_at DESC);

-- Conversation filtering by folder
CREATE INDEX IF NOT EXISTS idx_conversations_folder 
  ON conversations(user_id, folder) 
  WHERE folder IS NOT NULL;

-- Message retrieval by conversation
CREATE INDEX IF NOT EXISTS idx_messages_conversation 
  ON messages(conversation_id, created_at);

-- Starred conversations quick access
CREATE INDEX IF NOT EXISTS idx_conversations_starred 
  ON conversations(user_id, is_starred) 
  WHERE is_starred = TRUE;

-- Archived conversations filtering
CREATE INDEX IF NOT EXISTS idx_conversations_archived 
  ON conversations(user_id, is_archived) 
  WHERE is_archived = TRUE;

-- Search indexes for conversations (using simple for compatibility)
CREATE INDEX IF NOT EXISTS idx_conversations_title_search 
  ON conversations USING gin(to_tsvector('simple', title));

-- ============================================
-- 5. TRIGGERS FOR UPDATED_AT
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_legal_profile_updated_at ON user_legal_profile;
CREATE TRIGGER update_user_legal_profile_updated_at
  BEFORE UPDATE ON user_legal_profile
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 6. ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_legal_profile ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 7. RLS POLICIES FOR CONVERSATIONS
-- ============================================

DROP POLICY IF EXISTS "Users can view own conversations" ON conversations;
CREATE POLICY "Users can view own conversations"
  ON conversations FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own conversations" ON conversations;
CREATE POLICY "Users can insert own conversations"
  ON conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own conversations" ON conversations;
CREATE POLICY "Users can update own conversations"
  ON conversations FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own conversations" ON conversations;
CREATE POLICY "Users can delete own conversations"
  ON conversations FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 8. RLS POLICIES FOR MESSAGES
-- ============================================

DROP POLICY IF EXISTS "Users can view messages in own conversations" ON messages;
CREATE POLICY "Users can view messages in own conversations"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND conversations.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert messages in own conversations" ON messages;
CREATE POLICY "Users can insert messages in own conversations"
  ON messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND conversations.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update messages in own conversations" ON messages;
CREATE POLICY "Users can update messages in own conversations"
  ON messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND conversations.user_id = auth.uid()
    )
  );

-- ============================================
-- 9. RLS POLICIES FOR USER LEGAL PROFILE
-- ============================================

DROP POLICY IF EXISTS "Users can view own profile" ON user_legal_profile;
CREATE POLICY "Users can view own profile"
  ON user_legal_profile FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own profile" ON user_legal_profile;
CREATE POLICY "Users can insert own profile"
  ON user_legal_profile FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own profile" ON user_legal_profile;
CREATE POLICY "Users can update own profile"
  ON user_legal_profile FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================
-- 10. HELPER FUNCTIONS
-- ============================================

-- Function to get or create user legal profile
CREATE OR REPLACE FUNCTION get_or_create_user_legal_profile(p_user_id UUID)
RETURNS user_legal_profile AS $$
DECLARE
  v_profile user_legal_profile;
BEGIN
  SELECT * INTO v_profile FROM user_legal_profile WHERE user_id = p_user_id;
  
  IF NOT FOUND THEN
    INSERT INTO user_legal_profile (user_id)
    VALUES (p_user_id)
    RETURNING * INTO v_profile;
  END IF;
  
  RETURN v_profile;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment message count and tokens
CREATE OR REPLACE FUNCTION increment_conversation_stats(
  p_conversation_id UUID,
  p_token_count INT
)
RETURNS void AS $$
BEGIN
  UPDATE conversations
  SET 
    message_count = message_count + 1,
    total_tokens = total_tokens + p_token_count,
    updated_at = NOW()
  WHERE id = p_conversation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment user conversation count
CREATE OR REPLACE FUNCTION increment_user_conversation_count(p_user_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO user_legal_profile (user_id, total_conversations)
  VALUES (p_user_id, 1)
  ON CONFLICT (user_id) DO UPDATE 
  SET total_conversations = user_legal_profile.total_conversations + 1,
      updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 11. GRANT PERMISSIONS
-- ============================================

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_or_create_user_legal_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_conversation_stats(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_user_conversation_count(UUID) TO authenticated;

-- Grant table permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON messages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON user_legal_profile TO authenticated;

-- Grant sequence permissions
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
