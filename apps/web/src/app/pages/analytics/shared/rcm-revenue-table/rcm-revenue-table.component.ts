import {ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
    selector: 'app-rcm-revenue-table',
    templateUrl: './rcm-revenue-table.component.html',
    styleUrls: ['./rcm-revenue-table.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class RcmRevenueTableComponent {
providers = [
  {
    name: 'CHARTLON PRIMARY CARE',
    charges: '$1,885,477.41',
    insuranceBilled: '$1,883,744.95',
    insuranceCollections: '$558,370.94',
    patientCollections: '$51,802.44',
    grossCollections: '$612,164.08',
    collectionRate: '85.71%',
    adjustment: '$1,171,278.95',
    refund: '0',
  },
  // ...others
];

}
