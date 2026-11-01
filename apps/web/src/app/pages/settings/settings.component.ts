import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
    selector: 'app-global-settings',
    template: `
    <div class="settings-page">
      <div class="settings-header">
        <h1>Global Settings</h1>
        <p>Manage how external claim data is mapped and visualized across all products.</p>
      </div>

      <mat-tab-group animationDuration="200ms" class="settings-tabs">
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon>location_on</mat-icon>&nbsp;Locations
          </ng-template>
          <rp-catalog-management type="location" label="Locations"></rp-catalog-management>
        </mat-tab>

        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon>person</mat-icon>&nbsp;Providers
          </ng-template>
          <rp-catalog-management type="provider" label="Providers"></rp-catalog-management>
        </mat-tab>

        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon>business</mat-icon>&nbsp;Payers
          </ng-template>
          <rp-catalog-management type="payer" label="Payers"></rp-catalog-management>
        </mat-tab>

        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon>swap_horiz</mat-icon>&nbsp;Location Mappings
          </ng-template>
          <app-location-mappings></app-location-mappings>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
    styles: [`
    .settings-page { padding: 24px; max-width: 1400px; margin: 0 auto; }
    .settings-header { margin-bottom: 24px; }
    .settings-header h1 { font-size: 24px; font-weight: 600; margin: 0 0 8px; }
    .settings-header p { font-size: 14px; color: #666; margin: 0; }
    .settings-tabs { margin-top: 16px; }
    :host ::ng-deep .mat-mdc-tab-body-wrapper { padding-top: 16px; }
  `],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class GlobalSettingsComponent {}
