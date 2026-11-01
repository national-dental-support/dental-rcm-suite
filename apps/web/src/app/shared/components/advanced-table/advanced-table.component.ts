// src/app/shared/components/advanced-table/advanced-table.component.ts

import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ContentChildren,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  QueryList,
  SimpleChanges,
  ViewChild,
  ViewChildren,
} from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { MatSort, Sort } from '@angular/material/sort';
import { Subject, takeUntil } from 'rxjs';

import {
  AdvancedTableColumnConfig,
  ColumnFilterState,
  FilterOperator,
  GroupFilterNode,
  TableFilterState,
  ColumnGroupedValues,
} from './advanced-table.models';
import {
  AdvancedTableCellDirective,
} from './advanced-table-cell.directive';
import { MatMenuTrigger } from '@angular/material/menu';
import ExcelJS from 'exceljs';
import { FloatLabelType } from '@angular/material/form-field';
import { MatPaginator, PageEvent } from '@angular/material/paginator';

type RowVm<X> = {
  row: X;
  level: number;
  isChild: boolean;
  parent?: X;
  key: any; // stable identity for expand/collapse + trackBy
};

type FilterPill =
  | { kind: 'search'; label: string }                 // internal table search
  | { kind: 'externalSearch'; label: string }         // parent-provided search
  | { kind: 'column'; columnId: string; label: string };

