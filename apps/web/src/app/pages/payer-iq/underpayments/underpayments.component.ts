import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AdvancedTableColumnConfig } from '../../../shared/components/advanced-table/advanced-table.models';
import { finalize, Subject, takeUntil } from 'rxjs';
import { PayerIqService } from '../../../core/services/payer-iq.service';
import { PayerIqFiltersStore } from '../../../shared/components/global-filters/global-filters.store';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

type Tab = { label: string; link: string };

// One row type for both parent + child rows
type AtRiskKind = 'payer' | 'cpt' | 'claim';

interface AtRiskRow {
  kind: 'payer' | 'cpt' | 'claim';
  payer: string; // payer name for payer rows, CDT code for cpt rows (table stays the same)
  claims: number;
  lossRevenue: number;
  riskRate?: 'High' | 'Medium' | 'Low';

  // [ok] Add this:
  payerName?: string; // set on cpt + claim rows

  // claim fields
  claimNumber?: string;
  patientName?: string;
  dateOfService?: string;
  planName?: string;
  provider?: string;
  billedAmount?: number;
  allowedAmount?: number;
  paidAmount?: number;
  denialCode?: string;

  children?: AtRiskRow[];
}


interface RemediationStep {
  id: string;
  title: string;
  body: string;
  checklist?: string[];
  completed?: boolean;
}

