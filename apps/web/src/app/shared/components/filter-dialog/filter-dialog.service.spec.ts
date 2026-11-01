import { TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';
import { FilterDialogService } from './filter-dialog.service';
import { FilterDialogConfig } from '../../../core/models/filter-dialog.model';

describe('FilterDialogService', () => {
  let service: FilterDialogService;
  let mockDialog: jasmine.SpyObj<MatDialog>;
  let mockDialogRef: jasmine.SpyObj<MatDialogRef<any>>;

  beforeEach(() => {
    mockDialogRef = jasmine.createSpyObj('MatDialogRef', ['afterClosed']);
    mockDialogRef.afterClosed.and.returnValue(of({ values: { status: 'active' } }));

    mockDialog = jasmine.createSpyObj('MatDialog', ['open']);
    mockDialog.open.and.returnValue(mockDialogRef as any);

    TestBed.configureTestingModule({
      providers: [
        FilterDialogService,
        { provide: MatDialog, useValue: mockDialog },
      ],
    });

    service = TestBed.inject(FilterDialogService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('open() should call dialog.open and return afterClosed observable', (done) => {
    const config: FilterDialogConfig = {
      title: 'Filters',
      fields: [],
    };

    service.open(config).subscribe(result => {
      expect(result).toEqual({ values: { status: 'active' } });
      done();
    });

    expect(mockDialog.open).toHaveBeenCalled();
  });

  it('open() should pass width 720px to dialog', () => {
    const config: FilterDialogConfig = { title: 'Test', fields: [] };
    service.open(config);
    const openArgs = mockDialog.open.calls.mostRecent().args;
    expect(openArgs[1]?.width).toBe('720px');
  });

  it('open() should pass config as data to dialog', () => {
    const config: FilterDialogConfig = { title: 'My Filters', fields: [] };
    service.open(config);
    const openArgs = mockDialog.open.calls.mostRecent().args;
    expect(openArgs[1]?.data).toEqual(config);
  });
});
