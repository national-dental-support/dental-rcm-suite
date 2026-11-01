import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  DenialFilterParams,
  DenialKpis,
  DenialManagementService,
  DenialReason,
  InsightflowFilterOptions,
} from '../../../core/services/denial-management.service';

type ScopeKind = 'practice' | 'location';

interface Side {
  scopeKind: ScopeKind;
  value: string | null;
  kpis: DenialKpis | null;
  topReason: DenialReason | null;
  loading: boolean;
}

/**
 * #89 - Side-by-side DSO comparison.
 *
 * Lets large organizations compare denial / collection KPIs and the top
 * preventable denial category between any two Practice Groups or Locations.
 * Uses the existing /api/insightflow/denial-management/{kpis,top-reasons}
 * endpoints with per-side practice / location filter params.
 */
@Component({
    selector: 'rp-payer-iq-compare',
    templateUrl: './compare.component.html',
    styleUrls: ['./compare.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class CompareComponent implements OnInit {
  options: InsightflowFilterOptions | null = null;

  left: Side = { scopeKind: 'practice', value: null, kpis: null, topReason: null, loading: false };
  right: Side = { scopeKind: 'practice', value: null, kpis: null, topReason: null, loading: false };

  constructor(
    private denialSvc: DenialManagementService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.denialSvc.getFilterOptions().subscribe({
      next: (opts) => {
        this.options = opts;
        this.cdr.markForCheck();
      },
    });
  }

  get practiceOptions(): string[] {
    return this.options?.practices ?? this.options?.locations ?? [];
  }

  get locationOptions(): string[] {
    return this.options?.locations ?? [];
  }

  optionsFor(side: Side): string[] {
    return side.scopeKind === 'practice' ? this.practiceOptions : this.locationOptions;
  }

  onScopeChange(side: Side, kind: ScopeKind): void {
    side.scopeKind = kind;
    side.value = null;
    side.kpis = null;
    side.topReason = null;
    this.cdr.markForCheck();
  }

  onValueChange(side: Side): void {
    this.loadSide(side);
  }

  private loadSide(side: Side): void {
    if (!side.value) {
      side.kpis = null;
      side.topReason = null;
      return;
    }
    side.loading = true;
    this.cdr.markForCheck();

    const filters: DenialFilterParams =
      side.scopeKind === 'practice'
        ? { practices: [side.value] }
        : { locations: [side.value] };

    forkJoin({
      kpis: this.denialSvc.getKpis(filters).pipe(catchError(() => of(null))),
      reasons: this.denialSvc.getTopReasons(filters).pipe(catchError(() => of([] as DenialReason[]))),
    }).subscribe({
      next: ({ kpis, reasons }) => {
        side.kpis = kpis ?? null;
        side.topReason = reasons?.[0] ?? null;
        side.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        side.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  // -- Delta helpers (right vs left) ----------------------------------------

  delta(leftN: number | undefined | null, rightN: number | undefined | null): number | null {
    if (leftN == null || rightN == null) return null;
    return rightN - leftN;
  }

  formatMoney(v: number | null | undefined): string {
    if (v == null) return '\u2014';
    return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  }

  formatPct(v: number | null | undefined): string {
    if (v == null) return '\u2014';
    return `${(v * 100).toFixed(1)}%`;
  }

  formatCount(v: number | null | undefined): string {
    if (v == null) return '\u2014';
    return v.toLocaleString('en-US');
  }
}
