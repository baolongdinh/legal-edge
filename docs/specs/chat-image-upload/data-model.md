# Data Model: AI Chat Image Attachments

## 1. Schema Definition

### Table: `message_attachments`
Stores metadata and processed context for image attachments linked to messages.

```sql
CREATE TABLE message_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Storage Info
  storage_path TEXT NOT NULL, -- user_id/chat/message_id/index.jpg
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INT NOT NULL,
  
  -- AI Content
  extracted_text TEXT,      -- Raw OCR text
  visual_summary TEXT,      -- Gemini's description of the image
  embedding vector(768),    -- Optional: multimodal embedding for later search
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb, -- dimensions, camera info, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookup by message
CREATE INDEX idx_message_attachments_message_id ON message_attachments(message_id);

-- RLS Policies
ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own attachments" ON message_attachments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own attachments" ON message_attachments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own attachments" ON message_attachments
  FOR DELETE USING (auth.uid() = user_id);
```

## 2. Relationships
- **Message (1) -> Attachment (N)**: Each message can have up to 5 attachments.
- **User (1) -> Attachment (N)**: Attachments are owned by the user.

## 3. State & Validation
- **Max Count**: Enforced at the application level (5 images per message).
- **File Size**: Enforced at the application level and Supabase Storage (10MB max).
- **Embedding**: Generated in the `legal-chat` Edge Function or a specialized background worker.
