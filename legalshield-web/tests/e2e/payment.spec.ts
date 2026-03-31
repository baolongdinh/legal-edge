import { test, expect } from '@playwright/test';

test.describe('Premium Subscription Payment Flow', () => {
    test('renders pricing table and subscription plans', async ({ page }) => {
        await page.goto('/pricing');

        await expect(page.getByRole('heading', { name: 'Đầu tư cho sự an toàn pháp lý' })).toBeVisible();
        await expect(page.getByText('Pro')).toBeVisible();
        await expect(page.getByText('Enterprise')).toBeVisible();
    });

    test('payment options appear correctly', async ({ page }) => {
        await page.goto('/pricing');
        // Find "Nâng Cấp Pro" buttons usually visible
        const upgradeBtns = page.getByRole('button', { name: /Nâng Cấp Pro|Liên hệ Sale/i });
        await expect(upgradeBtns.first()).toBeVisible();
    });
});
