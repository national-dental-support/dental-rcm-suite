import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CarcGuidance, DenialManagementService } from '../../../core/services/denial-management.service';

const CATEGORIES = [
  'Eligibility',
  'Prior Auth',
  'Timely Filing',
  'Duplicate',
  'Coding Error',
  'Coordination of Benefits',
  'Medical Necessity',
  'Non-Covered',
  'Contractual Adjustment',
  'Patient Responsibility',
  'Other',
];

@Component({
    selector: 'app-carc-library',
    templateUrl: './carc-library.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class CarcLibraryComponent implements OnInit {
  codes: CarcGuidance[] = [];
  loading = false;
  error = false;
  search = '';
  selectedCategory = '';
  currentPage = 1;
  total = 0;
  pageSize = 50;
  expandedCode: string | null = null;

  readonly categories = CATEGORIES;

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private svc: DenialManagementService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = false;
    this.cdr.markForCheck();

    this.svc.listCarcLibrary(this.search, this.selectedCategory, this.currentPage).subscribe({
      next: res => {
        this.codes = res.data;
        this.total = res.total;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.error = true;
        this.cdr.markForCheck();
      },
    });
  }

  onSearchChange(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.currentPage = 1;
      this.load();
    }, 300);
  }

  onCategoryChange(): void {
    this.currentPage = 1;
    this.load();
  }

  toggleExpand(code: string): void {
    this.expandedCode = this.expandedCode === code ? null : code;
    this.cdr.markForCheck();
  }

  get totalPages(): number {
    return Math.ceil(this.total / this.pageSize);
  }

  prevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.load();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.load();
    }
  }

  trackByCode(_: number, item: CarcGuidance): string { return item.code; }
}
