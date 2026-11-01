import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { NgApexchartsModule } from 'ng-apexcharts';
import { MatTableModule } from '@angular/material/table';
import { RpSkeletonComponent } from './rp-skeleton.component';
import { RpChartSkeletonComponent } from './rp-chart-skeleton/rp-chart-skeleton.component';
import { RpTableSkeletonComponent } from './rp-table-skeleton/rp-table-skeleton.component';


@NgModule({
  declarations: [
   RpSkeletonComponent,
   RpChartSkeletonComponent,
   RpTableSkeletonComponent,
  ],
  imports: [
    CommonModule,
    MatTableModule, // <table mat-table> and [dataSource]
    NgApexchartsModule,
    ReactiveFormsModule,
    
],
  exports: [
  RpSkeletonComponent,
  RpChartSkeletonComponent,
  RpTableSkeletonComponent,
  ]
})
export class RpSkeletonModule {}
