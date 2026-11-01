import {
  Component,
  Input,
  OnInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { FormControl, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SelectionModel } from '@angular/cdk/collections';

import {
  CatalogService,
  CatalogItem,
  CatalogStatus,
  CatalogType,
  SyncResult,
  AliasItem,
} from '../../../core/services/catalog.service';

import { AdvancedTableColumnConfig } from '../../../shared/components/advanced-table/advanced-table.models';
import { DateUtilService } from '../../../core/services/date-util.service';

@Component({
    selector: 'rp-catalog-management',
    templateUrl: './catalog-management.component.html',
    styleUrls: ['./catalog-management.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class CatalogManagementComponent implements OnInit {
  @Input() type!: CatalogType;
  @Input() label = 'Items';

  // [ok] arrays instead of MatTableDataSource
  pendingItems: CatalogItem[] = [];
  activeItems: CatalogItem[] = [];
  archivedItems: CatalogItem[] = [];
  aliasItems: AliasItem[] = [];

  pendingSelection = new SelectionModel<CatalogItem>(true, []);
  activeSelection = new SelectionModel<CatalogItem>(true, []);

  // [ok] advanced-table column configs
  pendingColumns: AdvancedTableColumnConfig<CatalogItem>[] = [];
  activeColumns: AdvancedTableColumnConfig<CatalogItem>[] = [];
  archivedColumns: AdvancedTableColumnConfig<CatalogItem>[] = [];
  aliasColumns: AdvancedTableColumnConfig<AliasItem>[] = [];

  // Map panel state
  mappingTarget: CatalogItem | null = null;
  showMapPanel = false;

  loading = false;
  syncing = false;
  lastSync: SyncResult | null = null;

  addNameCtrl = new FormControl('', [Validators.required, Validators.minLength(2)]);
  adding = false;

  constructor(
    private catalogSvc: CatalogService,
    private snack: MatSnackBar,
    private cdr: ChangeDetectorRef,
    private dateUtil: DateUtilService,
  ) {}

  ngOnInit(): void {
    this.pendingColumns = this.buildPendingColumns();
    this.activeColumns = this.buildActiveColumns();
    this.archivedColumns = this.buildArchivedColumns();
    this.aliasColumns = this.buildAliasColumns();
    this.loadAll();
  }

  loadAll(): void {
    this.loading = true;
    this.cdr.markForCheck();

    this.catalogSvc.list(this.type).subscribe({
      next: (items) => {
        this.pendingItems = items.filter((i) => i.status === 'pending');
        this.activeItems = items.filter((i) => i.status === 'active');
        this.archivedItems = items.filter((i) => i.status === 'archived');

        this.pendingSelection.clear();
        this.activeSelection.clear();

        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.snack.open(`Failed to load ${this.label.toLowerCase()} catalog`, 'OK', { duration: 3000 });
        this.loading = false;
        this.cdr.markForCheck();
      },
    });

    this.loadAliases();
  }

  loadAliases(): void {
    this.catalogSvc.listAliases(this.type).subscribe({
      next: (aliases) => {
        this.aliasItems = aliases;
        this.cdr.markForCheck();
      },
      error: () => {},
    });
  }

  // -- Map panel ------------------------------------------------------------
  openMapPanel(item: CatalogItem): void {
    this.mappingTarget = item;
    this.showMapPanel = true;
    this.cdr.markForCheck();
  }

  cancelMap(): void {
    this.mappingTarget = null;
    this.showMapPanel = false;
    this.cdr.markForCheck();
  }

  confirmMap(canonical: CatalogItem): void {
    if (!this.mappingTarget) return;
    const dirty = this.mappingTarget;

    this.catalogSvc.mapToCanonical(this.type, dirty.name, canonical.name).subscribe({
      next: () => {
        this.pendingItems = this.pendingItems.filter((i) => i.id !== dirty.id);
        this.mappingTarget = null;
        this.showMapPanel = false;
        this.snack.open(`"${dirty.name}" \u2192 "${canonical.name}" mapped.`, 'OK', { duration: 3000 });
        this.loadAliases();
        this.cdr.markForCheck();
      },
      error: (err) => {
        const msg = err?.error?.message ?? 'Failed to create mapping';
        this.snack.open(msg, 'OK', { duration: 4000 });
      },
    });
  }

  deleteAlias(alias: AliasItem): void {
    this.catalogSvc.deleteAlias(this.type, alias.id).subscribe({
      next: () => {
        this.aliasItems = this.aliasItems.filter((a) => a.id !== alias.id);
        this.snack.open(`Alias removed \u2014 "${alias.dirty_name}" will re-appear in Pending on next sync.`, 'OK', { duration: 4000 });
        this.cdr.markForCheck();
      },
      error: () => this.snack.open('Failed to delete alias', 'OK', { duration: 3000 }),
    });
  }

  // -- Sync ----------------------------------------------------------------
  sync(): void {
    this.syncing = true;
    this.cdr.markForCheck();

    this.catalogSvc.sync(this.type).subscribe({
      next: (result) => {
        this.lastSync = result;
        this.syncing = false;

        const msg =
          result.added > 0
            ? `Sync complete \u2014 ${result.added} new ${this.label.toLowerCase()} added${
                result.isFirstSync ? ' (auto-approved on first sync)' : ' as pending'
              }.`
            : `Sync complete \u2014 no new ${this.label.toLowerCase()} discovered.`;

        this.snack.open(msg, 'OK', { duration: 5000 });
        this.loadAll();
      },
      error: () => {
        this.snack.open('Sync failed', 'OK', { duration: 3000 });
        this.syncing = false;
        this.cdr.markForCheck();
      },
    });
  }

  // -- Single item actions ------------------------------------------------
  approve(item: CatalogItem): void { this.setStatus(item, 'active'); }
  archive(item: CatalogItem): void { this.setStatus(item, 'archived'); }
  restore(item: CatalogItem): void { this.setStatus(item, 'active'); }

  private setStatus(item: CatalogItem, status: CatalogStatus): void {
    this.catalogSvc.updateStatus(this.type, item.id, status).subscribe({
      next: () => {
        item.status = status;
        this.rebalance();
        this.snack.open(`"${item.name}" ${status === 'active' ? 'approved' : status}.`, 'OK', { duration: 2500 });
        this.cdr.markForCheck();
      },
      error: () => this.snack.open('Failed to update status', 'OK', { duration: 3000 }),
    });
  }

  // -- Bulk actions -------------------------------------------------
  approveSelected(): void {
    const ids = this.pendingSelection.selected.map((i) => i.id);
    if (!ids.length) return;

    this.catalogSvc.bulkUpdateStatus(this.type, ids, 'active').subscribe({
      next: () => {
        this.pendingSelection.selected.forEach((i) => (i.status = 'active'));
        this.rebalance();
        this.snack.open(`${ids.length} ${this.label.toLowerCase()} approved.`, 'OK', { duration: 2500 });
        this.cdr.markForCheck();
      },
      error: () => this.snack.open('Bulk approve failed', 'OK', { duration: 3000 }),
    });
  }

  archiveSelected(): void {
    const ids = this.activeSelection.selected.map((i) => i.id);
    if (!ids.length) return;

    this.catalogSvc.bulkUpdateStatus(this.type, ids, 'archived').subscribe({
      next: () => {
        this.activeSelection.selected.forEach((i) => (i.status = 'archived'));
        this.rebalance();
        this.snack.open(`${ids.length} ${this.label.toLowerCase()} archived.`, 'OK', { duration: 2500 });
        this.cdr.markForCheck();
      },
      error: () => this.snack.open('Bulk archive failed', 'OK', { duration: 3000 }),
    });
  }

  approveAllPending(): void {
    const ids = this.pendingItems.map((i) => i.id);
    if (!ids.length) return;

    this.catalogSvc.bulkUpdateStatus(this.type, ids, 'active').subscribe({
      next: () => {
        this.pendingItems.forEach((i) => (i.status = 'active'));
        this.rebalance();
        this.snack.open(`All ${ids.length} pending ${this.label.toLowerCase()} approved.`, 'OK', { duration: 2500 });
        this.cdr.markForCheck();
      },
      error: () => this.snack.open('Approve all failed', 'OK', { duration: 3000 }),
    });
  }

  // -- Manual add ---------------------------------------------------
  addManual(): void {
    if (this.addNameCtrl.invalid) return;
    const name = (this.addNameCtrl.value ?? '').trim();

    this.adding = true;
    this.catalogSvc.addManual(this.type, name).subscribe({
      next: (item) => {
        this.activeItems = [...this.activeItems, item].sort((a, b) => a.name.localeCompare(b.name));
        this.addNameCtrl.reset();
        this.adding = false;
        this.snack.open(`"${item.name}" added as active.`, 'OK', { duration: 2500 });
        this.cdr.markForCheck();
      },
      error: (err) => {
        const msg = err?.error?.message ?? 'Failed to add item';
        this.snack.open(msg, 'OK', { duration: 3000 });
        this.adding = false;
        this.cdr.markForCheck();
      },
    });
  }

  // -- Selection helpers (pending) -----------------------------------
  isAllPendingSelected(): boolean {
    return this.pendingSelection.selected.length === this.pendingItems.length && this.pendingItems.length > 0;
  }

  toggleAllPending(): void {
    this.isAllPendingSelected()
      ? this.pendingSelection.clear()
      : this.pendingSelection.select(...this.pendingItems);
  }

  // -- Selection helpers (active) ------------------------------------
  isAllActiveSelected(): boolean {
    return this.activeSelection.selected.length === this.activeItems.length && this.activeItems.length > 0;
  }

  toggleAllActive(): void {
    this.isAllActiveSelected()
      ? this.activeSelection.clear()
      : this.activeSelection.select(...this.activeItems);
  }

  /** All non-archived items except the current mapping target - used by map panel */
  get mapCandidates(): CatalogItem[] {
    return [...this.activeItems, ...this.pendingItems]
      .filter(i => i.id !== this.mappingTarget?.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // -- Helpers ------------------------------------------------------
  private rebalance(): void {
    const all = [...this.pendingItems, ...this.activeItems, ...this.archivedItems];

    this.pendingItems = all.filter((i) => i.status === 'pending');
    this.activeItems = all.filter((i) => i.status === 'active');
    this.archivedItems = all.filter((i) => i.status === 'archived');

    this.pendingSelection.clear();
    this.activeSelection.clear();
  }

  formatDate(iso: string): string {
    return this.dateUtil.toDisplay(iso);
  }

  get pendingCount(): number { return this.pendingItems.length; }
  get activeCount(): number { return this.activeItems.length; }
  get archivedCount(): number { return this.archivedItems.length; }
  get aliasCount(): number { return this.aliasItems.length; }

  // -- Column configs -----------------------------------------------
  private buildPendingColumns(): AdvancedTableColumnConfig<CatalogItem>[] {
    return [
      { id: 'select', header: '', type: 'custom', sortable: false, filterable: false, includeInGlobalSearch: false, width: '48px' },
      { id: 'name', header: 'Name', type: 'text', sortable: true, filterable: true, filterConfig: { supportsValueList: true }, includeInGlobalSearch: true, accessor: (i) => i.name ?? '', width: '320px' },
      { id: 'source', header: 'Source', type: 'text', sortable: true, filterable: true, filterConfig: { supportsValueList: true }, includeInGlobalSearch: true, accessor: (i) => i.source ?? '', width: '140px' },
      { id: 'created_at', header: 'Discovered', type: 'date', sortable: true, filterable: true, filterConfig: { supportsValueList: true }, includeInGlobalSearch: false,
        accessor: (i) => i.created_at, displayFormatter: (_v, i) => this.formatDate(i.created_at), sortAccessor: (i) => i.created_at ? new Date(i.created_at).getTime() : 0, width: '160px',
      },
      { id: 'actions', header: '', type: 'custom', sortable: false, filterable: false, includeInGlobalSearch: false, align: 'end', width: '220px' },
    ];
  }

  private buildActiveColumns(): AdvancedTableColumnConfig<CatalogItem>[] {
    return [
      { id: 'select', header: '', type: 'custom', sortable: false, filterable: false, includeInGlobalSearch: false, width: '48px' },
      { id: 'name', header: 'Name', type: 'text', sortable: true, filterable: true, filterConfig: { supportsValueList: true }, includeInGlobalSearch: true, accessor: (i) => i.name ?? '', width: '320px' },
      { id: 'source', header: 'Source', type: 'text', sortable: true, filterable: true, filterConfig: { supportsValueList: true }, includeInGlobalSearch: true, accessor: (i) => i.source ?? '', width: '140px' },
      { id: 'created_at', header: 'Added', type: 'date', sortable: true, filterable: true, filterConfig: { supportsValueList: true }, includeInGlobalSearch: false,
        accessor: (i) => i.created_at, displayFormatter: (_v, i) => this.formatDate(i.created_at), sortAccessor: (i) => i.created_at ? new Date(i.created_at).getTime() : 0, width: '160px',
      },
      { id: 'actions', header: '', type: 'custom', sortable: false, filterable: false, includeInGlobalSearch: false, align: 'end', width: '180px' },
    ];
  }

  private buildAliasColumns(): AdvancedTableColumnConfig<AliasItem>[] {
    return [
      { id: 'dirty_name', header: 'Dirty Name (from PMS)', type: 'text', sortable: true, filterable: true, filterConfig: { supportsValueList: true }, includeInGlobalSearch: true, accessor: (i) => i.dirty_name ?? '', width: '280px' },
      { id: 'canonical_name', header: 'Canonical Name', type: 'text', sortable: true, filterable: true, filterConfig: { supportsValueList: true }, includeInGlobalSearch: true, accessor: (i) => i.canonical_name ?? '', width: '280px' },
      { id: 'created_by', header: 'Mapped By', type: 'text', sortable: true, filterable: false, includeInGlobalSearch: false, accessor: (i) => i.created_by ?? '\u2014', width: '180px' },
      { id: 'created_at', header: 'Mapped On', type: 'date', sortable: true, filterable: false, includeInGlobalSearch: false,
        accessor: (i) => i.created_at, displayFormatter: (_v, i) => this.formatDate(i.created_at), sortAccessor: (i) => i.created_at ? new Date(i.created_at).getTime() : 0, width: '140px',
      },
      { id: 'actions', header: '', type: 'custom', sortable: false, filterable: false, includeInGlobalSearch: false, align: 'end', width: '80px' },
    ];
  }

  private buildArchivedColumns(): AdvancedTableColumnConfig<CatalogItem>[] {
    return [
      { id: 'name', header: 'Name', type: 'text', sortable: true, filterable: true, filterConfig: { supportsValueList: true }, includeInGlobalSearch: true, accessor: (i) => i.name ?? '', width: '360px' },
      { id: 'source', header: 'Source', type: 'text', sortable: true, filterable: true, filterConfig: { supportsValueList: true }, includeInGlobalSearch: true, accessor: (i) => i.source ?? '', width: '140px' },
      { id: 'created_at', header: 'Added', type: 'date', sortable: true, filterable: true, filterConfig: { supportsValueList: true }, includeInGlobalSearch: false,
        accessor: (i) => i.created_at, displayFormatter: (_v, i) => this.formatDate(i.created_at), sortAccessor: (i) => i.created_at ? new Date(i.created_at).getTime() : 0, width: '160px',
      },
      { id: 'actions', header: '', type: 'custom', sortable: false, filterable: false, includeInGlobalSearch: false, align: 'end', width: '140px' },
    ];
  }
}
