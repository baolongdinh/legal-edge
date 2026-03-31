# Legal Citation Accuracy Eval

Mục tiêu của bộ eval này là kiểm tra pipeline `retrieval -> verification -> answer contract` cho 4 trạng thái cốt lõi:

1. `official_verified`
2. `secondary_verified`
3. `unsupported`
4. `conflicted`

## Tiêu chí pass

- Mọi legal claim có citation object hoặc bị downgrade rõ ràng.
- Không render URL ngoài retrieval result thật.
- `official_verified` chỉ pass khi có ít nhất 1 nguồn Tier 1.
- `secondary_verified` chỉ pass khi không có Tier 1 nhưng có nguồn Tier 2 hợp lệ.
- `unsupported` phải abstain, không được trả lời chắc như đúng rồi.
- `conflicted` phải giữ citations hợp lệ nhưng cảnh báo phần claim chưa đủ căn cứ.

## Fixture Matrix

| Case | Goal | Expected Status |
|------|------|-----------------|
| `official_max_penalty` | Điều 301 Luật Thương mại | `official_verified` |
| `secondary_only_summary` | Chỉ có nguồn aggregator | `secondary_verified` |
| `unsupported_wrong_article` | Claim không khớp evidence | `unsupported` |
| `mixed_supported_and_unsupported` | Một phần answer đúng, một phần trôi | `conflicted` |

## Nguồn fixture

Các fixture mẫu được định nghĩa ở:

- [legal-citation-fixtures.json](/home/aiozlong/DATA/CODE/SELF_PROD/LegalEdge/docs/features/legal-citation-fixtures.json)
- [types.test.ts](/home/aiozlong/DATA/CODE/SELF_PROD/LegalEdge/supabase/functions/shared/types.test.ts)

## Cách dùng

- Unit-level: chạy `types.test.ts` khi môi trường có `deno`.
- Manual/API-level: dùng fixture JSON để so sánh `verification_status`, `citations[]`, `claim_audit[]`, `abstained`.
