import { test, expect } from '@playwright/test';

test.describe('Document Risk Upload Flow', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/dashboard');
        // Playwright tests that don't inject auth tokens will be redirected 
        // to '/' automatically if the PrivateRoute blocks them. Assuming we inject auth
        // or bypass PrivateRoute in a test DB context.
    });

    test('renders the contract uploader', async ({ page }) => {
        // Just verify the uploader visual component without necessarily being logged in 
        // (if we access the risk badges/viewer directly)
        await page.goto('/analysis');
        const uploadBox = page.getByText(/Kéo thả file hợp đồng vào đây/i);
        await expect(uploadBox).toBeVisible({ timeout: 10000 });
    });

    test('can select file for analysis', async ({ page }) => {
        await page.goto('/analysis');
        const fileChooserPromise = page.waitForEvent('filechooser');

        // This button normally triggers the filechooser
        await page.getByText('chọn từ máy tính').click();
        const fileChooser = await fileChooserPromise;
        // Mock setting a file
        expect(fileChooser.isMultiple()).toBe(false);
    });
});
