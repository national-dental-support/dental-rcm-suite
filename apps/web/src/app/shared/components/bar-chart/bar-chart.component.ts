// bar-chart.component.ts
import { Component, Input } from '@angular/core';
import { ApexAxisChartSeries, ApexChart, ApexXAxis, ApexDataLabels } from 'ng-apexcharts';

export interface BarChartInput {
  categories: string[];
  series: { name: string; type?: 'line' | 'column'; data: (number|null)[] }[];
}

@Component({
    selector: 'app-bar-chart',
    templateUrl: './bar-chart.component.html',
    styleUrls: ['bar-chart.component.scss'],
    standalone: false
})
export class BarChartComponent {
  series: ApexAxisChartSeries = [];
  chart: ApexChart = { type: 'bar', height: 320, stacked: false };
  xaxis: ApexXAxis = { categories: [] };
  dataLabels: ApexDataLabels = { enabled: false };
  hasData = false; // stays false until data setter receives non-empty input

  @Input() set data(value: BarChartInput | any) {
    const safe = this.sanitize(value);
    this.series = safe.series;
    this.xaxis = { categories: safe.categories };
    this.hasData = safe.series.some(s => s.data.some(v => v !== null && v !== undefined));
  }

  private sanitize(v: any): BarChartInput {
    const categories = Array.isArray(v?.categories)
      ? v.categories.map((x: any) => String(x ?? ''))
      : [];

    const series = Array.isArray(v?.series)
      ? v.series.map((s: any, i: number) => ({
          name: s?.name ?? `Series ${i + 1}`,
          type: (s?.type === 'line' || s?.type === 'column') ? s.type : 'column',
          data: Array.isArray(s?.data) ? s.data.map((n: any) => {
            if (n == null || n === '') return null;
            const num = Number(n);
            return Number.isFinite(num) ? num : null;
          }) : []
        }))
      : [];

    const maxLen = series.reduce((m, s) => Math.max(m, s.data.length || 0), 0);
    const cats = categories.length ? categories : Array.from({ length: maxLen }, (_, i) => `${i + 1}`);

    return { categories: cats, series };
  }
}
