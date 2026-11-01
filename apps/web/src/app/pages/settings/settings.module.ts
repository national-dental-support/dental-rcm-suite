import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

import { MaterialModule } from '../../shared/material/material.module';
import { GlobalSettingsComponent } from './settings.component';
import { LocationMappingsComponent } from './location-mappings.component';
import { AdminSharedModule } from '../admin/admin-shared.module';

@NgModule({ declarations: [
        GlobalSettingsComponent,
        LocationMappingsComponent,
    ], imports: [CommonModule,
        MaterialModule,
        AdminSharedModule,
        ReactiveFormsModule,
        FormsModule,
        RouterModule.forChild([
            { path: '', component: GlobalSettingsComponent },
        ])], providers: [provideHttpClient(withInterceptorsFromDi())] })
export class SettingsModule {}
