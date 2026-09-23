const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { validateCandidateSchema } = require('../utils/ai-locator-healer');

// Plain @playwright/test, not the project fixture - this validates static
// config files on disk and needs no browser page at all.

const LOCATORS_DIR = path.join(__dirname, '..', 'locators');
const fileNames = fs.readdirSync(LOCATORS_DIR).filter((f) => f.endsWith('.json'));

test.describe('Locator configuration validity', () => {
  for (const fileName of fileNames) {
    test(`${fileName} is well-formed`, () => {
      const filePath = path.join(LOCATORS_DIR, fileName);
      const raw = fs.readFileSync(filePath, 'utf8');

      let parsed;
      expect(() => {
        parsed = JSON.parse(raw);
      }, `${fileName} must be valid JSON`).not.toThrow();

      const elementNames = Object.keys(parsed);
      expect(elementNames.length, `${fileName} must define at least one locator`).toBeGreaterThan(0);

      for (const elementName of elementNames) {
        const def = parsed[elementName];

        expect(
          typeof def.intent === 'string' && def.intent.trim().length > 0,
          `${fileName}: "${elementName}" must have a non-empty "intent" string`
        ).toBe(true);

        expect(
          Array.isArray(def.strategies) && def.strategies.length > 0,
          `${fileName}: "${elementName}" must have a non-empty "strategies" array`
        ).toBe(true);

        def.strategies.forEach((strategy, i) => {
          // Reuses the same strict schema validation applied to Claude's
          // proposed candidates - a deterministic, human-authored strategy
          // must be held to the exact same bar, not a looser one.
          expect(
            () => validateCandidateSchema(strategy),
            `${fileName}: "${elementName}" strategy #${i + 1} is invalid: ${JSON.stringify(strategy)}`
          ).not.toThrow();
        });
      }
    });
  }
});
