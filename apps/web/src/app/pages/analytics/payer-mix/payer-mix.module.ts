import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { ReactiveFormsModule } from '@angular/forms';

import { MaterialModule } from '../../../shared/material/material.module';
import { SharedComponentsModule } from '../../../shared/shared-components.module';
import { NgApexchartsModule } from 'ng-apexcharts';
import { PayerMixComponent } from './payer-mix.component';

@NgModule({ declarations: [PayerMixComponent],
    exports: [PayerMixComponent], imports: [CommonModule,
        ReactiveFormsModule,
        MaterialModule,
        SharedComponentsModule,
        NgApexchartsModule], providers: [provideHttpClient(withInterceptorsFromDi())] })
export class PayerMixModule {}
