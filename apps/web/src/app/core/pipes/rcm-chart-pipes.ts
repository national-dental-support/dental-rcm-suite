import { Pipe, PipeTransform } from '@angular/core';
import { HorizontalBarDatum } from '../../shared/components/horizontal-bar-chart/horizontal-bar-chart.component';
import {
  ClaimValueByStatusDto,
  ClaimAmountsByPracticeDto,
  CollectionAdjustmentTrendDto,
  ClaimAmountsByPayerDto,
  ClaimValuesByTypeDto,
} from '../models/rcm.models';

// ----------------------
// Types
// ----------------------

// Used only for direct Apex <apx-chart> configs
type ApexSeries = { name: string; data: (number | null)[] }[];

// ----------------------
// 1. Claim Value by Status (top-left)
// ----------------------

// For the simple Apex chart (if used)
@Pipe({
    name: 'toClaimValueSeries', pure: true,
    standalone: false
})
export class ToClaimValueSeriesPipe implements PipeTransform {
  transform(value: ClaimValueByStatusDto[] | null | undefined): ApexSeries {
    if (!Array.isArray(value)) return [];
    return [
      {
        name: 'Claim Value',
        data: value.map(x => x?.ClaimValue ?? 0),
      },
    ];
  }
}

@Pipe({
    name: 'toClaimStatusLabels', pure: true,
    standalone: false
})
export class ToClaimStatusLabelsPipe implements PipeTransform {
  transform(value: ClaimValueByStatusDto[] | null | undefined): string[] {
    if (!Array.isArray(value)) return [];
    return value.map(x => x?.ClaimStatus ?? '');
  }
}

// For the reusable horizontal bar chart
@Pipe({
    name: 'toClaimValueByStatusChart', pure: true,
    standalone: false
})
export class ToClaimValueByStatusChartPipe implements PipeTransform {
  transform(value: ClaimValueByStatusDto[] | null | undefined): HorizontalBarDatum[] {
    if (!Array.isArray(value)) return [];
    return value.map(x => ({
      label: x?.ClaimStatus ?? '',
      value: x?.ClaimValue ?? 0,
    }));
  }
}

// ----------------------
// 2. Claim Amounts by Practice (top-5)
// ----------------------

// For direct Apex usage (if you still have any)
@Pipe({
    name: 'toClaimAmountsSeries', pure: true,
    standalone: false
})
export class ToClaimAmountsSeriesPipe implements PipeTransform {
  transform(value: ClaimAmountsByPracticeDto[] | null | undefined): ApexSeries {
    if (!Array.isArray(value)) return [];
    return [
      {
        name: 'Claim Amount',
        data: value.map(x => x?.TotalClaimAmount ?? 0),
      },
    ];
  }
}

@Pipe({
    name: 'toClaimPracticeLabels', pure: true,
    standalone: false
})
export class ToClaimPracticeLabelsPipe implements PipeTransform {
  transform(value: ClaimAmountsByPracticeDto[] | null | undefined): string[] {
    if (!Array.isArray(value)) return [];
    return value.map(x => x?.Practice ?? '');
  }
}

// For the reusable horizontal bar chart
@Pipe({
    name: 'toClaimAmountsByPracticeChart', pure: true,
    standalone: false
})
export class ToClaimAmountsByPracticeChartPipe implements PipeTransform {
  transform(value: ClaimAmountsByPracticeDto[] | null | undefined): HorizontalBarDatum[] {
    if (!Array.isArray(value)) return [];
    return value.map(x => ({
      label: x?.Practice ?? '',
      value: x?.TotalClaimAmount ?? 0,
    }));
  }
}

// ----------------------
// 3. Collection & Adjustment Trends (combo chart)
// ----------------------

