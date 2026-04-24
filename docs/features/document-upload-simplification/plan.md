# Document Upload Simplification Plan

## Objective
Simplify document upload flow to use server-only parsing for all file types, ensuring reliable parsing and LLM integration.

## Current Issues
1. **Worker unreliable**: pdfjs-dist worker fails in web worker context
2. **Multiple parsing paths**: Client-side (FileReader, worker) + Server-side → complex, error-prone
3. **Limited format support**: Only text, PDF, DOCX, DOC → no Excel, PowerPoint, etc.
4. **Silent failures**: Unsupported file types ignored without notification
5. **Complex error handling**: Multiple fallback paths

## Proposed Solution
**Server-only parsing** for all file types using Gemini multimodal.

### Architecture
```
Frontend → Cloudinary Upload → parse-document (Gemini) → text_content → Backend → LLM
```

### Benefits
- All formats supported (PDF, DOC, DOCX, Images, Excel, PowerPoint, etc.)
- Single, reliable parsing path
- No worker issues
- Better error handling
- Simpler code

## Implementation Plan

### Phase 1: Frontend Simplification

#### 1.1 Remove Worker Dependencies
- [ ] Remove Comlink import from `useStreamingChat.ts`
- [ ] Remove `initWorker` function
- [ ] Remove `workerApi` variable
- [ ] Delete `document.worker.ts` file (optional, can keep for future use)

#### 1.2 Simplify Document Upload Logic
- [ ] Remove file type branches (text, pdf, docx, doc)
- [ ] Remove FileReader logic
- [ ] Remove worker parsing logic
- [ ] Always use `invokeEdgeFunction('parse-document')` for ALL files
- [ ] Add `mode=ephemeral` to parse-document call (no DB persistence)

#### 1.3 Update Document Upload Loop
```typescript
const uploadPromises = localDocument.map(async (doc) => {
  if (doc.file && !doc.storage_path) {
    // Upload to Cloudinary
    const cloudinaryUrl = await uploadToCloudinary(doc.file, 'chat_documents', 'auto');
    
    // Parse with server
    const formData = new FormData();
    formData.append('file', doc.file);
    formData.append('mode', 'ephemeral');
    const response = await invokeEdgeFunction<{ text_content?: string }>('parse-document', {
      body: formData
    });
    
    return {
      ...doc,
      storage_path: cloudinaryUrl,
      document_context: response?.text_content || null,
    };
  }
  return doc;
});
```

#### 1.4 Add Error Handling
- [ ] Add try-catch for parse-document failures
- [ ] Show user-friendly error messages
- [ ] Log detailed errors for debugging
- [ ] Handle unsupported file types with clear messages

#### 1.5 Add File Type Support
- [ ] Remove file type restrictions
- [ ] Allow ALL file types to be uploaded
- [ ] Let server handle format detection

### Phase 2: Backend Verification

#### 2.1 Verify parse-document Function
- [ ] Ensure parse-document handles all formats via Gemini
- [ ] Test with: PDF, DOC, DOCX, Images, Excel, PowerPoint
- [ ] Add better error messages for unsupported formats
- [ ] Ensure mode=ephemeral works correctly

#### 2.2 Verify legal-chat Function
- [ ] Ensure document_context extraction works
- [ ] Verify compactDocumentContext building
- [ ] Ensure LLM receives document context
- [ ] Add logs for debugging

### Phase 3: Testing

#### 3.1 Unit Testing
- [ ] Test each file type upload
- [ ] Test parse-document for each format
- [ ] Test error handling

#### 3.2 Integration Testing
- [ ] Test end-to-end flow: Upload → Parse → Chat
- [ ] Verify document context reaches LLM
- [ ] Verify LLM uses document context in responses
- [ ] Test with multiple files

#### 3.3 File Type Testing Matrix
| File Type | Expected Behavior | Status |
|-----------|------------------|--------|
| PDF | Parse with Gemini | TODO |
| DOC | Parse with Gemini | TODO |
| DOCX | Parse with Gemini | TODO |
| TXT | Parse with Gemini | TODO |
| Images (JPG, PNG) | Parse with Gemini Vision | TODO |
| Excel (XLSX, XLS) | Parse with Gemini | TODO |
| PowerPoint (PPTX, PPT) | Parse with Gemini | TODO |
| Other | Parse with Gemini fallback | TODO |

### Phase 4: Deployment

#### 4.1 Frontend Deployment
- [ ] Commit changes
- [ ] Deploy to production
- [ ] Verify build succeeds

#### 4.2 Backend Deployment
- [ ] Deploy parse-document function
- [ ] Deploy legal-chat function
- [ ] Verify logs show document context

## Success Criteria
1. All file types can be uploaded and parsed
2. Document context reaches LLM
3. LLM uses document context in responses
4. Error handling shows clear user messages
5. No worker-related errors
6. Simple, maintainable code

## Rollback Plan
If issues arise:
1. Revert frontend changes
2. Restore worker-based parsing
3. Keep server-side as fallback
