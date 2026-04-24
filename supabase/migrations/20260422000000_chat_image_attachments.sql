-- Migration: AI Chat Image Attachments
-- Created: 2026-04-22
-- Description: Creates table for storing image attachments linked to messages

-- ============================================
-- 1. MESSAGE ATTACHMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS message_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Storage Info
  storage_path TEXT NOT NULL, -- user_id/chat/message_id/filename
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INT NOT NULL,
  
  -- AI Content
  extracted_text TEXT,      -- OCR text from images
  visual_summary TEXT,      -- AI description of the image content
  embedding vector(768),    -- Semantic representation (optional/future)
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Validation
  CONSTRAINT file_size_positive CHECK (file_size > 0)
);

-- ============================================
-- 2. PERFORMANCE INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_message_attachments_message_id ON message_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_message_attachments_user_id ON message_attachments(user_id);
CREATE INDEX IF NOT EXISTS idx_message_attachments_storage_path ON message_attachments(storage_path);

-- ============================================
-- 3. ROW LEVEL SECURITY (RLS)
-- ============================================
ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;

-- Select: Users can view attachments for their own messages
DROP POLICY IF EXISTS "Users can view own attachments" ON message_attachments;
CREATE POLICY "Users can view own attachments"
  ON message_attachments FOR SELECT
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM messages
      JOIN conversations ON conversations.id = messages.conversation_id
      WHERE messages.id = message_attachments.message_id
      AND conversations.user_id = auth.uid()
    )
  );

-- Insert: Users can only attach to their own messages
DROP POLICY IF EXISTS "Users can insert own attachments" ON message_attachments;
CREATE POLICY "Users can insert own attachments"
  ON message_attachments FOR INSERT
  WITH CHECK (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM messages
      JOIN conversations ON conversations.id = messages.conversation_id
      WHERE messages.id = message_attachments.message_id
      AND conversations.user_id = auth.uid()
    )
  );

-- Delete: Users can delete their own attachments
DROP POLICY IF EXISTS "Users can delete own attachments" ON message_attachments;
CREATE POLICY "Users can delete own attachments"
  ON message_attachments FOR DELETE
  USING (auth.uid() = user_id);

-- Service role: Full access for Edge Functions
DROP POLICY IF EXISTS "Service role full access on attachments" ON message_attachments;
CREATE POLICY "Service role full access on attachments"
  ON message_attachments FOR ALL
  TO service_role
  USING (TRUE);

-- ============================================
-- 4. GRANT PERMISSIONS
-- ============================================
GRANT SELECT, INSERT, UPDATE, DELETE ON message_attachments TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
