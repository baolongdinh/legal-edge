import { test, expect } from '@playwright/test'

test.describe('Draft + Risk Review Core Flow', () => {
    test('Draft editor flows: request -> research -> result or clarify', async ({ page }) => {
        await page.goto('/draft')
        await expect(page.getByText('Yêu cầu')).toBeVisible()

        await page.getByPlaceholder('Mô tả hợp đồng hoặc văn bản').fill('Tôi cần hợp đồng mua bán tài sản là căn hộ 2 phòng ngủ tại TP.HCM')
        await page.getByRole('button', { name: /Gửi|Tạo bản nháp|Soạn/g }).click()

        // Should show researching state then switch to result or clarification
        await expect(page.getByText('Đang nghiên cứu pháp luật')).toBeVisible()

        const resultSection = page.locator('text=/Hợp đồng|Làm rõ thông tin/').first()
        await expect(resultSection).toBeVisible({ timeout: 30000 })
    })

    test('Contract analysis risk review should perform deep audit without crash', async ({ page }) => {
        await page.goto('/contract-analysis')

        await expect(page.getByText('Sẵn sàng kiểm tra')).toBeVisible({ timeout: 10000 })

        const deepAudit = page.getByRole('button', { name: /Deep Audit|Phân tích chuyên sâu/i })
        await deepAudit.click()

        await expect(page.getByText(/Phân tích chuyên sâu hoàn tất|Đang thực hiện/)).toBeVisible({ timeout: 120000 })
    })
})
