// pages/analytics/ar/ar.module.ts
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { ReactiveFormsModule } from '@angular/forms';

import { MaterialModule } from '../../../shared/material/material.module';
import { SharedComponentsModule } from '../../../shared/shared-components.module';
import { ARComponent } from './ar.component';

@NgModule({ declarations: [ARComponent],
    exports: [ARComponent], imports: [CommonModule,
        ReactiveFormsModule,
        MaterialModule,
        SharedComponentsModule], providers: [provideHttpClient(withInterceptorsFromDi())] })
export class ArModule {}
