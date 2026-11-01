import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { PayerFollowupService, FollowupRule, FollowupTask } from '../../../core/services/payer-followup.service';

@Component({
    selector: 'rp-payer-followup-admin',
    templateUrl: './payer-followup.component.html',
    styleUrls: ['./payer-followup.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class PayerFollowupAdminComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  view: 'rules' | 'tasks' = 'rules';
  rules: FollowupRule[] = [];
  tasks: FollowupTask[] = [];
  taskFilter = 'pending';
  loading = false;

  editing = false;
  form: Partial<FollowupRule> = {};
  editingId: number | null = null;

  constructor(private svc: PayerFollowupService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loadRules();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadRules(): void {
    this.loading = true;
    this.svc.listRules().pipe(takeUntil(this.destroy$)).subscribe(r => {
      this.rules = r;
      this.loading = false;
      this.cdr.markForCheck();
    });
  }

  loadTasks(): void {
    this.loading = true;
    this.svc.listTasks(this.taskFilter).pipe(takeUntil(this.destroy$)).subscribe(t => {
      this.tasks = t;
      this.loading = false;
      this.cdr.markForCheck();
    });
  }

  switchView(v: 'rules' | 'tasks'): void {
    this.view = v;
    if (v === 'tasks') this.loadTasks();
    else this.loadRules();
  }

  newRule(): void {
    this.editing = true;
    this.editingId = null;
    this.form = { name: '', daysWithoutResponse: 14, autoGenerateTask: true, autoGenerateAppeal: false, notifySpecialist: true, isActive: true };
  }

  editRule(r: FollowupRule): void {
    this.editing = true;
    this.editingId = r.id;
    this.form = { ...r };
  }

  cancelEdit(): void {
    this.editing = false;
    this.form = {};
    this.editingId = null;
  }

  saveRule(): void {
    const done = () => { this.cancelEdit(); this.loadRules(); };
    if (this.editingId) {
      this.svc.updateRule(this.editingId, this.form).pipe(takeUntil(this.destroy$)).subscribe(done);
    } else {
      this.svc.createRule(this.form).pipe(takeUntil(this.destroy$)).subscribe(done);
    }
  }

  deleteRule(id: number): void {
    if (!confirm('Delete this rule?')) return;
    this.svc.deleteRule(id).pipe(takeUntil(this.destroy$)).subscribe(() => this.loadRules());
  }

  completeTask(id: number): void {
    this.svc.completeTask(id).pipe(takeUntil(this.destroy$)).subscribe(() => this.loadTasks());
  }
}
