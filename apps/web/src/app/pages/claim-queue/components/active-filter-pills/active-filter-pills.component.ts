import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { ClaimQueueFilter } from '../../models/claim.models';

const FILTER_LABELS: Partial<Record<keyof ClaimQueueFilter, string>> = {
  assignedTo:       'Assigned To',
  payer:            'Payer',
  billingProvider:  'Billing Provider',
  placeOfService:   'Place of Service',
  denialReason:     'Denial Reason',
  claimStatus:      'Claim Status',
  submittedFrom:    'Submitted From',
  submittedTo:      'Submitted To',
  slaStatus:        'SLA Status',
  escalationReason: 'Escalation Reason',
};

export interface FilterPill {
  key: keyof ClaimQueueFilter;
  label: string;
  value: string;
}

@Component({
    selector: 'app-active-filter-pills',
    templateUrl: './active-filter-pills.component.html',
    styleUrls: ['./active-filter-pills.component.scss'],
    standalone: false
})
export class ActiveFilterPillsComponent implements OnChanges {
  @Input() filters: ClaimQueueFilter = {};
  @Output() clearKey = new EventEmitter<keyof ClaimQueueFilter>();
  @Output() clearAll = new EventEmitter<void>();

  pills: FilterPill[] = [];

  ngOnChanges(): void {
    this.pills = (Object.keys(FILTER_LABELS) as Array<keyof ClaimQueueFilter>)
      .filter(key => {
        const val = this.filters[key];
        return val !== null && val !== undefined && val !== '';
      })
      .map(key => ({
        key,
        label: FILTER_LABELS[key]!,
        value: this.formatValue(key, this.filters[key]),
      }));
  }

  private formatValue(key: keyof ClaimQueueFilter, val: unknown): string {
    if (val instanceof Date) return val.toLocaleDateString();
    if (typeof val === 'string' && (key === 'submittedFrom' || key === 'submittedTo')) {
      return new Date(val).toLocaleDateString();
    }
    if (key === 'slaStatus' && val === 'critical') return 'Critical (Overdue + Urgent)';
    return String(val);
  }
}
