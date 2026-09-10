const { test, expect } = require('../fixture/test-fixture');
const { resolve } = require('../utils/locator-resolver');

test.describe('LocatorResolver deterministic self-healing', () => {

  test.beforeEach(async ({ loginPage }) => {
    await loginPage.navigate();
  });

  test('resolves immediately when the primary strategy matches exactly one element', async ({ page }) => {
    const locatorDef = {
      intent: 'Login button (primary is correct)',
      strategies: [
        { type: 'css', value: '#login-button' },
        { type: 'role', role: 'button', name: 'Login' },
      ],
    };

    const resolved = await resolve(page, locatorDef, 'loginButton-primarySuccessTest');

    await expect(resolved).toHaveAttribute('id', 'login-button');
  });

  test('heals via fallback strategy when the primary strategy matches nothing', async ({ page }) => {
    const locatorDef = {
      intent: 'Login button (primary deliberately broken for this test)',
      strategies: [
        { type: 'css', value: '#this-id-does-not-exist' },
        { type: 'role', role: 'button', name: 'Login' },
      ],
    };

    const healedLocator = await resolve(page, locatorDef, 'loginButton-healingTest');

    await expect(healedLocator).toHaveCount(1);
    await expect(healedLocator).toHaveAttribute('id', 'login-button');
  });

  test('throws a clear error listing every attempt when all strategies fail', async ({ page }) => {
    const locatorDef = {
      intent: 'Element that does not exist anywhere on the page',
      strategies: [
        { type: 'css', value: '#this-id-does-not-exist' },
        { type: 'css', value: '#neither-does-this-one' },
      ],
    };

    await expect(resolve(page, locatorDef, 'nonExistentElement')).rejects.toThrow(
      /Unable to resolve element uniquely[\s\S]*1\. css #this-id-does-not-exist → 0 matches[\s\S]*2\. css #neither-does-this-one → 0 matches/
    );
  });

  test('does not silently accept an ambiguous strategy that matches multiple elements', async ({ page }) => {
    const locatorDef = {
      intent: 'Any input element (deliberately ambiguous - login page has 3)',
      strategies: [
        { type: 'css', value: 'input' },
      ],
    };

    await expect(resolve(page, locatorDef, 'ambiguousInput')).rejects.toThrow(
      /1\. css input → 3 matches/
    );
  });

  test('waits briefly for a delayed primary element instead of falsely healing via fallback', async ({ page }) => {
    // Deterministic, network-independent delay: a real element is inserted
    // into the DOM ~300ms after content loads, well inside the resolver's
    // default 1000ms strategy timeout. A "fallback-marker" element is
    // present immediately, so if the resolver returns it instead of the
    // delayed button, that proves a false-heal happened.
    await page.setContent(`
      <html>
        <body>
          <div id="fallback-marker">Fallback</div>
          <script>
            setTimeout(() => {
              const btn = document.createElement('button');
              btn.id = 'delayed-button';
              btn.textContent = 'Continue';
              document.body.appendChild(btn);
            }, 300);
          </script>
        </body>
      </html>
    `);

    const locatorDef = {
      intent: 'Delayed primary button with an always-present fallback marker',
      strategies: [
        { type: 'css', value: '#delayed-button' },
        { type: 'css', value: '#fallback-marker' },
      ],
    };

    const resolved = await resolve(page, locatorDef, 'delayedButton');

    await expect(resolved).toHaveAttribute('id', 'delayed-button');
  });
});
