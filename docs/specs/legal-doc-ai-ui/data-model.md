# Frontend Data Model: LegalShield UI

This document outlines the client-side state models designed to manage the LegalShield UI efficiently.

## 1. Global UI State (e.g., Zustand or Context)
```typescript
interface GlobalUIState {
  theme: 'dark' | 'light'; // Default: 'dark'
  sidebarExpanded: boolean;
  activeModal: 'none' | 'upload_contract' | 'settings';
  
  toggleSidebar: () => void;
  setTheme: (theme: 'dark' | 'light') => void;
}
```

## 2. Document & Analysis State
State tracking the current document and the AI's real-time risk analysis payload.
```typescript
interface RiskBadge {
  id: string;
  clauseRef: string;
  level: 'critical' | 'moderate' | 'note';
  description: string;
  citation: string;
  citationUrl?: string;
  verificationStatus?: 'official_verified' | 'secondary_verified' | 'unsupported' | 'conflicted' | 'unverified';
  sourceDomain?: string;
}

interface AnalysisState {
  isAnalyzing: boolean;
  currentDocumentId: string | null;
  risks: RiskBadge[];
  
  setDocument: (id: string) => void;
  startAnalysis: () => void;
  addRisk: (risk: RiskBadge) => void;
}
```

## 3. Clause Library State (Editor)
```typescript
interface Clause {
  id: string;
  category: 'bảo mật' | 'bồi thường' | 'tranh chấp';
  title: string;
  content: string;
}

interface EditorState {
  activeDraft: string;
  clauseLibrary: Clause[];
  searchQuery: string;
  
  insertClause: (clauseId: string) => void;
}
```

## 4. User Profile & Billing State (Pricing/Profile views)
State for managing premium access limits and user data.
```typescript
interface UserState {
  user: { id: string; email: string; name: string; avatarUrl?: string } | null;
  subscription: 'free' | 'pro' | 'enterprise';
  apiCallsUsed: number;
  apiCallsLimit: number;
  
  refreshAuth: () => Promise<void>;
  upgradePlan: (planId: string) => Promise<void>; // Triggers checkout-session
}
```

## 6. Verified Legal Advisory Response
```typescript
interface LegalCitation {
  citation_text: string;
  citation_url: string;
  source_domain: string;
  source_title: string;
  source_excerpt: string;
  source_type: 'official' | 'secondary' | 'document_context';
  verification_status: 'official_verified' | 'secondary_verified' | 'unsupported' | 'conflicted' | 'unverified';
}

interface LegalAnswerPayload {
  answer: string;
  citations: LegalCitation[];
  evidence: Array<{
    title: string;
    url: string;
    source_domain: string;
    source_type: 'official' | 'secondary' | 'document_context';
  }>;
  verification_status: 'official_verified' | 'secondary_verified' | 'unsupported' | 'conflicted' | 'unverified';
}
```

## 5. Document Upload State (Analysis View)
Tracks progress of large PDF/DOCX uploads.
```typescript
interface UploadState {
  file: File | null;
  status: 'idle' | 'uploading' | 'parsing' | 'success' | 'error';
  progress: number; // 0 to 100
  extractedText: string | null;
  
  uploadDocument: (file: File) => Promise<void>; // Calls parse-document
  resetUpload: () => void;
}
```
