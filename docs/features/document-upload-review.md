# Document Upload & Parsing Review

## Problem Statement
User reports that uploaded documents (PDF/DOCX) are not being read/parsed correctly by the chat system. AI cannot see document content and provides irrelevant answers.

---

## Root Cause Analysis

### Issue 1: Frontend Only Parses Text Files
**File**: `legalshield-web/src/hooks/useStreamingChat.ts` (line 162-168)

**Current Logic**:
```typescript
const [cloudinaryUrl, fileContent] = await Promise.all([
  uploadToCloudinary(doc.file, 'chat_documents', 'auto'),
  doc.file.type.startsWith('text/') || 
  doc.file.name.endsWith('.txt') || 
  doc.file.name.endsWith('.md') || 
  doc.file.name.endsWith('.csv') || 
  doc.file.name.endsWith('.json') || 
  doc.file.name.endsWith('.xml') || 
  doc.file.name.endsWith('.html')
    ? new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsText(doc.file);
      })
    : Promise.resolve(null)  // ← PDF/DOCX returns null!
]);
```

**Problem**:
- Only text files are parsed using FileReader
- PDF/DOCX files return `null` for `fileContent`
- Document context is empty for non-text files

---

### Issue 2: Backend Document Context Extraction
**File**: `supabase/functions/legal-chat/index.ts` (line 413-432)

**Current Logic** (FIXED):
```typescript
// Extract document text from array
if (Array.isArray(document_context)) {
  documentText = document_context
    .map((doc) => doc?.document_context || '')
    .filter(Boolean)
    .join('\n\n---\n\n')
}
```

**Status**: ✅ FIXED
- Backend now correctly extracts document text from array
- However, frontend still sends `null` for PDF/DOCX

---

### Issue 3: Existing Worker Not Used in Chat
**File**: `legalshield-web/src/workers/document.worker.ts`

**Available Functions**:
- `parsePDF(arrayBuffer)` - Extracts text from PDF
- `parseDocx(arrayBuffer)` - Extracts text from DOCX
- `generateHash(arrayBuffer)` - Generates file hash

**Usage in Other Files**:
- `ChatAI.tsx` - Uses worker for PDF/DOCX parsing ✅
- `ContractAnalysis.tsx` - Uses worker for PDF/DOCX parsing ✅
- `useStreamingChat.ts` - Does NOT use worker ❌

---

## Solution

### Add PDF/DOCX Parsing to useStreamingChat.ts

**Required Changes**:

1. **Import Worker**:
```typescript
import * as Comlink from 'comlink'

// Proxy for the Web Worker
let workerApi: any = null
const initWorker = () => {
  if (!workerApi) {
    const worker = new Worker(new URL('../workers/document.worker.ts', import.meta.url), { type: 'module' })
    workerApi = Comlink.wrap(worker)
  }
  return workerApi
}
```

2. **Update File Reading Logic**:
```typescript
// Parse file content based on type
let fileContent: string | null = null
const extension = doc.file.name.split('.').pop()?.toLowerCase()

if (extension === 'txt' || extension === 'md' || extension === 'csv' || extension === 'json' || extension === 'xml' || extension === 'html' || doc.file.type.startsWith('text/')) {
  // Text files: use FileReader
  fileContent = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.readAsText(doc.file);
  })
} else if (extension === 'pdf' || extension === 'docx') {
  // PDF/DOCX: use worker to parse
  try {
    const arrayBuffer = await doc.file.arrayBuffer()
    const api = initWorker()
    if (extension === 'pdf') {
      fileContent = await api.parsePDF(arrayBuffer)
    } else if (extension === 'docx') {
      fileContent = await api.parseDocx(arrayBuffer)
    }
  } catch (err) {
    console.error('Failed to parse document locally:', err)
    // Fallback: try server-side parsing via parse-document function
    try {
      const formData = new FormData()
      formData.append('file', doc.file)
      const response = await fetch('/functions/v1/parse-document', {
        method: 'POST',
        body: formData
      })
      const data = await response.json()
      fileContent = data.text || null
    } catch (serverErr) {
      console.error('Failed to parse document on server:', serverErr)
    }
  }
}
```

---

## Blocker

**Current Issue**: `useStreamingChat.ts` has 26 TypeScript errors (existing, not related to this change)

**Errors Include**:
- Missing exports: `streamingChatApi`, `messageApi`
- Missing functions: `uploadChatImage`, `suggestionsApi`, `summarizationApi`
- Implicit `any` types throughout

**Impact**: Cannot build frontend with new changes until existing errors are fixed.

---

## Recommendation

### Option 1: Fix Existing TypeScript Errors First (Recommended)
1. Fix all 26 TypeScript errors in `useStreamingChat.ts`
2. Then add PDF/DOCX parsing logic
3. Test and deploy

**Pros**: Clean codebase, proper type safety
**Cons**: More work upfront

### Option 2: Use Server-Side Parsing Only (Quick Fix)
1. Remove frontend PDF/DOCX parsing
2. Always use `parse-document` edge function for all file types
3. Backend handles all parsing

**Pros**: Quick fix, no frontend build issues
**Cons**: Slower (server round-trip), more server load

### Option 3: Separate File Parsing Hook
1. Create new hook `useDocumentParser` for file parsing
2. Keep `useStreamingChat` unchanged
3. Use `useDocumentParser` in ChatPage

**Pros**: Clean separation, easier to test
**Cons**: More code, additional complexity

---

## Current Status

✅ **Backend**: Fixed document context extraction from array
✅ **Worker**: Available and working in other components
❌ **Frontend**: useStreamingChat.ts has TypeScript errors blocking changes
❌ **Parsing**: PDF/DOCX not parsed in chat flow

---

## Next Steps

1. **Immediate**: Fix TypeScript errors in `useStreamingChat.ts`
2. **Then**: Add PDF/DOCX parsing logic using worker
3. **Test**: Upload PDF/DOCX and verify document context is sent to backend
4. **Deploy**: Frontend + Backend changes

---

## Testing Checklist

- [ ] Upload PDF file → Verify fileContent is extracted
- [ ] Upload DOCX file → Verify fileContent is extracted
- [ ] Upload TXT file → Verify fileContent is extracted (existing)
- [ ] Chat with uploaded document → Verify AI sees document context
- [ ] Check console logs for parsing errors
- [ ] Test fallback to server-side parsing if worker fails
