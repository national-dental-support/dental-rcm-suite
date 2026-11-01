import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, SimpleChange } from '@angular/core';
import { of, EMPTY } from 'rxjs';

import { RulesListCardComponent } from './rules-list-card.component';
import { FilterDialogService } from '../../../../shared/components/filter-dialog/filter-dialog.service';
import { Rule } from '../../../../core/models/rules.model';

function makeRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 'R-001',
    name: 'Test Rule',
    category: 'Billing',
    description: 'A test rule',
    matchType: 'any',
    conditions: [],
    actions: [],
    status: 'Active',
    expiresOn: 'Apr 21, 2025',
    createdLabel: 'Mar 10, 2025\nMarion Denton',
    modifiedLabel: 'Mar 18, 2025\nMarion Denton',
    claimsImpacted: 42,
    kind: 'custom',
    ...overrides,
  };
}

function makeRules(count: number): Rule[] {
  return Array.from({ length: count }, (_, i) =>
    makeRule({
      id: `R-${String(i + 1).padStart(3, '0')}`,
      name: `Rule ${i + 1}`,
      category: i % 2 === 0 ? 'Billing' : 'Coding',
      status: i % 3 === 0 ? 'Inactive' : 'Active',
      claimsImpacted: (i + 1) * 10,
      createdLabel: `Jan ${i + 1}, 2025\nUser ${i}`,
      modifiedLabel: `Feb ${i + 1}, 2025\nUser ${i}`,
      expiresOn: i % 4 === 0 ? null : `May ${i + 1}, 2025`,
    })
  );
}

function triggerRulesChange(component: RulesListCardComponent, rules?: Rule[]): void {
  if (rules !== undefined) {
    component.rules = rules;
  }
  component.ngOnChanges({
    rules: new SimpleChange(null, component.rules, true),
  });
}

