-- Migration: Fix Message Attachments RLS Policy
-- Created: 2026-04-23
-- Description: Update RLS policy to allow insertion via conversation ownership

-- Update INSERT policy to allow insertion if user owns the message via conversation
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
