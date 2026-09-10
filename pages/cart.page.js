const { resolve } = require('../utils/locator-resolver');
const cartLocators = require('../locators/cart.locators.json');

class CartPage {
  constructor(page) {
    this.page = page;
    this.cartItem = page.locator('.cart_item');
  }

  async proceedToCheckout() {
    const checkoutButton = await resolve(this.page, cartLocators.checkoutButton, 'checkoutButton');
    await checkoutButton.click();
  }

  async removeItem() {
    const removeBackpackButton = await resolve(this.page, cartLocators.removeBackpackButton, 'removeBackpackButton');
    await removeBackpackButton.click();
  }
}

module.exports = { CartPage };