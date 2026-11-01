import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { RulesStoreService } from './rules.store.service';
import { ClaimVisionService } from '../services/claim-vision.service';
import { Rule, RuleDraft } from '../models/rules.model';
import { loadedSlice } from '../../store/store.models';

const makeRule = (id: string, kind: 'custom' | 'system' = 'custom'): Rule => ({
  id,
  name: `Rule ${id}`,
  category: 'category',
  description: 'desc',
  expiresOn: null,
  createdLabel: '2026-01-01\nYou',
  modifiedLabel: '\u2014',
  status: 'Active',
  claimsImpacted: 0,
  matchType: 'any',
  conditions: [],
  actions: [],
  kind,
  scope: 'enterprise',
  scopeValues: [],
});

const makeDraft = (): RuleDraft => ({
  name: 'New Draft Rule',
  category: 'test',
  description: 'a new rule',
  expiresOn: null,
  status: 'Active',
  matchType: 'any',
  conditions: [],
  actions: [],
  kind: 'custom',
  scope: 'enterprise',
  scopeValues: [],
});

describe('RulesStoreService', () => {
  let store: RulesStoreService;
  let claimVisionSpy: jasmine.SpyObj<ClaimVisionService>;

  beforeEach(() => {
    claimVisionSpy = jasmine.createSpyObj<ClaimVisionService>('ClaimVisionService', [
      'getCustomRules',
      'getSystemRules',
      'deleteRule',
      'reorderRules',
    ]);

    claimVisionSpy.getCustomRules.and.returnValue(of([makeRule('1'), makeRule('2')]));
    claimVisionSpy.getSystemRules.and.returnValue(of([makeRule('S1', 'system')]));
    claimVisionSpy.deleteRule.and.returnValue(of({ ruleId: 'x' }));
    claimVisionSpy.reorderRules.and.returnValue(of(undefined as any));

    TestBed.configureTestingModule({
      providers: [
        RulesStoreService,
        { provide: ClaimVisionService, useValue: claimVisionSpy },
      ],
    });

    store = TestBed.inject(RulesStoreService);
  });

  it('should be created', () => {
    expect(store).toBeTruthy();
  });

  it('customRules$ should initially be empty', () => {
    let rules: Rule[] | undefined;
    store.customRules$.subscribe(r => (rules = r));
    expect(rules).toEqual([]);
  });

  it('systemRules$ should initially be empty', () => {
    let rules: Rule[] | undefined;
    store.systemRules$.subscribe(r => (rules = r));
    expect(rules).toEqual([]);
  });

  it('loadAll() should fetch custom and system rules and emit them', (done) => {
    store.loadAll();

    store.customRules$.subscribe(rules => {
      if (rules.length > 0) {
        expect(rules.length).toBe(2);
        expect(rules[0].id).toBe('1');
        done();
      }
    });
  });

  it('loadAll() should emit empty arrays on error', (done) => {
    claimVisionSpy.getCustomRules.and.returnValue(throwError(() => new Error('fail')));

    store.loadAll();

    store.customRules$.subscribe(rules => {
      // After error, rules should be []
      expect(rules).toEqual([]);
      done();
    });
  });

  it('addCustomRule() should add a new rule and return it', () => {
    // Pre-load some rules so the ID calculation works
    store['_custom$'].next(loadedSlice([makeRule('5')]));

    const draft = makeDraft();
    const newRule = store.addCustomRule(draft);

    expect(newRule.id).toBe('6'); // maxNumeric was 5
    expect(newRule.name).toBe(draft.name);
    expect(newRule.kind).toBe('custom');

    let currentRules: Rule[] = [];
    store.customRules$.subscribe(r => (currentRules = r));
    expect(currentRules.length).toBe(2);
  });

  it('updateRule() should update an existing custom rule', () => {
    store['_custom$'].next(loadedSlice([makeRule('1'), makeRule('2')]));

    const updated = { ...makeRule('1'), name: 'Updated Name' };
    store.updateRule(updated);

    let rules: Rule[] = [];
    store.customRules$.subscribe(r => (rules = r));
    const found = rules.find(r => r.id === '1');
    expect(found?.name).toBe('Updated Name');
  });

  it('updateRule() should update a system rule if not found in custom', () => {
    store['_system$'].next(loadedSlice([makeRule('S1', 'system')]));

    const updated = { ...makeRule('S1', 'system'), name: 'Updated System' };
    store.updateRule(updated);

    let rules: Rule[] = [];
    store.systemRules$.subscribe(r => (rules = r));
    expect(rules.find(r => r.id === 'S1')?.name).toBe('Updated System');
  });

  it('deleteRule() should remove a custom rule by id', () => {
    store['_custom$'].next(loadedSlice([makeRule('1'), makeRule('2')]));

    store.deleteRule('1');

    let rules: Rule[] = [];
    store.customRules$.subscribe(r => (rules = r));
    expect(rules.length).toBe(1);
    expect(rules[0].id).toBe('2');
  });

  it('getRuleById() should find a rule in custom rules', () => {
    store['_custom$'].next(loadedSlice([makeRule('10')]));
    const found = store.getRuleById('10');
    expect(found?.id).toBe('10');
  });

  it('getRuleById() should find a rule in system rules', () => {
    store['_system$'].next(loadedSlice([makeRule('S5', 'system')]));
    const found = store.getRuleById('S5');
    expect(found?.id).toBe('S5');
  });

  it('getRuleById() should return undefined if not found', () => {
    const found = store.getRuleById('999');
    expect(found).toBeUndefined();
  });
});
