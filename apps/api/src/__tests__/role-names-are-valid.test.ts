import * as fs from 'fs';
import * as path from 'path';

/**
 * Every role name passed to requireRole must exist in ROLE_HIERARCHY.
 *
 * requireRole fails closed on a name it does not recognise - an unknown role
 * demands an impossible level, so the route denies everyone. That is the right
 * behaviour: a typo becomes a visible outage instead of a silent privilege
 * hole. But nothing stopped the typo being committed.
 *
 * One had been: `requireRole('manager')` on GET /api/writeoff/audit, lowercase
 * where the hierarchy is keyed 'Manager'. That route refused every caller,
 * Super Admin included, and no test noticed because the failure needs the route
 * table and the hierarchy to be read together.
 */

const apiSrc = path.resolve(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      walk(full, out);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** The hierarchy keys, read from the middleware rather than duplicated here. */
function validRoles(): string[] {
  const source = fs.readFileSync(
    path.join(apiSrc, 'middleware', 'require-role.ts'),
    'utf-8',
  );
  const block = source.slice(
    source.indexOf('ROLE_HIERARCHY'),
    source.indexOf('export function requireRole'),
  );
  return [...block.matchAll(/'([^']+)'\s*:\s*\d+/g)].map(m => m[1]);
}

describe('requireRole call sites', () => {
  it('reads a non-empty role hierarchy', () => {
    const roles = validRoles();
    expect(roles.length).toBeGreaterThan(3);
    expect(roles).toContain('Manager');
    expect(roles).toContain('Super Admin');
  });

  it('passes only names the hierarchy knows', () => {
    const roles = new Set(validRoles());
    const offenders: string[] = [];

    for (const file of walk(apiSrc)) {
      const text = fs.readFileSync(file, 'utf-8');
      for (const m of text.matchAll(/requireRole\(\s*'([^']+)'/g)) {
        if (!roles.has(m[1])) {
          const line = text.slice(0, m.index).split('\n').length;
          offenders.push(`${path.relative(apiSrc, file)}:${line} -> '${m[1]}'`);
        }
      }
    }

    // Any entry here is a route that denies every caller.
    expect(offenders).toEqual([]);
  });
});
