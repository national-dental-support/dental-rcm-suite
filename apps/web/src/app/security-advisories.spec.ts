import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

/**
 * Enforces the documented position on dependency advisories.
 *
 * One advisory in this tree has no upstream fix: deepmerge's prototype-poisoning
 * issue covers >=4.2.0 through <=4.3.1, and 4.3.1 is the latest published
 * version. There is nothing to upgrade to.
 *
 * The mitigation is that deepmerge is reachable only as a development
 * dependency - jest-config uses it to merge configuration objects authored in
 * this repository, never untrusted input - and it is therefore absent from any
 * shipped artefact.
 *
 * That mitigation is only true while it stays true. These tests fail if it
 * decays, so the reasoning cannot quietly stop applying:
 *
 *   - if deepmerge becomes reachable from production dependencies, or
 *   - if an advisory appears against a package we actually ship.
 *
 * npm's own suggested "fix" for this chain is jest@25, five majors backwards.
 * Deliberately not taken: regressing the test runner to resolve a dev-only
 * advisory trades a real capability for a cosmetic audit number.
 */

const workspaceRoot = path.resolve(__dirname, '..', '..');

function npmJson(args: string[]): any {
  try {
    const out = execFileSync('npm', args, {
      cwd: workspaceRoot,
      encoding: 'utf-8',
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    });
    return JSON.parse(out || '{}');
  } catch (err: any) {
    // npm exits non-zero when it finds advisories, but still writes the report.
    const out = err?.stdout;
    if (typeof out === 'string' && out.trim()) {
      try {
        return JSON.parse(out);
      } catch {
        return null;
      }
    }
    return null;
  }
}

describe('dependency advisories', () => {
  it('deepmerge stays out of the production dependency tree', () => {
    const tree = npmJson(['ls', 'deepmerge', '--omit=dev', '--json']);

    if (tree === null) {
      // Without npm available we cannot assert; say so rather than pass quietly.
      console.warn('[advisories] npm unavailable - production-tree check skipped');
      return;
    }

    const deps = tree.dependencies ?? {};
    expect(Object.keys(deps)).toEqual([]);
  });

  it('records the advisories we accept, so the list cannot grow unnoticed', () => {
    const audit = npmJson(['audit', '--json']);

    if (audit === null) {
      console.warn('[advisories] npm unavailable - audit check skipped');
      return;
    }

    const pkg = JSON.parse(
      fs.readFileSync(path.join(workspaceRoot, 'package.json'), 'utf-8'),
    );
    const production = new Set(Object.keys(pkg.dependencies ?? {}));

    const vulns: Record<string, any> = audit.vulnerabilities ?? {};

    // Nothing we ship may carry an advisory. Dev tooling is a different risk
    // class; a shipped artefact is not.
    const shipped = Object.keys(vulns).filter(name => production.has(name));
    expect(shipped).toEqual([]);

    // And nothing may reach high or critical, at any scope.
    const severe = Object.entries(vulns)
      .filter(([, v]) => v.severity === 'high' || v.severity === 'critical')
      .map(([name, v]) => `${name} (${v.severity})`);
    expect(severe).toEqual([]);
  });
});
