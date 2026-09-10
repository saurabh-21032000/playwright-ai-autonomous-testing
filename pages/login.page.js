class LoginPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;
    this.usernameInput = page.locator('#user-name');
    this.passwordInput = page.locator('#password');
    this.loginBtn = page.locator('#login-button');
    this.errorMessage = page.locator('[data-test="error"]');
    this.loginpageLogo = page.locator('.login_logo');
  }

  async navigate() {
    await this.page.goto('/');
  }

  async login(username, password) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginBtn.click();
  }
  async isloginpageDisplayed() {
    return await this.loginpageLogo.isVisible();
  }
}
module.exports = { LoginPage };