const { resolve } = require('../utils/locator-resolver');
const inventoryLocators = require('../locators/inventory.locators.json');

class InventoryPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;
    this.headerTitle = page.locator('.title');
    this.inventoryItems = page.locator('.inventory_item');
    this.cartBadge = page.locator('.shopping_cart_badge');
  }

  async addBackpackToCart() {
    const addBackpackButton = await resolve(this.page, inventoryLocators.addBackpackButton, 'addBackpackButton');
    await addBackpackButton.click();
  }

  async isInventoryPageDisplayed() {
    return await this.headerTitle.isVisible();
  }
}

module.exports = { InventoryPage };