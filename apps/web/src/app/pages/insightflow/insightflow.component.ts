// src/app/pages/insightflow/insightflow.component.ts
import { Component, ChangeDetectionStrategy, TrackByFunction, OnInit, ChangeDetectorRef } from '@angular/core';

import { AnalyticsService } from '../../core/services/analytics.service';
import { InsightflowService, SectionHealth } from '../../core/services/insight-flow.service';

type ViewMode = 'list' | 'grid';
type StatusLevel = 'ok' | 'warning' | 'flagged';

type MenuItem = {
  title: string;
  icon: string;
  route: 'payer-mix' | 'ar' | 'rcm' | 'denials' | 'kpi';
  color?: 'blue' | 'orange' | 'purple' | 'green' | 'sky';
  updatedAt?: string;
  status?: StatusLevel;
  metric?: string;
};

@Component({
    selector: 'app-insightflow',
    templateUrl: './insightflow.component.html',
    styleUrls: ['./insightflow.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class InsightflowComponent implements OnInit {
  viewMode: ViewMode = (localStorage.getItem('insightflow:view') as ViewMode) || 'list';
  healthLoading = true;

  insights: MenuItem[] = [
    { title: 'Payer Mix',                icon: 'pie_chart_outline', route: 'payer-mix', color: 'green'  },
    { title: 'Accounts Receivable',      icon: 'table_chart',       route: 'ar',        color: 'orange' },
    { title: 'Revenue Cycle Management', icon: 'receipt_long',      route: 'rcm',       color: 'purple' },
    { title: 'Denial Management',        icon: 'stacked_bar_chart', route: 'denials',   color: 'blue'   },
    { title: 'KPIs',                     icon: 'show_chart',        route: 'kpi',       color: 'sky'    },
  ];

  constructor(
    private analytics: AnalyticsService,
    private insightflowService: InsightflowService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.insightflowService.getHealth().subscribe({
      next: ({ sections }) => {
        this.applyHealth(sections);
        this.healthLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        // On failure leave status undefined so no badge renders
        this.healthLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  private applyHealth(sections: SectionHealth[]): void {
    const now = new Date().toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    }).replace('AM', 'a.m.').replace('PM', 'p.m.');

    for (const s of sections) {
      const item = this.insights.find(i => i.route === s.section);
      if (!item) continue;
      item.status    = s.status === 'red' ? 'flagged' : s.status === 'yellow' ? 'warning' : 'ok';
      item.metric    = s.metric;
      item.updatedAt = now;
    }
  }

  toggleView(): void {
    this.viewMode = this.viewMode === 'list' ? 'grid' : 'list';
    localStorage.setItem('insightflow:view', this.viewMode);
    this.analytics.track('insightflow_view_mode_toggled', { newMode: this.viewMode });
  }

  trackMenuClick(item: MenuItem): void {
    this.analytics.track('insightflow_menu_item_clicked', { route: item.route, title: item.title });
  }

  trackByTitle: TrackByFunction<MenuItem> = (_: number, item: MenuItem) => item.title;

  statusIcon(item: MenuItem): string {
    if (item.status === 'flagged') return 'flag';
    if (item.status === 'warning') return 'warning';
    if (item.status === 'ok')      return 'check_circle';
    return 'radio_button_unchecked'; // loading / unknown
  }

  statusClass(item: MenuItem): string {
    if (item.status === 'flagged') return 'flagged';
    if (item.status === 'warning') return 'warning';
    if (item.status === 'ok')      return 'ok';
    return 'loading';
  }
}
