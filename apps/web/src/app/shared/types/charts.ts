import { ApexAxisChartSeries, ApexChart, ApexXAxis, ApexDataLabels, ApexPlotOptions, ApexStroke, ApexGrid, ApexTooltip, ApexFill, ApexMarkers, ApexLegend, ApexAnnotations, ApexYAxis } from 'ng-apexcharts';
export type ChartOptions = {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  xaxis?: ApexXAxis;
  yaxis?: ApexYAxis | ApexYAxis[];
  dataLabels?: ApexDataLabels;
  plotOptions?: ApexPlotOptions;
  stroke?: ApexStroke;
  grid?: ApexGrid;
  tooltip?: ApexTooltip;
  fill?: ApexFill;
  markers?: ApexMarkers;
  legend?: ApexLegend;
  annotations?: ApexAnnotations;
  colors?: string[];
};