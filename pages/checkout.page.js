class CheckoutPage {
  constructor(page) {
    this.page = page;
    this.firstNameInput = page.locator('#first-name');
    this.lastNameInput = page.locator('#last-name');
    this.postalCodeInput = page.locator('#postal-code');
    this.continueBtn = page.locator('#continue');
    this.finishBtn = page.locator('#finish');
    this.completeHeader = page.locator('.complete-header');
  }

  async fillShippingDetails(firstName, lastName, postalCode) {
    await this.firstNameInput.fill(firstName);
    await this.lastNameInput.fill(lastName);
    await this.postalCodeInput.fill(postalCode);
    await this.continueBtn.click();
  }

  async finishCheckout() {
    await this.finishBtn.click();
  }
}

module.exports = { CheckoutPage };