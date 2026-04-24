# Document Upload Simplification Tasks

## Overview
Simplify document upload flow to use server-only parsing for all file types.

## Phase 1: Frontend Simplification

### 1.1 Remove Worker Dependencies
- [ ] T001 Remove Comlink import from legalshield-web/src/hooks/useStreamingChat.ts
- [ ] T002 Remove initWorker function from legalshield-web/src/hooks/useStreamingChat.ts
- [ ] T003 Remove workerApi variable from legalshield-web/src/hooks/useStreamingChat.ts
- [ ] T004 [P] Delete legalshield-web/src/workers/document.worker.ts (optional, can keep for future use)

### 1.2 Simplify Document Upload Logic
- [ ] T005 Remove file type branches (text, pdf, docx, doc) from legalshield-web/src/hooks/useStreamingChat.ts
- [ ] T006 Remove FileReader logic from legalshield-web/src/hooks/useStreamingChat.ts
- [ ] T007 Remove worker parsing logic from legalshield-web/src/hooks/useStreamingChat.ts
- [ ] T008 Always use invokeEdgeFunction('parse-document') for ALL files in legalshield-web/src/hooks/useStreamingChat.ts
- [ ] T009 Add mode=ephemeral to parse-document call in legalshield-web/src/hooks/useStreamingChat.ts

### 1.3 Update Document Upload Loop
- [ ] T010 Simplify uploadPromises to use server-only parsing in legalshield-web/src/hooks/useStreamingChat.ts
- [ ] T011 Add mode=ephemeral to FormData in legalshield-web/src/hooks/useStreamingChat.ts
- [ ] T012 Update document_context assignment to use response.text_content in legalshield-web/src/hooks/useStreamingChat.ts

### 1.4 Add Error Handling
- [ ] T013 Add try-catch for parse-document failures in legalshield-web/src/hooks/useStreamingChat.ts
- [ ] T014 Show user-friendly error messages for parse failures in legalshield-web/src/hooks/useStreamingChat.ts
- [ ] T015 Log detailed errors for debugging in legalshield-web/src/hooks/useStreamingChat.ts
- [ ] T016 Handle unsupported file types with clear messages in legalshield-web/src/hooks/useStreamingChat.ts

### 1.5 Add File Type Support
- [ ] T017 Remove file type restrictions from legalshield-web/src/hooks/useStreamingChat.ts
- [ ] T018 Allow ALL file types to be uploaded in legalshield-web/src/hooks/useStreamingChat.ts
- [ ] T019 Let server handle format detection in legalshield-web/src/hooks/useStreamingChat.ts

## Phase 2: Backend Verification

### 2.1 Verify parse-document Function
- [ ] T020 Test parse-document with PDF files
- [ ] T021 Test parse-document with DOC files
- [ ] T022 Test parse-document with DOCX files
- [ ] T023 Test parse-document with TXT files
- [ ] T024 Test parse-document with Images (JPG, PNG)
- [ ] T025 Test parse-document with Excel (XLSX, XLS)
- [ ] T026 Test parse-document with PowerPoint (PPTX, PPT)
- [ ] T027 Add better error messages for unsupported formats in supabase/functions/parse-document/index.ts
- [ ] T028 Ensure mode=ephemeral works correctly in supabase/functions/parse-document/index.ts

### 2.2 Verify legal-chat Function
- [ ] T029 Ensure document_context extraction works in supabase/functions/legal-chat/index.ts
- [ ] T030 Verify compactDocumentContext building in supabase/functions/legal-chat/index.ts
- [ ] T031 Ensure LLM receives document context in supabase/functions/legal-chat/index.ts
- [ ] T032 Add logs for debugging document context in supabase/functions/legal-chat/index.ts

## Phase 3: Testing

### 3.1 Unit Testing
- [ ] T033 Test PDF file upload and parsing
- [ ] T034 Test DOC file upload and parsing
- [ ] T035 Test DOCX file upload and parsing
- [ ] T036 Test TXT file upload and parsing
- [ ] T037 Test Image file upload and parsing
- [ ] T038 Test Excel file upload and parsing
- [ ] T039 Test PowerPoint file upload and parsing
- [ ] T040 Test error handling for parse failures

### 3.2 Integration Testing
- [ ] T041 Test end-to-end flow: Upload → Parse → Chat with PDF
- [ ] T042 Test end-to-end flow: Upload → Parse → Chat with DOC
- [ ] T043 Test end-to-end flow: Upload → Parse → Chat with DOCX
- [ ] T044 Test end-to-end flow: Upload → Parse → Chat with Images
- [ ] T045 Verify document context reaches LLM in Supabase logs
- [ ] T046 Verify LLM uses document context in responses
- [ ] T047 Test with multiple files uploaded simultaneously

## Phase 4: Deployment

### 4.1 Frontend Deployment
- [ ] T048 Commit frontend changes
- [ ] T049 Deploy frontend to production
- [ ] T050 Verify build succeeds

### 4.2 Backend Deployment
- [ ] T051 Deploy parse-document function
- [ ] T052 Deploy legal-chat function
- [ ] T053 Verify logs show document context

## Dependencies

### Phase Dependencies
- Phase 1 must complete before Phase 2
- Phase 2 must complete before Phase 3
- Phase 3 must complete before Phase 4

### Task Dependencies
- T001-T003 must complete before T005
- T005-T009 must complete before T010
- T010-T012 must complete before T013
- T020-T028 must complete before T029
- T029-T032 must complete before T033

## Parallel Execution Opportunities

### Phase 1.1 (Worker Removal)
- T001, T002, T003 can run in parallel
- T004 can run in parallel with T001-T003

### Phase 1.2 (Logic Simplification)
- T005, T006, T007 can run in parallel
- T008, T009 can run in parallel after T005-T007

### Phase 2.1 (Backend Testing)
- T020-T027 can run in parallel (different file types)
- T028 can run in parallel with T020-T027

### Phase 3.1 (Unit Testing)
- T033-T039 can run in parallel (different file types)

## Success Criteria
1. All file types can be uploaded and parsed
2. Document context reaches LLM
3. LLM uses document context in responses
4. Error handling shows clear user messages
5. No worker-related errors
6. Simple, maintainable code
