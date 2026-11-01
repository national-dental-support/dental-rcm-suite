import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { DomSanitizer } from '@angular/platform-browser';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import { ClaimDocumentDialogComponent } from './claim-document-dialog.component';
import { ClaimDocumentService, ClaimDocument } from '../../../../core/services/claim-document.service';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('ClaimDocumentDialogComponent', () => {
  let component: ClaimDocumentDialogComponent;
  let fixture: ComponentFixture<ClaimDocumentDialogComponent>;

  const mockDoc: ClaimDocument = {
    id: 1,
    claim_id: 'CL123',
    file_name: 'eob.pdf',
    content_type: 'application/pdf',
    file_size: 2048,
    doc_type: 'eob',
    uploaded_by: 'user1',
    created_at: '2025-01-01',
  };

  const mockDocSvc = {
    list: jasmine.createSpy('list').and.returnValue(of([mockDoc])),
    upload: jasmine.createSpy('upload').and.returnValue(of(mockDoc)),
    remove: jasmine.createSpy('remove').and.returnValue(of({})),
    getDownloadUrl: jasmine.createSpy('getDownloadUrl').and.returnValue('http://example.com/doc/1'),
    downloadBlob: jasmine.createSpy('downloadBlob').and.returnValue(of(new Blob(['test'], { type: 'application/pdf' }))),
  };

  const mockDialogRef = { close: jasmine.createSpy('close') };
  const mockDialogData = { title: 'Documents', docType: 'eob' as const, claimId: 'CL123' };
  const mockSnack = { open: jasmine.createSpy('open') };
  const mockSanitizer = {
    bypassSecurityTrustResourceUrl: jasmine.createSpy('bypassSecurityTrustResourceUrl').and.returnValue('safe-url'),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    declarations: [ClaimDocumentDialogComponent],
    schemas: [NO_ERRORS_SCHEMA],
    imports: [],
    providers: [
        { provide: ClaimDocumentService, useValue: mockDocSvc },
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: mockDialogData },
        { provide: MatSnackBar, useValue: mockSnack },
        { provide: DomSanitizer, useValue: mockSanitizer },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
    ]
}).compileComponents();

    fixture = TestBed.createComponent(ClaimDocumentDialogComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should load documents on init', () => {
    fixture.detectChanges();
    expect(mockDocSvc.list).toHaveBeenCalledWith('CL123');
    expect(component.documents).toEqual([mockDoc]);
    expect(component.loading).toBeFalse();
  });

  it('should set uploadDocType from dialogData.docType on init', () => {
    fixture.detectChanges();
    expect(component.uploadDocType).toBe('eob');
  });

  it('should default uploadDocType to "other" when docType is not provided', () => {
    component.data = { title: 'Test', claimId: 'CL123' };
    component.ngOnInit();
    expect(component.uploadDocType).toBe('other');
  });

  it('should not load documents if claimId is missing', () => {
    mockDocSvc.list.calls.reset();
    component.data = { title: 'Test' };
    component.ngOnInit();
    expect(mockDocSvc.list).not.toHaveBeenCalled();
    expect(component.loading).toBeFalse();
  });

  it('should preview a document', () => {
    fixture.detectChanges();
    component.preview(mockDoc);
    expect(mockDocSvc.downloadBlob).toHaveBeenCalledWith(mockDoc.id);
    expect(component.previewDoc).toBe(mockDoc);
  });

  it('should close preview', () => {
    fixture.detectChanges();
    component.preview(mockDoc);
    component.closePreview();
    expect(component.previewUrl).toBeNull();
    expect(component.previewDoc).toBeNull();
  });

  it('should delete a document and remove from list', () => {
    fixture.detectChanges();
    spyOn(window, 'confirm').and.returnValue(true);
    component.deleteDoc(mockDoc);
    expect(mockDocSvc.remove).toHaveBeenCalledWith(mockDoc.id);
    expect(component.documents.find(d => d.id === mockDoc.id)).toBeUndefined();
  });

  it('should close the dialog on onClose', () => {
    fixture.detectChanges();
    component.onClose();
    expect(mockDialogRef.close).toHaveBeenCalled();
  });

  it('formatSize should format bytes correctly', () => {
    fixture.detectChanges();
    expect(component.formatSize(500)).toBe('500 B');
    expect(component.formatSize(2048)).toBe('2.0 KB');
    expect(component.formatSize(1048576)).toBe('1.0 MB');
  });

  it('docTypeLabel should map known types', () => {
    fixture.detectChanges();
    expect(component.docTypeLabel('eob')).toBe('EOB');
    expect(component.docTypeLabel('claim-form')).toBe('Claim Form');
    expect(component.docTypeLabel('appeal')).toBe('Appeal Letter');
    expect(component.docTypeLabel('unknown')).toBe('unknown');
  });

  it('iconForType should return correct icons', () => {
    fixture.detectChanges();
    expect(component.iconForType('application/pdf')).toBe('picture_as_pdf');
    expect(component.iconForType('image/png')).toBe('image');
    expect(component.iconForType('text/plain')).toBe('description');
  });
});
