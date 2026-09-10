const { test, expect } = require('../fixture/test-fixture');
const { resolve, LocatorResolutionError } = require('../utils/locator-resolver');

// Speeds up the many "every deterministic strategy fails" tests below without
// changing behavior - these tests care about AI handling, not timeout timing.
const FAST_TIMEOUT_MS = 200;

// A client that fails loudly if ever invoked - used to PROVE the AI healer
// was not called when the deterministic path already succeeded.
const poisonedClient = {
  messages: {
    create: async () => {
      throw new Error('AI client should not have been called');
    },
  },
};

function mockClientReturning(jsonObject) {
  return {
    messages: {
      create: async () => ({ content: [{ type: 'text', text: JSON.stringify(jsonObject) }] }),
    },
  };
}

test.describe('AI-assisted locator healing (mocked - zero real Anthropic calls)', () => {

  // Navigate to a real origin first. Without it, page.setContent() leaves the
  // page on about:blank, and this project's auto-cleanup fixture calling
  // localStorage.clear() after the test throws a SecurityError on that origin.
  test.beforeEach(async ({ loginPage }) => {
    await loginPage.navigate();
  });

  test.afterEach(() => {
    delete process.env.SELF_HEALING_AI_ENABLED;
  });

  test('A: primary strategy succeeds -> AI healer not called', async ({ page }) => {
    await page.setContent('<button id="ok-button">OK</button>');
    process.env.SELF_HEALING_AI_ENABLED = 'true';

    const locator = await resolve(
      page,
      { intent: 'OK button', strategies: [{ type: 'css', value: '#ok-button' }] },
      'primarySuccess',
      { aiClient: poisonedClient }
    );

    await expect(locator).toHaveAttribute('id', 'ok-button');
  });

  test('B: deterministic fallback succeeds -> AI healer not called', async ({ page }) => {
    await page.setContent('<button id="real-button">OK</button>');
    process.env.SELF_HEALING_AI_ENABLED = 'true';

    const locator = await resolve(
      page,
      {
        intent: 'Button with broken primary, working fallback',
        strategies: [
          { type: 'css', value: '#does-not-exist' },
          { type: 'css', value: '#real-button' },
        ],
      },
      'fallbackSuccess',
      { aiClient: poisonedClient }
    );

    await expect(locator).toHaveAttribute('id', 'real-button');
  });

  test('C: all deterministic strategies fail, AI enabled, valid unique candidate -> AI HEALED', async ({ page }) => {
    await page.setContent('<button data-test="new-login-button" aria-label="Login">Login</button>');
    process.env.SELF_HEALING_AI_ENABLED = 'true';

    const client = mockClientReturning({ type: 'css', value: '[data-test="new-login-button"]' });

    const locator = await resolve(
      page,
      {
        intent: 'Login button (site redesigned, old locators now stale)',
        strategies: [
          { type: 'css', value: '#old-login-button' },
          { type: 'role', role: 'button', name: 'Sign In (does not match)' },
        ],
      },
      'aiHealSuccess',
      { aiClient: client, strategyTimeoutMs: FAST_TIMEOUT_MS }
    );

    await expect(locator).toHaveAttribute('data-test', 'new-login-button');
  });

  test('D: AI returns a zero-match candidate -> rejected', async ({ page }) => {
    await page.setContent('<div id="unrelated"></div>');
    process.env.SELF_HEALING_AI_ENABLED = 'true';

    const client = mockClientReturning({ type: 'css', value: '#does-not-exist-anywhere' });

    let thrown;
    try {
      await resolve(
        page,
        { intent: 'Missing element', strategies: [{ type: 'css', value: '#also-missing' }] },
        'aiZeroMatch',
        { aiClient: client, strategyTimeoutMs: FAST_TIMEOUT_MS }
      );
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(LocatorResolutionError);
    expect(thrown.aiFailure).toMatch(/matched 0 elements/);
  });

  test('E: AI returns a multi-match candidate -> rejected as ambiguous', async ({ page }) => {
    await page.setContent('<input /><input /><input />');
    process.env.SELF_HEALING_AI_ENABLED = 'true';

    const client = mockClientReturning({ type: 'css', value: 'input' });

    let thrown;
    try {
      await resolve(
        page,
        { intent: 'Some input', strategies: [{ type: 'css', value: '#does-not-exist' }] },
        'aiAmbiguous',
        { aiClient: client, strategyTimeoutMs: FAST_TIMEOUT_MS }
      );
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(LocatorResolutionError);
    expect(thrown.aiFailure).toMatch(/matched 3 elements \(ambiguous\)/);
  });

  test('F: AI returns a malformed object -> rejected', async ({ page }) => {
    await page.setContent('<button id="whatever">X</button>');
    process.env.SELF_HEALING_AI_ENABLED = 'true';

    const client = mockClientReturning({ foo: 'bar' });

    let thrown;
    try {
      await resolve(
        page,
        { intent: 'Whatever', strategies: [{ type: 'css', value: '#does-not-exist' }] },
        'aiMalformed',
        { aiClient: client, strategyTimeoutMs: FAST_TIMEOUT_MS }
      );
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(LocatorResolutionError);
    expect(thrown.aiFailure).toMatch(/unsupported type/);
  });

  test('G: AI returns an unsupported strategy type (xpath) -> rejected', async ({ page }) => {
    await page.setContent('<button id="whatever">X</button>');
    process.env.SELF_HEALING_AI_ENABLED = 'true';

    const client = mockClientReturning({ type: 'xpath', value: '//button' });

    let thrown;
    try {
      await resolve(
        page,
        { intent: 'Whatever', strategies: [{ type: 'css', value: '#does-not-exist' }] },
        'aiUnsupportedType',
        { aiClient: client, strategyTimeoutMs: FAST_TIMEOUT_MS }
      );
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(LocatorResolutionError);
    expect(thrown.aiFailure).toMatch(/unsupported type/);
  });

  test('H: AI disabled -> AI not invoked even if a client is injected', async ({ page }) => {
    await page.setContent('<div id="unrelated"></div>');
    delete process.env.SELF_HEALING_AI_ENABLED; // explicit: disabled

    let thrown;
    try {
      await resolve(
        page,
        { intent: 'Missing element', strategies: [{ type: 'css', value: '#does-not-exist' }] },
        'aiDisabled',
        { aiClient: poisonedClient, strategyTimeoutMs: FAST_TIMEOUT_MS }
      );
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(LocatorResolutionError);
    expect(thrown.aiFailure).toBeUndefined();
  });

  test('I: real AI path with missing API key -> clean controlled error, no crash', async ({ page }) => {
    await page.setContent('<div id="unrelated"></div>');
    process.env.SELF_HEALING_AI_ENABLED = 'true';
    const originalKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    try {
      let thrown;
      try {
        // No aiClient injected -> forces the real (non-mocked) code path,
        // which must fail on the missing key before ever touching the SDK.
        await resolve(
          page,
          { intent: 'Missing element', strategies: [{ type: 'css', value: '#does-not-exist' }] },
          'aiMissingKey',
          { strategyTimeoutMs: FAST_TIMEOUT_MS }
        );
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(LocatorResolutionError);
      expect(thrown.aiFailure).toMatch(/ANTHROPIC_API_KEY is not set/);
    } finally {
      if (originalKey !== undefined) process.env.ANTHROPIC_API_KEY = originalKey;
    }
  });

  test('J: injected AI client throws -> clean controlled error', async ({ page }) => {
    await page.setContent('<div id="unrelated"></div>');
    process.env.SELF_HEALING_AI_ENABLED = 'true';

    let thrown;
    try {
      await resolve(
        page,
        { intent: 'Missing element', strategies: [{ type: 'css', value: '#does-not-exist' }] },
        'aiClientThrows',
        { aiClient: poisonedClient, strategyTimeoutMs: FAST_TIMEOUT_MS }
      );
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(LocatorResolutionError);
    expect(thrown.aiFailure).toMatch(/Anthropic request failed/);
  });

  test('K: AI candidate matches exactly one element but is not visible -> rejected', async ({ page }) => {
    await page.setContent('<button id="hidden-button" style="display:none">Hidden</button>');
    process.env.SELF_HEALING_AI_ENABLED = 'true';

    const client = mockClientReturning({ type: 'css', value: '#hidden-button' });

    let thrown;
    try {
      await resolve(
        page,
        { intent: 'Hidden button', strategies: [{ type: 'css', value: '#does-not-exist' }] },
        'aiInvisible',
        { aiClient: client, strategyTimeoutMs: FAST_TIMEOUT_MS }
      );
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(LocatorResolutionError);
    expect(thrown.aiFailure).toMatch(/not visible/);
  });
});
