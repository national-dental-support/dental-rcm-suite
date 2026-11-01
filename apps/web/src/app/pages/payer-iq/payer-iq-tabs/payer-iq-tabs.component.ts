import { ChangeDetectionStrategy, Component } from '@angular/core';

type Tab = { label: string; link: string };

@Component({
    selector: 'app-payer-iq-tabs',
    templateUrl: './payer-iq-tabs.component.html',
    styleUrls: ['./payer-iq-tabs.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class PayerIQTabsComponent {
  readonly tabs: Tab[] = [
    { label: 'Dashboard', link: 'dashboard' },
    { label: 'Network & Leases', link: 'network-and-leases' },
    { label: 'Underpayments', link: 'underpayments' },
    { label: 'Strategy', link: 'strategy' },
    { label: 'Compare', link: 'compare' },
  ];

  trackByLabel(_: number, t: Tab) { return t.label; }
}
