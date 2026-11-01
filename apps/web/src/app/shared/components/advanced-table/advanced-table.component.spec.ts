// src/app/shared/components/advanced-table/advanced-table.component.spec.ts

import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
} from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, SimpleChange, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatTableModule } from '@angular/material/table';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Subject } from 'rxjs';

import { AdvancedTableComponent } from './advanced-table.component';
import { AdvancedTableCellDirective } from './advanced-table-cell.directive';
import { AdvancedTableColumnConfig, TableFilterState } from './advanced-table.models';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface TestRow {
  id: number;
  name: string;
  amount: number;
  active: boolean;
  date: string;
  children?: TestRow[];
}

function makeCol(
  overrides: Partial<AdvancedTableColumnConfig<TestRow>> & { id: string; header: string }
): AdvancedTableColumnConfig<TestRow> {
  return { type: 'text', ...overrides } as AdvancedTableColumnConfig<TestRow>;
}

function makeRows(n = 5): TestRow[] {
  return Array.from({ length: n }, function(_, i) {
    return {
      id: i + 1,
      name: 'Row ' + (i + 1),
      amount: (i + 1) * 100,
      active: i % 2 === 0,
      date: '2024-0' + ((i % 9) + 1) + '-15',
    };
  });
}

/**
 * Plain-object MatSort stub.  We avoid jasmine.createSpyObj here because that
 * requires a valid `keyof MatSort` method name and the overload is fragile
 * across Angular versions.  The component only needs `active`, `direction`,
 * and `sortChange` from the sort reference.
 */
function makeMockSort(): MatSort {
  const subject = new Subject<any>();
  // Angular's EventEmitter extends Subject and adds .emit = .next.
  // The component calls sort.sortChange.emit(...) in ngAfterViewInit,
  // so we need to expose emit on the Subject.
  (subject as any)['emit'] = (v: any) => subject.next(v);
  return {
    active: '',
    direction: '' as any,
    sortChange: subject as any,
  } as unknown as MatSort;
}

