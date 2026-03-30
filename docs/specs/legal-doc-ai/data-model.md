# Data Model: Legal Doc AI

This document outlines the database schema for the Legal Doc AI feature, hosted on Supabase (PostgreSQL + pgvector).

## ER Diagram
```mermaid
erDiagram
    USERS ||--o{ SUBSCRIPTIONS : has
    USERS ||--o{ CONTRACTS : owns
    DOCUMENTS ||--o{ DOCUMENT_CHUNKS : contains
    TEMPLATES ||--o{ CONTRACTS : "basis for"

    USERS {
        uuid id PK
        string email
        string full_name
        string avatar_url
        timestamp created_at
    }

    SUBSCRIPTIONS {
        uuid id PK
        uuid user_id FK
        string plan_type "free, pro, enterprise"
        int api_calls_used
        int api_calls_limit
        timestamp current_period_end
    }

    DOCUMENTS {
        uuid id PK
        string source_type "vbpl, toaan, congbao"
        string document_number "e.g., 36/2005/QH11"
        string title
        string url
        date effective_date
        string status "active, expired"
        timestamp ingested_at
    }

    DOCUMENT_CHUNKS {
        uuid id PK
        uuid document_id FK
        string article_number "e.g., Điều 15"
        text content
        vector embedding "768-dim (Gemini embedding)"
        jsonb metadata
    }

    TEMPLATES {
        uuid id PK
        string name
        string category "e.g., Lease, Employment"
        string storage_path "Supabase Storage URL"
        text structure_summary
        timestamp created_at
    }

    CONTRACTS {
        uuid id PK
        uuid user_id FK
        uuid template_id FK "nullable for custom contracts"
        string title
        text content_draft
        string storage_path "Supabase Storage URL for PDF"
        jsonb risk_analysis "Results from Groq"
        timestamp created_at
        timestamp updated_at
    }
```

## Vector Search configuration
`DOCUMENT_CHUNKS.embedding` will be indexed using **HNSW** for fast approximate nearest neighbor (ANN) similarity search:
```sql
CREATE INDEX ON document_chunks USING hnsw (embedding vector_cosine_ops);
```
