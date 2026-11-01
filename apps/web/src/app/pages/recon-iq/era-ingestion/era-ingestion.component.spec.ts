import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, throwError } from 'rxjs';

import { EraIngestionComponent } from './era-ingestion.component';
import { ReconIqService } from '../../../core/services/recon-iq.service';

const MOCK_HISTORY_RESPONSE = {
  rows: [
    { id: 1, fileName: 'era-001.835', fileSizeBytes: 2048, status: 'completed', claimsFound: 10, claimsMatched: 9, uploadedAt: '2026-04-01T10:00:00Z' } as any,
  ],
  total: 1,
  page: 1,
  pageSize: 20,
};

const MOCK_UPLOAD_RESULT = { logId: 42, status: 'completed', claimsFound: 5, claimsMatched: 5 };

const MOCK_CONNECTIONS_RESPONSE = {
  rows: [
    { id: 1, connection_name: 'Test Clearinghouse', last_era_fetch_at: null },
  ],
};

describe('EraIngestionComponent', () => {
  let component: EraIngestionComponent;
  let fixture: ComponentFixture<EraIngestionComponent>;
  let serviceSpy: jasmine.SpyObj<ReconIqService>;

  beforeEach(async () => {
    serviceSpy = jasmine.createSpyObj('ReconIqService', [
      'getEraIngestionHistory',
      'uploadEraFile',
      'getClearinghouseConnections',
      'fetchEraFromClearinghouse',
    ]);

    serviceSpy.getEraIngestionHistory.and.returnValue(of(MOCK_HISTORY_RESPONSE));
    serviceSpy.uploadEraFile.and.returnValue(of(MOCK_UPLOAD_RESULT));
    serviceSpy.getClearinghouseConnections.and.returnValue(of(MOCK_CONNECTIONS_RESPONSE));
    serviceSpy.fetchEraFromClearinghouse.and.returnValue(of({ fetched: 1, ingested: 1, errors: [] }));

    await TestBed.configureTestingModule({
      declarations: [EraIngestionComponent],
      providers: [{ provide: ReconIqService, useValue: serviceSpy }],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(EraIngestionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- ngOnInit ---

  it('should call loadHistory on init', () => {
    expect(serviceSpy.getEraIngestionHistory).toHaveBeenCalled();
  });

  it('should populate history rows on init', () => {
    expect(component.history.length).toBe(1);
    expect(component.history[0].id).toBe(1);
  });

  it('should set historyLoading to false after successful load', () => {
    expect(component.historyLoading).toBeFalse();
  });

  it('should set historyLoading false on error', () => {
    serviceSpy.getEraIngestionHistory.and.returnValue(throwError(() => new Error('fail')));
    component.loadHistory();
    expect(component.historyLoading).toBeFalse();
  });

  // --- formatSize ---

  it('formatSize(0) returns em dash', () => {
    expect(component.formatSize(0)).toBe('\u2014');
  });

  it('formatSize(512) returns byte value', () => {
    expect(component.formatSize(512)).toBe('512 B');
  });

  it('formatSize(1024) returns "1.0 KB"', () => {
    expect(component.formatSize(1024)).toBe('1.0 KB');
  });

  it('formatSize(2048) returns "2.0 KB"', () => {
    expect(component.formatSize(2048)).toBe('2.0 KB');
  });

  it('formatSize(1048576) returns "1.0 MB"', () => {
    expect(component.formatSize(1048576)).toBe('1.0 MB');
  });

  it('formatSize(2097152) returns "2.0 MB"', () => {
    expect(component.formatSize(2097152)).toBe('2.0 MB');
  });

  // --- statusClass ---

  it('statusClass("completed") returns badge--resolved class', () => {
    expect(component.statusClass('completed')).toBe('badge badge--resolved');
  });

  it('statusClass("failed") returns badge--critical class', () => {
    expect(component.statusClass('failed')).toBe('badge badge--critical');
  });

  it('statusClass("processing") returns badge--open class', () => {
    expect(component.statusClass('processing')).toBe('badge badge--open');
  });

  it('statusClass("duplicate") returns badge--medium class', () => {
    expect(component.statusClass('duplicate')).toBe('badge badge--medium');
  });

  it('statusClass with unknown value returns badge with empty suffix', () => {
    expect(component.statusClass('unknown')).toBe('badge ');
  });

  // --- onDragOver ---

  it('onDragOver calls event.preventDefault()', () => {
    const event = { preventDefault: jasmine.createSpy('preventDefault'), dataTransfer: null } as any;
    component.onDragOver(event);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('onDragOver sets isDragOver to true', () => {
    const event = { preventDefault: jasmine.createSpy('preventDefault'), dataTransfer: null } as any;
    component.isDragOver = false;
    component.onDragOver(event);
    expect(component.isDragOver).toBeTrue();
  });

  // --- onDragLeave ---

  it('onDragLeave sets isDragOver to false', () => {
    component.isDragOver = true;
    component.onDragLeave();
    expect(component.isDragOver).toBeFalse();
  });

  // --- onDrop ---

  it('onDrop calls event.preventDefault()', () => {
    const event = {
      preventDefault: jasmine.createSpy('preventDefault'),
      dataTransfer: { files: [] },
    } as any;
    component.onDrop(event);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('onDrop sets isDragOver to false', () => {
    const event = {
      preventDefault: jasmine.createSpy('preventDefault'),
      dataTransfer: { files: [] },
    } as any;
    component.isDragOver = true;
    component.onDrop(event);
    expect(component.isDragOver).toBeFalse();
  });

  it('onDrop calls upload when a file is present', () => {
    const mockFile = new File(['content'], 'era.835', { type: 'text/plain' });
    const event = {
      preventDefault: jasmine.createSpy('preventDefault'),
      dataTransfer: { files: [mockFile] },
    } as any;
    spyOn(component, 'upload');
    component.onDrop(event);
    expect(component.upload).toHaveBeenCalledWith(mockFile);
  });

  it('onDrop does not call upload when no file is present', () => {
    const event = {
      preventDefault: jasmine.createSpy('preventDefault'),
      dataTransfer: { files: [] },
    } as any;
    spyOn(component, 'upload');
    component.onDrop(event);
    expect(component.upload).not.toHaveBeenCalled();
  });

  // --- upload ---

  it('upload() with a file calls uploadEraFile and sets uploadResult', () => {
    const mockFile = new File(['data'], 'era.835');
    component.upload(mockFile);
    expect(serviceSpy.uploadEraFile).toHaveBeenCalledWith(mockFile);
    expect(component.uploadResult).toEqual(MOCK_UPLOAD_RESULT);
  });

  it('upload() clears uploadResult and uploadError before starting', () => {
    component.uploadResult = { logId: 1, status: 'completed', claimsFound: 0, claimsMatched: 0 };
    component.uploadError = 'previous error';
    const mockFile = new File(['data'], 'era.835');
    // Spy to capture state before next() fires
    serviceSpy.uploadEraFile.and.callFake(() => {
      expect(component.uploadResult).toBeNull();
      expect(component.uploadError).toBeNull();
      return of(MOCK_UPLOAD_RESULT);
    });
    component.upload(mockFile);
  });

  it('upload() sets uploading to false after success', () => {
    const mockFile = new File(['data'], 'era.835');
    component.upload(mockFile);
    expect(component.uploading).toBeFalse();
  });

  it('upload() sets uploadError on failure', () => {
    serviceSpy.uploadEraFile.and.returnValue(throwError(() => ({ error: { message: 'Upload failed' } })));
    const mockFile = new File(['data'], 'era.835');
    component.upload(mockFile);
    expect(component.uploadError).toBe('Upload failed');
    expect(component.uploading).toBeFalse();
  });

  it('upload() reloads history after successful upload', () => {
    const callsBefore = serviceSpy.getEraIngestionHistory.calls.count();
    const mockFile = new File(['data'], 'era.835');
    component.upload(mockFile);
    expect(serviceSpy.getEraIngestionHistory.calls.count()).toBeGreaterThan(callsBefore);
  });

  // --- onFileSelected ---

  it('onFileSelected() calls upload with selected file', () => {
    const mockFile = new File(['data'], 'era.835');
    const inputEl = { files: [mockFile] } as any;
    const event = { target: inputEl } as any;
    spyOn(component, 'upload');
    component.onFileSelected(event);
    expect(component.upload).toHaveBeenCalledWith(mockFile);
  });

  it('onFileSelected() does not call upload when no file selected', () => {
    const inputEl = { files: [] } as any;
    const event = { target: inputEl } as any;
    spyOn(component, 'upload');
    component.onFileSelected(event);
    expect(component.upload).not.toHaveBeenCalled();
  });
});
