-- Migration: Create Storage Buckets
-- Creates the user-contracts bucket for document uploads in parse-document edge function

-- Create bucket (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'user-contracts',
    'user-contracts',
    false,                    -- Private: access via signed URLs only
    10485760,                 -- 10MB max file size
    ARRAY[
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'text/plain',
        'image/jpeg',
        'image/png'
    ]
)
ON CONFLICT (id) DO NOTHING;

-- RLS: Users can only upload to their own folder (user_id/filename)
CREATE POLICY "Users can upload their own contracts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'user-contracts'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can view their own contracts"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'user-contracts'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their own contracts"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'user-contracts'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Service role can read all (for Edge Functions using service_role key)
CREATE POLICY "Service role full access"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'user-contracts');