@Component({
    selector: 'rp-advanced-table',
    templateUrl: './advanced-table.component.html',
    styleUrls: ['./advanced-table.component.scss'],
    standalone: false
})
export class AdvancedTableComponent<T = any>
implements OnInit, OnChanges, AfterViewInit, OnDestroy
{
     // ===== Inputs =====
  @Input() data: T[] = [];
  @Input() columns: AdvancedTableColumnConfig<T>[] = [];
  @Input() loading = false;
  // flat unique values per column (checkbox filter)
  @Input() uniqueValues: { [columnId: string]: string[] } = {};

  // grouped values per column (Excel-style grouped filters)
  @Input() groupedValues: ColumnGroupedValues = {};

  // global search
  @Input() enableGlobalSearch = true;
  @Input() globalSearchPlaceholder = 'Search table data';
  @Input() globalSearchColumns?: string[];

  // table behavior / look
  @Input() enablePagination = true;
  @Input() pageSize = 10;
  @Input() pageSizeOptions: number[] = [5, 10, 25];
  /** When set (>= 0), pagination is server-driven: paginator uses this for [length] and does NOT bind to dataSource */
  @Input() serverSideTotalCount: number | null = null;
  @Input() enableRowHover = true;       // <-- used in template class binding
  @Input() stickyHeader = false;        // <-- used in template class binding

  // extras
  @Input() defaultSort?: { active: string; direction: 'asc' | 'desc' };
  @Input() initialFilterState?: TableFilterState;

  // if true, advanced table will build its own uniqueValues from data
  @Input() autoGenerateValueLists = false;

  // optional primary key, if you want row identity
  @Input() idField?: string;

  // ===== Nested rows (children) =====
  @Input() enableNestedRows = false;

  // Required if enableNestedRows = true
  @Input() childrenAccessor?: (row: T) => T[];

  // Optional: faster than childrenAccessor(row).length
  @Input() hasChildrenAccessor?: (row: T) => boolean;

  // Optional indent styling
  @Input() childIndentPx = 0;

  // optional: override columns when rendering children rows
  @Input() childColumns?: AdvancedTableColumnConfig<any>[];

  // When true, clicking a row also toggles its expand/collapse (nested mode only)
  @Input() expandOnRowClick = false;

  @Input() rowClassFn?: (row: any) => string | string[] | null | undefined;

  // ===== Footer row (totals) =====
  @Input() footerData?: T | null;          // if provided, render footer
  @Input() footerLabel = 'Total';          // used for the first text column (optional)
  @Input() footerLabelColumnId?: string;   // optionally force which column shows "Total"

  @Input() enableExport = true;
  @Input() exportFileName = 'export.xlsx';
  @Input() exportSheetName = 'Data';
  @Input() exportOnlyVisibleColumns = true; // respects current columns list
  @Input() exportIncludeHierarchyLevel = true; // adds "Level" when nested

  // ===== Selection (controlled by parent) =====
  @Input() selectedId: any = null;                 // e.g. patientAccount
  @Input() autoSelectFirstRow = false;             // optional behavior
  @Output() selectedIdChange = new EventEmitter<any>(); // optional two-way binding

  // ===== Multi-select (checkbox column) =====
  @Input() enableMultiSelect = false;
  @Input() multiSelectedIds: Set<string> = new Set();
  @Output() multiSelectionChange = new EventEmitter<Set<string>>();
  // ===== Outputs =====
  @Output() rowClick = new EventEmitter<T>();
  @Output() filterStateChange = new EventEmitter<TableFilterState>();
  @Output() rowClicked = new EventEmitter<T>();
  @Output() rowDoubleClicked = new EventEmitter<T>();
  @Output() actionClicked = new EventEmitter<{ actionId: string; row: T }>();
  @Output() filterStateChanged = new EventEmitter<TableFilterState>();
  @Input() externalGlobal = '';
  @Output() externalGlobalChange = new EventEmitter<string>();

  @Output() rowExpanded = new EventEmitter<T>();
  @Output() sortChanged = new EventEmitter<{ active: string; direction: 'asc' | 'desc' }>();
  @Output() pageChanged = new EventEmitter<{
    pageIndex: number;
    pageSize: number;
    length: number;
  }>();

  // ---------- View / content refs ----------
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  @ViewChildren(MatMenuTrigger) columnFilterTriggers!: QueryList<MatMenuTrigger>;
  @ContentChildren(AdvancedTableCellDirective)
  cellTemplates!: QueryList<AdvancedTableCellDirective<T>>;

  // ---------- Internal state ----------
  dataSource = new MatTableDataSource<T>([]);
  displayedColumns: string[] = [];

  globalSearchTerm = '';

  filterState: TableFilterState = {
    global: '',
    columns: {},
  };

  private columnMap = new Map<string, AdvancedTableColumnConfig<T>>();
  private cellTemplateMap = new Map<string, AdvancedTableCellDirective<T>>();
  private destroy$ = new Subject<void>();
  private doubleClickTimeout: any;
  private expandedKeys = new Set<any>();
  private flatRows: RowVm<T>[] = [];

  floatLabel: FloatLabelType = 'always';

  constructor(private cdr: ChangeDetectorRef) {}

  // ---------- Lifecycle ----------

  ngOnInit(): void {
    this.setupColumnsMap();
    this.initFilterState();
    this.setupDataSource();
    this.rebuildRenderedColumns();
    this.rebuildValueListsAndGroups();
    this.rebuildFlatRows();
  }

  ngOnChanges(changes: SimpleChanges): void {
  if (!this.childrenAccessor) {
    this.childrenAccessor = (r: any) => (Array.isArray(r?.children) ? r.children : []);
  }

  if (changes['columns'] && this.columns) {
    this.setupColumnsMap();
    this.initFilterState(false);
    this.displayedColumns = this.columns.map((c) => c.id);
    this.rebuildRenderedColumns();
    this.rebuildValueListsAndGroups();
  }

  if (changes['data']) {
    this.rebuildValueListsAndGroups();
    this.rebuildFlatRows();
    this.applyFilterState();
    this.rebuildRenderedColumns();
    this.buildUniqueValues();
    this.ensureSelection();
    this.cdr.markForCheck();
  }

  if (changes['loading']) {
    this.cdr.markForCheck();
  }

  // [ok] ADD THIS
  if (changes['externalGlobal']) {
    this.applyFilterState();
    this.cdr.markForCheck();
  }

  if (changes['enableNestedRows'] || changes['enableMultiSelect']) {
    this.rebuildRenderedColumns();
    this.rebuildFlatRows();
    this.applyFilterState();
  }

  if (changes['initialFilterState'] && this.initialFilterState) {
    this.filterState = JSON.parse(JSON.stringify(this.initialFilterState));
    this.globalSearchTerm = this.filterState.global || '';
    this.applyFilterState();
    this.cdr.markForCheck();
  }
}

  ngAfterViewInit(): void {
   // [ok] Only allow MatTableDataSource sorting for NON-nested tables
  if (!this.enableNestedRows) {
    this.dataSource.sort = this.sort;
  }

  // [ok] Pagination should also be MatTableDataSource-only (non-nested)
  // Skip binding when server-side pagination is active (parent controls page data)
  if (!this.enableNestedRows && this.enablePagination && this.serverSideTotalCount == null) {
    this.dataSource.paginator = this.paginator;
  }


  this.sort.sortChange.pipe(takeUntil(this.destroy$)).subscribe((s) => {
    this.sortChanged.emit({ active: s.active, direction: (s.direction || 'asc') as any });

    // [ok] In nested mode, rebuild the flattened rows using your own sort
    if (this.enableNestedRows) {
      this.rebuildFlatRows();     // will apply current sort (we'll add it below)
      this.applyFilterState();    // keep filters in sync
      this.buildUniqueValues();
      this.cdr.markForCheck();
    }
  });

    if (this.defaultSort) {
      this.sort.active = this.defaultSort.active;
      this.sort.direction = this.defaultSort.direction;
      this.sort.sortChange.emit(this.defaultSort as Sort);
    }

    // this.sort.sortChange.pipe(takeUntil(this.destroy$)).subscribe((s) => {
    //   this.sortChanged.emit({ active: s.active, direction: (s.direction || 'asc') as 'asc' | 'desc' });
    // });

    if (this.cellTemplates) {
      this.buildCellTemplateMap();
      this.cellTemplates.changes
        .pipe(takeUntil(this.destroy$))
        .subscribe(() => this.buildCellTemplateMap());
    }

    this.cdr.markForCheck();
  }

  

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ---------- Setup ----------

  private setupColumnsMap(): void {
    this.columnMap.clear();
    for (const col of this.columns || []) {
      this.columnMap.set(col.id, col);
    }
    this.displayedColumns = this.columns.map((c) => c.id);
    this.rebuildRenderedColumns()
  }

  private initFilterState(useInitial = true): void {
    let base: TableFilterState;

    if (useInitial && this.initialFilterState) {
      // simple deep clone
      base = JSON.parse(JSON.stringify(this.initialFilterState));
    } else {
      base = {
        global: '',
        columns: {},
      };
    }

    for (const col of this.columns) {
      if (!base.columns[col.id]) {
        base.columns[col.id] = {
          operator: null,
          value: '',
          value2: '',
          selectedValues: [],
        };
      }
    }

    this.filterState = base;
    this.globalSearchTerm = this.filterState.global || '';
  }

  private setupDataSource(): void {
  const unwrapRow = (rowAny: any): T => this.unwrapVm(rowAny);

  this.dataSource.data = this.data || []; // will be overwritten by rebuildFlatRows()
  this.buildUniqueValues();

  this.dataSource.filterPredicate = (rowAny: any, filter: string) => {
    // [ok] Nested mode: DO NOT let MatTableDataSource filter individual rows
    // because it breaks parent/child visibility rules.
    if (this.enableNestedRows) return true;

    const row = unwrapRow(rowAny);

    let state: TableFilterState;
    try {
      state = JSON.parse(filter) as TableFilterState;
    } catch {
      const term = (filter || '').toLowerCase();
      return this.matchesGlobalSearch(row, term);
    }

    const globalTerm = (state.global || '').trim().toLowerCase();
    if (globalTerm) {
      if (!this.matchesGlobalSearch(row, globalTerm)) return false;
    }

    for (const [columnId, colState] of Object.entries(state.columns || {})) {
      const column = this.columnMap.get(columnId);
      if (!column || !column.filterable) continue;

      if (!this.matchesColumnFilter(row, column, colState)) return false;
    }

    return true;
  };

  this.dataSource.sortingDataAccessor = (rowAny: any, property: string): any => {
    const row = unwrapRow(rowAny);

    const column = this.columnMap.get(property);
    if (!column) return (row as any)[property];

    if (column.sortAccessor) return column.sortAccessor(row);

    const raw = this.getRawValue(row, column);
    return this.normalizeForSort(raw, column.type);
  };

  this.applyFilterState();
}



  private buildCellTemplateMap(): void {
    this.cellTemplateMap.clear();
    this.cellTemplates.forEach((tpl) => {
      if (tpl.columnId) {
        this.cellTemplateMap.set(tpl.columnId, tpl);
      }
    });
    this.cdr.markForCheck();
  }

  private rebuildValueListsAndGroups(): void {
  // If parent is supplying uniqueValues / groupedValues,
  // don't auto-build or overwrite them.
  if (!this.autoGenerateValueLists) {
    // Ensure they are at least defined objects
    this.uniqueValues = this.uniqueValues || {};
    this.groupedValues = this.groupedValues || {};
    this.cdr.markForCheck();
    return;
  }

  // Auto-generate mode: build from data + filterConfig
  this.uniqueValues = {};
  this.groupedValues = {};

  for (const col of this.columns) {
    const fc = col.filterConfig;
    if (!fc) continue;

    // Flat value list
    if (fc.supportsValueList) {
      if (fc.buildValueList) {
        this.uniqueValues[col.id] = fc.buildValueList(this.data, col);
      } else {
        const set = new Set<string>();
        for (const row of this.data) {
          const raw = this.getRawValue(row, col);
          const display = this.getDisplayValue(row, col, raw);
          if (display !== '') set.add(display);
        }
        this.uniqueValues[col.id] = Array.from(set).sort();
      }
    }

    // Grouped values
    if (fc.supportsGroupValues) {
      if (fc.buildGroupedValues) {
        this.groupedValues[col.id] = fc.buildGroupedValues(this.data, col);
      } else if (fc.groupedValues) {
        this.groupedValues[col.id] = fc.groupedValues;
      }
    }
  }

  this.cdr.markForCheck();
}

  // ---------- Value helpers (public: used in template) ----------

 public getRawValue(rowAny: any, col: AdvancedTableColumnConfig<T>): any {
  const row = this.unwrapVm(rowAny);

  if (col.accessor) return col.accessor(row);

  if (col.propertyPath) {
    return col.propertyPath.split('.').reduce<any>((acc, key) => {
      return acc != null ? acc[key] : undefined;
    }, row as any);
  }

  return (row as any)[col.id];
}

public getDisplayValue(rowAny: any, col: AdvancedTableColumnConfig<T>, rawValue?: any): string {
  const row = this.unwrapVm(rowAny);
  const value = rawValue !== undefined ? rawValue : this.getRawValue(row, col);

  if (col.displayFormatter) return col.displayFormatter(value, row);
  if (value == null) return '';

  switch (col.type) {
    case 'currency': {
      const n = typeof value === 'number' ? value : Number(value);
      if (Number.isNaN(n)) return value?.toString() ?? '';
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
    }
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value);
      if (Number.isNaN(n)) return value?.toString() ?? '';
      return new Intl.NumberFormat('en-US').format(n);
    }
    case 'date': {
      const d = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleDateString();
    }
    case 'boolean':
      return value ? 'Yes' : 'No';
    default:
      return value.toString();
  }
}


  private normalizeForSort(value: any, type: string): any {
    if (value == null) return '';

    switch (type) {
      case 'number':
        return Number(value) || 0;
      case 'date': {
        const d = value instanceof Date ? value : new Date(value);
        return Number.isNaN(d.getTime()) ? 0 : d.getTime();
      }
      case 'boolean':
        return value ? 1 : 0;
      default:
        return value.toString().toLowerCase();
    }
  }

  public hasFooter(): boolean {
  return this.footerData != null;
}

