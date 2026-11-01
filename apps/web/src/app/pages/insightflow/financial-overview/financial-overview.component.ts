import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { MatPaginator } from '@angular/material/paginator';
import { MatTableDataSource } from '@angular/material/table';
import { forkJoin, of, Subject } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import {
  InsightflowService, FinancialOverviewData, InsightflowKpiData,
  ArAgingBuckets, RawRevenue,
} from '../../../core/services/insight-flow.service';
import { InsightflowStore } from '../../../store/insightflow/insightflow.store';
import { GlobalFiltersStore } from '../../../shared/components/global-filters/global-filters.store';

interface KpiCard {
  label: string;
  tooltip: string;
  value: number | null;
  format: 'percent' | 'days' | 'currency';
  good: 'high' | 'low';
  benchmark: number;
  benchmarkLabel: string;
  yoyValue?: number | null;
}

interface WaterfallStep {
  label: string;
  amount: number;
  sign: '+' | '-' | '=';
  highlight?: boolean;
}

@Component({
  selector: 'app-financial-overview',
  template: `
  <div class="fo-page">

    <!-- \u2500\u2500 Window selector (shared across Revenue Waterfall + Financial KPIs) \u2500\u2500 -->
    <div class="window-bar">
      <span class="window-bar__label">Period</span>
      <mat-button-toggle-group [(value)]="kpiWindow" (change)="loadKpis()">
        <mat-button-toggle value="month">Month</mat-button-toggle>
        <mat-button-toggle value="quarter">Quarter</mat-button-toggle>
        <mat-button-toggle value="year">Year</mat-button-toggle>
      </mat-button-toggle-group>
      <mat-slide-toggle [(ngModel)]="kpiYoy" (change)="loadKpis()" class="yoy-toggle">YoY</mat-slide-toggle>
    </div>

    <!-- \u2500\u2500 Revenue Waterfall \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 -->
    <app-section-card
      title="Revenue Waterfall"
      [tooltip]="'Shows how gross billed charges flow through adjustments, collections, and write-offs to the net outstanding AR balance for the selected period.'">

      @if (kpiLoading) {
        <div class="xen-loading"><mat-spinner diameter="32"></mat-spinner></div>
      }

      @if (!kpiLoading && waterfallSteps.length) {
        <div class="waterfall">
          @for (step of waterfallSteps; track step.label; let last = $last) {
            <div class="wf-step" [class.wf-step--result]="step.sign === '='">
              <div class="wf-step__label">{{ step.label }}</div>
              <div class="wf-step__sign" [class.wf-minus]="step.sign === '-'">{{ step.sign }}</div>
              <div class="wf-step__amount" [class.wf-amount--result]="step.sign === '='"
                   [class.wf-amount--warn]="step.highlight">
                {{ step.amount | currency:'USD':'symbol':'1.0-0' }}
              </div>
            </div>
            @if (!last) {
              <div class="wf-connector"></div>
            }
          }
        </div>
      }

      @if (!kpiLoading && !waterfallSteps.length && !kpiError) {
        <div class="xen-empty"><mat-icon>bar_chart</mat-icon><span>No revenue data for this period.</span></div>
      }
    </app-section-card>

    <!-- \u2500\u2500 Financial KPIs \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 -->
    <app-section-card
      title="Financial Performance Ratios"
      [tooltip]="'Key financial ratios that measure revenue efficiency, collection effectiveness, and loss rates. All metrics benchmarked against ADA/MGMA industry standards.'"
      style="margin-top:16px">

      @if (!kpiLoading && kpiCards.length) {
        <div class="kpi-grid">
          @for (card of kpiCards; track card.label) {
            <div class="kpi-card {{ kpiRag(card) }}" (click)="toggleDetail(card.label)" style="cursor:pointer">
              <div class="kpi-card__header">
                <span class="kpi-card__label">{{ card.label }}</span>
                <mat-icon class="kpi-card__info" [matTooltip]="card.tooltip" matTooltipPosition="above"
                  (click)="$event.stopPropagation()">info_outline</mat-icon>
              </div>
              <div class="kpi-card__value">
                {{ fmt(card) }}
                @if (kpiYoy && card.yoyValue != null) {
                  <span class="kpi-yoy" [class.yoy-up]="yoyDelta(card) > 0" [class.yoy-down]="yoyDelta(card) < 0">
                    {{ yoyDelta(card) > 0 ? '+' : '' }}{{ yoyDelta(card) | number:'1.1-1' }}%
                  </span>
                }
              </div>
              <div class="kpi-card__bench">
                Benchmark: {{ fmtBench(card) }}
                <span class="kpi-card__rag-label">{{ ragLabel(card) }}</span>
              </div>
              @if (expandedKpi === card.label) {
                <div class="kpi-card__detail">
                  <div class="det-row"><span>Your value</span><strong>{{ fmt(card) }}</strong></div>
                  <div class="det-row"><span>Industry target</span><strong>{{ fmtBench(card) }}</strong></div>
                  @if (kpiYoy && card.yoyValue != null) {
                    <div class="det-row"><span>Prior year</span><strong>{{ fmtRaw(card, card.yoyValue) }}</strong></div>
                    <div class="det-row"><span>YoY change</span>
                      <strong [style.color]="yoyDelta(card) > 0 ? '#2e7d32' : '#c62828'">
                        {{ yoyDelta(card) > 0 ? '+' : '' }}{{ yoyDelta(card) | number:'1.1-1' }}%
                      </strong>
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>
      }

      @if (kpiError) {
        <div class="xen-empty" style="color:#d32f2f"><mat-icon>error</mat-icon><span>Failed to load KPIs.</span></div>
      }
    </app-section-card>

    <!-- \u2500\u2500 AR Aging \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 -->
    <app-section-card
      title="AR Aging"
      [tooltip]="'Outstanding accounts receivable broken into aging buckets. Claims over 90 days have significantly lower collection probability \u2014 prioritize follow-up on these.'"
      style="margin-top:16px">

      @if (kpiLoading) {
        <div class="xen-loading"><mat-spinner diameter="32"></mat-spinner></div>
      }

      @if (!kpiLoading && agingBuckets) {
        <div class="aging-grid">
          @for (b of agingBucketRows; track b.label) {
            <div class="aging-card" [class.aging-card--warn]="b.warn" [class.aging-card--danger]="b.danger">
              <div class="aging-label">{{ b.label }}</div>
              <div class="aging-amount">{{ b.amount | currency:'USD':'symbol':'1.0-0' }}</div>
              <div class="aging-pct">{{ agingPct(b.amount) }}% of total AR</div>
              <div class="aging-bar-track">
                <div class="aging-bar-fill" [style.width.%]="agingPct(b.amount)"
                     [style.backgroundColor]="b.danger ? 'var(--color-danger)' : b.warn ? 'var(--color-warning)' : 'var(--color-success)'">
                </div>
              </div>
            </div>
          }
        </div>
        <div class="aging-total">Total Outstanding AR: <strong>{{ agingTotal | currency:'USD':'symbol':'1.0-0' }}</strong></div>
      }

      @if (!kpiLoading && !agingBuckets) {
        <div class="xen-empty"><mat-icon>account_balance</mat-icon><span>No AR aging data available.</span></div>
      }
    </app-section-card>

    <!-- \u2500\u2500 Financial Overview (Production/Collections snapshot) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 -->
    <app-section-card
      title="Production & Collections Snapshot"
      [tooltip]="'Production and collections snapshot: latest day, MTD, YTD, outstanding AR, and write-offs.'"
      style="margin-top:16px">

      <button cardHeaderActions mat-stroked-button class="btn-detail-toggle" (click)="showDetail = !showDetail">
        <mat-icon>{{ showDetail ? 'expand_less' : 'expand_more' }}</mat-icon>
        {{ showDetail ? 'Hide Detail' : 'Show Detail' }}
      </button>

      @if (loading) {
        <div class="xen-loading"><mat-spinner diameter="32"></mat-spinner></div>
      }

      @if (!loading && data) {
        <div class="dash-grid">
          <div class="dash-card">
            <div class="dash-card__label">{{ data.latestDay ? 'Production (' + (data.latestDay | date:'MMM d') + ')' : 'Latest Day Production' }}
              <mat-icon class="info-tip" matTooltip="Total charges posted on the most recent business day." matTooltipPosition="right">info_outline</mat-icon>
            </div>
            <div class="dash-card__value">{{ data.todayProduction | currency }}</div>
          </div>
          <div class="dash-card">
            <div class="dash-card__label">MTD Production
              <mat-icon class="info-tip" matTooltip="Total charges posted month-to-date." matTooltipPosition="right">info_outline</mat-icon>
            </div>
            <div class="dash-card__value">
              {{ data.mtdProduction | currency }}
              <mat-icon class="trend-arrow" [class.up]="data.productionArrow==='up'" [class.down]="data.productionArrow==='down'">
                {{ data.productionArrow==='up' ? 'trending_up' : data.productionArrow==='down' ? 'trending_down' : 'trending_flat' }}
              </mat-icon>
            </div>
          </div>
          <div class="dash-card">
            <div class="dash-card__label">YTD Production
              <mat-icon class="info-tip" matTooltip="Total charges posted year-to-date." matTooltipPosition="right">info_outline</mat-icon>
            </div>
            <div class="dash-card__value">{{ data.ytdProduction | currency }}</div>
          </div>
          <div class="dash-card">
            <div class="dash-card__label">MTD Collections
              <mat-icon class="info-tip" matTooltip="Total payments received month-to-date." matTooltipPosition="right">info_outline</mat-icon>
            </div>
            <div class="dash-card__value" style="color:#2e7d32">{{ data.mtdCollections | currency }}</div>
          </div>
          <div class="dash-card">
            <div class="dash-card__label">Outstanding AR
              <mat-icon class="info-tip" matTooltip="Total accounts receivable balance currently outstanding." matTooltipPosition="right">info_outline</mat-icon>
            </div>
            <div class="dash-card__value" style="color:#e65100">{{ data.outstandingAR | currency }}</div>
          </div>
          <div class="dash-card">
            <div class="dash-card__label">MTD Write-Offs
              <mat-icon class="info-tip" matTooltip="Total adjustments and write-offs posted month-to-date." matTooltipPosition="right">info_outline</mat-icon>
            </div>
            <div class="dash-card__value" style="color:#c62828">{{ data.mtdWriteOffs | currency }}</div>
          </div>
        </div>

        @if (data.trend.length > 0) {
          <div class="trend-section">
            <div class="trend-section__title">6-Month Production Trend</div>
            <div class="trend-chart">
              @for (t of data.trend; track t) {
                <div class="trend-bar">
                  <div class="trend-bar__fill" [style.height.%]="maxTrend > 0 ? (t.Production / maxTrend * 100) : 0"></div>
                  <div class="trend-bar__label">{{ formatMonth(t.Month) }}</div>
                  <div class="trend-bar__val">{{ t.Production | currency:'USD':'symbol':'1.0-0' }}</div>
                </div>
              }
            </div>
          </div>
        }
      }
    </app-section-card>

    <!-- \u2500\u2500 Write-Off Analysis (expandable) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 -->
    @if (showDetail) {
      <app-section-card title="Write-Off Analysis (Past 12 Months)"
        [tooltip]="'Breakdown of write-offs by type and provider. Anomaly alerts flag unusual patterns that may warrant investigation.'"
        style="margin-top:16px">
        @if (woLoading) { <div class="xen-loading"><mat-spinner diameter="32"></mat-spinner></div> }
        @if (!woLoading && woSummary) {
          <div class="xen-kpi-row">
            <div class="xen-kpi"><div class="xen-kpi__label">Total Write-Offs</div>
              <div class="xen-kpi__value" style="color:#c62828">{{ woSummary.GrandTotal | currency }}</div></div>
            @for (t of woByType; track t) {
              <div class="xen-kpi"><div class="xen-kpi__label">{{ t.TypeLabel }}</div>
                <div class="xen-kpi__value">{{ t.Total | currency }}</div></div>
            }
          </div>
        }
        @if (!woLoading && woByProvider.length > 0) {
          <table mat-table [dataSource]="woByProvider" class="xen-table" style="margin-top:8px">
            <ng-container matColumnDef="provider"><th mat-header-cell *matHeaderCellDef>Provider</th>
              <td mat-cell *matCellDef="let r">{{ r.Provider }}</td></ng-container>
            <ng-container matColumnDef="courtesy"><th mat-header-cell *matHeaderCellDef>Courtesy</th>
              <td mat-cell *matCellDef="let r">{{ r.Courtesy | currency }}</td></ng-container>
            <ng-container matColumnDef="insWriteOff"><th mat-header-cell *matHeaderCellDef>Ins Write-Off</th>
              <td mat-cell *matCellDef="let r">{{ r.InsWriteOff | currency }}</td></ng-container>
            <ng-container matColumnDef="total"><th mat-header-cell *matHeaderCellDef>Total</th>
              <td mat-cell *matCellDef="let r"><strong>{{ r.Total | currency }}</strong></td></ng-container>
            <ng-container matColumnDef="count"><th mat-header-cell *matHeaderCellDef>#</th>
              <td mat-cell *matCellDef="let r">{{ r.AdjCount }}</td></ng-container>
            <tr mat-header-row *matHeaderRowDef="woCols"></tr>
            <tr mat-row *matRowDef="let row; columns: woCols;" class="xen-row"></tr>
          </table>
        }
        @if (!woLoading && woAnomalies.length > 0) {
          <div style="margin-top:16px">
            <div class="anomaly-header">Anomaly Alerts (Last 90 Days)</div>
            @for (a of woAnomalies; track a) {
              <div class="anomaly-alert">
                <mat-icon style="color:#c62828">warning</mat-icon>
                <div><strong>{{ a.Provider }}</strong> \u2014
                  @if (a.Flag === 'HIGH_AMOUNT') { <span>Write-off total ({{ a.Total | currency }}) is significantly above average</span> }
                  @if (a.Flag === 'CONCENTRATION') { <span>Accounts for {{ a.PctOfTotal }}% of all write-offs</span> }
                  @if (a.Flag === 'HIGH_FREQUENCY') { <span>{{ a.AdjCount }} adjustments \u2014 3\u00D7 above average frequency</span> }
                </div>
              </div>
            }
          </div>
        }
        @if (!woLoading && woByProvider.length === 0) {
          <div class="xen-empty"><mat-icon>check_circle</mat-icon><span>No write-offs in this period.</span></div>
        }
      </app-section-card>

      <!-- \u2500\u2500 Claim Velocity \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 -->
      <app-section-card title="Claim Velocity (Past 12 Months)"
        [tooltip]="'Average days from claim submission to payment by payer. Identifies slow-paying carriers that may be stalling cash flow.'"
        style="margin-top:16px">
        @if (cvLoading) { <div class="xen-loading"><mat-spinner diameter="32"></mat-spinner></div> }
        @if (!cvLoading && cvOverall) {
          <div class="xen-kpi-row">
            <div class="xen-kpi"><div class="xen-kpi__label">Avg Days to Payment</div>
              <div class="xen-kpi__value">{{ cvOverall.AvgDays | number:'1.0-0' }}</div></div>
            <div class="xen-kpi"><div class="xen-kpi__label">Fastest</div>
              <div class="xen-kpi__value" style="color:#2e7d32">{{ cvOverall.MinDays }}d</div></div>
            <div class="xen-kpi"><div class="xen-kpi__label">Slowest</div>
              <div class="xen-kpi__value" style="color:#c62828">{{ cvOverall.MaxDays }}d</div></div>
            <div class="xen-kpi"><div class="xen-kpi__label">Claims Measured</div>
              <div class="xen-kpi__value">{{ cvOverall.TotalClaims }}</div></div>
          </div>
        }
        @if (!cvLoading && cvByPayer.length > 0) {
          <table mat-table [dataSource]="cvDataSource" class="xen-table" style="margin-top:8px">
            <ng-container matColumnDef="payer"><th mat-header-cell *matHeaderCellDef>Payer</th>
              <td mat-cell *matCellDef="let r">{{ r.Payer || 'Unknown' }}</td></ng-container>
            <ng-container matColumnDef="claims"><th mat-header-cell *matHeaderCellDef>Claims</th>
              <td mat-cell *matCellDef="let r">{{ r.ClaimCount }}</td></ng-container>
            <ng-container matColumnDef="avgDays"><th mat-header-cell *matHeaderCellDef>Avg Days</th>
              <td mat-cell *matCellDef="let r" [class.aged]="cvOverall && r.AvgDays > cvOverall.AvgDays">
                <strong>{{ r.AvgDays | number:'1.0-0' }}</strong></td></ng-container>
            <tr mat-header-row *matHeaderRowDef="cvCols"></tr>
            <tr mat-row *matRowDef="let row; columns: cvCols;" class="xen-row"></tr>
          </table>
          <mat-paginator #cvPaginator [length]="cvByPayer.length" [pageSize]="15" [pageSizeOptions]="[15,30,50]"></mat-paginator>
        }
        @if (!cvLoading && !cvOverall) {
          <div class="xen-empty"><mat-icon>speed</mat-icon><span>No velocity data available.</span></div>
        }
      </app-section-card>

      <!-- \u2500\u2500 Stalled Claims \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 -->
      <app-section-card title="Stalled Claims"
        [tooltip]="'Claims with no activity beyond the selected threshold. High-value stalled claims represent recoverable AR \u2014 prioritize for follow-up.'"
        style="margin-top:16px">
        <div class="xen-toolbar">
          <mat-form-field style="margin:0; width:160px">
            <mat-label>Threshold</mat-label>
            <mat-select [(value)]="stalledThreshold" (selectionChange)="loadStalled()">
              <mat-option [value]="14">14+ days</mat-option>
              <mat-option [value]="30">30+ days</mat-option>
              <mat-option [value]="60">60+ days</mat-option>
              <mat-option [value]="90">90+ days</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
        @if (stalledLoading) { <div class="xen-loading"><mat-spinner diameter="32"></mat-spinner></div> }
        @if (!stalledLoading && stalledClaims.length > 0) {
          <table mat-table [dataSource]="stalledClaims" class="xen-table">
            <ng-container matColumnDef="claimNum"><th mat-header-cell *matHeaderCellDef>Claim #</th>
              <td mat-cell *matCellDef="let r">{{ r.ClaimNum }}</td></ng-container>
            <ng-container matColumnDef="patient"><th mat-header-cell *matHeaderCellDef>Patient</th>
              <td mat-cell *matCellDef="let r">{{ r.PatientName }}</td></ng-container>
            <ng-container matColumnDef="payer"><th mat-header-cell *matHeaderCellDef>Payer</th>
              <td mat-cell *matCellDef="let r">{{ r.Payer || 'Unknown' }}</td></ng-container>
            <ng-container matColumnDef="status"><th mat-header-cell *matHeaderCellDef>Status</th>
              <td mat-cell *matCellDef="let r">{{ r.ClaimStatus }}</td></ng-container>
            <ng-container matColumnDef="amount"><th mat-header-cell *matHeaderCellDef>Amount</th>
              <td mat-cell *matCellDef="let r"><strong>{{ r.ClaimFee | currency }}</strong></td></ng-container>
            <ng-container matColumnDef="daysStalled"><th mat-header-cell *matHeaderCellDef>Days Stalled</th>
              <td mat-cell *matCellDef="let r" class="aged"><strong>{{ r.DaysStalled }}</strong></td></ng-container>
            <tr mat-header-row *matHeaderRowDef="stalledCols"></tr>
            <tr mat-row *matRowDef="let row; columns: stalledCols;" class="xen-row"></tr>
          </table>
          <mat-paginator
            [length]="stalledTotal" [pageIndex]="stalledPage - 1"
            [pageSize]="stalledPageSize" [pageSizeOptions]="[15,30,50]"
            (page)="onStalledPage($event)">
          </mat-paginator>
        }
        @if (!stalledLoading && stalledClaims.length === 0) {
          <div class="xen-empty"><mat-icon>check_circle</mat-icon><span>No stalled claims.</span></div>
        }
      </app-section-card>
    }

  </div>
  `,
  styles: [`
    .fo-page { padding: 24px; }

    /* Window bar */
    .window-bar { display:flex; align-items:center; gap:16px; margin-bottom:16px; }
    .window-bar__label { font-size:13px; color:var(--color-text-muted); font-weight:500; }
    .yoy-toggle { margin-left:8px; }

    /* Revenue Waterfall */
    .waterfall {
      display:flex; align-items:stretch; gap:0;
      flex-wrap:wrap; padding:8px 0 16px;
    }
    .wf-connector {
      width:24px; display:flex; align-items:center; justify-content:center;
      color:var(--color-text-muted); font-size:18px; flex-shrink:0;
    }
    .wf-connector::after { content:'\u2192'; }
    .wf-step {
      display:flex; flex-direction:column; align-items:center; gap:4px;
      padding:12px 16px; background:var(--color-bg-subtle); border-radius:8px;
      border:1px solid var(--color-border); min-width:120px; flex:1;
    }
    .wf-step--result {
      background:var(--color-surface);
      border-color:var(--xen-primary, #6366f1);
      border-width:2px;
    }
    .wf-step__label { font-size:11px; color:var(--color-text-muted); text-transform:uppercase; letter-spacing:.4px; text-align:center; }
    .wf-step__sign { font-size:20px; font-weight:700; color:var(--color-text-muted); line-height:1; }
    .wf-minus { color:var(--color-danger) !important; }
    .wf-step__amount {
      font-size:18px; font-weight:700; color:var(--color-text-primary);
      font-variant-numeric:tabular-nums;
    }
    .wf-amount--result { color:var(--xen-primary, #6366f1); font-size:20px; }
    .wf-amount--warn { color:var(--color-warning); }

    /* Financial KPI grid */
    .kpi-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; padding:4px 0; }
    .kpi-card { border-radius:10px; padding:16px 20px; border-left:4px solid transparent; background:var(--color-bg-subtle); }
    .kpi-card__header { display:flex; align-items:center; justify-content:space-between; margin-bottom:2px; }
    .kpi-card__label { font-size:11px; color:var(--color-text-muted); text-transform:uppercase; letter-spacing:.4px; }
    .kpi-card__info { font-size:14px; width:14px; height:14px; line-height:14px; color:var(--color-text-muted); cursor:help; flex-shrink:0; }
    .kpi-card__info:hover { color:var(--color-text-primary); }
    .kpi-card__value { font-size:22px; font-weight:700; margin-top:4px; display:flex; align-items:baseline; gap:8px; }
    .kpi-yoy { font-size:12px; font-weight:500; }
    .yoy-up { color:#2e7d32; }
    .yoy-down { color:#c62828; }
    .kpi-card__bench { font-size:11px; color:var(--color-text-muted); margin-top:6px; display:flex; align-items:center; gap:6px; }
    .kpi-card__rag-label { font-size:10px; opacity:.8; }
    .kpi-card__detail { margin-top:10px; border-top:1px solid var(--color-border); padding-top:8px; }
    .det-row { display:flex; justify-content:space-between; font-size:12px; padding:2px 0; color:var(--color-text-muted); }
    .rag-green { border-left-color:#388e3c; }
    .rag-green .kpi-card__value { color:#2e7d32; }
    .rag-amber { border-left-color:#f57c00; }
    .rag-amber .kpi-card__value { color:#e65100; }
    .rag-red   { border-left-color:#d32f2f; }
    .rag-red   .kpi-card__value { color:#c62828; }
    .rag-none  { border-left-color:var(--color-border); }

    /* AR Aging */
    .aging-grid { display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; padding:4px 0; }
    .aging-card { background:var(--color-bg-subtle); border:1px solid var(--color-border); border-radius:8px; padding:14px 16px; }
    .aging-card--warn { border-color:#f57c00; }
    .aging-card--danger { border-color:#d32f2f; }
    .aging-label { font-size:11px; text-transform:uppercase; letter-spacing:.4px; color:var(--color-text-muted); margin-bottom:6px; }
    .aging-amount { font-size:20px; font-weight:700; color:var(--color-text-primary); font-variant-numeric:tabular-nums; }
    .aging-pct { font-size:11px; color:var(--color-text-muted); margin-top:2px; }
    .aging-bar-track { height:6px; background:var(--color-border); border-radius:3px; margin-top:8px; overflow:hidden; }
    .aging-bar-fill { height:100%; border-radius:3px; transition:width .4s ease; }
    .aging-total { margin-top:12px; font-size:13px; color:var(--color-text-muted); text-align:right; }

    /* Production snapshot */
    .dash-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:16px; padding:8px 0; }
    .dash-card { background:var(--color-bg-subtle); border-radius:10px; padding:20px 24px; }
    .dash-card__label { font-size:12px; color:var(--color-text-muted); text-transform:uppercase; letter-spacing:.4px; display:flex; align-items:center; gap:4px; }
    .info-tip { font-size:14px; width:14px; height:14px; line-height:14px; color:var(--color-text-muted); cursor:help; flex-shrink:0; }
    .dash-card__value { font-size:26px; font-weight:700; margin-top:6px; color:var(--color-text-primary); display:flex; align-items:center; gap:8px; }
    .trend-arrow { font-size:20px; }
    .trend-arrow.up { color:#2e7d32; }
    .trend-arrow.down { color:#c62828; }

    /* Collections trend */
    .trend-section { margin-top:24px; }
    .trend-section__title { font-size:13px; font-weight:600; color:var(--color-text-muted); margin-bottom:12px; }
    .trend-chart { display:flex; gap:12px; align-items:flex-end; height:160px; }
    .trend-bar { flex:1; display:flex; flex-direction:column; align-items:center; height:100%; position:relative; }
    .trend-bar__fill { width:100%; max-width:60px; background:var(--xen-primary,#6366f1); border-radius:4px 4px 0 0; transition:height .3s; margin-top:auto; }
    .trend-bar__label { font-size:11px; color:var(--color-text-muted); margin-top:6px; }
    .trend-bar__val { font-size:10px; color:var(--color-text-muted); position:absolute; top:-16px; white-space:nowrap; }

    /* Shared */
    .xen-kpi-row { display:flex; gap:24px; padding:16px 0; flex-wrap:wrap; }
    .xen-kpi { background:var(--color-bg-subtle); border-radius:8px; padding:12px 20px; min-width:140px; }
    .xen-kpi__label { font-size:12px; color:var(--color-text-muted); }
    .xen-kpi__value { font-size:20px; font-weight:600; margin-top:4px; color:var(--color-text-primary); }
    .aged { color:#c62828; }
    .anomaly-header { font-size:13px; font-weight:600; color:#c62828; margin-bottom:8px; }
    .anomaly-alert { display:flex; align-items:center; gap:8px; padding:10px 14px; background:#fff3e0; border-left:3px solid #c62828; border-radius:4px; margin-bottom:8px; font-size:13px; }
    .btn-detail-toggle { font-size:12px; height:32px; line-height:32px; }

    @media (max-width:900px) {
      .dash-grid, .kpi-grid { grid-template-columns:repeat(2, 1fr); }
      .aging-grid { grid-template-columns:repeat(2, 1fr); }
      .waterfall { flex-direction:column; }
      .wf-connector::after { content:'\u2193'; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class FinancialOverviewComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  data: FinancialOverviewData | null = null;
  loading = false;
  maxTrend = 0;

  kpiCards: KpiCard[] = [];
  kpiLoading = false;
  kpiError = false;
  kpiWindow = 'year';
  kpiYoy = false;
  expandedKpi: string | null = null;

  waterfallSteps: WaterfallStep[] = [];
  agingBuckets: ArAgingBuckets | null = null;

  woByProvider: any[] = [];
  woByType: any[] = [];
  woSummary: any = null;
  woAnomalies: any[] = [];
  woLoading = false;
  woCols = ['provider', 'courtesy', 'insWriteOff', 'total', 'count'];

  cvOverall: any = null;
  cvByPayer: any[] = [];
  cvDataSource = new MatTableDataSource<any>([]);
  cvLoading = false;
  cvCols = ['payer', 'claims', 'avgDays'];
  @ViewChild('cvPaginator') cvPaginator!: MatPaginator;

  stalledClaims: any[] = [];
  stalledTotal = 0;
  stalledLoading = false;
  stalledThreshold = 30;
  stalledCols = ['claimNum', 'patient', 'payer', 'status', 'amount', 'daysStalled'];
  stalledPage = 1;
  stalledPageSize = 15;
  showDetail = false;

  private dateFrom = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  private dateTo   = new Date().toISOString().slice(0, 10);
  private locations: string[] = [];
  private payers: string[] = [];
  private providers: string[] = [];

  get agingBucketRows() {
    if (!this.agingBuckets) return [];
    return [
      { label: '0\u201330 Days',  amount: this.agingBuckets.current,    warn: false, danger: false },
      { label: '31\u201360 Days', amount: this.agingBuckets.days31to60, warn: true,  danger: false },
      { label: '61\u201390 Days', amount: this.agingBuckets.days61to90, warn: true,  danger: false },
      { label: '90+ Days',   amount: this.agingBuckets.days90plus, warn: false, danger: true  },
    ];
  }

  get agingTotal(): number {
    if (!this.agingBuckets) return 0;
    return this.agingBuckets.current + this.agingBuckets.days31to60 +
           this.agingBuckets.days61to90 + this.agingBuckets.days90plus;
  }

  agingPct(amount: number): number {
    const total = this.agingTotal;
    return total > 0 ? Math.round((amount / total) * 100) : 0;
  }

  constructor(
    private svc: InsightflowService,
    private store: InsightflowStore,
    private cdr: ChangeDetectorRef,
    private globalFilters: GlobalFiltersStore,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.store.telemetryKpis$.pipe(takeUntil(this.destroy$)).subscribe(slice => {
      this.kpiLoading = slice.loading;
      this.kpiError = !!slice.error;
      if (slice.data) {
        this.kpiCards = this.buildKpiCards(slice.data);
        this.waterfallSteps = this.buildWaterfall(slice.data);
        this.agingBuckets = slice.data.arAgingBuckets ?? null;
      }
      this.cdr.markForCheck();
    });

    this.globalFilters.applied$.pipe(takeUntil(this.destroy$)).subscribe(f => {
      const loc = f.location;
      this.locations = loc.scope === 'location' ? (loc as any).locations ?? [] : [];
      this.payers    = f.payers ?? [];
      this.providers = f.providers ?? [];
      if (f.startDate) this.dateFrom = f.startDate.toISOString().slice(0, 10);
      if (f.endDate)   this.dateTo   = f.endDate.toISOString().slice(0, 10);
      this.stalledPage = 1;
      this.loadAll();
    });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  private loadAll(): void {
    this.loadKpis();
    this.loadFinancials();
    this.loadWriteOffs();
    this.loadClaimVelocity();
    this.loadStalled();
  }

  loadKpis(): void {
    this.store.reloadTelemetryKpis(this.globalFilters.value, this.kpiYoy);
  }

  loadFinancials(): void {
    this.loading = true;
    this.cdr.markForCheck();
    this.svc.getFinancialOverview(this.locations, this.payers, this.providers)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: d => {
          this.data = d;
          this.maxTrend = d.trend.reduce((mx, t) => Math.max(mx, t.Production), 0);
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: () => { this.loading = false; this.cdr.markForCheck(); },
      });
  }

  loadWriteOffs(): void {
    this.woLoading = true;
    forkJoin({
      report:    this.svc.getWriteOffs(this.dateFrom, this.dateTo, this.locations, this.payers, this.providers).pipe(catchError(() => of(null))),
      anomalies: this.svc.getWriteOffAnomalies(this.locations, this.payers, this.providers).pipe(catchError(() => of(null))),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: ({ report, anomalies }) => {
        this.woByProvider = report?.byProvider ?? [];
        this.woByType     = report?.byType ?? [];
        this.woSummary    = report?.summary ?? null;
        this.woAnomalies  = anomalies?.anomalies ?? [];
        this.woLoading    = false;
        this.cdr.markForCheck();
      },
      error: () => { this.woLoading = false; this.cdr.markForCheck(); },
    });
  }

  loadClaimVelocity(): void {
    this.cvLoading = true;
    this.svc.getClaimVelocity(this.dateFrom, this.dateTo, this.locations, this.payers, this.providers)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: r => {
          this.cvOverall = r.overall;
          this.cvByPayer = r.byPayer;
          this.cvDataSource.data = r.byPayer;
          this.cvLoading = false;
          this.cdr.markForCheck();
          setTimeout(() => { if (this.cvPaginator) this.cvDataSource.paginator = this.cvPaginator; });
        },
        error: () => { this.cvLoading = false; this.cdr.markForCheck(); },
      });
  }

  loadStalled(): void {
    this.stalledLoading = true;
    this.svc.getStalledClaims(this.stalledThreshold, this.stalledPage, this.stalledPageSize, this.locations, this.payers, this.providers)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: r => { this.stalledClaims = r.claims; this.stalledTotal = r.total; this.stalledLoading = false; this.cdr.markForCheck(); },
        error: () => { this.stalledLoading = false; this.cdr.markForCheck(); },
      });
  }

  onStalledPage(event: any): void {
    this.stalledPage     = event.pageIndex + 1;
    this.stalledPageSize = event.pageSize;
    this.loadStalled();
  }

  toggleDetail(label: string): void {
    this.expandedKpi = this.expandedKpi === label ? null : label;
  }

  formatMonth(ym: string): string {
    const [y, m] = ym.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[parseInt(m, 10) - 1]} '${y.slice(2)}`;
  }

  private buildKpiCards(d: InsightflowKpiData): KpiCard[] {
    return [
      { label: 'Net Collection Rate',    value: d.netCollectionRate,    format: 'percent', good: 'high', benchmark: 0.96, benchmarkLabel: '96%',
        tooltip: 'Payments collected as % of net collectible charges (after contractual adjustments). MGMA top quartile: 98%+.' },
      { label: 'Gross Collection Rate',  value: d.grossCollectionRate,  format: 'percent', good: 'high', benchmark: 0.95, benchmarkLabel: '95%',
        tooltip: 'Total payments as % of gross billed charges, before adjustments. Measures total revenue capture from billed amounts.', yoyValue: d.yoy?.grossCollectionRate },
      { label: 'Write-Off Rate',         value: d.writeOffRate,         format: 'percent', good: 'low',  benchmark: 0.04, benchmarkLabel: '4%',
        tooltip: 'Bad-debt write-offs as % of gross charges. MGMA top quartile: under 1.5%. High rates signal unchallenged denials or patient collection gaps.' },
      { label: 'Self-Pay Collection',    value: d.selfPayCollectionRate, format: 'percent', good: 'high', benchmark: 0.65, benchmarkLabel: '65%',
        tooltip: 'Payments collected from uninsured / self-pay patients as % of their billed charges. Industry average ~65%; top practices reach 82%+.' },
      { label: 'Days in A/R',            value: d.daysInAR,             format: 'days',    good: 'low',  benchmark: 35,   benchmarkLabel: '35 days',
        tooltip: 'Net outstanding AR divided by average daily charges. ADA benchmark: top practices under 35 days. High values indicate billing bottlenecks or slow payer cycles.' },
      { label: 'Cost to Collect',        value: d.costToCollect,        format: 'percent', good: 'low',  benchmark: 0.04, benchmarkLabel: '4%',
        tooltip: 'Estimated admin labor cost as % of payments collected. MGMA benchmark: under 4%. Rising cost-to-collect erodes net margin even when collection rates are strong.', yoyValue: undefined },
    ].filter(c => c.value != null) as KpiCard[];
  }

  private buildWaterfall(d: InsightflowKpiData): WaterfallStep[] {
    const r = d.rawRevenue;
    if (!r || r.grossCharges === 0) return [];
    return [
      { label: 'Gross Charges',       amount: r.grossCharges,    sign: '+' },
      { label: 'Contractual Adj.',    amount: r.adjustments,     sign: '-' },
      { label: 'Net Revenue',         amount: r.netRevenue,      sign: '=' },
      { label: 'Cash Collected',      amount: r.payments,        sign: '-' },
      { label: 'Write-Offs',          amount: r.writeoffs,       sign: '-', highlight: r.writeoffs > r.grossCharges * 0.05 },
      { label: 'Net Outstanding AR',  amount: r.netOutstanding,  sign: '=' },
    ];
  }

  fmt(card: KpiCard): string {
    if (card.value == null) return '--';
    switch (card.format) {
      case 'percent':  return (card.value * 100).toFixed(1) + '%';
      case 'days':     return Math.round(card.value) + 'd';
      case 'currency': return '$' + card.value.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }
  }

  fmtRaw(card: KpiCard, v: number | null | undefined): string {
    if (v == null) return '--';
    switch (card.format) {
      case 'percent':  return (v * 100).toFixed(1) + '%';
      case 'days':     return Math.round(v) + 'd';
      case 'currency': return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }
  }

  fmtBench(card: KpiCard): string { return card.benchmarkLabel; }

  kpiRag(card: KpiCard): string {
    if (card.value == null) return 'rag-none';
    if (card.good === 'high') {
      if (card.value >= card.benchmark) return 'rag-green';
      if (card.value >= card.benchmark * 0.94) return 'rag-amber';
      return 'rag-red';
    } else {
      if (card.value <= card.benchmark) return 'rag-green';
      if (card.value <= card.benchmark * 1.2) return 'rag-amber';
      return 'rag-red';
    }
  }

  ragLabel(card: KpiCard): string {
    const rag = this.kpiRag(card);
    return rag === 'rag-green' ? '\u2713 On target' : rag === 'rag-amber' ? '\u26A0 Near threshold' : '\u2717 Below target';
  }

  yoyDelta(card: KpiCard): number {
    if (card.value == null || card.yoyValue == null || card.yoyValue === 0) return 0;
    return ((card.value - card.yoyValue) / Math.abs(card.yoyValue)) * 100;
  }
}
