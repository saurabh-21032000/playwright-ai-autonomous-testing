const { test, expect } = require('../fixture/test-fixture');
const userData = require('../test-data/users.json');
const checkoutData = require('../test-data/checkout.json');

test.describe('Expanded SauceDemo E2E Suite', () => {

  test.beforeEach(async ({ loginPage }) => {
    await loginPage.navigate();
  });

  test.afterEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
  });

  test('Negative Test - Locked out user error validation', async ({ loginPage, page }) => {
    await loginPage.login(userData.invalidUser.username, userData.invalidUser.password);
    await expect(page).not.toHaveURL(/\/inventory\.html/);
    await expect(loginPage.errorMessage).toContainText(userData.invalidUser.errorMessage);
  });

  test('Full Purchase E2E Workflow', async ({ loginPage, inventoryPage, cartPage, checkoutPage, page }) => {
    // 1. Login
    await loginPage.login(process.env.TEST_USER_EMAIL, process.env.TEST_USER_PASSWORD);

    // Fail fast at the authentication boundary instead of timing out later
    // on an inventory locator if login did not actually succeed.
    await expect(
      page,
      'Login did not navigate to the inventory page - check authentication/credentials, not inventory locators'
    ).toHaveURL(/\/inventory\.html/);

    // 2. Add to cart & navigate to cart
    await inventoryPage.addBackpackToCart();
    await inventoryPage.cartBadge.click();

    // 3. Checkout flow
    await cartPage.proceedToCheckout();
    await checkoutPage.fillShippingDetails(
      checkoutData.validCustomer.firstName,
      checkoutData.validCustomer.lastName,
      checkoutData.validCustomer.postalCode
    );
    await checkoutPage.finishCheckout();

    // 4. Assertion
    await expect(checkoutPage.completeHeader).toHaveText('Thank you for your order!');
  });

  test('Remove item from cart flow', async ({ loginPage, inventoryPage, cartPage, page }) => {
    await loginPage.login(process.env.TEST_USER_EMAIL, process.env.TEST_USER_PASSWORD);

    await expect(
      page,
      'Login did not navigate to the inventory page - check authentication/credentials, not inventory locators'
    ).toHaveURL(/\/inventory\.html/);

    await inventoryPage.addBackpackToCart();
    await inventoryPage.cartBadge.click();

    await cartPage.removeItem();
    await expect(cartPage.cartItem).toHaveCount(0);
  });
});