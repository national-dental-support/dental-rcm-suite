// src/app/pages/admin/admin-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminComponent } from './admin';
import { AddUserComponent } from './users-list/add-user/add-user.component';
import { RemediationAdminComponent } from './remediation/remediation.component';

const routes: Routes = [
  // Tabbed admin shell
  { path: '', component: AdminComponent },

  // Remediation SOP library - standalone full-page editor
  // (?code=CO50&role=ar-specialist)
  { path: 'remediation', component: RemediationAdminComponent },

  // User add/edit, navigated away from the admin shell
  { path: 'users/add', component: AddUserComponent, data: { ctx: 'portal', mode: 'add' } },
  { path: 'users/edit/:id', component: AddUserComponent, data: { ctx: 'portal', mode: 'edit' } },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AdminRoutingModule {}
