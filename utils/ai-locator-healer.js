/**
 * AI-assisted locator healer.
 *
 * Single responsibility: given sanitized failure evidence, ask Claude to
 * propose exactly ONE Playwright locator candidate, then strictly validate
 * the shape of that response. This module never touches Page Objects,
 * locator JSON files, or source code, and never persists anything - it only
 * returns a plain candidate object (or throws) for the caller to validate
 * against the live page.
 *
 * SECURITY BOUNDARY:
 * This module must NEVER send to Claude: cookies, storage, headers, input
 * values, passwords, environment variables, or unrestricted HTML. It only
 * forwards the already-sanitized `evidence` object produced by
 * healing-evidence-collector.js.
 */

// --- Configuration: kept in exactly one place, nothing scattered elsewhere ---
const DEFAULT_MODEL = 'claude-sonnet-5';

function isAiHealingEnabled() {
  return process.env.SELF_HEALING_AI_ENABLED === 'true';
}

function getConfiguredModel() {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

const ALLOWED_TYPES = new Set(['css', 'role', 'placeholder']);

/**
 * Strict, manual schema validation. A response is never trusted merely
 * because it parsed as JSON - every field is checked explicitly, and any
 * unexpected shape (arrays, extra fields hinting at code, wrong types) is
 * rejected outright rather than best-effort coerced.
 */
function validateCandidateSchema(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('AI candidate is not a plain object');
  }

  const { type } = candidate;
  if (!ALLOWED_TYPES.has(type)) {
    throw new Error(`AI candidate has unsupported type: ${JSON.stringify(type)}`);
  }

  if (type === 'css' || type === 'placeholder') {
    const keys = Object.keys(candidate);
    if (keys.length !== 2 || !keys.includes('type') || !keys.includes('value')) {
      throw new Error(`AI candidate for type "${type}" has unexpected fields: ${keys.join(', ')}`);
    }
    if (typeof candidate.value !== 'string' || candidate.value.trim() === '') {
      throw new Error(`AI candidate "value" must be a non-empty string`);
    }
    return { type, value: candidate.value };
  }

  // type === 'role'
  const keys = Object.keys(candidate);
  if (keys.length !== 3 || !keys.includes('type') || !keys.includes('role') || !keys.includes('name')) {
    throw new Error(`AI candidate for type "role" has unexpected fields: ${keys.join(', ')}`);
  }
  if (typeof candidate.role !== 'string' || candidate.role.trim() === '') {
    throw new Error('AI candidate "role" must be a non-empty string');
  }
  if (typeof candidate.name !== 'string' || candidate.name.trim() === '') {
    throw new Error('AI candidate "name" must be a non-empty string');
  }
  return { type: 'role', role: candidate.role, name: candidate.name };
}

const SYSTEM_PROMPT = `You are assisting a Playwright test automation resolver.
Given sanitized evidence about a UI element whose known locators all failed,
propose exactly ONE replacement Playwright locator strategy.

Respond with ONLY a single JSON object, no prose, no markdown code fences.
The object must be exactly one of these three shapes:

{"type": "css", "value": "<a valid CSS selector string>"}
{"type": "role", "role": "<ARIA role>", "name": "<accessible name>"}
{"type": "placeholder", "value": "<placeholder text>"}

Do not include any other fields. Do not propose xpath, JavaScript, shell
commands, multiple locators, or anything other than one of the three shapes
above. Base your answer only on the candidateElements provided in the
evidence - do not invent selectors for elements that are not listed there.`;

function buildUserMessage(evidence) {
  // Only the already-sanitized evidence is forwarded. No cookies, storage,
  // headers, input values, passwords, or environment variables ever reach
  // this function, because healing-evidence-collector.js never collects them.
  const payload = {
    element: evidence.element,
    failedStrategies: evidence.failedStrategies,
    page: { url: evidence.url, title: evidence.title },
    candidateElements: evidence.pageEvidence.candidateElements,
  };
  return JSON.stringify(payload);
}

function extractJsonObject(text) {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('AI response did not contain a JSON object');
  }
  return JSON.parse(trimmed.slice(start, end + 1));
}

/**
 * @param {object} evidence - sanitized evidence from collectHealingEvidence()
 * @param {{ client?: object, model?: string }} [options] - `client` allows
 *   injecting a fake Anthropic client for tests; `model` overrides config.
 * @returns {Promise<{type:string, value?:string, role?:string, name?:string}>}
 */
async function suggestLocator(evidence, options = {}) {
  if (!isAiHealingEnabled()) {
    throw new Error('[AIHealer] AI healing is disabled (SELF_HEALING_AI_ENABLED is not "true")');
  }

  const model = options.model || getConfiguredModel();
  let client = options.client;

  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('[AIHealer] ANTHROPIC_API_KEY is not set');
    }
    // Lazily required so unit/mock tests never need this package loaded.
    const Anthropic = require('@anthropic-ai/sdk');
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  console.log('[AIHealer] Requesting locator candidate');

  let response;
  try {
    response = await client.messages.create({
      model,
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserMessage(evidence) }],
    });
  } catch (err) {
    throw new Error(`[AIHealer] Anthropic request failed: ${err.message}`);
  }

  const textBlock = response?.content?.find((block) => block.type === 'text');
  if (!textBlock || typeof textBlock.text !== 'string') {
    throw new Error('[AIHealer] Anthropic response contained no text content');
  }

  let parsed;
  try {
    parsed = extractJsonObject(textBlock.text);
  } catch (err) {
    throw new Error(`[AIHealer] Failed to parse AI response as JSON: ${err.message}`);
  }

  const candidate = validateCandidateSchema(parsed);

  const description =
    candidate.type === 'role'
      ? `role ${candidate.role} "${candidate.name}"`
      : `${candidate.type} ${candidate.value}`;
  console.log(`[AIHealer] Candidate received: ${description}`);

  return candidate;
}

module.exports = {
  suggestLocator,
  validateCandidateSchema,
  isAiHealingEnabled,
  getConfiguredModel,
  DEFAULT_MODEL,
};
