# API Contracts: Legal Doc AI

These APIs are implemented as **Supabase Edge Functions** (TypeScript/Deno) to ensure a fully serverless architecture.

## 1. POST `/functions/v1/generate-contract`
Generates a contract or contract-ready draft by combining intake answers, legal retrieval, and curated/sample templates.

**Request Body:**
```json
{
  "template_id": "uuid",
  "prompt": "Soạn hợp đồng thuê nhà",
  "mode": "draft",
  "document_type": "residential_lease_contract",
  "response_mode": "json",
  "current_draft": "optional existing draft text",
  "selection_context": "optional selected clause text",
  "parameters": {
    "landlord_name": "Nguyễn Văn A",
    "tenant_name": "Trần Thị B",
    "property_address": "Quận 7, TP.HCM",
    "term_months": 12,
    "rent_amount_vnd": 12000000
  },
  "intake_answers": [
    {
      "question_id": "property_address",
      "question": "Địa chỉ nhà cho thuê là gì?",
      "answer": "Quận 7, TP.HCM"
    }
  ]
}
```

**Alternative Intake Response:**
```json
{
  "status": "needs_clarification",
  "document_type": "residential_lease_contract",
  "document_label": "Hợp đồng thuê nhà ở",
  "clarification_pack": {
    "intro": "Tôi cần thêm một số thông tin trước khi soạn bản nháp hoàn chỉnh.",
    "groups": [
      {
        "group_title": "Thông tin các bên",
        "questions": [
          {
            "id": "landlord_name",
            "label": "Tên bên cho thuê",
            "required": true,
            "placeholder": "Nguyễn Văn A"
          }
        ]
      }
    ]
  }
}
```

**Response (Streaming or JSON):**
```json
{
  "content": "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM...",
  "document_type": "residential_lease_contract",
  "source_action": "generate",
  "citations": [
    {
      "citation_text": "Điều 472 Bộ luật Dân sự 2015",
      "citation_url": "https://vbpl.vn/...",
      "source_domain": "vbpl.vn",
      "verification_status": "official_verified"
    }
  ],
  "template_references": [
    {
      "title": "Mẫu hợp đồng thuê nhà tham khảo",
      "source_url": "https://...",
      "source_type": "sample_template",
      "provenance_status": "needs_review"
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
  "claim_audit": []
}
```

**Behavior Rules:**
- If the request is not actually a contract, the endpoint should return `status: "document_type_mismatch"` with a suggested legal document type and clarification pack.
- If key information is missing, the endpoint should return `status: "needs_clarification"` with a grouped question list so the frontend can ask the user once.
- Binding legal citations and sample/template references must be returned in separate arrays.

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