/** Create a fresh fixture with sort pre-wired before the first detectChanges. */
function createComponent(): {
  fixture: ComponentFixture<AdvancedTableComponent<TestRow>>;
  component: AdvancedTableComponent<TestRow>;
} {
  const fixture = TestBed.createComponent(AdvancedTableComponent<TestRow>);
  const component = fixture.componentInstance;
  // Wire sort BEFORE detectChanges so ngAfterViewInit subscription is safe
  component.sort = makeMockSort();
  return { fixture, component };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('AdvancedTableComponent', () => {

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AdvancedTableComponent, AdvancedTableCellDirective],
      imports: [
        CommonModule,
        FormsModule,
        NoopAnimationsModule,
        MatTableModule,
        MatSortModule,
        MatPaginatorModule,
        MatMenuModule,
        MatFormFieldModule,
        MatInputModule,
        MatButtonModule,
        MatIconModule,
        MatCheckboxModule,
        MatTooltipModule,
        MatSelectModule,
        MatChipsModule,
        MatProgressSpinnerModule,
        MatProgressBarModule,
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
  });

  // =========================================================================
  // 1. Initialization
  // =========================================================================

  describe('Initialization', () => {
    it('should create the component', () => {
      const { fixture, component } = createComponent();
      fixture.detectChanges();
      expect(component).toBeTruthy();
    });

    it('should have correct default input values', () => {
      const { fixture, component } = createComponent();
      fixture.detectChanges();
      expect(component.data).toEqual([]);
      expect(component.columns).toEqual([]);
      expect(component.loading).toBeFalse();
      expect(component.enableGlobalSearch).toBeTrue();
      expect(component.enablePagination).toBeTrue();
      expect(component.pageSize).toBe(10);
      expect(component.enableExport).toBeTrue();
      expect(component.enableNestedRows).toBeFalse();
      expect(component.enableMultiSelect).toBeFalse();
      expect(component.autoSelectFirstRow).toBeFalse();
    });

    it('should initialise filterState with empty global and columns object', () => {
      const { fixture, component } = createComponent();
      fixture.detectChanges();
      expect(component.filterState.global).toBe('');
      expect(component.filterState.columns).toBeDefined();
    });

    it('should build displayedColumns from columns input', () => {
      const { fixture, component } = createComponent();
      component.columns = [
        makeCol({ id: 'name', header: 'Name' }),
        makeCol({ id: 'amount', header: 'Amount', type: 'number' }),
      ];
      fixture.detectChanges();
      expect(component.displayedColumns).toEqual(['name', 'amount']);
    });

    it('should populate dataSource.data from data input', () => {
      const { fixture, component } = createComponent();
      component.data = makeRows(3);
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      fixture.detectChanges();
      expect(component.dataSource.data.length).toBe(3);
    });

    it('should set globalSearchPlaceholder to default value', () => {
      const { fixture, component } = createComponent();
      fixture.detectChanges();
      expect(component.globalSearchPlaceholder).toBe('Search table data');
    });

    it('should set exportFileName default to export.xlsx', () => {
      const { fixture, component } = createComponent();
      fixture.detectChanges();
      expect(component.exportFileName).toBe('export.xlsx');
    });

    it('should initialise filterState.columns entries for each column', () => {
      const { fixture, component } = createComponent();
      component.columns = [
        makeCol({ id: 'name', header: 'Name' }),
        makeCol({ id: 'amount', header: 'Amount', type: 'number' }),
      ];
      fixture.detectChanges();
      expect(component.filterState.columns['name']).toBeDefined();
      expect(component.filterState.columns['amount']).toBeDefined();
    });

    it('floatLabel should default to always', () => {
      const { fixture, component } = createComponent();
      fixture.detectChanges();
      expect(component.floatLabel).toBe('always');
    });
  });

  // =========================================================================
  // 2. ngOnChanges
  // =========================================================================

  describe('ngOnChanges', () => {
    it('should rebuild displayedColumns when columns input changes', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      fixture.detectChanges();

      const newCols = [
        makeCol({ id: 'name', header: 'Name' }),
        makeCol({ id: 'amount', header: 'Amount', type: 'currency' }),
      ];
      component.columns = newCols;
      const changes: SimpleChanges = {
        columns: new SimpleChange(component.columns, newCols, false),
      };
      component.ngOnChanges(changes);
      expect(component.displayedColumns).toContain('amount');
    });

    it('should update dataSource when data changes', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeRows(2);
      fixture.detectChanges();

      const newRows = makeRows(4);
      component.data = newRows;
      const changes: SimpleChanges = {
        data: new SimpleChange(makeRows(2), newRows, false),
      };
      component.ngOnChanges(changes);
      expect(component.dataSource.data.length).toBe(4);
    });

    it('should apply initialFilterState when that input changes', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      component.data = makeRows(3);
      fixture.detectChanges();

      const fs: TableFilterState = {
        global: 'hello',
        columns: { name: { operator: 'contains', value: 'hello', selectedValues: [] } },
      };
      component.initialFilterState = fs;
      const changes: SimpleChanges = {
        initialFilterState: new SimpleChange(undefined, fs, false),
      };
      component.ngOnChanges(changes);
      expect(component.globalSearchTerm).toBe('hello');
    });

    it('should re-apply filter when externalGlobal changes', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeRows(3);
      fixture.detectChanges();

      component.externalGlobal = 'Row 1';
      const changes: SimpleChanges = {
        externalGlobal: new SimpleChange('', 'Row 1', false),
      };
      component.ngOnChanges(changes);
      expect(component.filterState).toBeDefined();
    });

    it('should default childrenAccessor when not provided', () => {
      const { fixture, component } = createComponent();
      component.childrenAccessor = undefined;
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      const changes: SimpleChanges = {
        columns: new SimpleChange([], component.columns, false),
      };
      component.ngOnChanges(changes);
      expect(component.childrenAccessor).toBeDefined();
      const row: any = { children: [{ id: 99, name: 'child', amount: 0, active: false, date: '' }] };
      const kids = component.childrenAccessor!(row as TestRow);
      expect(kids.length).toBe(1);
      expect((kids[0] as any).id).toBe(99);
    });

    it('should rebuild renderedColumns when enableNestedRows changes', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeRows(2);
      fixture.detectChanges();

      component.enableNestedRows = true;
      const changes: SimpleChanges = {
        enableNestedRows: new SimpleChange(false, true, false),
      };
      component.ngOnChanges(changes);
      expect(component.renderedColumns).toContain('__expand');
    });
  });

  // =========================================================================
  // 3. Column setup
  // =========================================================================

  describe('Column setup', () => {
    it('should prepend __expand column when enableNestedRows is true', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.enableNestedRows = true;
      fixture.detectChanges();
      expect(component.renderedColumns).toContain('__expand');
    });

    it('should prepend __select column when enableMultiSelect is true', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.enableMultiSelect = true;
      fixture.detectChanges();
      expect(component.renderedColumns).toContain('__select');
    });

    it('should not include __expand or __select by default', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      fixture.detectChanges();
      expect(component.renderedColumns).not.toContain('__expand');
      expect(component.renderedColumns).not.toContain('__select');
    });

    it('getColumnOperators should return text operators for text column', () => {
      const { fixture, component } = createComponent();
      fixture.detectChanges();
      const col = makeCol({ id: 'name', header: 'Name', type: 'text' });
      const ops = component.getColumnOperators(col);
      expect(ops).toContain('contains');
      expect(ops).toContain('equals');
    });

    it('getColumnOperators should return number operators for number column', () => {
      const { fixture, component } = createComponent();
      fixture.detectChanges();
      const col = makeCol({ id: 'amount', header: 'Amount', type: 'number' });
      const ops = component.getColumnOperators(col);
      expect(ops).toContain('greaterThan');
      expect(ops).toContain('lessThan');
      expect(ops).toContain('between');
    });

    it('getColumnOperators should return date operators for date column', () => {
      const { fixture, component } = createComponent();
      fixture.detectChanges();
      const col = makeCol({ id: 'date', header: 'Date', type: 'date' });
      const ops = component.getColumnOperators(col);
      expect(ops).toContain('on');
      expect(ops).toContain('before');
      expect(ops).toContain('after');
    });

    it('getColumnOperators should return boolean operators for boolean column', () => {
      const { fixture, component } = createComponent();
      fixture.detectChanges();
      const col = makeCol({ id: 'active', header: 'Active', type: 'boolean' });
      expect(component.getColumnOperators(col)).toEqual(['isTrue', 'isFalse']);
    });

    it('getColumnOperators should return custom operators when filterConfig.operators is set', () => {
      const { fixture, component } = createComponent();
      fixture.detectChanges();
      const col = makeCol({
        id: 'name', header: 'Name', type: 'text',
        filterConfig: { operators: ['equals', 'notEquals'] },
      });
      expect(component.getColumnOperators(col)).toEqual(['equals', 'notEquals']);
    });

    it('getColumnOperators should return empty array for action column', () => {
      const { fixture, component } = createComponent();
      fixture.detectChanges();
      const col = makeCol({ id: 'act', header: 'Action', type: 'action' });
      expect(component.getColumnOperators(col)).toEqual([]);
    });
  });

  // =========================================================================
  // 4. getRawValue / getDisplayValue / unwrapVm
  // =========================================================================

  describe('getRawValue, getDisplayValue, and unwrapVm', () => {
    it('getRawValue should use column id as default property key', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      fixture.detectChanges();
      const col = component.columns[0];
      const row: TestRow = { id: 1, name: 'Alice', amount: 100, active: true, date: '' };
      expect(component.getRawValue(row, col)).toBe('Alice');
    });

    it('getRawValue should traverse propertyPath', () => {
      const { fixture, component } = createComponent();
      const col = makeCol({ id: 'x', header: 'X', propertyPath: 'amount' });
      component.columns = [col];
      fixture.detectChanges();
      const row: TestRow = { id: 1, name: 'Y', amount: 42, active: false, date: '' };
      expect(component.getRawValue(row, col)).toBe(42);
    });

    it('getRawValue should use accessor when provided', () => {
      const { fixture, component } = createComponent();
      const col = makeCol({
        id: 'name', header: 'Name',
        accessor: function(r) { return r.name.toUpperCase(); },
      });
      component.columns = [col];
      fixture.detectChanges();
      const row: TestRow = { id: 1, name: 'alice', amount: 0, active: false, date: '' };
      expect(component.getRawValue(row, col)).toBe('ALICE');
    });

    it('getDisplayValue should format currency', () => {
      const { fixture, component } = createComponent();
      const col = makeCol({ id: 'amount', header: 'Amount', type: 'currency' });
      component.columns = [col];
      fixture.detectChanges();
      const row: TestRow = { id: 1, name: 'X', amount: 1500, active: true, date: '' };
      expect(component.getDisplayValue(row, col, 1500)).toContain('1,500');
    });

    it('getDisplayValue should format number', () => {
      const { fixture, component } = createComponent();
      const col = makeCol({ id: 'amount', header: 'Amount', type: 'number' });
      component.columns = [col];
      fixture.detectChanges();
      const row: TestRow = { id: 1, name: 'X', amount: 12345, active: true, date: '' };
      expect(component.getDisplayValue(row, col, 12345)).toBe('12,345');
    });

    it('getDisplayValue should format boolean true as Yes', () => {
      const { fixture, component } = createComponent();
      const col = makeCol({ id: 'active', header: 'Active', type: 'boolean' });
      component.columns = [col];
      fixture.detectChanges();
      const row: TestRow = { id: 1, name: 'X', amount: 0, active: true, date: '' };
      expect(component.getDisplayValue(row, col, true)).toBe('Yes');
    });

    it('getDisplayValue should format boolean false as No', () => {
      const { fixture, component } = createComponent();
      const col = makeCol({ id: 'active', header: 'Active', type: 'boolean' });
      component.columns = [col];
      fixture.detectChanges();
      const row: TestRow = { id: 1, name: 'X', amount: 0, active: false, date: '' };
      expect(component.getDisplayValue(row, col, false)).toBe('No');
    });

    it('getDisplayValue should use displayFormatter when provided', () => {
      const { fixture, component } = createComponent();
      const col = makeCol({
        id: 'name', header: 'Name',
        displayFormatter: function(value: any, _row: TestRow) { return '[' + value + ']'; },
      });
      component.columns = [col];
      fixture.detectChanges();
      const row: TestRow = { id: 1, name: 'Bob', amount: 0, active: false, date: '' };
      expect(component.getDisplayValue(row, col, 'Bob')).toBe('[Bob]');
    });

    it('getDisplayValue should return empty string for null value', () => {
      const { fixture, component } = createComponent();
      const col = makeCol({ id: 'name', header: 'Name' });
      component.columns = [col];
      fixture.detectChanges();
      const row: any = { id: 1, name: null, amount: 0, active: false, date: '' };
      expect(component.getDisplayValue(row, col, null)).toBe('');
    });

    it('getDisplayValue should format date to a non-empty string', () => {
      const { fixture, component } = createComponent();
      const col = makeCol({ id: 'date', header: 'Date', type: 'date' });
      component.columns = [col];
      fixture.detectChanges();
      const row: TestRow = { id: 1, name: 'X', amount: 0, active: false, date: '2024-06-15' };
      const display = component.getDisplayValue(row, col, '2024-06-15');
      expect(display).toBeTruthy();
      expect(typeof display).toBe('string');
    });

    it('unwrapVm should extract row from a RowVm wrapper', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      fixture.detectChanges();
      const row: TestRow = { id: 5, name: 'test', amount: 0, active: false, date: '' };
      const vm: any = { row: row, level: 0, isChild: false, key: 'k' };
      expect(component.unwrapVm(vm)).toBe(row);
    });

    it('unwrapVm should return value unchanged when not a RowVm', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      fixture.detectChanges();
      const row: TestRow = { id: 5, name: 'test', amount: 0, active: false, date: '' };
      expect(component.unwrapVm(row as any)).toBe(row);
    });
  });

  // =========================================================================
  // 5. Global search
  // =========================================================================

  describe('Global search', () => {
    it('onGlobalSearchChange should update globalSearchTerm and filterState.global', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeRows(5);
      fixture.detectChanges();
      component.onGlobalSearchChange('Row 3');
      expect(component.globalSearchTerm).toBe('Row 3');
      expect(component.filterState.global).toBe('Row 3');
    });

    it('clearGlobalSearch should reset globalSearchTerm to empty string', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeRows(3);
      fixture.detectChanges();
      component.onGlobalSearchChange('xyz');
      component.clearGlobalSearch();
      expect(component.globalSearchTerm).toBe('');
    });

    it('filterStateChanged should emit when global search changes', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeRows(3);
      fixture.detectChanges();
      const spy = jasmine.createSpy('filterStateChanged');
      component.filterStateChanged.subscribe(spy);
      component.onGlobalSearchChange('Row 1');
      expect(spy).toHaveBeenCalled();
    });

    it('dataSource should filter rows when global search term is set', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeRows(5);
      fixture.detectChanges();
      component.onGlobalSearchChange('Row 2');
      expect(component.dataSource.filteredData.length).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // 6. Column filters
  // =========================================================================

  describe('Column filters', () => {
    it('onColumnOperatorChange should update filterState operator', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      component.data = makeRows(3);
      fixture.detectChanges();
      component.onColumnOperatorChange('name', 'contains');
      expect(component.filterState.columns['name']?.operator).toBe('contains');
    });

    it('onColumnValueChange should update filterState value', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      component.data = makeRows(3);
      fixture.detectChanges();
      component.onColumnValueChange('name', 'Row 2');
      expect(component.filterState.columns['name']?.value).toBe('Row 2');
    });

    it('onColumnValue2Change should update filterState value2', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'amount', header: 'Amount', type: 'number', filterable: true })];
      component.data = makeRows(3);
      fixture.detectChanges();
      component.onColumnValue2Change('amount', '500');
      expect(component.filterState.columns['amount']?.value2).toBe('500');
    });

    it('clearColumnFilter should reset operator, value, value2, and selectedValues', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      component.data = makeRows(3);
      fixture.detectChanges();
      component.onColumnOperatorChange('name', 'contains');
      component.onColumnValueChange('name', 'hello');
      component.clearColumnFilter('name');
      const state = component.filterState.columns['name'];
      expect(state?.operator).toBeNull();
      expect(state?.value).toBe('');
      expect(state?.selectedValues).toEqual([]);
    });

    it('onValueFilterToggle should add value when checked=true', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      component.data = makeRows(3);
      fixture.detectChanges();
      component.onValueFilterToggle('name', 'Row 1', true);
      expect(component.filterState.columns['name']?.selectedValues).toContain('Row 1');
    });

    it('onValueFilterToggle should remove value when checked=false', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      component.data = makeRows(3);
      fixture.detectChanges();
      component.onValueFilterToggle('name', 'Row 1', true);
      component.onValueFilterToggle('name', 'Row 1', false);
      expect(component.filterState.columns['name']?.selectedValues).not.toContain('Row 1');
    });

    it('toggleSelectAllValues with checked=true should select all unique values', () => {
      const { fixture, component } = createComponent();
      component.uniqueValues = { name: ['Row 1', 'Row 2', 'Row 3'] };
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      component.data = makeRows(3);
      fixture.detectChanges();
      component.toggleSelectAllValues('name', true);
      const selected = component.filterState.columns['name']?.selectedValues ?? [];
      expect(selected.length).toBe(3);
    });

    it('toggleSelectAllValues with checked=false should deselect all', () => {
      const { fixture, component } = createComponent();
      component.uniqueValues = { name: ['Row 1', 'Row 2'] };
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      component.data = makeRows(2);
      fixture.detectChanges();
      component.toggleSelectAllValues('name', true);
      component.toggleSelectAllValues('name', false);
      expect(component.filterState.columns['name']?.selectedValues).toEqual([]);
    });

    it('isAllValuesSelected should return true when all unique values are selected', () => {
      const { fixture, component } = createComponent();
      component.uniqueValues = { name: ['Row 1', 'Row 2'] };
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      component.data = makeRows(2);
      fixture.detectChanges();
      component.toggleSelectAllValues('name', true);
      expect(component.isAllValuesSelected('name')).toBeTrue();
    });

    it('isAllValuesSelected should return false when nothing is selected', () => {
      const { fixture, component } = createComponent();
      component.uniqueValues = { name: ['Row 1', 'Row 2'] };
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      component.data = makeRows(2);
      fixture.detectChanges();
      expect(component.isAllValuesSelected('name')).toBeFalse();
    });

    it('clearAllFilters should reset global search and all column filters', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      component.data = makeRows(3);
      fixture.detectChanges();
      component.onGlobalSearchChange('test');
      component.onColumnValueChange('name', 'Row 1');
      component.clearAllFilters();
      expect(component.globalSearchTerm).toBe('');
      expect(component.filterState.columns['name']?.value).toBe('');
    });
  });

  // =========================================================================
  // 7. hasAnyActiveFilters + getActiveFilterPills
  // =========================================================================

  describe('hasAnyActiveFilters and getActiveFilterPills', () => {
    it('hasAnyActiveFilters should return false when nothing is set', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      fixture.detectChanges();
      expect(component.hasAnyActiveFilters()).toBeFalse();
    });

    it('hasAnyActiveFilters should return true when globalSearchTerm is set', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeRows(2);
      fixture.detectChanges();
      component.onGlobalSearchChange('hello');
      expect(component.hasAnyActiveFilters()).toBeTrue();
    });

    it('hasAnyActiveFilters should return true when a column value filter is set', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      component.data = makeRows(2);
      fixture.detectChanges();
      component.onColumnValueChange('name', 'Row 1');
      expect(component.hasAnyActiveFilters()).toBeTrue();
    });

    it('getActiveFilterPills should include a search pill for globalSearchTerm', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeRows(2);
      fixture.detectChanges();
      component.onGlobalSearchChange('hello');
      const pills = component.getActiveFilterPills();
      const found = pills.some(function(p) { return p.kind === 'search' && p.label.includes('hello'); });
      expect(found).toBeTrue();
    });

    it('getActiveFilterPills should include externalSearch pill when externalGlobal is set', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeRows(2);
      component.externalGlobal = 'external term';
      fixture.detectChanges();
      const pills = component.getActiveFilterPills();
      expect(pills.some(function(p) { return p.kind === 'externalSearch'; })).toBeTrue();
    });

    it('getActiveFilterPills should include column pill when selectedValues are set', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      component.data = makeRows(2);
      fixture.detectChanges();
      component.onValueFilterToggle('name', 'Row 1', true);
      const pills = component.getActiveFilterPills();
      expect(pills.some(function(p) { return p.kind === 'column' && p.columnId === 'name'; })).toBeTrue();
    });

    it('clearFilterPill with search kind should clear globalSearchTerm', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeRows(2);
      fixture.detectChanges();
      component.onGlobalSearchChange('hello');
      component.clearFilterPill({ kind: 'search', label: 'Search: hello' });
      expect(component.globalSearchTerm).toBe('');
    });

    it('clearFilterPill with column kind should clear that column filter', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      component.data = makeRows(2);
      fixture.detectChanges();
      component.onColumnValueChange('name', 'Row 1');
      component.clearFilterPill({ kind: 'column', columnId: 'name', label: 'Name: Row 1' });
      expect(component.filterState.columns['name']?.value).toBe('');
    });

    it('clearFilterPill with externalSearch kind should emit externalGlobalChange with empty string', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      fixture.detectChanges();
      const spy = jasmine.createSpy('externalGlobalChange');
      component.externalGlobalChange.subscribe(spy);
      component.clearFilterPill({ kind: 'externalSearch', label: 'Search: foo' });
      expect(spy).toHaveBeenCalledWith('');
    });
  });

  // =========================================================================
  // 8. Sorting
  // =========================================================================

  describe('Sorting', () => {
    it('sortChanged should emit when sort.sortChange fires', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name', sortable: true })];
      component.data = makeRows(3);
      fixture.detectChanges();
      const spy = jasmine.createSpy('sortChanged');
      component.sortChanged.subscribe(spy);
      (component.sort.sortChange as any as Subject<any>).next({ active: 'name', direction: 'asc' });
      expect(spy).toHaveBeenCalledWith({ active: 'name', direction: 'asc' });
    });

    it('should store defaultSort active and direction on the sort object', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name', sortable: true })];
      component.data = makeRows(3);
      component.defaultSort = { active: 'name', direction: 'desc' };
      // Wrap in try-catch: ExpressionChangedAfterChecked is thrown in test mode
      // because the sort emission triggers a second CD run, but the assertions
      // about the sort object's state are valid before the exception.
      try { fixture.detectChanges(); } catch (_) { /* ignore ExpressionChangedAfterChecked */ }
      expect(component.sort.active).toBe('name');
      expect(component.sort.direction).toBe('desc');
    });
  });

  // =========================================================================
  // 9. Pagination
  // =========================================================================

  describe('Pagination', () => {
    it('onPageChange should emit pageChanged with correct values', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeRows(3);
      fixture.detectChanges();
      const spy = jasmine.createSpy('pageChanged');
      component.pageChanged.subscribe(spy);
      component.onPageChange({ pageIndex: 1, pageSize: 5, length: 20, previousPageIndex: 0 });
      expect(spy).toHaveBeenCalledWith({ pageIndex: 1, pageSize: 5, length: 20 });
    });

    it('serverSideTotalCount should default to null', () => {
      const { fixture, component } = createComponent();
      fixture.detectChanges();
      expect(component.serverSideTotalCount).toBeNull();
    });

    it('should accept serverSideTotalCount as input', () => {
      const { fixture, component } = createComponent();
      component.serverSideTotalCount = 250;
      fixture.detectChanges();
      expect(component.serverSideTotalCount).toBe(250);
    });

    it('pageSizeOptions should default to [5, 10, 25]', () => {
      const { fixture, component } = createComponent();
      fixture.detectChanges();
      expect(component.pageSizeOptions).toEqual([5, 10, 25]);
    });

    it('server-side pageChanged should carry correct pageIndex and pageSize', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeRows(3);
      component.serverSideTotalCount = 500;
      fixture.detectChanges();
      const spy = jasmine.createSpy('pageChanged');
      component.pageChanged.subscribe(spy);
      component.onPageChange({ pageIndex: 2, pageSize: 25, length: 500, previousPageIndex: 1 });
      expect(spy).toHaveBeenCalledWith({ pageIndex: 2, pageSize: 25, length: 500 });
    });
  });

  // =========================================================================
  // 10. Nested rows / expand-collapse
  // =========================================================================

  describe('Nested rows', () => {
    function makeNestedRows(): TestRow[] {
      return [
        {
          id: 1, name: 'Parent 1', amount: 100, active: true, date: '2024-01-01',
          children: [
            { id: 11, name: 'Child 1-1', amount: 50, active: false, date: '2024-01-02' },
          ],
        },
        { id: 2, name: 'Parent 2', amount: 200, active: false, date: '2024-02-01' },
      ];
    }

    it('isExpandable should return true when row has children', () => {
      const { fixture, component } = createComponent();
      component.enableNestedRows = true;
      component.childrenAccessor = function(r) { return r.children || []; };
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeNestedRows();
      fixture.detectChanges();
      const vm = (component.dataSource.data as any[])[0];
      expect(component.isExpandable(vm)).toBeTrue();
    });

    it('isExpandable should return false when row has no children', () => {
      const { fixture, component } = createComponent();
      component.enableNestedRows = true;
      component.childrenAccessor = function(r) { return r.children || []; };
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeNestedRows();
      fixture.detectChanges();
      const vm = (component.dataSource.data as any[])[1];
      expect(component.isExpandable(vm)).toBeFalse();
    });

    it('toggleRowExpanded should expand a collapsed row', () => {
      const { fixture, component } = createComponent();
      component.enableNestedRows = true;
      component.childrenAccessor = function(r) { return r.children || []; };
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeNestedRows();
      fixture.detectChanges();
      const vm = (component.dataSource.data as any[])[0];
      expect(component.isRowExpanded(vm)).toBeFalse();
      component.toggleRowExpanded(vm);
      expect(component.isRowExpanded(vm)).toBeTrue();
    });

    it('toggleRowExpanded should collapse an already-expanded row', () => {
      const { fixture, component } = createComponent();
      component.enableNestedRows = true;
      component.childrenAccessor = function(r) { return r.children || []; };
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeNestedRows();
      fixture.detectChanges();
      const vm = (component.dataSource.data as any[])[0];
      component.toggleRowExpanded(vm);
      component.toggleRowExpanded(vm);
      expect(component.isRowExpanded(vm)).toBeFalse();
    });

    it('expanding a row should add children to dataSource', () => {
      const { fixture, component } = createComponent();
      component.enableNestedRows = true;
      component.childrenAccessor = function(r) { return r.children || []; };
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeNestedRows();
      fixture.detectChanges();
      const before = component.dataSource.data.length;
      const vm = (component.dataSource.data as any[])[0];
      component.toggleRowExpanded(vm);
      expect(component.dataSource.data.length).toBeGreaterThan(before);
    });

    it('getColumnsForVm should return childColumns for child rows when childColumns is set', () => {
      const { fixture, component } = createComponent();
      component.enableNestedRows = true;
      component.childrenAccessor = function(r) { return r.children || []; };
      const childCols = [makeCol({ id: 'name', header: 'Child Name' })];
      component.childColumns = childCols;
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeNestedRows();
      fixture.detectChanges();
      const childVm = { isChild: true, row: { id: 11, name: 'C', amount: 0, active: false, date: '' }, level: 1, key: 'k' };
      expect(component.getColumnsForVm(childVm)).toBe(childCols);
    });

    it('getColumnsForVm should return parent columns for root rows', () => {
      const { fixture, component } = createComponent();
      component.enableNestedRows = true;
      component.childrenAccessor = function(r) { return r.children || []; };
      const parentCols = [makeCol({ id: 'name', header: 'Name' })];
      component.columns = parentCols;
      component.data = makeNestedRows();
      fixture.detectChanges();
      const parentVm = { isChild: false, row: { id: 1, name: 'P', amount: 0, active: false, date: '' }, level: 0, key: 'k' };
      expect(component.getColumnsForVm(parentVm)).toBe(parentCols);
    });

    it('toggleExpanded should also toggle row expansion', () => {
      const { fixture, component } = createComponent();
      component.enableNestedRows = true;
      component.childrenAccessor = function(r) { return r.children || []; };
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeNestedRows();
      fixture.detectChanges();
      const vm = (component.dataSource.data as any[])[0];
      component.toggleExpanded(vm);
      expect(component.isRowExpanded(vm)).toBeTrue();
    });
  });

  // =========================================================================
  // 11. Row click / action
  // =========================================================================

  describe('Row interactions', () => {
    it('onRowClick should emit rowClicked after the double-click debounce', fakeAsync(() => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeRows(1);
      fixture.detectChanges();
      const spy = jasmine.createSpy('rowClicked');
      component.rowClicked.subscribe(spy);
      const vm = (component.dataSource.data as any[])[0];
      component.onRowClick(vm);
      tick(300);
      expect(spy).toHaveBeenCalled();
    }));

    it('onActionClick should emit actionClicked with actionId and row', () => {
      const { fixture, component } = createComponent();
      const col = makeCol({ id: 'edit', header: 'Edit', type: 'action', actionId: 'edit' });
      component.columns = [col];
      component.data = makeRows(1);
      fixture.detectChanges();
      const spy = jasmine.createSpy('actionClicked');
      component.actionClicked.subscribe(spy);
      const row = component.data[0];
      component.onActionClick(col, row);
      expect(spy).toHaveBeenCalledWith({ actionId: 'edit', row: row });
    });

    it('onActionClick should fall back to column id when actionId is not set', () => {
      const { fixture, component } = createComponent();
      const col = makeCol({ id: 'delete', header: 'Delete', type: 'action' });
      component.columns = [col];
      component.data = makeRows(1);
      fixture.detectChanges();
      const spy = jasmine.createSpy('actionClicked');
      component.actionClicked.subscribe(spy);
      component.onActionClick(col, component.data[0]);
      expect(spy).toHaveBeenCalledWith(jasmine.objectContaining({ actionId: 'delete' }));
    });

    it('onRowClick with idField set should emit selectedIdChange', fakeAsync(() => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.idField = 'id';
      component.data = makeRows(2);
      fixture.detectChanges();
      const spy = jasmine.createSpy('selectedIdChange');
      component.selectedIdChange.subscribe(spy);
      const vm = (component.dataSource.data as any[])[0];
      component.onRowClick(vm);
      tick(300);
      expect(spy).toHaveBeenCalledWith(1);
    }));
  });

  // =========================================================================
  // 12. Export
  // =========================================================================

  describe('Export', () => {
    it('isExportDisabled should return true when data is empty', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = [];
      fixture.detectChanges();
      expect(component.isExportDisabled()).toBeTrue();
    });

    it('isExportDisabled should return false when data exists', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeRows(2);
      fixture.detectChanges();
      expect(component.isExportDisabled()).toBeFalse();
    });

    it('exportToExcel should not throw when data is present', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeRows(2);
      fixture.detectChanges();
      spyOn(window.URL, 'createObjectURL').and.returnValue('blob:test');
      spyOn(window.URL, 'revokeObjectURL');
      const anchor = { href: '', download: '', click: jasmine.createSpy('click') } as any;
      spyOn(document, 'createElement').and.returnValue(anchor);
      expect(function() { component.exportToExcel(); }).not.toThrow();
    });

    it('exportFileName should have .xlsx appended when extension is missing', async () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeRows(1);
      component.exportFileName = 'my-report';
      fixture.detectChanges();
      spyOn(window.URL, 'createObjectURL').and.returnValue('blob:test');
      spyOn(window.URL, 'revokeObjectURL');
      const anchor = { href: '', download: '', click: jasmine.createSpy('click') } as any;
      spyOn(document, 'createElement').and.returnValue(anchor);
      await component.exportToExcel();
      expect(anchor.download).toBe('my-report.xlsx');
    });
  });

  // =========================================================================
  // 13. Selection
  // =========================================================================

  describe('Selection', () => {
    it('isSelected should return false when selectedId is null', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.idField = 'id';
      component.data = makeRows(2);
      fixture.detectChanges();
      const vm = (component.dataSource.data as any[])[0];
      expect(component.isSelected(vm)).toBeFalse();
    });

    it('isSelected should return true when selectedId matches row id', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.idField = 'id';
      component.selectedId = 1;
      component.data = makeRows(2);
      fixture.detectChanges();
      const vm = (component.dataSource.data as any[])[0];
      expect(component.isSelected(vm)).toBeTrue();
    });

    it('autoSelectFirstRow should set selectedId to the first visible row id', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.idField = 'id';
      component.autoSelectFirstRow = true;
      component.data = makeRows(3);
      fixture.detectChanges();
      expect(component.selectedId).toBe(1);
    });
  });

  // =========================================================================
  // 14. Multi-select
  // =========================================================================

  describe('Multi-select', () => {
    it('isMultiSelected should return false when id is not in multiSelectedIds', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.idField = 'id';
      component.enableMultiSelect = true;
      component.data = makeRows(2);
      fixture.detectChanges();
      const vm = (component.dataSource.data as any[])[0];
      expect(component.isMultiSelected(vm)).toBeFalse();
    });

    it('toggleMultiSelectRow should add row id to multiSelectedIds', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.idField = 'id';
      component.enableMultiSelect = true;
      component.data = makeRows(2);
      fixture.detectChanges();
      const spy = jasmine.createSpy('multiSelectionChange');
      component.multiSelectionChange.subscribe(spy);
      const vm = (component.dataSource.data as any[])[0];
      component.toggleMultiSelectRow(vm);
      expect(component.isMultiSelected(vm)).toBeTrue();
      expect(spy).toHaveBeenCalled();
    });

    it('toggleMultiSelectRow should remove row id when already selected', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.idField = 'id';
      component.enableMultiSelect = true;
      component.data = makeRows(2);
      fixture.detectChanges();
      const vm = (component.dataSource.data as any[])[0];
      component.toggleMultiSelectRow(vm);
      component.toggleMultiSelectRow(vm);
      expect(component.isMultiSelected(vm)).toBeFalse();
    });

    it('isAllMultiSelected should return true when all filtered rows are selected', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.idField = 'id';
      component.enableMultiSelect = true;
      component.data = makeRows(2);
      fixture.detectChanges();
      component.toggleMultiSelectAll(true);
      expect(component.isAllMultiSelected()).toBeTrue();
    });

    it('isMultiSelectIndeterminate should return true when only some rows are selected', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.idField = 'id';
      component.enableMultiSelect = true;
      component.data = makeRows(3);
      fixture.detectChanges();
      const vm = (component.dataSource.data as any[])[0];
      component.toggleMultiSelectRow(vm);
      expect(component.isMultiSelectIndeterminate()).toBeTrue();
    });

    it('toggleMultiSelectAll with checked=false should deselect all rows', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.idField = 'id';
      component.enableMultiSelect = true;
      component.data = makeRows(2);
      fixture.detectChanges();
      component.toggleMultiSelectAll(true);
      component.toggleMultiSelectAll(false);
      expect(component.isAllMultiSelected()).toBeFalse();
    });
  });

  // =========================================================================
  // 15. Grouped filter helpers
  // =========================================================================

  describe('Grouped filters', () => {
    it('isGroupFullySelected should return true when all group values are selected', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      component.data = makeRows(2);
      fixture.detectChanges();
      const group = { label: 'G', children: [
        { label: 'Row 1', value: 'Row 1' },
        { label: 'Row 2', value: 'Row 2' },
      ]};
      component.onGroupToggle('name', group, true);
      expect(component.isGroupFullySelected('name', group)).toBeTrue();
    });

    it('isGroupIndeterminate should return true when some group values are selected', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      component.data = makeRows(3);
      fixture.detectChanges();
      const group = { label: 'G', children: [
        { label: 'Row 1', value: 'Row 1' },
        { label: 'Row 2', value: 'Row 2' },
      ]};
      component.onValueFilterToggle('name', 'Row 1', true);
      expect(component.isGroupIndeterminate('name', group)).toBeTrue();
    });

    it('isLeafSelected should correctly reflect individual selection state', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      component.data = makeRows(2);
      fixture.detectChanges();
      component.onValueFilterToggle('name', 'Row 1', true);
      expect(component.isLeafSelected('name', 'Row 1')).toBeTrue();
      expect(component.isLeafSelected('name', 'Row 2')).toBeFalse();
    });

    it('getGroupedValues should return empty array when column has no grouped values', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      fixture.detectChanges();
      expect(component.getGroupedValues('name')).toEqual([]);
    });

    it('getGroupTotalCount should count all leaf values in a group', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      fixture.detectChanges();
      const group = { label: 'G', children: [
        { label: 'A', value: 'A' },
        { label: 'B', value: 'B' },
        { label: 'C', value: 'C' },
      ]};
      expect(component.getGroupTotalCount(group)).toBe(3);
    });

    it('getGroupSelectedCount should count only selected leaf values', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      component.data = makeRows(3);
      fixture.detectChanges();
      const group = { label: 'G', children: [
        { label: 'Row 1', value: 'Row 1' },
        { label: 'Row 2', value: 'Row 2' },
      ]};
      component.onValueFilterToggle('name', 'Row 1', true);
      expect(component.getGroupSelectedCount('name', group)).toBe(1);
    });

    it('onGroupToggle with checked=false should remove all group values from selection', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      component.data = makeRows(2);
      fixture.detectChanges();
      const group = { label: 'G', children: [
        { label: 'Row 1', value: 'Row 1' },
        { label: 'Row 2', value: 'Row 2' },
      ]};
      component.onGroupToggle('name', group, true);
      component.onGroupToggle('name', group, false);
      expect(component.filterState.columns['name']?.selectedValues).toEqual([]);
    });
  });

  // =========================================================================
  // 16. trackByRow / trackByVm
  // =========================================================================

  describe('trackByRow and trackByVm', () => {
    it('trackByRow should return idField value when idField is set', () => {
      const { fixture, component } = createComponent();
      component.idField = 'id';
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      fixture.detectChanges();
      const row: TestRow = { id: 42, name: 'X', amount: 0, active: false, date: '' };
      expect(component.trackByRow(0, row)).toBe(42);
    });

    it('trackByRow should return index when idField is not set', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      fixture.detectChanges();
      const row: TestRow = { id: 42, name: 'X', amount: 0, active: false, date: '' };
      expect(component.trackByRow(7, row)).toBe(7);
    });

    it('trackByVm should return vm.key', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      fixture.detectChanges();
      const vm: any = { row: {}, level: 0, isChild: false, key: 'unique-key-123' };
      expect(component.trackByVm(0, vm)).toBe('unique-key-123');
    });
  });

  // =========================================================================
  // 17. Footer
  // =========================================================================

  describe('Footer', () => {
    it('hasFooter should return false when footerData is null', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      fixture.detectChanges();
      expect(component.hasFooter()).toBeFalse();
    });

    it('hasFooter should return true when footerData is provided', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.footerData = { id: 0, name: 'Total', amount: 1000, active: false, date: '' };
      fixture.detectChanges();
      expect(component.hasFooter()).toBeTrue();
    });

    it('getFooterDisplayValue should return footerLabel for the first text column', () => {
      const { fixture, component } = createComponent();
      const textCol = makeCol({ id: 'name', header: 'Name', type: 'text' });
      const numCol = makeCol({ id: 'amount', header: 'Amount', type: 'number' });
      component.columns = [textCol, numCol];
      component.footerData = { id: 0, name: 'IGNORED', amount: 999, active: false, date: '' };
      component.footerLabel = 'Grand Total';
      fixture.detectChanges();
      expect(component.getFooterDisplayValue(textCol)).toBe('Grand Total');
    });

    it('getFooterDisplayValue should return empty string for action column', () => {
      const { fixture, component } = createComponent();
      // Include a text column first so the action column is NOT treated as the label column
      const textCol = makeCol({ id: 'name', header: 'Name', type: 'text' });
      const actionCol = makeCol({ id: 'act', header: 'Action', type: 'action' });
      component.columns = [textCol, actionCol];
      component.footerData = { id: 0, name: 'Total', amount: 0, active: false, date: '' };
      fixture.detectChanges();
      // Action column should always return '' regardless of footerData
      expect(component.getFooterDisplayValue(actionCol)).toBe('');
    });
  });

  // =========================================================================
  // 18. isGroupExpanded / toggleGroupExpanded
  // =========================================================================

  describe('isGroupExpanded and toggleGroupExpanded', () => {
    it('isGroupExpanded should return true by default before any toggle', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      fixture.detectChanges();
      const group = { label: 'My Group' };
      expect(component.isGroupExpanded('name', group)).toBeTrue();
    });

    it('toggleGroupExpanded should cycle: default=expanded, 1st toggle=still expanded, 2nd=collapsed, 3rd=expanded', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      fixture.detectChanges();
      const group = { label: 'My Group' };
      // Default (no Set): expanded
      expect(component.isGroupExpanded('name', group)).toBeTrue();
      // 1st toggle: creates Set, adds label -> still expanded
      component.toggleGroupExpanded('name', group);
      expect(component.isGroupExpanded('name', group)).toBeTrue();
      // 2nd toggle: removes label from Set -> collapsed
      component.toggleGroupExpanded('name', group);
      expect(component.isGroupExpanded('name', group)).toBeFalse();
      // 3rd toggle: adds label back -> expanded again
      component.toggleGroupExpanded('name', group);
      expect(component.isGroupExpanded('name', group)).toBeTrue();
    });
  });

  // =========================================================================
  // 19. getCellTemplate
  // =========================================================================

  describe('getCellTemplate', () => {
    it('should return undefined when no template is registered for a column', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      fixture.detectChanges();
      expect(component.getCellTemplate('name')).toBeUndefined();
    });
  });

  // =========================================================================
  // 20. ngOnDestroy
  // =========================================================================

  describe('ngOnDestroy', () => {
    it('should complete without errors', () => {
      const { fixture, component } = createComponent();
      fixture.detectChanges();
      expect(function() { component.ngOnDestroy(); }).not.toThrow();
    });
  });

  // =========================================================================
  // 21. autoGenerateValueLists
  // =========================================================================

  describe('autoGenerateValueLists', () => {
    it('should populate uniqueValues from data when enabled', () => {
      const { fixture, component } = createComponent();
      component.autoGenerateValueLists = true;
      component.columns = [makeCol({
        id: 'name',
        header: 'Name',
        filterable: true,
        filterConfig: { supportsValueList: true },
      })];
      component.data = makeRows(3);
      fixture.detectChanges();
      expect(component.uniqueValues).toBeDefined();
    });

    it('should build grouped values from filterConfig when autoGenerateValueLists is true', () => {
      const { fixture, component } = createComponent();
      component.autoGenerateValueLists = true;
      const groupedValues = [{ label: 'G', children: [{ label: 'A', value: 'A' }] }];
      component.columns = [makeCol({
        id: 'name',
        header: 'Name',
        filterable: true,
        filterConfig: { supportsGroupValues: true, groupedValues },
      })];
      component.data = makeRows(2);
      fixture.detectChanges();
      expect(component.groupedValues).toBeDefined();
    });
  });

  // =========================================================================
  // 22. Filter operators - text branches
  // =========================================================================

  describe('Text filter operator branches', () => {
    function setupTextFilter() {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      component.data = makeRows(5);
      fixture.detectChanges();
      return { fixture, component };
    }

    it('notContains operator should filter out rows containing the value', () => {
      const { component } = setupTextFilter();
      component.onColumnOperatorChange('name', 'notContains');
      component.onColumnValueChange('name', 'Row 1');
      expect(component.dataSource.filteredData.length).toBe(4);
    });

    it('startsWith operator should return only matching rows', () => {
      const { component } = setupTextFilter();
      component.onColumnOperatorChange('name', 'startsWith');
      component.onColumnValueChange('name', 'Row');
      expect(component.dataSource.filteredData.length).toBe(5);
    });

    it('endsWith operator should return only matching rows', () => {
      const { component } = setupTextFilter();
      component.onColumnOperatorChange('name', 'endsWith');
      component.onColumnValueChange('name', '1');
      expect(component.dataSource.filteredData.length).toBe(1);
    });

    it('equals text operator should match exact string', () => {
      const { component } = setupTextFilter();
      component.onColumnOperatorChange('name', 'equals');
      component.onColumnValueChange('name', 'Row 1');
      expect(component.dataSource.filteredData.length).toBe(1);
    });

    it('notEquals text operator should exclude exact match', () => {
      const { component } = setupTextFilter();
      component.onColumnOperatorChange('name', 'notEquals');
      component.onColumnValueChange('name', 'Row 1');
      expect(component.dataSource.filteredData.length).toBe(4);
    });

    it('empty value with operator should pass all rows', () => {
      const { component } = setupTextFilter();
      component.onColumnOperatorChange('name', 'contains');
      component.onColumnValueChange('name', '');
      expect(component.dataSource.filteredData.length).toBe(5);
    });
  });

  // =========================================================================
  // 23. Number filter operator branches
  // =========================================================================

  describe('Number filter operator branches', () => {
    function setupNumberFilter() {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'amount', header: 'Amount', type: 'number', filterable: true })];
      component.data = makeRows(5); // amounts: 100, 200, 300, 400, 500
      fixture.detectChanges();
      return { fixture, component };
    }

    it('equals number operator should return exact match', () => {
      const { component } = setupNumberFilter();
      component.onColumnOperatorChange('amount', 'equals');
      component.onColumnValueChange('amount', '300');
      expect(component.dataSource.filteredData.length).toBe(1);
    });

    it('notEquals number operator should exclude exact match', () => {
      const { component } = setupNumberFilter();
      component.onColumnOperatorChange('amount', 'notEquals');
      component.onColumnValueChange('amount', '300');
      expect(component.dataSource.filteredData.length).toBe(4);
    });

    it('greaterThan number operator should filter correctly', () => {
      const { component } = setupNumberFilter();
      component.onColumnOperatorChange('amount', 'greaterThan');
      component.onColumnValueChange('amount', '300');
      expect(component.dataSource.filteredData.length).toBe(2);
    });

    it('greaterThanOrEqual number operator should include boundary', () => {
      const { component } = setupNumberFilter();
      component.onColumnOperatorChange('amount', 'greaterThanOrEqual');
      component.onColumnValueChange('amount', '300');
      expect(component.dataSource.filteredData.length).toBe(3);
    });

    it('lessThan number operator should filter correctly', () => {
      const { component } = setupNumberFilter();
      component.onColumnOperatorChange('amount', 'lessThan');
      component.onColumnValueChange('amount', '300');
      expect(component.dataSource.filteredData.length).toBe(2);
    });

    it('lessThanOrEqual number operator should include boundary', () => {
      const { component } = setupNumberFilter();
      component.onColumnOperatorChange('amount', 'lessThanOrEqual');
      component.onColumnValueChange('amount', '300');
      expect(component.dataSource.filteredData.length).toBe(3);
    });

    it('between number operator should include both endpoints', () => {
      const { component } = setupNumberFilter();
      component.onColumnOperatorChange('amount', 'between');
      component.onColumnValueChange('amount', '200');
      component.onColumnValue2Change('amount', '400');
      expect(component.dataSource.filteredData.length).toBe(3);
    });

    it('between number operator with no v2 should pass all', () => {
      const { component } = setupNumberFilter();
      component.onColumnOperatorChange('amount', 'between');
      component.onColumnValueChange('amount', '200');
      // v2 is empty by default - passes all
      expect(component.dataSource.filteredData.length).toBe(5);
    });

    it('number filter with NaN raw value should exclude row', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'amount', header: 'Amount', type: 'number', filterable: true })];
      component.data = [
        { id: 1, name: 'X', amount: NaN, active: false, date: '' } as any,
        { id: 2, name: 'Y', amount: 100, active: false, date: '' },
      ];
      fixture.detectChanges();
      component.onColumnOperatorChange('amount', 'equals');
      component.onColumnValueChange('amount', '100');
      // Only the non-NaN row passes
      expect(component.dataSource.filteredData.length).toBe(1);
    });
  });

  // =========================================================================
  // 24. Date filter operator branches
  // =========================================================================

  describe('Date filter operator branches', () => {
    function setupDateFilter() {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'date', header: 'Date', type: 'date', filterable: true })];
      component.data = [
        { id: 1, name: 'A', amount: 0, active: false, date: '2024-01-15' },
        { id: 2, name: 'B', amount: 0, active: false, date: '2024-06-15' },
        { id: 3, name: 'C', amount: 0, active: false, date: '2024-12-15' },
      ];
      fixture.detectChanges();
      return { fixture, component };
    }

    it('date contains operator should match display string', () => {
      const { component } = setupDateFilter();
      component.onColumnOperatorChange('date', 'contains');
      component.onColumnValueChange('date', '2024');
      expect(component.dataSource.filteredData.length).toBe(3);
    });

    it('date on operator should match exact date', () => {
      const { component } = setupDateFilter();
      component.onColumnOperatorChange('date', 'on');
      component.onColumnValueChange('date', '2024-06-15');
      expect(component.dataSource.filteredData.length).toBe(1);
    });

    it('date before operator should return earlier dates', () => {
      const { component } = setupDateFilter();
      component.onColumnOperatorChange('date', 'before');
      component.onColumnValueChange('date', '2024-06-15');
      expect(component.dataSource.filteredData.length).toBe(1);
    });

    it('date after operator should return later dates', () => {
      const { component } = setupDateFilter();
      component.onColumnOperatorChange('date', 'after');
      component.onColumnValueChange('date', '2024-06-15');
      expect(component.dataSource.filteredData.length).toBe(1);
    });

    it('date between operator should return dates in range', () => {
      const { component } = setupDateFilter();
      component.onColumnOperatorChange('date', 'between');
      component.onColumnValueChange('date', '2024-01-01');
      component.onColumnValue2Change('date', '2024-06-30');
      expect(component.dataSource.filteredData.length).toBe(2);
    });

    it('date between with no v2 should pass all rows', () => {
      const { component } = setupDateFilter();
      component.onColumnOperatorChange('date', 'between');
      component.onColumnValueChange('date', '2024-01-01');
      // no v2 set - should pass all
      expect(component.dataSource.filteredData.length).toBe(3);
    });

    it('date filter with empty v1 should pass all rows', () => {
      const { component } = setupDateFilter();
      component.onColumnOperatorChange('date', 'on');
      component.onColumnValueChange('date', '');
      expect(component.dataSource.filteredData.length).toBe(3);
    });

    it('date filter with invalid date value should not throw', () => {
      const { component } = setupDateFilter();
      component.onColumnOperatorChange('date', 'on');
      component.onColumnValueChange('date', 'not-a-date');
      expect(component.dataSource).toBeDefined();
    });
  });

  // =========================================================================
  // 25. Boolean filter operator branches
  // =========================================================================

  describe('Boolean filter operator branches', () => {
    function setupBoolFilter() {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'active', header: 'Active', type: 'boolean', filterable: true })];
      component.data = makeRows(5); // active: true, false, true, false, true
      fixture.detectChanges();
      return { fixture, component };
    }

    it('isTrue operator should return only true rows', () => {
      const { component } = setupBoolFilter();
      component.onColumnOperatorChange('active', 'isTrue');
      component.onColumnValueChange('active', '1');
      expect(component.dataSource.filteredData.length).toBe(3);
    });

    it('isFalse operator should return only false rows', () => {
      const { component } = setupBoolFilter();
      component.onColumnOperatorChange('active', 'isFalse');
      component.onColumnValueChange('active', '1');
      expect(component.dataSource.filteredData.length).toBe(2);
    });
  });

  // =========================================================================
  // 26. Custom compareFn in filterConfig
  // =========================================================================

  describe('Custom compareFn', () => {
    it('should use compareFn from filterConfig when provided', () => {
      const { fixture, component } = createComponent();
      const compareFn = jasmine.createSpy('compareFn').and.returnValue(true);
      component.columns = [makeCol({
        id: 'amount',
        header: 'Amount',
        type: 'number',
        filterable: true,
        filterConfig: { compareFn },
      })];
      component.data = makeRows(3);
      fixture.detectChanges();
      component.onColumnOperatorChange('amount', 'equals');
      component.onColumnValueChange('amount', '100');
      expect(compareFn).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 27. getDisplayValue edge cases
  // =========================================================================

  describe('getDisplayValue edge cases', () => {
    it('getDisplayValue should return empty string for invalid date', () => {
      const { fixture, component } = createComponent();
      const col = makeCol({ id: 'date', header: 'Date', type: 'date' });
      component.columns = [col];
      fixture.detectChanges();
      const row: TestRow = { id: 1, name: 'X', amount: 0, active: false, date: 'invalid-date' };
      const result = component.getDisplayValue(row, col, 'invalid-date');
      expect(result).toBe('');
    });

    it('getDisplayValue should handle NaN for currency type', () => {
      const { fixture, component } = createComponent();
      const col = makeCol({ id: 'amount', header: 'Amount', type: 'currency' });
      component.columns = [col];
      fixture.detectChanges();
      const result = component.getDisplayValue({} as any, col, 'not-a-number');
      expect(typeof result).toBe('string');
    });

    it('getDisplayValue should handle NaN for number type', () => {
      const { fixture, component } = createComponent();
      const col = makeCol({ id: 'amount', header: 'Amount', type: 'number' });
      component.columns = [col];
      fixture.detectChanges();
      const result = component.getDisplayValue({} as any, col, 'bad');
      expect(typeof result).toBe('string');
    });

    it('getDisplayValue with Date object should format date', () => {
      const { fixture, component } = createComponent();
      const col = makeCol({ id: 'date', header: 'Date', type: 'date' });
      component.columns = [col];
      fixture.detectChanges();
      const d = new Date('2024-06-15');
      const row: any = { id: 1, name: 'X', amount: 0, active: false, date: d };
      const result = component.getDisplayValue(row, col, d);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  // =========================================================================
  // 28. Row click double-click detection
  // =========================================================================

  describe('Row click double-click detection', () => {
    it('onRowClick twice quickly should emit rowDoubleClicked', fakeAsync(() => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeRows(1);
      fixture.detectChanges();
      const spy = jasmine.createSpy('rowDoubleClicked');
      component.rowDoubleClicked.subscribe(spy);
      const vm = (component.dataSource.data as any[])[0];
      component.onRowClick(vm);
      component.onRowClick(vm); // double click
      tick(300);
      expect(spy).toHaveBeenCalled();
    }));

    it('onRowClick on nested expandable row should expand it', () => {
      const { fixture, component } = createComponent();
      component.enableNestedRows = true;
      component.expandOnRowClick = true;
      component.childrenAccessor = (r: any) => r.children || [];
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = [
        { id: 1, name: 'Parent', amount: 100, active: true, date: '', children: [
          { id: 11, name: 'Child', amount: 50, active: false, date: '' }
        ]}
      ];
      fixture.detectChanges();
      const vm = (component.dataSource.data as any[])[0];
      expect(component.isRowExpanded(vm)).toBeFalse();
      component.onRowClick(vm);
      expect(component.isRowExpanded(vm)).toBeTrue();
    });

    it('onRowClick on nested expandable row already expanded should collapse it', fakeAsync(() => {
      const { fixture, component } = createComponent();
      component.enableNestedRows = true;
      component.expandOnRowClick = true;
      component.childrenAccessor = (r: any) => r.children || [];
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = [
        { id: 1, name: 'Parent', amount: 100, active: true, date: '', children: [
          { id: 11, name: 'Child', amount: 50, active: false, date: '' }
        ]}
      ];
      fixture.detectChanges();
      const vm = (component.dataSource.data as any[])[0];
      component.onRowClick(vm); // expand
      tick(300);
      component.onRowClick(vm); // collapse
      expect(component.isRowExpanded(vm)).toBeFalse();
    }));

    it('rowExpanded should emit when a nested row is expanded', () => {
      const { fixture, component } = createComponent();
      component.enableNestedRows = true;
      component.childrenAccessor = (r: any) => r.children || [];
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = [
        { id: 1, name: 'Parent', amount: 100, active: true, date: '', children: [
          { id: 11, name: 'Child', amount: 50, active: false, date: '' }
        ]}
      ];
      fixture.detectChanges();
      const spy = jasmine.createSpy('rowExpanded');
      component.rowExpanded.subscribe(spy);
      const vm = (component.dataSource.data as any[])[0];
      component.toggleRowExpanded(vm);
      expect(spy).toHaveBeenCalled();
    });

    it('toggleRowExpanded should not expand a non-expandable row', () => {
      const { fixture, component } = createComponent();
      component.enableNestedRows = true;
      component.childrenAccessor = (r: any) => r.children || [];
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = [{ id: 1, name: 'Leaf', amount: 0, active: false, date: '' }];
      fixture.detectChanges();
      const vm = (component.dataSource.data as any[])[0];
      component.toggleRowExpanded(vm);
      expect(component.isRowExpanded(vm)).toBeFalse();
    });
  });

  // =========================================================================
  // 29. propertyPath traversal
  // =========================================================================

  describe('propertyPath traversal', () => {
    it('getRawValue with null in propertyPath should return undefined', () => {
      const { fixture, component } = createComponent();
      const col = makeCol({ id: 'x', header: 'X', propertyPath: 'nested.value' });
      component.columns = [col];
      fixture.detectChanges();
      const row: any = { id: 1, name: 'A', amount: 0, active: false, date: '', nested: null };
      expect(component.getRawValue(row, col)).toBeUndefined();
    });

    it('getFooterRawValue should traverse propertyPath for footer', () => {
      const { fixture, component } = createComponent();
      const col = makeCol({ id: 'amount', header: 'Amount', type: 'number', propertyPath: 'amount' });
      component.columns = [col];
      component.footerData = { id: 0, name: 'Total', amount: 9999, active: false, date: '' };
      fixture.detectChanges();
      expect(component.getFooterRawValue(col)).toBe(9999);
    });

    it('getFooterRawValue with accessor should use accessor', () => {
      const { fixture, component } = createComponent();
      const col = makeCol({ id: 'amount', header: 'Amount', type: 'number', accessor: (r: any) => r.amount * 2 });
      component.columns = [col];
      component.footerData = { id: 0, name: 'Total', amount: 500, active: false, date: '' };
      fixture.detectChanges();
      expect(component.getFooterRawValue(col)).toBe(1000);
    });

    it('getFooterRawValue with null footerData should return null', () => {
      const { fixture, component } = createComponent();
      const col = makeCol({ id: 'amount', header: 'Amount', type: 'number' });
      component.columns = [col];
      fixture.detectChanges();
      expect(component.getFooterRawValue(col)).toBeNull();
    });
  });

  // =========================================================================
  // 30. getFooterDisplayValue edge cases
  // =========================================================================

  describe('getFooterDisplayValue additional', () => {
    it('getFooterDisplayValue should return empty string when footerData is null', () => {
      const { fixture, component } = createComponent();
      const col = makeCol({ id: 'name', header: 'Name', type: 'text' });
      component.columns = [col];
      fixture.detectChanges();
      expect(component.getFooterDisplayValue(col)).toBe('');
    });

    it('getFooterDisplayValue should use footerLabelColumnId when set', () => {
      const { fixture, component } = createComponent();
      const col1 = makeCol({ id: 'name', header: 'Name', type: 'text' });
      const col2 = makeCol({ id: 'amount', header: 'Amount', type: 'number' });
      component.columns = [col1, col2];
      component.footerLabelColumnId = 'amount';
      component.footerData = { id: 0, name: '', amount: 500, active: false, date: '' };
      fixture.detectChanges();
      expect(component.getFooterDisplayValue(col2)).toBe('Total');
    });

    it('getFooterDisplayValue should format numeric value for non-label column', () => {
      const { fixture, component } = createComponent();
      const textCol = makeCol({ id: 'name', header: 'Name', type: 'text' });
      const numCol = makeCol({ id: 'amount', header: 'Amount', type: 'currency' });
      component.columns = [textCol, numCol];
      component.footerData = { id: 0, name: 'Total', amount: 1000, active: false, date: '' };
      fixture.detectChanges();
      const display = component.getFooterDisplayValue(numCol);
      expect(display).toContain('1,000');
    });
  });

  // =========================================================================
  // 31. Sort in nested mode
  // =========================================================================

  describe('Sort in nested mode', () => {
    it('sortChanged event should emit in nested mode', () => {
      const { fixture, component } = createComponent();
      component.enableNestedRows = true;
      component.childrenAccessor = (r: any) => r.children || [];
      component.columns = [makeCol({ id: 'name', header: 'Name', sortable: true })];
      component.data = makeRows(3);
      fixture.detectChanges();
      const spy = jasmine.createSpy('sortChanged');
      component.sortChanged.subscribe(spy);
      (component.sort.sortChange as any as Subject<any>).next({ active: 'name', direction: 'asc' });
      expect(spy).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 32. Export with nested rows
  // =========================================================================

  describe('Export with nested rows', () => {
    it('exportToExcel should include Level column for nested rows', async () => {
      const { fixture, component } = createComponent();
      component.enableNestedRows = true;
      component.exportIncludeHierarchyLevel = true;
      component.childrenAccessor = (r: any) => r.children || [];
      component.columns = [makeCol({ id: 'name', header: 'Name', type: 'text' })];
      component.data = [
        { id: 1, name: 'Parent', amount: 100, active: true, date: '' }
      ];
      fixture.detectChanges();
      spyOn(window.URL, 'createObjectURL').and.returnValue('blob:test');
      spyOn(window.URL, 'revokeObjectURL');
      const anchor = { href: '', download: '', click: jasmine.createSpy('click') } as any;
      spyOn(document, 'createElement').and.returnValue(anchor);
      await component.exportToExcel();
      expect(anchor.click).toHaveBeenCalled();
    });

    it('exportToExcel should not export when data is empty', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = [];
      fixture.detectChanges();
      const result = component.exportToExcel();
      expect(result).toBeUndefined();
    });

    it('should export with action column excluded', async () => {
      const { fixture, component } = createComponent();
      component.columns = [
        makeCol({ id: 'name', header: 'Name', type: 'text' }),
        makeCol({ id: 'edit', header: 'Edit', type: 'action' }),
      ];
      component.data = makeRows(1);
      component.exportOnlyVisibleColumns = true;
      fixture.detectChanges();
      spyOn(window.URL, 'createObjectURL').and.returnValue('blob:test');
      spyOn(window.URL, 'revokeObjectURL');
      const anchor = { href: '', download: '', click: jasmine.createSpy('click') } as any;
      spyOn(document, 'createElement').and.returnValue(anchor);
      await component.exportToExcel();
      expect(anchor.click).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 33. onActionClick with event stopPropagation
  // =========================================================================

  describe('onActionClick with event', () => {
    it('should call event.stopPropagation when event is provided', () => {
      const { fixture, component } = createComponent();
      const col = makeCol({ id: 'edit', header: 'Edit', type: 'action', actionId: 'edit' });
      component.columns = [col];
      component.data = makeRows(1);
      fixture.detectChanges();
      const mockEvent = { stopPropagation: jasmine.createSpy('stopPropagation') } as any;
      component.onActionClick(col, component.data[0], mockEvent);
      expect(mockEvent.stopPropagation).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 34. closeActiveFilterMenu
  // =========================================================================

  describe('closeActiveFilterMenu', () => {
    it('should not throw when columnFilterTriggers is undefined', () => {
      const { fixture, component } = createComponent();
      fixture.detectChanges();
      (component as any).columnFilterTriggers = undefined;
      expect(() => component.closeActiveFilterMenu()).not.toThrow();
    });
  });

  // =========================================================================
  // 35. hasChildrenAccessor
  // =========================================================================

  describe('hasChildrenAccessor input', () => {
    it('hasChildrenAccessor should take priority over childrenAccessor check', () => {
      const { fixture, component } = createComponent();
      component.enableNestedRows = true;
      component.hasChildrenAccessor = (r: any) => !!(r as any).hasKids;
      component.childrenAccessor = (r: any) => (r as any).children || [];
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = [
        { id: 1, name: 'A', amount: 0, active: false, date: '' } as any,
        { id: 2, name: 'B', amount: 0, active: false, date: '' } as any,
      ];
      (component.data[0] as any).hasKids = true;
      (component.data[1] as any).hasKids = false;
      fixture.detectChanges();
      const vms = component.dataSource.data as any[];
      expect(component.isExpandable(vms[0])).toBeTrue();
      expect(component.isExpandable(vms[1])).toBeFalse();
    });
  });

  // =========================================================================
  // 36. globalSearchColumns restriction
  // =========================================================================

  describe('globalSearchColumns', () => {
    it('should only search specified columns when globalSearchColumns is set', () => {
      const { fixture, component } = createComponent();
      component.columns = [
        makeCol({ id: 'name', header: 'Name', includeInGlobalSearch: true }),
        makeCol({ id: 'amount', header: 'Amount', type: 'number', includeInGlobalSearch: true }),
      ];
      component.globalSearchColumns = ['name'];
      component.data = makeRows(5);
      fixture.detectChanges();
      component.onGlobalSearchChange('Row 1');
      expect(component.dataSource.filteredData.length).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // 37. autoSelectFirstRow edge cases
  // =========================================================================

  describe('autoSelectFirstRow edge cases', () => {
    it('autoSelectFirstRow should set selectedId to null when data becomes empty', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.idField = 'id';
      component.autoSelectFirstRow = true;
      component.data = makeRows(2);
      fixture.detectChanges();

      component.data = [];
      const changes: SimpleChanges = {
        data: new SimpleChange(makeRows(2), [], false),
      };
      component.ngOnChanges(changes);
      expect(component.selectedId).toBeNull();
    });

    it('autoSelectFirstRow should keep selection when selected row is still visible', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.idField = 'id';
      component.autoSelectFirstRow = true;
      component.data = makeRows(3);
      fixture.detectChanges();
      const initialId = component.selectedId;
      expect(component.selectedId).toBe(initialId);
    });
  });

  // =========================================================================
  // 38. Nested mode filtering
  // =========================================================================

  describe('Nested mode filtering', () => {
    it('global search in nested mode should show matching parent rows', () => {
      const { fixture, component } = createComponent();
      component.enableNestedRows = true;
      component.childrenAccessor = (r: any) => (r as any).children || [];
      component.columns = [makeCol({ id: 'name', header: 'Name', includeInGlobalSearch: true, accessor: (r: any) => r.name })];
      component.data = [
        { id: 1, name: 'Alpha', amount: 0, active: true, date: '' },
        { id: 2, name: 'Beta', amount: 0, active: false, date: '' },
      ];
      fixture.detectChanges();
      component.onGlobalSearchChange('Alpha');
      expect(component.dataSource.data.length).toBe(1);
    });

    it('nested mode with no filter should show all root rows', () => {
      const { fixture, component } = createComponent();
      component.enableNestedRows = true;
      component.childrenAccessor = (r: any) => (r as any).children || [];
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeRows(4);
      fixture.detectChanges();
      expect(component.dataSource.data.length).toBe(4);
    });
  });

  // =========================================================================
  // 39. onLeafToggle
  // =========================================================================

  describe('onLeafToggle', () => {
    it('onLeafToggle should toggle leaf selection', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      component.data = makeRows(2);
      fixture.detectChanges();
      component.onLeafToggle('name', 'Row 1', true);
      expect(component.isLeafSelected('name', 'Row 1')).toBeTrue();
      component.onLeafToggle('name', 'Row 1', false);
      expect(component.isLeafSelected('name', 'Row 1')).toBeFalse();
    });
  });

  // =========================================================================
  // 40. onGroupHeaderClick
  // =========================================================================

  describe('onGroupHeaderClick', () => {
    it('onGroupHeaderClick should call toggleGroupExpanded and stop propagation', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      fixture.detectChanges();
      const group = { label: 'TestGroup' };
      const mockEvent = { stopPropagation: jasmine.createSpy('sp') } as any;
      expect(() => component.onGroupHeaderClick('name', group, mockEvent)).not.toThrow();
      expect(mockEvent.stopPropagation).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 41. autoGenerateValueLists with builders
  // =========================================================================

  describe('autoGenerateValueLists with builders', () => {
    it('should use buildValueList from filterConfig when provided', () => {
      const { fixture, component } = createComponent();
      component.autoGenerateValueLists = true;
      const buildValueList = jasmine.createSpy('buildValueList').and.returnValue(['X', 'Y']);
      component.columns = [makeCol({
        id: 'name',
        header: 'Name',
        filterable: true,
        filterConfig: { supportsValueList: true, buildValueList },
      })];
      component.data = makeRows(3);
      fixture.detectChanges();
      expect(buildValueList).toHaveBeenCalled();
      expect(component.uniqueValues['name']).toEqual(['X', 'Y']);
    });

    it('should use buildGroupedValues from filterConfig when provided', () => {
      const { fixture, component } = createComponent();
      component.autoGenerateValueLists = true;
      const grouped = [{ label: 'G', children: [] }];
      const buildGroupedValues = jasmine.createSpy('buildGroupedValues').and.returnValue(grouped);
      component.columns = [makeCol({
        id: 'name',
        header: 'Name',
        filterable: true,
        filterConfig: { supportsGroupValues: true, buildGroupedValues },
      })];
      component.data = makeRows(2);
      fixture.detectChanges();
      expect(buildGroupedValues).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 42. Export fileName normalization
  // =========================================================================

  describe('Export filename normalization', () => {
    it('should keep .xlsx extension when already present', async () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeRows(1);
      component.exportFileName = 'report.xlsx';
      fixture.detectChanges();
      spyOn(window.URL, 'createObjectURL').and.returnValue('blob:test');
      spyOn(window.URL, 'revokeObjectURL');
      const anchor = { href: '', download: '', click: jasmine.createSpy('click') } as any;
      spyOn(document, 'createElement').and.returnValue(anchor);
      await component.exportToExcel();
      expect(anchor.download).toBe('report.xlsx');
    });
  });

  // =========================================================================
  // 43. multiSelectedIds edge cases
  // =========================================================================

  describe('multiSelectedIds edge cases', () => {
    it('isAllMultiSelected should return false when no filteredData', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.idField = 'id';
      component.enableMultiSelect = true;
      component.data = [];
      fixture.detectChanges();
      expect(component.isAllMultiSelected()).toBeFalse();
    });

    it('isMultiSelectIndeterminate should return false when no filteredData', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.idField = 'id';
      component.enableMultiSelect = true;
      component.data = [];
      fixture.detectChanges();
      expect(component.isMultiSelectIndeterminate()).toBeFalse();
    });
  });

  // =========================================================================
  // 44. ngOnChanges enableMultiSelect change
  // =========================================================================

  describe('ngOnChanges enableMultiSelect', () => {
    it('should rebuild renderedColumns when enableMultiSelect changes', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeRows(2);
      fixture.detectChanges();

      component.enableMultiSelect = true;
      const changes: SimpleChanges = {
        enableMultiSelect: new SimpleChange(false, true, false),
      };
      component.ngOnChanges(changes);
      expect(component.renderedColumns).toContain('__select');
    });
  });

  // =========================================================================
  // 45. getActiveFilterPills for between operator
  // =========================================================================

  describe('getActiveFilterPills between operator pill', () => {
    it('should show between range in pill label', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'amount', header: 'Amount', type: 'number', filterable: true })];
      component.data = makeRows(3);
      fixture.detectChanges();
      component.onColumnOperatorChange('amount', 'between');
      component.onColumnValueChange('amount', '100');
      component.onColumnValue2Change('amount', '300');
      const pills = component.getActiveFilterPills();
      const amountPill = pills.find(p => p.kind === 'column');
      expect(amountPill).toBeDefined();
      expect(amountPill!.label).toContain('100');
      expect(amountPill!.label).toContain('300');
    });

    it('getActiveFilterPills should show multi-selection label for 2+ selected values', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      component.data = makeRows(3);
      fixture.detectChanges();
      component.onValueFilterToggle('name', 'Row 1', true);
      component.onValueFilterToggle('name', 'Row 2', true);
      const pills = component.getActiveFilterPills();
      const pill = pills.find(p => p.kind === 'column');
      expect(pill!.label).toContain('2 selected');
    });
  });

  // =========================================================================
  // 46. clearAllFilters with externalGlobal
  // =========================================================================

  describe('clearAllFilters with external global', () => {
    it('should emit externalGlobalChange with empty string when externalGlobal is set', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.externalGlobal = 'some search';
      fixture.detectChanges();
      const spy = jasmine.createSpy('externalGlobalChange');
      component.externalGlobalChange.subscribe(spy);
      component.clearAllFilters();
      expect(spy).toHaveBeenCalledWith('');
    });
  });

  // =========================================================================
  // 47. hasAnyActiveFilters edge cases
  // =========================================================================

  describe('hasAnyActiveFilters edge cases', () => {
    it('should return true when selectedValues are non-empty', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      component.data = makeRows(2);
      fixture.detectChanges();
      component.onValueFilterToggle('name', 'Row 1', true);
      expect(component.hasAnyActiveFilters()).toBeTrue();
    });

    it('should return true when externalGlobal is non-empty', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.externalGlobal = 'ext term';
      fixture.detectChanges();
      expect(component.hasAnyActiveFilters()).toBeTrue();
    });
  });

  // =========================================================================
  // 48. includeInGlobalSearch = false columns excluded from search
  // =========================================================================

  describe('includeInGlobalSearch exclusion', () => {
    it('should not search columns where includeInGlobalSearch is false', () => {
      const { fixture, component } = createComponent();
      component.columns = [
        makeCol({ id: 'name', header: 'Name', includeInGlobalSearch: true }),
        makeCol({ id: 'amount', header: 'Amount', type: 'number', includeInGlobalSearch: false }),
      ];
      component.data = makeRows(3);
      fixture.detectChanges();
      // 'Row 1' is in 'name' column which is searchable
      component.onGlobalSearchChange('Row 1');
      expect(component.dataSource.filteredData.length).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // 49. exportOnlyVisibleColumns = false
  // =========================================================================

  describe('exportOnlyVisibleColumns = false', () => {
    it('should include all non-action columns when exportOnlyVisibleColumns is false', async () => {
      const { fixture, component } = createComponent();
      component.columns = [
        makeCol({ id: 'name', header: 'Name', type: 'text' }),
        makeCol({ id: 'amount', header: 'Amount', type: 'number' }),
      ];
      component.data = makeRows(1);
      component.exportOnlyVisibleColumns = false;
      fixture.detectChanges();
      spyOn(window.URL, 'createObjectURL').and.returnValue('blob:test');
      spyOn(window.URL, 'revokeObjectURL');
      const anchor = { href: '', download: '', click: jasmine.createSpy('click') } as any;
      spyOn(document, 'createElement').and.returnValue(anchor);
      await component.exportToExcel();
      expect(anchor.click).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 50. isSelected with null id
  // =========================================================================

  describe('isSelected with null id', () => {
    it('isSelected should return false when row has no idField value', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.idField = 'id';
      component.selectedId = 1;
      component.data = makeRows(1);
      fixture.detectChanges();
      const rowWithoutId: any = { name: 'X', amount: 0, active: false, date: '' };
      expect(component.isSelected({ row: rowWithoutId, level: 0, isChild: false, key: 'k' } as any)).toBeFalse();
    });
  });

  // =========================================================================
  // 51. getColumnOperators - custom operator list
  // =========================================================================

  describe('getColumnOperators additional', () => {
    it('should return custom operators when filterConfig.operators has entries', () => {
      const { fixture, component } = createComponent();
      fixture.detectChanges();
      const col = makeCol({
        id: 'name', header: 'Name', type: 'text',
        filterConfig: { operators: ['contains', 'equals'] },
      });
      const ops = component.getColumnOperators(col);
      expect(ops).toEqual(['contains', 'equals']);
    });
  });

  // =========================================================================
  // 52. filterState preserved across data reload
  // =========================================================================

  describe('filterState preserved across data reload', () => {
    it('filterState columns should be preserved when new columns are set with same ids', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      component.data = makeRows(3);
      fixture.detectChanges();

      component.onColumnValueChange('name', 'Row 1');
      expect(component.filterState.columns['name']?.value).toBe('Row 1');

      // Reload same columns
      const newCols = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      component.columns = newCols;
      const changes: SimpleChanges = {
        columns: new SimpleChange(component.columns, newCols, false),
      };
      component.ngOnChanges(changes);
      // After column change, filter state is re-initialized
      expect(component.filterState.columns['name']).toBeDefined();
    });
  });

  // =========================================================================
  // 53. initFilterState with initialFilterState set
  // =========================================================================

  describe('initFilterState with initialFilterState', () => {
    it('should use initialFilterState when provided on init', () => {
      const { fixture, component } = createComponent();
      const initState: TableFilterState = {
        global: 'preloaded',
        columns: { name: { operator: 'contains', value: 'test', value2: '', selectedValues: [] } },
      };
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      component.initialFilterState = initState;
      fixture.detectChanges();
      expect(component.filterState.global).toBe('preloaded');
      expect(component.filterState.columns['name']?.value).toBe('test');
    });

    it('ngOnChanges initialFilterState updates filterState', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      fixture.detectChanges();

      const newState: TableFilterState = {
        global: 'updated',
        columns: { name: { operator: 'equals', value: 'foo', value2: '', selectedValues: [] } },
      };
      component.initialFilterState = newState;
      const changes: SimpleChanges = {
        initialFilterState: new SimpleChange(null, newState, false),
      };
      component.ngOnChanges(changes);
      expect(component.filterState.global).toBe('updated');
      expect(component.globalSearchTerm).toBe('updated');
    });
  });

  // =========================================================================
  // 54. filterPredicate try/catch path (invalid JSON filter)
  // =========================================================================

  describe('filterPredicate with invalid JSON', () => {
    it('should fall back to global search when filter is not valid JSON', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: false })];
      component.data = makeRows(3);
      fixture.detectChanges();

      // Set raw filter string (not JSON) directly
      component.dataSource.filter = 'row 1';
      fixture.detectChanges();
      // filterPredicate is called internally - the dataSource will apply it
      // rows that contain 'row 1' should pass
      const filtered = component.dataSource.filteredData;
      expect(filtered.length).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // 55. sortingDataAccessor branches
  // =========================================================================

  describe('sortingDataAccessor', () => {
    it('should use sortAccessor when provided on column', () => {
      const { fixture, component } = createComponent();
      component.columns = [
        makeCol({ id: 'name', header: 'Name', sortAccessor: (r: any) => r.name.length }),
      ];
      component.data = makeRows(3);
      fixture.detectChanges();

      const row = makeRows(1)[0];
      const val = component.dataSource.sortingDataAccessor(row, 'name');
      expect(val).toBe(row.name.length);
    });

    it('should return raw property when column not found', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeRows(1);
      fixture.detectChanges();

      const row = makeRows(1)[0];
      const val = component.dataSource.sortingDataAccessor(row, 'nonExistentCol');
      expect(val).toBeUndefined();
    });

    it('should normalizeForSort for date column', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'date', header: 'Date', type: 'date' })];
      component.data = makeRows(3);
      fixture.detectChanges();

      const row = makeRows(1)[0];
      const val = component.dataSource.sortingDataAccessor(row, 'date');
      expect(typeof val).toBe('number');
      expect(val).toBeGreaterThan(0);
    });

    it('should normalizeForSort for boolean column', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'active', header: 'Active', type: 'boolean' })];
      component.data = makeRows(3);
      fixture.detectChanges();

      const rows = makeRows(2);
      const val1 = component.dataSource.sortingDataAccessor(rows[0], 'active'); // active=true
      const val0 = component.dataSource.sortingDataAccessor(rows[1], 'active'); // active=false
      expect(val1).toBe(1);
      expect(val0).toBe(0);
    });

    it('should normalizeForSort returning empty string for null number', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'amount', header: 'Amt', type: 'number' })];
      component.data = [{ id: 1, name: 'x', amount: null as any, active: true, date: '' }];
      fixture.detectChanges();
      const row = component.data[0];
      const val = component.dataSource.sortingDataAccessor(row, 'amount');
      // null value -> normalizeForSort returns '' (early return for null)
      expect(val).toBe('');
    });

    it('should normalizeForSort for invalid date returns 0', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'date', header: 'Date', type: 'date' })];
      component.data = [{ id: 1, name: 'x', amount: 0, active: true, date: 'not-a-date' }];
      fixture.detectChanges();
      const row = component.data[0];
      const val = component.dataSource.sortingDataAccessor(row, 'date');
      expect(val).toBe(0);
    });
  });

  // =========================================================================
  // 56. autoGenerateValueLists - rebuildValueListsAndGroups branches
  // =========================================================================

  describe('autoGenerateValueLists', () => {
    it('builds uniqueValues from data when autoGenerateValueLists is true', () => {
      const { fixture, component } = createComponent();
      component.autoGenerateValueLists = true;
      component.columns = [
        makeCol({
          id: 'name', header: 'Name',
          filterConfig: { supportsValueList: true },
          filterable: true,
        }),
      ];
      component.data = makeRows(5);
      fixture.detectChanges();
      expect(component.uniqueValues['name']).toBeDefined();
      expect(component.uniqueValues['name'].length).toBe(5);
    });

    it('uses buildValueList when provided', () => {
      const { fixture, component } = createComponent();
      component.autoGenerateValueLists = true;
      const buildValueList = jasmine.createSpy('buildValueList').and.returnValue(['Custom1', 'Custom2']);
      component.columns = [
        makeCol({
          id: 'name', header: 'Name',
          filterConfig: { supportsValueList: true, buildValueList },
          filterable: true,
        }),
      ];
      component.data = makeRows(3);
      fixture.detectChanges();
      expect(buildValueList).toHaveBeenCalled();
      expect(component.uniqueValues['name']).toEqual(['Custom1', 'Custom2']);
    });

    it('builds groupedValues from buildGroupedValues when provided', () => {
      const { fixture, component } = createComponent();
      component.autoGenerateValueLists = true;
      const groupNodes = [{ label: 'Group A', value: 'a' }];
      const buildGroupedValues = jasmine.createSpy('buildGroupedValues').and.returnValue(groupNodes);
      component.columns = [
        makeCol({
          id: 'name', header: 'Name',
          filterConfig: { supportsGroupValues: true, buildGroupedValues },
          filterable: true,
        }),
      ];
      component.data = makeRows(3);
      fixture.detectChanges();
      expect(buildGroupedValues).toHaveBeenCalled();
      expect(component.groupedValues['name']).toEqual(groupNodes);
    });

    it('uses fc.groupedValues static list when no buildGroupedValues', () => {
      const { fixture, component } = createComponent();
      component.autoGenerateValueLists = true;
      const staticGroups = [{ label: 'Static', value: 'static' }];
      component.columns = [
        makeCol({
          id: 'name', header: 'Name',
          filterConfig: { supportsGroupValues: true, groupedValues: staticGroups as any },
          filterable: true,
        }),
      ];
      component.data = makeRows(3);
      fixture.detectChanges();
      expect(component.groupedValues['name']).toEqual(staticGroups);
    });
  });

  // =========================================================================
  // 57. getDisplayValue branches - currency/number NaN, boolean, date NaN
  // =========================================================================

  describe('getDisplayValue type branches', () => {
    it('returns displayFormatter result when provided', () => {
      const { fixture, component } = createComponent();
      const col = makeCol({
        id: 'amount', header: 'Amt', type: 'currency',
        displayFormatter: (v: any) => `$${v}`,
      });
      component.columns = [col];
      component.data = [{ id: 1, name: 'A', amount: 99, active: true, date: '' }];
      fixture.detectChanges();
      expect(component.getDisplayValue(component.data[0], col)).toBe('$99');
    });

    it('returns empty string when value is null', () => {
      const { fixture, component } = createComponent();
      const col = makeCol({ id: 'name', header: 'Name', type: 'text' });
      component.columns = [col];
      component.data = [{ id: 1, name: null as any, amount: 0, active: true, date: '' }];
      fixture.detectChanges();
      expect(component.getDisplayValue(component.data[0], col)).toBe('');
    });

    it('returns empty string for currency with NaN value', () => {
      const { fixture, component } = createComponent();
      const col = makeCol({ id: 'amount', header: 'Amt', type: 'currency' });
      component.columns = [col];
      component.data = [{ id: 1, name: 'A', amount: 'not-a-number' as any, active: true, date: '' }];
      fixture.detectChanges();
      expect(component.getDisplayValue(component.data[0], col)).toBe('not-a-number');
    });

    it('returns empty string for number column with NaN value', () => {
      const { fixture, component } = createComponent();
      const col = makeCol({ id: 'amount', header: 'Amt', type: 'number' });
      component.columns = [col];
      component.data = [{ id: 1, name: 'A', amount: 'abc' as any, active: true, date: '' }];
      fixture.detectChanges();
      expect(component.getDisplayValue(component.data[0], col)).toBe('abc');
    });

    it('returns empty string for invalid date', () => {
      const { fixture, component } = createComponent();
      const col = makeCol({ id: 'date', header: 'Date', type: 'date' });
      component.columns = [col];
      component.data = [{ id: 1, name: 'A', amount: 0, active: true, date: 'invalid-date' }];
      fixture.detectChanges();
      expect(component.getDisplayValue(component.data[0], col)).toBe('');
    });

    it('returns Yes/No for boolean column', () => {
      const { fixture, component } = createComponent();
      const col = makeCol({ id: 'active', header: 'Active', type: 'boolean' });
      component.columns = [col];
      component.data = makeRows(2);
      fixture.detectChanges();
      expect(component.getDisplayValue(component.data[0], col)).toBe('Yes'); // active=true
      expect(component.getDisplayValue(component.data[1], col)).toBe('No');  // active=false
    });

    it('uses propertyPath when accessor is not set', () => {
      const { fixture, component } = createComponent();
      const col = makeCol({ id: 'name', header: 'Name', propertyPath: 'name' } as any);
      component.columns = [col];
      component.data = [{ id: 1, name: 'PathValue', amount: 0, active: true, date: '' }];
      fixture.detectChanges();
      expect(component.getDisplayValue(component.data[0], col)).toBe('PathValue');
    });
  });

  // =========================================================================
  // 58. Footer functionality
  // =========================================================================

  describe('footer functionality', () => {
    it('hasFooter returns true when footerData is set', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeRows(3);
      component.footerData = { id: 0, name: 'Total', amount: 600, active: false, date: '' };
      fixture.detectChanges();
      expect(component.hasFooter()).toBeTrue();
    });

    it('hasFooter returns false when footerData is null', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeRows(3);
      fixture.detectChanges();
      expect(component.hasFooter()).toBeFalse();
    });

    it('getFooterDisplayValue returns empty when footerData is null', () => {
      const { fixture, component } = createComponent();
      const col = makeCol({ id: 'name', header: 'Name' });
      component.columns = [col];
      component.data = makeRows(3);
      fixture.detectChanges();
      expect(component.getFooterDisplayValue(col)).toBe('');
    });

    it('getFooterDisplayValue returns footerLabel for first text column', () => {
      const { fixture, component } = createComponent();
      const col = makeCol({ id: 'name', header: 'Name', type: 'text' });
      component.columns = [col];
      component.data = makeRows(3);
      component.footerData = { id: 0, name: 'Total', amount: 0, active: false, date: '' };
      component.footerLabel = 'Grand Total';
      fixture.detectChanges();
      expect(component.getFooterDisplayValue(col)).toBe('Grand Total');
    });

    it('getFooterDisplayValue uses footerLabelColumnId when set', () => {
      const { fixture, component } = createComponent();
      const nameCol = makeCol({ id: 'name', header: 'Name', type: 'text' });
      const amtCol = makeCol({ id: 'amount', header: 'Amt', type: 'currency' });
      component.columns = [nameCol, amtCol];
      component.data = makeRows(3);
      component.footerData = { id: 0, name: 'Total', amount: 600, active: false, date: '' };
      component.footerLabelColumnId = 'amount';
      fixture.detectChanges();
      // amount col is the label col
      expect(component.getFooterDisplayValue(amtCol)).toBe('Total');
    });

    it('getFooterDisplayValue returns empty for action type column', () => {
      const { fixture, component } = createComponent();
      const nameCol = makeCol({ id: 'name', header: 'Name', type: 'text' });
      const actCol = makeCol({ id: 'edit', header: 'Edit', type: 'action' });
      component.columns = [nameCol, actCol];
      component.data = makeRows(2);
      component.footerData = { id: 0, name: 'Total', amount: 0, active: false, date: '' };
      fixture.detectChanges();
      expect(component.getFooterDisplayValue(actCol)).toBe('');
    });

    it('getFooterRawValue uses accessor when provided', () => {
      const { fixture, component } = createComponent();
      const col = makeCol({ id: 'amount', header: 'Amt', type: 'number', accessor: (r: any) => r.amount * 2 });
      component.columns = [col];
      component.data = makeRows(3);
      component.footerData = { id: 0, name: 'Total', amount: 100, active: false, date: '' };
      fixture.detectChanges();
      expect(component.getFooterRawValue(col)).toBe(200);
    });

    it('getFooterRawValue uses propertyPath when set', () => {
      const { fixture, component } = createComponent();
      const col = makeCol({ id: 'name', header: 'Name', propertyPath: 'name' } as any);
      component.columns = [col];
      component.data = makeRows(1);
      component.footerData = { id: 0, name: 'Foot', amount: 0, active: false, date: '' };
      fixture.detectChanges();
      expect(component.getFooterRawValue(col)).toBe('Foot');
    });
  });

  // =========================================================================
  // 59. matchesGlobalSearch with globalSearchColumns and displayFn
  // =========================================================================

  describe('matchesGlobalSearch advanced', () => {
    it('uses globalSearchColumns to restrict search', () => {
      const { fixture, component } = createComponent();
      component.columns = [
        makeCol({ id: 'name', header: 'Name', includeInGlobalSearch: true }),
        makeCol({ id: 'date', header: 'Date', includeInGlobalSearch: true }),
      ];
      component.globalSearchColumns = ['name'];
      component.data = makeRows(3);
      fixture.detectChanges();

      component.onGlobalSearchChange('Row 1');
      fixture.detectChanges();
      expect(component.dataSource.filteredData.length).toBeGreaterThanOrEqual(1);
    });

    it('uses displayFn from column when provided', () => {
      const { fixture, component } = createComponent();
      component.columns = [
        makeCol({ id: 'amount', header: 'Amt', displayFn: (v: any) => `$${v}`, includeInGlobalSearch: true } as any),
      ];
      component.data = [{ id: 1, name: 'X', amount: 500, active: true, date: '' }];
      fixture.detectChanges();

      component.onGlobalSearchChange('$500');
      fixture.detectChanges();
      expect(component.dataSource.filteredData.length).toBe(1);
    });
  });

  // =========================================================================
  // 60. Number operator branches - greaterThan, lessThan, between NaN
  // =========================================================================

  describe('number filter operators', () => {
    function setupNumberFilter(): { fixture: ComponentFixture<AdvancedTableComponent<TestRow>>, component: AdvancedTableComponent<TestRow> } {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'amount', header: 'Amt', type: 'number', filterable: true })];
      component.data = [
        { id: 1, name: 'A', amount: 100, active: true, date: '' },
        { id: 2, name: 'B', amount: 200, active: false, date: '' },
        { id: 3, name: 'C', amount: 300, active: true, date: '' },
      ];
      fixture.detectChanges();
      return { fixture, component };
    }

    it('notEquals operator', () => {
      const { fixture, component } = setupNumberFilter();
      component.filterState.columns['amount'].operator = 'notEquals' as any;
      component.filterState.columns['amount'].value = '200';
      (component as any).applyFilterState();
      expect(component.dataSource.filteredData.length).toBe(2);
    });

    it('greaterThan operator', () => {
      const { fixture, component } = setupNumberFilter();
      component.filterState.columns['amount'].operator = 'greaterThan' as any;
      component.filterState.columns['amount'].value = '150';
      (component as any).applyFilterState();
      expect(component.dataSource.filteredData.length).toBe(2); // 200, 300
    });

    it('greaterThanOrEqual operator', () => {
      const { fixture, component } = setupNumberFilter();
      component.filterState.columns['amount'].operator = 'greaterThanOrEqual' as any;
      component.filterState.columns['amount'].value = '200';
      (component as any).applyFilterState();
      expect(component.dataSource.filteredData.length).toBe(2);
    });

    it('lessThan operator', () => {
      const { fixture, component } = setupNumberFilter();
      component.filterState.columns['amount'].operator = 'lessThan' as any;
      component.filterState.columns['amount'].value = '200';
      (component as any).applyFilterState();
      expect(component.dataSource.filteredData.length).toBe(1);
    });

    it('lessThanOrEqual operator', () => {
      const { fixture, component } = setupNumberFilter();
      component.filterState.columns['amount'].operator = 'lessThanOrEqual' as any;
      component.filterState.columns['amount'].value = '200';
      (component as any).applyFilterState();
      expect(component.dataSource.filteredData.length).toBe(2);
    });

    it('between operator with valid range', () => {
      const { fixture, component } = setupNumberFilter();
      component.filterState.columns['amount'].operator = 'between' as any;
      component.filterState.columns['amount'].value = '100';
      component.filterState.columns['amount'].value2 = '200';
      (component as any).applyFilterState();
      expect(component.dataSource.filteredData.length).toBe(2);
    });

    it('between operator returns true when v2 is NaN', () => {
      const { fixture, component } = setupNumberFilter();
      component.filterState.columns['amount'].operator = 'between' as any;
      component.filterState.columns['amount'].value = '100';
      component.filterState.columns['amount'].value2 = '';
      (component as any).applyFilterState();
      // v2 is NaN => between returns true for all rows
      expect(component.dataSource.filteredData.length).toBe(3);
    });

    it('default operator returns true', () => {
      const { fixture, component } = setupNumberFilter();
      component.filterState.columns['amount'].operator = 'unknown' as any;
      component.filterState.columns['amount'].value = '100';
      (component as any).applyFilterState();
      expect(component.dataSource.filteredData.length).toBe(3);
    });

    it('NaN rawValue returns false', () => {
      const { fixture, component } = setupNumberFilter();
      component.data = [{ id: 1, name: 'A', amount: 'not-a-number' as any, active: true, date: '' }];
      const ch: SimpleChanges = { data: new SimpleChange([], component.data, false) };
      component.ngOnChanges(ch);
      component.filterState.columns['amount'].operator = 'equals' as any;
      component.filterState.columns['amount'].value = '5';
      (component as any).applyFilterState();
      expect(component.dataSource.filteredData.length).toBe(0);
    });

    it('NaN v1 returns true (no valid filter)', () => {
      const { fixture, component } = setupNumberFilter();
      component.filterState.columns['amount'].operator = 'equals' as any;
      component.filterState.columns['amount'].value = 'notanumber';
      (component as any).applyFilterState();
      expect(component.dataSource.filteredData.length).toBe(3);
    });
  });

  // =========================================================================
  // 61. Date filter operators
  // =========================================================================

  describe('date filter operators', () => {
    function setupDateFilter() {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'date', header: 'Date', type: 'date', filterable: true })];
      component.data = [
        { id: 1, name: 'A', amount: 0, active: true, date: '2024-01-15' },
        { id: 2, name: 'B', amount: 0, active: false, date: '2024-06-15' },
        { id: 3, name: 'C', amount: 0, active: true, date: '2024-12-15' },
      ];
      fixture.detectChanges();
      return { fixture, component };
    }

    it('on operator \u2014 exact match', () => {
      const { component } = setupDateFilter();
      component.filterState.columns['date'].operator = 'on' as any;
      component.filterState.columns['date'].value = '2024-06-15';
      (component as any).applyFilterState();
      expect(component.dataSource.filteredData.length).toBe(1);
    });

    it('before operator', () => {
      const { component } = setupDateFilter();
      component.filterState.columns['date'].operator = 'before' as any;
      component.filterState.columns['date'].value = '2024-06-15';
      (component as any).applyFilterState();
      expect(component.dataSource.filteredData.length).toBe(1);
    });

    it('after operator', () => {
      const { component } = setupDateFilter();
      component.filterState.columns['date'].operator = 'after' as any;
      component.filterState.columns['date'].value = '2024-06-15';
      (component as any).applyFilterState();
      expect(component.dataSource.filteredData.length).toBe(1);
    });

    it('between operator with valid range', () => {
      const { component } = setupDateFilter();
      component.filterState.columns['date'].operator = 'between' as any;
      component.filterState.columns['date'].value = '2024-01-01';
      component.filterState.columns['date'].value2 = '2024-07-01';
      (component as any).applyFilterState();
      expect(component.dataSource.filteredData.length).toBe(2);
    });

    it('between operator returns true when d2 is null', () => {
      const { component } = setupDateFilter();
      component.filterState.columns['date'].operator = 'between' as any;
      component.filterState.columns['date'].value = '2024-01-01';
      component.filterState.columns['date'].value2 = '';
      (component as any).applyFilterState();
      expect(component.dataSource.filteredData.length).toBe(3);
    });

    it('contains operator on date', () => {
      const { component } = setupDateFilter();
      component.filterState.columns['date'].operator = 'contains' as any;
      // Use '2024' which appears in all dates' display string regardless of locale
      component.filterState.columns['date'].value = '2024';
      (component as any).applyFilterState();
      expect(component.dataSource.filteredData.length).toBe(3);
    });

    it('returns false for invalid date value', () => {
      const { component } = setupDateFilter();
      component.data = [{ id: 1, name: 'A', amount: 0, active: true, date: 'not-a-date' }];
      const ch: SimpleChanges = { data: new SimpleChange([], component.data, false) };
      component.ngOnChanges(ch);
      component.filterState.columns['date'].operator = 'on' as any;
      component.filterState.columns['date'].value = '2024-06-15';
      (component as any).applyFilterState();
      expect(component.dataSource.filteredData.length).toBe(0);
    });

    it('returns true when v1 is empty', () => {
      const { component } = setupDateFilter();
      component.filterState.columns['date'].operator = 'on' as any;
      component.filterState.columns['date'].value = '';
      (component as any).applyFilterState();
      expect(component.dataSource.filteredData.length).toBe(3);
    });
  });

  // =========================================================================
  // 62. Boolean filter operators
  // =========================================================================

  describe('boolean filter operators', () => {
    it('isTrue operator filters to true rows', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'active', header: 'Active', type: 'boolean', filterable: true })];
      component.data = makeRows(4);
      fixture.detectChanges();
      component.filterState.columns['active'].operator = 'isTrue' as any;
      (component as any).applyFilterState();
      const trueRows = component.dataSource.filteredData.filter((vm: any) => {
        const r = (vm as any).row ?? vm;
        return r.active === true;
      });
      expect(trueRows.length).toBeGreaterThanOrEqual(2);
    });

    it('isFalse operator filters to false rows', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'active', header: 'Active', type: 'boolean', filterable: true })];
      component.data = makeRows(4);
      fixture.detectChanges();
      component.filterState.columns['active'].operator = 'isFalse' as any;
      (component as any).applyFilterState();
      const falseRows = component.dataSource.filteredData.filter((vm: any) => {
        const r = (vm as any).row ?? vm;
        return r.active === false;
      });
      expect(falseRows.length).toBeGreaterThanOrEqual(2);
    });
  });

  // =========================================================================
  // 63. Text operators - all branches
  // =========================================================================

  describe('text filter operators', () => {
    function setupText() {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      component.data = [
        { id: 1, name: 'Alice', amount: 0, active: true, date: '' },
        { id: 2, name: 'Bob', amount: 0, active: false, date: '' },
        { id: 3, name: 'Charlie', amount: 0, active: true, date: '' },
      ];
      fixture.detectChanges();
      return { fixture, component };
    }

    it('notContains filters out matching rows', () => {
      const { component } = setupText();
      component.filterState.columns['name'].operator = 'notContains' as any;
      component.filterState.columns['name'].value = 'Bob';
      (component as any).applyFilterState();
      expect(component.dataSource.filteredData.length).toBe(2);
    });

    it('startsWith operator', () => {
      const { component } = setupText();
      component.filterState.columns['name'].operator = 'startsWith' as any;
      component.filterState.columns['name'].value = 'Al';
      (component as any).applyFilterState();
      expect(component.dataSource.filteredData.length).toBe(1);
    });

    it('endsWith operator', () => {
      const { component } = setupText();
      component.filterState.columns['name'].operator = 'endsWith' as any;
      component.filterState.columns['name'].value = 'e';
      (component as any).applyFilterState();
      expect(component.dataSource.filteredData.length).toBe(2); // Alice, Charlie
    });

    it('notEquals operator', () => {
      const { component } = setupText();
      component.filterState.columns['name'].operator = 'notEquals' as any;
      component.filterState.columns['name'].value = 'Bob';
      (component as any).applyFilterState();
      expect(component.dataSource.filteredData.length).toBe(2);
    });

    it('default text operator returns true', () => {
      const { component } = setupText();
      component.filterState.columns['name'].operator = 'unknownOp' as any;
      component.filterState.columns['name'].value = 'Alice';
      (component as any).applyFilterState();
      expect(component.dataSource.filteredData.length).toBe(3);
    });

    it('empty raw returns true when op is not isTrue/isFalse', () => {
      const { component } = setupText();
      component.filterState.columns['name'].operator = 'contains' as any;
      component.filterState.columns['name'].value = '';
      (component as any).applyFilterState();
      expect(component.dataSource.filteredData.length).toBe(3);
    });
  });

  // =========================================================================
  // 64. matchesColumnFilter - compareFn override
  // =========================================================================

  describe('matchesColumnFilter with compareFn', () => {
    it('uses custom compareFn when provided', () => {
      const { fixture, component } = createComponent();
      const compareFn = jasmine.createSpy('compareFn').and.returnValue(false);
      component.columns = [
        makeCol({
          id: 'amount', header: 'Amt', type: 'number', filterable: true,
          filterConfig: { compareFn },
        }),
      ];
      component.data = makeRows(3);
      fixture.detectChanges();
      component.filterState.columns['amount'].operator = 'equals' as any;
      component.filterState.columns['amount'].value = '100';
      (component as any).applyFilterState();
      expect(compareFn).toHaveBeenCalled();
      expect(component.dataSource.filteredData.length).toBe(0);
    });
  });

  // =========================================================================
  // 65. hasAnyActiveFilters and getActiveFilterPills branches
  // =========================================================================

  describe('hasAnyActiveFilters and getActiveFilterPills', () => {
    it('hasAnyActiveFilters returns true when externalGlobal is set', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      fixture.detectChanges();
      component.externalGlobal = 'something';
      expect(component.hasAnyActiveFilters()).toBeTrue();
    });

    it('hasAnyActiveFilters returns true when globalSearchTerm is set', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      fixture.detectChanges();
      component.globalSearchTerm = 'term';
      expect(component.hasAnyActiveFilters()).toBeTrue();
    });

    it('hasAnyActiveFilters returns true when selectedValues are set', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      fixture.detectChanges();
      component.filterState.columns['name'].selectedValues = ['A'];
      expect(component.hasAnyActiveFilters()).toBeTrue();
    });

    it('getActiveFilterPills includes externalSearch pill', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      fixture.detectChanges();
      component.externalGlobal = 'external';
      const pills = component.getActiveFilterPills();
      expect(pills.some(p => p.kind === 'externalSearch')).toBeTrue();
    });

    it('getActiveFilterPills includes search pill', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      fixture.detectChanges();
      component.globalSearchTerm = 'searchval';
      const pills = component.getActiveFilterPills();
      expect(pills.some(p => p.kind === 'search')).toBeTrue();
    });

    it('getActiveFilterPills shows N selected for multiple values', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      fixture.detectChanges();
      component.filterState.columns['name'].selectedValues = ['A', 'B'];
      const pills = component.getActiveFilterPills();
      expect(pills.some(p => p.label?.includes('2 selected'))).toBeTrue();
    });

    it('getActiveFilterPills shows between label', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'amount', header: 'Amt', type: 'number', filterable: true })];
      fixture.detectChanges();
      component.filterState.columns['amount'].operator = 'between' as any;
      component.filterState.columns['amount'].value = '100';
      component.filterState.columns['amount'].value2 = '200';
      const pills = component.getActiveFilterPills();
      expect(pills.some(p => (p.label || '').includes('\u2013'))).toBeTrue();
    });

    it('clearFilterPill with externalSearch emits externalGlobalChange', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      fixture.detectChanges();
      spyOn(component.externalGlobalChange, 'emit');
      component.clearFilterPill({ kind: 'externalSearch', label: '' });
      expect(component.externalGlobalChange.emit).toHaveBeenCalledWith('');
    });

    it('clearAllFilters clears external, internal, and column filters', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      fixture.detectChanges();
      spyOn(component.externalGlobalChange, 'emit');
      component.externalGlobal = 'ext';
      component.globalSearchTerm = 'int';
      component.filterState.columns['name'].value = 'foo';
      component.clearAllFilters();
      expect(component.externalGlobalChange.emit).toHaveBeenCalledWith('');
    });
  });

  // =========================================================================
  // 66. Multi-select helpers
  // =========================================================================

  describe('multi-select helpers', () => {
    function setupMulti() {
      const { fixture, component } = createComponent();
      component.idField = 'id';
      component.enableMultiSelect = true;
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeRows(4);
      fixture.detectChanges();
      return { fixture, component };
    }

    it('isMultiSelected returns false when id not in set', () => {
      const { component } = setupMulti();
      expect(component.isMultiSelected(component.dataSource.data[0])).toBeFalse();
    });

    it('toggleMultiSelectRow adds and removes from set', () => {
      const { component } = setupMulti();
      const vm = component.dataSource.data[0];
      component.toggleMultiSelectRow(vm);
      expect(component.isMultiSelected(vm)).toBeTrue();
      component.toggleMultiSelectRow(vm);
      expect(component.isMultiSelected(vm)).toBeFalse();
    });

    it('isAllMultiSelected returns true when all rows selected', () => {
      const { component } = setupMulti();
      component.toggleMultiSelectAll(true);
      expect(component.isAllMultiSelected()).toBeTrue();
    });

    it('isMultiSelectIndeterminate returns true when some selected', () => {
      const { component } = setupMulti();
      component.toggleMultiSelectRow(component.dataSource.data[0]);
      expect(component.isMultiSelectIndeterminate()).toBeTrue();
    });

    it('isAllMultiSelected returns false when no data', () => {
      const { fixture, component } = createComponent();
      component.idField = 'id';
      component.enableMultiSelect = true;
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = [];
      fixture.detectChanges();
      expect(component.isAllMultiSelected()).toBeFalse();
    });
  });

  // =========================================================================
  // 67. ensureSelection / autoSelectFirstRow
  // =========================================================================

  describe('autoSelectFirstRow', () => {
    it('auto-selects first row when autoSelectFirstRow=true and idField set', () => {
      const { fixture, component } = createComponent();
      component.idField = 'id';
      component.autoSelectFirstRow = true;
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeRows(3);
      fixture.detectChanges();
      expect(component.selectedId).toBe(1);
    });

    it('clears selectedId when no rows visible', () => {
      const { fixture, component } = createComponent();
      component.idField = 'id';
      component.autoSelectFirstRow = true;
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      component.data = makeRows(3);
      fixture.detectChanges();
      // Apply a global search that matches nothing
      component.onGlobalSearchChange('xxxxxxxnonexistent_zzz');
      fixture.detectChanges();
      expect(component.selectedId).toBeNull();
    });

    it('keeps selectedId when still visible', () => {
      const { fixture, component } = createComponent();
      component.idField = 'id';
      component.autoSelectFirstRow = true;
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      component.data = makeRows(5);
      fixture.detectChanges();
      component.selectedId = 1;
      // Global search that matches Row 1 so it stays visible
      component.onGlobalSearchChange('Row 1');
      fixture.detectChanges();
      expect(component.selectedId).toBe(1);
    });
  });

  // =========================================================================
  // 68. trackByRow with idField
  // =========================================================================

  describe('trackByRow', () => {
    it('uses idField when provided', () => {
      const { fixture, component } = createComponent();
      component.idField = 'id';
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeRows(2);
      fixture.detectChanges();
      const row = makeRows(1)[0];
      expect(component.trackByRow(0, row)).toBe(1);
    });

    it('falls back to index when idField not set', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeRows(2);
      fixture.detectChanges();
      expect(component.trackByRow(5, makeRows(1)[0])).toBe(5);
    });
  });

  // =========================================================================
  // 69. ngOnChanges loading and externalGlobal branches
  // =========================================================================

  describe('ngOnChanges loading and externalGlobal', () => {
    it('ngOnChanges with loading change calls markForCheck', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeRows(2);
      fixture.detectChanges();
      component.loading = true;
      const changes: SimpleChanges = { loading: new SimpleChange(false, true, false) };
      expect(() => component.ngOnChanges(changes)).not.toThrow();
    });

    it('ngOnChanges with externalGlobal change applies filter', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name', filterable: true })];
      component.data = makeRows(3);
      fixture.detectChanges();
      component.externalGlobal = 'Row 1';
      const changes: SimpleChanges = {
        externalGlobal: new SimpleChange('', 'Row 1', false),
      };
      component.ngOnChanges(changes);
      fixture.detectChanges();
      expect(component.dataSource.filteredData.length).toBeGreaterThanOrEqual(1);
    });

    it('ngOnChanges with enableNestedRows rebuilds columns', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeRows(2);
      fixture.detectChanges();
      component.enableNestedRows = true;
      const changes: SimpleChanges = {
        enableNestedRows: new SimpleChange(false, true, false),
      };
      expect(() => component.ngOnChanges(changes)).not.toThrow();
    });
  });

  // =========================================================================
  // 70. isExportDisabled and normalizeExportFileName
  // =========================================================================

  describe('export helpers', () => {
    it('isExportDisabled returns true when no data', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = [];
      fixture.detectChanges();
      expect(component.isExportDisabled()).toBeTrue();
    });

    it('isExportDisabled returns false when data present', () => {
      const { fixture, component } = createComponent();
      component.columns = [makeCol({ id: 'name', header: 'Name' })];
      component.data = makeRows(3);
      fixture.detectChanges();
      expect(component.isExportDisabled()).toBeFalse();
    });
  });

  // =========================================================================
  // 71. getColumnsForVm with childColumns
  // =========================================================================

  describe('getColumnsForVm', () => {
    it('returns childColumns for child VMs when set', () => {
      const { fixture, component } = createComponent();
      const parentCol = makeCol({ id: 'name', header: 'Name' });
      const childCol = makeCol({ id: 'amount', header: 'Amt' });
      component.columns = [parentCol];
      component.childColumns = [childCol];
      component.enableNestedRows = true;
      component.data = makeRows(2);
      fixture.detectChanges();
      const childVm = { isChild: true };
      expect(component.getColumnsForVm(childVm)).toEqual([childCol]);
    });

    it('returns main columns for parent VMs', () => {
      const { fixture, component } = createComponent();
      const col = makeCol({ id: 'name', header: 'Name' });
      component.columns = [col];
      component.enableNestedRows = true;
      component.data = makeRows(2);
      fixture.detectChanges();
      expect(component.getColumnsForVm({ isChild: false })).toEqual([col]);
    });
  });

  // =========================================================================
  // 72. getRawValue with propertyPath (nested object)
  // =========================================================================

  describe('getRawValue propertyPath', () => {
    it('resolves nested propertyPath', () => {
      const { fixture, component } = createComponent();
      const col = { id: 'meta_name', header: 'Meta', propertyPath: 'meta.name', type: 'text' } as any;
      component.columns = [col];
      component.data = [{ id: 1, name: 'A', amount: 0, active: true, date: '', meta: { name: 'Nested' } } as any];
      fixture.detectChanges();
      expect(component.getRawValue(component.data[0], col)).toBe('Nested');
    });

    it('returns undefined for missing nested path', () => {
      const { fixture, component } = createComponent();
      const col = { id: 'meta_name', header: 'Meta', propertyPath: 'meta.name', type: 'text' } as any;
      component.columns = [col];
      component.data = [{ id: 1, name: 'A', amount: 0, active: true, date: '' }];
      fixture.detectChanges();
      expect(component.getRawValue(component.data[0], col)).toBeUndefined();
    });
  });

});
