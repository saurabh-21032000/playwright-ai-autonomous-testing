const fs = require('fs');
const path = require('path');
const { test, expect } = require('../fixture/test-fixture');
const { resolve } = require('../utils/locator-resolver');
const { HealingReporter } = require('../utils/healing-reporter');

const mockClientReturning = (jsonObject) => ({
  messages: {
    create: async () => ({ content: [{ type: 'text', text: JSON.stringify(jsonObject) }] }),
  },
});

// One fresh HealingReporter instance per test, injected explicitly via
// resolve()'s options.reporter - never the shared defaultReporter. This is
// what keeps these tests safe under Playwright's parallel workers: nothing
// here is shared mutable state another test could race against.
test.describe('HealingReporter: structured audit events', () => {

  test.beforeEach(async ({ loginPage }) => {
    await loginPage.navigate();
  });

  test.afterEach(() => {
    delete process.env.SELF_HEALING_AI_ENABLED;
  });

  test('A: primary success records exactly one "primary" event', async ({ page }) => {
    await page.setContent('<button id="ok-button">OK</button>');
    const reporter = new HealingReporter();

    await resolve(
      page,
      { intent: 'OK button', strategies: [{ type: 'css', value: '#ok-button' }] },
      'primaryEvent',
      { reporter }
    );

    const events = reporter.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0].resolutionType).toBe('primary');
    expect(events[0].ai).toEqual({ attempted: false, candidate: null, accepted: null, failureReason: null });
    expect(events[0].deterministicAttempts).toEqual([]);
  });

  test('B: fallback success records a "deterministic-fallback" event', async ({ page }) => {
    await page.setContent('<button id="real-button">OK</button>');
    const reporter = new HealingReporter();

    await resolve(
      page,
      {
        intent: 'Button with broken primary',
        strategies: [
          { type: 'css', value: '#does-not-exist' },
          { type: 'css', value: '#real-button' },
        ],
      },
      'fallbackEvent',
      { reporter }
    );

    const events = reporter.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0].resolutionType).toBe('deterministic-fallback');
    expect(events[0].deterministicAttempts).toHaveLength(1);
    expect(events[0].succeededStrategy).toMatchObject({ strategyNumber: 2, type: 'css' });
    expect(events[0].ai.attempted).toBe(false);
  });

  test('C: AI healing success records an "ai-healed" event with the candidate', async ({ page }) => {
    await page.setContent('<button data-test="new-login-button">Login</button>');
    process.env.SELF_HEALING_AI_ENABLED = 'true';
    const reporter = new HealingReporter();
    const client = mockClientReturning({ type: 'css', value: '[data-test="new-login-button"]' });

    await resolve(
      page,
      {
        intent: 'Login button (redesigned)',
        strategies: [{ type: 'css', value: '#old-login-button' }],
      },
      'aiHealedEvent',
      { reporter, aiClient: client, strategyTimeoutMs: 200 }
    );

    const events = reporter.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0].resolutionType).toBe('ai-healed');
    expect(events[0].ai).toEqual({
      attempted: true,
      candidate: { type: 'css', value: '[data-test="new-login-button"]' },
      accepted: true,
      failureReason: null,
    });
  });

  test('D: rejected AI candidate records a "failed" event with the failure reason', async ({ page }) => {
    await page.setContent('<div id="unrelated"></div>');
    process.env.SELF_HEALING_AI_ENABLED = 'true';
    const reporter = new HealingReporter();
    const client = mockClientReturning({ type: 'css', value: '#does-not-exist-anywhere' });

    await expect(
      resolve(
        page,
        { intent: 'Missing element', strategies: [{ type: 'css', value: '#also-missing' }] },
        'aiRejectedEvent',
        { reporter, aiClient: client, strategyTimeoutMs: 200 }
      )
    ).rejects.toThrow();

    const events = reporter.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0].resolutionType).toBe('failed');
    expect(events[0].ai.attempted).toBe(true);
    expect(events[0].ai.accepted).toBe(false);
    expect(events[0].ai.failureReason).toMatch(/matched 0 elements/);
  });

  test('E: AI disabled + deterministic failure records a "failed" event with attempted=false', async ({ page }) => {
    await page.setContent('<div id="unrelated"></div>');
    const reporter = new HealingReporter();

    await expect(
      resolve(
        page,
        { intent: 'Missing element', strategies: [{ type: 'css', value: '#also-missing' }] },
        'aiDisabledEvent',
        { reporter, strategyTimeoutMs: 200 }
      )
    ).rejects.toThrow();

    const events = reporter.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0].resolutionType).toBe('failed');
    expect(events[0].ai).toEqual({ attempted: false, candidate: null, accepted: false, failureReason: null });
  });

  test('F: clearEvents() resets reporter state', async ({ page }) => {
    await page.setContent('<button id="ok-button">OK</button>');
    const reporter = new HealingReporter();

    await resolve(page, { intent: 'OK button', strategies: [{ type: 'css', value: '#ok-button' }] }, 'x', { reporter });
    expect(reporter.getEvents()).toHaveLength(1);

    reporter.clearEvents();
    expect(reporter.getEvents()).toHaveLength(0);
  });

  test('G: SECURITY - no sensitive-looking values appear anywhere in a serialized report', async ({ page }) => {
    await page.setContent(`
      <input type="password" id="password" value="SUPER_SECRET_PASSWORD" />
      <input type="text" id="username" value="PRIVATE_USERNAME" />
    `);
    process.env.SELF_HEALING_AI_ENABLED = 'true';
    const reporter = new HealingReporter();
    const client = mockClientReturning({ type: 'css', value: '#does-not-exist' });

    await expect(
      resolve(
        page,
        { intent: 'Something missing', strategies: [{ type: 'css', value: '#missing' }] },
        'securityEvent',
        { reporter, aiClient: client, strategyTimeoutMs: 200 }
      )
    ).rejects.toThrow();

    const serialized = JSON.stringify(reporter.getEvents());

    expect(serialized).not.toContain('SUPER_SECRET_PASSWORD');
    expect(serialized).not.toContain('PRIVATE_USERNAME');
    expect(serialized).not.toContain(process.env.ANTHROPIC_API_KEY || '__no_key_set__');
    expect(serialized.toLowerCase()).not.toContain('cookie');
    expect(serialized.toLowerCase()).not.toContain('localstorage');
  });

  test('writeReport() creates a valid JSON file under test-results/', async ({ page }) => {
    await page.setContent('<button id="ok-button">OK</button>');
    const reporter = new HealingReporter();

    await resolve(page, { intent: 'OK button', strategies: [{ type: 'css', value: '#ok-button' }] }, 'y', { reporter });

    const reportPath = path.join(__dirname, '..', 'test-results', 'healing-report.json');
    reporter.writeReport(reportPath);

    const raw = fs.readFileSync(reportPath, 'utf8');
    const parsed = JSON.parse(raw);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);

    fs.unlinkSync(reportPath);
  });
});
