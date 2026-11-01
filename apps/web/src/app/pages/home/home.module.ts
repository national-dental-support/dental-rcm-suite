import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

import { MaterialModule } from '../../shared/material/material.module';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { SharedComponentsModule } from '../../shared/shared-components.module';
import { HomeComponent } from './home.component';

@NgModule({
  declarations: [HomeComponent],
  imports: [
    CommonModule,
    RouterModule.forChild([{ path: '', component: HomeComponent }]),
    MaterialModule,
    MatSlideToggleModule,
    SharedComponentsModule,
  ],
})
export class HomeModule {}
