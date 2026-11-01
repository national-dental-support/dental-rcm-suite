import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Filters } from '../../../core/models/medicare-dashboard.types';


@Injectable({ providedIn: 'root' })
export class MedicareDashboardStateService {
private readonly _filters$ = new BehaviorSubject<Filters>({
provider: 'all',
practice_groups: 'all',
location: 'all',
date_of_service: { start_date: '', end_date: '' },
});


readonly filters$ = this._filters$.asObservable();


setFilters(partial: Partial<Filters>) {
const next = { ...this._filters$.value, ...partial };
this._filters$.next(next);
}


resetFilters() {
this._filters$.next({
provider: 'all',
practice_groups: 'all',
location: 'all',
date_of_service: { start_date: '', end_date: '' },
});
}


// Sub-navigation index (maps to React's updateSubNavigationTableViewState)
private readonly _subNavIndex$ = new BehaviorSubject<number>(0);
readonly subNavIndex$ = this._subNavIndex$.asObservable();
setSubNavIndex(index: number) { this._subNavIndex$.next(index); }
}