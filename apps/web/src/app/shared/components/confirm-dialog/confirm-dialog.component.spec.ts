import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { SharedConfirmDialogComponent } from './confirm-dialog.component';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('SharedConfirmDialogComponent', () => {
  let component: SharedConfirmDialogComponent;
  let fixture: ComponentFixture<SharedConfirmDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    declarations: [SharedConfirmDialogComponent],
    schemas: [NO_ERRORS_SCHEMA],
    imports: [NoopAnimationsModule, MatDialogModule],
    providers: [
        { provide: MatDialogRef, useValue: { close: jasmine.createSpy('close') } },
        { provide: MAT_DIALOG_DATA, useValue: {} },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
    ]
}).compileComponents();

    fixture = TestBed.createComponent(SharedConfirmDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
