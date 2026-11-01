import { Component, ViewChild, ChangeDetectionStrategy, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { ChartComponent } from 'ng-apexcharts';
import { Subscription } from 'rxjs';
import { ChartOptions } from '../../types/charts';
import { ThemeService } from '../../../core/services/theme.service';

interface ChartData { date: string; collections: number; adjustments: number; }
const DATA: ChartData[] = [
  { date: '2023-07-01', collections: 1500, adjustments: 900 },
  { date: '2023-07-02', collections: 1800, adjustments: 1200 },
  { date: '2023-07-03', collections: 800,  adjustments: 650 },
];

@Component({
    selector: 'app-insurance-and-patient-collections-bar-chart',
    template: `<apx-chart [series]="options.series" [chart]="options.chart" [plotOptions]="options.plotOptions"
                        [dataLabels]="options.dataLabels" [stroke]="options.stroke" [xaxis]="options.xaxis"
                        [yaxis]="options.yaxis" [fill]="options.fill" [tooltip]="options.tooltip" [grid]="options.grid"
                        [colors]="options.colors || []">
             </apx-chart>`,
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class InsuranceAndPatientCollectionsBarChartComponent implements OnInit, OnDestroy {
  @ViewChild('chart', { static: false }) chart?: ChartComponent;
  options: Partial<ChartOptions> = {};

  private themeSub?: Subscription;

  constructor(private themeService: ThemeService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.themeSub = this.themeService.theme$.subscribe(t => {
      this.options = {
        series: [
          { name: 'Collections', data: DATA.map(d => d.collections) },
          { name: 'Adjustments', data: DATA.map(d => d.adjustments) },
        ],
        colors: [t.chart_color_1, t.chart_color_2],
        chart: { type: 'bar', height: 350, toolbar: { show: false } },
        plotOptions: { bar: { horizontal: false, columnWidth: '55%' } },
        dataLabels: { enabled: false },
        stroke: { show: true, width: 2, colors: ['transparent'] },
        xaxis: { categories: DATA.map(d => d.date), labels: { rotate: -45 } },
        yaxis: { title: { text: 'Amount (USD)' } },
        fill: { opacity: 1 },
        tooltip: { y: { formatter: (val: number) => `$${val}` } },
        grid: { borderColor: '#e7e7e7', row: { colors: ['#f3f3f3', 'transparent'], opacity: 0.5 } },
      } as any;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
  }
}
