# API Contracts: Legal Doc AI

These APIs are implemented as **Supabase Edge Functions** (TypeScript/Deno) to ensure a fully serverless architecture.

## 1. POST `/functions/v1/generate-contract`
Generates a contract by applying RAG over legal documents and templates.

**Request Body:**
```json
{
  "template_id": "uuid",
  "prompt": "Draft a warehouse lease agreement for 12 months in HCMC",
  "parameters": {
    "party_a": "Company A",
    "party_b": "Company B",
    "duration_months": 12,
    "location": "HCMC"
  }
}
```

**Response (Streaming or JSON):**
```json
{
  "contract_id": "uuid",
  "content": "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM...",
  "citations": [
    {
      "chunk_id": "uuid",
      "article": "Điều 15 Luật Thương mại 2005",
      "relevance_score": 0.92
    }
  ]
}
```

## 2. POST `/functions/v1/risk-review`
Provides low-latency risk analysis with verified legal evidence.

**Request Body:**
```json
{
  "clause_text": "Clause 5: The tenant must pay a penalty of 50% of the contract value if late by 1 day.",
  "mode": "fast"
}
```

**Response:**
```json
{
  "risks": [
    {
      "clause_ref": "Điều 5",
      "level": "critical",
      "description": "Theo Điều 301 Luật Thương mại 2005, mức phạt vi phạm không quá 8% giá trị phần nghĩa vụ hợp đồng bị vi phạm.",
      "citation_text": "Điều 301 Luật Thương mại 2005",
      "citation_url": "https://vbpl.vn/...",
      "source_domain": "vbpl.vn",
      "source_title": "Luật Thương mại 2005",
      "source_excerpt": "...",
      "verification_status": "official_verified",
      "evidence": {
        "title": "Luật Thương mại 2005",
        "url": "https://vbpl.vn/...",
        "source_domain": "vbpl.vn",
        "source_type": "official",
        "matched_article": "điều 301"
      }
    }
  ],
  "evidence": [],
  "verification_summary": {
    "requires_citation": true,
    "verification_status": "official_verified",
    "citation_count": 1,
    "official_count": 1,
    "secondary_count": 0,
    "unsupported_claim_count": 0
  },
  "cached": false
}
```

## 3. POST `/functions/v1/legal-chat`
Verified legal advisory chat with structured citations.

**Request Body:**
```json
{
  "message": "Theo luật Việt Nam, mức phạt vi phạm hợp đồng thương mại tối đa là bao nhiêu?",
  "history": [],
  "document_context": "optional uploaded contract text"
}
```

**Response:**
```json
{
  "reply": "Theo Luật Thương mại 2005, mức phạt vi phạm ...",
  "citations": [
    {
      "citation_text": "Điều 301 Luật Thương mại 2005",
      "citation_url": "https://vbpl.vn/...",
      "source_domain": "vbpl.vn",
      "source_title": "Luật Thương mại 2005",
      "source_excerpt": "...",
      "source_type": "official",
      "verification_status": "official_verified"
    }
  ],
  "evidence": [
    {
      "title": "Luật Thương mại 2005",
      "url": "https://vbpl.vn/...",
      "source_domain": "vbpl.vn",
      "source_type": "official"
    }
  ],
  "verification_status": "official_verified",
  "verification_summary": {
    "requires_citation": true,
    "verification_status": "official_verified",
    "citation_count": 1,
    "official_count": 1,
    "secondary_count": 0,
    "unsupported_claim_count": 0
  },
  "claim_audit": [
    {
      "claim": "Theo Luật Thương mại 2005, mức phạt vi phạm ...",
      "supported": true,
      "matched_citation_url": "https://vbpl.vn/...",
      "matched_source_domain": "vbpl.vn",
      "score": 88
    }
  ],
  "abstained": false,
  "cached": false
}
```

## 4. POST `/functions/v1/contract-qa`
Verified Q&A over uploaded contract context plus external legal evidence when needed.

**Request Body:**
```json
{
  "contract_id": "uuid",
  "query": "Điều khoản phạt này có vượt trần theo Luật Thương mại không?"
}
```

**Response:**
```json
{
  "answer": "Điều khoản này có dấu hiệu vượt trần ...",
  "citations": [
    {
      "citation_text": "Điều 301 Luật Thương mại 2005",
      "citation_url": "https://vbpl.vn/...",
      "source_domain": "vbpl.vn",
      "verification_status": "official_verified"
    }
  ],
  "verification_summary": {
    "requires_citation": true,
    "verification_status": "official_verified",
    "citation_count": 1,
    "official_count": 1,
    "secondary_count": 0,
    "unsupported_claim_count": 0
  },
  "claim_audit": [
    {
      "claim": "Điều khoản này có dấu hiệu vượt trần ...",
      "supported": true
    }
  ],
  "abstained": false,
  "cached": false
}
```

## 5. POST `/functions/v1/parse-document`
Extracts raw text from uploaded PDF/DOCX files to feed into the Analysis engine.

**Request Body:** `FormData` containing the `file` buffer.
**Response:**
```json
{
  "text_content": "CỘNG HÒA XÃ HỘI...",
  "metadata": { "page_count": 5, "format": "pdf" }
}
```

## 6. POST `/functions/v1/export-pdf`
Converts the HTML/Markdown draft from the Contract Editor into a formal A4 PDF matching Vietnamese legal standards.

**Request Body:**
```json
{
  "contract_id": "uuid",
  "html_content": "<h1>Hợp đồng...</h1>"
}
```
**Response:**
```json
{
  "pdf_url": "https://[project].supabase.co/storage/v1/object/public/user-contracts/...",
  "size_kb": 250
}
```

## 7. POST `/functions/v1/create-checkout-session`
Initializes a payment gateway session (e.g., Stripe or PayOS) for the Pricing & Tiers upgrades.

**Request Body:**
```json
{
  "plan_id": "pro_monthly",
  "success_url": "https://app.legalshield.vn/dashboard?success=true",
  "cancel_url": "https://app.legalshield.vn/pricing?canceled=true"
}
```
**Response:**
```json
{
  "checkout_url": "https://checkout.stripe.com/c/pay/..."
}
```
```
