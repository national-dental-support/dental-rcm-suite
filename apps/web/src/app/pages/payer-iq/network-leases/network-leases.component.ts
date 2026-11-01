import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { Subject, finalize, takeUntil } from 'rxjs';

import { AdvancedTableColumnConfig } from '../../../shared/components/advanced-table/advanced-table.models';
import {
  NetworkLeaseNetworkTotalRow,
  NetworkLeasePayerRow,
  NetworkLeasesResponse,
  PayerIqService,
} from '../../../core/services/payer-iq.service';
import { PayerIqFiltersStore } from '../../../shared/components/global-filters/global-filters.store';
import { PayerIqFiltersValue } from '../../../shared/components/global-filters/global-filters.models';

interface LeaseNetworkRow {
  // Parent rows: network name
  // Child rows: payer name (we reuse the same column)
  network: string;

  totalChargeAmount: number;
  totalPayment: number;
  totalPatientVolume: number;
  totalCPTVolume: number;

  children?: LeaseNetworkRow[];
}

@Component({
    selector: 'app-network-leases',
    templateUrl: './network-leases.component.html',
    styleUrls: ['./network-leases.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class NetworkLeasesComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  loading = false;
  error = false;

  leaseNetworkColumns: AdvancedTableColumnConfig<LeaseNetworkRow>[] = [
    { id: 'network', 
      header: 'Network', 
      type: 'text', 
      propertyPath: 'network',
      includeInGlobalSearch: true, 
      sortable: true,
      filterable: true,
      filterConfig: {
        supportsValueList: true,
        supportsGroupValues: false, // or true if using groups
      } 
  },

    {
      id: 'totalChargeAmount',
      header: 'Total Charge Amount',
      type: 'currency',
      propertyPath: 'totalChargeAmount',
      sortable: true,
      align: 'end',
      displayFormatter: (v) => this.formatCurrency(v),
    },
    {
      id: 'totalPayment',
      header: 'Total Payments',
      type: 'currency',
      propertyPath: 'totalPayment',
      sortable: true,
      align: 'end',
      displayFormatter: (v) => this.formatCurrency(v),
    },

    { id: 'totalPatientVolume', 
      header: 'Total Patient Volume', 
      type: 'number', 
      propertyPath: 'totalPatientVolume', 
      sortable: true,
      align: 'end', 
      displayFormatter: (v) => `${Math.floor(v ?? 0)}` },

    { id: 'totalCPTVolume', 
      header: 'Total CPT Volume', 
      type: 'number', 
      propertyPath: 'totalCPTVolume', 
      sortable: true, 
      align: 'end', 
      displayFormatter: (v) => `${Math.floor(v ?? 0)}` },
  ];

  leaseNetworkChildren = (row: LeaseNetworkRow) => row.children ?? [];

  // [ok] Highlight Unknown rows (API uses 'Unknown Payer' + 'Unknown Network')
  isUnknownRow = (row: LeaseNetworkRow) => {
    const v = (row.network ?? '').trim().toLowerCase();
    return v === 'unknown payer' || v === 'unknown network';
  };

  leaseNetworkRowClass = (row: LeaseNetworkRow) =>
    this.isUnknownRow(row) ? 'rp-row-unknown-payer' : '';

  leaseNetworkRows: LeaseNetworkRow[] = [];

  constructor(
    private readonly payerIqService: PayerIqService,
    private readonly filtersStore: PayerIqFiltersStore,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Apply-driven: only fetch when user clicks Apply on global filters
    this.filtersStore.applied$
      .pipe(takeUntil(this.destroy$))
      .subscribe((filters) => this.load(filters));

    // Optional: if you want initial load even before Apply is clicked
    // this.load(this.filtersStore.value);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private load(filters: PayerIqFiltersValue): void {
    this.loading = true;
    this.error = false;

    this.payerIqService
      .getNetworkLeases(filters)
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (res: NetworkLeasesResponse) => {
          const networks = res?.data?.networks ?? [];
          const payers = res?.data?.payers ?? [];
          this.leaseNetworkRows = this.buildLeaseNetworkTree(networks, payers);
        },
        error: () => {
          this.leaseNetworkRows = [];
          this.error = true;
        },
      });
  }

  private buildLeaseNetworkTree(
    networks: NetworkLeaseNetworkTotalRow[],
    payers: NetworkLeasePayerRow[]
  ): LeaseNetworkRow[] {
    const payersByNetwork = new Map<string, NetworkLeasePayerRow[]>();

    for (const p of payers ?? []) {
      const key = (p.NetworkName ?? 'Unknown Network').trim();
      const arr = payersByNetwork.get(key) ?? [];
      arr.push(p);
      payersByNetwork.set(key, arr);
    }

    return (networks ?? []).map((n) => {
      const networkName = (n.NetworkName ?? 'Unknown Network').trim();

      const children: LeaseNetworkRow[] = (payersByNetwork.get(networkName) ?? []).map((p) => ({
        // child uses same column "Network" but shows payer name
        network: (p.PayerName ?? 'Unknown Payer').trim(),
        totalChargeAmount: Number(p.TotalChargeAmount ?? 0),
        totalPayment: Number(p.TotalPayments ?? 0),
        totalPatientVolume: Number(p.TotalPatientVolume ?? 0),
        totalCPTVolume: Number(p.TotalCPTVolume ?? 0),
      }));

      return {
        network: networkName,
        totalChargeAmount: Number(n.TotalChargeAmount ?? 0),
        totalPayment: Number(n.TotalPayments ?? 0),
        totalPatientVolume: Number(n.TotalPatientVolume ?? 0),
        totalCPTVolume: Number(n.TotalCPTVolume ?? 0),
        children,
      };
    });
  }

  private formatCurrency = (value: number | null | undefined): string => {
  const v = Number(value ?? 0);
  return v.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
};
}
