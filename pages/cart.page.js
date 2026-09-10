class CartPage {
  constructor(page) {
    this.page = page;
    this.cartItem = page.locator('.cart_item');
    this.checkoutBtn = page.locator('#checkout');
    this.removeBtn = page.locator('[data-test="remove-sauce-labs-backpack"]');
  }

  async proceedToCheckout() {
    await this.checkoutBtn.click();
  }

  async removeItem() {
    await this.removeBtn.click();
  }
}

module.exports = { CartPage };