@Component({
    selector: 'app-underpayments',
    templateUrl: './underpayments.component.html',
    styleUrls: ['./underpayments.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class UnderpaymentsComponent implements OnInit, OnDestroy {

  private destroy$ = new Subject<void>();

  atRiskPayers: AtRiskRow[] = [];
  loadingAtRisk = false;
  // Columns stay the same names as your screenshot/current rendering
  atRiskkColumns: AdvancedTableColumnConfig<AtRiskRow>[] = [
    {
      id: 'payer',
      header: 'Payer',
      type: 'text',
      sortable: true,
      filterable: true,
      propertyPath: 'payer',
      includeInGlobalSearch: true,
      accessor: (r) => r.payer,
      filterConfig: {
        supportsValueList: true,
        supportsGroupValues: false,
      }
    },
   {
  id: 'riskRate',
  header: 'Risk Rate',
  type: 'chip',
  sortable: true,
  filterable: true,
      filterConfig: {
        supportsValueList: true,
        supportsGroupValues: false, // or true if using groups
      },
  align: 'end',
  accessor: (r) => r.riskRate,
  chipConfig: {
    chipClass: 'rp-risk-pill',
    getLabel: (_value, row) => {
      if (row.kind !== 'payer') return '\u2014';
      return row.riskRate ?? '\u2014';
    },
    getColor: (_value, row) => {
      if (row.kind !== 'payer') return ' ';
      if (row.riskRate === 'High') return 'risk-high';
      if (row.riskRate === 'Medium') return 'risk-medium';
      return 'risk-low';
    },
  },
},

    {
      id: 'claims',
      header: 'Claims',
      type: 'number',
      sortable: true,
      align: 'end',
      accessor: (r) => r.claims,
      displayFormatter: (v) => Number(v ?? 0).toLocaleString(),
    },
    {
      id: 'lossRevenue',
      header: 'Loss Revenue $',
      type: 'currency',
      sortable: true,
      align: 'end',
      accessor: (r) => r.lossRevenue,
      displayFormatter: (v) => this.formatCurrency(v == null ? v : Number(v)),
    },
    
  {
    id: 'export',
    header: '',
    type: 'action',
    isActionColumn: true,
    buttonLabel: 'Export to Excel',
    actionId: 'export_excel',
    width: '170px',
    align: 'end',
    actionVisible: (r: AtRiskRow) => r.kind === 'cpt',
    buttonClass: ['rp-row-action-btn--excel'],
  },
  {
    id: 'mark_reviewed',
    header: '',
    type: 'action',
    isActionColumn: true,
    buttonLabel: 'Mark Reviewed',
    actionId: 'mark_reviewed',
    width: '140px',
    align: 'end',
    actionVisible: (r: AtRiskRow) => r.kind === 'claim' && !r['reviewed'],
  },
  {
    id: 'create_dispute',
    header: '',
    type: 'action',
    isActionColumn: true,
    buttonLabel: 'Create Dispute',
    actionId: 'create_dispute',
    width: '140px',
    align: 'end',
    actionVisible: (r: AtRiskRow) => r.kind === 'claim' && !r['disputeStatus'],
    buttonClass: ['rp-row-action-btn--primary'],
  },
  {
    id: 'view_denial',
    header: '',
    type: 'action',
    isActionColumn: true,
    buttonLabel: 'View Denial',
    actionId: 'view_denial',
    width: '120px',
    align: 'end',
    actionVisible: (r: AtRiskRow) => r.kind === 'claim' && !!r.claimNumber,
  },
  ];

   uniqueValues: { [key: string]: string[] } = {};
 
  

atRiskChildren = (row: AtRiskRow) => (row.kind === 'payer' ? row.children ?? [] : []);

  constructor(
    private readonly payerIqService: PayerIqService,
    private readonly filtersStore: PayerIqFiltersStore,
    private readonly cdr: ChangeDetectorRef,
    private readonly dialog: MatDialog,
    private readonly snackBar: MatSnackBar,
    private readonly router: Router,
  ) {}

  onRowAction(event: { actionId: string; row: AtRiskRow }): void {
    if (event.actionId === 'mark_reviewed') {
      this.markReviewed(event.row);
    } else if (event.actionId === 'create_dispute') {
      this.createDispute(event.row);
    } else if (event.actionId === 'view_denial') {
      const claimId = event.row.claimNumber;
      if (claimId) {
        this.router.navigate(['/app/denial-iq/claim-queue/ar-specialist'], {
          queryParams: { claimId },
        });
      }
    }
  }

  private markReviewed(row: AtRiskRow): void {
    const claimNumber = row.claimNumber;
    if (!claimNumber) return;
    this.payerIqService.markReviewed(claimNumber, row.payer).subscribe({
      next: () => {
        (row as any)['reviewed'] = true;
        this.cdr.markForCheck();
        this.snackBar.open('Claim marked as reviewed', 'Dismiss', { duration: 3000 });
      },
      error: () => this.snackBar.open('Failed to mark reviewed', 'Dismiss', { duration: 3000 }),
    });
  }

  private createDispute(row: AtRiskRow): void {
    const claimNumber = row.claimNumber;
    if (!claimNumber) return;
    const notes = prompt('Dispute notes (optional):') ?? '';
    this.payerIqService.createDispute(claimNumber, {
      cptCode: row.payer,
      payerName: row.payerName,
      notes: notes || undefined,
    }).subscribe({
      next: () => {
        (row as any)['disputeStatus'] = 'open';
        this.cdr.markForCheck();
        this.snackBar.open('Dispute created \u2014 status: Open', 'Dismiss', { duration: 4000 });
      },
      error: () => this.snackBar.open('Failed to create dispute', 'Dismiss', { duration: 3000 }),
    });
  }

  ngOnInit(): void {
    this.filtersStore.applied$
      .pipe(takeUntil(this.destroy$))
      .subscribe((filters) => {
        this.fetchAtRisk(filters);
      });
  }

  private fetchAtRisk(filters: any): void {
    this.loadingAtRisk = true;
    this.cdr.markForCheck();

    this.payerIqService
      .getAtRiskPayers(filters)
      .pipe(
        finalize(() => {
          this.loadingAtRisk = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (resp) => {
          this.atRiskPayers = this.mapAtRiskTree(resp.data ?? []);
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Underpayments -> getAtRiskPayers failed', err);
          this.atRiskPayers = [];
          this.cdr.markForCheck();
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

private mapAtRiskTree(apiRows: { RowType: string; PayerName: string; CPTCode: string | null; Claims: number; LossRevenue: number; RiskRate: any }[]): AtRiskRow[] {
  const payerMap = new Map<string, AtRiskRow>();

  for (const r of apiRows ?? []) {
    const payerName = r.PayerName?.trim() ?? 'Unknown';

    if (r.RowType === 'PAYER') {
      // ensure payer row exists
      const payerRow: AtRiskRow = {
        kind: 'payer',
        payer: payerName,
        claims: Number(r.Claims ?? 0),
        lossRevenue: Math.abs(Number(r.LossRevenue ?? 0)),
        riskRate: r.RiskRate ?? undefined,
        children: [],
      };
      payerMap.set(payerName, payerRow);
    }

    if (r.RowType === 'CPT') {
      // ensure payer row exists even if payer row wasn't returned first
      if (!payerMap.has(payerName)) {
        payerMap.set(payerName, {
          kind: 'payer',
          payer: payerName,
          claims: 0,
          lossRevenue: 0,
          children: [],
        });
      }

      const payerRow = payerMap.get(payerName)!;

      const cpt = r.CPTCode?.trim() || 'Unknown';
      payerRow.children ??= [];

      payerRow.children.push({
        kind: 'cpt',
        payer: cpt,              // you're using payer column to show CDT for CPT rows (intentional)
        payerName: payerName,    // so export knows the parent payer
        claims: Number(r.Claims ?? 0),
        lossRevenue: Math.abs(Number(r.LossRevenue ?? 0)),
        children: [],            // no claims returned by this endpoint
      });
    }
  }

  // sort CPT children highest loss first
  for (const payerRow of payerMap.values()) {
    payerRow.children?.sort((a, b) => (b.lossRevenue ?? 0) - (a.lossRevenue ?? 0));
  }

  // sort payer rows highest loss first
  return Array.from(payerMap.values()).sort((a, b) => (b.lossRevenue ?? 0) - (a.lossRevenue ?? 0));
}

 
  arNextSteps: RemediationStep[] = [
    {
      id: 'review-at-risk',
      title: 'Review underpayments by payer by CPT code',
      body:
        'Contact the payer to inform them of the underpayments. ',
      checklist: [
        'Download the Excel spreadsheet for each CPT code',
        'Attach the spreadsheet to an email to the payer',
      ],
      completed: false
    },
    // {
    //   id: 'resubmit',
    //   title: 'Resubmit',
    //   body:
    //     'Resubmit the claim to the new/correct insurance company.',
    //   completed: false
    // }
  ];

  notes = '';

onAtRiskTableAction(e: { actionId: string; row: AtRiskRow }): void {
  if (e.actionId === 'export_excel') {
    if (e.row.kind !== 'cpt') return;
    const claimRows = (e.row.children ?? []).filter((x) => x.kind === 'claim');
    this.exportClaimsToExcelCsv(e.row, claimRows);
  } else {
    this.onRowAction(e);
  }
}

private exportClaimsToExcelCsv(cptRow: AtRiskRow, claims: AtRiskRow[]): void {
  const headers = [
    'Payer',
    'CDT',
    'Claim #',
    'Patient',
    'DOS',
    'Plan',
    'Provider',
    'Billed',
    'Allowed',
    'Paid',
    'Denial Code',
    'Loss Revenue',
  ];

  const payerName = this.findParentPayerNameForCpt(cptRow) ?? cptRow.payer; // optional helper
  const cdt = cptRow.payer;

  const lines = [
    headers.join(','),
    ...(claims ?? []).map((r) => {
      const row = [
        payerName,
        cdt,
        r.claimNumber ?? '',
        r.patientName ?? '',
        r.dateOfService ?? '',
        r.planName ?? '',
        r.provider ?? '',
        r.billedAmount ?? '',
        r.allowedAmount ?? '',
        r.paidAmount ?? '',
        r.denialCode ?? '',
        r.lossRevenue ?? '',
      ];
      return row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
    }),
  ];

  const csv = lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `claims-${cdt}-${payerName.replace(/\s+/g, '-').toLowerCase()}.csv`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 250);
}

private findParentPayerNameForCpt(cptRow: AtRiskRow): string | null {
  return cptRow.payerName ?? null;
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
  private exportAtRiskRowToExcel(row: AtRiskRow): void {
    const headers = ['Payer', 'CPT','Claims', 'Loss Revenue $'];
    const values = [row.payer, row.claims, row.lossRevenue];

    const csv = [
      headers.join(','),
      values.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `at-risk-${row.payer.replace(/\s+/g, '-').toLowerCase()}.csv`;
    a.click();

    URL.revokeObjectURL(url);
  }

  private riskRateLabel(rate?: number): 'Low' | 'Medium' | 'High' | '\u2014' {
  if (rate === null || rate === undefined) return '\u2014';
  if (rate >= 0.9) return 'High';
  if (rate >= 0.75) return 'Medium';
  return 'Low';
}

private riskRateTone(rate?: number): 'low' | 'medium' | 'high' {
  if (rate === null || rate === undefined) return 'low';
  if (rate >= 0.9) return 'high';
  if (rate >= 0.75) return 'medium';
  return 'low';
}
}
