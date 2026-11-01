import { Component, Inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { startWith } from 'rxjs';
import { KpiFilters } from '../kpi.models';
import { AnalyticsService } from '../../../../core/services/analytics.service';

@Component({
    selector: 'app-kpi-filter-dialog',
    templateUrl: './kpi-filter-dialog.component.html',
    styleUrls: ['./kpi-filter-dialog.component.scss'],
    standalone: false
})
export class KpiFilterDialogComponent {
  constructor(
    private fb: FormBuilder,
    private ref: MatDialogRef<KpiFilterDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: KpiFilters,
    private analytics: AnalyticsService,
  ) {}

  form = this.fb.group({
    practice: [this.data?.practice ?? 'All', Validators.required],
    location: [this.data?.location ?? 'All', Validators.required],
    provider: [this.data?.provider ?? null],
    timeframe: [this.data?.timeframe ?? 'Past month', Validators.required],
    rag: [this.data?.rag ?? 'All', Validators.required],
    from: [this.data?.from ?? ''],
    to: [this.data?.to ?? '']
  });

  timeframe$ = this.form.get('timeframe')!.valueChanges.pipe(startWith(this.form.value.timeframe));

  apply(){ if(this.form.valid) this.ref.close(this.form.value as KpiFilters); }
  clear(){
    this.analytics.track('kpi_filter_cleared_in_dialog', { previousFilters: this.data });
    this.form.reset({ practice: 'All', location: 'All', provider: null, timeframe: 'Past month', rag: 'All', from: '', to: ''});
  }
  close(){ this.ref.close(); }
}