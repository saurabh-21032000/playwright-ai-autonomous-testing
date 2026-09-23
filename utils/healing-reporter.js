/**
 * Healing audit reporter - structured observability for locator resolution.
 *
 * Pure observer: records what LocatorResolver already decided. It never
 * calls Claude, never touches Page Objects or locator JSON files, and never
 * persists a selector into source code. The resolver remains the sole
 * authority over primary/fallback/AI decisions - this module only watches.
 */

const fs = require('fs');
const path = require('path');

/**
 * Builds one structured healing event. Deliberately small: locator
 * resolution metadata only, never full DOM evidence or secrets.
 *
 * @param {object} fields
 * @param {string} fields.elementName
 * @param {string} fields.intent
 * @param {string} fields.pageUrl
 * @param {"primary"|"deterministic-fallback"|"ai-healed"|"failed"} fields.resolutionType
 * @param {Array<{strategyNumber:number,type:string,description:string,matchCount:number}>} [fields.deterministicAttempts] - failed attempts only
 * @param {{strategyNumber:number,type:string,description:string}|null} [fields.succeededStrategy]
 * @param {{attempted:boolean,candidate:object|null,accepted:boolean|null,failureReason:string|null}} [fields.ai]
 */
function createHealingEvent(fields) {
  return {
    timestamp: new Date().toISOString(),
    elementName: fields.elementName,
    intent: fields.intent,
    pageUrl: fields.pageUrl,
    resolutionType: fields.resolutionType,
    deterministicAttempts: fields.deterministicAttempts || [],
    succeededStrategy: fields.succeededStrategy || null,
    ai: fields.ai || { attempted: false, candidate: null, accepted: null, failureReason: null },
  };
}

class HealingReporter {
  constructor() {
    this.events = [];
  }

  recordEvent(event) {
    this.events.push(event);
  }

  getEvents() {
    return this.events.slice();
  }

  clearEvents() {
    this.events = [];
  }

  /**
   * Writes the current events to disk as JSON. This is a deliberate,
   * caller-triggered step (e.g. end of a test run) - the reporter never
   * writes a file on every resolution by itself.
   */
  writeReport(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(this.events, null, 2));
  }
}

// Shared default instance used by the resolver when no reporter is injected
// (normal test/production runs, where nothing inspects it). Tests that need
// isolation under Playwright's parallel workers should construct their own
// `new HealingReporter()` and pass it via resolve()'s `options.reporter`.
const defaultReporter = new HealingReporter();

module.exports = { HealingReporter, defaultReporter, createHealingEvent };