describe('RulesListCardComponent', () => {
  let component: RulesListCardComponent;
  let fixture: ComponentFixture<RulesListCardComponent>;
  let filterDialogSpy: jasmine.SpyObj<FilterDialogService>;

  beforeEach(() => {
    filterDialogSpy = jasmine.createSpyObj('FilterDialogService', ['open']);
    filterDialogSpy.open.and.returnValue(EMPTY);

    TestBed.configureTestingModule({
      declarations: [RulesListCardComponent],
      providers: [
        { provide: FilterDialogService, useValue: filterDialogSpy },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(RulesListCardComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- ngOnChanges ---

  it('should populate filteredRules when rules input changes', () => {
    triggerRulesChange(component, makeRules(3));
    expect(component.filteredRules.length).toBe(3);
    expect(component.pagedRules.length).toBe(3);
  });

  it('should not update when a non-rules input changes', () => {
    component.rules = makeRules(5);
    component.ngOnChanges({ title: new SimpleChange('', 'New', false) });
    expect(component.filteredRules.length).toBe(0);
  });

  // --- rangeLabel ---

  it('should return "0 of 0" when totalCount is 0', () => {
    component.totalCount = 0;
    expect(component.rangeLabel).toBe('0 of 0');
  });

  it('should return correct range for first page', () => {
    triggerRulesChange(component, makeRules(25));
    expect(component.rangeLabel).toBe('1\u201310 of 25');
  });

  it('should return correct range for last partial page', () => {
    triggerRulesChange(component, makeRules(12));
    component.nextPage();
    expect(component.rangeLabel).toBe('11\u201312 of 12');
  });

  // --- onSearch ---

  it('should filter rules by name match', () => {
    triggerRulesChange(component, makeRules(5));
    component.onSearch('Rule 3');
    expect(component.filteredRules.length).toBe(1);
    expect(component.filteredRules[0].name).toBe('Rule 3');
  });

  it('should filter by description match', () => {
    triggerRulesChange(component, [
      makeRule({ name: 'A', description: 'Special desc' }),
      makeRule({ name: 'B', description: 'Other' }),
    ]);
    component.onSearch('special');
    expect(component.filteredRules.length).toBe(1);
  });

  it('should filter by category match', () => {
    triggerRulesChange(component, makeRules(4));
    component.onSearch('coding');
    expect(component.filteredRules.every(r => r.category === 'Coding')).toBeTrue();
  });

  it('should filter by id match', () => {
    triggerRulesChange(component, makeRules(5));
    component.onSearch('R-003');
    expect(component.filteredRules.length).toBe(1);
  });

  it('should filter by createdLabel match', () => {
    triggerRulesChange(component, makeRules(5));
    component.onSearch('User 2');
    expect(component.filteredRules.length).toBe(1);
  });

  it('should filter by modifiedLabel match', () => {
    triggerRulesChange(component, makeRules(5));
    component.onSearch('Feb 3');
    expect(component.filteredRules.length).toBe(1);
  });

  it('should filter by status match', () => {
    triggerRulesChange(component, makeRules(6));
    component.onSearch('inactive');
    expect(component.filteredRules.every(r => r.status === 'Inactive')).toBeTrue();
  });

  it('should filter by expiresOn match', () => {
    triggerRulesChange(component, makeRules(5));
    component.onSearch('May 2');
    expect(component.filteredRules.length).toBeGreaterThan(0);
  });

  it('should filter by numeric claimsImpacted match', () => {
    triggerRulesChange(component, makeRules(5));
    component.onSearch('30');
    expect(component.filteredRules.some(r => r.claimsImpacted === 30)).toBeTrue();
  });

  it('should reset pageIndex to 0 on search', () => {
    triggerRulesChange(component, makeRules(25));
    component.nextPage();
    expect(component.pageIndex).toBe(1);
    component.onSearch('Rule');
    expect(component.pageIndex).toBe(0);
  });

  it('should handle null search term gracefully', () => {
    triggerRulesChange(component, makeRules(3));
    component.onSearch(null as any);
    expect(component.filteredRules.length).toBe(3);
  });

  it('should restore all rules on empty search', () => {
    triggerRulesChange(component, makeRules(5));
    component.onSearch('Rule 1');
    component.onSearch('');
    expect(component.filteredRules.length).toBe(5);
  });

  // --- onSearchInput ---

  it('should extract value from input event', () => {
    triggerRulesChange(component, makeRules(5));
    const event = { target: { value: 'Rule 2' } } as unknown as Event;
    component.onSearchInput(event);
    expect(component.searchTerm).toBe('Rule 2');
    expect(component.filteredRules.length).toBe(1);
  });

  it('should handle event with null target', () => {
    triggerRulesChange(component, makeRules(3));
    const event = { target: null } as unknown as Event;
    component.onSearchInput(event);
    expect(component.searchTerm).toBe('');
    expect(component.filteredRules.length).toBe(3);
  });

  // --- openFilter ---

  it('should open filter dialog with correct config', fakeAsync(() => {
    filterDialogSpy.open.and.returnValue(of({ values: { name: 'test' } }));
    component.title = 'Custom Rules';
    triggerRulesChange(component, makeRules(3));
    component.openFilter();
    tick();

    expect(filterDialogSpy.open).toHaveBeenCalledTimes(1);
    const config = filterDialogSpy.open.calls.mostRecent().args[0];
    expect(config.title).toBe('Custom Rules Filters');
    expect(config.fields.length).toBe(7);
    expect(config.gridColumns).toBe(12);
  }));

  it('should use "Rules" as default title when title is empty', fakeAsync(() => {
    filterDialogSpy.open.and.returnValue(of(undefined));
    component.title = '';
    triggerRulesChange(component, []);
    component.openFilter();
    tick();
    const config = filterDialogSpy.open.calls.mostRecent().args[0];
    expect(config.title).toBe('Rules Filters');
  }));

  it('should apply filter result values', fakeAsync(() => {
    filterDialogSpy.open.and.returnValue(of({ values: { category: ['Billing'] } }));
    triggerRulesChange(component, makeRules(6));
    component.openFilter();
    tick();
    expect(component.filteredRules.every(r => r.category === 'Billing')).toBeTrue();
  }));

  it('should reset filters on "reset" result', fakeAsync(() => {
    filterDialogSpy.open.and.returnValue(of({ values: { category: ['Billing'] } }));
    triggerRulesChange(component, makeRules(6));
    component.openFilter();
    tick();

    filterDialogSpy.open.and.returnValue(of('reset' as any));
    component.openFilter();
    tick();
    expect(component.filteredRules.length).toBe(6);
  }));

  it('should do nothing on undefined (dialog dismissed)', fakeAsync(() => {
    filterDialogSpy.open.and.returnValue(of(undefined));
    triggerRulesChange(component, makeRules(3));
    component.openFilter();
    tick();
    expect(component.filteredRules.length).toBe(3);
  }));

  it('should do nothing when result is null/falsy', fakeAsync(() => {
    filterDialogSpy.open.and.returnValue(of(null as any));
    triggerRulesChange(component, makeRules(3));
    component.openFilter();
    tick();
    expect(component.filteredRules.length).toBe(3);
  }));

  // --- matchesFilters: name ---

  it('should filter by name via dialog', fakeAsync(() => {
    filterDialogSpy.open.and.returnValue(of({ values: { name: 'Rule 1' } }));
    triggerRulesChange(component, makeRules(5));
    component.openFilter();
    tick();
    expect(component.filteredRules.length).toBe(1);
  }));

  // --- matchesFilters: status ---

  it('should filter by status via dialog', fakeAsync(() => {
    filterDialogSpy.open.and.returnValue(of({ values: { status: ['Active'] } }));
    triggerRulesChange(component, makeRules(6));
    component.openFilter();
    tick();
    expect(component.filteredRules.every(r => r.status === 'Active')).toBeTrue();
  }));

  // --- matchesFilters: expiresOn ---

  it('should filter by expiresOn text', fakeAsync(() => {
    filterDialogSpy.open.and.returnValue(of({ values: { expiresOn: 'May 2' } }));
    triggerRulesChange(component, makeRules(5));
    component.openFilter();
    tick();
    expect(component.filteredRules.length).toBeGreaterThan(0);
    component.filteredRules.forEach(r => {
      expect((r.expiresOn ?? '').toLowerCase()).toContain('may 2');
    });
  }));

  it('should match expiresOn null as dash', fakeAsync(() => {
    filterDialogSpy.open.and.returnValue(of({ values: { expiresOn: '\u2014' } }));
    triggerRulesChange(component, [makeRule({ expiresOn: null })]);
    component.openFilter();
    tick();
    expect(component.filteredRules.length).toBe(1);
  }));

  // --- matchesFilters: claimsImpacted range ---

  it('should filter by claimsImpacted min only', fakeAsync(() => {
    filterDialogSpy.open.and.returnValue(of({ values: { claimsImpacted: { min: 30, max: null } } }));
    triggerRulesChange(component, makeRules(5));
    component.openFilter();
    tick();
    expect(component.filteredRules.every(r => r.claimsImpacted >= 30)).toBeTrue();
  }));

  it('should filter by claimsImpacted max only', fakeAsync(() => {
    filterDialogSpy.open.and.returnValue(of({ values: { claimsImpacted: { min: null, max: 30 } } }));
    triggerRulesChange(component, makeRules(5));
    component.openFilter();
    tick();
    expect(component.filteredRules.every(r => r.claimsImpacted <= 30)).toBeTrue();
  }));

  it('should filter by claimsImpacted min and max', fakeAsync(() => {
    filterDialogSpy.open.and.returnValue(of({ values: { claimsImpacted: { min: 20, max: 40 } } }));
    triggerRulesChange(component, makeRules(5));
    component.openFilter();
    tick();
    expect(component.filteredRules.every(r => r.claimsImpacted >= 20 && r.claimsImpacted <= 40)).toBeTrue();
  }));

  // --- matchesFilters: createdLabel / modifiedLabel ---

  it('should filter by createdLabel via dialog', fakeAsync(() => {
    filterDialogSpy.open.and.returnValue(of({ values: { createdLabel: 'User 2' } }));
    triggerRulesChange(component, makeRules(5));
    component.openFilter();
    tick();
    expect(component.filteredRules.length).toBe(1);
    expect(component.filteredRules[0].createdLabel).toContain('User 2');
  }));

  it('should filter by modifiedLabel via dialog', fakeAsync(() => {
    filterDialogSpy.open.and.returnValue(of({ values: { modifiedLabel: 'User 3' } }));
    triggerRulesChange(component, makeRules(5));
    component.openFilter();
    tick();
    expect(component.filteredRules.length).toBe(1);
    expect(component.filteredRules[0].modifiedLabel).toContain('User 3');
  }));

  // --- normalizeMulti edge cases ---

  it('should treat "__ALL__" as no filter', fakeAsync(() => {
    filterDialogSpy.open.and.returnValue(of({ values: { category: ['__ALL__'] } }));
    triggerRulesChange(component, makeRules(6));
    component.openFilter();
    tick();
    expect(component.filteredRules.length).toBe(6);
  }));

  it('should treat "all" as no filter', fakeAsync(() => {
    filterDialogSpy.open.and.returnValue(of({ values: { status: ['all'] } }));
    triggerRulesChange(component, makeRules(6));
    component.openFilter();
    tick();
    expect(component.filteredRules.length).toBe(6);
  }));

  it('should handle single non-array value for multiselect', fakeAsync(() => {
    filterDialogSpy.open.and.returnValue(of({ values: { status: 'Active' } }));
    triggerRulesChange(component, makeRules(6));
    component.openFilter();
    tick();
    expect(component.filteredRules.every(r => r.status === 'Active')).toBeTrue();
  }));

  it('should handle null/falsy multiselect value', fakeAsync(() => {
    filterDialogSpy.open.and.returnValue(of({ values: { category: null } }));
    triggerRulesChange(component, makeRules(6));
    component.openFilter();
    tick();
    expect(component.filteredRules.length).toBe(6);
  }));

  // --- setSort ---

  it('should sort by name ascending', () => {
    triggerRulesChange(component, [
      makeRule({ name: 'Zeta' }),
      makeRule({ name: 'Alpha' }),
      makeRule({ name: 'Mu' }),
    ]);
    component.setSort('name');
    expect(component.filteredRules[0].name).toBe('Alpha');
    expect(component.filteredRules[2].name).toBe('Zeta');
    expect(component.sortDirection).toBe('asc');
  });

  it('should toggle to descending on second click', () => {
    triggerRulesChange(component, [
      makeRule({ name: 'Alpha' }),
      makeRule({ name: 'Zeta' }),
    ]);
    component.setSort('name');
    component.setSort('name');
    expect(component.sortDirection).toBe('desc');
    expect(component.filteredRules[0].name).toBe('Zeta');
  });

  it('should reset direction when switching columns', () => {
    triggerRulesChange(component, makeRules(3));
    component.setSort('name');
    component.setSort('name'); // desc
    component.setSort('category');
    expect(component.sortColumn).toBe('category');
    expect(component.sortDirection).toBe('asc');
  });

  it('should sort by claimsImpacted numerically', () => {
    triggerRulesChange(component, [
      makeRule({ claimsImpacted: 100 }),
      makeRule({ claimsImpacted: 5 }),
      makeRule({ claimsImpacted: 50 }),
    ]);
    component.setSort('claimsImpacted');
    expect(component.filteredRules[0].claimsImpacted).toBe(5);
    expect(component.filteredRules[2].claimsImpacted).toBe(100);
  });

  it('should sort by claimsImpacted descending', () => {
    triggerRulesChange(component, [
      makeRule({ claimsImpacted: 5 }),
      makeRule({ claimsImpacted: 100 }),
      makeRule({ claimsImpacted: 50 }),
    ]);
    component.setSort('claimsImpacted');
    component.setSort('claimsImpacted');
    expect(component.filteredRules[0].claimsImpacted).toBe(100);
  });

  it('should sort by description', () => {
    triggerRulesChange(component, [
      makeRule({ description: 'Zebra' }),
      makeRule({ description: 'Apple' }),
    ]);
    component.setSort('description');
    expect(component.filteredRules[0].description).toBe('Apple');
  });

  it('should sort by expiresOn with null values sorting as empty string', () => {
    triggerRulesChange(component, [
      makeRule({ expiresOn: null }),
      makeRule({ expiresOn: 'Apr 1, 2025' }),
      makeRule({ expiresOn: 'Jan 1, 2025' }),
    ]);
    component.setSort('expiresOn');
    // null -> '' which sorts before text strings
    expect(component.filteredRules[0].expiresOn).toBeNull();
  });

  it('should sort by status', () => {
    triggerRulesChange(component, [
      makeRule({ status: 'Inactive' }),
      makeRule({ status: 'Active' }),
    ]);
    component.setSort('status');
    expect(component.filteredRules[0].status).toBe('Active');
    expect(component.filteredRules[1].status).toBe('Inactive');
  });

  it('should sort by createdLabel', () => {
    triggerRulesChange(component, [
      makeRule({ createdLabel: 'Z label' }),
      makeRule({ createdLabel: 'A label' }),
    ]);
    component.setSort('createdLabel');
    expect(component.filteredRules[0].createdLabel).toBe('A label');
  });

  it('should sort by modifiedLabel', () => {
    triggerRulesChange(component, [
      makeRule({ modifiedLabel: 'Z label' }),
      makeRule({ modifiedLabel: 'A label' }),
    ]);
    component.setSort('modifiedLabel');
    expect(component.filteredRules[0].modifiedLabel).toBe('A label');
  });

  it('should sort by category', () => {
    triggerRulesChange(component, [
      makeRule({ category: 'Zebra' }),
      makeRule({ category: 'Alpha' }),
    ]);
    component.setSort('category');
    expect(component.filteredRules[0].category).toBe('Alpha');
  });

  it('should reset pageIndex to 0 on sort', () => {
    triggerRulesChange(component, makeRules(25));
    component.nextPage();
    expect(component.pageIndex).toBe(1);
    component.setSort('name');
    expect(component.pageIndex).toBe(0);
  });

  // --- getSortValue edge: no sortColumn ---

  it('should preserve original order when sortColumn is null', () => {
    const rules = [makeRule({ name: 'B' }), makeRule({ name: 'A' })];
    triggerRulesChange(component, rules);
    expect(component.sortColumn).toBeNull();
    expect(component.filteredRules[0].name).toBe('B');
    expect(component.filteredRules[1].name).toBe('A');
  });

  // --- Pagination ---

  it('should paginate with default pageSize of 10', () => {
    triggerRulesChange(component, makeRules(25));
    expect(component.pagedRules.length).toBe(10);
    expect(component.totalCount).toBe(25);
  });

  it('should go to next page', () => {
    triggerRulesChange(component, makeRules(25));
    component.nextPage();
    expect(component.pageIndex).toBe(1);
    expect(component.pagedRules.length).toBe(10);
  });

  it('should not go past last page', () => {
    triggerRulesChange(component, makeRules(25));
    component.nextPage(); // 1
    component.nextPage(); // 2 (last)
    component.nextPage(); // stays at 2
    expect(component.pageIndex).toBe(2);
    expect(component.pagedRules.length).toBe(5);
  });

  it('should go to previous page', () => {
    triggerRulesChange(component, makeRules(25));
    component.nextPage();
    component.prevPage();
    expect(component.pageIndex).toBe(0);
  });

  it('should not go below page 0', () => {
    triggerRulesChange(component, makeRules(5));
    component.prevPage();
    expect(component.pageIndex).toBe(0);
  });

  it('should change page size', () => {
    triggerRulesChange(component, makeRules(30));
    component.changePageSize(25);
    expect(component.pageSize).toBe(25);
    expect(component.pagedRules.length).toBe(25);
    expect(component.pageIndex).toBe(0);
  });

  it('should default to 10 for invalid page size', () => {
    triggerRulesChange(component, makeRules(15));
    component.changePageSize(NaN);
    expect(component.pageSize).toBe(10);
  });

  it('should adjust pageIndex if beyond max after filtering', () => {
    triggerRulesChange(component, makeRules(25));
    component.nextPage();
    component.nextPage();
    component.onSearch('Rule 1');
    expect(component.pageIndex).toBe(0);
  });

  it('should handle empty filtered results', () => {
    triggerRulesChange(component, makeRules(5));
    component.onSearch('NONEXISTENT_XYZ');
    expect(component.filteredRules.length).toBe(0);
    expect(component.pagedRules.length).toBe(0);
    expect(component.pageIndex).toBe(0);
    expect(component.totalCount).toBe(0);
  });

  // --- onViewDetails ---

  it('should emit viewDetails event', () => {
    const rule = makeRule();
    spyOn(component.viewDetails, 'emit');
    component.onViewDetails(rule);
    expect(component.viewDetails.emit).toHaveBeenCalledWith(rule);
  });

  // --- edge cases ---

  it('should handle rules being null gracefully', () => {
    component.rules = null as any;
    component.ngOnChanges({ rules: new SimpleChange(null, null, true) });
    expect(component.filteredRules.length).toBe(0);
    expect(component.pagedRules.length).toBe(0);
  });

  it('should handle search on fields with null/undefined values', () => {
    triggerRulesChange(component, [
      makeRule({ name: 'Test', expiresOn: null, description: '' }),
    ]);
    component.onSearch('xyz');
    expect(component.filteredRules.length).toBe(0);
  });

  it('should combine search and sort', () => {
    triggerRulesChange(component, [
      makeRule({ name: 'Beta Match', description: 'desc b' }),
      makeRule({ name: 'Alpha Match', description: 'desc a' }),
      makeRule({ name: 'Gamma Other', description: 'desc c' }),
    ]);
    component.onSearch('Match');
    component.setSort('name');
    expect(component.filteredRules.length).toBe(2);
    expect(component.filteredRules[0].name).toBe('Alpha Match');
    expect(component.filteredRules[1].name).toBe('Beta Match');
  });

  it('should combine search, filter dialog, and sort', fakeAsync(() => {
    triggerRulesChange(component, [
      makeRule({ id: 'R-1', name: 'Alpha', category: 'Billing', claimsImpacted: 50 }),
      makeRule({ id: 'R-2', name: 'Beta', category: 'Billing', claimsImpacted: 10 }),
      makeRule({ id: 'R-3', name: 'Gamma', category: 'Coding', claimsImpacted: 30 }),
    ]);

    filterDialogSpy.open.and.returnValue(of({ values: { category: ['Billing'] } }));
    component.openFilter();
    tick();

    component.setSort('claimsImpacted');
    expect(component.filteredRules.length).toBe(2);
    expect(component.filteredRules[0].claimsImpacted).toBe(10);
    expect(component.filteredRules[1].claimsImpacted).toBe(50);
  }));

  it('should build filter fields with distinct sorted categories and statuses', fakeAsync(() => {
    filterDialogSpy.open.and.returnValue(of(undefined));
    triggerRulesChange(component, [
      makeRule({ category: 'Billing', status: 'Active' }),
      makeRule({ category: 'Coding', status: 'Inactive' }),
      makeRule({ category: 'Billing', status: 'Active' }),
    ]);
    component.openFilter();
    tick();

    const config = filterDialogSpy.open.calls.mostRecent().args[0];
    const categoryField = config.fields.find(f => f.key === 'category') as any;
    const statusField = config.fields.find(f => f.key === 'status') as any;

    expect(categoryField.options.length).toBe(2);
    expect(statusField.options.length).toBe(2);
    expect(categoryField.options[0].value).toBe('Billing');
    expect(categoryField.options[1].value).toBe('Coding');
  }));

  it('should pass initial filters to dialog on subsequent opens', fakeAsync(() => {
    filterDialogSpy.open.and.returnValue(of({ values: { name: 'test' } }));
    triggerRulesChange(component, makeRules(3));
    component.openFilter();
    tick();

    filterDialogSpy.open.and.returnValue(of(undefined));
    component.openFilter();
    tick();

    const config = filterDialogSpy.open.calls.mostRecent().args[0];
    expect(config.initial).toEqual({ name: 'test' });
  }));

  it('should map Inactive status to "Disabled" label in filter options', fakeAsync(() => {
    filterDialogSpy.open.and.returnValue(of(undefined));
    triggerRulesChange(component, [makeRule({ status: 'Inactive' })]);
    component.openFilter();
    tick();

    const config = filterDialogSpy.open.calls.mostRecent().args[0];
    const statusField = config.fields.find(f => f.key === 'status') as any;
    const opt = statusField.options.find((o: any) => o.value === 'Inactive');
    expect(opt.label).toBe('Disabled');
  }));

  it('should keep Active status label as-is in filter options', fakeAsync(() => {
    filterDialogSpy.open.and.returnValue(of(undefined));
    triggerRulesChange(component, [makeRule({ status: 'Active' })]);
    component.openFilter();
    tick();

    const config = filterDialogSpy.open.calls.mostRecent().args[0];
    const statusField = config.fields.find(f => f.key === 'status') as any;
    const opt = statusField.options.find((o: any) => o.value === 'Active');
    expect(opt.label).toBe('Active');
  }));

  it('should skip empty/null categories and statuses in distinct lists', fakeAsync(() => {
    filterDialogSpy.open.and.returnValue(of(undefined));
    triggerRulesChange(component, [
      makeRule({ category: '', status: 'Active' }),
      makeRule({ category: 'Billing', status: '' as any }),
    ]);
    component.openFilter();
    tick();

    const config = filterDialogSpy.open.calls.mostRecent().args[0];
    const categoryField = config.fields.find(f => f.key === 'category') as any;
    const statusField = config.fields.find(f => f.key === 'status') as any;
    expect(categoryField.options.length).toBe(1);
    expect(statusField.options.length).toBe(1);
  }));

  it('should handle filter result with missing values property', fakeAsync(() => {
    filterDialogSpy.open.and.returnValue(of({ values: undefined } as any));
    triggerRulesChange(component, makeRules(3));
    component.openFilter();
    tick();
    // Should not crash; activeFilters becomes {}
    expect(component.filteredRules.length).toBe(3);
  }));
});
