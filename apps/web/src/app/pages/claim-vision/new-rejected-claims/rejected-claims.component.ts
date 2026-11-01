import {
  Component,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { skip, takeUntil } from 'rxjs/operators';
import {
  ClaimVisionBatch,
  RejectedClaimsTrendPoint
} from '../../../core/services/claim-vision.service';
import { ClaimVisionStore } from '../../../core/stores/claim-vision.store';
import { AdvancedTableColumnConfig, ColumnGroupedValues, GroupFilterNode } from '../../../shared/components/advanced-table/advanced-table.models';
import { GlobalFiltersStore } from '../../../shared/components/global-filters/global-filters.store';


@Component({
    selector: 'app-new-rejected-claims',
    templateUrl: './rejected-claims.component.html',
    styleUrls: ['./rejected-claims.component.scss'],
    standalone: false
})

export class NewRejectedClaimsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
   /** Data for the table */
  batches: ClaimVisionBatch[] = [];

  /** Trend data for the bar chart */
  trendData: RejectedClaimsTrendPoint[] = [];
  trendMaxCount = 0;

  /** Column config for rp-advanced-table */
  columns: AdvancedTableColumnConfig<ClaimVisionBatch>[] = [
    {
      id: 'batchSubmittedDate',
      header: 'Batch Week Start',
      type: 'date',
      propertyPath: 'submittedDate',
      sortable: true,
      filterable: true,
      filterConfig: {
        supportsValueList: true,
        supportsGroupValues: true,
      },
    },
    {
      id: 'rejectedClaims',
      header: 'Rejected Claims',
      type: 'number',
      propertyPath: 'rejectedClaimsCount',
      sortable: true,
      filterable: true,
      filterConfig: {
        supportsValueList: true,
        supportsGroupValues: true,
      },
    },
    {
      id: 'ruleName',
      header: 'Rule Name',
      type: 'text',
      propertyPath: 'ruleName',
      sortable: true,
      filterable: true,
      filterConfig: {
        supportsValueList: true,
        supportsGroupValues: true,
      },
    },
    {
      id: 'category',
      header: 'Category',
      type: 'text',
      propertyPath: 'category',
      sortable: true,
      filterable: true,
      width: '140px',
      filterConfig: {
        supportsValueList: true,
        supportsGroupValues: true,
      },
    },
    {
      id: 'ruleType',
      header: 'Rule Type',
      type: 'text',
      propertyPath: 'ruleType',
      sortable: true,
      filterable: true,
      width: '120px',
      filterConfig: {
        supportsValueList: true,
        supportsGroupValues: true,
      },
    },
    {
      id: 'rejectionMessage',
      header: 'Rejection Message',
      type: 'text',
      propertyPath: 'rejectionMessage',
      sortable: true,
      filterable: true,
      filterConfig: {
        supportsValueList: true,
        supportsGroupValues: true,
      },
    },
    {
      id: 'viewClaims',
      header: '',
      type: 'action',
      buttonLabel: 'VIEW CLAIMS',
      actionId: 'view-claims',
      align: 'end',
      sortable: false,
      filterable: false,
      includeInGlobalSearch: false,
    },
  ];

  /** Checkbox value lists for each column */
  uniqueValues: { [columnId: string]: string[] } = {};

  /** Grouped values for each column (month buckets, categories, etc.) */
  groupedValues: ColumnGroupedValues = {
    batchSubmittedDate: [],
    rejectedClaims: [],
    ruleName: [],
    category: [],
    ruleType: [],
    rejectionMessage: [],
  };

  constructor(
    private router: Router,
    private claimVisionStore: ClaimVisionStore,
    private globalFiltersStore: GlobalFiltersStore,
  ) {}

  ngOnInit(): void {
    this.claimVisionStore.loadBatches();
    this.claimVisionStore.loadTrend();

    this.claimVisionStore.batches$.pipe(takeUntil(this.destroy$)).subscribe(data => {
      const batches = data ?? [];
      this.batches = batches;
      this.buildUniqueValues(batches);
      this.buildRejectionMessageGroups(batches);
      this.buildBatchSubmittedDateGroups(batches);
      this.buildRejectedClaimsGroups(batches);
      this.buildRuleNameGroups(batches);
      this.buildCategoryGroups(batches);
      this.buildRuleTypeGroups(batches);
    });

    this.claimVisionStore.trend$.pipe(takeUntil(this.destroy$)).subscribe(data => {
      this.trendData = data ?? [];
      this.trendMaxCount = this.trendData.length
        ? Math.max(...this.trendData.map(d => d.rejectedCount), 1)
        : 0;
    });

    // Reload when global filters change
    this.globalFiltersStore.applied$.pipe(
      skip(1),
      takeUntil(this.destroy$),
    ).subscribe(() => {
      this.claimVisionStore.reload();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  getBarHeight(count: number): string {
    if (this.trendMaxCount === 0) return '0%';
    return Math.round((count / this.trendMaxCount) * 100) + '%';
  }

  formatMonth(monthStr: string): string {
    // Input: '2025-09', output: 'Sep'
    const [year, month] = monthStr.split('-');
    const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
    return d.toLocaleString('en-US', { month: 'short' });
  }

  private buildUniqueValues(data: ClaimVisionBatch[]): void {
    const dateSet = new Set<string>();
    const rejectedSet = new Set<string>();
    const messageSet = new Set<string>();
    const ruleNameSet = new Set<string>();
    const categorySet = new Set<string>();
    const ruleTypeSet = new Set<string>();

    for (const row of data) {
      const submittedDate = row.submittedDate
        ? new Date(row.submittedDate).toLocaleDateString()
        : '';

      if (submittedDate) dateSet.add(submittedDate);
      if (row.rejectedClaimsCount != null) {
        rejectedSet.add(row.rejectedClaimsCount.toString());
      }
      if (row.rejectionMessage) messageSet.add(row.rejectionMessage);
      if (row.ruleName) ruleNameSet.add(row.ruleName);
      if (row.category) categorySet.add(row.category);
      if (row.ruleType) ruleTypeSet.add(row.ruleType);
    }

    this.uniqueValues = {
      batchSubmittedDate: Array.from(dateSet).sort(),
      rejectedClaims: Array.from(rejectedSet).sort((a, b) => Number(a) - Number(b)),
      rejectionMessage: Array.from(messageSet).sort(),
      ruleName: Array.from(ruleNameSet).sort(),
      category: Array.from(categorySet).sort(),
      ruleType: Array.from(ruleTypeSet).sort(),
    };
  }

private buildRejectionMessageGroups(rows: ClaimVisionBatch[]): void {
  const groups: { [category: string]: Set<string> } = {};

  for (const row of rows) {
    const msg = row.rejectionMessage ?? '';
    const category = this.categorizeRejectionMessage(msg);

    if (!groups[category]) {
      groups[category] = new Set<string>();
    }
    groups[category].add(msg);
  }

  this.groupedValues.rejectionMessage = Object.entries(groups).map(
    ([category, messages]) => ({
      label: category,
      children: Array.from(messages).map(msg => ({
        label: msg,
        value: msg,
      })),
    }),
  );
}

private buildBatchSubmittedDateGroups(rows: ClaimVisionBatch[]): void {
  const groups: { [monthKey: string]: { label: string; dates: Set<string> } } = {};

  for (const row of rows) {
    if (!row.submittedDate) continue;

    const d = new Date(row.submittedDate);
    if (Number.isNaN(d.getTime())) continue;

    const monthLabel = d.toLocaleString(undefined, {
      month: 'long',
      year: 'numeric',
    });

    const displayDate = d.toLocaleDateString();

    if (!groups[monthLabel]) {
      groups[monthLabel] = {
        label: monthLabel,
        dates: new Set<string>(),
      };
    }

    groups[monthLabel].dates.add(displayDate);
  }

  this.groupedValues.batchSubmittedDate = Object.values(groups).map(
    (g) => ({
      label: g.label,
      children: Array.from(g.dates)
        .sort()
        .map((dateStr) => ({
          label: dateStr,
          value: dateStr,
        })),
    })
  );
}

private buildRejectedClaimsGroups(rows: ClaimVisionBatch[]): void {
  const groups: { [bucketLabel: string]: Set<string> } = {};

  for (const row of rows) {
    const count = row.rejectedClaimsCount;
    if (count === undefined || count === null) continue;

    const bucket = this.bucketRejectedClaimsCount(count);
    if (!groups[bucket]) {
      groups[bucket] = new Set<string>();
    }
    groups[bucket].add(count.toString());
  }

  this.groupedValues.rejectedClaims = Object.entries(groups).map(
    ([label, values]) => ({
      label,
      children: Array.from(values)
        .sort((a, b) => Number(a) - Number(b))
        .map((v) => ({
          label: v,
          value: v,
        })),
    })
  );
}

private buildRuleNameGroups(rows: ClaimVisionBatch[]): void {
  const names = new Set<string>();
  for (const row of rows) {
    if (row.ruleName) names.add(row.ruleName);
  }
  this.groupedValues.ruleName = Array.from(names).sort().map(n => ({
    label: n,
    value: n,
  }));
}

private buildCategoryGroups(rows: ClaimVisionBatch[]): void {
  const cats = new Set<string>();
  for (const row of rows) {
    if (row.category) cats.add(row.category);
  }
  this.groupedValues.category = Array.from(cats).sort().map(c => ({
    label: c,
    value: c,
  }));
}

private buildRuleTypeGroups(rows: ClaimVisionBatch[]): void {
  const types = new Set<string>();
  for (const row of rows) {
    if (row.ruleType) types.add(row.ruleType);
  }
  this.groupedValues.ruleType = Array.from(types).sort().map(t => ({
    label: t,
    value: t,
  }));
}

/** Simple bucketing for the "Rejected Claims" count */
private bucketRejectedClaimsCount(num: number): string {
  if (num <= 5) return '1-5';
  if (num <= 10) return '6-10';
  if (num <= 20) return '11-20';
  if (num <= 50) return '21-50';
  return '50+';
}

/** Super simple example */
private categorizeRejectionMessage(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes('duplicate')) return 'Duplicate Claims';
  if (lower.includes('deadline') || lower.includes('timeframe') || lower.includes('timely')) return 'Filing Deadline';
  if (lower.includes('missing') || lower.includes('invalid')) return 'Missing / Invalid Info';
  if (lower.includes('expired') || lower.includes('authorization')) return 'Authorization Issues';
  return 'Other';
}

exportTrend(): void {
    if (!this.trendData.length) return;
    const header = 'Month,Rejected Claims\n';
    const rows = this.trendData.map(d => `"${d.month}",${d.rejectedCount}`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'rejection-trend.csv';
    a.click(); URL.revokeObjectURL(url);
  }

  onTableAction(event: { actionId: string; row: ClaimVisionBatch }): void {
    if (event.actionId === 'view-claims') {
      this.onViewClaims(event.row);
    }
  }

  private onViewClaims(batch: ClaimVisionBatch): void {
    this.router.navigate(['/app/claim-vision/batch', batch.id], {
      state: { batch },
      queryParams: {
        ruleId: batch.ruleId || undefined,
        batchWeekStart: batch.submittedDate || undefined,
      },
    });
  }
}
