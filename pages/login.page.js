const { resolve } = require('../utils/locator-resolver');
const loginLocators = require('../locators/login.locators.json');

class LoginPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;
    this.errorMessage = page.locator('[data-test="error"]');
    this.loginpageLogo = page.locator('.login_logo');
  }

  async navigate() {
    await this.page.goto('/');
  }

  async login(username, password) {
    const usernameInput = await resolve(this.page, loginLocators.usernameInput, 'usernameInput');
    const passwordInput = await resolve(this.page, loginLocators.passwordInput, 'passwordInput');
    const loginButton = await resolve(this.page, loginLocators.loginButton, 'loginButton');

    await usernameInput.fill(username);
    await passwordInput.fill(password);
    await loginButton.click();
  }
  async isloginpageDisplayed() {
    return await this.loginpageLogo.isVisible();
  }
}
module.exports = { LoginPage };