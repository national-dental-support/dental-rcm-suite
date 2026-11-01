// src/app/shared/components/dental-practice-table/dental-practice-table.component.ts
import {
  ChangeDetectionStrategy,
  Component,
  Input
} from '@angular/core';
import { BehaviorSubject, combineLatest, map } from 'rxjs';
import { PageEvent } from '@angular/material/paginator';
import { IRow, ISubRow } from '../../../core/models/payer-mix.models';

type RowView =
  | { kind: 'practice'; name: string; totals: Totals }
  | { kind: 'location'; practiceName: string; location: ISubRow };

type Totals = {
  numberOfCollections: number;
  insuranceCollections: number;
  patientCollections: number;
  grossCollections: number;
  collectionRateAvg: number; // 0-1
  prodcutionAdjustment: number;
  collectionAdjustment: number;
  refund: number;
  insuranceBilled: number;
};

@Component({
    selector: 'app-dental-practice-table',
    templateUrl: './dental-practice-table.component.html',
    styleUrls: ['./dental-practice-table.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class DentalPracticeTableComponent {
  private readonly data$ = new BehaviorSubject<[]>([]);
  private readonly pageState$ = new BehaviorSubject<{ index: number; size: number }>({ index: 0, size: 10 });
  private readonly openSet$ = new BehaviorSubject<Set<string>>(new Set());

  @Input() set data(value: IRow[] | null | undefined) {
    //this.data$.next(value ?? []);
    // reset paginator when new data arrives
    this.pageState$.next({ index: 0, size: this.pageState$.value.size });
  }

  readonly totalPractices$ = this.data$.pipe(map(d => d.length));

  private computeTotals(practice: IRow): Totals {
    const acc = practice.data.reduce((a, l) => {
      a.numberOfCollections += l.numberOfCollections;
      a.insuranceCollections += l.insuranceCollections;
      a.patientCollections += l.patientCollections;
      a.grossCollections += l.grossCollections;
      a.prodcutionAdjustment += l.prodcutionAdjustment;
      a.collectionAdjustment += l.collectionAdjustment;
      a.refund += l.refund;
      a.insuranceBilled += l.insuranceBilled;
      a.rateSum += l.collectionRate;
      a.count += 1;
      return a;
    }, {
      numberOfCollections: 0,
      insuranceCollections: 0,
      patientCollections: 0,
      grossCollections: 0,
      prodcutionAdjustment: 0,
      collectionAdjustment: 0,
      refund: 0,
      insuranceBilled: 0,
      rateSum: 0,
      count: 0
    });

    return {
      numberOfCollections: acc.numberOfCollections,
      insuranceCollections: acc.insuranceCollections,
      patientCollections: acc.patientCollections,
      grossCollections: acc.grossCollections,
      prodcutionAdjustment: acc.prodcutionAdjustment,
      collectionAdjustment: acc.collectionAdjustment,
      refund: acc.refund,
      insuranceBilled: acc.insuranceBilled,
      collectionRateAvg: acc.count ? acc.rateSum / acc.count : 0
    };
  }

  readonly rows$ = combineLatest([this.data$, this.pageState$, this.openSet$]).pipe(
    map(([data, page, open]) => {
      const start = page.index * page.size;
      const end = start + page.size;
      const pagePractices = data.slice(start, end);

      const out: RowView[] = [];
      for (const p of pagePractices) {
        const totals = this.computeTotals(p);
        out.push({ kind: 'practice', name: p, totals });
        // if (open.has(p.name)) {
        //   for (const loc of p.data) {
        //     out.push({ kind: 'location', practiceName: p.name, location: loc });
        //   }
        // }
      }
      return out;
    })
  );

  displayedColumns = [
    'practice',
    'numberOfCollections',
    'insuranceCollections',
    'patientCollections',
    'grossCollections',
    'collectionRate',
    'prodcutionAdjustment',
    'collectionAdjustment',
    'refund',
    'insuranceBilled'
  ];

  trackRow(_: number, row: RowView) {
    return row.kind === 'practice' ? `p:${row.name}` : `l:${row.practiceName}:${row.location.name}`;
  }

  isOpen(name: string) {
    return this.openSet$.value.has(name);
  }

  toggle(name: string) {
    const next = new Set(this.openSet$.value);
    next.has(name) ? next.delete(name) : next.add(name);
    this.openSet$.next(next);
  }

  onPageChange(ev: PageEvent) {
    this.pageState$.next({ index: ev.pageIndex, size: ev.pageSize });
  }
}
