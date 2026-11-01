import {
  Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import {
  EscalationChainsService,
  EscalationChain,
  EscalationLevel,
  SlaClaimRow,
  SlaSummary,
} from '../../../core/services/escalation-chains.service';
import { RpDialogService } from '../../../shared/components/dialogs/dialog-shell/dialog.service';

const ROLES = ['AR Specialist', 'Manager', 'Training Admin', 'Admin', 'Super Admin'];

@Component({
    selector: 'rp-escalation-chains-admin',
    templateUrl: './escalation-chains.component.html',
    styleUrls: ['./escalation-chains.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class EscalationChainsAdminComponent implements OnInit {
  // -- Chain management --
  chains: EscalationChain[] = [];
  loading = true;
  saving = false;

  editingChain: Partial<EscalationChain> | null = null;
  isNew = false;
  editLevels: Partial<EscalationLevel>[] = [];

  availableRoles = ROLES;

  // -- SLA monitoring --
  activeTab: 'chains' | 'sla' = 'chains';
  slaRows: SlaClaimRow[] = [];
  slaSummary: SlaSummary = { breached: 0, warning: 0, ok: 0, total: 0 };
  slaLoading = false;
  escalating = false;

  constructor(
    private svc: EscalationChainsService,
    private dialog: RpDialogService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadChains();
  }

  // -- Chain CRUD --

  loadChains(): void {
    this.loading = true;
    this.svc.listChains().subscribe({
      next: chains => {
        this.chains = chains;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  addChain(): void {
    this.isNew = true;
    this.editingChain = { name: '', description: '', isActive: true };
    this.editLevels = [
      { targetRole: 'AR Specialist', slaHours: 48, notifyAtPct: 75, description: '' },
    ];
  }

  editChain(chain: EscalationChain): void {
    this.isNew = false;
    this.editingChain = { ...chain };
    this.editLevels = chain.levels.map(l => ({ ...l }));
  }

  cancelEdit(): void {
    this.editingChain = null;
    this.editLevels = [];
  }

  addLevel(): void {
    this.editLevels.push({
      targetRole: 'Manager',
      slaHours: 24,
      notifyAtPct: 75,
      description: '',
    });
  }

  removeLevel(i: number): void {
    this.editLevels.splice(i, 1);
  }

  moveLevel(i: number, dir: -1 | 1): void {
    const j = i + dir;
    if (j < 0 || j >= this.editLevels.length) return;
    [this.editLevels[i], this.editLevels[j]] = [this.editLevels[j], this.editLevels[i]];
  }

  saveChain(): void {
    if (!this.editingChain) return;
    this.saving = true;

    const levels = this.editLevels.map((l, i) => ({
      targetRole: l.targetRole!,
      slaHours: l.slaHours ?? 48,
      notifyAtPct: l.notifyAtPct ?? 75,
      description: l.description || null,
    }));

    const payload = {
      name: this.editingChain.name!,
      description: this.editingChain.description || undefined,
      isActive: this.editingChain.isActive !== false,
      levels,
    };

    const obs = this.isNew
      ? this.svc.createChain(payload)
      : this.svc.updateChain(this.editingChain.id!, payload);

    obs.subscribe({
      next: () => {
        this.saving = false;
        this.editingChain = null;
        this.editLevels = [];
        this.loadChains();
      },
      error: () => {
        this.saving = false;
        this.cdr.markForCheck();
      },
    });
  }

  deleteChain(chain: EscalationChain): void {
    this.dialog.dangerConfirm(
      'Delete Chain',
      `Delete "${chain.name}"? This cannot be undone.`,
    ).subscribe(ok => {
      if (!ok) return;
      this.svc.deleteChain(chain.id).subscribe(() => this.loadChains());
    });
  }

  toggleActive(chain: EscalationChain): void {
    const updated = { ...chain, isActive: !chain.isActive };
    this.svc.updateChain(chain.id, {
      name: updated.name,
      description: updated.description || undefined,
      isActive: updated.isActive,
      levels: updated.levels.map(l => ({
        targetRole: l.targetRole,
        slaHours: l.slaHours,
        notifyAtPct: l.notifyAtPct,
        description: l.description,
      })),
    }).subscribe(() => this.loadChains());
  }

  // -- SLA monitoring --

  switchTab(tab: 'chains' | 'sla'): void {
    this.activeTab = tab;
    if (tab === 'sla' && this.slaRows.length === 0) {
      this.loadSla();
    }
  }

  loadSla(): void {
    this.slaLoading = true;
    this.svc.getSlaStatus().subscribe({
      next: res => {
        this.slaRows = res.data ?? [];
        this.slaSummary = res.summary;
        this.slaLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.slaLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  triggerEscalation(): void {
    this.dialog.confirm(
      'Run Auto-Escalation',
      'This will check all open claims against SLA deadlines and auto-escalate any that have breached. Continue?',
    ).subscribe(ok => {
      if (!ok) return;
      this.escalating = true;
      this.cdr.markForCheck();
      this.svc.triggerAutoEscalate().subscribe({
        next: res => {
          this.escalating = false;
          this.loadSla();
          // Could show a snackbar with res.escalated count
        },
        error: () => {
          this.escalating = false;
          this.cdr.markForCheck();
        },
      });
    });
  }

  slaStatusClass(status: string): string {
    return status === 'breached' ? 'sla-breached'
         : status === 'warning' ? 'sla-warning'
         : 'sla-ok';
  }

  formatHours(h: number): string {
    if (h < 24) return `${h}h`;
    const days = Math.floor(h / 24);
    const rem = h % 24;
    return rem ? `${days}d ${rem}h` : `${days}d`;
  }

  trackByIndex(i: number): number { return i; }
  trackById(_: number, item: any): number { return item.id; }
}
