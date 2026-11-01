import { TestBed } from '@angular/core/testing';
import { ClaimRulesService } from './rules.service';
import { Rule } from '../../../core/models/rules.model';

describe('ClaimRulesService', () => {
  let service: ClaimRulesService;

  const makeRule = (id: string, name = 'Test Rule'): Rule => ({
    id, name, category: 'Coding', description: 'desc', matchType: 'any', conditions: [], actions: [],
    status: 'Active', expiresOn: null, createdLabel: 'Jan 1\nAdmin', modifiedLabel: '\u2014',
    claimsImpacted: 0, kind: 'custom', scope: 'enterprise', scopeValues: [],
  });

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(ClaimRulesService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should start with empty overrides', (done) => {
    service.overrides$.subscribe((rules) => {
      expect(rules).toEqual([]);
      done();
    });
  });

  it('should start with empty rules$', (done) => {
    service.rules$.subscribe((rules) => {
      expect(rules).toEqual([]);
      done();
    });
  });

  it('upsertRule should add a new rule', (done) => {
    const rule = makeRule('new-rule');
    service.upsertRule(rule);

    service.overrides$.subscribe((rules) => {
      expect(rules.some(r => r.id === 'new-rule')).toBeTrue();
      done();
    });
  });

  it('upsertRule should replace existing rule with same id', (done) => {
    const rule = makeRule('existing');
    service.upsertRule(rule);
    const updated = { ...rule, name: 'Updated Name' };
    service.upsertRule(updated);

    service.overrides$.subscribe((rules) => {
      const found = rules.find(r => r.id === 'existing');
      expect(found?.name).toBe('Updated Name');
      expect(rules.filter(r => r.id === 'existing').length).toBe(1);
      done();
    });
  });

  it('upsertRule should generate a local id when id is empty', (done) => {
    const rule = { ...makeRule(''), id: '' };
    service.upsertRule(rule);

    service.overrides$.subscribe((rules) => {
      expect(rules.length).toBe(1);
      expect(rules[0].id).toMatch(/^local-/);
      done();
    });
  });

  it('deleteRule should remove rule by id', (done) => {
    service.upsertRule(makeRule('to-delete'));
    service.deleteRule('to-delete');

    service.overrides$.subscribe((rules) => {
      expect(rules.some(r => r.id === 'to-delete')).toBeFalse();
      done();
    });
  });

  it('deleteRule should be a no-op for unknown id', (done) => {
    service.upsertRule(makeRule('rule-a'));
    service.deleteRule('does-not-exist');

    service.overrides$.subscribe((rules) => {
      expect(rules.some(r => r.id === 'rule-a')).toBeTrue();
      done();
    });
  });

  it('applyOverrides should merge overrides with base rules', () => {
    const base = [makeRule('base-1'), makeRule('base-2')];
    const override = { ...makeRule('base-1'), name: 'Overridden' };
    service.upsertRule(override);

    const result = service.applyOverrides(base);
    expect(result.find(r => r.id === 'base-1')?.name).toBe('Overridden');
    expect(result.some(r => r.id === 'base-2')).toBeTrue();
  });

  it('applyOverrides should append local-only rules', () => {
    const base = [makeRule('base-1')];
    service.upsertRule(makeRule('local-only'));

    const result = service.applyOverrides(base);
    expect(result.some(r => r.id === 'local-only')).toBeTrue();
  });

  it('applyOverrides should return base rules unchanged when no overrides', () => {
    const base = [makeRule('b1'), makeRule('b2')];
    const result = service.applyOverrides(base);
    expect(result).toEqual(base);
  });

  it('clearLocal should empty overrides', (done) => {
    service.upsertRule(makeRule('r1'));
    service.clearLocal();

    service.overrides$.subscribe((rules) => {
      expect(rules).toEqual([]);
      done();
    });
  });

  it('loadRules should re-sync from sessionStorage', (done) => {
    service.upsertRule(makeRule('synced'));
    // Create a new instance to simulate fresh construction
    sessionStorage.clear();
    service.loadRules();

    service.overrides$.subscribe((rules) => {
      expect(rules).toEqual([]);
      done();
    });
  });
});
