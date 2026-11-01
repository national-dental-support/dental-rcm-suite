import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, TemplateRef, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, combineLatest, Observable, Subject, switchMap } from 'rxjs';
import { debounceTime, finalize, take, takeUntil } from 'rxjs/operators';

import { MatSnackBar } from '@angular/material/snack-bar';
import { ClaimService, PaginatedResponse } from '../../services/claim.service';
import { ClaimFilterOptions, ClaimFilters, ClaimQueueFilter, ClaimRow } from '../../models/claim.models';
import { DenialIqContextService, DenialIqRole } from '../../services/denialIqRole.service';
import { RpDialogService } from '../../../../shared/components/dialogs/dialog-shell/dialog.service';
import { SocketService } from '../../../../core/services/socket.service';
import { ClaimContextService } from '../../services/claim-context.service';

import { AdvancedTableColumnConfig } from '../../../../shared/components/advanced-table/advanced-table.models';
import ExcelJS from 'exceljs';

type QueueType = 'manager' | 'ar-specialist';
type Tab = 'my' | 'all' | 'escalated' | 'unassigned' | 'pending' | 'awaiting-adjudication' | 'not-submitted';


@Component({
    selector: 'app-claim-queue-list',
    templateUrl: './claim-queue-list.component.html',
    styleUrls: ['./claim-queue-list.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class ClaimQueueListComponent implements OnInit, OnDestroy {
  queueType: QueueType = 'ar-specialist';
  activeTab: Tab = 'my';

  loading$ = new BehaviorSubject<boolean>(false);

  // server rows (raw)
  private rowsRaw$ = new BehaviorSubject<ClaimRow[]>([]);

  // UI state
  showFilters = false;
  filterValue = '';

  // Per-tab filter state - persisted across tab switches
  private filterStateMap = new Map<Tab, ClaimQueueFilter>();

  // Reactive filter stream - emits whenever filters change
  private filters$ = new BehaviorSubject<ClaimQueueFilter>({});
  private _currentFilters: ClaimQueueFilter = {};
  get currentFilters(): ClaimQueueFilter { return this._currentFilters; }
  set currentFilters(v: ClaimQueueFilter) { this._currentFilters = v; this.filters$.next(v); this.cdr?.markForCheck(); }

  get filterOptions(): ClaimFilterOptions {
    const rows = this.rowsRaw$.value;
    const distinct = (vals: (string | undefined | null)[]): string[] =>
      [...new Set(vals.filter((v): v is string => !!v?.trim()))].sort();
    // Merge assignable users into the filter list so the dropdown is populated
    // even when no rows in the current page have an assignedTo value.
    const staffNames = this.assignableUsers.map(u => u.name);
    const allAssignedTo = distinct([...rows.map(r => r.assignedTo), ...staffNames]);
    return {
      assignedTo:      allAssignedTo,
      payer:           distinct(rows.map(r => r.payer)),
      billingProvider: distinct(rows.map(r => r.providerName)),
      denialReason:    distinct(rows.map(r => r.issueCode)),
      placeOfService:  distinct(rows.map(r => r.location)),
      claimStatus:     ['Open', 'Closed', 'Pending', 'Escalated', 'Awaiting Adjustment', 'Not Submitted', 'Adjudicated'],
      escalationReason: ['Underpayment', 'Denial Dispute', 'Timely Filing', 'Medical Necessity', 'Authorization Issue', 'Coding Error', 'Duplicate Claim', 'Other', ...distinct(rows.map(r => r.escalationReason))].filter((v, i, a) => a.indexOf(v) === i),
    };
  }

  // Pagination state (server-side)
  totalCount = 0;
  currentPage = 0;
  currentPageSize = 25;

  // Multi-select state
  selectedClaimIds: Set<string> = new Set();
  bulkLoading = false;

  // Assign-to dialog
  @ViewChild('assignToTmpl') assignToTmpl!: TemplateRef<any>;
  assignableUsers: { id: number; name: string; role: string }[] = [];
  assignTargetUserId: number | null = null;

  // Close reason dialog
  @ViewChild('closeReasonTmpl') closeReasonTmpl!: TemplateRef<any>;
  closeReason = '';

  get specialistUsers() { return this.assignableUsers.filter(u => u.role === 'AR Specialist'); }
  get managerUsers() { return this.assignableUsers.filter(u => u.role === 'Manager' || u.role === 'Super Admin'); }

  // Timely filing alert - server-provided count (all pages); falls back to client-side for tabs that don't return criticalCount
  private _criticalCountFromApi: number | undefined;
  get criticalSlaCount(): number {
    if (this._criticalCountFromApi !== undefined) return this._criticalCountFromApi;
    return this.rowsRaw$.value.filter(
      r => r.SlaStatus === 'OVERDUE' || r.SlaStatus === 'URGENT'
    ).length;
  }

  slaAlertDismissed = false;

  // rows actually rendered (raw + client filters) - reacts to BOTH data AND filter changes
  rowsVm$: Observable<ClaimRow[]> = new Observable((sub) => {
    const s = combineLatest([this.rowsRaw$, this.filters$]).subscribe(
      ([rows, filters]) => sub.next(this.applyClientFilters(rows, filters))
    );
    return () => s.unsubscribe();
  });

  columns: AdvancedTableColumnConfig<ClaimRow>[] = [];

  private destroy$ = new Subject<void>();
  private tabSwitch$ = new Subject<Tab>();
  private searchRefresh$ = new Subject<void>();

  get pageTitle(): string {
    return this.queueType === 'manager' ? 'My Queue' : 'Escalations';
  }

  constructor(
    private svc: ClaimService,
    private router: Router,
    private route: ActivatedRoute,
    private denialCtx: DenialIqContextService,
    private cdr: ChangeDetectorRef,
    private dialog: RpDialogService,
    private socketService: SocketService,
    private snack: MatSnackBar,
    private claimCtx: ClaimContextService,
  ) {}

  ngOnInit(): void {
    // F-19: tab switches route through switchMap to cancel in-flight requests
    this.tabSwitch$
      .pipe(
        switchMap(() => {
          this.loading$.next(true);
          return this.fetchRows().pipe(
            finalize(() => this.loading$.next(false))
          );
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (res) => {
          this.rowsRaw$.next(res.data ?? []);
          this.totalCount = res.totalCount;
          this._criticalCountFromApi = res.criticalCount;
          this.cdr.markForCheck();
        },
        error: () => {
          this.rowsRaw$.next([]);
          this.totalCount = 0;
          this._criticalCountFromApi = undefined;
          this.cdr.markForCheck();
        },
      });

    combineLatest([this.route.data, this.route.queryParamMap])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([data, qpm]) => {
        this.queueType = (data['queueType'] as QueueType) ?? 'ar-specialist';

        // keep denial IQ context in sync
        this.denialCtx.setRole(this.queueType as DenialIqRole);

        // default tab - managers start on Escalated (no manager-specific My Queue endpoint)
        this.activeTab = this.queueType === 'manager' ? 'escalated' : 'my';

        // allow deep-linking via ?tab= query param (reactive - works even when navigating to same route)
        const tabParam = qpm.get('tab') as Tab | null;
        if (tabParam && ['my', 'all', 'escalated', 'unassigned', 'pending'].includes(tabParam)) {
          this.activeTab = tabParam;
        }

        this.columns = this.buildColumns();
        this.cdr.markForCheck();

        this.refresh();
      });

    // Pre-load assignable users so filter dropdown is populated immediately
    this.svc.getAssignableUsers().pipe(take(1)).subscribe({
      next: users => { this.assignableUsers = users; this.cdr.markForCheck(); },
      error: () => {},
    });

    // Live updates via WebSocket - auto-refresh queue on claim events
    this.socketService.onClaimUpdated()
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.refresh());

    // Server-side search: debounce keystrokes then re-fetch from API
    this.searchRefresh$
      .pipe(debounceTime(350), takeUntil(this.destroy$))
      .subscribe(() => { this.currentPage = 0; this.refresh(); });
  }

  /** Filter to SLA-critical claims (OVERDUE + URGENT) - switches to All tab then applies filter once data arrives */
  reviewSlaCritical(): void {
    this.slaAlertDismissed = true;
    if (this.activeTab !== 'all') {
      // Switch to All tab; the filter is applied in the rowsRaw$ subscription after data loads
      this.setTab('all', { slaStatus: 'critical' });
    } else {
      this.currentFilters = { slaStatus: 'critical' };
    }
  }

  setTab(tab: Tab, postSwitchFilter?: ClaimQueueFilter): void {
    if (this.activeTab === tab && !postSwitchFilter) return;

    // Persist current tab's filter state before switching
    this.filterStateMap.set(this.activeTab, { ...this.currentFilters });

    this.activeTab = tab;

    // rebuild columns (e.g. "Assigned To" only on All Claims tab)
    this.columns = this.buildColumns();

    this.currentPage = 0;
    this.clearSelection();

    // Restore saved filter state for the destination tab (or reset if none)
    const saved = this.filterStateMap.get(tab);
    if (saved && Object.keys(saved).length > 0) {
      this.filterValue = saved.search ?? '';
      this.currentFilters = { ...saved };
    } else {
      this.onFilterReset();
    }

    // F-19: emit to tabSwitch$ so switchMap cancels any in-flight request
    this.tabSwitch$.next(tab);

    if (postSwitchFilter) {
      // Apply the requested filter after new tab data arrives
      this.rowsRaw$.pipe(take(2), takeUntil(this.destroy$)).subscribe(() => {
        this.currentFilters = postSwitchFilter;
        this.cdr.markForCheck();
      });
    }
  }

  toggleFilters(): void {
    this.showFilters = !this.showFilters;
  }

  applyFilter(value: string): void {
    this.filterValue = value;

    this.currentFilters = {
      ...this.currentFilters,
      search: value?.trim() ? value : undefined,
    };

    // Trigger debounced server-side re-fetch so search spans all pages, not just current page
    this.searchRefresh$.next();
  }

  onFiltersChange(filters: ClaimQueueFilter): void {
    this.currentFilters = { ...this.currentFilters, ...filters };
    this.currentPage = 0;
  }

  onFilterReset(): void {
    this.currentFilters = {
      search: this.filterValue?.trim() ? this.filterValue : undefined,
    };
  }

  clearOne(key: keyof ClaimQueueFilter): void {
    const clone = { ...this.currentFilters };
    delete clone[key];
    this.currentFilters = clone;
  }

  onClearFilterKey(key: keyof ClaimQueueFilter): void {
    const updated = { ...this.currentFilters };
    delete updated[key];
    this.currentFilters = updated;
    this.currentPage = 0;
  }

  clearAllFilters(): void {
    this.filterValue = '';
    this.currentFilters = {};
  }

  view(row: ClaimRow): void {
    const ordered = this.applyClientFilters(this.rowsRaw$.value, this._currentFilters);
    this.claimCtx.setQueueState({ rows: ordered.map(r => ({ id: r.id, patient: r.patient })) });
    this.router.navigate(['../', row.id], { relativeTo: this.route, state: { patient: row.patient } });
  }

  onAction(event: { actionId: string; row: any }): void {
    if (event.actionId === 'view') {
      this.view(event.row);
    } else if (event.actionId === 'assign-me') {
      this.assignToMe(event.row.id);
    } else if (event.actionId === 'assign-row') {
      this.assignRowTo(event.row.id);
    } else if (event.actionId === 'escalate') {
      this.escalateRow(event.row.id);
    } else if (event.actionId === 'unassign') {
      this.unassignRow(event.row.id);
    }
  }

  assignToMe(claimId: string): void {
    this.svc.assignClaim(claimId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.refresh(),
      error: () => this.cdr.markForCheck(),
    });
  }

  escalateRow(claimId: string): void {
    this.svc.escalateClaim(claimId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.refresh(),
      error: () => this.cdr.markForCheck(),
    });
  }

  unassignRow(claimId: string): void {
    this.svc.unassignClaim(claimId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.refresh(),
      error: () => this.cdr.markForCheck(),
    });
  }

  assignRowTo(claimId: string): void {
    this.assignTargetUserId = null;
    const open = () => {
      this.dialog.openTemplate({
        title: 'Assign Claim',
        template: this.assignToTmpl,
        primaryText: 'Assign',
        icon: 'person_add',
      }).pipe(takeUntil(this.destroy$)).subscribe(result => {
        if (result?.action !== 'primary' || !this.assignTargetUserId) return;
        const targetUserId = this.assignTargetUserId;
        this.svc.bulkReassign([claimId], targetUserId).pipe(takeUntil(this.destroy$)).subscribe({
          next: () => {
            const targetUser = this.assignableUsers.find(u => u.id === targetUserId);
            if (targetUser) {
              this.rowsRaw$.next(
                this.rowsRaw$.value.map(row =>
                  row.id === claimId ? { ...row, assignedTo: targetUser.name } : row
                )
              );
              this.cdr.markForCheck();
            }
            this.refresh();
          },
          error: () => this.cdr.markForCheck(),
        });
      });
    };
    if (this.assignableUsers.length > 0) {
      open();
    } else {
      this.svc.getAssignableUsers().pipe(takeUntil(this.destroy$)).subscribe({
        next: users => { this.assignableUsers = users; open(); },
        error: () => open(),
      });
    }
  }

  onMultiSelectionChange(ids: Set<string>): void {
    this.selectedClaimIds = ids;
    this.cdr.markForCheck();
  }

  clearSelection(): void {
    this.selectedClaimIds = new Set();
    this.cdr.markForCheck();
  }

  bulkAssign(): void {
    const ids = Array.from(this.selectedClaimIds);
    this.dialog.confirm(`Assign ${ids.length} claim(s) to yourself?`, 'Bulk Assign').subscribe(ok => {
      if (!ok) return;
      this.bulkLoading = true;
      this.cdr.markForCheck();
      this.svc.bulkAssign(ids).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.bulkLoading = false;
          this.clearSelection();
          this.refresh();
        },
        error: () => {
          this.bulkLoading = false;
          this.cdr.markForCheck();
        },
      });
    });
  }

  bulkEscalate(): void {
    const ids = Array.from(this.selectedClaimIds);
    this.dialog.confirm(`Escalate ${ids.length} claim(s) to a manager?`, 'Bulk Escalate').subscribe(ok => {
      if (!ok) return;
      this.bulkLoading = true;
      this.cdr.markForCheck();
      this.svc.bulkEscalate(ids).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.bulkLoading = false;
          this.clearSelection();
          this.refresh();
        },
        error: () => {
          this.bulkLoading = false;
          this.cdr.markForCheck();
        },
      });
    });
  }

  bulkClose(): void {
    const ids = Array.from(this.selectedClaimIds);
    this.closeReason = '';

    this.dialog.openTemplate({
      title: `Close ${ids.length} Claim(s)`,
      template: this.closeReasonTmpl,
      primaryText: 'Close Claims',
      primaryColor: 'warn',
      icon: 'check_circle',
      primaryDisabled: () => !this.closeReason,
    }).pipe(takeUntil(this.destroy$)).subscribe(result => {
      if (result?.action !== 'primary' || !this.closeReason) return;
      this.bulkLoading = true;
      this.cdr.markForCheck();
      this.svc.bulkClose(ids, this.closeReason).pipe(takeUntil(this.destroy$)).subscribe({
        next: (res) => {
          this.bulkLoading = false;
          this.clearSelection();
          const msg = res.skipped > 0
            ? `${res.closed} closed, ${res.skipped} already closed`
            : `${res.closed} claim(s) closed`;
          this.snack.open(msg, 'OK', { duration: 3000 });
          this.refresh();
        },
        error: () => {
          this.bulkLoading = false;
          this.cdr.markForCheck();
        },
      });
    });
  }

  bulkUnassign(): void {
    const ids = Array.from(this.selectedClaimIds);
    this.dialog.confirm(`Unassign ${ids.length} claim(s)?`, 'Bulk Unassign').subscribe(ok => {
      if (!ok) return;
      this.bulkLoading = true;
      this.cdr.markForCheck();
      import('rxjs').then(({ forkJoin }) => {
        forkJoin(ids.map(id => this.svc.unassignClaim(id))).pipe(takeUntil(this.destroy$)).subscribe({
          next: () => { this.bulkLoading = false; this.clearSelection(); this.refresh(); },
          error: () => { this.bulkLoading = false; this.cdr.markForCheck(); },
        });
      });
    });
  }

  bulkAssignTo(): void {
    const ids = Array.from(this.selectedClaimIds);
    this.assignTargetUserId = null;

    const open = () => {
      this.dialog.openTemplate({
        title: `Assign ${ids.length} Claim(s) To`,
        template: this.assignToTmpl,
        primaryText: 'Assign',
        icon: 'person_add',
      }).pipe(takeUntil(this.destroy$)).subscribe(result => {
        if (result?.action !== 'primary' || !this.assignTargetUserId) return;
        const targetUserId = this.assignTargetUserId;
        this.bulkLoading = true;
        this.cdr.markForCheck();
        this.svc.bulkReassign(ids, targetUserId).pipe(takeUntil(this.destroy$)).subscribe({
          next: () => {
            this.bulkLoading = false;
            this.clearSelection();
            // Optimistic update: immediately reflect the new assignee so the column
            // updates even if the server re-fetch races with the write.
            const targetUser = this.assignableUsers.find(u => u.id === targetUserId);
            if (targetUser) {
              const idSet = new Set(ids);
              this.rowsRaw$.next(
                this.rowsRaw$.value.map(row =>
                  idSet.has(row.id) ? { ...row, assignedTo: targetUser.name } : row
                )
              );
              this.cdr.markForCheck();
            }
            this.refresh();
          },
          error: () => { this.bulkLoading = false; this.cdr.markForCheck(); },
        });
      });
    };

    if (this.assignableUsers.length > 0) {
      open();
    } else {
      this.svc.getAssignableUsers().pipe(takeUntil(this.destroy$)).subscribe({
        next: users => { this.assignableUsers = users; open(); },
        error: () => open(),
      });
    }
  }

  async exportCsv(): Promise<void> {
    this.bulkLoading = true;
    this.cdr.markForCheck();

    let rows: any[];
    try {
      rows = await this.svc.exportQueueAllRows(this.activeTab, this.filterValue).toPromise() as any[];
    } catch {
      rows = this.rowsRaw$.value;
    }

    this.bulkLoading = false;
    this.cdr.markForCheck();

    if (!rows?.length) return;

    const TAB_LABELS: Record<string, string> = {
      my:         'My Queue',
      escalated:  'Escalated',
      pending:    'Pending',
      unassigned: 'Unassigned',
      all:        'All Claims',
    };

    const toDate = (v: any): Date | '' =>
      v ? new Date(v) : '';

    const toNum = (v: any): number =>
      Number.isFinite(Number(v)) ? Number(v) : 0;

    const exportRows = rows.map((r: any) => ({
      'Claim ID':        r.id ?? '',
      'Account #':       r.accountNumber ?? '',
      'Patient':         r.patient ?? '',
      'Payer':           r.payer ?? '',
      'Date of Service': toDate(r.dateOfService),
      'Submitted':       toDate(r.submittedDate),
      'Charged':         toNum(r.charged),
      'Ins. Balance':    toNum(r.insBalance),
      'Code':            r.issueCode ?? '',
      'Aging Days':      toNum(r.agingDays),
      'Progress %':      toNum(r.progress),
      'Status':          r.status ?? '',
      'SLA Status':      r.SlaStatus ?? '',
    }));

    const workbook = new ExcelJS.Workbook();
    const sheetName = TAB_LABELS[this.activeTab] ?? 'Claims';
    const ws = workbook.addWorksheet(sheetName);

    // Define columns (sets headers + widths)
    ws.columns = [
      { header: 'Claim ID',        key: 'Claim ID',        width: 12 },
      { header: 'Account #',       key: 'Account #',       width: 14 },
      { header: 'Patient',         key: 'Patient',         width: 24 },
      { header: 'Payer',           key: 'Payer',           width: 26 },
      { header: 'Date of Service', key: 'Date of Service', width: 16 },
      { header: 'Submitted',       key: 'Submitted',       width: 14 },
      { header: 'Charged',         key: 'Charged',         width: 14 },
      { header: 'Ins. Balance',    key: 'Ins. Balance',    width: 14 },
      { header: 'Code',            key: 'Code',            width: 10 },
      { header: 'Aging Days',      key: 'Aging Days',      width: 12 },
      { header: 'Progress %',      key: 'Progress %',      width: 12 },
      { header: 'Status',          key: 'Status',          width: 14 },
      { header: 'SLA Status',      key: 'SLA Status',      width: 12 },
    ];

    ws.addRows(exportRows);

    // Number formats on data rows (rows 2+)
    ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
      if (rowNum === 1) return; // skip header
      // E=5 (Date of Service), F=6 (Submitted)
      [5, 6].forEach(c => {
        const cell = row.getCell(c);
        if (cell.value) cell.numFmt = 'mm/dd/yyyy';
      });
      // G=7 (Charged), H=8 (Ins. Balance)
      [7, 8].forEach(c => {
        const cell = row.getCell(c);
        if (cell.value !== null && cell.value !== '') cell.numFmt = '$#,##0.00';
      });
      // J=10 (Aging Days)
      const agingCell = row.getCell(10);
      if (agingCell.value !== null && agingCell.value !== '') agingCell.numFmt = '0';
      // K=11 (Progress %)
      const progCell = row.getCell(11);
      if (progCell.value !== null && progCell.value !== '') progCell.numFmt = '0"%"';
    });

    // Freeze top row
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

    // AutoFilter across all columns
    ws.autoFilter = { from: 'A1', to: 'M1' };

    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `claim-queue-${this.activeTab}-${stamp}.xlsx`;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  autoAssign(): void {
    this.dialog.confirm(
      'Automatically distribute unassigned claims to AR specialists based on queue size?',
      'Auto-Assign Claims'
    ).subscribe(ok => {
      if (!ok) return;
      this.bulkLoading = true;
      this.cdr.markForCheck();
      this.svc.autoAssign().pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.bulkLoading = false;
          this.clearSelection();
          this.refresh();
        },
        error: () => {
          this.bulkLoading = false;
          this.cdr.markForCheck();
        },
      });
    });
  }

  onPageChanged(event: { pageIndex: number; pageSize: number }): void {
    this.currentPage = event.pageIndex;
    this.currentPageSize = event.pageSize;
    this.refresh();
  }

  private refresh(): void {
    this.loading$.next(true);

    this.fetchRows()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.loading$.next(false))
      )
      .subscribe({
        next: (res) => {
          this.rowsRaw$.next(res.data ?? []);
          this.totalCount = res.totalCount;
          // SLA filter is now applied directly in reviewSlaCritical() - no pending state needed
          this.cdr.markForCheck();
        },
        error: () => {
          this.rowsRaw$.next([]);
          this.totalCount = 0;
          this.cdr.markForCheck();
        },
      });
  }

  private fetchRows(): Observable<PaginatedResponse<ClaimRow>> {
    const effectiveFilters: ClaimFilters = {
      search: this.filterValue,
    } as any;
    const p = this.currentPage;
    const ps = this.currentPageSize;

    // Manager endpoints - must be checked before any AR-specialist early-returns
    if (this.queueType === 'manager') {
      if (this.activeTab === 'all')        return this.svc.getManagerAllClaims(effectiveFilters, p, ps);
      if (this.activeTab === 'unassigned') return this.svc.getManagerUnassigned(effectiveFilters, p, ps);
      // escalated, my, pending - all fall back to manager escalations (no AR-specialist endpoints for managers)
      return this.svc.getManagerEscalations(effectiveFilters, p, ps);
    }

    // AR Specialist endpoints
    if (this.activeTab === 'my')      return this.svc.getArMyQueue(effectiveFilters, p, ps);
    if (this.activeTab === 'pending') return this.svc.getArPendingQueue(effectiveFilters, p, ps);

    switch (this.activeTab) {
      case 'all':
        return this.svc.getArAllClaims(effectiveFilters, p, ps);
      case 'escalated':
        return this.svc.getArEscalations(effectiveFilters, p, ps);
      case 'unassigned':
        return this.svc.getArUnassigned(effectiveFilters, p, ps);
      case 'awaiting-adjudication':
        return this.svc.getArAwaitingAdjudication(effectiveFilters, p, ps);
      case 'not-submitted':
        return this.svc.getArNotSubmitted(effectiveFilters, p, ps);
      default:
        return this.svc.getArMyQueue(effectiveFilters, p, ps);
    }
  }

  private buildColumns(): AdvancedTableColumnConfig<ClaimRow>[] {
  const cols: AdvancedTableColumnConfig<ClaimRow>[] = [];

  // AR-specialist-only: Priority
  if (this.queueType === 'ar-specialist') {
    cols.push({
      id: 'priority',
      header: 'Priority',
      type: 'text',
      accessor: (r) => (r as any).priority ?? '',
      sortable: true,
      sortAccessor: (r) => {
        const v = (r as any).priority;
        const n = Number(v);
        return Number.isFinite(n) ? n : (v ?? '').toString().toLowerCase();
      },
      filterable: true,
      filterConfig: {
        supportsValueList: true
      },
      includeInGlobalSearch: true,
      // width: '80px',
    });
  }

  // Denial/CARC code column
  cols.push({
    id: 'code',
    header: 'Code',
    type: 'text',
    accessor: (r) => (r as any).issueCode ?? '',
    tooltip: (r) => (r as any).issueDescription ?? '',
    sortable: true,
    sortAccessor: (r) => ((r as any).issueCode ?? '').toString().toLowerCase(),
    filterable: true,
    filterConfig: { supportsValueList: true },
    includeInGlobalSearch: true,
    // width: '110px',
  });

  cols.push(
    // Patient (rendered via rpCell template for two-line layout)
    {
      id: 'patient',
      header: 'Patient',
      type: 'text',
      accessor: (r) => (r as any).patient ?? '',
      sortable: true,
      sortAccessor: (r) => ((r as any).patient ?? '').toString().toLowerCase(),
      filterable: true,
      filterConfig: { supportsValueList: true },
      includeInGlobalSearch: true,
      // width: '170px',
    },

    // Account Number
    {
      id: 'accountNumber',
      header: 'Acct #',
      type: 'text',
      accessor: (r) => (r as any).accountNumber ?? '',
      sortable: true,
      sortAccessor: (r) => ((r as any).accountNumber ?? '').toString().toLowerCase(),
      filterable: true,
      filterConfig: { supportsValueList: true },
      includeInGlobalSearch: true,
    },

    // Payer
    {
      id: 'payer',
      header: 'Payer',
      type: 'text',
      accessor: (r) => (r as any).payer ?? '',
      sortable: true,
      sortAccessor: (r) => ((r as any).payer ?? '').toString().toLowerCase(),
      filterable: true,
      filterConfig: { supportsValueList: true },
      includeInGlobalSearch: true,
      // width: '150px',
    },

    // Submitted Date
    {
      id: 'submitted',
      header: 'Submitted',
      type: 'date',
      accessor: (r) => (r as any).submittedDate ?? null,
      sortable: true,
      sortAccessor: (r) => {
        const d = (r as any).submittedDate;
        return d ? new Date(d) : null;
      },
      filterable: true,
      filterConfig: { supportsValueList: true },
      includeInGlobalSearch: false,
      // width: '110px',
    },

    // Date of Service
    {
      id: 'dateOfService',
      header: 'DOS',
      type: 'date',
      accessor: (r) => (r as any).dateOfService ?? null,
      sortable: true,
      sortAccessor: (r) => {
        const d = (r as any).dateOfService;
        return d ? new Date(d) : null;
      },
      filterable: true,
      includeInGlobalSearch: false,
    },

    // Charged
    {
      id: 'charged',
      header: 'Charged',
      type: 'currency',
      accessor: (r) => (r as any).charged ?? 0,
      sortable: true,
      sortAccessor: (r) => Number((r as any).charged ?? 0),
      filterable: true,
      includeInGlobalSearch: false,
      align: 'end',
      // width: '100px',
    },

    // Ins. Balance
    {
      id: 'insBalance',
      header: 'Ins. Bal.',
      type: 'currency',
      accessor: (r) => (r as any).insBalance ?? 0,
      sortable: true,
      sortAccessor: (r) => Number((r as any).insBalance ?? 0),
      filterable: true,
      includeInGlobalSearch: false,
      align: 'end',
      // width: '100px',
    },

    // Aging (rendered via rpCell template with the pill)
    {
      id: 'aging',
      header: 'Aging',
      type: 'number',
      accessor: (r) => (r as any).agingDays ?? 0,
      sortable: true,
      sortAccessor: (r) => Number((r as any).agingDays ?? 0),
      filterable: true,
      includeInGlobalSearch: false,
      // width: '80px',
    },

    // Progress
    {
      id: 'progress',
      header: 'Progress',
      type: 'number',
      accessor: (r) => {
        const status = ((r as any).status ?? '').toLowerCase();
        const progress = (r as any).progress ?? 0;
        if (status === 'open' && progress === 100) return 0;
        return progress;
      },
      sortable: true,
      sortAccessor: (r) => Number((r as any).progress ?? 0),
      filterable: true,
      includeInGlobalSearch: false,
      // width: '120px',
    },

    // Claim Status
    {
      id: 'claimStatusBadge',
      header: 'Status',
      type: 'text',
      accessor: (r) => (r as any).status ?? '',
      sortable: true,
      sortAccessor: (r) => ((r as any).status ?? '').toString().toLowerCase(),
      filterable: true,
      filterConfig: { supportsValueList: true },
      includeInGlobalSearch: true,
    },

    // SLA Status - only show OVERDUE/URGENT if claim is actually assigned
    {
      id: 'slaStatusBadge',
      header: 'SLA',
      type: 'text',
      accessor: (r) => {
        const sla = (r as any).SlaStatus ?? '';
        const assigned = (r as any).assignedTo;
        if ((sla === 'OVERDUE' || sla === 'URGENT') && !assigned) return 'OK';
        return sla;
      },
      sortable: true,
      sortAccessor: (r) => ((r as any).SlaStatus ?? '').toString().toLowerCase(),
      filterable: true,
      filterConfig: { supportsValueList: true },
      includeInGlobalSearch: false,
    },

    // Assigned To (only on All Claims tab)
    ...(this.activeTab === 'all' ? [{
      id: 'assignedTo',
      header: 'Assigned To',
      type: 'text' as const,
      accessor: (r: ClaimRow) => (r as any).assignedTo ?? 'Unassigned',
      sortable: true,
      sortAccessor: (r: ClaimRow) => ((r as any).assignedTo ?? '').toString().toLowerCase(),
      filterable: true,
      filterConfig: { supportsValueList: true },
      includeInGlobalSearch: true,
    }] : []),

    // Escalation Reason (only on Escalated tab)
    ...(this.activeTab === 'escalated' ? [{
      id: 'escalationReason',
      header: 'Escalation Reason',
      type: 'text' as const,
      accessor: (r: ClaimRow) => (r as any).escalationReason ?? '\u2014',
      tooltip: (r: ClaimRow) => (r as any).escalationReason ?? '',
      sortable: true,
      sortAccessor: (r: ClaimRow) => ((r as any).escalationReason ?? '').toString().toLowerCase(),
      filterable: true,
      filterConfig: { supportsValueList: true },
      includeInGlobalSearch: true,
    }] : []),

    // Per-row Assign
    {
      id: 'assignRow',
      header: '',
      type: 'action',
      buttonLabel: 'ASSIGN',
      actionId: 'assign-row',
      align: 'end',
      sortable: false,
      filterable: false,
      includeInGlobalSearch: false,
    },

    // View
    {
      id: 'viewClaim',
      header: '',
      type: 'action',
      buttonLabel: 'VIEW',
      actionId: 'view',
      align: 'end',
      sortable: false,
      filterable: false,
      filterConfig: { supportsValueList: true },
      includeInGlobalSearch: false,
      // width: '90px',
    }
  );

  return cols;
}

  private applyClientFilters(rows: ClaimRow[], f: ClaimQueueFilter): ClaimRow[] {
    if (!rows?.length) return [];

    const term = f.search?.trim().toLowerCase();

    return rows.filter((row: any) => {
      if (term) {
        const matches =
          row.patient?.toLowerCase().includes(term) ||
          row.payer?.toLowerCase().includes(term) ||
          row.issueCode?.toLowerCase().includes(term) ||
          row.id?.toString().toLowerCase().includes(term) ||
          row.accountNumber?.toLowerCase().includes(term) ||
          (row as any).assignedTo?.toLowerCase().includes(term) ||
          (row as any).providerName?.toLowerCase().includes(term) ||
          (row as any).location?.toLowerCase().includes(term) ||
          row.status?.toLowerCase().includes(term) ||
          (row as any).escalationReason?.toLowerCase().includes(term);
        if (!matches) return false;
      }

      if (f.patient && !row.patient?.toLowerCase().includes(f.patient.toLowerCase())) return false;
      if (f.claimId && !row.id?.toString().toLowerCase().includes(f.claimId.toLowerCase())) return false;
      if (f.payer && !row.payer?.toLowerCase().includes(String(f.payer).toLowerCase())) return false;

      if (f.issueCode && !row.issueCode?.toLowerCase().includes(f.issueCode.toLowerCase())) return false;

      if (f.priority && row.priority != null) {
        if (!row.priority.toString().toLowerCase().includes(f.priority.toLowerCase())) return false;
      }

      if (f.submittedFrom || f.submittedTo) {
        const rowDate = new Date(row.submittedDate);
        if (f.submittedFrom && rowDate < new Date(f.submittedFrom)) return false;
        if (f.submittedTo && rowDate > new Date(f.submittedTo)) return false;
      }

      if (f.minCharged != null && row.charged < f.minCharged) return false;
      if (f.maxCharged != null && row.charged > f.maxCharged) return false;

      if (f.minInsBalance != null && row.insBalance < f.minInsBalance) return false;
      if (f.maxInsBalance != null && row.insBalance > f.maxInsBalance) return false;

      if (f.minAging != null && row.agingDays < f.minAging) return false;
      if (f.maxAging != null && row.agingDays > f.maxAging) return false;

      const progress = row.progress ?? 0;
      if (f.minProgress != null && progress < f.minProgress) return false;
      if (f.maxProgress != null && progress > f.maxProgress) return false;

      if (f.slaStatus === 'critical') {
        if (row.SlaStatus !== 'OVERDUE' && row.SlaStatus !== 'URGENT') return false;
      } else if (f.slaStatus) {
        if (row.SlaStatus !== f.slaStatus) return false;
      }

      // Assigned-to filter
      if (f.assignedTo) {
        const assigned = (row as any).assignedTo ?? '';
        const filterVal = f.assignedTo.toLowerCase();
        if (filterVal === 'unassigned') {
          if (assigned && assigned !== 'Unassigned') return false;
        } else {
          if (!assigned.toLowerCase().includes(filterVal)) return false;
        }
      }

      // Billing provider filter
      if (f.billingProvider) {
        const provider = (row as any).providerName ?? '';
        if (!provider.toLowerCase().includes(f.billingProvider.toLowerCase())) return false;
      }

      // Location filter
      if (f.placeOfService) {
        const loc = (row as any).location ?? '';
        if (!loc.toLowerCase().includes(f.placeOfService.toLowerCase())) return false;
      }

      // Claim status filter
      if (f.claimStatus) {
        const status = (row as any).claimStatus ?? (row as any).status ?? '';
        if (!status.toLowerCase().includes(f.claimStatus.toLowerCase())) return false;
      }

      // Denial reason filter
      if (f.denialReason) {
        const code = row.issueCode ?? '';
        if (!code.toLowerCase().includes(f.denialReason.toLowerCase())) return false;
      }

      // Escalation reason filter
      if (f.escalationReason) {
        const reason = (row as any).escalationReason ?? '';
        if (!reason.toLowerCase().includes(f.escalationReason.toLowerCase())) return false;
      }

      return true;
    });
  }

  effectiveProgress(row: any): number {
    const p = row.progress ?? 0;
    // A claim with no steps assigned returns 100 from 0/0 math - cap it to 0 when unassigned
    if (p === 100 && !row.assignedTo) return 0;
    return p;
  }

  slaBadgeClass(slaStatus: string): string {
    switch ((slaStatus ?? '').toUpperCase()) {
      case 'OVERDUE': return 'sla-badge sla-badge--overdue';
      case 'URGENT':  return 'sla-badge sla-badge--urgent';
      default:        return 'sla-badge sla-badge--ok';
    }
  }

  claimStatusClass(status: string): string {
    switch ((status ?? '').toLowerCase().replace(/\s+/g, '')) {
      case 'open':        return 'status-chip status-diq-open';
      case 'inprogress':  return 'status-chip status-diq-inprogress';
      case 'escalated':   return 'status-chip status-diq-escalated';
      case 'pending':     return 'status-chip status-diq-pending';
      case 'closed':      return 'status-chip status-diq-closed';
      case 'adjudicated': return 'status-chip status-diq-adjudicated';
      default:            return 'status-chip status-diq-open';
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.tabSwitch$.complete();
  }
}
