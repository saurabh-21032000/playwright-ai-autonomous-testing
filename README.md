# playwright-ai-autonomous-testing

AI-powered Playwright test automation framework with CI/CD integration, intelligent failure analysis, root-cause detection, and automated test-fix capabilities.

This repository is a learning project building a Playwright framework toward
self-healing locators: deterministic fallback strategies first, with an
optional AI-assisted layer that proposes (never applies) a locator candidate
only after every deterministic strategy has failed.

## Architecture

```
Test
  ↓
Page Object
  ↓
LocatorResolver
  ↓
Known deterministic strategies (css / role / placeholder)
  ├── success → Playwright action
  ↓ all fail
HealingEvidenceCollector (sanitized, bounded snapshot of the page)
  ↓
AI healing enabled?
  ├── no  → LocatorResolutionError
  └── yes
       ↓
     Claude proposes ONE locator candidate
       ↓
     strict schema validation (css / role / placeholder only)
       ↓
     Playwright validation (exactly one match, and visible)
       ├── valid  → runtime healing (never persisted)
       └── invalid → LocatorResolutionError
```

- **Deterministic healing** (`utils/locator-resolver.js`): each element has an
  ordered list of locator strategies. The resolver tries each with a short,
  bounded wait (so a genuinely correct but slow-to-render element isn't
  mistaken for a broken one) and requires exactly one match - never `.first()`
  to paper over an ambiguous selector.
- **Evidence collection** (`utils/healing-evidence-collector.js`): runs only
  after every deterministic strategy fails. Collects the page URL/title, the
  failed attempts, and a bounded list of candidate DOM elements (tag, id,
  name, type, placeholder, aria-label, role, data-test/data-testid, truncated
  text). It never reads input values, cookies, storage, headers, tokens, or
  environment variables.
- **AI candidate generation** (`utils/ai-locator-healer.js`): sends only that
  sanitized evidence to Claude and asks for exactly one locator candidate in
  a strict JSON shape. The response is never trusted merely for being valid
  JSON - it goes through manual schema validation before anything else
  touches it.
- **Playwright validation stays the final authority**: an AI candidate is
  rejected unless it resolves to exactly one match and that match is visible.
  Healing is **runtime-only** - nothing is ever written back to a locator
  JSON file, a Page Object, or committed automatically.

## Feature flags

| Variable | Purpose | Default |
|---|---|---|
| `SELF_HEALING_AI_ENABLED` | Must be exactly `"true"` to allow AI healing at all | off |
| `ANTHROPIC_API_KEY` | Read only from the environment, never hardcoded | required only when AI healing runs for real |
| `ANTHROPIC_MODEL` | Overrides the single default model constant in `utils/ai-locator-healer.js` | a documented default |
| `RUN_LIVE_AI_SMOKE` | Gate for the one live Anthropic integration test | off |

AI healing is **off by default**. Normal test runs have zero AI latency and
zero AI cost, because the AI path is only reached after every deterministic
strategy has already failed.

## Running tests locally

```
npm test
```

This runs the full deterministic suite plus the mocked AI-healing tests
(which inject a fake Anthropic client and make **zero** real network calls).
The one live Anthropic test (`tests/ai-healing-live.spec.js`) is skipped
unless you explicitly opt in:

```
SELF_HEALING_AI_ENABLED=true RUN_LIVE_AI_SMOKE=true npm test
```

Having `ANTHROPIC_API_KEY` set locally does **not** cause `npm test` to spend
credits - `RUN_LIVE_AI_SMOKE` is a separate, explicit gate for that.

### Local API key setup

Put your key in a local `.env` file (already gitignored, never committed):

```
ANTHROPIC_API_KEY=your-key-here
```

There is no `.env.example` in this repository by design - do not recreate one.

## CI

- **`.github/workflows/playwright.yml`** - runs on push/PR to `main` and via
  manual dispatch. Installs dependencies, installs only the Chromium browser
  (the only browser this project's `playwright.config.js` configures), and
  runs `npm test` with `SELF_HEALING_AI_ENABLED=false` and
  `RUN_LIVE_AI_SMOKE=false` explicitly set. This workflow never receives
  `ANTHROPIC_API_KEY` - it is deterministic, free of Claude API cost, and
  independent of Anthropic's availability. The Playwright report is uploaded
  as an artifact on every run; failure traces/screenshots/videos are uploaded
  only on failure.
- **`.github/workflows/ai-healing-smoke.yml`** - **manual trigger only**
  (`workflow_dispatch`). Runs just `tests/ai-healing-live.spec.js` against
  the real Anthropic API, using the `ANTHROPIC_API_KEY` repository secret.
  This is validation only: it never edits source, commits a locator, pushes,
  or opens a pull request - it simply passes or fails.

### Configuring GitHub secrets/variables (one-time, manual)

1. Open the GitHub repository.
2. **Settings**.
3. **Secrets and variables**.
4. **Actions**.
5. **New repository secret**.
6. Name: `ANTHROPIC_API_KEY`.
7. Paste the API key value.
8. Save.

Optionally, to pin a specific model without editing code:

1. **Settings** → **Secrets and variables** → **Actions** → **Variables** tab.
2. **New repository variable**.
3. Name: `ANTHROPIC_MODEL`, value: the model id to use.

Never commit real credential values anywhere in this repository.

### Running the manual AI smoke test

1. GitHub repository → **Actions**.
2. Select **AI Healing Smoke** in the left sidebar.
3. **Run workflow**.
4. Choose the branch to run it against.
5. **Run workflow**.
