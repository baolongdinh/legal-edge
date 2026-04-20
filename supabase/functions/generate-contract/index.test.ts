import { assertEquals, assert } from "https://deno.land/std@0.177.0/testing/asserts.ts"
import { checkAICompleteness, getRequirementsForDocumentType, buildDraftPrompt } from "./index.ts"

Deno.test("buildDraftPrompt includes requirement and reference hints", async () => {
  const documentRule = {
    type: 'lease_contract',
    label: 'Hợp đồng thuê tài sản',
    isContract: true,
    searchQuery: '',
    keywords: [],
    questions: [],
  }
  const payload = buildDraftPrompt(documentRule as any, 'Hợp đồng thuê nhà', 'Hợp đồng thuê nhà', 'Hợp đồng thuê nhà', [
    { section: 'Tài sản', format_critical: true, user_must_provide: ['Địa chỉ'], user_can_default: ['Diện tích'] }
  ],
  [{ title: 'Mẫu', content: 'Nội dung', url: 'https://example.com' }], '', [], undefined, undefined, undefined, undefined, undefined)

  assert(payload.systemPrompt.includes('Tài sản'))
  assert(payload.instructionText.includes('Yêu cầu người dùng'))
})

Deno.test("generate-contract completeness should ask clarity questions when required inputs are missing", async () => {
  const result = await checkAICompleteness(
    "Hợp đồng thuê nhà của tôi",
    {},
    "Hợp đồng thuê tài sản / thuê nhà",
    "fake-gemini-key",
    undefined,
    "",
    undefined,
    0
  )

  assertEquals(result.status, "NEEDS_INFO")
  assert(result.questions && result.questions.length > 0)
  assertEquals(result.missing_count, 3)
})

Deno.test("generate-contract completeness should complete when required inputs are provided", async () => {
  const result = await checkAICompleteness(
    "Hợp đồng thuê nhà của tôi",
    {
      "Địa chỉ bất động sản": "Căn hộ số 1",
      "Giá tiền/tháng": "5.000.000 VNĐ",
      "Thời gian thuê (tháng/năm)": "12 tháng",
    },
    "Hợp đồng thuê tài sản / thuê nhà",
    "fake-gemini-key",
    undefined,
    "",
    undefined,
    1
  )

  assertEquals(result.status, "COMPLETE")
  assert(result.completion_percent >= 80)
})

Deno.test("getRequirementsForDocumentType returns values for rental_contract", async () => {
  const requirements = await getRequirementsForDocumentType("rental_contract")
  assert(Array.isArray(requirements))
  assert(requirements.length > 0)
})
