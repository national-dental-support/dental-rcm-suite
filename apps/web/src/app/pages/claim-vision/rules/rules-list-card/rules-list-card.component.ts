// src/app/pages/claim-vision/rules/rules-list-card/rules-list-card.component.ts

import {
  Component,
  ChangeDetectionStrategy,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  ChangeDetectorRef,
} from '@angular/core';
import { Rule } from '../../../../core/models/rules.model';

import {
  FilterField,
  FilterDialogConfig,
  FilterDialogResult,
  FilterDialogClose,
} from '../../../../core/models/filter-dialog.model';
import { FilterDialogService } from '../../../../shared/components/filter-dialog/filter-dialog.service';

type SortColumn =
  | 'name'
  | 'category'
  | 'description'
  | 'expiresOn'
  | 'createdLabel'
  | 'modifiedLabel'
  | 'status'
  | 'claimsImpacted';

type SortDirection = 'asc' | 'desc';

@Component({
    selector: 'rp-rules-list-card',
    templateUrl: './rules-list-card.component.html',
    styleUrls: ['./rules-list-card.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class RulesListCardComponent implements OnChanges {
  @Input() title = '';
  @Input() rules: Rule[] = [];
  @Input() allowReorder = false;
  @Input() allowDelete = false;

  @Output() viewDetails = new EventEmitter<Rule>();
  @Output() delete = new EventEmitter<Rule>();
  @Output() reorder = new EventEmitter<Rule[]>();

  confirmDeleteId: string | null = null;

  // Search
  searchTerm = '';

  // Filtered list and paged slice
  filteredRules: Rule[] = [];
  pagedRules: Rule[] = [];

  // Pagination
  pageIndex = 0;
  pageSize = 10;
  pageSizeOptions = [10, 25, 50];
  totalCount = 0;

  // Filters from dialog
  private activeFilters: Record<string, any> | null = null;

  //  NEW: sort state
  sortColumn: SortColumn | null = null;
  sortDirection: SortDirection = 'asc';

  constructor(
    private filterDialog: FilterDialogService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['rules']) {
      this.applyAll();
    }
  }

  // --- footer label ---
  get rangeLabel(): string {
    if (!this.totalCount) return '0 of 0';
    const start = this.pageIndex * this.pageSize + 1;
    const end = Math.min(this.totalCount, (this.pageIndex + 1) * this.pageSize);
    return `${start}\u2013${end} of ${this.totalCount}`;
  }

  // --- search ---
  onSearch(term: string): void {
    this.searchTerm = term ?? '';
    this.pageIndex = 0;
    this.applyAll();
  }

 onSearchInput(event: Event): void {
  const value = (event.target as HTMLInputElement | null)?.value ?? '';
  this.onSearch(value);
}

  // --- FILTER DIALOG (unchanged) ---
  openFilter(): void {
    const config: FilterDialogConfig = {
      title: `${this.title || 'Rules'} Filters`,
      fields: this.buildFilterFields(),
      initial: this.activeFilters ?? {},
      gridColumns: 12,
    };

    this.filterDialog.open(config).subscribe((result: FilterDialogClose) => {
      if (!result) {
        return;
      }

      if (result === 'reset') {
        this.activeFilters = null;
      } else {
        const res = result as FilterDialogResult;
        this.activeFilters = { ...(res.values || {}) };
      }

      this.pageIndex = 0;
      this.applyAll();
    });
  }

  private buildFilterFields(): FilterField[] {
    const categories = this.getDistinctCategories();
    const statuses = this.getDistinctStatuses();

    return [
      {
        key: 'name',
        type: 'text',
        label: 'Rule Name',
        span: 4,
        placeholder: 'Search by rule name',
      },
      {
        key: 'category',
        type: 'multiselect',
        label: 'Category',
        span: 4,
        options: categories.map((c) => ({ value: c, label: c })),
      },
      {
        key: 'status',
        type: 'multiselect',
        label: 'Status',
        span: 4,
        options: statuses.map((s) => ({
          value: s,
          label: s === 'Inactive' ? 'Disabled' : s,
        })),
      },
      {
        key: 'expiresOn',
        type: 'text',
        label: 'Expires On',
        span: 4,
        placeholder: 'Ex: Apr 21, 2025',
      },
      {
        key: 'claimsImpacted',
        type: 'number-range',
        label: 'Claims Impacted',
        span: 4,
      },
      {
        key: 'createdLabel',
        type: 'text',
        label: 'Created',
        span: 4,
        placeholder: 'Date or user',
      },
      {
        key: 'modifiedLabel',
        type: 'text',
        label: 'Modified',
        span: 4,
        placeholder: 'Date or user',
      },
    ];
  }

  private getDistinctCategories(): string[] {
    const set = new Set<string>();
    (this.rules || []).forEach((r) => r.category && set.add(r.category));
    return Array.from(set).sort();
  }

  private getDistinctStatuses(): string[] {
    const set = new Set<string>();
    (this.rules || []).forEach((r) => r.status && set.add(r.status));
    return Array.from(set).sort();
  }

  // --- SORTING ---

  setSort(column: SortColumn): void {
    if (this.sortColumn === column) {
      // toggle direction
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
    this.pageIndex = 0;
    this.applyAll();
  }

  private getSortValue(rule: Rule): string | number | null {
    switch (this.sortColumn) {
      case 'name':
        return rule.name;
      case 'category':
        return rule.category;
      case 'description':
        return rule.description;
      case 'expiresOn':
        return rule.expiresOn ?? '';
      case 'createdLabel':
        return rule.createdLabel;
      case 'modifiedLabel':
        return rule.modifiedLabel;
      case 'status':
        return rule.status;
      case 'claimsImpacted':
        return rule.claimsImpacted ?? 0;
      default:
        return null;
    }
  }

  // --- FILTER + SORT + PAGINATION PIPELINE ---
  private applyAll(): void {
    const base = this.rules || [];
    let out = [...base];

    // 1) SEARCH
   const term = this.searchTerm.trim().toLowerCase();
if (term) {
  const rawTerm = this.searchTerm.trim();
  const numericTerm = Number(rawTerm);
  const hasNumericTerm = !isNaN(numericTerm);

  out = out.filter((r) => {
    const name = (r.name ?? '').toLowerCase();
    const desc = (r.description ?? '').toLowerCase();
    const category = (r.category ?? '').toLowerCase();
    const id = (r.id ?? '').toLowerCase();
    const created = (r.createdLabel ?? '').toLowerCase();
    const modified = (r.modifiedLabel ?? '').toLowerCase();
    const status = (r.status ?? '').toLowerCase();
    const expires = (r.expiresOn ?? '').toLowerCase();

    const textMatch =
      name.includes(term) ||
      desc.includes(term) ||
      category.includes(term) ||
      id.includes(term) ||
      created.includes(term) ||
      modified.includes(term) ||
      status.includes(term) ||
      expires.includes(term);

    const numericMatch =
      hasNumericTerm &&
      String(r.claimsImpacted ?? '').includes(rawTerm);

    return textMatch || numericMatch;
  });
}

    // 2) COLUMN FILTERS
    if (this.activeFilters) {
      out = out.filter((rule) => this.matchesFilters(rule, this.activeFilters!));
    }

    // 3) SORT
    if (this.sortColumn) {
      const dir = this.sortDirection === 'asc' ? 1 : -1;
      out = [...out].sort((a, b) => {
        const av = this.getSortValue(a);
        const bv = this.getSortValue(b);

        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;

        if (typeof av === 'number' && typeof bv === 'number') {
          return (av - bv) * dir;
        }

        const as = String(av).toLowerCase();
        const bs = String(bv).toLowerCase();
        if (as < bs) return -1 * dir;
        if (as > bs) return 1 * dir;
        return 0;
      });
    }

    this.filteredRules = out;
    this.updatePaging();

    this.cdr.markForCheck();
  }

  private normalizeMulti(raw: any): string[] {
    if (!raw) return [];
    const arr = Array.isArray(raw) ? raw : [raw];
    return arr.filter((v) => v && v !== 'all' && v !== '__ALL__');
  }

  private matchesFilters(rule: Rule, filters: Record<string, any>): boolean {
    if (filters.name) {
      const q = String(filters.name).toLowerCase();
      if (!rule.name.toLowerCase().includes(q)) return false;
    }

    const cats = this.normalizeMulti(filters.category);
    if (cats.length > 0 && !cats.includes(rule.category)) return false;

    const statuses = this.normalizeMulti(filters.status);
    if (statuses.length > 0 && !statuses.includes(rule.status)) return false;

    if (filters.expiresOn) {
      const q = String(filters.expiresOn).toLowerCase();
      const label = (rule.expiresOn ?? '\u2014').toLowerCase();
      if (!label.includes(q)) return false;
    }

    const range = filters.claimsImpacted;
    if (range && (range.min != null || range.max != null)) {
      const value = rule.claimsImpacted ?? 0;
      if (range.min != null && value < range.min) return false;
      if (range.max != null && value > range.max) return false;
    }

    if (filters.createdLabel) {
      const q = String(filters.createdLabel).toLowerCase();
      if (!rule.createdLabel.toLowerCase().includes(q)) return false;
    }

    if (filters.modifiedLabel) {
      const q = String(filters.modifiedLabel).toLowerCase();
      if (!rule.modifiedLabel.toLowerCase().includes(q)) return false;
    }

    return true;
  }

  private updatePaging(): void {
    this.totalCount = this.filteredRules.length;

    if (this.totalCount === 0) {
      this.pageIndex = 0;
      this.pagedRules = [];
      return;
    }

    const maxPageIndex = Math.max(0, Math.ceil(this.totalCount / this.pageSize) - 1);
    if (this.pageIndex > maxPageIndex) {
      this.pageIndex = maxPageIndex;
    }

    const start = this.pageIndex * this.pageSize;
    const end = start + this.pageSize;
    this.pagedRules = this.filteredRules.slice(start, end);
  }

  // --- pagination controls ---
  changePageSize(size: number): void {
    this.pageSize = Number(size) || 10;
    this.pageIndex = 0;
    this.updatePaging();
    this.cdr.markForCheck();
  }

  prevPage(): void {
    if (this.pageIndex === 0) return;
    this.pageIndex -= 1;
    this.updatePaging();
    this.cdr.markForCheck();
  }

  nextPage(): void {
    if ((this.pageIndex + 1) * this.pageSize >= this.totalCount) return;
    this.pageIndex += 1;
    this.updatePaging();
    this.cdr.markForCheck();
  }

  get canReorder(): boolean {
    return this.allowReorder && !this.sortColumn && !this.searchTerm && !this.activeFilters;
  }

  isFirst(rule: Rule): boolean {
    return this.filteredRules.indexOf(rule) === 0;
  }

  isLast(rule: Rule): boolean {
    return this.filteredRules.indexOf(rule) === this.filteredRules.length - 1;
  }

  getRulePosition(rule: Rule): number {
    return this.filteredRules.indexOf(rule) + 1;
  }

  moveUp(rule: Rule): void {
    const idx = this.rules.indexOf(rule);
    if (idx <= 0) return;
    const copy = [...this.rules];
    [copy[idx - 1], copy[idx]] = [copy[idx], copy[idx - 1]];
    this.reorder.emit(copy);
  }

  moveDown(rule: Rule): void {
    const idx = this.rules.indexOf(rule);
    if (idx < 0 || idx >= this.rules.length - 1) return;
    const copy = [...this.rules];
    [copy[idx], copy[idx + 1]] = [copy[idx + 1], copy[idx]];
    this.reorder.emit(copy);
  }

  onDeleteClick(rule: Rule): void {
    this.confirmDeleteId = rule.id;
  }

  onDeleteConfirm(rule: Rule): void {
    this.confirmDeleteId = null;
    this.delete.emit(rule);
  }

  onDeleteCancel(): void {
    this.confirmDeleteId = null;
  }

  // --- details button ---
  onViewDetails(rule: Rule): void {
    this.viewDetails.emit(rule);
  }
}
