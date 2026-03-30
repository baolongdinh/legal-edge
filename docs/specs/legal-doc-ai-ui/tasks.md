# Implementation Tasks: LegalShield Frontend UI

This document provides the granular execution tasks for the frontend UI converted from Stitch HTML, following the strict ID and dependency ordering rules.

## Phase 1: Setup & Foundation
- [ ] T001 Initialize React/Vite project in `legalshield-web/`
- [ ] T002 Configure Tailwind CSS and add custom colors (Navy, Gold) to `legalshield-web/tailwind.config.js`
- [ ] T003 Integrate Google Fonts (Playfair Display & Inter) into `legalshield-web/index.html`
- [ ] T004 Set up frontend routing (React Router) in `legalshield-web/src/App.tsx`
- [ ] T005 Create Zustand global stores (UI, Document, Billing) in `legalshield-web/src/store/index.ts`

## Phase 2: Core UI Components
*Goal: Assemble the smallest atoms required by all higher-level layouts.*
- [ ] T006 [P] [US1] Implement the Ghost & Primary Button component in `legalshield-web/src/components/ui/Button.tsx`
- [ ] T007 [P] [US1] Implement the RiskBadge component (colors based on level) in `legalshield-web/src/components/ui/RiskBadge.tsx`
- [ ] T008 [P] [US1] Implement Typography abstractions in `legalshield-web/src/components/ui/Typography.tsx`
- [ ] T009 [US1] Build testing stub to verify atomic components render correctly in `legalshield-web/src/App.tsx`

## Phase 3: Layout Boundaries
*Goal: Implement the primary structural containers required for the app.*
- [ ] T010 [P] [US2] Implement Topbar component in `legalshield-web/src/components/layout/Topbar.tsx`
- [ ] T011 [P] [US2] Extract sidebar from raw `dashboard.html` into `legalshield-web/src/components/layout/Sidebar.tsx`
- [ ] T012 [US2] Build the SplitView manager (55/45 and 25/75 grids) in `legalshield-web/src/components/layout/SplitView.tsx`

## Phase 4: Screen Implementations & View Integration
*Goal: Map the complex HTML templates seamlessly into the generic layouts.*
- [ ] T013 [P] [US3] Convert `landing.html` hero components to `legalshield-web/src/pages/Landing.tsx`
- [ ] T014 [P] [US4] Convert `pricing.html` tier columns to `legalshield-web/src/pages/Pricing.tsx`
- [ ] T015 [P] [US5] Convert `profile.html` account forms to `legalshield-web/src/pages/Profile.tsx`
- [ ] T016 [US6] Convert `dashboard.html` grid and stats to `legalshield-web/src/pages/Dashboard.tsx` (Depends on T011)
- [ ] T017 [US7] Convert `analysis.html` into `legalshield-web/src/pages/ContractAnalysis.tsx` (Depends on T012)
- [ ] T018 [US8] Convert `clause_library.html` to `legalshield-web/src/pages/DraftEditor.tsx` (Depends on T012)

## Phase 5: State Interoperability & Polish
*Goal: Connect the local components to the Zustand stores and ensure seamless interactions.*
- [ ] T019 Tie the Sidebar `active` states to the Router path in `legalshield-web/src/components/layout/Sidebar.tsx`
- [ ] T020 Mock uploading progress flow inside `ContractAnalysis.tsx` linking to Zustand `UploadState`
- [ ] T021 Final audit of responsive padding and font-sizes for mobile viewport consistency

## Phase 6: Production Infrastructure & Supabase Tuning
*Goal: Ensure the database and connection layers can handle high concurrency (thousands of simultaneous users) without crashing.*
- [ ] T022 (Backend) Configure Supabase Connection Pooling (Supavisor) string for all Edge Functions that execute direct SQL queries (like `pgvector`).
- [ ] T023 (Frontend) Ensure the `supabase-js` client strictly utilizes the PostgREST API and Edge Function APIs, avoiding any unauthorized direct connections that could exhaust pooling limits.

---
### Dependencies
- **Phase 1** must be entirely completed before **Phase 2**.
- **Phase 2** components (`T006-T008`) can be built completely in parallel.
- **Phase 4** pages `Landing`, `Pricing`, `Profile` can be built in parallel, whereas `Dashboard`, `Analysis`, and `DraftEditor` depend heavily on **Phase 3** layout wrappers.
- The `UI Components` are extracted using the visual definitions encoded in `docs/designs/legal-doc-ai/html/`.
