const { test, expect } = require('../fixture/test-fixture');

test.describe('Login Flow Suite', () => {

  test.beforeEach(async ({ loginPage }) => {
    await loginPage.navigate();
  });
test.afterEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
  });

  test('Verify login page is displayed', async ({ loginPage }) => {
    await expect(loginPage.loginpageLogo).toBeVisible();
  });
  });
