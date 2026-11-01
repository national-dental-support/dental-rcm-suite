import {
  ApexAxisChartSeries,
  ApexChart,
  ApexDataLabels,
  ApexFill,
  ApexGrid,
  ApexLegend,
  ApexMarkers,
  ApexPlotOptions,
  ApexStroke,
  ApexTooltip,
  ApexXAxis,
  ApexYAxis,
} from 'ng-apexcharts';

export type RpMixedSeriesType = 'line' | 'column' | 'area';

export type RpMixedSeries = {
  name: string;
  type: RpMixedSeriesType;
  data: (number | null)[];
};

export type RpMixedChartValueFormat = 'none' | 'number' | 'currency' | 'percent';

export type RpStackType = 'normal' | '100%';

export type RpApexChart = ApexChart & {
  stackOnlyBar?: boolean;
};

export type RpApexYAxis = ApexYAxis & {
  seriesName?: string | string[];
};

export interface RpMixedChartConfig {
  height?: number;
  categories: string[];
  series: RpMixedSeries[];

  seriesFormats?: RpMixedChartValueFormat[];
  yAxis?: RpApexYAxis | RpApexYAxis[];

  chart?: Partial<RpApexChart>;
  xaxis?: Partial<ApexXAxis>;
  stroke?: Partial<ApexStroke>;
  markers?: Partial<ApexMarkers>;
  plotOptions?: Partial<ApexPlotOptions>;
  dataLabels?: Partial<ApexDataLabels>;
  fill?: Partial<ApexFill>;
  grid?: Partial<ApexGrid>;
  legend?: Partial<ApexLegend>;
  tooltip?: Partial<ApexTooltip>;
  colors?: string[]; // [ok] series colors in order 
  strokeColors?: string[]; // (optional) line-only overrides if you want:
}

