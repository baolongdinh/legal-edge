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
Provides low-latency risk analysis using Groq.

**Request Body:**
```json
{
  "contract_text": "Clause 5: The tenant must pay a penalty of 50% of the contract value if late by 1 day."
}
```

**Response:**
```json
{
  "risky_clauses": [
    {
      "text": "penalty of 50% of the contract value...",
      "risk_level": "HIGH",
      "explanation": "Theo Điều 301 Luật Thương mại 2005, mức phạt vi phạm không quá 8% giá trị phần nghĩa vụ hợp đồng bị vi phạm.",
      "suggestion": "Reduce penalty to a maximum of 8%."
    }
  ],
  "latency_ms": 450
}
```

## 3. POST `/functions/v1/query-law`
Direct query to the Knowledge Base.

**Request Body:**
```json
{
  "query": "Quy định về bồi thường thiệt hại hợp đồng mua bán hàng hóa"
}
```

**Response:**
```json
{
  "answer": "Theo Luật Thương mại 2005...",
  "sources": [
    {
      "title": "Luật Thương mại 2005",
      "article": "Điều 302",
      "url": "https://vbpl.vn/..."
    }
  ]
}

## 4. POST `/functions/v1/parse-document`
Extracts raw text from uploaded PDF/DOCX files to feed into the Analysis engine.

**Request Body:** `FormData` containing the `file` buffer.
**Response:**
```json
{
  "text_content": "CỘNG HÒA XÃ HỘI...",
  "metadata": { "page_count": 5, "format": "pdf" }
}
```

## 5. POST `/functions/v1/export-pdf`
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

## 6. POST `/functions/v1/create-checkout-session`
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
