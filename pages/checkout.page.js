const { resolve } = require('../utils/locator-resolver');
const checkoutLocators = require('../locators/checkout.locators.json');

class CheckoutPage {
  constructor(page) {
    this.page = page;
    this.completeHeader = page.locator('.complete-header');
  }

  async fillShippingDetails(firstName, lastName, postalCode) {
    const firstNameInput = await resolve(this.page, checkoutLocators.firstNameInput, 'firstNameInput');
    const lastNameInput = await resolve(this.page, checkoutLocators.lastNameInput, 'lastNameInput');
    const postalCodeInput = await resolve(this.page, checkoutLocators.postalCodeInput, 'postalCodeInput');
    const continueButton = await resolve(this.page, checkoutLocators.continueButton, 'continueButton');

    await firstNameInput.fill(firstName);
    await lastNameInput.fill(lastName);
    await postalCodeInput.fill(postalCode);
    await continueButton.click();
  }

  async finishCheckout() {
    const finishButton = await resolve(this.page, checkoutLocators.finishButton, 'finishButton');
    await finishButton.click();
  }
}

module.exports = { CheckoutPage };