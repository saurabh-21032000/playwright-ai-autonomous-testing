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
const aiHealer = require('./ai-locator-healer');
const { defaultReporter, createHealingEvent } = require('./healing-reporter');

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
  constructor(message, { elementName, intent, attempts, evidence, aiFailure }) {
    super(message);
    this.name = 'LocatorResolutionError';
    this.elementName = elementName;
    this.intent = intent;
    this.attempts = attempts;
    this.evidence = evidence;
    // Populated only when AI healing was attempted and did not produce a
    // usable locator - undefined when AI is disabled, exactly as before.
    this.aiFailure = aiFailure;
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
  const reporter = options.reporter || defaultReporter;
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
      // Cheap, in-memory only - no evidence collection here, so the fast
      // (and by far most common) path stays fast.
      reporter.recordEvent(createHealingEvent({
        elementName,
        intent: locatorDef.intent,
        pageUrl: page.url(),
        resolutionType: strategyNumber === 1 ? 'primary' : 'deterministic-fallback',
        deterministicAttempts: attempts.slice(),
        succeededStrategy: { strategyNumber, type: strategy.type, description },
        ai: { attempted: false, candidate: null, accepted: null, failureReason: null },
      }));
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
  const baseMessage = `${label}: Unable to resolve element uniquely.\n\nAttempts:\n${attemptLines.join('\n')}`;

  if (!aiHealer.isAiHealingEnabled()) {
    reporter.recordEvent(createHealingEvent({
      elementName,
      intent: locatorDef.intent,
      pageUrl: page.url(),
      resolutionType: 'failed',
      deterministicAttempts: attempts.slice(),
      ai: { attempted: false, candidate: null, accepted: false, failureReason: null },
    }));
    throw new LocatorResolutionError(baseMessage, { elementName, intent: locatorDef.intent, attempts, evidence });
  }

  console.log(`${label}\nDeterministic strategies exhausted, attempting AI healing`);

  let aiFailureReason;
  let candidate = null;
  try {
    candidate = await aiHealer.suggestLocator(evidence, {
      client: options.aiClient,
      model: options.aiModel,
    });
    const candidateLocator = buildLocator(page, candidate);
    const candidateDescription = describeStrategy(candidate);
    const count = await waitForCount(candidateLocator, strategyTimeoutMs);

    console.log(`${label}\nAI candidate validation: ${count} match${count === 1 ? '' : 'es'}`);

    if (count === 1) {
      // AI candidates get an extra safety check deterministic strategies do
      // not: a human wrote every deterministic strategy knowing it targets a
      // real, interactive element. Claude only sees sanitized DOM metadata,
      // not rendering state, so it could name an element matched by count()
      // that is hidden, a template stub, or otherwise not actually usable.
      let isVisible = false;
      try {
        await candidateLocator.waitFor({ state: 'visible', timeout: strategyTimeoutMs });
        isVisible = true;
      } catch {
        isVisible = false;
      }

      if (isVisible) {
        console.log(`${label}\nAI HEALED using ${candidateDescription}`);
        reporter.recordEvent(createHealingEvent({
          elementName,
          intent: locatorDef.intent,
          pageUrl: page.url(),
          resolutionType: 'ai-healed',
          deterministicAttempts: attempts.slice(),
          ai: { attempted: true, candidate, accepted: true, failureReason: null },
        }));
        return candidateLocator;
      }
      aiFailureReason = `AI candidate matched exactly one element but it was not visible: ${candidateDescription}`;
    } else if (count === 0) {
      aiFailureReason = `AI candidate matched 0 elements: ${candidateDescription}`;
    } else {
      aiFailureReason = `AI candidate matched ${count} elements (ambiguous), rejected: ${candidateDescription}`;
    }
    console.log(`${label}\n${aiFailureReason}`);
  } catch (err) {
    aiFailureReason = err.message;
    console.log(`${label}\nAI healing failed: ${aiFailureReason}`);
  }

  reporter.recordEvent(createHealingEvent({
    elementName,
    intent: locatorDef.intent,
    pageUrl: page.url(),
    resolutionType: 'failed',
    deterministicAttempts: attempts.slice(),
    ai: { attempted: true, candidate, accepted: false, failureReason: aiFailureReason },
  }));

  throw new LocatorResolutionError(baseMessage, {
    elementName,
    intent: locatorDef.intent,
    attempts,
    evidence,
    aiFailure: aiFailureReason,
  });
}

module.exports = { resolve, DEFAULT_STRATEGY_TIMEOUT_MS, LocatorResolutionError };
