import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { InsightflowPanelComponent } from './insightflow-panel.component';
import { environment } from '../../../../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('InsightflowPanelComponent', () => {
  let component: InsightflowPanelComponent;
  let fixture: ComponentFixture<InsightflowPanelComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    declarations: [InsightflowPanelComponent],
    schemas: [NO_ERRORS_SCHEMA],
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
}).compileComponents();

    fixture = TestBed.createComponent(InsightflowPanelComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    component.reasonCode = 'CO26';
    fixture.detectChanges();
    httpMock.expectOne(`${environment.server.baseUrl}/insightflow/claim-context/CO26`).flush({
      reasonCode: 'CO26', denialCount90d: 10, totalClaims90d: 100, denialRate90d: 0.1, trend: [], topPayers: [],
    });
    expect(component).toBeTruthy();
  });

  it('should skip HTTP call and stop loading when reasonCode is empty', () => {
    component.reasonCode = '';
    fixture.detectChanges();
    httpMock.expectNone(`${environment.server.baseUrl}/insightflow/claim-context/`);
    expect(component.loading).toBeFalse();
  });

  it('should populate data on successful response', () => {
    component.reasonCode = 'CO4';
    fixture.detectChanges();
    const mockData = { reasonCode: 'CO4', denialCount90d: 5, totalClaims90d: 50, denialRate90d: 0.1, trend: [], topPayers: [] };
    httpMock.expectOne(`${environment.server.baseUrl}/insightflow/claim-context/CO4`).flush(mockData);

    expect(component.data).toEqual(mockData);
    expect(component.loading).toBeFalse();
  });

  it('should set error flag on generic HTTP error', () => {
    component.reasonCode = 'CO4';
    fixture.detectChanges();
    httpMock.expectOne(`${environment.server.baseUrl}/insightflow/claim-context/CO4`).flush('error', { status: 500, statusText: 'Server Error' });

    expect(component.error).toBeTrue();
    expect(component.loading).toBeFalse();
  });

  it('should set notSubscribed on 403 with subscriptionRequired', () => {
    component.reasonCode = 'CO4';
    fixture.detectChanges();
    httpMock.expectOne(`${environment.server.baseUrl}/insightflow/claim-context/CO4`).flush(
      { subscriptionRequired: true },
      { status: 403, statusText: 'Forbidden' }
    );

    expect(component.notSubscribed).toBeTrue();
    expect(component.error).toBeFalse();
  });
});
