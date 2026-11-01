import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, ChangeDetectorRef } from '@angular/core';
import { of, throwError, Subject } from 'rxjs';
import { NetworkLeasesComponent } from './network-leases.component';
import { PayerIqService } from '../../../core/services/payer-iq.service';
import { PayerIqFiltersStore } from '../../../shared/components/global-filters/global-filters.store';

describe('NetworkLeasesComponent', () => {
  let component: NetworkLeasesComponent;
  let fixture: ComponentFixture<NetworkLeasesComponent>;
  let mockPayerIqServiceSpy: jasmine.SpyObj<PayerIqService>;
  let filtersSubject: Subject<any>;

  beforeEach(async () => {
    filtersSubject = new Subject<any>();
    mockPayerIqServiceSpy = jasmine.createSpyObj('PayerIqService', ['getNetworkLeases']);
    mockPayerIqServiceSpy.getNetworkLeases.and.returnValue(of({
      data: { networks: [], payers: [] },
    }));

    const mockFiltersStore = {
      applied$: filtersSubject.asObservable(),
      value: {},
    };

    await TestBed.configureTestingModule({
      declarations: [NetworkLeasesComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: PayerIqService, useValue: mockPayerIqServiceSpy },
        { provide: PayerIqFiltersStore, useValue: mockFiltersStore },
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => {}, detectChanges: () => {} } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NetworkLeasesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    // Trigger initial filter emission
    filtersSubject.next({});
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with empty leaseNetworkRows', () => {
    expect(component.leaseNetworkRows).toEqual([]);
  });

  it('should have column definitions', () => {
    expect(component.leaseNetworkColumns.length).toBeGreaterThan(0);
    expect(component.leaseNetworkColumns.some(c => c.id === 'network')).toBeTrue();
    expect(component.leaseNetworkColumns.some(c => c.id === 'totalChargeAmount')).toBeTrue();
  });

  it('leaseNetworkChildren should return children or empty array', () => {
    const parentRow = { network: 'Zelis', totalChargeAmount: 100, totalPayment: 80, totalPatientVolume: 10, totalCPTVolume: 5, children: [{ network: 'Payer A', totalChargeAmount: 50, totalPayment: 40, totalPatientVolume: 5, totalCPTVolume: 3 }] };
    expect(component.leaseNetworkChildren(parentRow).length).toBe(1);
  });

  it('leaseNetworkChildren should return empty for rows without children', () => {
    const row = { network: 'Zelis', totalChargeAmount: 100, totalPayment: 80, totalPatientVolume: 10, totalCPTVolume: 5 };
    expect(component.leaseNetworkChildren(row)).toEqual([]);
  });

  it('isUnknownRow should return true for unknown payer/network', () => {
    expect(component.isUnknownRow({ network: 'Unknown Payer' } as any)).toBeTrue();
    expect(component.isUnknownRow({ network: 'Unknown Network' } as any)).toBeTrue();
    expect(component.isUnknownRow({ network: 'Zelis' } as any)).toBeFalse();
  });

  it('leaseNetworkRowClass should return unknown class for unknown rows', () => {
    expect(component.leaseNetworkRowClass({ network: 'Unknown Payer' } as any)).toBe('rp-row-unknown-payer');
    expect(component.leaseNetworkRowClass({ network: 'Zelis' } as any)).toBe('');
  });

  it('loading should initially be false after init', () => {
    expect(component.loading).toBeFalse();
  });

  it('should set error = true and empty rows on load error', () => {
    mockPayerIqServiceSpy.getNetworkLeases.and.returnValue(throwError(() => new Error('Network error')));
    filtersSubject.next({});
    expect(component.error).toBeTrue();
    expect(component.leaseNetworkRows).toEqual([]);
  });

  it('should build rows from networks and payers data', () => {
    mockPayerIqServiceSpy.getNetworkLeases.and.returnValue(of({
      data: {
        networks: [
          { NetworkName: 'Zelis', TotalChargeAmount: 100000, TotalPayments: 80000, TotalPatientVolume: 500, TotalCPTVolume: 1200 },
        ],
        payers: [
          { NetworkName: 'Zelis', PayerName: 'Aetna', TotalChargeAmount: 50000, TotalPayments: 40000, TotalPatientVolume: 250, TotalCPTVolume: 600 },
        ],
      },
    }));
    filtersSubject.next({});
    expect(component.leaseNetworkRows.length).toBe(1);
    expect(component.leaseNetworkRows[0].network).toBe('Zelis');
    expect(component.leaseNetworkRows[0].children!.length).toBe(1);
    expect(component.leaseNetworkRows[0].children![0].network).toBe('Aetna');
  });

  it('should handle null TotalChargeAmount in networks', () => {
    mockPayerIqServiceSpy.getNetworkLeases.and.returnValue(of({
      data: {
        networks: [{ NetworkName: 'Zelis', TotalChargeAmount: null, TotalPayments: null, TotalPatientVolume: null, TotalCPTVolume: null }],
        payers: [],
      },
    }));
    filtersSubject.next({});
    expect(component.leaseNetworkRows[0].totalChargeAmount).toBe(0);
    expect(component.leaseNetworkRows[0].totalPayment).toBe(0);
    expect(component.leaseNetworkRows[0].totalPatientVolume).toBe(0);
    expect(component.leaseNetworkRows[0].totalCPTVolume).toBe(0);
  });

  it('should handle null NetworkName in networks', () => {
    mockPayerIqServiceSpy.getNetworkLeases.and.returnValue(of({
      data: {
        networks: [{ NetworkName: null, TotalChargeAmount: 100, TotalPayments: 80, TotalPatientVolume: 10, TotalCPTVolume: 5 }],
        payers: [],
      },
    }));
    filtersSubject.next({});
    expect(component.leaseNetworkRows[0].network).toBe('Unknown Network');
  });

  it('should handle null PayerName in payers', () => {
    mockPayerIqServiceSpy.getNetworkLeases.and.returnValue(of({
      data: {
        networks: [{ NetworkName: 'Zelis', TotalChargeAmount: 100, TotalPayments: 80, TotalPatientVolume: 10, TotalCPTVolume: 5 }],
        payers: [{ NetworkName: 'Zelis', PayerName: null, TotalChargeAmount: 50, TotalPayments: 40, TotalPatientVolume: 5, TotalCPTVolume: 3 }],
      },
    }));
    filtersSubject.next({});
    expect(component.leaseNetworkRows[0].children![0].network).toBe('Unknown Payer');
  });

  it('should handle null payers array in response', () => {
    mockPayerIqServiceSpy.getNetworkLeases.and.returnValue(of({
      data: {
        networks: [{ NetworkName: 'Zelis', TotalChargeAmount: 100, TotalPayments: 80, TotalPatientVolume: 10, TotalCPTVolume: 5 }],
        payers: null,
      },
    }));
    filtersSubject.next({});
    expect(component.leaseNetworkRows.length).toBe(1);
    expect(component.leaseNetworkRows[0].children).toEqual([]);
  });

  it('should handle null networks array in response', () => {
    mockPayerIqServiceSpy.getNetworkLeases.and.returnValue(of({
      data: {
        networks: null,
        payers: [],
      },
    }));
    filtersSubject.next({});
    expect(component.leaseNetworkRows).toEqual([]);
  });

  it('displayFormatter for totalChargeAmount should format currency', () => {
    const col = component.leaseNetworkColumns.find(c => c.id === 'totalChargeAmount')!;
    const result = col.displayFormatter!(50000, {} as any);
    expect(result).toContain('$');
    expect(result).toContain('50,000');
  });

  it('displayFormatter for totalPayment should format currency', () => {
    const col = component.leaseNetworkColumns.find(c => c.id === 'totalPayment')!;
    const result = col.displayFormatter!(0, {} as any);
    expect(result).toContain('$0');
  });

  it('displayFormatter for totalPatientVolume should floor value', () => {
    const col = component.leaseNetworkColumns.find(c => c.id === 'totalPatientVolume')!;
    expect(col.displayFormatter!(100.7, {} as any)).toBe('100');
  });

  it('displayFormatter for totalPatientVolume should handle null with 0', () => {
    const col = component.leaseNetworkColumns.find(c => c.id === 'totalPatientVolume')!;
    expect(col.displayFormatter!(null as any, {} as any)).toBe('0');
  });

  it('displayFormatter for totalCPTVolume should floor value', () => {
    const col = component.leaseNetworkColumns.find(c => c.id === 'totalCPTVolume')!;
    expect(col.displayFormatter!(250.9, {} as any)).toBe('250');
  });

  it('isUnknownRow should handle null network', () => {
    expect(component.isUnknownRow({ network: null as any } as any)).toBeFalse();
  });

  it('should set error = false and rows populated on successful reload', () => {
    // First trigger an error
    mockPayerIqServiceSpy.getNetworkLeases.and.returnValue(throwError(() => new Error('fail')));
    filtersSubject.next({});
    expect(component.error).toBeTrue();
    // Then trigger success
    mockPayerIqServiceSpy.getNetworkLeases.and.returnValue(of({
      data: { networks: [], payers: [] },
    }));
    filtersSubject.next({});
    expect(component.error).toBeFalse();
  });

  it('ngOnDestroy should complete destroy$', () => {
    expect(() => component.ngOnDestroy()).not.toThrow();
  });
});
