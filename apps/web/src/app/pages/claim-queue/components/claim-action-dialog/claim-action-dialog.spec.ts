import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ClaimActionDialogComponent } from './claim-action-dialog';

describe('ClaimActionDialogComponent', () => {
  let component: ClaimActionDialogComponent;
  let fixture: ComponentFixture<ClaimActionDialogComponent>;
  const mockDialogRef = { close: jasmine.createSpy('close') };
  const mockDialogData = { action: 'Escalate' };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ClaimActionDialogComponent],
      imports: [ReactiveFormsModule],
      providers: [
        FormBuilder,
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: mockDialogData },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(ClaimActionDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should expose injected dialog data', () => {
    expect(component.data.action).toBe('Escalate');
  });

  it('should initialize note control with empty string', () => {
    expect(component.note.value).toBe('');
  });

  it('should close dialog when ref.close() is called', () => {
    component.ref.close();
    expect(mockDialogRef.close).toHaveBeenCalled();
  });

  it('should close dialog with note value on confirm', () => {
    component.note.setValue('Test note');
    component.ref.close(component.note.value);
    expect(mockDialogRef.close).toHaveBeenCalledWith('Test note');
  });
});
