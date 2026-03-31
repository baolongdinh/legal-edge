import { test, expect } from '@playwright/test';

test.describe('AI Consultation Chat Flow', () => {
    test('renders chat greeting and input forms', async ({ page }) => {
        await page.goto('/chat');
        // Initial greeting
        await expect(page.getByText('Tôi là Trợ lý Pháp lý AI của LegalShield')).toBeVisible();
        await expect(page.locator('input[placeholder*="Hỏi về rủi ro"]')).toBeVisible();
    });

    test('can type query and interact with submit', async ({ page }) => {
        await page.goto('/chat');
        const input = page.locator('input[placeholder*="Hỏi về rủi ro"]');

        await input.fill('Tư vấn luật doanh nghiệp');
        expect(await input.inputValue()).toBe('Tư vấn luật doanh nghiệp');

        // Find send button
        const sendBtn = page.getByRole('button').filter({ has: page.locator('.lucide-send') });
        if (await sendBtn.isVisible()) {
            await expect(sendBtn).toBeEnabled();
        }
    });
});
