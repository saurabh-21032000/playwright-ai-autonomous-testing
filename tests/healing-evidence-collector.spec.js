const { test, expect } = require('../fixture/test-fixture');
const { resolve, LocatorResolutionError } = require('../utils/locator-resolver');
const evidenceCollectorModule = require('../utils/healing-evidence-collector');

test.describe('Healing evidence collector', () => {

  // Navigate to a real origin first. Without it, page.setContent() leaves the
  // page on about:blank, and this project's auto-cleanup fixture calling
  // localStorage.clear() after the test throws a SecurityError on that origin.
  test.beforeEach(async ({ loginPage }) => {
    await loginPage.navigate();
  });

  test('does NOT collect evidence when a strategy succeeds (fast path stays fast)', async ({ page }) => {
    await page.setContent('<button id="ok-button">OK</button>');

    const original = evidenceCollectorModule.collectHealingEvidence;
    let callCount = 0;
    evidenceCollectorModule.collectHealingEvidence = async (...args) => {
      callCount++;
      return original(...args);
    };

    try {
      await resolve(
        page,
        { intent: 'OK button', strategies: [{ type: 'css', value: '#ok-button' }] },
        'okButton'
      );
    } finally {
      evidenceCollectorModule.collectHealingEvidence = original;
    }

    expect(callCount).toBe(0);
  });

  test('collects evidence only after every strategy fails, attached to the thrown error', async ({ page }) => {
    await page.setContent('<div id="unrelated">nothing matches here</div>');

    let thrown;
    try {
      await resolve(
        page,
        {
          intent: 'A button that does not exist',
          strategies: [
            { type: 'css', value: '#does-not-exist-1' },
            { type: 'css', value: '#does-not-exist-2' },
          ],
        },
        'missingButton'
      );
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(LocatorResolutionError);
    expect(thrown.evidence.element).toEqual({ name: 'missingButton', intent: 'A button that does not exist' });
    expect(thrown.evidence.url).toBeTruthy();
    expect(thrown.evidence.title).toBeDefined();
    expect(thrown.evidence.failedStrategies).toHaveLength(2);
    expect(thrown.evidence.failedStrategies[0]).toEqual({
      type: 'css',
      description: 'css #does-not-exist-1',
      matchCount: 0,
    });
  });

  test('captures candidate DOM metadata for elements near the failure', async ({ page }) => {
    await page.setContent(`
      <input id="new-username" placeholder="Username" type="text" />
      <button data-test="new-login" aria-label="Sign in">Sign in</button>
    `);

    let thrown;
    try {
      await resolve(
        page,
        {
          intent: 'Old login button selector, no longer present',
          strategies: [
            { type: 'css', value: '#login-button' },
            { type: 'role', role: 'button', name: 'Login' },
          ],
        },
        'loginButton'
      );
    } catch (err) {
      thrown = err;
    }

    const candidates = thrown.evidence.pageEvidence.candidateElements;

    const inputCandidate = candidates.find((c) => c.id === 'new-username');
    expect(inputCandidate).toMatchObject({ tag: 'input', type: 'text', placeholder: 'Username' });

    const buttonCandidate = candidates.find((c) => c.dataTest === 'new-login');
    expect(buttonCandidate).toMatchObject({ tag: 'button', ariaLabel: 'Sign in', text: 'Sign in' });
  });

  test('SECURITY: never captures input values, including sensitive ones', async ({ page }) => {
    await page.setContent(`
      <input type="password" id="password" value="SUPER_SECRET_PASSWORD" />
      <input type="text" id="ssn" value="123-45-6789" />
      <button id="unrelated-trigger">Trigger</button>
    `);

    let thrown;
    try {
      await resolve(
        page,
        {
          intent: 'Something that will never match, to force evidence collection',
          strategies: [{ type: 'css', value: '#definitely-does-not-exist' }],
        },
        'securityProbe'
      );
    } catch (err) {
      thrown = err;
    }

    const serializedEvidence = JSON.stringify(thrown.evidence);

    expect(serializedEvidence).not.toContain('SUPER_SECRET_PASSWORD');
    expect(serializedEvidence).not.toContain('123-45-6789');

    const passwordCandidate = thrown.evidence.pageEvidence.candidateElements.find((c) => c.id === 'password');
    expect(passwordCandidate).toBeTruthy();
    expect(passwordCandidate.value).toBeUndefined();
  });
});
