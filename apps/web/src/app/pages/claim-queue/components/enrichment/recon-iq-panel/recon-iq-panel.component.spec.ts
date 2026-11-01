import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ReconIqPanelComponent } from './recon-iq-panel.component';
import { environment } from '../../../../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('ReconIqPanelComponent', () => {
  let component: ReconIqPanelComponent;
  let fixture: ComponentFixture<ReconIqPanelComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    declarations: [ReconIqPanelComponent],
    schemas: [NO_ERRORS_SCHEMA],
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
}).compileComponents();

    fixture = TestBed.createComponent(ReconIqPanelComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    component.claimId = 'CL500';
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    fixture.detectChanges();
    httpMock.expectOne(`${environment.server.baseUrl}/recon-iq/claim-summary/CL500`).flush({ matched: false });
    expect(component).toBeTruthy();
  });

  it('should start in loading state', () => {
    expect(component.loading).toBeTrue();
    expect(component.error).toBeFalse();
    expect(component.notSubscribed).toBeFalse();
    expect(component.data).toBeNull();
  });

  it('should populate data on successful response', () => {
    fixture.detectChanges();
    const mockData = { matched: true, eobId: 'EOB-001', matchedPaymentAmount: 150.00 };
    httpMock.expectOne(`${environment.server.baseUrl}/recon-iq/claim-summary/CL500`).flush(mockData);

    expect(component.data).toEqual(mockData);
    expect(component.loading).toBeFalse();
  });

  it('should set error flag on HTTP error', () => {
    fixture.detectChanges();
    httpMock.expectOne(`${environment.server.baseUrl}/recon-iq/claim-summary/CL500`).flush('error', { status: 500, statusText: 'Server Error' });

    expect(component.error).toBeTrue();
    expect(component.loading).toBeFalse();
  });

  it('should set notSubscribed on 403 with subscriptionRequired', () => {
    fixture.detectChanges();
    httpMock.expectOne(`${environment.server.baseUrl}/recon-iq/claim-summary/CL500`).flush(
      { subscriptionRequired: true },
      { status: 403, statusText: 'Forbidden' }
    );

    expect(component.notSubscribed).toBeTrue();
    expect(component.error).toBeFalse();
    expect(component.loading).toBeFalse();
  });
});
