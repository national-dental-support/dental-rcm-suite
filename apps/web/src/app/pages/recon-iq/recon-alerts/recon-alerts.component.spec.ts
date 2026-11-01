import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, throwError } from 'rxjs';

import { ReconAlertsComponent } from './recon-alerts.component';
import { ReconIqService } from '../../../core/services/recon-iq.service';

const MOCK_ALERTS_RESPONSE = {
  rows: [
    { id: 7, alertType: 'unmatched_eob', severity: 'critical', status: 'open', message: 'EOB mismatch' } as any,
    { id: 8, alertType: 'unmatched_payment', severity: 'warning', status: 'open', message: 'Payment gap' } as any,
  ],
};

const MOCK_CONFIGS_RESPONSE = {
  configs: [
    { id: 1, alertType: 'unmatched_eob', thresholdDays: 7, severity: 'critical', isEnabled: true } as any,
  ],
};

describe('ReconAlertsComponent', () => {
  let component: ReconAlertsComponent;
  let fixture: ComponentFixture<ReconAlertsComponent>;
  let serviceSpy: jasmine.SpyObj<ReconIqService>;

  beforeEach(async () => {
    serviceSpy = jasmine.createSpyObj('ReconIqService', [
      'getReconAlerts',
      'acknowledgeAlert',
      'getAlertConfigs',
      'upsertAlertConfig',
    ]);

    serviceSpy.getReconAlerts.and.returnValue(of(MOCK_ALERTS_RESPONSE));
    serviceSpy.acknowledgeAlert.and.returnValue(of({ message: 'ok' }));
    serviceSpy.getAlertConfigs.and.returnValue(of(MOCK_CONFIGS_RESPONSE));
    serviceSpy.upsertAlertConfig.and.returnValue(of({ message: 'ok' }));

    await TestBed.configureTestingModule({
      declarations: [ReconAlertsComponent],
      providers: [{ provide: ReconIqService, useValue: serviceSpy }],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(ReconAlertsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- ngOnInit ---

  it('should load alerts on init', () => {
    expect(serviceSpy.getReconAlerts).toHaveBeenCalled();
    expect(component.alerts.length).toBe(2);
  });

  it('should load configs on init', () => {
    expect(serviceSpy.getAlertConfigs).toHaveBeenCalled();
    expect(component.configs.length).toBe(1);
  });

  it('should set alertsLoading to false after alerts load', () => {
    expect(component.alertsLoading).toBeFalse();
  });

  it('should set configsLoading to false after configs load', () => {
    expect(component.configsLoading).toBeFalse();
  });

  it('loadAlerts error path sets alertsLoading to false', () => {
    serviceSpy.getReconAlerts.and.returnValue(throwError(() => new Error('fail')));
    component.loadAlerts();
    expect(component.alertsLoading).toBeFalse();
  });

  it('loadConfigs error path sets configsLoading to false', () => {
    serviceSpy.getAlertConfigs.and.returnValue(throwError(() => new Error('fail')));
    component.loadConfigs();
    expect(component.configsLoading).toBeFalse();
  });

  // --- activeTab default ---

  it('activeTab defaults to "alerts"', () => {
    expect(component.activeTab).toBe('alerts');
  });

  it('setting activeTab to "config" switches the tab', () => {
    component.activeTab = 'config';
    expect(component.activeTab).toBe('config');
  });

  it('activeTab can be set back to "alerts"', () => {
    component.activeTab = 'config';
    component.activeTab = 'alerts';
    expect(component.activeTab).toBe('alerts');
  });

  // --- acknowledge ---

  it('acknowledge() calls acknowledgeAlert with the alert id', () => {
    const alert = component.alerts[0]; // id: 7
    component.acknowledge(alert);
    expect(serviceSpy.acknowledgeAlert).toHaveBeenCalledWith(7);
  });

  it('acknowledge() removes the alert from the list on success', () => {
    const alert = component.alerts[0]; // id: 7
    component.acknowledge(alert);
    expect(component.alerts.every(a => a.id !== 7)).toBeTrue();
  });

  it('acknowledge() leaves other alerts intact', () => {
    const alert = component.alerts[0]; // id: 7
    component.acknowledge(alert);
    expect(component.alerts.some(a => a.id === 8)).toBeTrue();
  });

  it('acknowledge() does not throw on service error', () => {
    serviceSpy.acknowledgeAlert.and.returnValue(throwError(() => new Error('ack fail')));
    const alert = component.alerts[0];
    expect(() => component.acknowledge(alert)).not.toThrow();
  });

  // --- saveConfig ---

  it('saveConfig() does nothing when newConfigType is empty', () => {
    component.newConfigType = '';
    component.saveConfig();
    expect(serviceSpy.upsertAlertConfig).not.toHaveBeenCalled();
  });

  it('saveConfig() calls upsertAlertConfig with correct payload', () => {
    component.newConfigType = 'unmatched_eob';
    component.newConfigDays = 14;
    component.newConfigSeverity = 'critical';
    component.saveConfig();

    expect(serviceSpy.upsertAlertConfig).toHaveBeenCalledWith(
      jasmine.objectContaining({
        alertType: 'unmatched_eob',
        thresholdDays: 14,
        severity: 'critical',
      })
    );
  });

  it('saveConfig() reloads configs on success', () => {
    component.newConfigType = 'unmatched_payment';
    const callsBefore = serviceSpy.getAlertConfigs.calls.count();
    component.saveConfig();
    expect(serviceSpy.getAlertConfigs.calls.count()).toBeGreaterThan(callsBefore);
  });

  it('saveConfig() sets savingConfig false on success', () => {
    component.newConfigType = 'unmatched_eob';
    component.saveConfig();
    expect(component.savingConfig).toBeFalse();
  });

  it('saveConfig() sets savingConfig false on error', () => {
    serviceSpy.upsertAlertConfig.and.returnValue(throwError(() => new Error('fail')));
    component.newConfigType = 'unmatched_eob';
    component.saveConfig();
    expect(component.savingConfig).toBeFalse();
  });

  // --- severityClass ---

  it('severityClass("critical") returns "badge badge--critical"', () => {
    expect(component.severityClass('critical')).toBe('badge badge--critical');
  });

  it('severityClass("warning") returns "badge badge--warning"', () => {
    expect(component.severityClass('warning')).toBe('badge badge--warning');
  });

  it('severityClass("info") returns "badge badge--info"', () => {
    expect(component.severityClass('info')).toBe('badge badge--info');
  });

  it('severityClass with any value follows the badge--{sev} pattern', () => {
    expect(component.severityClass('high')).toBe('badge badge--high');
  });

  // --- alert types constant ---

  it('alertTypes is populated with expected types', () => {
    expect(component.alertTypes).toContain('unmatched_eob');
    expect(component.alertTypes).toContain('unmatched_payment');
    expect(component.alertTypes).toContain('unposted_remittance');
    expect(component.alertTypes).toContain('in_transit_aged');
  });
});
