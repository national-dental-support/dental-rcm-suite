import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  SecurityAdminService,
  MaskingRule,
  SecurityStatus,
} from '../../../core/services/security-admin.service';

@Component({
    selector: 'rp-security-admin',
    templateUrl: './security.component.html',
    styleUrls: ['./security.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class SecurityAdminComponent implements OnInit {
  activeView: 'overview' | 'masking' | 'encryption' | 'logs' | 'access-review' | 'compliance' = 'overview';

  status: SecurityStatus | null = null;
  maskingRules: MaskingRule[] = [];

  encTdeEnabled = false;
  encFieldEnabled = false;
  encFields: string[] = [];

  showRuleForm = false;
  editingRuleId: number | null = null;
  ruleForm = this.blankRuleForm();

  loading = false;

  roleNames: Record<number, string> = {
    0: 'User',
    1: 'AR Specialist',
    2: 'Manager',
    3: 'Training Admin',
    4: 'Admin',
    5: 'Super Admin',
  };

  categories = ['phi', 'pii', 'financial'];
  maskTypes = ['full', 'last4', 'date', 'partial'];

  constructor(
    private svc: SecurityAdminService,
    private snack: MatSnackBar,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadStatus();
  }

  loadStatus(): void {
    this.loading = true;
    this.cdr.markForCheck();
    this.svc.getSecurityStatus().subscribe({
      next: s => {
        this.status = s;
        this.encTdeEnabled = s.encryption.tdeEnabled;
        this.encFieldEnabled = s.encryption.fieldEncryptionEnabled;
        this.encFields = s.encryption.encryptedFields;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
  }

  loadMaskingRules(): void {
    this.svc.getMaskingRules().subscribe({
      next: r => { this.maskingRules = r; this.cdr.markForCheck(); },
    });
  }

  switchView(view: 'overview' | 'masking' | 'encryption' | 'logs' | 'access-review' | 'compliance'): void {
    this.activeView = view;
    if (view === 'masking' && !this.maskingRules.length) this.loadMaskingRules();
  }

  // -- Masking Rules -------------------------------------------------

  private blankRuleForm() {
    return {
      fieldName: '',
      displayLabel: '',
      category: 'phi' as 'phi' | 'pii' | 'financial',
      maskType: 'last4' as 'full' | 'last4' | 'date' | 'partial',
      visibleAboveRole: 3,
      isActive: true,
    };
  }

  openCreateRule(): void {
    this.editingRuleId = null;
    this.ruleForm = this.blankRuleForm();
    this.showRuleForm = true;
  }

  openEditRule(r: MaskingRule): void {
    this.editingRuleId = r.id;
    this.ruleForm = {
      fieldName: r.fieldName,
      displayLabel: r.displayLabel,
      category: r.category,
      maskType: r.maskType,
      visibleAboveRole: r.visibleAboveRole,
      isActive: r.isActive,
    };
    this.showRuleForm = true;
  }

  cancelRuleForm(): void { this.showRuleForm = false; }

  saveRule(): void {
    if (!this.ruleForm.fieldName || !this.ruleForm.displayLabel) return;

    if (this.editingRuleId) {
      this.svc.updateMaskingRule(this.editingRuleId, this.ruleForm).subscribe({
        next: () => {
          this.snack.open('Rule updated', 'OK', { duration: 2000 });
          this.showRuleForm = false;
          this.loadMaskingRules();
        },
        error: () => this.snack.open('Failed to update', 'OK', { duration: 3000 }),
      });
    } else {
      this.svc.createMaskingRule(this.ruleForm).subscribe({
        next: () => {
          this.snack.open('Rule created', 'OK', { duration: 2000 });
          this.showRuleForm = false;
          this.loadMaskingRules();
        },
        error: () => this.snack.open('Failed to create', 'OK', { duration: 3000 }),
      });
    }
  }

  deleteRule(r: MaskingRule): void {
    if (!confirm(`Delete masking rule for "${r.displayLabel}"?`)) return;
    this.svc.deleteMaskingRule(r.id).subscribe({
      next: () => {
        this.snack.open('Rule deleted', 'OK', { duration: 2000 });
        this.loadMaskingRules();
      },
      error: () => this.snack.open('Failed to delete', 'OK', { duration: 3000 }),
    });
  }

  // -- Encryption Config ---------------------------------------------

  saveEncryptionConfig(): void {
    this.svc.updateEncryptionConfig({
      tde_enabled: this.encTdeEnabled.toString(),
      field_encryption_enabled: this.encFieldEnabled.toString(),
      encrypted_fields: JSON.stringify(this.encFields),
    }).subscribe({
      next: () => {
        this.snack.open('Encryption settings saved', 'OK', { duration: 2000 });
        this.loadStatus();
      },
      error: () => this.snack.open('Failed to save', 'OK', { duration: 3000 }),
    });
  }
}
