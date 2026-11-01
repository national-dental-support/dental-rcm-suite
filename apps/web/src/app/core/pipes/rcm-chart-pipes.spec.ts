import {
  ToClaimValueSeriesPipe,
  ToClaimStatusLabelsPipe,
  ToClaimValueByStatusChartPipe,
  ToClaimAmountsSeriesPipe,
  ToClaimPracticeLabelsPipe,
  ToClaimAmountsByPracticeChartPipe,
  ToCollectionAdjustmentSeriesPipe,
  ToCollectionAdjustmentLabelsPipe,
  ToClaimAmountsByPayerSeriesPipe,
  ToClaimPayerLabelsPipe,
  ToClaimAmountsByPayerChartPipe,
  ToClaimValuesByTypeSeriesPipe,
  ToClaimTypeLabelsPipe,
  ToClaimValuesByTypeChartPipe,
} from './rcm-chart-pipes';
import {
  ClaimValueByStatusDto,
  ClaimAmountsByPracticeDto,
  CollectionAdjustmentTrendDto,
  ClaimAmountsByPayerDto,
  ClaimValuesByTypeDto,
} from '../models/rcm.models';

describe('RCM Chart Pipes', () => {

  // -- ToClaimValueSeriesPipe --

  describe('ToClaimValueSeriesPipe', () => {
    const pipe = new ToClaimValueSeriesPipe();

    it('should return empty array for null input', () => {
      expect(pipe.transform(null)).toEqual([]);
    });

    it('should return empty array for undefined input', () => {
      expect(pipe.transform(undefined)).toEqual([]);
    });

    it('should map ClaimValue to series data', () => {
      const input: ClaimValueByStatusDto[] = [
        { ClaimStatus: 'Open', ClaimValue: 1000 },
        { ClaimStatus: 'Closed', ClaimValue: 2000 },
      ];
      const result = pipe.transform(input);
      expect(result[0].name).toBe('Claim Value');
      expect(result[0].data).toEqual([1000, 2000]);
    });
  });

  // -- ToClaimStatusLabelsPipe --

  describe('ToClaimStatusLabelsPipe', () => {
    const pipe = new ToClaimStatusLabelsPipe();

    it('should return empty array for null input', () => {
      expect(pipe.transform(null)).toEqual([]);
    });

    it('should extract ClaimStatus labels', () => {
      const input: ClaimValueByStatusDto[] = [
        { ClaimStatus: 'Open', ClaimValue: 100 },
        { ClaimStatus: 'Denied', ClaimValue: 200 },
      ];
      expect(pipe.transform(input)).toEqual(['Open', 'Denied']);
    });
  });

  // -- ToClaimValueByStatusChartPipe --

  describe('ToClaimValueByStatusChartPipe', () => {
    const pipe = new ToClaimValueByStatusChartPipe();

    it('should return empty array for null', () => {
      expect(pipe.transform(null)).toEqual([]);
    });

    it('should map to HorizontalBarDatum format', () => {
      const input: ClaimValueByStatusDto[] = [
        { ClaimStatus: 'Pending', ClaimValue: 500 },
      ];
      const result = pipe.transform(input);
      expect(result[0]).toEqual({ label: 'Pending', value: 500 });
    });
  });

  // -- ToClaimAmountsSeriesPipe --

  describe('ToClaimAmountsSeriesPipe', () => {
    const pipe = new ToClaimAmountsSeriesPipe();

    it('should return empty array for null', () => {
      expect(pipe.transform(null)).toEqual([]);
    });

    it('should map TotalClaimAmount to series data', () => {
      const input: ClaimAmountsByPracticeDto[] = [
        { Practice: 'P1', TotalClaimAmount: 3000 },
      ];
      const result = pipe.transform(input);
      expect(result[0].data).toEqual([3000]);
    });
  });

  // -- ToClaimPracticeLabelsPipe --

  describe('ToClaimPracticeLabelsPipe', () => {
    const pipe = new ToClaimPracticeLabelsPipe();

    it('should return empty array for null', () => {
      expect(pipe.transform(null)).toEqual([]);
    });

    it('should extract Practice labels', () => {
      const input: ClaimAmountsByPracticeDto[] = [
        { Practice: 'Downtown', TotalClaimAmount: 1000 },
      ];
      expect(pipe.transform(input)).toEqual(['Downtown']);
    });
  });

  // -- ToClaimAmountsByPracticeChartPipe --

  describe('ToClaimAmountsByPracticeChartPipe', () => {
    const pipe = new ToClaimAmountsByPracticeChartPipe();

    it('should return empty array for null', () => {
      expect(pipe.transform(null)).toEqual([]);
    });

    it('should map to HorizontalBarDatum', () => {
      const input: ClaimAmountsByPracticeDto[] = [
        { Practice: 'North', TotalClaimAmount: 700 },
      ];
      expect(pipe.transform(input)).toEqual([{ label: 'North', value: 700 }]);
    });
  });

  // -- ToCollectionAdjustmentSeriesPipe --

  describe('ToCollectionAdjustmentSeriesPipe', () => {
    const pipe = new ToCollectionAdjustmentSeriesPipe();

    it('should return empty array for null', () => {
      expect(pipe.transform(null)).toEqual([]);
    });

    it('should produce 3 series (Collections, Adjustments, Collection Rate)', () => {
      const input: CollectionAdjustmentTrendDto[] = [
        { MonthLabel: 'Jan', Collections: 1000, Adjustments: 200, CollectionRate: 0.85 },
      ];
      const result = pipe.transform(input);
      expect(result.length).toBe(3);
      expect(result[0].name).toBe('Collections');
      expect(result[1].name).toBe('Adjustments');
      expect(result[2].name).toBe('Collection Rate');
    });

    it('should convert CollectionRate from 0-1 to percentage', () => {
      const input: CollectionAdjustmentTrendDto[] = [
        { MonthLabel: 'Jan', Collections: 100, Adjustments: 10, CollectionRate: 0.75 },
      ];
      const result = pipe.transform(input);
      expect(result[2].data[0]).toBe(75);
    });
  });

  // -- ToCollectionAdjustmentLabelsPipe --

  describe('ToCollectionAdjustmentLabelsPipe', () => {
    const pipe = new ToCollectionAdjustmentLabelsPipe();

    it('should return empty array for null', () => {
      expect(pipe.transform(null)).toEqual([]);
    });

    it('should extract MonthLabel', () => {
      const input: CollectionAdjustmentTrendDto[] = [
        { MonthLabel: 'Feb 2024', Collections: 0, Adjustments: 0, CollectionRate: 0 },
      ];
      expect(pipe.transform(input)).toEqual(['Feb 2024']);
    });
  });

  // -- ToClaimAmountsByPayerSeriesPipe --

  describe('ToClaimAmountsByPayerSeriesPipe', () => {
    const pipe = new ToClaimAmountsByPayerSeriesPipe();

    it('should return empty array for null', () => {
      expect(pipe.transform(null)).toEqual([]);
    });

    it('should map TotalClaimAmount to data', () => {
      const input: ClaimAmountsByPayerDto[] = [
        { Payer: 'Aetna', TotalClaimAmount: 5000 },
      ];
      expect(pipe.transform(input)[0].data).toEqual([5000]);
    });
  });

  // -- ToClaimPayerLabelsPipe --

  describe('ToClaimPayerLabelsPipe', () => {
    const pipe = new ToClaimPayerLabelsPipe();

    it('should return empty array for null', () => {
      expect(pipe.transform(null)).toEqual([]);
    });

    it('should extract Payer labels', () => {
      const input: ClaimAmountsByPayerDto[] = [
        { Payer: 'Cigna', TotalClaimAmount: 1000 },
      ];
      expect(pipe.transform(input)).toEqual(['Cigna']);
    });
  });

  // -- ToClaimAmountsByPayerChartPipe --

  describe('ToClaimAmountsByPayerChartPipe', () => {
    const pipe = new ToClaimAmountsByPayerChartPipe();

    it('should return empty array for null', () => {
      expect(pipe.transform(null)).toEqual([]);
    });

    it('should map to HorizontalBarDatum', () => {
      const input: ClaimAmountsByPayerDto[] = [
        { Payer: 'UHC', TotalClaimAmount: 4500 },
      ];
      expect(pipe.transform(input)).toEqual([{ label: 'UHC', value: 4500 }]);
    });
  });

  // -- ToClaimValuesByTypeSeriesPipe --

  describe('ToClaimValuesByTypeSeriesPipe', () => {
    const pipe = new ToClaimValuesByTypeSeriesPipe();

    it('should return empty array for null', () => {
      expect(pipe.transform(null)).toEqual([]);
    });

    it('should map TotalClaimAmount to data', () => {
      const input: ClaimValuesByTypeDto[] = [
        { ClaimType: 'Inpatient', TotalClaimAmount: 8000 },
      ];
      expect(pipe.transform(input)[0].data).toEqual([8000]);
    });
  });

  // -- ToClaimTypeLabelsPipe --

  describe('ToClaimTypeLabelsPipe', () => {
    const pipe = new ToClaimTypeLabelsPipe();

    it('should return empty array for null', () => {
      expect(pipe.transform(null)).toEqual([]);
    });

    it('should extract ClaimType labels', () => {
      const input: ClaimValuesByTypeDto[] = [
        { ClaimType: 'Outpatient', TotalClaimAmount: 300 },
      ];
      expect(pipe.transform(input)).toEqual(['Outpatient']);
    });
  });

  // -- ToClaimValuesByTypeChartPipe --

  describe('ToClaimValuesByTypeChartPipe', () => {
    const pipe = new ToClaimValuesByTypeChartPipe();

    it('should return empty array for null', () => {
      expect(pipe.transform(null)).toEqual([]);
    });

    it('should map to HorizontalBarDatum', () => {
      const input: ClaimValuesByTypeDto[] = [
        { ClaimType: 'Vision', TotalClaimAmount: 1200 },
      ];
      expect(pipe.transform(input)).toEqual([{ label: 'Vision', value: 1200 }]);
    });

    it('should use "Unknown" label for empty/null ClaimType', () => {
      const input: ClaimValuesByTypeDto[] = [
        { ClaimType: '', TotalClaimAmount: 500 },
      ];
      expect(pipe.transform(input)[0].label).toBe('Unknown');
    });

    it('should handle null ClaimType with "Unknown" fallback', () => {
      const input: ClaimValuesByTypeDto[] = [
        { ClaimType: null as any, TotalClaimAmount: 100 },
      ];
      expect(pipe.transform(input)[0].label).toBe('Unknown');
    });

    it('should use ?? 0 for null TotalClaimAmount in ToClaimValuesByTypeChart', () => {
      const input: ClaimValuesByTypeDto[] = [
        { ClaimType: 'Inpatient', TotalClaimAmount: null as any },
      ];
      expect(pipe.transform(input)[0].value).toBe(0);
    });
  });

  // -- Null-item ?? fallback coverage ----------------------------------------
  // These tests cover the x?.Foo ?? fallback branches when individual array item fields are null

  describe('Null-item ?? fallbacks', () => {
    it('ToClaimValueSeriesPipe: ?? 0 fallback when ClaimValue is null', () => {
      const pipe2 = new ToClaimValueSeriesPipe();
      const input: ClaimValueByStatusDto[] = [{ ClaimStatus: 'Open', ClaimValue: null as any }];
      expect(pipe2.transform(input)[0].data[0]).toBe(0);
    });

    it('ToClaimStatusLabelsPipe: ?? "" fallback when ClaimStatus is null', () => {
      const pipe2 = new ToClaimStatusLabelsPipe();
      const input: ClaimValueByStatusDto[] = [{ ClaimStatus: null as any, ClaimValue: 100 }];
      expect(pipe2.transform(input)[0]).toBe('');
    });

    it('ToClaimValueByStatusChartPipe: ?? "" and ?? 0 fallbacks for null item fields', () => {
      const pipe2 = new ToClaimValueByStatusChartPipe();
      const input: ClaimValueByStatusDto[] = [{ ClaimStatus: null as any, ClaimValue: null as any }];
      const result = pipe2.transform(input);
      expect(result[0].label).toBe('');
      expect(result[0].value).toBe(0);
    });

    it('ToClaimAmountsSeriesPipe: ?? 0 fallback when TotalClaimAmount is null', () => {
      const pipe2 = new ToClaimAmountsSeriesPipe();
      const input: ClaimAmountsByPracticeDto[] = [{ Practice: 'P1', TotalClaimAmount: null as any }];
      expect(pipe2.transform(input)[0].data[0]).toBe(0);
    });

    it('ToClaimPracticeLabelsPipe: ?? "" fallback when Practice is null', () => {
      const pipe2 = new ToClaimPracticeLabelsPipe();
      const input: ClaimAmountsByPracticeDto[] = [{ Practice: null as any, TotalClaimAmount: 100 }];
      expect(pipe2.transform(input)[0]).toBe('');
    });

    it('ToClaimAmountsByPracticeChartPipe: ?? "" and ?? 0 for null fields', () => {
      const pipe2 = new ToClaimAmountsByPracticeChartPipe();
      const input: ClaimAmountsByPracticeDto[] = [{ Practice: null as any, TotalClaimAmount: null as any }];
      const result = pipe2.transform(input);
      expect(result[0].label).toBe('');
      expect(result[0].value).toBe(0);
    });

    it('ToCollectionAdjustmentSeriesPipe: ?? 0 fallbacks when fields are null', () => {
      const pipe2 = new ToCollectionAdjustmentSeriesPipe();
      const input: CollectionAdjustmentTrendDto[] = [
        { MonthLabel: 'Jan', Collections: null as any, Adjustments: null as any, CollectionRate: null as any },
      ];
      const result = pipe2.transform(input);
      expect(result[0].data[0]).toBe(0);
      expect(result[1].data[0]).toBe(0);
      expect(result[2].data[0]).toBe(0);
    });

    it('ToCollectionAdjustmentLabelsPipe: ?? "" fallback when MonthLabel is null', () => {
      const pipe2 = new ToCollectionAdjustmentLabelsPipe();
      const input: CollectionAdjustmentTrendDto[] = [
        { MonthLabel: null as any, Collections: 0, Adjustments: 0, CollectionRate: 0 },
      ];
      expect(pipe2.transform(input)[0]).toBe('');
    });

    it('ToClaimAmountsByPayerSeriesPipe: ?? 0 fallback when TotalClaimAmount is null', () => {
      const pipe2 = new ToClaimAmountsByPayerSeriesPipe();
      const input: ClaimAmountsByPayerDto[] = [{ Payer: 'Aetna', TotalClaimAmount: null as any }];
      expect(pipe2.transform(input)[0].data[0]).toBe(0);
    });

    it('ToClaimPayerLabelsPipe: ?? "" fallback when Payer is null', () => {
      const pipe2 = new ToClaimPayerLabelsPipe();
      const input: ClaimAmountsByPayerDto[] = [{ Payer: null as any, TotalClaimAmount: 0 }];
      expect(pipe2.transform(input)[0]).toBe('');
    });

    it('ToClaimAmountsByPayerChartPipe: ?? "" and ?? 0 for null fields', () => {
      const pipe2 = new ToClaimAmountsByPayerChartPipe();
      const input: ClaimAmountsByPayerDto[] = [{ Payer: null as any, TotalClaimAmount: null as any }];
      const result = pipe2.transform(input);
      expect(result[0].label).toBe('');
      expect(result[0].value).toBe(0);
    });

    it('ToClaimValuesByTypeSeriesPipe: ?? 0 fallback when TotalClaimAmount is null', () => {
      const pipe2 = new ToClaimValuesByTypeSeriesPipe();
      const input: ClaimValuesByTypeDto[] = [{ ClaimType: 'Outpatient', TotalClaimAmount: null as any }];
      expect(pipe2.transform(input)[0].data[0]).toBe(0);
    });

    it('ToClaimTypeLabelsPipe: ?? "" fallback when ClaimType is null', () => {
      const pipe2 = new ToClaimTypeLabelsPipe();
      const input: ClaimValuesByTypeDto[] = [{ ClaimType: null as any, TotalClaimAmount: 0 }];
      expect(pipe2.transform(input)[0]).toBe('');
    });
  });
});
