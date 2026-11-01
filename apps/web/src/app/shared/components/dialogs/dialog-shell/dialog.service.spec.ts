import { TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';
import { RpDialogService } from './dialog.service';

describe('RpDialogService', () => {
  let service: RpDialogService;
  let mockDialog: jasmine.SpyObj<MatDialog>;
  let mockDialogRef: jasmine.SpyObj<MatDialogRef<any>>;

  beforeEach(() => {
    mockDialogRef = jasmine.createSpyObj('MatDialogRef', ['afterClosed']);
    mockDialogRef.afterClosed.and.returnValue(of({ action: 'primary' }));

    mockDialog = jasmine.createSpyObj('MatDialog', ['open']);
    mockDialog.open.and.returnValue(mockDialogRef as any);

    TestBed.configureTestingModule({
      providers: [
        RpDialogService,
        { provide: MatDialog, useValue: mockDialog },
      ],
    });

    service = TestBed.inject(RpDialogService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('open() should call dialog.open and return afterClosed observable', (done) => {
    service.open({ title: 'Test', message: 'Hello' }).subscribe(result => {
      expect(result).toEqual({ action: 'primary' });
      done();
    });
    expect(mockDialog.open).toHaveBeenCalled();
  });

  it('confirm() should return true when action is primary', (done) => {
    mockDialogRef.afterClosed.and.returnValue(of({ action: 'primary' }));
    service.confirm('Are you sure?').subscribe(result => {
      expect(result).toBeTrue();
      done();
    });
  });

  it('confirm() should return false when action is cancel', (done) => {
    mockDialogRef.afterClosed.and.returnValue(of({ action: 'cancel' }));
    service.confirm('Are you sure?').subscribe(result => {
      expect(result).toBeFalse();
      done();
    });
  });

  it('confirm() should return false when dialog is dismissed (undefined)', (done) => {
    mockDialogRef.afterClosed.and.returnValue(of(undefined));
    service.confirm('Are you sure?').subscribe(result => {
      expect(result).toBeFalse();
      done();
    });
  });

  it('dangerConfirm() should return true when action is primary', (done) => {
    mockDialogRef.afterClosed.and.returnValue(of({ action: 'primary' }));
    service.dangerConfirm('Delete this?').subscribe(result => {
      expect(result).toBeTrue();
      done();
    });
  });

  it('dangerConfirm() should return false when action is cancel', (done) => {
    mockDialogRef.afterClosed.and.returnValue(of({ action: 'cancel' }));
    service.dangerConfirm('Delete this?').subscribe(result => {
      expect(result).toBeFalse();
      done();
    });
  });

  it('openTemplate() should call dialog.open with template config', (done) => {
    const tpl = {} as any;
    service.openTemplate({ title: 'My Template', template: tpl }).subscribe(result => {
      expect(result).toEqual({ action: 'primary' });
      done();
    });
    expect(mockDialog.open).toHaveBeenCalled();
  });
});