public getFooterRawValue(col: AdvancedTableColumnConfig<T>): any {
  const row = this.footerData as T | null;
  if (!row) return null;

  if (col.accessor) return col.accessor(row);

  if (col.propertyPath) {
    return col.propertyPath.split('.').reduce<any>((acc, key) => {
      return acc != null ? acc[key] : undefined;
    }, row as any);
  }

  return (row as any)[col.id];
}

public getFooterDisplayValue(col: AdvancedTableColumnConfig<T>): string {
  if (!this.footerData) return '';

  // "Total" label injection
  const labelColId =
    this.footerLabelColumnId ||
    this.columns.find(c => c.type === 'text')?.id ||
    this.columns[0]?.id;

  if (col.id === labelColId) {
    return this.footerLabel || 'Total';
  }

  // No footer content for action columns by default
  if (col.type === 'action') return '';

  const raw = this.getFooterRawValue(col);
  return this.getDisplayValue(this.footerData as any, col, raw);
}

  // ---------- Filter logic ----------

  private matchesGlobalSearch(row: T, term: string): boolean {
  if (!term) return true;

  const lowered = term.toLowerCase();
  const colsToSearch =
    this.globalSearchColumns && this.globalSearchColumns.length
      ? this.columns.filter(c => this.globalSearchColumns!.includes(c.id))
      : this.columns.filter(
          c => c.includeInGlobalSearch !== false, // default true if undefined
        );

  const merged = colsToSearch
    .map(col => {
      const raw = this.getRawValue(row, col); // your existing accessor
      const display = col.displayFn
        ? col.displayFn(raw, row)
        : raw != null
          ? raw.toString()
          : '';
      return display.toLowerCase();
    })
    .join(' ');

  return merged.includes(lowered);
}

private getEffectiveGlobal(): string {
  const a = (this.externalGlobal ?? '').trim();
  const b = (this.globalSearchTerm ?? '').trim();
  return [a, b].filter(Boolean).join(' ');
}