// This stays as a multi-series Apex config.
@Pipe({
    name: 'toCollectionAdjustmentSeries', pure: true,
    standalone: false
})
export class ToCollectionAdjustmentSeriesPipe implements PipeTransform {
  transform(value: CollectionAdjustmentTrendDto[] | null | undefined): any[] {
    if (!Array.isArray(value)) return [];
    return [
      {
        name: 'Collections',
        type: 'column',
        data: value.map(x => x?.Collections ?? 0),
      },
      {
        name: 'Adjustments',
        type: 'column',
        data: value.map(x => x?.Adjustments ?? 0),
      },
      {
        name: 'Collection Rate',
        type: 'line',
        // CollectionRate is 0-1 in SQL; convert to %
        data: value.map(x => (x?.CollectionRate ?? 0) * 100),
      },
    ];
  }
}

@Pipe({
    name: 'toCollectionAdjustmentLabels', pure: true,
    standalone: false
})
export class ToCollectionAdjustmentLabelsPipe implements PipeTransform {
  transform(value: CollectionAdjustmentTrendDto[] | null | undefined): string[] {
    if (!Array.isArray(value)) return [];
    return value.map(x => x?.MonthLabel ?? '');
  }
}

// ----------------------
// 5. Claim Amounts by Payer
// ----------------------

// (Old Apex usage)
@Pipe({
    name: 'toClaimAmountsByPayerSeries', pure: true,
    standalone: false
})
export class ToClaimAmountsByPayerSeriesPipe implements PipeTransform {
  transform(value: ClaimAmountsByPayerDto[] | null | undefined): ApexSeries {
    if (!Array.isArray(value)) return [];
    return [
      {
        name: 'Claim Amount',
        data: value.map(x => x?.TotalClaimAmount ?? 0),
      },
    ];
  }
}

@Pipe({
    name: 'toClaimPayerLabels', pure: true,
    standalone: false
})
export class ToClaimPayerLabelsPipe implements PipeTransform {
  transform(value: ClaimAmountsByPayerDto[] | null | undefined): string[] {
    if (!Array.isArray(value)) return [];
    return value.map(x => x?.Payer ?? '');
  }
}

// New: for horizontal bar chart
@Pipe({
    name: 'toClaimAmountsByPayerChart', pure: true,
    standalone: false
})
export class ToClaimAmountsByPayerChartPipe implements PipeTransform {
  transform(value: ClaimAmountsByPayerDto[] | null | undefined): HorizontalBarDatum[] {
    if (!Array.isArray(value)) return [];
    return value.map(x => ({
      label: x?.Payer ?? '',
      value: x?.TotalClaimAmount ?? 0,
    }));
  }
}

// ----------------------
// 6. Claim Values by Type
// ----------------------

// Old Apex config
@Pipe({
    name: 'toClaimValuesByTypeSeries', pure: true,
    standalone: false
})
export class ToClaimValuesByTypeSeriesPipe implements PipeTransform {
  transform(value: ClaimValuesByTypeDto[] | null | undefined): ApexSeries {
    if (!Array.isArray(value)) return [];
    return [
      {
        name: 'Claim Value',
        data: value.map(x => x?.TotalClaimAmount ?? 0),
      },
    ];
  }
}

@Pipe({
    name: 'toClaimTypeLabels', pure: true,
    standalone: false
})
export class ToClaimTypeLabelsPipe implements PipeTransform {
  transform(value: ClaimValuesByTypeDto[] | null | undefined): string[] {
    if (!Array.isArray(value)) return [];
    return value.map(x => x?.ClaimType ?? '');
  }
}

// New: for horizontal bar chart
@Pipe({
    name: 'toClaimValuesByTypeChart', pure: true,
    standalone: false
})
export class ToClaimValuesByTypeChartPipe implements PipeTransform {
  transform(value: ClaimValuesByTypeDto[] | null | undefined): HorizontalBarDatum[] {
    if (!Array.isArray(value)) return [];
    return value.map(x => {
      const raw = (x?.ClaimType ?? '').trim();
      const label = raw || 'Unknown';  //  fallback when null/empty
      return {
        label,
        value: x?.TotalClaimAmount ?? 0,
      };
    });
  }
}

