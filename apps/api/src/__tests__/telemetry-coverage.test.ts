/**
 * Unit Test - Telemetry Coverage
 *
 * Verifies that instrumented controllers import and use trackEvent.
 *
 * Run: npm test -- --testPathPattern=telemetry-coverage
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const CONTROLLERS_DIR = path.join(__dirname, '..', 'controllers');

/**
 * Controllers that are expected to have telemetry instrumentation (trackEvent).
 */
const INSTRUMENTED_CONTROLLERS = [
  'payments/index.ts',
  'denial-iq/claim-detail/claim-actions.ts',
  'denial-iq/payer-intelligence.ts',
];

describe('Telemetry Coverage \u2014 trackEvent import', () => {
  for (const controllerPath of INSTRUMENTED_CONTROLLERS) {
    const fullPath = path.join(CONTROLLERS_DIR, controllerPath);

    it(`${controllerPath} imports or references trackEvent`, () => {
      expect(fs.existsSync(fullPath)).toBe(true);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const hasTrackEvent = content.includes('trackEvent');
      expect(hasTrackEvent).toBe(true);
    });
  }
});
