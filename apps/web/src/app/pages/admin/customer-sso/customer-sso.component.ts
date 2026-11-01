import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  CustomerSSOService,
  SSOConfig,
  SSOTestResult,
} from '../../../core/services/customer-sso.service';

@Component({
    selector: 'rp-customer-sso-admin',
    templateUrl: './customer-sso.component.html',
    styleUrls: ['./customer-sso.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class CustomerSSOAdminComponent implements OnInit {
  configs: SSOConfig[] = [];
  loading = false;

  showForm = false;
  editingId: number | null = null;
  form = this.blankForm();

  testing = new Set<number>();
  testResults: Record<number, SSOTestResult> = {};

  providerTypes = [
    { id: 'saml', name: 'SAML 2.0' },
    { id: 'oidc', name: 'OpenID Connect (OIDC)' },
    { id: 'azure-ad', name: 'Azure AD (Entra ID)' },
  ];

  roles = ['User', 'AR Specialist', 'Manager', 'Training Admin', 'Admin'];

  constructor(
    private svc: CustomerSSOService,
    private snack: MatSnackBar,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadConfigs();
  }

  loadConfigs(): void {
    this.loading = true;
    this.cdr.markForCheck();
    this.svc.listConfigs().subscribe({
      next: c => { this.configs = c; this.loading = false; this.cdr.markForCheck(); },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
  }

  private blankForm() {
    return {
      customerId: null as number | null,
      providerType: 'oidc' as 'saml' | 'oidc' | 'azure-ad',
      displayName: '',
      domain: '',
      clientId: '',
      clientSecret: '',
      metadataUrl: '',
      issuer: '',
      authorizationUrl: '',
      tokenUrl: '',
      certificate: '',
      attributeMapping: { email: 'email', firstName: 'given_name', lastName: 'family_name' } as Record<string, string>,
      isActive: false,
      autoProvisionUsers: false,
      defaultRole: 'User',
      enforceSso: false,
    };
  }

  openCreate(): void {
    this.editingId = null;
    this.form = this.blankForm();
    this.showForm = true;
  }

  openEdit(c: SSOConfig): void {
    this.editingId = c.id;
    this.form = {
      customerId: c.customerId,
      providerType: c.providerType,
      displayName: c.displayName,
      domain: c.domain,
      clientId: c.clientId || '',
      clientSecret: '',
      metadataUrl: c.metadataUrl || '',
      issuer: c.issuer || '',
      authorizationUrl: c.authorizationUrl || '',
      tokenUrl: c.tokenUrl || '',
      certificate: c.certificate || '',
      attributeMapping: c.attributeMapping || { email: 'email', firstName: 'given_name', lastName: 'family_name' },
      isActive: c.isActive,
      autoProvisionUsers: c.autoProvisionUsers,
      defaultRole: c.defaultRole,
      enforceSso: c.enforceSso,
    };
    this.showForm = true;
  }

  cancelForm(): void { this.showForm = false; }

  get isSaml(): boolean { return this.form.providerType === 'saml'; }

  saveForm(): void {
    if (!this.form.displayName || !this.form.domain || !this.form.providerType) return;

    if (this.editingId) {
      this.svc.updateConfig(this.editingId, this.form).subscribe({
        next: () => {
          this.snack.open('SSO configuration updated', 'OK', { duration: 2000 });
          this.showForm = false;
          this.loadConfigs();
        },
        error: () => this.snack.open('Failed to update', 'OK', { duration: 3000 }),
      });
    } else {
      this.svc.createConfig(this.form).subscribe({
        next: () => {
          this.snack.open('SSO configuration created', 'OK', { duration: 2000 });
          this.showForm = false;
          this.loadConfigs();
        },
        error: () => this.snack.open('Failed to create', 'OK', { duration: 3000 }),
      });
    }
  }

  testConfig(c: SSOConfig): void {
    this.testing.add(c.id);
    delete this.testResults[c.id];
    this.cdr.markForCheck();
    this.svc.testConfig(c.id).subscribe({
      next: res => {
        this.testing.delete(c.id);
        this.testResults[c.id] = res;
        this.cdr.markForCheck();
      },
      error: () => {
        this.testing.delete(c.id);
        this.snack.open('Test failed', 'OK', { duration: 3000 });
        this.cdr.markForCheck();
      },
    });
  }

  deleteConfig(c: SSOConfig): void {
    if (!confirm(`Delete SSO configuration "${c.displayName}" for domain ${c.domain}?`)) return;
    this.svc.deleteConfig(c.id).subscribe({
      next: () => {
        this.snack.open('SSO config deleted', 'OK', { duration: 2000 });
        this.loadConfigs();
      },
      error: () => this.snack.open('Failed to delete', 'OK', { duration: 3000 }),
    });
  }

  providerLabel(type: string): string {
    return this.providerTypes.find(p => p.id === type)?.name ?? type;
  }
}