private rowMatchesGlobal(row: any, global: string): boolean {
  const terms = global
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  if (!terms.length) return true;

  // Build one searchable string from columns that includeInGlobalSearch
  const haystack = this.columns
    .filter(c => c.includeInGlobalSearch)
    .map(c => String(c.accessor?.(row) ?? ''))
    .join(' ')
    .toLowerCase();

  // AND match
  return terms.every(t => haystack.includes(t));
}

  private matchesColumnFilter(
    row: T,
    column: AdvancedTableColumnConfig<T>,
    state: ColumnFilterState
  ): boolean {
    const cfg = state || {};
    const raw = this.getRawValue(row, column);
    const display = this.getDisplayValue(row, column, raw);

    const selectedValues = cfg.selectedValues || [];
    const hasValueFilter = selectedValues.length > 0;

    // 1) Checkbox / group value list
    if (hasValueFilter) {
      if (!selectedValues.includes(display)) {
        return false;
      }
    }

    const op = (cfg.operator || '').toString();
    const v1 = (cfg.value || '').trim();
    const v2 = (cfg.value2 || '').trim();
    const hasOperator = !!op && (v1 !== '' || op === 'isTrue' || op === 'isFalse');

    if (!hasOperator) return true;

    const filterConfig = column.filterConfig;
    if (filterConfig && filterConfig.compareFn) {
      return filterConfig.compareFn({
        row,
        column,
        state: cfg,
        rawValue: raw,
        displayValue: display,
      });
    }

    switch (column.type) {
      case 'number':
        return this.applyNumberOperator(raw, op as FilterOperator, v1, v2);
      case 'date':
        return this.applyDateOperator(raw, op as FilterOperator, v1, v2, display);
      case 'boolean':
        return this.applyBooleanOperator(raw, op as FilterOperator);
      default:
        return this.applyTextOperator(display, op as FilterOperator, v1);
    }
  }

  private applyTextOperator(
    value: string,
    op: FilterOperator,
    raw: string
  ): boolean {
    value = (value || '').toLowerCase();
    raw = (raw || '').toLowerCase();

    if (!raw && op !== 'isTrue' && op !== 'isFalse') return true;

    switch (op) {
      case 'contains':
        return value.includes(raw);
      case 'notContains':
        return !value.includes(raw);
      case 'startsWith':
        return value.startsWith(raw);
      case 'endsWith':
        return value.endsWith(raw);
      case 'equals':
        return value === raw;
      case 'notEquals':
        return value !== raw;
      default:
        return true;
    }
  }

  private applyNumberOperator(
    rawValue: any,
    op: FilterOperator,
    v1: string,
    v2: string
  ): boolean {
    const num = Number(rawValue);
    if (Number.isNaN(num)) return false;

    const n1 = Number(v1);
    const n2 = v2 !== '' ? Number(v2) : NaN;

    if (Number.isNaN(n1) && op !== 'isTrue' && op !== 'isFalse') return true;

    switch (op) {
      case 'equals':
        return num === n1;
      case 'notEquals':
        return num !== n1;
      case 'greaterThan':
        return num > n1;
      case 'greaterThanOrEqual':
        return num >= n1;
      case 'lessThan':
        return num < n1;
      case 'lessThanOrEqual':
        return num <= n1;
      case 'between':
        if (Number.isNaN(n2)) return true;
        return num >= n1 && num <= n2;
      default:
        return true;
    }
  }

  private applyDateOperator(
    rawValue: any,
    op: FilterOperator,
    v1: string,
    v2: string,
    display: string
  ): boolean {
    // 'contains' is on the display string
    if (op === 'contains') {
      return this.applyTextOperator(display, 'contains', v1);
    }

    const d = rawValue instanceof Date ? rawValue : new Date(rawValue);
    if (Number.isNaN(d.getTime())) return false;

    const d1 = v1 ? new Date(v1) : null;
    const d2 = v2 ? new Date(v2) : null;

    const t = d.setHours(0, 0, 0, 0);
    const t1 = d1 ? d1.setHours(0, 0, 0, 0) : NaN;
    const t2 = d2 ? d2.setHours(0, 0, 0, 0) : NaN;

    if (!v1 || Number.isNaN(t1)) return true;

    switch (op) {
      case 'on':
        return t === t1;
      case 'before':
        return t < t1;
      case 'after':
        return t > t1;
      case 'between':
        if (!d2 || Number.isNaN(t2)) return true;
        return t >= t1 && t <= t2;
      default:
        return true;
    }
  }

  private applyBooleanOperator(rawValue: any, op: FilterOperator): boolean {
    const bool = !!rawValue;
    if (op === 'isTrue') return bool === true;
    if (op === 'isFalse') return bool === false;
    return true;
  }

  // ---------- UI / events ----------

  onGlobalSearchChange(term: string): void {
    this.globalSearchTerm = term;
    this.filterState.global = term;
    this.applyFilterState();
  }

  clearGlobalSearch(): void {
    this.onGlobalSearchChange('');
  }

  onRowClick(rowAny: any): void {
  const row = this.unwrapVm(rowAny);

  // [ok] update selection immediately
  this.setSelectedFromRow(row);

  // Expand/collapse on row click when opted in
  if (this.expandOnRowClick && this.enableNestedRows && this.rowHasChildren(row)) {
    const rowKey = this.getRowKey(row);
    if (this.expandedKeys.has(rowKey)) {
      this.expandedKeys.delete(rowKey);
    } else {
      this.expandedKeys.add(rowKey);
      this.rowExpanded.emit(row);
    }
    this.rebuildFlatRows();
    this.applyFilterState();
    this.cdr.markForCheck();
  }

  // keep existing double-click logic
  if (this.doubleClickTimeout) {
    clearTimeout(this.doubleClickTimeout);
    this.doubleClickTimeout = null;
    this.rowDoubleClicked.emit(row);
    return;
  }

  this.doubleClickTimeout = setTimeout(() => {
    this.rowClicked.emit(row);
    this.doubleClickTimeout = null;
  }, 200);
}


  onActionClick(column: AdvancedTableColumnConfig<T>, row: T, event?: MouseEvent): void {
  if (event) {
    event.stopPropagation(); // don't trigger row click when pressing the button
  }

  const actionId = column.actionId || column.id;
  this.actionClicked.emit({ actionId, row });
}

  onPageChange(event: PageEvent): void {
    this.pageChanged.emit({
      pageIndex: event.pageIndex,
      pageSize: event.pageSize,
      length: event.length,
    });
  }

  // Column filter handlers
  onColumnOperatorChange(colId: string, operator: FilterOperator): void {
    const colState = this.filterState.columns[colId];
    if (!colState) return;
    colState.operator = operator;
    this.applyFilterState();
  }

  onColumnValueChange(colId: string, value: string): void {
    const colState = this.filterState.columns[colId];
    if (!colState) return;
    colState.value = value;
    this.applyFilterState();
  }

  onColumnValue2Change(colId: string, value2: string): void {
    const colState = this.filterState.columns[colId];
    if (!colState) return;
    colState.value2 = value2;
    this.applyFilterState();
  }

  clearColumnFilter(colId: string): void {
    const colState = this.filterState.columns[colId];
    if (!colState) return;
    colState.operator = null;
    colState.value = '';
    colState.value2 = '';
    colState.selectedValues = [];
    this.applyFilterState();
  }

  onValueFilterToggle(colId: string, value: string, checked: boolean): void {
    const colState = this.filterState.columns[colId];
    if (!colState) return;

    const list = colState.selectedValues || [];
    if (checked) {
      if (!list.includes(value)) list.push(value);
    } else {
      const idx = list.indexOf(value);
      if (idx > -1) list.splice(idx, 1);
    }

    colState.selectedValues = [...list];
    this.applyFilterState();
  }

  toggleSelectAllValues(colId: string, checked: boolean): void {
    const colState = this.filterState.columns[colId];
    if (!colState) return;

    if (!checked) {
      colState.selectedValues = [];
    } else {
      const uniques = this.uniqueValues[colId] || [];
      colState.selectedValues = [...uniques];
    }
    this.applyFilterState();
  }

  isAllValuesSelected(colId: string): boolean {
    const uniques = this.uniqueValues[colId] || [];
    const selected = this.filterState.columns[colId]?.selectedValues || [];
    return uniques.length > 0 && selected.length === uniques.length;
  }

  // ---------- Grouped filters ----------

  private flattenNodeToValues(node: GroupFilterNode): string[] {
    if (!node.children || node.children.length === 0) {
      return node.value != null ? [node.value] : [];
    }
    return node.children.reduce<string[]>((acc, child) => {
      acc.push(...this.flattenNodeToValues(child));
      return acc;
    }, []);
  }

  private flattenNodesToValues(nodes: GroupFilterNode[]): string[] {
    return nodes.reduce<string[]>((acc, node) => {
      acc.push(...this.flattenNodeToValues(node));
      return acc;
    }, []);
  }

  onGroupToggle(colId: string, node: GroupFilterNode, checked: boolean): void {
    const valuesFromGroup = this.flattenNodeToValues(node);
    const colState = this.filterState.columns[colId];
    if (!colState) return;

    let selected = [...(colState.selectedValues || [])];

    if (checked) {
      for (const v of valuesFromGroup) {
        if (!selected.includes(v)) selected.push(v);
      }
    } else {
      selected = selected.filter((v) => !valuesFromGroup.includes(v));
    }

    colState.selectedValues = selected;
    this.applyFilterState();
  }

  onLeafToggle(colId: string, value: string, checked: boolean): void {
    this.onValueFilterToggle(colId, value, checked);
  }

  isGroupFullySelected(colId: string, node: GroupFilterNode): boolean {
    const selected = this.filterState.columns[colId]?.selectedValues ?? [];
    const groupValues = this.flattenNodeToValues(node);
    if (groupValues.length === 0) return false;
    return groupValues.every((v) => selected.includes(v));
  }

  isGroupIndeterminate(colId: string, node: GroupFilterNode): boolean {
    const selected = this.filterState.columns[colId]?.selectedValues ?? [];
    const groupValues = this.flattenNodeToValues(node);
    const selectedInGroup = groupValues.filter((v) => selected.includes(v));
    return selectedInGroup.length > 0 && selectedInGroup.length < groupValues.length;
  }

  isLeafSelected(colId: string, value: string): boolean {
    return this.filterState.columns[colId]?.selectedValues?.includes(value) ?? false;
  }

  public getGroupedValues(colId: string): GroupFilterNode[] {
    console.warn("getGroupedValues", colId)
    return this.groupedValues[colId] || [];
  }

  // ---------- Filter state wiring ----------

  private applyFilterState(): void {
  const effective = this.getEffectiveFilterState();

  // [ok] Nested mode: filtering is applied via rebuildFlatRows()
  if (this.enableNestedRows) {
    this.rebuildFlatRows();

    // trigger refresh
    this.dataSource.filter = `${Date.now()}`;
  } else {
    this.dataSource.filter = JSON.stringify(effective);

    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  this.filterStateChanged.emit(JSON.parse(JSON.stringify(this.filterState)));
  this.cdr.markForCheck();
  this.ensureSelection();
}


  // ---------- Template helpers ----------

  public getCellTemplate(columnId: string) {
    return this.cellTemplateMap.get(columnId)?.template;
  }

  public getColumnOperators(col: AdvancedTableColumnConfig<T>): FilterOperator[] {
    if (col.filterConfig?.operators?.length) {
      return col.filterConfig.operators;
    }

    switch (col.type) {
      case 'number':
        return ['equals', 'greaterThan', 'lessThan', 'between'];
      case 'date':
        return ['contains', 'on', 'before', 'after', 'between'];
      case 'boolean':
        return ['isTrue', 'isFalse'];
      case 'action':
        return [];
      default:
        return ['contains', 'notContains', 'startsWith', 'endsWith', 'equals'];
    }
  }

 trackByRow(index: number, row: T): any {
  // If you wired idField as @Input(), prefer that:
  if (this.idField && (row as any)[this.idField] != null) {
    return (row as any)[this.idField as string];
  }
  return index;
}

// --- Group count helpers (for "3/5" pill) ---

  getGroupTotalCount(group: GroupFilterNode): number {
    return this.flattenNodeToValues(group).length;
  }

  getGroupSelectedCount(colId: string, group: GroupFilterNode): number {
    const selected = this.filterState.columns[colId]?.selectedValues ?? [];
    const groupValues = this.flattenNodeToValues(group);
    return groupValues.filter(v => selected.includes(v)).length;
  }

    // Track which groups are expanded per column
  private expandedGroups: { [colId: string]: Set<string> } = {};

  isGroupExpanded(colId: string, group: GroupFilterNode): boolean {
    const set = this.expandedGroups[colId];
    if (!set) {
      // default: expanded
      return true;
    }
    return set.has(group.label);
  }

private getChildren(rowAny: any): T[] {
  if (!this.childrenAccessor) return [];
  const row = this.unwrapVm(rowAny);
  return (this.childrenAccessor(row) as T[]) || [];
}

private rowHasChildren(row: T): boolean {
  if (this.hasChildrenAccessor) return this.hasChildrenAccessor(row);
  return this.getChildren(row).length > 0;
}

private rebuildFlatRows(): void {
  // Non-nested = simple list
  if (!this.enableNestedRows) {
    this.flatRows = (this.data || []).map((r) => ({
      row: r,
      level: 0,
      isChild: false,
      key: this.getRowKey(r),
    }));
    this.dataSource.data = this.flatRows as any;
    return;
  }

  const state = this.getEffectiveFilterState();


  const rowMatches = (r: T): boolean => {
    // Reuse your existing match logic (global + column filters)
    const globalTerm = (state.global || '').trim().toLowerCase();
    if (globalTerm && !this.matchesGlobalSearch(r, globalTerm)) return false;

    for (const [columnId, colState] of Object.entries(state.columns || {})) {
      const column = this.columnMap.get(columnId);
      if (!column || !column.filterable) continue;
      if (!this.matchesColumnFilter(r, column, colState)) return false;
    }

    return true;
  };

  // Sort helper (optional): sort siblings while preserving hierarchy
  const sortSiblings = (rows: T[]): T[] => {
    if (!this.sort?.active || !this.sort.direction) return rows;

    const col = this.columnMap.get(this.sort.active);
    if (!col) return rows;

    const dir = this.sort.direction === 'asc' ? 1 : -1;

    return [...rows].sort((a, b) => {
      const av = this.normalizeForSort(this.getRawValue(a, col), col.type);
      const bv = this.normalizeForSort(this.getRawValue(b, col), col.type);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  };

  const out: RowVm<T>[] = [];

  const walk = (rows: T[], level: number, parent?: T, parentKey?: any): boolean => {
    let anyMatchInThisList = false;

    const siblings = sortSiblings(rows || []);

    for (const r of siblings) {
      const key = this.getRowKey(r, parentKey);
      const kids = this.getChildren(r) || [];

      const selfMatches = rowMatches(r);

      // Recurse to determine if any descendant matches
      let descendantMatches = false;

      // IMPORTANT: we still compute descendantMatches even if not expanded
      // so parents can remain visible when searching
      if (kids.length) {
        descendantMatches = walkProbe(kids, level + 1, r, key, rowMatches);
      }

      const includeThis = !anyFilter || selfMatches || descendantMatches;

      if (includeThis) {
        out.push({
          row: r,
          level,
          isChild: level > 0,
          parent,
          key,
        });

        anyMatchInThisList = true;

        // Only render children when expanded
        if (kids.length && this.expandedKeys.has(key)) {
          walkRender(kids, level + 1, r, key);
        }
      }
    }

    return anyMatchInThisList;
  };

  // "Probe" recursion: checks matches without rendering VMs
  const walkProbe = (
    rows: T[],
    level: number,
    parent: T,
    parentKey: any,
    matchesFn: (r: T) => boolean,
  ): boolean => {
    for (const r of rows || []) {
      const key = this.getRowKey(r, parentKey);
      const kids = this.getChildren(r) || [];
      if (matchesFn(r)) return true;
      if (kids.length && walkProbe(kids, level + 1, r, key, matchesFn)) return true;
    }
    return false;
  };

  const hasAnyFilterApplied = (): boolean => {
  const globalTerm = (state.global || '').trim();
  if (globalTerm) return true;

  for (const colState of Object.values(state.columns || {})) {
    const hasSelectedValues = (colState?.selectedValues?.length ?? 0) > 0;
    const hasOperator =
      !!colState?.operator &&
      ((colState?.value ?? '').toString().trim() !== '' ||
        colState?.operator === 'isTrue' ||
        colState?.operator === 'isFalse');

    if (hasSelectedValues || hasOperator) return true;
  }
  return false;
};

const anyFilter = hasAnyFilterApplied();
  // "Render" recursion: actually append VMs in order
  const walkRender = (rows: T[], level: number, parent: T, parentKey: any) => {
    const siblings = sortSiblings(rows || []);

    for (const r of siblings) {
      const key = this.getRowKey(r, parentKey);
      const kids = this.getChildren(r) || [];

      // Apply same include logic while rendering
      const selfMatches = rowMatches(r);
      const descendantMatches = kids.length ? walkProbe(kids, level + 1, r, key, rowMatches) : false;
      const includeThis = selfMatches || descendantMatches || !state.global;

      if (!includeThis) continue;

      out.push({
        row: r,
        level,
        isChild: true,
        parent,
        key,
      });

      if (kids.length && this.expandedKeys.has(key)) {
        walkRender(kids, level + 1, r, key);
      }
    }
  };

  // Start render from roots
  walk(this.data || [], 0);

  this.flatRows = out;
  this.dataSource.data = this.flatRows as any;

  // Don't let MatTableDataSource reorder hierarchy
  // (keep filterPredicate around for non-nested mode if you want)
};


private getSortedRows(rows: T[]): T[] {
  if (!this.sort?.active || !this.sort.direction) return rows;

  const col = this.columnMap.get(this.sort.active);
  if (!col) return rows;

  const dir = this.sort.direction === 'asc' ? 1 : -1;

  return [...rows].sort((a, b) => {
    const av = this.normalizeForSort(this.getRawValue(a, col), col.type);
    const bv = this.normalizeForSort(this.getRawValue(b, col), col.type);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}

isRowExpanded(vm: RowVm<T>): boolean {
  return this.expandedKeys.has(vm.key);
}

isExpandable(vm: RowVm<T>): boolean {
  return this.rowHasChildren(vm.row);
}

toggleRowExpanded(vm: RowVm<T>, event?: MouseEvent): void {
  if (event) event.stopPropagation();

  if (!this.isExpandable(vm)) return;

  if (this.expandedKeys.has(vm.key)) {
    this.expandedKeys.delete(vm.key);
  } else {
    this.expandedKeys.add(vm.key);
    this.rowExpanded.emit(vm.row);
  }

  this.rebuildFlatRows();
  this.applyFilterState(); // keeps filters applied after expanding/collapsing
  this.cdr.markForCheck();
}

trackByVm = (_: number, vm: RowVm<T>) => vm.key;

  toggleGroupExpanded(colId: string, group: GroupFilterNode): void {
    const label = group.label;
    if (!this.expandedGroups[colId]) {
      this.expandedGroups[colId] = new Set<string>();
    }
    const set = this.expandedGroups[colId];
    if (set.has(label)) {
      set.delete(label);
    } else {
      set.add(label);
    }
  }

  onGroupHeaderClick(colId: string, group: GroupFilterNode, event: MouseEvent): void {
    event.stopPropagation();
    this.toggleGroupExpanded(colId, group);
  }

  closeActiveFilterMenu(): void {
    if (!this.columnFilterTriggers) {
      return;
    }

    this.columnFilterTriggers.forEach(trigger => {
      if (trigger.menuOpen) {
        trigger.closeMenu();
      }
    });
  }

  toggleExpanded(vm: any, event?: MouseEvent) {
  if (event) event.stopPropagation();
  const key = vm.key;
  if (this.expandedKeys.has(key)) this.expandedKeys.delete(key);
  else this.expandedKeys.add(key);

  this.rebuildFlatRows();
  this.applyFilterState();
}

getColumnsForVm(vm: any): AdvancedTableColumnConfig<any>[] {
  if (this.enableNestedRows && vm?.isChild && this.childColumns?.length) {
    return this.childColumns;
  }
  return this.columns;
}

renderedColumns: string[] = [];

private rebuildRenderedColumns(): void {
  const prefix: string[] = [];
  if (this.enableMultiSelect) prefix.push('__select');
  if (this.enableNestedRows) prefix.push('__expand');
  this.renderedColumns = [...prefix, ...this.displayedColumns];
}

private rowMatchesFilters(row: T, state: TableFilterState): boolean {
  const globalTerm = (state.global || '').trim().toLowerCase();
  if (globalTerm && !this.matchesGlobalSearch(row, globalTerm)) return false;

  for (const [columnId, colState] of Object.entries(state.columns || {})) {
    const column = this.columnMap.get(columnId);
    if (!column || !column.filterable) continue;
    if (!this.matchesColumnFilter(row, column, colState)) return false;
  }

  return true;
}

private getRowKey(row: T, parentKey?: any): any {
  // If the consumer provided an idField, use it...
  if (this.idField && (row as any)?.[this.idField] != null) {
    const self = (row as any)[this.idField];
    // ...but still namespace it by parent so ids can repeat under different parents
    return parentKey != null ? `${parentKey}::${self}` : `${self}`;
  }

  // Fallback: object identity (only safe if objects are stable)
  return parentKey != null ? `${parentKey}::${this.objectKey(row)}` : this.objectKey(row);
}

private objectIds = new WeakMap<object, number>();
private objectIdSeq = 1;

private objectKey(row: any): string {
  if (row && typeof row === 'object') {
    let id = this.objectIds.get(row);
    if (!id) {
      id = this.objectIdSeq++;
      this.objectIds.set(row, id);
    }
    return `obj${id}`;
  }
  return String(row);
}

 unwrapVm(rowAny: any): T {
  // We ALWAYS feed RowVm objects to MatTable (even in non-nested mode),
  // so always unwrap when it looks like a VM.
  if (rowAny && typeof rowAny === 'object' && 'row' in rowAny) {
    return (rowAny as any).row as T;
  }
  return rowAny as T;
}


private buildUniqueValues(): void {
  console.log('[advanced-table] uniqueValues keys:', Object.keys(this.uniqueValues || {}), this.uniqueValues);
  const rows: T[] = (this.dataSource.data as any[]).map(vm => (vm?.row ?? vm)) as T[];

  const next: Record<string, string[]> = {};

  for (const col of this.columns) {
    const supportsValueList = col.filterConfig?.supportsValueList ?? col.filterable;
    if (!supportsValueList) continue;

    const values = rows
      .map(r => this.getDisplayValue(r, col, this.getRawValue(r, col))) // IMPORTANT: uses accessor/propertyPath
      .filter(v => v != null && `${v}`.trim() !== '')
      .map(v => `${v}`);

    next[col.id] = Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  }

  this.uniqueValues = next;
}

hasAnyActiveFilters(): boolean {
  if ((this.externalGlobal ?? '').trim()) return true;
  if (this.globalSearchTerm?.trim()) return true;

  const cols = this.filterState?.columns ?? {};
  return Object.keys(cols).some((id) => {
    const c = cols[id];
    const hasText =
      (c?.value != null && String(c.value).trim() !== '') ||
      (c?.value2 != null && String(c.value2).trim() !== '');
    const hasSelections = (c?.selectedValues?.length ?? 0) > 0;
    return hasText || hasSelections;
  });
}


getActiveFilterPills(): FilterPill[] {
  const pills: FilterPill[] = [];

  const external = (this.externalGlobal ?? '').trim();
  if (external) {
    pills.push({ kind: 'externalSearch', label: `Search: ${external}` });
  }

  if (this.globalSearchTerm?.trim()) {
    pills.push({ kind: 'search', label: `Search: ${this.globalSearchTerm.trim()}` });
  }

  const cols = this.filterState?.columns ?? {};
  for (const columnId of Object.keys(cols)) {
    const c = cols[columnId];
    if (!c) continue;

    const colDef = this.columns?.find((x) => x.id === columnId);
    const header = colDef?.header ?? columnId;

    const selected = c.selectedValues ?? [];
    if (selected.length > 0) {
      const label =
        selected.length === 1
          ? `${header}: ${selected[0]}`
          : `${header}: ${selected.length} selected`;
      pills.push({ kind: 'column', columnId, label });
      continue;
    }

    const op = c.operator ?? 'contains';
    const v1 = c.value != null ? String(c.value).trim() : '';
    const v2 = c.value2 != null ? String(c.value2).trim() : '';

    if (v1) {
      const label =
        op === 'between' && v2
          ? `${header}: ${v1}\u2013${v2}`
          : `${header}: ${op} ${v1}`;
      pills.push({ kind: 'column', columnId, label });
    }
  }

  return pills;
}


clearFilterPill(pill: FilterPill): void {
  if (pill.kind === 'externalSearch') {
    this.externalGlobalChange.emit('');
    return;
  }

  if (pill.kind === 'search') {
    this.clearGlobalSearch();
    return;
  }

  this.clearColumnFilter(pill.columnId);
}

clearAllFilters(): void {
  // clear external (parent search)
  if ((this.externalGlobal ?? '').trim()) {
    this.externalGlobalChange.emit('');
  }

  // clear internal table search
  if (this.globalSearchTerm?.trim()) {
    this.clearGlobalSearch();
  }

  // clear column filters
  const cols = this.filterState?.columns ?? {};
  for (const columnId of Object.keys(cols)) {
    this.clearColumnFilter(columnId);
  }
}


isExportDisabled(): boolean {
  const rows = this.getRowsForExport();
  return !rows || rows.length === 0;
}

exportToExcel(): Promise<void> | void {
  const rows = this.getRowsForExport();
  if (!rows.length) return;

  const columns = this.getExportColumns();

  // Build AoA
  const aoa: any[][] = [];

  // Header row
  const headerRow: string[] = [];

  if (this.enableNestedRows && this.exportIncludeHierarchyLevel) {
    headerRow.push('Level');
  }

  for (const col of columns) headerRow.push(col.header);
  aoa.push(headerRow);

  // Data rows
  for (const vm of rows) {
    const row = this.unwrapVm(vm as any);

    const level = (vm as any)?.level ?? 0;

    const outRow: any[] = [];

    if (this.enableNestedRows && this.exportIncludeHierarchyLevel) {
      outRow.push(level);
    }

    for (const col of columns) {
      const raw = this.getRawValue(row as any, col as any);
      const display = this.getDisplayValue(row as any, col as any, raw);

      // Attempt to export numbers as numbers for number/currency columns
      outRow.push(this.coerceExportValue(display, raw, col.type));
    }

    aoa.push(outRow);
  }

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet(this.exportSheetName || 'Data');

  // Add all rows (first row is headers)
  aoa.forEach(r => ws.addRow(r));

  // Set column widths
  headerRow.forEach((h, i) => {
    ws.getColumn(i + 1).width = Math.max(12, Math.min(40, h.length + 4));
  });

  const fileName = this.normalizeExportFileName(this.exportFileName);

  return workbook.xlsx.writeBuffer().then((buffer) => {
    const blob = new Blob([buffer as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    window.URL.revokeObjectURL(url);
  });
}

private normalizeExportFileName(name: string): string {
  const n = (name || 'export.xlsx').trim();
  return n.toLowerCase().endsWith('.xlsx') ? n : `${n}.xlsx`;
}

/**
 * Returns the rows that should be exported.
 * - Non-nested: exports current filtered rows from MatTableDataSource
 * - Nested: exports the currently flattened+filtered visible rows (parents + expanded children)
 */
private getRowsForExport(): any[] {
  if (this.enableNestedRows) {
    // flatRows is already your "visible + filter-respecting" view
    return (this.flatRows || []) as any[];
  }

  // MatTableDataSource stores either raw rows or VMs, but you always unwrap anyway
  return (this.dataSource.filteredData || []) as any[];
}

private getExportColumns(): AdvancedTableColumnConfig<T>[] {
  const cols = (this.columns || []).filter((c) => c.type !== 'action');

  // If you later add "hidden" columns, this respects displayedColumns
  if (!this.exportOnlyVisibleColumns) return cols;

  const visible = new Set(this.displayedColumns || cols.map((c) => c.id));
  return cols.filter((c) => visible.has(c.id));
}

private coerceExportValue(display: string, raw: any, type: string): any {
  // If raw is a number and the column is numeric/currency, export as number
  if ((type === 'number' || type === 'currency') && raw != null && raw !== '') {
    const n = Number(raw);
    if (!Number.isNaN(n)) return n;
  }

  // Dates: export ISO date so Excel recognizes it (or keep display)
  if (type === 'date' && raw) {
    const d = raw instanceof Date ? raw : new Date(raw);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  // Boolean: export true/false
  if (type === 'boolean') return !!raw;

  // Otherwise export display string
  return display ?? '';
}

private getRowId(rowAny: any): any {
  const row = this.unwrapVm(rowAny);
  if (this.idField) return (row as any)?.[this.idField];
  return null;
}

isSelected(rowAny: any): boolean {
  const id = this.getRowId(rowAny);
  return this.selectedId != null && id != null && id === this.selectedId;
}

// ===== Multi-select helpers =====
isMultiSelected(rowAny: any): boolean {
  const id = this.getRowId(rowAny);
  return id != null && this.multiSelectedIds.has(String(id));
}

isAllMultiSelected(): boolean {
  if (!this.dataSource.filteredData?.length) return false;
  return this.dataSource.filteredData.every(vm => {
    const id = this.getRowId(vm);
    return id != null && this.multiSelectedIds.has(String(id));
  });
}

isMultiSelectIndeterminate(): boolean {
  if (!this.dataSource.filteredData?.length) return false;
  const some = this.dataSource.filteredData.some(vm => {
    const id = this.getRowId(vm);
    return id != null && this.multiSelectedIds.has(String(id));
  });
  return some && !this.isAllMultiSelected();
}

toggleMultiSelectRow(rowAny: any): void {
  const id = String(this.getRowId(rowAny));
  const next = new Set(this.multiSelectedIds);
  if (next.has(id)) next.delete(id); else next.add(id);
  this.multiSelectedIds = next;
  this.multiSelectionChange.emit(next);
}

toggleMultiSelectAll(checked: boolean): void {
  const next = new Set(this.multiSelectedIds);
  for (const vm of this.dataSource.filteredData) {
    const id = String(this.getRowId(vm));
    if (id != null) {
      if (checked) next.add(id); else next.delete(id);
    }
  }
  this.multiSelectedIds = next;
  this.multiSelectionChange.emit(next);
}

private ensureSelection(): void {
  if (!this.autoSelectFirstRow) return;
  if (!this.idField) return; // selection needs stable ids

  // Choose the visible rows list (nested vs non-nested)
  const visibleRowsAny: any[] = this.enableNestedRows
    ? (this.flatRows || [])
    : (this.dataSource.filteredData || []);

  if (!visibleRowsAny.length) {
    // nothing visible => clear selection
    if (this.selectedId != null) {
      this.selectedId = null;
      this.selectedIdChange.emit(null);
      this.cdr.markForCheck();
    }
    return;
  }

  // If current selection still exists in visible rows, keep it
  const stillVisible = visibleRowsAny.some(rAny => this.getRowId(rAny) === this.selectedId);
  if (stillVisible) return;

  // Otherwise select the first visible row
  const first = visibleRowsAny[0];
  const firstId = this.getRowId(first);

  this.selectedId = firstId;
  this.selectedIdChange.emit(firstId);

  // IMPORTANT: do NOT emit rowClicked automatically by default
  // Parent can react to selectedIdChange if it wants.
  this.cdr.markForCheck();
}

private setSelectedFromRow(row: T): void {
  if (!this.idField) return;

  const id = (row as any)?.[this.idField];
  if (id == null) return;

  if (this.selectedId !== id) {
    this.selectedId = id;
    this.selectedIdChange.emit(id);
    this.cdr.markForCheck();
  }
}

private getEffectiveFilterState(): TableFilterState {
  const external = (this.externalGlobal ?? '').trim();
  const internal = (this.filterState.global ?? '').trim(); // the table textbox
  const combined = [external, internal].filter(Boolean).join(' ');

  return {
    ...this.filterState,
    global: combined,
  };
}

}
