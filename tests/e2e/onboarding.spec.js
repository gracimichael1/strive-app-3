const { test, expect } = require('@playwright/test');

test('complete onboarding flow', async ({ page }) => {
  await page.goto('/');

  // Click through splash(es) — there may be two (App.js splash + LegacyApp splash)
  for (let attempt = 0; attempt < 2; attempt++) {
    const startBtn = page.locator('text=/Get Started|Begin|Start/i').first();
    if (await startBtn.isVisible({ timeout: attempt === 0 ? 8000 : 3000 }).catch(() => false)) {
      await startBtn.click();
      await page.waitForTimeout(800);
    }
  }

  // Step 0: Select role (Parent)
  const parentBtn = page.locator('text=/Parent/i').first();
  if (await parentBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await parentBtn.click();
    await page.waitForTimeout(300);
    // Click Continue
    const contBtn = page.locator('button:has-text("Continue")').first();
    if (await contBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await contBtn.click();
      await page.waitForTimeout(300);
    }
  }

  // Step 1: Fill name
  const nameInput = page.locator('input[placeholder*="name" i], input[type="text"]').first();
  if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await nameInput.fill('Test Gymnast');
    const contBtn = page.locator('button:has-text("Continue")').first();
    if (await contBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await contBtn.click();
      await page.waitForTimeout(300);
    }
  }

  // Step 2: Select gender (Women's artistic)
  const wagBtn = page.locator('text=/Women|Female/i').first();
  if (await wagBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await wagBtn.click();
    await page.waitForTimeout(300);
    const contBtn = page.locator('button:has-text("Continue")').first();
    if (await contBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await contBtn.click();
      await page.waitForTimeout(300);
    }
  }

  // Step 3: Select level category and level
  const xcelBtn = page.locator('text=/Xcel/i').first();
  if (await xcelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await xcelBtn.click();
    await page.waitForTimeout(500);
  }
  const goldBtn = page.locator('text=/Xcel Gold/i').first();
  if (await goldBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await goldBtn.click();
    await page.waitForTimeout(300);
    const contBtn = page.locator('button:has-text("Continue")').first();
    if (await contBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await contBtn.click();
      await page.waitForTimeout(300);
    }
  }

  // Step 4: Select events
  const floorBtn = page.locator('text=/Floor Exercise/i').first();
  if (await floorBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await floorBtn.click();
    await page.waitForTimeout(300);
    const contBtn = page.locator('button:has-text("Continue")').first();
    if (await contBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await contBtn.click();
      await page.waitForTimeout(300);
    }
  }

  // Step 5: Goals — click "Start analyzing"
  const startAnalyzingBtn = page.locator('button:has-text("Start analyzing"), button:has-text("Continue"), button:has-text("Finish")').first();
  if (await startAnalyzingBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await startAnalyzingBtn.click();
  }

  // Should eventually reach dashboard (look for common dashboard elements)
  await expect(
    page.locator('text=/Dashboard|Upload|Analyze|Recent|Home/i').first()
  ).toBeVisible({ timeout: 15000 });
});
