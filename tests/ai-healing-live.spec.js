const { test, expect } = require('../fixture/test-fixture');
const { resolve } = require('../utils/locator-resolver');

/**
 * ONE dedicated live Anthropic integration test.
 *
 * This makes a REAL Claude API call and therefore must never run during
 * ordinary `npm test`. It only runs when ALL of the following are explicitly
 * set, which normal local/CI runs never set:
 *
 *   SELF_HEALING_AI_ENABLED=true
 *   RUN_LIVE_AI_SMOKE=true
 *   ANTHROPIC_API_KEY=<a real key>
 *
 * Having a key present in a developer's shell must never silently spend
 * credits on a routine `npm test` - RUN_LIVE_AI_SMOKE is the explicit,
 * separate gate for that.
 */
const shouldRunLiveSmoke =
  process.env.SELF_HEALING_AI_ENABLED === 'true' &&
  process.env.RUN_LIVE_AI_SMOKE === 'true' &&
  Boolean(process.env.ANTHROPIC_API_KEY);

test.describe('Live Anthropic AI healing smoke test', () => {

  test.beforeEach(async ({ loginPage }) => {
    await loginPage.navigate();
  });

  test('real Claude call proposes a working locator for a redesigned button', async ({ page }) => {
    test.skip(
      !shouldRunLiveSmoke,
      'Requires SELF_HEALING_AI_ENABLED=true, RUN_LIVE_AI_SMOKE=true, and ANTHROPIC_API_KEY to be set'
    );

    // Controlled page, not dependent on SauceDemo ever changing.
    await page.setContent(`
      <html>
        <body>
          <button data-test="new-login-button" aria-label="Login">Login</button>
        </body>
      </html>
    `);

    const locatorDef = {
      intent: 'Login button (site redesigned, old locators now stale)',
      strategies: [
        { type: 'css', value: '#old-login-button' },
        { type: 'role', role: 'button', name: 'Sign In (does not match)' },
      ],
    };

    // No aiClient injected: this takes the real Anthropic SDK path.
    const locator = await resolve(page, locatorDef, 'liveAiSmokeTest');

    await expect(locator).toHaveAttribute('data-test', 'new-login-button');
  });
});
