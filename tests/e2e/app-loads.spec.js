const { test, expect } = require('@playwright/test');

test('app loads splash screen', async ({ page }) => {
  await page.goto('/');
  // Should see STRIVE branding or Get Started button within 5 seconds
  await expect(page.locator('text=/STRIVE|Get Started/i').first()).toBeVisible({ timeout: 10000 });
});

test('no console errors on load', async ({ page }) => {
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.goto('/');
  await page.waitForTimeout(3000);
  // Filter out known non-critical errors (e.g., favicon, dev warnings)
  const critical = errors.filter(e => !e.includes('favicon') && !e.includes('DevTools') && !e.includes('React DevTools'));
  expect(critical).toHaveLength(0);
});
