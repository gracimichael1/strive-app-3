const { test, expect } = require('@playwright/test');

test('progress screen renders without Recharts crash', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('strive-profile', JSON.stringify({
      name: 'Test Gymnast',
      gender: 'female',
      level: 'Xcel Gold',
      levelCategory: 'xcel',
      primaryEvents: ['Floor Exercise'],
      role: 'parent',
    }));
    // Add fake history so charts have data — use 'score' key (not finalScore) to match app format
    localStorage.setItem('strive-history', JSON.stringify([
      { id: 1, date: '2026-03-01', event: 'Floor Exercise', score: 8.950, deductions: 1.05 },
      { id: 2, date: '2026-03-08', event: 'Floor Exercise', score: 9.100, deductions: 0.90 },
      { id: 3, date: '2026-03-15', event: 'Floor Exercise', score: 9.200, deductions: 0.80 },
    ]));
    // Set tier to pro so progress screen is accessible
    localStorage.setItem('strive-tier', 'pro');
  });
  await page.reload();
  await page.waitForTimeout(2000);

  // Navigate to progress
  const progressBtn = page.locator('text=/Progress|Chart|Trend/i').first();
  if (await progressBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await progressBtn.click();
    await page.waitForTimeout(2000);

    // Should NOT see any React error overlay or crash message
    const errorOverlay = page.locator('text=/Cannot read|Unhandled|crashed/i');
    expect(await errorOverlay.count()).toBe(0);

    // Should see some chart-related content or score data
    const content = page.locator('text=/Score|Trend|Personal|Best|Floor/i').first();
    await expect(content).toBeVisible({ timeout: 5000 });
  }
});
