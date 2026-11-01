import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, ChangeDetectorRef } from '@angular/core';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ClaimVisionPanelComponent } from './claim-vision-panel.component';
import { environment } from '../../../../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('ClaimVisionPanelComponent', () => {
  let component: ClaimVisionPanelComponent;
  let fixture: ComponentFixture<ClaimVisionPanelComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    declarations: [ClaimVisionPanelComponent],
    schemas: [NO_ERRORS_SCHEMA],
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
}).compileComponents();

    fixture = TestBed.createComponent(ClaimVisionPanelComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    component.claimId = 'CL001';
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    fixture.detectChanges();
    httpMock.expectOne(`${environment.server.baseUrl}/claim-vision/claim-summary/CL001`).flush({ rejected: false, rules: [] });
    expect(component).toBeTruthy();
  });

  it('should start in loading state', () => {
    expect(component.loading).toBeTrue();
    expect(component.error).toBeFalse();
    expect(component.notSubscribed).toBeFalse();
  });

  it('should populate data on successful HTTP response', () => {
    fixture.detectChanges();
    const mockData = { rejected: true, rules: [{ ruleId: 1, ruleName: 'Rule A', description: 'desc', category: 'Coding', rejectedDate: '2025-01-01' }] };
    httpMock.expectOne(`${environment.server.baseUrl}/claim-vision/claim-summary/CL001`).flush(mockData);

    expect(component.data).toEqual(mockData);
    expect(component.loading).toBeFalse();
    expect(component.error).toBeFalse();
  });

  it('should set error flag on HTTP error', () => {
    fixture.detectChanges();
    httpMock.expectOne(`${environment.server.baseUrl}/claim-vision/claim-summary/CL001`).flush('Server error', { status: 500, statusText: 'Internal Server Error' });

    expect(component.error).toBeTrue();
    expect(component.loading).toBeFalse();
  });

  it('should set notSubscribed flag on 403 with subscriptionRequired', () => {
    fixture.detectChanges();
    httpMock.expectOne(`${environment.server.baseUrl}/claim-vision/claim-summary/CL001`).flush(
      { subscriptionRequired: true },
      { status: 403, statusText: 'Forbidden' }
    );

    expect(component.notSubscribed).toBeTrue();
    expect(component.error).toBeFalse();
    expect(component.loading).toBeFalse();
  });
});
