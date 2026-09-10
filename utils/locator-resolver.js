/**
 * Deterministic locator resolver.
 *
 * Tries each strategy in a locator definition, in order, and returns the
 * first Playwright Locator that matches exactly one element. This is the
 * foundation self-healing later phases will build on - no AI involved here,
 * just predefined fallback strategies.
 */

// Referenced via the module object (not destructured) so tests can monkey-patch
// evidenceCollector.collectHealingEvidence on the shared, cached module instance
// without needing a dependency-injection framework.
const evidenceCollector = require('./healing-evidence-collector');

const DEFAULT_STRATEGY_TIMEOUT_MS = 1000;
const POLL_INTERVAL_MS = 100;

/**
 * Thrown when every deterministic strategy fails to resolve an element.
 *
 * The message stays short and human-readable; the full sanitized evidence
 * (candidate DOM elements, etc.) lives on `error.evidence` so a future AI
 * layer (Phase 1C) can consume it programmatically without parsing text.
 */
class LocatorResolutionError extends Error {
  constructor(message, { elementName, intent, attempts, evidence }) {
    super(message);
    this.name = 'LocatorResolutionError';
    this.elementName = elementName;
    this.intent = intent;
    this.attempts = attempts;
    this.evidence = evidence;
  }
}

function buildLocator(page, strategy) {
  switch (strategy.type) {
    case 'css':
      return page.locator(strategy.value);
    case 'role':
      return page.getByRole(strategy.role, { name: strategy.name });
    case 'placeholder':
      return page.getByPlaceholder(strategy.value);
    default:
      throw new Error(`[LocatorResolver] Unsupported strategy type: "${strategy.type}"`);
  }
}

function describeStrategy(strategy) {
  if (strategy.type === 'role') {
    return `role ${strategy.role} "${strategy.name}"`;
  }
  return `${strategy.type} ${strategy.value}`;
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

/**
 * Polls locator.count() within a bounded time budget instead of trusting a
 * single immediate read.
 *
 * locator.count() queries the DOM exactly once and does not auto-wait, so a
 * genuinely correct selector for an element that simply hasn't rendered yet
 * would otherwise read as "0 matches" and trigger false healing. This gives
 * the element a short, bounded opportunity to appear before giving up.
 *
 * An ambiguous result (>1) returns immediately - waiting longer does not
 * make a selector that matches multiple elements resolve down to one.
 */
async function waitForCount(locator, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (true) {
    const count = await locator.count();
    if (count >= 1) {
      return count;
    }
    if (Date.now() >= deadline) {
      return count;
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

/**
 * Resolves a locator definition against a Playwright page.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ intent: string, strategies: Array<object> }} locatorDef
 * @param {string} [elementName] - used only for log labeling
 * @param {{ strategyTimeoutMs?: number }} [options]
 * @returns {Promise<import('@playwright/test').Locator>}
 */
async function resolve(page, locatorDef, elementName = locatorDef.intent, options = {}) {
  const strategyTimeoutMs = options.strategyTimeoutMs ?? DEFAULT_STRATEGY_TIMEOUT_MS;
  const label = `[LocatorResolver] ${elementName}`;
  const attempts = [];

  console.log(label);

  for (let i = 0; i < locatorDef.strategies.length; i++) {
    const strategy = locatorDef.strategies[i];
    const strategyNumber = i + 1;
    const description = describeStrategy(strategy);

    console.log(`Trying strategy ${strategyNumber}: ${description}`);

    const locator = buildLocator(page, strategy);
    const count = await waitForCount(locator, strategyTimeoutMs);

    if (count === 1) {
      console.log(
        strategyNumber === 1
          ? `SUCCESS strategy ${strategyNumber}`
          : `HEALED using strategy ${strategyNumber}`
      );
      return locator;
    }

    if (count === 0) {
      console.log(`FAILED strategy ${strategyNumber}: 0 matches`);
    } else {
      console.log(`AMBIGUOUS strategy ${strategyNumber}: ${count} matches`);
    }

    attempts.push({ strategyNumber, type: strategy.type, description, matchCount: count });
    console.log('');
  }

  const evidence = await evidenceCollector.collectHealingEvidence(page, {
    elementName,
    intent: locatorDef.intent,
    attempts,
  });

  const attemptLines = attempts.map(
    (a) => `${a.strategyNumber}. ${a.description} → ${a.matchCount} matches`
  );

  throw new LocatorResolutionError(
    `${label}: Unable to resolve element uniquely.\n\nAttempts:\n${attemptLines.join('\n')}`,
    { elementName, intent: locatorDef.intent, attempts, evidence }
  );
}

module.exports = { resolve, DEFAULT_STRATEGY_TIMEOUT_MS, LocatorResolutionError };
