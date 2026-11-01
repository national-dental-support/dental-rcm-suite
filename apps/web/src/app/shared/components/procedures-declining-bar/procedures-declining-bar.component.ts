import { Component, ChangeDetectionStrategy } from '@angular/core';
import { ChartOptions } from '../../types/charts';

const PRACTICE_DATA = [
  { practice: 'D1036', totalAmount: 4000 },
  { practice: 'D4255', totalAmount: 3459 },
  { practice: 'D6065', totalAmount: 3199 },
  { practice: 'D6078', totalAmount: 3086 },
  { practice: 'N5410', totalAmount: 2906 },
  { practice: 'D1033', totalAmount: 2703 },
  { practice: 'D1606', totalAmount: 1651 },
];

@Component({
    selector: 'app-procedures-declining-bar-chart',
    template: `
    <apx-chart
      [series]="options.series"
      [chart]="options.chart"
      [plotOptions]="options.plotOptions"
      [xaxis]="options.xaxis"
      [yaxis]="options.yaxis"
      [grid]="options.grid"
      [annotations]="options.annotations"
      [dataLabels]="options.dataLabels">
    </apx-chart>
  `,
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class ProceduresDecliningBarChartComponent {
  private categories = PRACTICE_DATA.map(x => x.practice);
  private data = PRACTICE_DATA.map(x => x.totalAmount);

  options: Partial<ChartOptions> = {
    series: [{ name: 'Total Amount', data: this.data }],
    chart: { id: 'horizontal-bar', type: 'bar', toolbar: { show: false } },
    plotOptions: {
      bar: {
        horizontal: true,
        borderRadius: 5,
        dataLabels: { position: 'top' },   // <-- keep position here
        colors: { ranges: [{ from: 0, to: 1_000_000, color: '#F97066' }] },
        barHeight: '70%',
        columnWidth: '70%'
      }
    },
    xaxis: {
      // reversed: true, // <-- not supported on xaxis typings; remove
      categories: this.categories,
      labels: { show: false },
      axisBorder: { show: false },
      axisTicks: { show: false }
    },
    yaxis: {
      reversed: true,
      labels: {
        offsetX: 50,                         // <-- move offsetX into labels
        style: {
          fontSize: '12px',
          fontFamily: 'Inter, sans-serif',
          colors: '#667085',
          fontWeight: 400
        }
      }
    },
    grid: {
      yaxis: { lines: { show: false } },
      xaxis: { lines: { show: false } },
      padding: { left: 20 }
    },
    annotations: { xaxis: [{ x: 0, strokeDashArray: 0, borderColor: '#E0E0E0', offsetX: 0 }] },
    dataLabels: {
      enabled: true,
      // position: 'end',      // <-- remove (not valid on ApexDataLabels)
      offsetX: 40,
      background: { enabled: false },
      style: {
        colors: ['#667085'],
        fontSize: '14px',
        fontFamily: 'Inter, sans-serif',
        fontWeight: 400
      },
      formatter: (val: number) =>
        val >= 1_000_000 ? `$${(val / 1_000_000).toFixed(1)}M` :
        val >= 1_000     ? `$${(val / 1_000).toFixed(1)}K` :
                           `$${val.toLocaleString()}`
    }
  };
}
