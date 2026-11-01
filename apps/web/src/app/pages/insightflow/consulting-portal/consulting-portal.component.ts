import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { forkJoin } from 'rxjs';
import { InsightflowService } from '../../../core/services/insight-flow.service';

@Component({
  selector: 'app-consulting-portal',
  templateUrl: './consulting-portal.component.html',
  styleUrls: ['./consulting-portal.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConsultingPortalComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = true;
  error = false;
  consultants: any[] = [];
  recommendations: any[] = [];
  sessions: any[] = [];
  metrics: any = null;
  activeTab = 0;
  expandedSessionId: number | null = null;

  constructor(
    private svc: InsightflowService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;
    forkJoin({
      consultants: this.svc.getConsultants(),
      recs: this.svc.getConsultingRecommendations(),
      sessions: this.svc.getConsultingSessions(),
      metrics: this.svc.getConsultingMetrics(),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        this.consultants = res.consultants;
        this.recommendations = res.recs;
        this.sessions = res.sessions;
        this.metrics = res.metrics;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.error = true;
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  toggleSession(id: number): void {
    this.expandedSessionId = this.expandedSessionId === id ? null : id;
    this.cdr.markForCheck();
  }

  primaryConsultant(): any {
    return this.consultants.find(c => c.status === 'active') ?? this.consultants[0];
  }

  priorityColor(priority: string): string {
    const map: Record<string, string> = { high: '#ef5350', medium: '#ffa726', low: '#42a5f5' };
    return map[priority] ?? '#bdbdbd';
  }

  statusColor(status: string): string {
    const map: Record<string, string> = { open: '#ffa726', 'in-progress': '#42a5f5', completed: '#66bb6a' };
    return map[status] ?? '#bdbdbd';
  }

  metricTrendIcon(trend: string): string {
    return trend === 'up' ? 'trending_up' : 'trending_down';
  }

  metricKeys(): string[] {
    return this.metrics ? Object.keys(this.metrics) : [];
  }

  trackById(_: number, item: any): any { return item.id; }
}
