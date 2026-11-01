import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject, combineLatest } from 'rxjs';
import { finalize, takeUntil, startWith, map, distinctUntilChanged, filter } from 'rxjs/operators';

import { MatSnackBar } from '@angular/material/snack-bar';
import {
  PayerIqService,
  StrategyContractOptionsResponse,
  AiSuggestion,
  OptimizeProposedResponse,
} from '../../../core/services/payer-iq.service';

type Money = number;

interface ContractOption {
  id: number;           // PayerContractID
  contractName: string; // ContractPlanName
  display: string;      // "Name - ID"
}

interface BaselineKpis {
  underpaymentCount: number;
  underpaymentAmount: Money;
  avgPaymentLagDays: number;
  denialCount: number;
}

interface CodeRollupRow {
  cpt: string;
  description?: string;
  volume: number;

  currentAllowed: Money;
  avgPaid: Money;
  underpaidAmount: Money;
  totalCharges: Money;

  proposedAllowed: Money | null;
  proposedPct: number | null;

  pctChange: number | null;
  annualImpact: Money | null;
}

interface StrategyRunResult {
  totalAnnualImpact: Money;
  topDrivers: Array<Pick<CodeRollupRow, 'cpt' | 'volume' | 'currentAllowed' | 'proposedAllowed' | 'annualImpact'>>;
  assumptions: string[];
}

