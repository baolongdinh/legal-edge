# LegalShield - AI-Powered Contract Auditor & Assistant

LegalShield is a modern Progressive Web App (PWA) designed to automate legal contract review, risk detection, and clause optimization using advanced Artificial Intelligence.

## 🚀 Key Features

- **AI Risk Analysis**: Automatically detect legal risks (Critical, Moderate, Note) in seconds using LLMs.
- **High-Performance Document Processing**: Offloads heavy PDF/DOCX parsing to Web Workers (via Comlink) to maintain a smooth 60fps UI.
- **Token-Saving Deduplication**: Hash-based content identification prevents redundant AI analysis, significantly reducing API costs.
- **Offline-First Persistence**: Leverages IndexedDB (idb-keyval) and Zustand to cache analysis results locally for offline access.
- **Hybrid Search Architecture**: Combines Full-Text Search (FTS) and Vector Search (pgvector) for lightning-fast retrieval of legal precedents and similar clauses.
- **Multi-Channel Payments**: Integrated Stripe, MoMo, and VNPAY for seamless subscription upgrades.

## 🧜 Core Workflows

### 1. Contract Analysis Pipeline
This workflow highlights our "Zero UI Lag" strategy using Web Workers and "Token-Saving" deduplication.

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend (Main Thread)
    participant W as Web Worker (Comlink)
    participant S as Supabase (DB/RPC)
    participant E as Edge Function (AI)

    U->>F: Upload Contract (PDF/DOCX)
    F->>W: Send ArrayBuffer
    W->>W: Generate SHA-256 Hash
    W->>F: Return Hash
    F->>S: RPC: check_contract_hash(hash)
    alt Cache Hit
        S-->>F: Return Existing Analysis
        F->>U: Display Cached Results (Instant)
    else Cache Miss
        F->>W: Parse Document to Text
        W-->>F: Return Extracted Text
        F->>S: Register Document (Pending)
        F->>E: Invoke risk-review (Gemini/Groq)
        E->>S: Store Findings & Update Status
        S-->>F: Realtime Update
        F->>U: Display AI Analysis
    end
```

## 🛠 Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS, Zustand, Lucide Icons.
- **Backend/Infrastructure**: Supabase (PostgreSQL + pgvector).
- **AI Engine**: Edge Functions (Gemini & Groq), Semantic Cache with RLS.
- **Automation**: Makefile, PWA, Web Workers.

## 📋 Prerequisites

- **Node.js**: v18+
- **Supabase CLI**: For database & Edge Function management.
- **Docker**: (Required) for local Edge Function testing and development.

## ⚙️ Setup & Installation

### 1. Clone the repository and install dependencies

```bash
git clone <your-repo-url>
cd LegalEdge

# Install frontend dependencies
cd legalshield-web
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the `legalshield-web/` directory:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Configure Secrets for Supabase Edge Functions in `supabase/.env`:
```env
GEMINI_API_KEYS=key1,key2
STRIPE_SECRET_KEY=...
MOMO_SECRET_KEY=...
VNPAY_TMN_CODE=...
```

### 3. Initialize Database & Functions

To deploy to a live Supabase project:
```bash
# Link to your Supabase project
npx supabase link --project-ref <your-project-id>

# Deploy all database migrations and edge functions
make deploy-supabase
```

### 4. Run the Application

```bash
cd legalshield-web
npm run dev
```

### 5. AI Knowledge Ingestion (RAG)

To empower the AI with legal knowledge and contract templates, you must seed the database:

1.  **Configure API Keys**: Ensure `JINA_API_KEY` (primary embedding) and `GEMINI_API_KEYS` are set in `supabase/.env`.
2.  **Crawl & Index**:
    ```bash
    # 1. Crawl latest legal sources from the web
    make crawl-templates
    
    # 2. Seed and Embed (Jina/Voyage/Gemini)
    # This will chunk documents and generate the 768-D vectors
    make init-templates
    ```
3.  **Full Pipeline**: Run `make sync-templates` to perform the entire end-to-end crawl -> refine -> index workflow.

## 🧠 Dual-Source Deep RAG Architecture

LegalShield implements a state-of-the-art **Deep RAG** pipeline that ensures every AI response is grounded in both authoritative internal law and real-time web evidence. This architecture is unified across all core services (`legal-chat`, `generate-contract`, `risk-review`).

### 1. High-Precision Retrieval Flow

```mermaid
flowchart TD
    subgraph Input
        A[User Query / Contract Clause]
    end

    subgraph Parallel_Retrieval [Step 1: Parallel Multi-Source Retrieval]
        B1[(Internal Law DB)] -- Hybrid Search: Vector + FTS --> C1[15+ Official Articles]
        B2{External Web: Exa} -- Live Real-time Search --> C2[5+ Verified Web Links]
    end

    subgraph Reranking [Step 2: Global Intelligence Rerank]
        D[Global Candidate Pool] -- All Sources Merged --> E{Jina Reranker v2}
        E -- Semantic Cross-Encoder --> F[Top 5 'Golden' Evidence]
    end

    subgraph Generation [Step 3: Grounded Synthesis]
        F --> G[Gemini 1.5 Flash / Groq]
        G -- Strict In-line Citations --> H[Verified Legal Response]
    end

    A --> B1
    A --> B2
    C1 --> D
    C2 --> D
```

### 2. Key Components
- **Hybrid Search**: Combines semantic embeddings (Vector) with keyword matching (Full-Text Search) in PostgreSQL to ensure specific Article numbers (e.g., "Điều 5") are never missed.
- **Global Reranking**: Uses **Jina Reranker v2** to eliminate "Lost in the Middle" bias. It evaluates internal matches and web links on the same semantic scale.
- **Semantic Caching**: AI responses are hashed and stored. Similar future queries are served instantly from the cache, reducing API latency by 90%.
- **Hallucination Firewall**: The LLM is restricted to the "Golden Evidence" pool and must provide citations for every legal claim.

## 📂 Project Structure

- `/legalshield-web`: React frontend source code.
  - `/src/workers`: Performance-critical file parsing (Web Workers).
  - `/src/store`: Global state management (Zustand).
  - `/src/lib`: Document parsing logic & Supabase client.
- `/supabase`: Backend configuration.
  - `/migrations`: Optimized SQL scripts (Vector search, Cache, Materialized Views).
  - `/functions`: AI processing and Payment gateway Edge Functions.
- `Makefile`: Automation commands for streamlined deployment.
