import { provideZoneChangeDetection } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { AppModule } from './app/app.module';

// Global ApexCharts defaults - applies to every apx-chart instance in the app.
// When a chart has no data, show a consistent "no data" message.
(window as any).Apex = {
  noData: {
    text: 'No data available at this time',
    align: 'center',
    verticalAlign: 'middle',
    style: {
      color: 'rgba(0,0,0,0.45)',
      fontSize: '14px',
      fontFamily: 'inherit',
    },
  },
};

platformBrowserDynamic()
  .bootstrapModule(AppModule, { applicationProviders: [provideZoneChangeDetection()] })
  .catch(err => console.error(err));
