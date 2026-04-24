# Document Upload Fix Tasks

## Overview
Fix document upload parsing to support PDF/DOCX files in chat. Currently only text files are parsed, causing AI to not see document content for PDF/DOCX uploads.

## Implementation Strategy
- Phase 1: Fix TypeScript errors in useStreamingChat.ts (blocking)
- Phase 2: Add PDF/DOCX parsing logic using existing worker
- Phase 3: Test and deploy

---

## Phase 1: Fix TypeScript Errors in useStreamingChat.ts

### Goal
Resolve 26 TypeScript errors blocking frontend build

### Tasks
- [ ] T001 Fix missing export streamingChatApi in lib/supabase
- [ ] T002 Fix missing export messageApi in lib/supabase
- [ ] T003 Fix missing function uploadChatImage
- [ ] T004 Fix missing function suggestionsApi
- [ ] T005 Fix missing function summarizationApi
- [ ] T006 Fix implicit any types (26 instances)
- [ ] T007 Build frontend to verify all errors resolved

### Expected Outcome
- Frontend builds successfully with 0 TypeScript errors
- Ready to add new features

---

## Phase 2: Add PDF/DOCX Parsing Logic

### Goal
Enable PDF/DOCX parsing in useStreamingChat.ts using existing document.worker

### Tasks
- [ ] T008 Import Comlink in useStreamingChat.ts
- [ ] T009 Add initWorker function in useStreamingChat.ts
- [ ] T010 Update file reading logic to detect file extension
- [ ] T011 Add PDF parsing using worker (parsePDF)
- [ ] T012 Add DOCX parsing using worker (parseDocx)
- [ ] T013 Add fallback to server-side parse-document function
- [ ] T014 Test local worker parsing with sample PDF
- [ ] T015 Test local worker parsing with sample DOCX
- [ ] T016 Test fallback to server-side parsing

### Expected Outcome
- PDF files are parsed correctly on client-side
- DOCX files are parsed correctly on client-side
- Fallback to server-side if worker fails
- document_context contains extracted text

---

## Phase 3: Integration Testing

### Goal
Verify end-to-end document upload and AI response

### Tasks
- [ ] T017 Test upload TXT file → verify AI sees content
- [ ] T018 Test upload PDF file → verify AI sees content
- [ ] T019 Test upload DOCX file → verify AI sees content
- [ ] T020 Test chat with uploaded document → verify relevant answers
- [ ] T021 Check console logs for parsing errors
- [ ] T022 Test large files (>5MB) for performance
- [ ] T023 Test multiple files upload simultaneously

### Expected Outcome
- All file types parsed correctly
- AI provides relevant answers based on document content
- No console errors during parsing
- Performance acceptable for large files

---

## Phase 4: Deployment

### Goal
Deploy frontend and backend changes

### Tasks
- [ ] T024 Build frontend for production
- [ ] T025 Deploy frontend to Vercel/Netlify
- [ ] T026 Monitor production logs for parsing errors
- [ ] T027 Verify document upload works in production
- [ ] T028 Rollback plan if issues arise

### Expected Outcome
- Production deployment successful
- Document upload works for all file types
- Monitoring in place for errors

---

## Parallel Execution Opportunities

### Phase 1 (Sequential)
- All TypeScript errors must be fixed in order
- Cannot parallelize due to dependencies

### Phase 2 (Partial Parallel)
- T008-T009: Can be done in parallel (imports and initWorker)
- T010-T013: Must be sequential (depends on previous)
- T014-T016: Can be done in parallel (independent tests)

### Phase 3 (Full Parallel)
- T017-T023: All tests can run in parallel
- Different file types, no dependencies

### Phase 4 (Sequential)
- Must deploy in order
- T024 before T025 before T026

---

## Dependencies

### Phase 1
- No dependencies
- Can start immediately

### Phase 2
- Depends on Phase 1 (must build successfully)
- Requires document.worker.ts (already exists)

### Phase 3
- Depends on Phase 2 (parsing logic implemented)
- Requires test files (sample PDF/DOCX)

### Phase 4
- Depends on Phase 3 (testing passed)
- Requires production deployment credentials

---

## Timeline

- **Phase 1**: 2-3 hours (fixing 26 TypeScript errors)
- **Phase 2**: 1-2 hours (implementing parsing logic)
- **Phase 3**: 1 hour (integration testing)
- **Phase 4**: 0.5 hour (deployment)
- **Total**: 4.5-6.5 hours

---

## Success Metrics

- Frontend builds with 0 TypeScript errors
- PDF files are parsed with >90% text extraction accuracy
- DOCX files are parsed with >90% text extraction accuracy
- AI provides relevant answers based on uploaded document content
- Parsing time <3 seconds for files <10MB
- No console errors in production logs

---

## Rollback Plan

If issues arise:
1. Revert Phase 4 (deployment)
2. Revert Phase 2 (parsing logic) if parsing fails
3. Keep Phase 1 (TypeScript fixes) as they improve code quality
4. Fallback to server-side parsing only (Option 2 from review doc)
