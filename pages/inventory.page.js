class InventoryPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;
    this.headerTitle = page.locator('.title');
    this.inventoryItems = page.locator('.inventory_item');
    this.cartBadge = page.locator('.shopping_cart_badge');
    this.addToCartBackpackBtn = page.locator('#add-to-cart-sauce-labs-backpack');
  }

  async addBackpackToCart() {
    await this.addToCartBackpackBtn.click();
  }
}

module.exports = { InventoryPage };