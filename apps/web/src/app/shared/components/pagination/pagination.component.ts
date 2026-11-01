import {
  Component, Input, Output, EventEmitter,
  ViewChild, OnChanges, SimpleChanges, AfterViewInit, ChangeDetectorRef,
  TrackByFunction
} from '@angular/core';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';

export interface FileItem {
  id?: string;
  name: string;
  size?: number | null;
  lastModified?: Date | string | null;
}

@Component({
    selector: 'app-files-paginator',
    templateUrl: './pagination.component.html',
    styleUrls: ['./pagination.component.scss'],
    standalone: false
})
export class FilesPaginatorComponent implements OnChanges, AfterViewInit {
  @Input() files: FileItem[] = [];
  @Input() loading = false;
  @Input() error: string | null = null;

  @Input() pageSize = 10;
  @Input() pageSizeOptions: number[] = [5, 10, 25, 50];
  @Input() hidePageSize = false;

  @Output() download = new EventEmitter<string>();
  @Output() preview = new EventEmitter<string>();

  displayedColumns: string[] = ['name', 'size', 'lastModified', 'actions'];
  dataSource = new MatTableDataSource<FileItem>([]);
  trackByFile: TrackByFunction<FileItem> = (_i, item) => item.id ?? item.name;

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  constructor(private cdr: ChangeDetectorRef) {
    this.dataSource.sortingDataAccessor = (item, property) => {
    switch (property) {
      case 'lastModified':
        // handle Date | string | number | null/undefined
        return item.lastModified ? new Date(item.lastModified).getTime() : 0;
      case 'size':
        return item.size ?? -1;
      case 'name':
        return (item.name || '').toLowerCase();
      default:
        // fallback
        return (item as any)[property];
    }
  };
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['files']) {
      // Replace the array to avoid in-place mutation issues
      this.dataSource.data = [...(this.files ?? [])];
      // If paginator is ready, reset to first page after current tick
      if (this.paginator) {
        Promise.resolve().then(() => this.paginator.firstPage());
      }
      // Force a CD cycle so MatTable renders immediately without waiting for
      // an external event (resize, focus) to trigger zone-based detection
      this.cdr.detectChanges();
    }
    if (changes['pageSize'] && this.paginator) {
      this.paginator.pageSize = this.pageSize;
      // Ensure table recalculates pages after pageSize change
      this.dataSource._updateChangeSubscription?.();
      this.cdr.detectChanges();
    }
  }

  ngAfterViewInit(): void {
    if (this.paginator) {
      this.dataSource.paginator = this.paginator;
      this.paginator.pageSize = this.pageSize;
    }
    if (this.sort) {
      this.dataSource.sort = this.sort;
    }
    // Flush one CD cycle so MatTable + paginator are in sync and avoid NG0100 on first interaction
    this.cdr.detectChanges();
  }

  trackByName = (_: number, f: FileItem) => f.name;

  onDownload(name: string) { this.download.emit(name); }
}