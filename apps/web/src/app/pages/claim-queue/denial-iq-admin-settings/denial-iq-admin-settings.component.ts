import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  DenialManagementService,
  PayerFilingDeadline,
  AppealLetterTemplate,
  PendingConfig,
  PriorityWeights,
  PrioritySettings,
  PracticeGroup,
  OrgHierarchyGroup,
} from '../../../core/services/denial-management.service';
import { RemediationService, RemediationStepSet } from '../../../core/services/remediation.service';
import { DashboardService } from '../../../core/services/dashboard.service';
import { UserRole } from '../../../core/models/dashboard.model';

type AdminSubTab = 'payer-deadlines' | 'appeal-templates' | 'sop-library' | 'denial-iq' | 'payer-followup' | 'groups';

@Component({
    selector: 'app-denial-iq-admin-settings',
    templateUrl: './denial-iq-admin-settings.component.html',
    styleUrls: ['./denial-iq-admin-settings.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class DenialIqAdminSettingsComponent implements OnInit {
  activeSubTab: AdminSubTab = 'payer-deadlines';

  // -- Payer Deadlines ------------------------------------------------------
  deadlines: PayerFilingDeadline[] = [];
  deadlinesLoading = false;
  editingDeadline: Partial<PayerFilingDeadline> | null = null;
  showDeadlineForm = false;

  // -- Appeal Templates -----------------------------------------------------
  templates: AppealLetterTemplate[] = [];
  templatesLoading = false;
  editingTemplate: Partial<AppealLetterTemplate> | null = null;
  showTemplateForm = false;
  templateSaving = false;
  readonly TOKEN_HINTS = '{{patient_name}} {{claim_id}} {{dos}} {{payer_name}} {{provider_name}} {{charged_amount}} {{denial_code}} {{denial_description}} {{submission_date}} {{appeal_deadline}} {{custom_notes}}';
  carcMap = new Map<string, string>();

  // -- SOP Library ----------------------------------------------------------
  sopSets: RemediationStepSet[] = [];
  sopLoading = false;

  // -- Pending Hold Config ---------------------------------------------------
  pendingConfigs: PendingConfig[] = [];
  pendingConfigLoading = false;
  editingPendingDays: Record<number, number> = {};

  // -- Priority Settings ----------------------------------------------------
  prioritySettings: PrioritySettings | null = null;
  priorityLoading = false;
  prioritySaving = false;
  priorityRecalculating = false;
  editingWeights: PriorityWeights = { aging: 40, value: 25, deadline: 20, workload: 15, proficiency: 0 };
  priorityEnabled = true;

  get weightsTotal(): number {
    return (this.editingWeights.aging || 0) + (this.editingWeights.value || 0) +
           (this.editingWeights.deadline || 0) + (this.editingWeights.workload || 0) +
           (this.editingWeights.proficiency || 0);
  }

  // -- Groups & Locations ---------------------------------------------------
  groups: PracticeGroup[] = [];
  orgTree: OrgHierarchyGroup[] = [];
  groupsLoading = false;
  newGroupName = '';
  newLocationName: Record<number, string> = {};

  get orgLocationCount(): number {
    return this.orgTree.reduce((sum, g) => sum + (g.locations?.length || 0), 0);
  }

  // -- Role Profile ---------------------------------------------------------
  readonly UserRole = UserRole;
  selectedRoleProfile: UserRole = UserRole.ARSpecialist;

  readonly roleOptions: Array<{ value: UserRole; label: string; description: string }> = [
    {
      value: UserRole.ARSpecialist,
      label: 'AR Specialist',
      description: 'View My Performance dashboard, personal claim metrics, and peer rankings.',
    },
    {
      value: UserRole.Manager,
      label: 'Manager',
      description: 'View Manager dashboard with team capacity planning, staff performance, and AR mix.',
    },
  ];

  constructor(
    private denialSvc: DenialManagementService,
    private remediationSvc: RemediationService,
    private dashboardService: DashboardService,
    private router: Router,
    private snack: MatSnackBar,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadPayerDeadlines();
    this.loadAppealTemplates();
    this.loadSopSets();
    this.loadPendingConfigs();
    this.loadPrioritySettings();
    this.denialSvc.listCarcDescriptions().subscribe(rows => {
      rows.forEach(r => this.carcMap.set(r.code.toUpperCase(), r.description));
    });
    // Sync with current dashboard role preference
    this.dashboardService.getCurrentUserRole().subscribe(role => {
      this.selectedRoleProfile = role;
      this.cdr.markForCheck();
    });
  }

  setSubTab(tab: AdminSubTab): void {
    this.activeSubTab = tab;
    if (tab === 'groups' && this.groups.length === 0) {
      this.loadGroups();
    }
  }

  // -- Payer Deadlines ------------------------------------------------------

  private loadPayerDeadlines(): void {
    this.deadlinesLoading = true;
    this.denialSvc.listPayerDeadlines().subscribe({
      next: data => {
        this.deadlines = data;
        this.deadlinesLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.deadlinesLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  openAddDeadline(): void {
    this.editingDeadline = { payer_name: '', deadline_days: 180, appeal_days: 60, notes: null };
    this.showDeadlineForm = true;
  }

  openEditDeadline(d: PayerFilingDeadline): void {
    this.editingDeadline = { ...d };
    this.showDeadlineForm = true;
  }

  cancelDeadlineForm(): void {
    this.showDeadlineForm = false;
    this.editingDeadline = null;
  }

  saveDeadline(): void {
    if (!this.editingDeadline?.payer_name) return;
    this.denialSvc.upsertPayerDeadline(this.editingDeadline).subscribe({
      next: () => {
        this.snack.open('Payer deadline saved', '', { duration: 2500 });
        this.showDeadlineForm = false;
        this.editingDeadline = null;
        this.loadPayerDeadlines();
      },
      error: () => this.snack.open('Error saving deadline', '', { duration: 3000 }),
    });
  }

  // -- Appeal Templates -----------------------------------------------------

  private loadAppealTemplates(): void {
    this.templatesLoading = true;
    this.denialSvc.listAppealTemplates(true).subscribe({
      next: data => {
        this.templates = data;
        this.templatesLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.templatesLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  openAddTemplate(): void {
    this.editingTemplate = { template_name: '', denial_category: null, carc_codes: null, subject_line: '', body_template: '', closing_text: null, is_active: true };
    this.showTemplateForm = true;
    this.cdr.markForCheck();
  }

  /**
   * #112 - Upload a text file (.txt / .md / .html) and use its contents as the
   * body of a new appeal template. Opens the edit form pre-populated with the
   * filename as a suggested template_name and the file contents in body_template.
   */
  onTemplateFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // Size guard - templates should not exceed 512 KB
    if (file.size > 512 * 1024) {
      this.snack.open('File is too large (max 512 KB). Please shorten the template.', '', { duration: 4000 });
      input.value = '';
      return;
    }

    const allowed = ['.txt', '.md', '.html', '.htm'];
    const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '');
    if (!allowed.includes(ext)) {
      this.snack.open('Unsupported file type. Use .txt, .md, or .html.', '', { duration: 4000 });
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? '');
      const baseName = file.name.replace(/\.[^.]+$/, '');
      this.editingTemplate = {
        template_name: baseName,
        denial_category: null,
        carc_codes: null,
        subject_line: `Appeal: ${baseName}`,
        body_template: content,
        closing_text: null,
        is_active: true,
      };
      this.showTemplateForm = true;
      this.snack.open(`Loaded "${file.name}" \u2014 review and save`, '', { duration: 3000 });
      this.cdr.markForCheck();
      input.value = '';
    };
    reader.onerror = () => {
      this.snack.open('Failed to read file', '', { duration: 3000 });
      input.value = '';
    };
    reader.readAsText(file);
  }

  openEditTemplate(t: AppealLetterTemplate): void {
    this.editingTemplate = { ...t };
    this.showTemplateForm = true;
    this.cdr.markForCheck();
  }

  cancelTemplateForm(): void {
    this.showTemplateForm = false;
    this.editingTemplate = null;
    this.cdr.markForCheck();
  }

  saveTemplate(): void {
    if (!this.editingTemplate?.template_name || !this.editingTemplate.subject_line || !this.editingTemplate.body_template) return;
    this.templateSaving = true;
    this.cdr.markForCheck();

    const next = () => {
      this.snack.open('Template saved', '', { duration: 2500 });
      this.templateSaving = false;
      this.showTemplateForm = false;
      this.editingTemplate = null;
      this.loadAppealTemplates();
    };
    const error = () => {
      this.snack.open('Error saving template', '', { duration: 3000 });
      this.templateSaving = false;
      this.cdr.markForCheck();
    };

    if (this.editingTemplate.id) {
      this.denialSvc.updateAppealTemplate(this.editingTemplate.id, this.editingTemplate).subscribe({ next, error });
    } else {
      this.denialSvc.createAppealTemplate(this.editingTemplate).subscribe({ next, error });
    }
  }

  deleteTemplate(t: AppealLetterTemplate): void {
    if (!confirm(`Delete template "${t.template_name}"? This cannot be undone.`)) return;
    this.denialSvc.deleteAppealTemplate(t.id).subscribe({
      next: () => {
        this.snack.open('Template deleted', '', { duration: 2500 });
        this.loadAppealTemplates();
      },
      error: () => this.snack.open('Error deleting template', '', { duration: 3000 }),
    });
  }

  toggleTemplate(t: AppealLetterTemplate): void {
    this.denialSvc.updateAppealTemplate(t.id, { is_active: !t.is_active }).subscribe({
      next: () => {
        t.is_active = !t.is_active;
        this.snack.open(t.is_active ? 'Template enabled' : 'Template disabled', '', { duration: 2000 });
        this.cdr.markForCheck();
      },
      error: () => this.snack.open('Error updating template', '', { duration: 3000 }),
    });
  }

  // -- SOP Library ----------------------------------------------------------

  private loadSopSets(): void {
    this.sopLoading = true;
    this.remediationSvc.listSets().subscribe({
      next: data => {
        this.sopSets = data;
        this.sopLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.sopLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  goToSopAdmin(): void {
    this.router.navigate(['/app/admin', 'remediation']);
  }

  // -- Pending Hold Config ---------------------------------------------------

  private loadPendingConfigs(): void {
    this.pendingConfigLoading = true;
    this.denialSvc.getPendingConfig().subscribe({
      next: data => {
        this.pendingConfigs = data;
        this.editingPendingDays = {};
        data.forEach(c => { this.editingPendingDays[c.customer_id] = c.pending_days; });
        this.pendingConfigLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.pendingConfigLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  savePendingConfig(customerId: number): void {
    const days = this.editingPendingDays[customerId];
    if (days == null || days < 1) return;
    this.denialSvc.updatePendingConfig(customerId, days).subscribe({
      next: () => {
        this.snack.open('Pending hold days updated', '', { duration: 2500 });
        const cfg = this.pendingConfigs.find(c => c.customer_id === customerId);
        if (cfg) cfg.pending_days = days;
        this.cdr.markForCheck();
      },
      error: () => this.snack.open('Error saving pending config', '', { duration: 3000 }),
    });
  }

  // -- Priority Settings ----------------------------------------------------

  private loadPrioritySettings(): void {
    this.priorityLoading = true;
    this.denialSvc.getPrioritySettings().subscribe({
      next: data => {
        this.prioritySettings = data;
        this.editingWeights = { ...data.weights };
        this.priorityEnabled = data.enabled;
        this.priorityLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.priorityLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  savePrioritySettings(): void {
    if (this.weightsTotal !== 100) {
      this.snack.open('Weights must sum to 100', '', { duration: 3000 });
      return;
    }
    this.prioritySaving = true;
    this.cdr.markForCheck();
    this.denialSvc.updatePrioritySettings(this.editingWeights, this.priorityEnabled).subscribe({
      next: () => {
        this.snack.open('Priority settings saved', '', { duration: 2500 });
        this.prioritySaving = false;
        this.loadPrioritySettings();
      },
      error: () => {
        this.snack.open('Error saving priority settings', '', { duration: 3000 });
        this.prioritySaving = false;
        this.cdr.markForCheck();
      },
    });
  }

  recalculatePriorities(): void {
    this.priorityRecalculating = true;
    this.cdr.markForCheck();
    this.denialSvc.recalculatePriorities().subscribe({
      next: res => {
        this.snack.open(`Recalculated ${res.scored} claim scores`, '', { duration: 3000 });
        this.priorityRecalculating = false;
        this.loadPrioritySettings();
      },
      error: () => {
        this.snack.open('Error during recalculation', '', { duration: 3000 });
        this.priorityRecalculating = false;
        this.cdr.markForCheck();
      },
    });
  }

  // -- Groups & Locations ---------------------------------------------------

  loadGroups(): void {
    this.groupsLoading = true;
    this.cdr.markForCheck();
    this.denialSvc.getOrgHierarchy().subscribe({
      next: data => {
        this.orgTree = data;
        this.groupsLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.groupsLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  addGroup(): void {
    if (!this.newGroupName) return;
    this.denialSvc.createGroup(this.newGroupName).subscribe({
      next: () => {
        this.snack.open('Group created', '', { duration: 2500 });
        this.newGroupName = '';
        this.loadGroups();
      },
      error: () => this.snack.open('Error creating group', '', { duration: 3000 }),
    });
  }

  addLocation(groupId: number): void {
    const name = this.newLocationName[groupId];
    if (!name) return;
    this.denialSvc.addGroupLocation(groupId, name).subscribe({
      next: () => {
        this.newLocationName[groupId] = '';
        this.snack.open('Location added', '', { duration: 2500 });
        this.loadGroups();
      },
      error: () => this.snack.open('Error adding location', '', { duration: 3000 }),
    });
  }

  removeLocation(groupId: number, locId: number): void {
    this.denialSvc.removeGroupLocation(groupId, locId).subscribe({
      next: () => {
        this.snack.open('Location removed', '', { duration: 2500 });
        this.loadGroups();
      },
      error: () => this.snack.open('Error removing location', '', { duration: 3000 }),
    });
  }

  // -- Helpers --------------------------------------------------------------

  carcTooltip(codesStr: string | null): string {
    if (!codesStr) return '';
    return codesStr.split(',').map(c => {
      const code = c.trim().toUpperCase();
      const desc = this.carcMap.get(code);
      return desc ? `${code}: ${desc}` : code;
    }).join('\n');
  }

  sopStatusClass(status: string): string {
    switch (status) {
      case 'active':   return 'badge--success';
      case 'draft':    return 'badge--warning';
      case 'archived': return 'badge--neutral';
      default:         return '';
    }
  }

  applyRoleProfile(role: UserRole): void {
    this.selectedRoleProfile = role;
    this.dashboardService.setRolePreference(role);
    this.snack.open(
      `Dashboard role set to ${role}. Navigate to Dashboard to see the updated view.`,
      'Go',
      { duration: 4000 },
    ).onAction().subscribe(() => {
      this.router.navigate(['/app/denial-iq/dashboard']);
    });
  }
}
