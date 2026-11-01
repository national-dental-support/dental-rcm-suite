import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { EraIngestionLogRow, EraIngestionDetail, ReconIqService } from '../../../core/services/recon-iq.service';
import { SocketService } from '../../../core/services/socket.service';

type SortCol = 'uploaded_at' | 'file_name' | 'payer_name' | 'status' | 'claims_found' | 'total_amount' | 'file_type' | 'file_size_bytes';

@Component({
    selector: 'app-era-ingestion',
    templateUrl: './era-ingestion.component.html',
    styleUrls: ['./era-ingestion.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class EraIngestionComponent implements OnInit, OnDestroy {
  history: EraIngestionLogRow[] = [];
  historyLoading = true;

  // -- Search / filter / sort ------------------------------------------------
  searchTerm    = '';
  filterStatus  = '';
  filterFileType = '';
  sortBy: SortCol = 'uploaded_at';
  sortDir: 'asc' | 'desc' = 'desc';

  // -- Pagination ------------------------------------------------------------
  page     = 1;
  pageSize = 25;
  total    = 0;

  // -- Upload ----------------------------------------------------------------
  uploading    = false;
  uploadResult: { logId: number; status: string; claimsFound: number; claimsMatched: number } | null = null;
  uploadError: string | null = null;
  isDragOver   = false;

  // -- SFTP Fetch ------------------------------------------------------------
  connections: Array<{ id: number; connection_name: string; last_era_fetch_at: string | null }> = [];
  selectedConnectionId: number | null = null;
  fetching    = false;
  fetchResult: { fetched: number; ingested: number; errors: string[] } | null = null;
  fetchError: string | null = null;

  readonly demoFileUrl = '/api/recon-iq/era-ingestion/demo-file';

  // -- Row expand ------------------------------------------------------------
  expandedId  = -1;
  detailMap   = new Map<number, EraIngestionDetail>();
  detailLoading = new Set<number>();
  blobUrls    = new Map<number, SafeResourceUrl>();

  private searchSub!: Subscription;
  private eraSub!: Subscription;
  private readonly search$ = new Subject<string>();

  readonly STATUS_OPTIONS = ['completed', 'failed', 'duplicate', 'processing'];
  readonly FILE_TYPE_OPTIONS = ['ERA', 'EOB', 'manual'];

  constructor(
    private readonly svc: ReconIqService,
    private readonly cdr: ChangeDetectorRef,
    private readonly sanitizer: DomSanitizer,
    private readonly router: Router,
    private readonly socketService: SocketService,
  ) {}

  goToMatching(): void {
    this.router.navigate(['/app/recon-iq/matching']);
  }

  ngOnInit(): void {
    this.searchSub = this.search$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
    ).subscribe(() => { this.page = 1; this.loadHistory(); });
    this.loadHistory();
    this.loadConnections();
    this.eraSub = this.socketService.onEraProcessingComplete().subscribe(() => {
      this.loadHistory();
    });
  }

  loadConnections(): void {
    this.svc.getClearinghouseConnections().subscribe({
      next: (res) => {
        this.connections = res.rows ?? [];
        if (this.connections.length) this.selectedConnectionId = this.connections[0].id;
        this.cdr.markForCheck();
      },
      error: () => { /* connections are optional - suppress errors */ },
    });
  }

  fetchFromClearinghouse(): void {
    if (!this.selectedConnectionId) return;
    this.fetching   = true;
    this.fetchResult = null;
    this.fetchError  = null;
    this.cdr.markForCheck();
    this.svc.fetchEraFromClearinghouse(this.selectedConnectionId).subscribe({
      next: (res) => {
        this.fetchResult = { fetched: res.fetched, ingested: res.ingested, errors: res.errors };
        this.fetching = false;
        if (res.ingested > 0) { this.page = 1; this.loadHistory(); } else { this.cdr.markForCheck(); }
        this.loadConnections();
      },
      error: (err) => {
        this.fetchError = err?.error?.message ?? 'Fetch failed';
        this.fetching = false;
        this.cdr.markForCheck();
      },
    });
  }

  onSearchInput(value: string): void {
    this.searchTerm = value;
    this.search$.next(value);
  }

  onFilterChange(): void {
    this.page = 1;
    this.loadHistory();
  }

  sort(col: SortCol): void {
    if (this.sortBy === col) {
      this.sortDir = this.sortDir === 'desc' ? 'asc' : 'desc';
    } else {
      this.sortBy  = col;
      this.sortDir = col === 'uploaded_at' ? 'desc' : 'asc';
    }
    this.page = 1;
    this.loadHistory();
  }

  sortIcon(col: SortCol): string {
    if (this.sortBy !== col) return 'unfold_more';
    return this.sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  goPage(delta: number): void {
    this.page = Math.max(1, Math.min(this.totalPages, this.page + delta));
    this.loadHistory();
  }

  get totalPages(): number { return Math.max(1, Math.ceil(this.total / this.pageSize)); }
  get pageFrom(): number   { return this.total === 0 ? 0 : (this.page - 1) * this.pageSize + 1; }
  get pageTo(): number     { return Math.min(this.page * this.pageSize, this.total); }

  clearFilters(): void {
    this.searchTerm = '';
    this.filterStatus = '';
    this.filterFileType = '';
    this.page = 1;
    this.loadHistory();
  }

  get hasActiveFilters(): boolean {
    return !!(this.searchTerm || this.filterStatus || this.filterFileType);
  }

  loadHistory(): void {
    this.historyLoading = true;
    this.cdr.markForCheck();
    this.svc.getEraIngestionHistory({
      page:      this.page,
      pageSize:  this.pageSize,
      search:    this.searchTerm    || undefined,
      sortBy:    this.sortBy,
      sortDir:   this.sortDir,
      status:    this.filterStatus  || undefined,
      fileType:  this.filterFileType || undefined,
    }).subscribe({
      next: (res) => {
        this.history  = res.rows;
        this.total    = res.total;
        this.historyLoading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.historyLoading = false; this.cdr.markForCheck(); },
    });
  }

  onDragOver(ev: DragEvent): void { ev.preventDefault(); this.isDragOver = true; }
  onDragLeave(): void { this.isDragOver = false; }

  onDrop(ev: DragEvent): void {
    ev.preventDefault();
    this.isDragOver = false;
    const file = ev.dataTransfer?.files[0];
    if (file) this.upload(file);
  }

  onFileSelected(ev: Event): void {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (file) this.upload(file);
  }

  upload(file: File): void {
    this.uploading    = true;
    this.uploadResult = null;
    this.uploadError  = null;
    this.cdr.markForCheck();
    this.svc.uploadEraFile(file).subscribe({
      next: (res) => {
        this.uploadResult = res;
        this.uploading = false;
        this.page = 1;
        this.loadHistory();
      },
      error: (err) => {
        this.uploadError = err?.error?.message ?? 'Upload failed';
        this.uploading = false;
        this.cdr.markForCheck();
      },
    });
  }

  toggleExpand(row: EraIngestionLogRow): void {
    if (this.expandedId === row.id) { this.expandedId = -1; this.cdr.markForCheck(); return; }
    this.expandedId = row.id;
    if (!this.detailMap.has(row.id)) {
      this.detailLoading.add(row.id);
      this.cdr.markForCheck();
      this.svc.getEraIngestionDetail(row.id).subscribe({
        next: (detail) => {
          this.detailMap.set(row.id, detail);
          if (detail.fileType === 'EOB' && detail.fileContent) {
            const blob = new Blob([detail.fileContent], { type: 'text/html' });
            this.blobUrls.set(row.id, this.sanitizer.bypassSecurityTrustResourceUrl(URL.createObjectURL(blob)));
          }
          this.detailLoading.delete(row.id);
          this.cdr.markForCheck();
        },
        error: () => { this.detailLoading.delete(row.id); this.cdr.markForCheck(); },
      });
    } else {
      this.cdr.markForCheck();
    }
  }

  ngOnDestroy(): void { this.searchSub?.unsubscribe(); this.eraSub?.unsubscribe(); }

  formatSize(bytes: number): string {
    if (!bytes) return '\u2014';
    if (bytes < 1024)        return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  statusClass(status: string): string {
    const map: Record<string, string> = {
      completed:  'badge--resolved',
      failed:     'badge--critical',
      duplicate:  'badge--medium',
      processing: 'badge--open',
    };
    return `badge ${map[status] ?? ''}`;
  }
}
