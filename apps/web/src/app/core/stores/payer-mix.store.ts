import { Injectable } from '@angular/core';
import { BehaviorSubject, forkJoin, map, shareReplay, startWith, switchMap } from 'rxjs';
import {
  Filters,
  Totals,
  CollectionPoint,
  PayerChange,
  ProcedureChange,
  PayerCollectionDetail,
} from '../models/payer-mix.models';
import { PayerMixService } from '../services/payer-mix.service';

const EMPTY_FILTERS: Filters = {
  provider: 'all',
  practice_groups: 'all',
  location: 'all',
  payer: 'all',
  payment_received: { start_date: '', end_date: '' },
};

@Injectable()
export class PayerMixStore {
  private readonly filtersSubject = new BehaviorSubject<Filters>(EMPTY_FILTERS);
  readonly filters$ = this.filtersSubject.asObservable();

  readonly data$ = this.filters$.pipe(
    switchMap(filters =>
      forkJoin({
        collectionTrends: this.api.getCollectionTrends(filters),
        totalInsuranceCollections: this.api.getInsuranceTotals(filters),
        totalPatientCollections: this.api.getPatientTotals(filters),

        payersIncreasing: this.api.getPayersIncreasing(filters),
        payersDecreasing: this.api.getPayersDecreasing(filters),
        proceduresIncreasing: this.api.getProceduresIncreasing(filters),
        proceduresDecreasing: this.api.getProceduresDecreasing(filters),
        payerCollectionDetails: this.api.getPayerCollectionDetails(filters),
      }).pipe(startWith(null as any))
    ),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  readonly loading$          = this.data$.pipe(map(d => d === null));
  readonly collectionTrends$ = this.data$.pipe(map(d => d?.collectionTrends ?? []));
  readonly totalsInsurance$  = this.data$.pipe(map(d => d?.totalInsuranceCollections));
  readonly totalsPatient$    = this.data$.pipe(map(d => d?.totalPatientCollections));

  readonly payersIncreasing$ = this.data$.pipe(
    map(d => (d?.payersIncreasing as PayerChange[] ?? []).slice(0, 7))
  );
  readonly payersDecreasing$ = this.data$.pipe(
    map(d => (d?.payersDecreasing as PayerChange[] ?? []).slice(0, 7))
  );
  readonly proceduresIncreasing$ = this.data$.pipe(
    map(d => (d?.proceduresIncreasing as ProcedureChange[] ?? []).slice(0, 7))
  );
  readonly proceduresDecreasing$ = this.data$.pipe(
    map(d => (d?.proceduresDecreasing as ProcedureChange[] ?? []).slice(0, 7))
  );

  readonly payerCollectionDetails$ = this.data$.pipe(
    map(d => d?.payerCollectionDetails as PayerCollectionDetail[] ?? [])
  );

  // placeholders until those endpoints exist
  readonly providers$      = this.filters$.pipe(map(() => [] as string[]));
  readonly practiceGroups$ = this.filters$.pipe(map(() => [] as string[]));
  readonly locations$      = this.filters$.pipe(map(() => [] as string[]));

  constructor(private api: PayerMixService) {}

  patchFilters(partial: Partial<Filters>) {
    this.filtersSubject.next({ ...this.filtersSubject.value, ...partial });
  }

  resetFilters() { this.filtersSubject.next(EMPTY_FILTERS); }
}
