import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import {
  WorkflowRulesService,
  WorkflowRule,
  WorkflowCondition,
  WorkflowAction,
  EvaluateResult,
} from '../../../core/services/workflow-rules.service';
import { RpDialogService } from '../../../shared/components/dialogs/dialog-shell/dialog.service';
import { firstValueFrom, map } from 'rxjs';

const CONDITION_FIELDS = [
  { value: 'agingDays', label: 'Aging (days)' },
  { value: 'payerName', label: 'Payer Name' },
  { value: 'reasonCode', label: 'Reason Code' },
  { value: 'chargeAmount', label: 'Charge Amount' },
  { value: 'claimStatus', label: 'Claim Status' },
];

const OPERATORS = [
  { value: '>', label: '>' },
  { value: '<', label: '<' },
  { value: '>=', label: '>=' },
  { value: '<=', label: '<=' },
  { value: '=', label: 'equals' },
  { value: '!=', label: 'not equals' },
  { value: 'contains', label: 'contains' },
];

const ACTION_TYPES = [
  { value: 'auto-escalate', label: 'Auto-Escalate' },
  { value: 'add-note', label: 'Add Note' },
];

@Component({
    selector: 'rp-workflow-rules-admin',
    templateUrl: './workflow-rules.component.html',
    styleUrls: ['./workflow-rules.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class WorkflowRulesAdminComponent implements OnInit {
  rules: WorkflowRule[] = [];
  loading = true;
  saving = false;

  // Edit state
  editingRule: WorkflowRule | null = null;
  isNewRule = false;

  // Evaluate results
  lastEvalResult: EvaluateResult | null = null;
  evaluating = false;

  // Dropdown options
  conditionFields = CONDITION_FIELDS;
  operators = OPERATORS;
  actionTypes = ACTION_TYPES;

  constructor(
    private svc: WorkflowRulesService,
    private dialog: RpDialogService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadRules();
  }

  loadRules(): void {
    this.loading = true;
    this.svc.list().subscribe({
      next: (rules) => {
        this.rules = rules;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  // -- CRUD ----------------------------------------------------------

  addRule(): void {
    this.editingRule = {
      name: '',
      description: '',
      matchType: 'all',
      conditions: [{ field: 'agingDays', operator: '>', value: '' }],
      actions: [{ actionType: 'auto-escalate', params: {} }],
      isActive: true,
      priority: this.rules.length,
    };
    this.isNewRule = true;
  }

  editRule(rule: WorkflowRule): void {
    this.editingRule = JSON.parse(JSON.stringify(rule));
    this.isNewRule = false;
  }

  cancelEdit(): void {
    this.editingRule = null;
    this.isNewRule = false;
  }

  saveRule(): void {
    if (!this.editingRule || !this.editingRule.name.trim()) return;
    this.saving = true;

    const payload = this.editingRule;
    const obs$ = this.isNewRule
      ? this.svc.create(payload).pipe(map(() => void 0))
      : this.svc.update(payload.id!, payload);

    obs$.subscribe({
      next: () => {
        this.saving = false;
        this.editingRule = null;
        this.isNewRule = false;
        this.loadRules();
      },
      error: () => {
        this.saving = false;
        this.cdr.markForCheck();
      },
    });
  }

  async deleteRule(rule: WorkflowRule): Promise<void> {
    const ok = await firstValueFrom(this.dialog.dangerConfirm(
      `Delete rule "${rule.name}"? This cannot be undone.`,
      'Delete Rule',
    ));
    if (!ok) return;

    this.svc.delete(rule.id!).subscribe({
      next: () => this.loadRules(),
    });
  }

  toggleActive(rule: WorkflowRule): void {
    const updated = { ...rule, isActive: !rule.isActive };
    this.svc.update(rule.id!, updated).subscribe({
      next: () => {
        rule.isActive = !rule.isActive;
        this.cdr.markForCheck();
      },
    });
  }

  // -- Conditions management -----------------------------------------

  addCondition(): void {
    if (!this.editingRule) return;
    this.editingRule.conditions.push({ field: 'agingDays', operator: '>', value: '' });
  }

  removeCondition(idx: number): void {
    if (!this.editingRule) return;
    this.editingRule.conditions.splice(idx, 1);
  }

  // -- Actions management --------------------------------------------

  addAction(): void {
    if (!this.editingRule) return;
    this.editingRule.actions.push({ actionType: 'add-note', params: {} });
  }

  removeAction(idx: number): void {
    if (!this.editingRule) return;
    this.editingRule.actions.splice(idx, 1);
  }

  // -- Evaluate ------------------------------------------------------

  async runEvaluation(): Promise<void> {
    const ok = await firstValueFrom(this.dialog.confirm(
      'Run all active workflow rules against current claims? This will execute actions (escalations, notes) immediately.',
      'Run Workflow Rules',
    ));
    if (!ok) return;

    this.evaluating = true;
    this.lastEvalResult = null;
    this.cdr.markForCheck();

    this.svc.evaluate().subscribe({
      next: (result) => {
        this.lastEvalResult = result;
        this.evaluating = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.evaluating = false;
        this.cdr.markForCheck();
      },
    });
  }

  getActionLabel(type: string): string {
    return this.actionTypes.find(a => a.value === type)?.label ?? type;
  }

  getFieldLabel(field: string): string {
    return this.conditionFields.find(f => f.value === field)?.label ?? field;
  }
}
