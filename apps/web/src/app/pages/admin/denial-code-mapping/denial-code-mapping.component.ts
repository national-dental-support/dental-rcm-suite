import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { environment } from '../../../../environments/environment';

export interface DenialCodeMapping {
  id?: number;
  carc_payer: string | null;
  carc_x12: string | null;
  rarc: string | null;
  definition: string | null;
  grouping: string;
  insurance_actionable: boolean | null;
  patient_responsible: boolean | null;
  no_action_needed: boolean | null;
}

@Component({
    selector: 'rp-denial-code-mapping-admin',
    templateUrl: './denial-code-mapping.component.html',
    styleUrls: ['./denial-code-mapping.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class DenialCodeMappingAdminComponent implements OnInit {
  rows: DenialCodeMapping[] = [];
  groupings: string[] = [];

  loading = false;
  saving = false;

  // Filters
  searchText = '';
  groupingFilter = '';

  // Pagination (server-side)
  pageSize = 50;
  pageIndex = 0;
  total = 0;

  // Editor
  showEditor = false;
  editing: DenialCodeMapping = this.emptyRow();

  private baseUrl = environment.server.baseUrl;

  constructor(
    private http: HttpClient,
    private snack: MatSnackBar,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadGroupings();
    this.load();
  }

  // -- loaders ----------------------------------------------------------------

  load(): void {
    this.loading = true;
    let params = new HttpParams()
      .set('limit', String(this.pageSize))
      .set('offset', String(this.pageIndex * this.pageSize));
    if (this.searchText.trim()) params = params.set('q', this.searchText.trim());
    if (this.groupingFilter) params = params.set('grouping', this.groupingFilter);

    this.http
      .get<{ data: DenialCodeMapping[]; total: number }>(
        `${this.baseUrl}/admin/denial-code-mapping`,
        { params },
      )
      .subscribe({
        next: (res) => {
          this.rows = res.data ?? [];
          this.total = res.total ?? 0;
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.loading = false;
          this.snack.open('Failed to load mappings', 'Dismiss', { duration: 3000 });
          this.cdr.markForCheck();
        },
      });
  }

  loadGroupings(): void {
    this.http
      .get<{ data: string[] }>(`${this.baseUrl}/admin/denial-code-mapping/groupings`)
      .subscribe({
        next: (res) => {
          this.groupings = res.data ?? [];
          this.cdr.markForCheck();
        },
      });
  }

  // -- filters/pagination -----------------------------------------------------

  onSearchChange(value: string): void {
    this.searchText = value;
    this.pageIndex = 0;
    this.load();
  }

  onGroupingFilter(value: string): void {
    this.groupingFilter = value;
    this.pageIndex = 0;
    this.load();
  }

  clearFilters(): void {
    this.searchText = '';
    this.groupingFilter = '';
    this.pageIndex = 0;
    this.load();
  }

  prevPage(): void {
    if (this.pageIndex === 0) return;
    this.pageIndex--;
    this.load();
  }

  nextPage(): void {
    if ((this.pageIndex + 1) * this.pageSize >= this.total) return;
    this.pageIndex++;
    this.load();
  }

  get pageLabel(): string {
    if (this.total === 0) return '0 of 0';
    const from = this.pageIndex * this.pageSize + 1;
    const to = Math.min((this.pageIndex + 1) * this.pageSize, this.total);
    return `${from}\u2013${to} of ${this.total}`;
  }

  get hasNext(): boolean {
    return (this.pageIndex + 1) * this.pageSize < this.total;
  }

  // -- editor -----------------------------------------------------------------

  newRow(): void {
    this.editing = this.emptyRow();
    this.showEditor = true;
  }

  editRow(row: DenialCodeMapping): void {
    this.editing = { ...row };
    this.showEditor = true;
  }

  cancelEdit(): void {
    this.showEditor = false;
    this.editing = this.emptyRow();
  }

  save(): void {
    if (!this.editing.grouping || !this.editing.grouping.trim()) {
      this.snack.open('Grouping is required', 'Dismiss', { duration: 3000 });
      return;
    }
    if (!this.editing.carc_payer && !this.editing.carc_x12 && !this.editing.rarc) {
      this.snack.open('Provide at least one of: Payer CARC, X12 CARC, or RARC', 'Dismiss', { duration: 3000 });
      return;
    }

    this.saving = true;
    const payload = { ...this.editing };
    const obs = this.editing.id
      ? this.http.put(`${this.baseUrl}/admin/denial-code-mapping/${this.editing.id}`, payload)
      : this.http.post(`${this.baseUrl}/admin/denial-code-mapping`, payload);

    obs.subscribe({
      next: () => {
        this.saving = false;
        this.showEditor = false;
        this.snack.open('Mapping saved', 'OK', { duration: 2500 });
        this.load();
        this.loadGroupings();
      },
      error: (err) => {
        this.saving = false;
        this.snack.open(err?.error?.message || 'Save failed', 'Dismiss', { duration: 3500 });
        this.cdr.markForCheck();
      },
    });
  }

  delete(row: DenialCodeMapping): void {
    if (!row.id) return;
    const label = row.carc_x12 || row.carc_payer || row.rarc || `#${row.id}`;
    if (!confirm(`Delete mapping for "${label}"?`)) return;

    this.http.delete(`${this.baseUrl}/admin/denial-code-mapping/${row.id}`).subscribe({
      next: () => {
        this.snack.open('Mapping deleted', 'OK', { duration: 2500 });
        this.load();
      },
      error: () => this.snack.open('Delete failed', 'Dismiss', { duration: 3000 }),
    });
  }

  trackById(_idx: number, r: DenialCodeMapping): number | string {
    return r.id ?? _idx;
  }

  private emptyRow(): DenialCodeMapping {
    return {
      carc_payer: null,
      carc_x12: null,
      rarc: null,
      definition: null,
      grouping: '',
      insurance_actionable: null,
      patient_responsible: null,
      no_action_needed: null,
    };
  }
}
