import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { FormControl } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, takeUntil, filter, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

@Component({
    selector: 'app-patient-search',
    templateUrl: './patient-search.component.html',
    styleUrls: ['./patient-search.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class SharedPatientSearchComponent implements OnInit, OnDestroy {
  @Input() placeholder = 'Search patients...';
  @Input() clearAfterSelect = false;
  @Output() patientSelected = new EventEmitter<any>();

  searchControl = new FormControl('');
  results: any[] = [];
  loading = false;

  private destroy$ = new Subject<void>();

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.searchControl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        filter((term): term is string => typeof term === 'string' && term.length >= 2),
        switchMap((term) => {
          this.loading = true;
          this.cdr.markForCheck();
          return this.http
            .get<any[]>(`/api/patient-cards/search?q=${encodeURIComponent(term)}`)
            .pipe(catchError(() => of([])));
        }),
        takeUntil(this.destroy$),
      )
      .subscribe((patients) => {
        this.results = patients;
        this.loading = false;
        this.cdr.markForCheck();
      });
  }

  displayFn(patient: any): string {
    return patient ? patient.name || '' : '';
  }

  onSelect(patient: any): void {
    this.patientSelected.emit(patient);
    if (this.clearAfterSelect) {
      this.searchControl.setValue('');
      this.results = [];
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
