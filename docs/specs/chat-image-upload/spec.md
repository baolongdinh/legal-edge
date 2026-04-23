# Feature Specification: AI Chat Image Upload & Vision Search

## 1. Overview
Enhance the AI Chat functionality to support image uploads. This feature allows users to provide visual context (legal documents, evidence photos, screenshots) to the AI assistant. The system will process these images using Vision-to-Text/Embedding models to enable semantic search and legal reasoning based on visual evidence.

## 2. User Scenarios

### Scenario 1: Capturing Physical Documents (Mobile)
A user on their smartphone needs to ask about a physical notice they just received. They click the camera button, select "Take Photo", take a photo of the document, and upload it. The AI "reads" the document and answers questions about it, prioritizing the user's specific questions over the document text if conflicts arise.

### Scenario 2: Batch Evidence Upload
A user has multiple screenshots of a chat conversation or digital evidence. They select up to 5 images from their gallery and upload them together. The AI synthesizes a summary of all images to provide a comprehensive search context.

### Scenario 3: Mixed Context Search
A user uploads an image of a property deed and asks "Does this comply with the latest land law?". The AI uses the image content combined with Exa (Web Search) to verify compliance against the current regulations.

## 3. Functional Requirements

### FR-001: Image Selection & Upload
- Support uploading up to **5 images** per message.
- Support standard formats: JPG, PNG, WEBP, HEIC (Auto-converted to compatible format).
- Provide a choice for the user between **"Take Photo"** (direct camera capture) and **"Choose from Library"** (file selection).
- No image editing (crop/rotate) supported in the application; use system defaults.
- Display image previews with a "Remove" button before sending.

### FR-002: Vision Processing & Embedding
- Automatically detect text (OCR) and visual elements in uploaded images.
- **Priority**: Prioritize user's text prompt instructions over text extracted from images in case of conflict.
- **Context Merging**: Merge content from all uploaded images into a single synthesized summary context for search.
- Generate semantic embeddings for the merged visual context.
- Support "Image Context" in the RAG pipeline:
    - Search local law database based on merged image content.
    - Search web (Exa) based on merged image content.
- Ensure the LLM receives the image context (base64 or temporary URL) for multimodal reasoning.

### FR-003: Mobile-First UI
- Optimized camera interface for mobile browsers.
- Native-like file picker experience.
- Compression before upload to save bandwidth (max 2MB per image).

### FR-004: Persistence & History
- Store image attachments in Supabase Storage.
- Link image metadata to the `messages` table.
- Correctly re-hydrate image previews when loading conversation history.

## 4. Success Criteria

### Performance Metrics
- **Upload Speed**: < 3 seconds for 5 compressed images.
- **Vision Inference**: < 5 seconds for initial text extraction/analysis.
- **Search Accuracy**: > 85% relevance for image-based legal queries.

### UX Metrics
- **Ease of Use**: Users can complete a camera-to-chat flow in under 4 clicks.
- **Mobile Success**: > 95% successful captures on iOS/Android browsers.

## 5. Key Entities

### ImageAttachment
- `id`: UUID
- `message_id`: UUID (Foreign Key)
- `storage_path`: String
- `thumbnail_url`: String
- `extracted_text`: Text
- `embedding`: Vector (Multimodal)
- `metadata`: JSON (Dimensions, type, file size)

## 6. Assumptions & Constraints
- **Assumed**: The existing `messages` table can be extended or linked to a new `attachments` table.
- **Constraint**: Maximum 5 images per message to maintain performance and control costs.
- **Constraint**: Direct camera access depends on browser permissions and HTTPS.

## 7. Resolved Clarifications

1. **Context Priority**: The AI prioritized the user's text prompt instructions over OCR/extracted text if they conflict.
2. **Editing**: No image editing (cropping/rotating) supported within the app; keep it simple.
3. **RAG Search**: Merge all image contents into a single synthesized summary context for a single vector search query.
4. **Camera UI**: Provide a clear choice between "Take Photo" and "Choose from Library".
