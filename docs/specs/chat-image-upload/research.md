# Research: AI Chat Image Upload & Vision Processing

## 1. Vision Model Selection
- **Choice**: Gemini 1.5 Flash
- **Rationale**: 
  - Native multimodal support (Images + Text).
  - Fast inference suitable for chat and RAG pre-processing.
  - Cost-effective compared to Pro models.
  - Large context window allows sending multiple high-res images.
- **Alternatives**:
  - GPT-4o-mini: Fast but requires separate API setup.
  - LLaVA (Ollama): Possible but hosting on Edge is difficult.

## 2. Image Processing Workflow
1. **Frontend**:
   - Capture/Select images.
   - Resize to max 1500px (width/height) to maintain quality while reducing upload size.
   - Upload to Supabase Storage: `user-contracts/chat/{user_id}/{filename}`.
2. **Edge Function (legal-chat)**:
   - Receive array of Storage URLs.
   - For each image, fetch from Storage (using `service_role` key).
   - Convert to Base64 (Gemini standard) or use signed URLs.
   - Send to Gemini with Prompt: "Analyze these legal documents/images. Provide a comprehensive summary and extract all visible text. Prioritize user instructions if they conflict with image content."
3. **RAG Integration**:
   - The resulting summary/OCR text is used as the query for `match_legal_knowledge` and `exaSearch`.

## 3. Storage Strategy
- **Bucket**: `user-contracts` (existing).
- **Path Pattern**: `{user_id}/chat/{message_id}/{index}.jpg`.
- **Retention**: Optional: Auto-delete images after 30 days if not archived (Storage Lifecycle Policy).

## 4. UI/UX Components
- **Input**: Circular button with "+" icon -> Popover menu: "Take Photo", "Photo Library".
- **Preview**: Framer Motion scrollable list of thumbnails with "X" delete button.
- **Mobile Access**: Use `<input type="file" accept="image/*" capture="environment">` for direct camera access.

## 5. Security Check
- **RLS**: Verified existing policy allows `user_id/filename` access.
- **Scanning**: Optional: Add virus scanning if necessary (out of scope for MVP).
- **Permissions**: Ensure `navigator.mediaDevices.getUserMedia` fallback for direct capture if needed, but standard `capture` attribute is safer for mobile browsers.
