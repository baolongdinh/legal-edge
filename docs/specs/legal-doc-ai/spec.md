# Feature Specification: Legal Doc AI (Automated Contract Assistant)

## 1. Overview
Legal Doc AI is an intelligent legal assistant designed to automate contract drafting, review, and legal research directly based on Vietnam's regulatory framework. By leveraging an advanced Retrieval-Augmented Generation (RAG) architecture, the system provides accurate, verifiable legal answers with exact citations (e.g., "Điều 15 Luật Thương mại 2005") and minimizes hallucinations. 

## 2. Business Value & Goals
- **Automated Drafting**: Accelerate contract creation using 50 attorney-approved proprietary templates.
- **Accurate Legal Grounding**: Guarantee outputs are strictly based on actual Vietnamese laws and official precedents.
- **Real-Time Risk Mitigation**: Instantly review generated or user-provided contracts for legal risks and unfavorable clauses.
- **Maintenance-Free Knowledge Base**: Automatically ingest new laws without retraining the core AI model.
- **Mass-Market Usability**: Guide non-lawyer users through a structured intake flow, so they can provide all critical information in one pass without needing legal vocabulary.

## 3. User Scenarios
- **Scenario 1: Contract Generation**: A user requests "Draft a warehouse lease agreement for 12 months in HCMC." The AI identifies the correct template, queries relevant land and commercial laws, and generates a tailored document with inline legal citations.
- **Scenario 2: Legal Querying**: A user asks a specific legal question. The AI searches the vector knowledge base to provide a synthesized answer with links to the exact legal articles and precedents.
- **Scenario 3: Risk Assessment**: During the drafting process, the system actively monitors clauses and highlights potential risks or non-compliance issues in real time.
- **Scenario 4: Guided Intake for Ordinary Users**: A non-lawyer user writes a vague request such as "soạn hợp đồng thuê nhà cho tôi". The AI first classifies the document type, verifies whether it is truly a contract or another legal document, identifies missing information, then returns a single consolidated questionnaire so the user can answer once and receive a realistic first draft.
- **Scenario 5: Non-Contract Legal Document Detection**: A user asks for a "hợp đồng ly hôn". The system identifies that this is not a standard contract artifact, maps it to the closest correct legal document category (e.g. đơn, thỏa thuận, hồ sơ), explains the mismatch in plain Vietnamese, and asks only the relevant follow-up questions for that document type.

## 4. Functional Requirements
1. **Knowledge Base Ingestion & Management**
   - Automatically ingest and process legal documents from official sources (National Legal Database, Supreme People's Court Precedents, Electronic Official Gazette).
   - Support manual upload of proprietary contract templates (DOCX/PDF).
   - Intelligently segment documents by legal articles while preserving crucial metadata (document number, effective date, issuing body).
   - Maintain a curated template/source registry with provenance metadata: source type, source URL, source title, jurisdiction relevance, last reviewed date, and whether the asset is an internal template or externally collected sample.
   - Support retrieval of public legal-document samples from the web as drafting references, but require provenance labeling and legal-source separation from binding law citations.
   
2. **Intelligent Retrieval & Generation**
   - Execute semantic searches against the legal knowledge base based on user queries.
   - Synthesize search results with proprietary templates to generate responses.
   - Enforce strict inline source citation for all generated legal claims.
   - Classify incoming drafting requests into: `contract`, `non-contract legal document`, `general legal question`, or `unsupported`.
   - For drafting requests, verify whether the requested document type is legally coherent before generation begins.
   - Generate a single consolidated clarification pack when required information is missing, instead of asking one-by-one follow-ups during the same drafting attempt.
   - Use structured question groups covering parties, object, term, payment, governing law, dispute resolution, attachments, and document-type-specific requirements.
   - After user answers the intake pack, normalize answers into a structured drafting payload before generation.
   - Combine authoritative legal sources with template examples and externally collected sample forms, while clearly distinguishing:
     - binding legal basis
     - reference template/sample language
     - AI-authored draft text
   - If the request is for a document that is not actually a contract, the system must redirect to the correct document type flow rather than silently generating a mislabeled contract.

3. **Real-Time Contract Review**
   - Analyze drafting progress seamlessly to detect disadvantageous terms.
   - Provide low-latency feedback and highlight risky clauses.
   - Allow review on both:
     - the full generated draft
     - individual clauses proposed during the drafting flow

4. **User & Subscription Management**
   - Allow users to authenticate via standard Single Sign-On (SSO) providers.
   - Manage access tiers, enforcing a freemium model and pay-per-use billing.
   - Provide secure cloud storage for generated PDF contracts with version control.
   - Preserve the user’s structured intake answers so they can revise a draft without re-answering the full questionnaire from scratch.

## 5. Non-Functional Requirements
- **Accuracy**: AI must heavily weight official Precedents (Án lệ) and prioritize updated laws.
- **Performance**: Real-time risk review must execute with ultra-low latency.
- **Scalability**: The system must handle high user loads and constant data ingestion seamlessly.
- **Usability**: Intake questions must be understandable by ordinary users, avoid legal jargon by default, and present missing information as grouped prompts that can be answered in one pass.
- **Transparency**: Draft outputs must clearly separate legal citations from sample/template references and indicate when text is inferred by AI.

## 6. Dependencies & Assumptions
- Needs integration with official external government APIs and state-provided RSS feeds.
- Requires capabilities to extract full-text data from supplementary authoritative legal platforms.
- Requires a source policy that distinguishes official law sources from drafting samples collected from the web.
- Requires a document-type taxonomy so the system can detect when a request is not truly a contract.
- [NEEDS CLARIFICATION: How should we resolve conflicting clauses if a newer law contradicts a template that hasn't been updated yet? Should the AI auto-modify the template or simply flag the risk?]
- [NEEDS CLARIFICATION: What is the exact billing metric for the "pay-per-use" model? Is it per generated contract, per API call, or per token?]
- [NEEDS CLARIFICATION: In terms of user privacy, are user-generated contracts heavily encrypted, and can they be used to improve the general risk-review model?]

## 7. Out of Scope
- Direct legal representation or official legal advice (system is an assistive tool).
- Full automation of bespoke, highly complex M&A contracts beyond the 50 standard templates.
- Autonomous filing, court submission, or procedural legal representation for the user.
