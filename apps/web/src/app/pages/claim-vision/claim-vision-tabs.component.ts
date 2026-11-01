import { ChangeDetectionStrategy, Component } from '@angular/core';

type Tab = { label: string; link: string };

@Component({
    selector: 'app-claim-vision-tabs',
    template: `
    <nav mat-tab-nav-bar [tabPanel]="panel">
      @for (t of tabs; track trackByLabel($index, t)) {
        <a
          mat-tab-link
          [routerLink]="t.link"
          routerLinkActive
          #rla="routerLinkActive"
          [active]="rla.isActive"
          >
          {{ t.label }}
        </a>
      }
    </nav>
    
    <mat-tab-nav-panel #panel>
      <router-outlet></router-outlet>
    </mat-tab-nav-panel>
    `,
    styles: [`
    :host { display: block; }
    nav[mat-tab-nav-bar] {
      background-color: var(--rcm-bg, #f6f7fb);
    }
  `],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class ClaimVisionTabsComponent {
  readonly tabs: Tab[] = [
    { label: 'Rejected Claims', link: 'rejected-claims' },
    { label: 'Rules',           link: 'rules' },
  ];

  trackByLabel(_: number, t: Tab) { return t.label; }
}
