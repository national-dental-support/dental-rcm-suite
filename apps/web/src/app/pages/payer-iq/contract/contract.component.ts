import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { FormControl } from '@angular/forms';
import {
  BehaviorSubject,
  combineLatest,
  Observable,
  of,
  Subject,
} from 'rxjs';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  finalize,
  shareReplay,
  startWith,
  switchMap,
  takeUntil,
  tap,
} from 'rxjs/operators';
import { ContractService } from './contract.service';

@Component({
  selector: 'rp-payer-iq-contract',
  templateUrl: './contract.component.html',
  styleUrls: ['./contract.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class ContractComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  // -- Loading flags ----------------------------------------------------------
  loadingContracts   = false;
  loadingArbitrage   = false;
  loadingFeeSchedule = false;
  loadingSummary     = false;
  errorContracts     = '';
  errorArbitrage     = '';
  errorFeeSchedule   = '';

  // -- Summary KPIs ----------------------------------------------------------
  summary: any = {};

  // -- Tab 1: Contract Portfolio ---------------------------------------------
  contracts: any[] = [];
  contractColumns = ['PayerName', 'ContractDisplayName', 'NetworkKey', 'FeeScheduleCount', 'ClaimsLast90d', 'AvgPaymentAmt', 'Status'];
  expandedContractId: number | null = null;
  routingPaths: any[] = [];
  loadingRoutingPaths = false;

  // -- Tab 2: Routing Arbitrage -----------------------------------------------
  cptFilterCtrl = new FormControl<string>('');
  arbitrageData: any[] = [];

  // -- Tab 3: Fee Schedule Explorer ------------------------------------------
  contractSelectorCtrl = new FormControl<number | null>(null);
  feeScheduleData: any[] = [];
  feeScheduleColumns = ['ProcedureCode', 'ServiceCode', 'ContractedRate', 'EffectiveDate'];

  constructor(
    private contractService: ContractService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadSummary();
    this.loadContracts();
    this.wireArbitrageFilter();
    this.wireFeeScheduleSelector();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // -- Summary ----------------------------------------------------------------
  private loadSummary(): void {
    this.loadingSummary = true;
    this.contractService
      .getSavingsSummary(90)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingSummary = false;
          this.cdr.markForCheck();
        }),
        catchError(() => of({})),
      )
      .subscribe(data => {
        this.summary = data;
        this.cdr.markForCheck();
      });
  }

  // -- Tab 1 ------------------------------------------------------------------
  private loadContracts(): void {
    this.loadingContracts = true;
    this.errorContracts   = '';
    this.cdr.markForCheck();

    this.contractService
      .getContracts()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingContracts = false;
          this.cdr.markForCheck();
        }),
        catchError(err => {
          this.errorContracts = 'Failed to load contracts.';
          return of([]);
        }),
      )
      .subscribe(data => {
        this.contracts = data;
        this.cdr.markForCheck();
      });
  }

  toggleContractRow(contractId: number): void {
    if (this.expandedContractId === contractId) {
      this.expandedContractId = null;
      this.routingPaths = [];
      this.cdr.markForCheck();
      return;
    }
    this.expandedContractId = contractId;
    this.routingPaths       = [];
    this.loadingRoutingPaths = true;
    this.cdr.markForCheck();

    this.contractService
      .getRoutingPaths(contractId)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingRoutingPaths = false;
          this.cdr.markForCheck();
        }),
        catchError(() => of([])),
      )
      .subscribe(paths => {
        this.routingPaths = paths;
        this.cdr.markForCheck();
      });
  }

  isExpanded(contractId: number): boolean {
    return this.expandedContractId === contractId;
  }

  contractStatus(row: any): string {
    if (!row.ExpirationDate) return 'Active';
    const exp = new Date(row.ExpirationDate);
    const now = new Date();
    if (exp < now) return 'Expired';
    const soon = new Date();
    soon.setDate(soon.getDate() + 90);
    if (exp <= soon) return 'Expiring Soon';
    return 'Active';
  }

  // -- Tab 2 ------------------------------------------------------------------
  private wireArbitrageFilter(): void {
    this.cptFilterCtrl.valueChanges.pipe(
      startWith(''),
      debounceTime(400),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
      tap(() => {
        this.loadingArbitrage = true;
        this.errorArbitrage   = '';
        this.cdr.markForCheck();
      }),
      switchMap(cpt =>
        this.contractService.getRoutingArbitrage(cpt ?? '').pipe(
          catchError(err => {
            this.errorArbitrage = 'Failed to load arbitrage data.';
            return of([]);
          }),
          finalize(() => {
            this.loadingArbitrage = false;
            this.cdr.markForCheck();
          }),
        ),
      ),
    ).subscribe(data => {
      this.arbitrageData = data;
      this.cdr.markForCheck();
    });
  }

  get opportunityCount(): number {
    return this.arbitrageData.filter(r => r.opportunityExists).length;
  }

  get totalOpportunityValue(): number {
    return this.arbitrageData
      .filter(r => r.opportunityExists)
      .reduce((sum, r) => sum + (r.arbitrageSpread * (r.optimalRoute?.ClaimVolume || 1)), 0);
  }

  // -- Tab 3 ------------------------------------------------------------------
  private wireFeeScheduleSelector(): void {
    this.contractSelectorCtrl.valueChanges.pipe(
      takeUntil(this.destroy$),
      tap(() => {
        this.loadingFeeSchedule = true;
        this.errorFeeSchedule   = '';
        this.feeScheduleData    = [];
        this.cdr.markForCheck();
      }),
      switchMap(id => {
        if (!id) return of([]);
        return this.contractService.getFeeSchedule(id).pipe(
          catchError(err => {
            this.errorFeeSchedule = 'Failed to load fee schedule.';
            return of([]);
          }),
          finalize(() => {
            this.loadingFeeSchedule = false;
            this.cdr.markForCheck();
          }),
        );
      }),
    ).subscribe(data => {
      this.feeScheduleData = data;
      this.cdr.markForCheck();
    });
  }

  downloadCsv(): void {
    if (!this.feeScheduleData.length) return;

    const headers = ['ProcedureCode', 'ServiceCode', 'ContractedRate', 'EffectiveDate', 'ExpirationDate'];
    const rows    = this.feeScheduleData.map(row =>
      headers.map(h => {
        const v = row[h] ?? '';
        return `"${String(v).replace(/"/g, '""')}"`;
      }).join(','),
    );
    const csv  = [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `fee-schedule-${this.contractSelectorCtrl.value ?? 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // -- Formatting helpers -----------------------------------------------------
  fmt(n: number | null | undefined, decimals = 0): string {
    if (n == null || isNaN(n)) return '\u2014';
    return n.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  fmtCurrency(n: number | null | undefined): string {
    if (n == null || isNaN(n)) return '\u2014';
    return n.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  fmtPct(n: number | null | undefined): string {
    if (n == null || isNaN(n)) return '\u2014';
    return n.toFixed(1) + '%';
  }

  routeTypeLabel(routeType: string): string {
    const map: Record<string, string> = {
      Direct:   'Direct EDI',
      Indirect: 'Clearinghouse',
      Unknown:  'Unknown',
    };
    return map[routeType] ?? routeType ?? '\u2014';
  }
}
