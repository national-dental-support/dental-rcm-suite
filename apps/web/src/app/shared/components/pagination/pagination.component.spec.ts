import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, SimpleChange } from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { FilesPaginatorComponent } from './pagination.component';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('FilesPaginatorComponent', () => {
  let component: FilesPaginatorComponent;
  let fixture: ComponentFixture<FilesPaginatorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    declarations: [FilesPaginatorComponent],
    schemas: [NO_ERRORS_SCHEMA],
    imports: [NoopAnimationsModule],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
}).compileComponents();

    fixture = TestBed.createComponent(FilesPaginatorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // -- ngOnChanges - files input -------------------------------------------

  it('ngOnChanges should update dataSource when files changes', () => {
    const files = [{ id: '1', name: 'test.pdf', size: 1024 }];
    component.files = files;
    component.ngOnChanges({
      files: new SimpleChange([], files, false),
    });
    expect(component.dataSource.data.length).toBe(1);
    expect(component.dataSource.data[0].name).toBe('test.pdf');
  });

  it('ngOnChanges handles null files with ?? fallback', () => {
    (component as any).files = null;
    component.ngOnChanges({
      files: new SimpleChange([], null, false),
    });
    expect(component.dataSource.data.length).toBe(0);
  });

  it('ngOnChanges does not update dataSource when files did not change', () => {
    const original = component.dataSource.data;
    component.ngOnChanges({
      pageSize: new SimpleChange(10, 25, false),
    });
    // data should remain unchanged since 'files' not in changes
    expect(component.dataSource.data).toBe(original);
  });

  it('ngOnChanges with pageSize change (no paginator) does nothing', () => {
    component.pageSize = 25;
    component.ngOnChanges({
      pageSize: new SimpleChange(10, 25, false),
    });
    // Should not throw (paginator is null since ViewChild not set)
    expect(component.pageSize).toBe(25);
  });

  // -- sortingDataAccessor -------------------------------------------------

  it('sortingDataAccessor sorts by name (lowercase)', () => {
    const accessor = component.dataSource.sortingDataAccessor;
    const result = accessor({ name: 'MyFile.pdf', size: 100 }, 'name');
    expect(result).toBe('myfile.pdf');
  });

  it('sortingDataAccessor sorts by size', () => {
    const accessor = component.dataSource.sortingDataAccessor;
    const result = accessor({ name: 'test', size: 2048 }, 'size');
    expect(result).toBe(2048);
  });

  it('sortingDataAccessor returns -1 for null size', () => {
    const accessor = component.dataSource.sortingDataAccessor;
    const result = accessor({ name: 'test', size: null }, 'size');
    expect(result).toBe(-1);
  });

  it('sortingDataAccessor sorts by lastModified date', () => {
    const accessor = component.dataSource.sortingDataAccessor;
    const date = new Date('2025-01-15');
    const result = accessor({ name: 'test', lastModified: date }, 'lastModified');
    expect(result).toBe(date.getTime());
  });

  it('sortingDataAccessor returns 0 for null lastModified', () => {
    const accessor = component.dataSource.sortingDataAccessor;
    const result = accessor({ name: 'test', lastModified: null }, 'lastModified');
    expect(result).toBe(0);
  });

  it('sortingDataAccessor sorts by lastModified string', () => {
    const accessor = component.dataSource.sortingDataAccessor;
    const result = accessor({ name: 'test', lastModified: '2025-06-01' }, 'lastModified');
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThan(0);
  });

  it('sortingDataAccessor handles unknown property with fallback', () => {
    const accessor = component.dataSource.sortingDataAccessor;
    const result = accessor({ name: 'test', customProp: 'value' } as any, 'customProp');
    expect(result).toBe('value');
  });

  it('sortingDataAccessor handles empty name', () => {
    const accessor = component.dataSource.sortingDataAccessor;
    const result = accessor({ name: '' }, 'name');
    expect(result).toBe('');
  });

  // -- trackByFile & trackByName -------------------------------------------

  it('trackByFile uses id when available', () => {
    const result = component.trackByFile(0, { id: 'file-123', name: 'test.pdf' });
    expect(result).toBe('file-123');
  });

  it('trackByFile falls back to name when id is missing', () => {
    const result = component.trackByFile(0, { name: 'test.pdf' });
    expect(result).toBe('test.pdf');
  });

  it('trackByName returns file name', () => {
    const result = component.trackByName(0, { name: 'doc.docx' });
    expect(result).toBe('doc.docx');
  });

  // -- onDownload ----------------------------------------------------------

  it('onDownload emits download event with filename', () => {
    spyOn(component.download, 'emit');
    component.onDownload('report.pdf');
    expect(component.download.emit).toHaveBeenCalledWith('report.pdf');
  });

  // -- @Input bindings -----------------------------------------------------

  it('loading input should be false by default', () => {
    expect(component.loading).toBeFalse();
  });

  it('error input should be null by default', () => {
    expect(component.error).toBeNull();
  });

  it('pageSize defaults to 10', () => {
    expect(component.pageSize).toBe(10);
  });

  it('pageSizeOptions defaults to [5, 10, 25, 50]', () => {
    expect(component.pageSizeOptions).toEqual([5, 10, 25, 50]);
  });

  it('displayedColumns includes expected columns', () => {
    expect(component.displayedColumns).toContain('name');
    expect(component.displayedColumns).toContain('size');
    expect(component.displayedColumns).toContain('actions');
  });
});
