import { Component, OnInit } from '@angular/core';

import {
  AdminAuditEntry,
  AdminLogsService,
  AnalyticsError,
  AnalyticsEvent,
} from '../../../core/services/admin-logs.service';

import { AdvancedTableColumnConfig } from '../../../shared/components/advanced-table/advanced-table.models';

@Component({
    selector: 'app-admin-logs',
    templateUrl: './logs.component.html',
    styleUrls: ['./logs.component.scss'],
    standalone: false
})
export class LogsComponent implements OnInit {
  // -- Loading flags -----------------------------------------------
  eventsLoading = false;
  errorsLoading = false;
  auditLoading = false;

  // -- Data --------------------------------------------------------
  events: AnalyticsEvent[] = [];
  errors: AnalyticsError[] = [];
  audit: AdminAuditEntry[] = [];

  // -- Column configs ----------------------------------------------
  eventsColumns: AdvancedTableColumnConfig<AnalyticsEvent>[] = [];
  errorsColumns: AdvancedTableColumnConfig<AnalyticsError>[] = [];
  auditColumns: AdvancedTableColumnConfig<AdminAuditEntry>[] = [];

  constructor(private logsService: AdminLogsService) {}

  ngOnInit(): void {
    this.eventsColumns = this.buildEventsColumns();
    this.errorsColumns = this.buildErrorsColumns();
    this.auditColumns = this.buildAuditColumns();

    this.refresh();
  }

  refresh(): void {
    this.loadEvents();
    this.loadErrors();
    this.loadAuditLog();
  }

  // -- Loaders -----------------------------------------------------
  private loadEvents(): void {
    this.eventsLoading = true;
    this.logsService.getEvents().subscribe({
      next: (data) => {
        this.events = data ?? [];
        this.eventsLoading = false;
      },
      error: () => (this.eventsLoading = false),
    });
  }

  private loadErrors(): void {
    this.errorsLoading = true;
    this.logsService.getErrors().subscribe({
      next: (data) => {
        this.errors = data ?? [];
        this.errorsLoading = false;
      },
      error: () => (this.errorsLoading = false),
    });
  }

  private loadAuditLog(): void {
    this.auditLoading = true;
    this.logsService.fetchAuditLog().subscribe({
      next: (data) => {
        this.audit = data ?? [];
        this.auditLoading = false;
      },
      error: () => (this.auditLoading = false),
    });
  }

  // -- Column builders ---------------------------------------------
  private buildEventsColumns(): AdvancedTableColumnConfig<AnalyticsEvent>[] {
    return [
      {
        id: 'timestamp',
        header: 'Time',
        type: 'date',
        sortable: true,
        filterable: true,
        includeInGlobalSearch: false,
        accessor: (r) => r.timestamp,
        displayFormatter: (_v, r) => this.fmtDate(r.timestamp),
        // IMPORTANT: sort by epoch so it sorts correctly
        sortAccessor: (r) => new Date(r.timestamp ?? '').getTime(),
        width: '180px',
      },
      {
        id: 'user_id',
        header: 'User',
        type: 'text',
        sortable: true,
        filterable: true,
        includeInGlobalSearch: true,
        filterConfig: { supportsValueList: true },
        accessor: (r) => r.user_id ?? '',
        width: '220px',
      },
      {
        id: 'event_name',
        header: 'Event',
        type: 'text',
        sortable: true,
        filterable: true,
        includeInGlobalSearch: true,
        filterConfig: { supportsValueList: true },
        accessor: (r) => r.event_name ?? '',
        width: '240px',
      },
      {
        id: 'url',
        header: 'URL',
        type: 'text',
        sortable: true,
        filterable: true,
        includeInGlobalSearch: true,
        filterConfig: { supportsValueList: true },
        accessor: (r) => r.url ?? '',
        width: '320px',
      },
      {
        id: 'properties',
        header: 'Properties',
        type: 'text',
        sortable: false,
        filterable: true, // enables unique value list; if too noisy, set false
        includeInGlobalSearch: false,
        filterConfig: { supportsValueList: true },
        accessor: (r) => r.properties ?? '',
        displayFormatter: (_v, r) => this.formatProps(r.properties),
      },
    ];
  }

