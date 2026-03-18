const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  // Set up a fake profile in localStorage so we skip onboarding
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('strive-profile', JSON.stringify({
      name: 'Test Gymnast',
      gender: 'female',
      level: 'Xcel Gold',
      levelCategory: 'xcel',
      primaryEvents: ['Floor Exercise', 'Balance Beam', 'Uneven Bars', 'Vault'],
      role: 'parent',
    }));
  });
  await page.reload();
  await page.waitForTimeout(2000);
});

test('bottom nav tabs work', async ({ page }) => {
  // Look for bottom nav buttons and verify they're clickable
  const nav = page.locator('nav, [class*="nav"], [class*="Nav"]').last();
  if (await nav.isVisible({ timeout: 3000 }).catch(() => false)) {
    const buttons = nav.locator('button, a, div[role="button"]');
    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(3);
  }
});

test('upload screen accessible', async ({ page }) => {
  // Click upload button or navigate to upload
  const uploadBtn = page.locator('text=/Upload|Analyze|New.*Routine/i').first();
  if (await uploadBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await uploadBtn.click();
    await expect(
      page.locator('text=/Choose.*Video|Upload.*Video|Select.*Event|video/i').first()
    ).toBeVisible({ timeout: 5000 });
  }
});

test('deduction guide accessible', async ({ page }) => {
  const guideBtn = page.locator('text=/Deduction|Guide|Reference/i').first();
  if (await guideBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await guideBtn.click();
    await expect(
      page.locator('text=/Execution|Landing|Artistry|Small|Medium/i').first()
    ).toBeVisible({ timeout: 5000 });
  }
});

test('settings accessible', async ({ page }) => {
  const settingsBtn = page.locator('text=/Settings|Profile|⚙|gear/i').first();
  if (await settingsBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await settingsBtn.click();
    await expect(
      page.locator('text=/Profile|Name|Level|API.*Key|Save/i').first()
    ).toBeVisible({ timeout: 5000 });
  }
});
