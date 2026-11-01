// src/app/pages/claim-vision/claim-vision.module.ts

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { ClaimVisionRoutingModule } from './claim-vision-routing.module';
import { MaterialModule } from '../../shared/material/material.module';
import { SharedComponentsModule } from '../../shared/shared-components.module';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBarModule } from '@angular/material/snack-bar';

import { ClaimVisionTabsComponent } from './claim-vision-tabs.component';
import { ClaimVisionRulesPageComponent } from './rules/claim-vision-rules-page/claim-vision-rules-page.component';
import { RulesListCardComponent } from './rules/rules-list-card/rules-list-card.component';
import { RuleEditorComponent } from './rules/rule-editor/rule-editor.component';
import { RuleCreatePageComponent } from './rules/rule-create-page/rule-create-page.component';
import { RuleDetailsPageComponent } from './rules/rule-details-page/rule-details-page.component';
import { NewRejectedClaimsComponent } from './new-rejected-claims/rejected-claims.component';
import { NewRejectedClaimsDetailComponent } from './new-rejected-claims/rejected-claims-detail/rejected-claims-detail.component';
import { NewConfirmMarkCompleteDialogComponent } from './new-rejected-claims/confirm-mark-complete-dialog/confirm-mark-complete-dialog.component';
import { RuleEditPageComponent } from './rules/rule-edit-page/rule-edit-page.component';

@NgModule({
  declarations: [
    ClaimVisionTabsComponent,
    ClaimVisionRulesPageComponent,
    RulesListCardComponent,
    RuleEditorComponent,
    RuleCreatePageComponent,
    RuleDetailsPageComponent,
    NewRejectedClaimsComponent,
    NewRejectedClaimsDetailComponent,
    NewConfirmMarkCompleteDialogComponent,
    RuleEditPageComponent
  ],
  imports: [
    CommonModule,
    SharedComponentsModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    ClaimVisionRoutingModule,
    MaterialModule,
    MatSlideToggleModule,
    MatSnackBarModule,
  ],
})
export class ClaimVisionModule {}
