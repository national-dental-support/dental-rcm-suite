import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
    selector: 'app-dashboard-shell',
    template: `
    <nav mat-tab-nav-bar [tabPanel]="subPanel" class="dashboard-sub-nav">
      <a mat-tab-link routerLink="overview"              routerLinkActive #ov="routerLinkActive" [active]="ov.isActive">Overview</a>
      <a mat-tab-link routerLink="finance-summary"       routerLinkActive #fs="routerLinkActive" [active]="fs.isActive">Finance Summary</a>
      <a mat-tab-link routerLink="reconciliation-report" routerLinkActive #rr="routerLinkActive" [active]="rr.isActive">Reconciliation Report</a>
    </nav>
    <mat-tab-nav-panel #subPanel>
      <router-outlet></router-outlet>
    </mat-tab-nav-panel>
  `,
    styles: [`
    :host { display: block; }
    .dashboard-sub-nav {
      background: #fff;
      border-bottom: 1px solid #e0e0e0;
      padding: 0 24px;
    }
  `],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class DashboardShellComponent {}
