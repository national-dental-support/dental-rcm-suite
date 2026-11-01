import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { ChartOptions } from '../../types/charts';
import { ThemeService } from '../../../core/services/theme.service';

interface ChartData { date: string; underThirtyDays: number; overNinetyDays: number; }
const DATA: ChartData[] = [
  { date: '2023-07-01', underThirtyDays: 200, overNinetyDays: 50 },
  { date: '2023-07-02', underThirtyDays: 180, overNinetyDays: 70 },
  { date: '2023-07-03', underThirtyDays: 210, overNinetyDays: 40 },
];

@Component({
    selector: 'app-insurance-and-patient-collections-trends-line-chart',
    template: `<apx-chart [series]="options.series!" [chart]="options.chart!" [dataLabels]="options.dataLabels!"
                        [stroke]="options.stroke!" [xaxis]="options.xaxis!" [tooltip]="options.tooltip!"
                        [grid]="options.grid!" [markers]="options.markers || {}" [legend]="options.legend!"
                        [colors]="options.colors || []">
             </apx-chart>`,
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class InsuranceAndPatientCollectionsTrendsLineChartComponent implements OnInit, OnDestroy {
  options: Partial<ChartOptions> = {};

  private themeSub?: Subscription;

  constructor(private themeService: ThemeService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.themeSub = this.themeService.theme$.subscribe(t => {
      this.options = {
        series: [
          { name: '<30 Days', data: DATA.map(d => d.underThirtyDays) },
          { name: '>90 Days', data: DATA.map(d => d.overNinetyDays) },
        ],
        colors: [t.chart_color_1, t.chart_color_2],
        chart: { type: 'line', height: 350, toolbar: { show: false }, zoom: { enabled: false } },
        dataLabels: { enabled: false },
        stroke: { curve: 'smooth', width: 3 },
        xaxis: { categories: DATA.map(d => d.date), labels: { rotate: -45 } },
        tooltip: { y: { formatter: (val: number) => `$${val}` } },
        grid: { borderColor: '#e7e7e7', row: { colors: ['#f3f3f3', 'transparent'], opacity: 0.5 } },
        markers: { size: 5, hover: { size: 7 } },
        legend: { position: 'top', horizontalAlign: 'right', floating: true, offsetY: -25, offsetX: -5 },
      };
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
  }
}
