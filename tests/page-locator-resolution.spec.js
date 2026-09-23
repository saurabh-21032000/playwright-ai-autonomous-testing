const { test, expect } = require('../fixture/test-fixture');
const { resolve } = require('../utils/locator-resolver');
const inventoryLocators = require('../locators/inventory.locators.json');
const cartLocators = require('../locators/cart.locators.json');
const checkoutLocators = require('../locators/checkout.locators.json');

/**
 * Proves the shared LocatorResolver + per-page locator JSON architecture
 * works beyond LoginPage - using the REAL production locator definitions
 * (not hand-copied duplicates), against controlled page.setContent() DOM,
 * so this never depends on breaking the live SauceDemo site.
 */
test.describe('Page-level self-healing: locator fallback across migrated Page Objects', () => {

  test.beforeEach(async ({ loginPage }) => {
    await loginPage.navigate();
  });

  test('INVENTORY: broken primary id heals via the data-test fallback', async ({ page }) => {
    await page.setContent('<button data-test="add-to-cart-sauce-labs-backpack">Add to cart</button>');

    const button = await resolve(page, inventoryLocators.addBackpackButton, 'addBackpackButton');

    await expect(button).toHaveAttribute('data-test', 'add-to-cart-sauce-labs-backpack');
  });

  test('CART: broken primary id heals via the "Checkout" role fallback', async ({ page }) => {
    await page.setContent('<button>Checkout</button>');

    const button = await resolve(page, cartLocators.checkoutButton, 'checkoutButton');

    await expect(button).toHaveText('Checkout');
  });

  test('CART: broken primary data-test heals via the id fallback for Remove', async ({ page }) => {
    await page.setContent('<button id="remove-sauce-labs-backpack">Remove</button>');

    const button = await resolve(page, cartLocators.removeBackpackButton, 'removeBackpackButton');

    await expect(button).toHaveAttribute('id', 'remove-sauce-labs-backpack');
  });

  test('CHECKOUT: broken primary ids heal via placeholder fallbacks for all three fields', async ({ page }) => {
    await page.setContent(`
      <input placeholder="First Name" />
      <input placeholder="Last Name" />
      <input placeholder="Zip/Postal Code" />
    `);

    const firstNameInput = await resolve(page, checkoutLocators.firstNameInput, 'firstNameInput');
    const lastNameInput = await resolve(page, checkoutLocators.lastNameInput, 'lastNameInput');
    const postalCodeInput = await resolve(page, checkoutLocators.postalCodeInput, 'postalCodeInput');

    await expect(firstNameInput).toHaveAttribute('placeholder', 'First Name');
    await expect(lastNameInput).toHaveAttribute('placeholder', 'Last Name');
    await expect(postalCodeInput).toHaveAttribute('placeholder', 'Zip/Postal Code');
  });

  test('CHECKOUT: broken primary id heals via the "Continue" role fallback', async ({ page }) => {
    await page.setContent('<button>Continue</button>');

    const continueButton = await resolve(page, checkoutLocators.continueButton, 'continueButton');

    await expect(continueButton).toHaveText('Continue');
  });

  test('CHECKOUT: broken primary id heals via the "Finish" role fallback', async ({ page }) => {
    await page.setContent('<button>Finish</button>');

    const finishButton = await resolve(page, checkoutLocators.finishButton, 'finishButton');

    await expect(finishButton).toHaveText('Finish');
  });
});