@Component({
    selector: 'rp-strategy',
    templateUrl: './strategy.component.html',
    styleUrls: ['./strategy.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class StrategyComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  form!: FormGroup;

  loading = false;
  running = false;
  loadingContracts = false;
  optimizing = false;

  aiSuggestions: AiSuggestion[] = [];
  aiRationale: string | null = null;
  aiMeta: OptimizeProposedResponse['meta'] | null = null;
  aiRawResponse: string | null = null;
  aiPromptSent: string | null = null;
  aiInputRows: any[] | null = null;
  aiError: string | null = null;

  contractOptions: ContractOption[] = [];

  kpis: BaselineKpis | null = null;
  rows: CodeRollupRow[] = [];
  result: StrategyRunResult | null = null;

  displayedColumns = [
    'cpt',
    'volume',
    'currentAllowed',
    'avgPaid',
    'totalCharges',
    'underpaidAmount',
    'proposedAllowed',
    'pctChange',
    'annualImpact',
  ];

  constructor(
    private fb: FormBuilder,
    private payerIqService: PayerIqService,
    private cdr: ChangeDetectorRef,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      contractId: [null, Validators.required], // will normalize to number
      timeWindow: ['12m', Validators.required],
    });

    this.loadContractOptions();

    //  One combined stream that:
    // - normalizes contractId to number
    // - triggers on first selection
    // - triggers on timeWindow change
    const contractId$ = this.form.get('contractId')!.valueChanges.pipe(
      startWith(this.form.get('contractId')!.value),
      map((v) => this.normalizeContractId(v)),
      distinctUntilChanged()
    );

    const timeWindow$ = this.form.get('timeWindow')!.valueChanges.pipe(
      startWith(this.form.get('timeWindow')!.value),
      map((v) => String(v) as '12m' | '6m' | '3m'),
      distinctUntilChanged()
    );

    combineLatest([contractId$, timeWindow$])
      .pipe(
        takeUntil(this.destroy$),
        // only load when we have a valid numeric contractId
        filter(([contractId]) => Number.isFinite(contractId as number))
      )
      .subscribe(([contractId, timeWindow]) => {
        // keep the form control normalized so subsequent changes are consistent
        if (this.form.get('contractId')!.value !== contractId) {
          this.form.get('contractId')!.setValue(contractId, { emitEvent: false });
        }
        this.loadBaseline(Number(contractId), timeWindow);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // used by mat-select compareWith
  compareContractIds = (a: any, b: any): boolean => {
    if (a === null || a === undefined || b === null || b === undefined) return a === b;
    return Number(a) === Number(b);
  };

  trackByContractId = (_: number, item: ContractOption) => item.id;

  private normalizeContractId(v: any): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(String(v).trim());
    return Number.isFinite(n) ? n : null;
  }

  private loadContractOptions(): void {
    this.loadingContracts = true;

    this.payerIqService
      .getStrategyContractOptions()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingContracts = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (res: StrategyContractOptionsResponse) => {
          const raw = Array.isArray(res?.data) ? res.data : [];

          const mapped: ContractOption[] = raw
            .map((r: any) => {
              const id = this.normalizeContractId(r?.PayerContractID);
              if (!Number.isFinite(id as number)) return null;

              const name = String(r?.ContractPlanName ?? '').trim() || `Contract ${id}`;
              return {
                id: Number(id),
                contractName: name,
                display: `${name} - ${id}`,
              } as ContractOption;
            })
            .filter((x: ContractOption | null): x is ContractOption => !!x);

          // Deduplicate by id (safety)
          const byId = new Map<number, ContractOption>();
          for (const opt of mapped) {
            if (!byId.has(opt.id)) byId.set(opt.id, opt);
          }

          this.contractOptions = Array.from(byId.values()).sort((a, b) => a.display.localeCompare(b.display));

          // If selected value is no longer valid, clear it
          const current = this.normalizeContractId(this.form.get('contractId')!.value);
          if (current !== null && !byId.has(current)) {
            this.form.get('contractId')!.setValue(null, { emitEvent: false });
          }

          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Failed to load strategy contract options', err);
          this.contractOptions = [];
          this.form.get('contractId')!.setValue(null, { emitEvent: false });
          this.snackBar.open('Failed to load contract options \u2014 please refresh.', 'Close', { duration: 6000 });
          this.cdr.markForCheck();
        },
      });
  }

  private loadBaseline(payerContractId: number, timeWindow: '12m' | '6m' | '3m'): void {
    this.loading = true;
    this.result = null;
    this.aiSuggestions = [];
    this.aiRationale = null;
    this.aiMeta = null;
    this.aiRawResponse = null;
    this.aiPromptSent = null;
    this.aiInputRows = null;
    this.aiError = null;

    const { start, end } = this.computeDateRange(timeWindow);

    this.payerIqService
      .getBuilderInfo({ payerContractId, start, end })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (resp: any) => {
          this.kpis = {
            underpaymentCount: Number(resp?.summary?.underpaymentCount ?? 0),
            underpaymentAmount: Number(resp?.summary?.underpaymentDollars ?? 0),
            avgPaymentLagDays: Number(resp?.summary?.avgPaymentLagDays ?? 0),
            denialCount: Number(resp?.summary?.totalDenials ?? 0),
          };

          this.rows = (resp?.rows ?? []).map((r: any) =>
            this.recomputeRow({
              cpt: String(r?.cpt ?? ''),
              description: undefined,
              volume: Number(r?.volume ?? 0),
              currentAllowed: Number(r?.currentAllowed ?? 0),
              avgPaid: Number(r?.avgPaid ?? 0),
              underpaidAmount: Number(r?.underpaidDollars ?? 0),
              totalCharges: Number(r?.totalCharges ?? 0),
              proposedAllowed: null,
              proposedPct: null,
              pctChange: null,
              annualImpact: null,
            })
          );
        },
        error: (err) => {
          console.error('Builder info API error', err);
          this.kpis = null;
          this.rows = [];
          this.result = null;
          this.snackBar.open('Failed to load contract data \u2014 please try again.', 'Close', { duration: 6000 });
          this.cdr.markForCheck();
        },
      });
  }

  // ---------------------------
  // User actions
  // ---------------------------
  onSetProposed(row: CodeRollupRow, value: string): void {
    const num = value === '' ? null : Number(value);
    row.proposedAllowed = Number.isFinite(num as number) ? (num as number) : null;
    row.proposedPct = (row.proposedAllowed !== null && row.currentAllowed > 0)
      ? ((row.proposedAllowed - row.currentAllowed) / row.currentAllowed) * 100
      : null;
    this.recomputeRowInPlace(row);
    this.cdr.markForCheck();
  }

  onSetProposedPct(row: CodeRollupRow, value: string): void {
    const pct = value === '' ? null : Number(value);
    row.proposedPct = Number.isFinite(pct as number) ? (pct as number) : null;
    row.proposedAllowed = (row.proposedPct !== null && row.currentAllowed > 0)
      ? row.currentAllowed * (1 + row.proposedPct / 100)
      : null;
    this.recomputeRowInPlace(row);
    this.cdr.markForCheck();
  }

  get totalImpact(): number {
    return this.rows.reduce((sum, r) => sum + (r.annualImpact ?? 0), 0);
  }

  get avgPaymentLag(): number {
    const withLag = this.rows.filter(r => (r as any).avgPaymentLagDays != null);
    if (!withLag.length) return 0;
    return withLag.reduce((sum, r) => sum + ((r as any).avgPaymentLagDays ?? 0), 0) / withLag.length;
  }

  clearProposed(): void {
    this.rows.forEach((r) => {
      r.proposedAllowed = null;
      r.proposedPct = null;
      this.recomputeRowInPlace(r);
    });
    this.result = null;
    this.cdr.markForCheck();
  }

  runStrategy(): void {
    if (!this.form.valid) return;

    this.running = true;
    this.result = null;

    setTimeout(() => {
      const impacted = this.rows
        .filter((r) => r.proposedAllowed !== null && r.annualImpact !== null && r.annualImpact !== 0)
        .sort((a, b) => (b.annualImpact ?? 0) - (a.annualImpact ?? 0));

      const totalAnnualImpact = impacted.reduce((sum, r) => sum + (r.annualImpact ?? 0), 0);

      this.result = {
        totalAnnualImpact,
        topDrivers: impacted.slice(0, 10).map((r) => ({
          cpt: r.cpt,
          volume: r.volume,
          currentAllowed: r.currentAllowed,
          proposedAllowed: r.proposedAllowed,
          annualImpact: r.annualImpact,
        })),
        assumptions: [
          'Volume assumed equal to selected time window baseline.',
          'Impact is calculated from proposed allowed vs current allowed (not payer behavior change).',
          'Underpayment/denial/lag metrics are observational, not automatically \u201Cimproved\u201D by the model in MVP.',
        ],
      };

      this.running = false;
      this.cdr.markForCheck();
    }, 300);
  }

  optimizeProposed(): void {
    if (!this.rows.length) return;

    const contractId = this.form.get('contractId')!.value as number;
    const payerName =
      this.contractOptions.find(c => c.id === contractId)?.contractName ?? String(contractId);

    const payload = {
      rows: this.rows.map(r => ({
        cpt:             r.cpt,
        volume:          r.volume,
        currentAllowed:  r.currentAllowed,
        avgPaid:         r.avgPaid,
        underpaidDollars: r.underpaidAmount,
      })),
      payerName,
    };

    this.optimizing = true;
    this.cdr.markForCheck();

    this.payerIqService.optimizeProposed(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp: OptimizeProposedResponse) => {
          this.aiSuggestions = resp.suggestions;
          this.aiRationale = resp.rationale;
          this.aiMeta = resp.meta;
          this.aiRawResponse = resp.rawResponse ?? null;
          this.aiPromptSent  = resp.promptSent  ?? null;
          this.aiInputRows   = resp.inputRows   ?? null;
          this.aiError = null;

          for (const s of resp.suggestions) {
            const row = this.rows.find(r => r.cpt === s.cpt);
            if (row) this.onSetProposed(row, String(s.proposedAllowed));
          }

          this.optimizing = false;
          this.cdr.markForCheck();
        },
        error: (err: any) => {
          this.aiRawResponse = err?.error?.rawResponse ?? null;
          this.aiPromptSent  = err?.error?.promptSent  ?? null;
          this.aiInputRows   = err?.error?.inputRows   ?? null;
          this.aiError = err?.error?.message ??
            (err?.status === 503 ? 'AI service is offline \u2014 ensure Ollama is running and try again' :
             'AI optimization failed \u2014 please try again');
          this.optimizing = false;
          const msg = this.aiError as string;
          this.snackBar.open(msg, 'Close', { duration: 6000 });
          this.cdr.markForCheck();
        },
      });
  }

  ratioClass(ratio: number): string {
    if (ratio < 0.80) return 'ratio--low';
    if (ratio < 0.95) return 'ratio--mid';
    return 'ratio--ok';
  }

  formatPct(ratio: number): string {
    return (ratio * 100).toFixed(0) + '%';
  }

  // ---------------------------
  // Helpers
  // ---------------------------
  private recomputeRow(row: CodeRollupRow): CodeRollupRow {
    const proposed = row.proposedAllowed;

    const pctChange =
      proposed === null ? null :
      row.currentAllowed <= 0 ? null :
      ((proposed - row.currentAllowed) / row.currentAllowed) * 100;

    const annualImpact =
      proposed === null ? null :
      (proposed - row.currentAllowed) * row.volume;

    return { ...row, pctChange, annualImpact };
  }

  private recomputeRowInPlace(row: CodeRollupRow): void {
    const updated = this.recomputeRow(row);
    row.pctChange = updated.pctChange;
    row.annualImpact = updated.annualImpact;
  }

  private computeDateRange(window: '12m' | '6m' | '3m'): { start: string; end: string } {
    const end = new Date();
    const start = new Date(end);

    const months = window === '12m' ? 12 : window === '6m' ? 6 : 3;
    start.setMonth(start.getMonth() - months);

    const toISO = (d: Date) => d.toISOString().slice(0, 10);
    return { start: toISO(start), end: toISO(end) };
  }

  asCurrency(v: number | null | undefined): string {
    if (v === null || v === undefined) return '\u2014';
    return v.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  }

  asNumber(v: number | null | undefined): string {
    if (v === null || v === undefined) return '\u2014';
    return v.toLocaleString();
  }

  asPct(v: number | null | undefined): string {
    if (v === null || v === undefined) return '\u2014';
    return `${v.toFixed(1)}%`;
  }
}
