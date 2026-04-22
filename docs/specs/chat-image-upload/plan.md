# Implementation Plan: AI Chat Image Upload & Vision Search

## Goal Description
Implement image upload and vision-based legal search for the AI Chat. This includes mobile-friendly image capture, secure storage in Supabase, vision-to-text processing via Gemini 1.5 Flash, and integration into the existing RAG pipeline.

## Proposed Changes

### [Database & Storage]
#### [NEW] [20260422000000_chat_image_attachments.sql](file:///home/aiozlong/DATA/CODE/SELF_PROD/LegalEdge/supabase/migrations/20260422000000_chat_image_attachments.sql)
- Create `message_attachments` table.
- Configure RLS policies for user-specific access.
- (Optional) Configure Storage lifecycle policies for chat image cleanup.

---

### [Backend - Supabase Edge Functions]
#### [MODIFY] [shared/types.ts](file:///home/aiozlong/DATA/CODE/SELF_PROD/LegalEdge/supabase/functions/shared/types.ts)
- Add `callVisionLLM` helper to support multimodal (base64) inputs for Gemini.
- Update `IntentEvaluation` and `LegalSourceEvidence` to accommodate image-derived context.

#### [MODIFY] [legal-chat/index.ts](file:///home/aiozlong/DATA/CODE/SELF_PROD/LegalEdge/supabase/functions/legal-chat/index.ts)
- Detect `imageUrls` in the request body.
- Fetch images from Storage and process via `callVisionLLM` to get a "Vision Summary".
- Integrate "Vision Summary" into the RAG standalone query generation.
- Pass vision context to the final LLM response generator.

#### [MODIFY] [save-message/index.ts](file:///home/aiozlong/DATA/CODE/SELF_PROD/LegalEdge/supabase/functions/save-message/index.ts)
- Update to handle saving `message_attachments` data along with the message.

---

### [Frontend - legalshield-web]
#### [MODIFY] [ChatInput.tsx](file:///home/aiozlong/DATA/CODE/SELF_PROD/LegalEdge/legalshield-web/src/components/chat/ChatInput.tsx)
- Add "plus" button for image upload.
- Implement specialized "Take Photo" vs "Choose from Library" selection.
- Implement image compression before upload.
- Manage local preview state for up to 5 images.

#### [NEW] [ImagePreview.tsx](file:///home/aiozlong/DATA/CODE/SELF_PROD/LegalEdge/legalshield-web/src/components/chat/ImagePreview.tsx)
- Reusable component for showing thumbnails with delete buttons.

#### [MODIFY] [MessageItem.tsx](file:///home/aiozlong/DATA/CODE/SELF_PROD/LegalEdge/legalshield-web/src/components/chat/MessageItem.tsx)
- Render image attachments in user message bubbles.

## Verification Plan

### Automated Tests
- `npm run test`: Unit tests for image compression utility.
- `supabase functions serve`: Manually test `legal-chat` with base64/URL vision inputs using Postman/CURL.

### Manual Verification
- **Mobile**: Verify camera access and photo library selection on an actual device or simulator.
- **Vision**: Upload a legal document snippet and verify the AI can "read" and contextualize its contents.
- **RAG**: Verify that uploading an image of a property deed triggers relevant land law citations.
