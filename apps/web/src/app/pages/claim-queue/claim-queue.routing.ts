import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ClaimQueueListComponent } from './components/claim-queue-list/claim-queue-list.component';
import { ClaimDetailComponent } from './components/claim-detail/claim-detail.component';
import { DenialIqShellComponent } from './denial-iq-shell/denial-iq-shell.component';
import { DenialIqAdminSettingsComponent } from './denial-iq-admin-settings/denial-iq-admin-settings.component';
import { ManagerApprovalQueueComponent } from './components/manager-approval-queue/manager-approval-queue.component';
import { ComplianceCheckerComponent } from './components/compliance-checker/compliance-checker.component';
import { PatientAdvocacyComponent } from './components/patient-advocacy/patient-advocacy.component';
import { adminGuard } from '../../guards/admin.guard';

const routes: Routes = [
  // Shell - wraps all Denial-IQ views so the tab nav always shows
  {
    path: '',
    component: DenialIqShellComponent,
    children: [
      { path: '',                    pathMatch: 'full', redirectTo: 'claim-queue' },
      { path: 'admin-settings',      component: DenialIqAdminSettingsComponent, canActivate: [adminGuard] },
      { path: 'approvals',           component: ManagerApprovalQueueComponent },
      { path: 'compliance-checker',  component: ComplianceCheckerComponent },
      { path: 'patient-advocacy',    component: PatientAdvocacyComponent },
      // Claim queue - inside the shell so the tab nav persists
      {
        path: 'claim-queue',
        children: [
          { path: 'manager',       component: ClaimQueueListComponent, data: { queueType: 'manager' } },
          { path: 'ar-specialist', component: ClaimQueueListComponent, data: { queueType: 'ar-specialist' } },
          { path: '',              pathMatch: 'full', redirectTo: 'ar-specialist' },
          { path: ':id',           component: ClaimDetailComponent },
        ],
      },
    ],
  },
];


@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ClaimQueueRoutingModule {}
