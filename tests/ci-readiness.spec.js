const { test, expect } = require('../fixture/test-fixture');
const userData = require('../test-data/users.json');

test.describe('CI readiness: authentication and application-state preconditions', () => {

  test.beforeEach(async ({ loginPage }) => {
    await loginPage.navigate();
  });

  test('CI readiness: required SauceDemo credentials are configured', () => {
    // Presence-only checks - never assert on or print the actual values.
    const hasEmail = typeof process.env.TEST_USER_EMAIL === 'string' && process.env.TEST_USER_EMAIL.length > 0;
    const hasPassword = typeof process.env.TEST_USER_PASSWORD === 'string' && process.env.TEST_USER_PASSWORD.length > 0;

    expect(
      hasEmail && hasPassword,
      'Required SauceDemo test credentials are not configured (TEST_USER_EMAIL / TEST_USER_PASSWORD)'
    ).toBe(true);
  });

  test('Authenticated flow precondition: successful login reaches the inventory page', async ({ loginPage, inventoryPage, page }) => {
    await loginPage.login(process.env.TEST_USER_EMAIL, process.env.TEST_USER_PASSWORD);

    await expect(
      page,
      'Login did not navigate to the inventory page - check authentication/credentials, not inventory locators'
    ).toHaveURL(/\/inventory\.html/);

    expect(await inventoryPage.isInventoryPageDisplayed()).toBe(true);
    await expect(inventoryPage.headerTitle).toHaveText('Products');
  });

  test('Invalid login stays on the login page and never reaches inventory', async ({ loginPage, page }) => {
    await loginPage.login(userData.invalidUser.username, userData.invalidUser.password);

    await expect(page).not.toHaveURL(/\/inventory\.html/);
    await expect(loginPage.errorMessage).toContainText(userData.invalidUser.errorMessage);
  });

  test('Inventory page is fully ready before any inventory action is attempted', async ({ loginPage, inventoryPage, page }) => {
    await loginPage.login(process.env.TEST_USER_EMAIL, process.env.TEST_USER_PASSWORD);
    await expect(page).toHaveURL(/\/inventory\.html/);

    await expect(inventoryPage.headerTitle).toBeVisible();
    await expect(inventoryPage.addToCartBackpackBtn).toHaveCount(1);
    await expect(inventoryPage.addToCartBackpackBtn).toBeVisible();
  });

  test('Add to cart updates the cart badge and swaps the backpack button state', async ({ loginPage, inventoryPage, page }) => {
    await loginPage.login(process.env.TEST_USER_EMAIL, process.env.TEST_USER_PASSWORD);
    await expect(page).toHaveURL(/\/inventory\.html/);

    await inventoryPage.addBackpackToCart();

    await expect(inventoryPage.cartBadge).toHaveText('1');
    await expect(page.locator('#add-to-cart-sauce-labs-backpack')).toHaveCount(0);
    await expect(page.locator('#remove-sauce-labs-backpack')).toBeVisible();
  });

  test('Cart shows exactly the added backpack after add-to-cart', async ({ loginPage, inventoryPage, cartPage }) => {
    await loginPage.login(process.env.TEST_USER_EMAIL, process.env.TEST_USER_PASSWORD);

    await inventoryPage.addBackpackToCart();
    await inventoryPage.cartBadge.click();

    await expect(cartPage.cartItem).toHaveCount(1);
    await expect(cartPage.cartItem).toContainText('Sauce Labs Backpack');
  });

  test('APPLICATION STATE: invalid login fails at the authentication boundary, never attempts inventory locator resolution', async ({ loginPage, page }) => {
    await loginPage.login(userData.invalidUser.username, userData.invalidUser.password);

    // Application-state check FIRST, before any inventory locator is ever touched.
    const reachedInventory = page.url().includes('/inventory.html');
    expect(
      reachedInventory,
      'Login must fail at the authentication boundary, not be discovered later via a missing inventory locator'
    ).toBe(false);

    await expect(loginPage.errorMessage).toBeVisible();

    // Deliberately NOT calling inventoryPage.addBackpackToCart() here. Doing
    // so would be exactly the anti-pattern this test documents: treating
    // "we never left the login page" (an application-state failure) as a
    // locator problem for deterministic fallback or AI healing to solve.
    // Self-healing exists for "the DOM changed under an otherwise-correct
    // state", not for "we are on the wrong page entirely".
  });
});