  private buildErrorsColumns(): AdvancedTableColumnConfig<AnalyticsError>[] {
    return [
      {
        id: 'timestamp',
        header: 'Time',
        type: 'date',
        sortable: true,
        filterable: true,
        includeInGlobalSearch: false,
        filterConfig: { supportsValueList: true },
        accessor: (r) => r.timestamp,
        displayFormatter: (_v, r) => this.fmtDate(r.timestamp),
        sortAccessor: (r) => new Date(r.timestamp ?? '').getTime(),
        width: '180px',
      },
      {
        id: 'user_id',
        header: 'User',
        type: 'text',
        sortable: true,
        filterable: true,
        filterConfig: { supportsValueList: true },
        includeInGlobalSearch: true,
        accessor: (r) => r.user_id ?? '',
        width: '220px',
      },
      {
        id: 'error_type',
        header: 'Type',
        type: 'text',
        sortable: true,
        filterable: true,
        filterConfig: { supportsValueList: true },
        includeInGlobalSearch: true,
        accessor: (r) => r.error_type ?? '',
        width: '160px',
      },
      {
        id: 'message',
        header: 'Message',
        type: 'text',
        sortable: true,
        filterable: true,
        filterConfig: { supportsValueList: true },
        includeInGlobalSearch: true,
        accessor: (r) => r.message ?? '',
        width: '360px',
      },
      {
        id: 'http_status',
        header: 'Status',
        type: 'number',
        sortable: true,
        filterable: true,
        filterConfig: { supportsValueList: true },
        includeInGlobalSearch: false,
        accessor: (r) => r.http_status ?? null,
        width: '120px',
      },
      {
        id: 'http_method',
        header: 'Method / URL',
        type: 'text',
        sortable: false,
        filterable: true,
        filterConfig: { supportsValueList: true },
        includeInGlobalSearch: true,
        accessor: (r) => `${r.http_method ?? ''} ${r.http_url ?? ''}`.trim(),
        width: '360px',
      },
    ];
  }

  private buildAuditColumns(): AdvancedTableColumnConfig<AdminAuditEntry>[] {
    return [
      {
        id: 'timestamp',
        header: 'Time',
        type: 'date',
        sortable: true,
        filterable: true,
        includeInGlobalSearch: false,
        accessor: (r) => r.timestamp,
        displayFormatter: (_v, r) => this.fmtDate(r.timestamp),
        sortAccessor: (r) => new Date(r.timestamp ?? '').getTime(),
        width: '180px',
      },
      {
        id: 'actor_id',
        header: 'Actor',
        type: 'text',
        sortable: true,
        filterable: true,
        filterConfig: { supportsValueList: true },
        includeInGlobalSearch: true,
        accessor: (r) => r.actor_id ?? '',
        width: '260px',
      },
      {
        id: 'action',
        header: 'Action',
        type: 'text',
        sortable: true,
        filterable: true,
        includeInGlobalSearch: true,
        filterConfig: { supportsValueList: true },
        accessor: (r) => r.action ?? '',
        width: '220px',
      },
      {
        id: 'target_id',
        header: 'Target User',
        type: 'text',
        sortable: true,
        filterable: true,
        includeInGlobalSearch: true,
        filterConfig: { supportsValueList: true },
        accessor: (r) => r.target_id ?? '',
        width: '220px',
      },
      {
        id: 'diff',
        header: 'Changes',
        type: 'text',
        sortable: false,
        filterable: true, // optional
        filterConfig: { supportsValueList: true },
        includeInGlobalSearch: false,
        accessor: (r) => `${r.before_state ?? ''} ${r.after_state ?? ''}`.trim(),
        displayFormatter: (_v, r) => this.formatDiff(r.before_state, r.after_state),
      },
      {
        id: 'ip_address',
        header: 'IP',
        type: 'text',
        sortable: true,
        filterable: true,
        filterConfig: { supportsValueList: true },
        includeInGlobalSearch: true,
        accessor: (r) => r.ip_address ?? '',
        width: '160px',
      },
    ];
  }

  // -- Existing formatting helpers (keep) ---------------------------
  formatProps(raw: string | null): string {
    if (!raw) return '\u2014';
    try {
      const obj = JSON.parse(raw);
      return Object.entries(obj)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' \u00B7 ');
    } catch {
      return raw;
    }
  }

  formatDiff(before: string | null, after: string | null): string {
    if (!before && !after) return '\u2014';
    try {
      const b = before ? JSON.parse(before) : {};
      const a = after ? JSON.parse(after) : {};
      const allKeys = new Set([...Object.keys(b), ...Object.keys(a)]);
      const changes: string[] = [];
      allKeys.forEach((k) => {
        const bv = b[k],
          av = a[k];
        if (JSON.stringify(bv) !== JSON.stringify(av)) {
          changes.push(`${k}: ${bv ?? '\u2014'} \u2192 ${av ?? '\u2014'}`);
        }
      });
      return changes.length ? changes.join(' | ') : 'no change';
    } catch {
      return after ?? before ?? '\u2014';
    }
  }

  fmtDate(iso: string | null): string {
    if (!iso) return '\u2014';
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  // Optional: for the error-type class binding in template
  safeTypeClass(v: string | null | undefined): string {
    return (v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  safeActionClass(v: string | null | undefined): string {
    return (v ?? '').replace(/\./g, '-').replace(/[^a-zA-Z0-9-]/g, '');
  }
}
