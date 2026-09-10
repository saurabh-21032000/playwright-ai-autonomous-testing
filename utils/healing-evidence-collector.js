/**
 * Failure evidence collector.
 *
 * Runs ONLY after every deterministic locator strategy has failed. Gathers a
 * small, bounded, sanitized snapshot of the page so a future AI layer
 * (Phase 1C - not implemented here) has enough context to propose a
 * candidate locator, without ever seeing secrets or unrelated browser state.
 *
 * SECURITY / PRIVACY BOUNDARY (see collectCandidateElements):
 * This module must NEVER read or return:
 *   - input/textarea .value (current entered or default value)
 *   - cookies, localStorage, sessionStorage
 *   - request/response headers, auth tokens
 *   - environment variables
 * It may only read static, non-sensitive DOM metadata: tag name, id, name,
 * type, placeholder, aria-label, role, data-test/data-testid, and a
 * length-bounded slice of visible text.
 */

const MAX_CANDIDATE_ELEMENTS = 100;
const MAX_TEXT_LENGTH = 80;

// Elements worth showing a future AI layer as candidates for a broken
// locator: interactive controls and anything explicitly marked for testing
// or accessibility. Deliberately not "*" - keeps evidence relevant and small.
const CANDIDATE_SELECTOR = 'button, input, a, select, textarea, [role], [data-test], [data-testid]';

async function collectCandidateElements(page) {
  return page.evaluate(
    ({ selector, maxElements, maxTextLength }) => {
      function truncate(value) {
        if (!value) return undefined;
        const trimmed = value.trim();
        if (!trimmed) return undefined;
        return trimmed.length > maxTextLength ? `${trimmed.slice(0, maxTextLength)}...` : trimmed;
      }

      const elements = Array.from(document.querySelectorAll(selector)).slice(0, maxElements);

      // Every string field is bounded via truncate(), not just text - an
      // attribute value (e.g. a pathological id/placeholder) must not be
      // able to make a single candidate's evidence unbounded in size.
      return elements.map((el) => ({
        tag: el.tagName.toLowerCase(),
        id: truncate(el.id),
        name: truncate(el.getAttribute('name')),
        type: truncate(el.getAttribute('type')),
        placeholder: truncate(el.getAttribute('placeholder')),
        ariaLabel: truncate(el.getAttribute('aria-label')),
        role: truncate(el.getAttribute('role')),
        dataTest: truncate(el.getAttribute('data-test') || el.getAttribute('data-testid')),
        text: truncate(el.textContent),
        // Deliberately NOT collected: el.value, el.checked, el.files, cookies, storage.
      }));
    },
    { selector: CANDIDATE_SELECTOR, maxElements: MAX_CANDIDATE_ELEMENTS, maxTextLength: MAX_TEXT_LENGTH }
  );
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ elementName: string, intent: string, attempts: Array<{strategyNumber:number,type:string,description:string,matchCount:number}> }} context
 */
async function collectHealingEvidence(page, { elementName, intent, attempts }) {
  const candidateElements = await collectCandidateElements(page);

  return {
    timestamp: new Date().toISOString(),
    url: page.url(),
    title: await page.title(),
    element: {
      name: elementName,
      intent,
    },
    failedStrategies: attempts.map((a) => ({
      type: a.type,
      description: a.description,
      matchCount: a.matchCount,
    })),
    pageEvidence: {
      candidateElements,
      candidateElementCount: candidateElements.length,
    },
  };
}

module.exports = { collectHealingEvidence, MAX_CANDIDATE_ELEMENTS, MAX_TEXT_LENGTH };
