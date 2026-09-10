const base = require('@playwright/test');
const { LoginPage } = require('../pages/login.page');
const { InventoryPage } = require('../pages/inventory.page');
const { CartPage } = require('../pages/cart.page');
const { CheckoutPage } = require('../pages/checkout.page');

exports.test = base.test.extend({
  loginPage: async ({ page }, use) => { await use(new LoginPage(page)); },
  inventoryPage: async ({ page }, use) => { await use(new InventoryPage(page)); },
  cartPage: async ({ page }, use) => { await use(new CartPage(page)); },
  checkoutPage: async ({ page }, use) => { await use(new CheckoutPage(page)); },
  // Centralized cleanup
  cleanup: [async ({ page }, use) => {

    await use();

    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());

  }, { auto: true }],

});


exports.expect = base.expect;