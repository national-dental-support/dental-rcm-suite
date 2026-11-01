// src/app/pages/claim-vision/claim-vision-routing.module.ts

import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ClaimVisionTabsComponent } from './claim-vision-tabs.component';
import { ClaimVisionRulesPageComponent } from './rules/claim-vision-rules-page/claim-vision-rules-page.component';
import { RuleCreatePageComponent } from './rules/rule-create-page/rule-create-page.component';
import { RuleDetailsPageComponent } from './rules/rule-details-page/rule-details-page.component';
import { NewRejectedClaimsComponent } from './new-rejected-claims/rejected-claims.component';
import { NewRejectedClaimsDetailComponent } from './new-rejected-claims/rejected-claims-detail/rejected-claims-detail.component';
import { RuleEditPageComponent } from './rules/rule-edit-page/rule-edit-page.component';

const routes: Routes = [
  {
    path: '',
    component: ClaimVisionTabsComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'rejected-claims' },
      { path: 'rejected-claims', component: NewRejectedClaimsComponent },
      { path: 'rules', component: ClaimVisionRulesPageComponent },
    ],
  },
  // Detail pages render outside the tab bar
  { path: 'batch/:id', component: NewRejectedClaimsDetailComponent },
  { path: 'rules/new', component: RuleCreatePageComponent },
  { path: 'rules/:id', component: RuleDetailsPageComponent },
  { path: 'rules/:id/edit', component: RuleEditPageComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ClaimVisionRoutingModule {}
