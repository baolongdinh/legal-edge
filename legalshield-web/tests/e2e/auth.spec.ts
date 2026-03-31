import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
    test('renders login and signup options', async ({ page }) => {
        await page.goto('/');

        // Click nav login button
        const navLoginBtn = page.getByRole('button', { name: 'Đăng Nhập' });
        await navLoginBtn.click();

        await expect(page.getByRole('heading', { name: 'Đăng Nhập / Đăng Ký' })).toBeVisible();
        await expect(page.locator('input[type="email"]')).toBeVisible();
        await expect(page.locator('input[type="password"]')).toBeVisible();
    });

    // In a real E2E with test DB we would perform a signup, 
    // but here we validate that the modal mounts cleanly.
    test('can toggle to signup mode', async ({ page }) => {
        await page.goto('/');
        await page.getByRole('button', { name: 'Đăng Nhập' }).click();
        const switcher = page.getByText(/Chưa có tài khoản|Đăng ký ngay/i).last();
        if (switcher) await switcher.click();
        await expect(page.locator('input[placeholder*="tên"]')).toBeVisible();
    });
});
