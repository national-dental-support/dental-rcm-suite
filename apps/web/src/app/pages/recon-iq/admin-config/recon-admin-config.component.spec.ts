import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, throwError } from 'rxjs';

import { ReconAdminConfigComponent } from './recon-admin-config.component';
import { ReconIqService } from '../../../core/services/recon-iq.service';

const MOCK_CONFIG = {
  autoMatchEnabled: true,
  autoMatchThreshold: 90,
  autoPostEnabled: false,
  statementMinBalance: 10,
  statementDefaultAgingDays: 60,
  eraAutoImportEnabled: false,
  eraMatchTolerance: 0,
  unmatchedEscalationDays: 7,
  autoEscalateEnabled: false,
  defaultNotifyEmail: '',
  statementFrequency: 'monthly',
  storageType: 'local',
  storageConnectionString: '',
  storagePath: '',
  storageRetentionDays: 90,
};

const MOCK_ALERT: any = { id: 1, alertType: 'unmatched_eob', status: 'open', severity: 'warning', message: 'test', createdAt: '2025-01-01' };
const MOCK_ALERT_CONFIG: any = { id: 10, alertType: 'unmatched_eob', thresholdDays: 7, severity: 'warning', isEnabled: true, notifyEmails: 'a@b.com' };
const MOCK_ESC_ROW: any = { id: 100, issueType: 'amount_mismatch', status: 'open', priority: 'high', description: 'desc', createdAt: '2025-01-01' };
const MOCK_ESC_STATS = { total: 5, open: 3, investigating: 1, resolved: 1 };

describe('ReconAdminConfigComponent', () => {
  let component: ReconAdminConfigComponent;
  let fixture: ComponentFixture<ReconAdminConfigComponent>;
  let serviceSpy: jasmine.SpyObj<ReconIqService>;

  beforeEach(async () => {
    serviceSpy = jasmine.createSpyObj('ReconIqService', [
      'getReconIqAdminConfig',
      'updateReconIqAdminConfig',
      'getReconAlerts',
      'getAlertConfigs',
      'getBankEscalationStats',
      'getBankEscalations',
      'acknowledgeAlert',
      'upsertAlertConfig',
      'deleteAlertConfig',
      'createBankEscalation',
      'updateBankEscalation',
    ]);

    serviceSpy.getReconIqAdminConfig.and.returnValue(of({ ...MOCK_CONFIG }));
    serviceSpy.updateReconIqAdminConfig.and.returnValue(of({ message: 'ok' }));
    serviceSpy.getReconAlerts.and.returnValue(of({ rows: [MOCK_ALERT] }));
    serviceSpy.getAlertConfigs.and.returnValue(of({ configs: [MOCK_ALERT_CONFIG] }));
    serviceSpy.getBankEscalationStats.and.returnValue(of({ ...MOCK_ESC_STATS }));
    serviceSpy.getBankEscalations.and.returnValue(of({ rows: [MOCK_ESC_ROW], total: 1, page: 1, pageSize: 25, totalPages: 1 }));
    serviceSpy.acknowledgeAlert.and.returnValue(of({}));
    serviceSpy.upsertAlertConfig.and.returnValue(of({ message: 'ok' }));
    serviceSpy.deleteAlertConfig.and.returnValue(of({ message: 'ok' }));
    serviceSpy.createBankEscalation.and.returnValue(of({ message: 'ok' }));
    serviceSpy.updateBankEscalation.and.returnValue(of({ message: 'ok' }));

    await TestBed.configureTestingModule({
      declarations: [ReconAdminConfigComponent],
      providers: [{ provide: ReconIqService, useValue: serviceSpy }],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(ReconAdminConfigComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- ngOnInit / loading state ---

  it('should call getReconIqAdminConfig on init', () => {
    expect(serviceSpy.getReconIqAdminConfig).toHaveBeenCalled();
  });

  it('loading is false after service resolves', () => {
    expect(component.loading).toBeFalse();
  });

  it('loading is set to false on service error', () => {
    serviceSpy.getReconIqAdminConfig.and.returnValue(throwError(() => new Error('fail')));
    component.loading = true;
    component.ngOnInit();
    expect(component.loading).toBeFalse();
  });

  it('should call getReconAlerts on init', () => {
    expect(serviceSpy.getReconAlerts).toHaveBeenCalled();
  });

  it('should call getAlertConfigs on init', () => {
    expect(serviceSpy.getAlertConfigs).toHaveBeenCalled();
  });

  it('should call getBankEscalationStats on init', () => {
    expect(serviceSpy.getBankEscalationStats).toHaveBeenCalled();
  });

  it('should call getBankEscalations on init', () => {
    expect(serviceSpy.getBankEscalations).toHaveBeenCalled();
  });

  // --- config population ---

  it('config is populated from service response', () => {
    expect(component.config.autoMatchEnabled).toBeTrue();
    expect(component.config.autoMatchThreshold).toBe(90);
    expect(component.config.autoPostEnabled).toBeFalse();
    expect(component.config.statementMinBalance).toBe(10);
    expect(component.config.statementDefaultAgingDays).toBe(60);
  });

  it('alerts are populated from service response', () => {
    expect(component.alerts.length).toBe(1);
    expect(component.alerts[0].id).toBe(1);
  });

  it('alertsLoading is false after load', () => {
    expect(component.alertsLoading).toBeFalse();
  });

  it('configs are populated from service response', () => {
    expect(component.configs.length).toBe(1);
    expect(component.configs[0].id).toBe(10);
  });

  it('configsLoading is false after load', () => {
    expect(component.configsLoading).toBeFalse();
  });

  it('escalStats is populated from service response', () => {
    expect(component.escalStats.total).toBe(5);
    expect(component.escalStats.open).toBe(3);
  });

  it('rows are populated from service response', () => {
    expect(component.rows.length).toBe(1);
    expect(component.rows[0].id).toBe(100);
  });

  // --- loadAlerts error path ---

  it('alertsLoading is false on getReconAlerts error', () => {
    serviceSpy.getReconAlerts.and.returnValue(throwError(() => new Error('fail')));
    component.alertsLoading = true;
    component.loadAlerts();
    expect(component.alertsLoading).toBeFalse();
  });

  it('configsLoading is false on getAlertConfigs error', () => {
    serviceSpy.getAlertConfigs.and.returnValue(throwError(() => new Error('fail')));
    component.configsLoading = true;
    component.loadAlertConfigs();
    expect(component.configsLoading).toBeFalse();
  });

  it('escLoading is false on getBankEscalations error', () => {
    serviceSpy.getBankEscalations.and.returnValue(throwError(() => new Error('fail')));
    component.escLoading = true;
    component.loadEscRows();
    expect(component.escLoading).toBeFalse();
  });

  // --- save() ---

  it('save() calls updateReconIqAdminConfig with current config', () => {
    component.save();
    expect(serviceSpy.updateReconIqAdminConfig).toHaveBeenCalledWith(component.config);
  });

  it('save() sets saving to true during the call', () => {
    let savingDuringSave = false;
    serviceSpy.updateReconIqAdminConfig.and.callFake((cfg: any) => {
      savingDuringSave = component.saving;
      return of({ message: 'ok' });
    });
    component.save();
    expect(savingDuringSave).toBeTrue();
  });

  it('save() sets saving to false after success', () => {
    component.save();
    expect(component.saving).toBeFalse();
  });

  it('save() sets saved to true after success', () => {
    component.save();
    expect(component.saved).toBeTrue();
  });

  it('save() sets saving false on error', () => {
    serviceSpy.updateReconIqAdminConfig.and.returnValue(throwError(() => new Error('fail')));
    component.save();
    expect(component.saving).toBeFalse();
  });

  it('save() does not set saved true on error', () => {
    serviceSpy.updateReconIqAdminConfig.and.returnValue(throwError(() => new Error('fail')));
    component.saved = false;
    component.save();
    expect(component.saved).toBeFalse();
  });

  // --- setSection ---

  it('setSection updates activeSection to alerts', () => {
    component.setSection('alerts');
    expect(component.activeSection).toBe('alerts');
  });

  it('setSection updates activeSection to escalations', () => {
    component.setSection('escalations');
    expect(component.activeSection).toBe('escalations');
  });

  it('setSection updates activeSection to settings', () => {
    component.setSection('escalations');
    component.setSection('settings');
    expect(component.activeSection).toBe('settings');
  });

  // --- setAlertSubTab ---

  it('setAlertSubTab updates alertSubTab to config', () => {
    component.setAlertSubTab('config');
    expect(component.alertSubTab).toBe('config');
  });

  it('setAlertSubTab updates alertSubTab to active', () => {
    component.alertSubTab = 'config';
    component.setAlertSubTab('active');
    expect(component.alertSubTab).toBe('active');
  });

  // --- onConfigChange ---

  it('onConfigChange does not throw', () => {
    expect(() => component.onConfigChange()).not.toThrow();
  });

  // --- acknowledge ---

  it('acknowledge removes the alert from the list', () => {
    component.alerts = [{ id: 1 } as any, { id: 2 } as any];
    component.acknowledge({ id: 1 } as any);
    expect(component.alerts.length).toBe(1);
    expect(component.alerts[0].id).toBe(2);
  });

  it('acknowledge calls acknowledgeAlert with the alert id', () => {
    component.alerts = [MOCK_ALERT];
    component.acknowledge(MOCK_ALERT);
    expect(serviceSpy.acknowledgeAlert).toHaveBeenCalledWith(MOCK_ALERT.id);
  });

  it('acknowledge handles error without crashing', () => {
    serviceSpy.acknowledgeAlert.and.returnValue(throwError(() => new Error('fail')));
    spyOn(console, 'error');
    component.alerts = [MOCK_ALERT];
    expect(() => component.acknowledge(MOCK_ALERT)).not.toThrow();
  });

  // --- startEdit ---

  it('startEdit populates editing fields from config item', () => {
    component.startEdit(MOCK_ALERT_CONFIG);
    expect(component.editingConfig).toBe(MOCK_ALERT_CONFIG);
    expect(component.newConfigType).toBe('unmatched_eob');
    expect(component.newConfigDays).toBe(7);
    expect(component.newConfigSeverity).toBe('warning');
    expect(component.newConfigEnabled).toBeTrue();
    expect(component.newConfigEmails).toBe('a@b.com');
  });

  it('startEdit uses empty string when notifyEmails is null', () => {
    const cfg = { ...MOCK_ALERT_CONFIG, notifyEmails: null };
    component.startEdit(cfg);
    expect(component.newConfigEmails).toBe('');
  });

  // --- cancelEdit ---

  it('cancelEdit resets editing state', () => {
    component.startEdit(MOCK_ALERT_CONFIG);
    component.cancelEdit();
    expect(component.editingConfig).toBeNull();
    expect(component.newConfigType).toBe('');
    expect(component.newConfigDays).toBe(30);
    expect(component.newConfigSeverity).toBe('warning');
    expect(component.newConfigEnabled).toBeTrue();
    expect(component.newConfigEmails).toBe('');
  });

  // --- saveAlertConfig ---

  it('saveAlertConfig does nothing when newConfigType is empty', () => {
    component.newConfigType = '';
    component.saveAlertConfig();
    expect(serviceSpy.upsertAlertConfig).not.toHaveBeenCalled();
  });

  it('saveAlertConfig calls upsertAlertConfig when type is set', () => {
    component.newConfigType = 'unmatched_eob';
    component.newConfigDays = 14;
    component.newConfigSeverity = 'critical';
    component.newConfigEnabled = false;
    component.newConfigEmails = 'test@test.com';
    component.saveAlertConfig();
    expect(serviceSpy.upsertAlertConfig).toHaveBeenCalledWith(jasmine.objectContaining({
      alertType: 'unmatched_eob',
      thresholdDays: 14,
      severity: 'critical',
      isEnabled: false,
      notifyEmails: 'test@test.com',
    }));
  });

  it('saveAlertConfig sends undefined for empty notifyEmails', () => {
    component.newConfigType = 'era_parse_failure';
    component.newConfigEmails = '';
    component.saveAlertConfig();
    expect(serviceSpy.upsertAlertConfig).toHaveBeenCalledWith(
      jasmine.objectContaining({ notifyEmails: undefined })
    );
  });

  it('saveAlertConfig resets savingConfig after success', () => {
    component.newConfigType = 'unmatched_eob';
    component.saveAlertConfig();
    expect(component.savingConfig).toBeFalse();
  });

  it('saveAlertConfig resets savingConfig on error', () => {
    serviceSpy.upsertAlertConfig.and.returnValue(throwError(() => new Error('fail')));
    component.newConfigType = 'unmatched_eob';
    component.saveAlertConfig();
    expect(component.savingConfig).toBeFalse();
  });

  // --- toggleAlertEnabled ---

  it('toggleAlertEnabled calls upsertAlertConfig with inverted isEnabled', () => {
    const cfg = { ...MOCK_ALERT_CONFIG, isEnabled: true };
    component.toggleAlertEnabled(cfg);
    expect(serviceSpy.upsertAlertConfig).toHaveBeenCalledWith(
      jasmine.objectContaining({ isEnabled: false })
    );
  });

  it('toggleAlertEnabled updates cfg.isEnabled on success', () => {
    const cfg = { ...MOCK_ALERT_CONFIG, isEnabled: true };
    component.toggleAlertEnabled(cfg);
    expect(cfg.isEnabled).toBeFalse();
  });

  it('toggleAlertEnabled handles error without crashing', () => {
    serviceSpy.upsertAlertConfig.and.returnValue(throwError(() => new Error('fail')));
    spyOn(console, 'error');
    expect(() => component.toggleAlertEnabled(MOCK_ALERT_CONFIG)).not.toThrow();
  });

  // --- severityClass ---

  it('severityClass returns badge class string', () => {
    expect(component.severityClass('warning')).toBe('badge badge--warning');
    expect(component.severityClass('critical')).toBe('badge badge--critical');
  });

  // --- alertFormTitle ---

  it('alertFormTitle returns Add Threshold when not editing', () => {
    component.editingConfig = null;
    expect(component.alertFormTitle).toBe('Add Threshold');
  });

  it('alertFormTitle returns edit label when editing', () => {
    component.editingConfig = MOCK_ALERT_CONFIG;
    expect(component.alertFormTitle).toBe('Edit: unmatched_eob');
  });

  // --- loadEscRows ---

  it('loadEscRows with page argument sets escPage', () => {
    component.loadEscRows(3);
    expect(component.escPage).toBe(3);
  });

  it('loadEscRows with filters sends status and priority to service', () => {
    component.filterStatus = 'open';
    component.filterPriority = 'high';
    component.loadEscRows(1);
    expect(serviceSpy.getBankEscalations).toHaveBeenCalledWith(
      jasmine.objectContaining({ status: 'open', priority: 'high' })
    );
  });

  it('loadEscRows with empty filters sends undefined', () => {
    component.filterStatus = '';
    component.filterPriority = '';
    component.loadEscRows(1);
    expect(serviceSpy.getBankEscalations).toHaveBeenCalledWith(
      jasmine.objectContaining({ status: undefined, priority: undefined })
    );
  });

  it('loadEscRows updates escTotal and escTotalPages', () => {
    serviceSpy.getBankEscalations.and.returnValue(of({ rows: [], total: 50, page: 1, pageSize: 25, totalPages: 2 }));
    component.loadEscRows(1);
    expect(component.escTotal).toBe(50);
    expect(component.escTotalPages).toBe(2);
  });

  // --- applyEscFilters ---

  it('applyEscFilters calls loadEscRows(1)', () => {
    const spy = spyOn(component, 'loadEscRows');
    component.applyEscFilters();
    expect(spy).toHaveBeenCalledWith(1);
  });

  // --- clearEscFilters ---

  it('clearEscFilters resets filters and reloads', () => {
    component.filterStatus = 'open';
    component.filterPriority = 'high';
    const spy = spyOn(component, 'loadEscRows');
    component.clearEscFilters();
    expect(component.filterStatus).toBe('');
    expect(component.filterPriority).toBe('');
    expect(spy).toHaveBeenCalledWith(1);
  });

  // --- openNewEscForm ---

  it('openNewEscForm sets showNewForm to true', () => {
    component.openNewEscForm();
    expect(component.showNewForm).toBeTrue();
  });

  it('openNewEscForm resets form fields', () => {
    component.newIssueType = 'amount_mismatch';
    component.newDescription = 'some desc';
    component.newPriority = 'critical';
    component.newDepositId = 'DEP-123';
    component.openNewEscForm();
    expect(component.newIssueType).toBe('');
    expect(component.newDescription).toBe('');
    expect(component.newPriority).toBe('medium');
    expect(component.newDepositId).toBe('');
  });

  // --- cancelNewEsc ---

  it('cancelNewEsc hides the form', () => {
    component.showNewForm = true;
    component.cancelNewEsc();
    expect(component.showNewForm).toBeFalse();
  });

  // --- submitNewEsc ---

  it('submitNewEsc does nothing when newIssueType is empty', () => {
    component.newIssueType = '';
    component.submitNewEsc();
    expect(serviceSpy.createBankEscalation).not.toHaveBeenCalled();
  });

  it('submitNewEsc calls createBankEscalation with form values', () => {
    component.newIssueType = 'duplicate';
    component.newDescription = 'some desc';
    component.newPriority = 'high';
    component.newDepositId = 'DEP-999';
    component.submitNewEsc();
    expect(serviceSpy.createBankEscalation).toHaveBeenCalledWith(
      jasmine.objectContaining({ issueType: 'duplicate', priority: 'high', bankDepositId: 'DEP-999' })
    );
  });

  it('submitNewEsc sends undefined for empty description and depositId', () => {
    component.newIssueType = 'other';
    component.newDescription = '';
    component.newDepositId = '';
    component.submitNewEsc();
    expect(serviceSpy.createBankEscalation).toHaveBeenCalledWith(
      jasmine.objectContaining({ description: undefined, bankDepositId: undefined })
    );
  });

  it('submitNewEsc hides form and reloads on success', () => {
    component.newIssueType = 'duplicate';
    component.showNewForm = true;
    component.submitNewEsc();
    expect(component.showNewForm).toBeFalse();
    expect(component.submitting).toBeFalse();
  });

  it('submitNewEsc sets submitting false on error', () => {
    serviceSpy.createBankEscalation.and.returnValue(throwError(() => new Error('fail')));
    spyOn(console, 'error');
    component.newIssueType = 'other';
    component.submitNewEsc();
    expect(component.submitting).toBeFalse();
  });

  // --- setEscStatus ---

  it('setEscStatus calls updateBankEscalation with new status', () => {
    component.setEscStatus(MOCK_ESC_ROW, 'investigating');
    expect(serviceSpy.updateBankEscalation).toHaveBeenCalledWith(100, { status: 'investigating' });
  });

  it('setEscStatus reloads stats and rows after success', () => {
    const statsSpy = spyOn(component, 'loadEscStats');
    const rowsSpy = spyOn(component, 'loadEscRows');
    component.setEscStatus(MOCK_ESC_ROW, 'resolved');
    expect(statsSpy).toHaveBeenCalled();
    expect(rowsSpy).toHaveBeenCalled();
  });

  it('setEscStatus handles error without crashing', () => {
    serviceSpy.updateBankEscalation.and.returnValue(throwError(() => new Error('fail')));
    spyOn(console, 'error');
    expect(() => component.setEscStatus(MOCK_ESC_ROW, 'dismissed')).not.toThrow();
  });

  // --- resolveEsc ---

  it('resolveEsc does nothing when prompt returns null', () => {
    spyOn(window, 'prompt').and.returnValue(null);
    component.resolveEsc(MOCK_ESC_ROW);
    expect(serviceSpy.updateBankEscalation).not.toHaveBeenCalled();
  });

  it('resolveEsc calls updateBankEscalation with resolved status', () => {
    spyOn(window, 'prompt').and.returnValue('resolved notes');
    component.resolveEsc(MOCK_ESC_ROW);
    expect(serviceSpy.updateBankEscalation).toHaveBeenCalledWith(
      100,
      jasmine.objectContaining({ status: 'resolved', resolutionNotes: 'resolved notes' })
    );
  });

  it('resolveEsc sends undefined resolutionNotes for empty string', () => {
    spyOn(window, 'prompt').and.returnValue('');
    component.resolveEsc(MOCK_ESC_ROW);
    expect(serviceSpy.updateBankEscalation).toHaveBeenCalledWith(
      100,
      jasmine.objectContaining({ resolutionNotes: undefined })
    );
  });

  it('resolveEsc reloads stats and rows on success', () => {
    spyOn(window, 'prompt').and.returnValue('notes');
    const statsSpy = spyOn(component, 'loadEscStats');
    const rowsSpy = spyOn(component, 'loadEscRows');
    component.resolveEsc(MOCK_ESC_ROW);
    expect(statsSpy).toHaveBeenCalled();
    expect(rowsSpy).toHaveBeenCalled();
  });

  it('resolveEsc handles error without crashing', () => {
    spyOn(window, 'prompt').and.returnValue('notes');
    serviceSpy.updateBankEscalation.and.returnValue(throwError(() => new Error('fail')));
    spyOn(console, 'error');
    expect(() => component.resolveEsc(MOCK_ESC_ROW)).not.toThrow();
  });

  // --- priorityClass ---

  it('priorityClass returns correct badge for critical', () => {
    expect(component.priorityClass('critical')).toBe('badge badge--critical');
  });

  it('priorityClass returns correct badge for high', () => {
    expect(component.priorityClass('high')).toBe('badge badge--high');
  });

  it('priorityClass returns correct badge for medium', () => {
    expect(component.priorityClass('medium')).toBe('badge badge--medium');
  });

  it('priorityClass returns correct badge for low', () => {
    expect(component.priorityClass('low')).toBe('badge badge--low');
  });

  it('priorityClass uses empty string fallback for unknown priority', () => {
    expect(component.priorityClass('unknown')).toBe('badge ');
  });

  // --- statusClass ---

  it('statusClass returns correct badge for open', () => {
    expect(component.statusClass('open')).toBe('badge badge--open');
  });

  it('statusClass returns correct badge for investigating', () => {
    expect(component.statusClass('investigating')).toBe('badge badge--investigating');
  });

  it('statusClass returns correct badge for resolved', () => {
    expect(component.statusClass('resolved')).toBe('badge badge--resolved');
  });

  it('statusClass returns correct badge for dismissed', () => {
    expect(component.statusClass('dismissed')).toBe('badge badge--dismissed');
  });

  it('statusClass uses empty string fallback for unknown status', () => {
    expect(component.statusClass('pending')).toBe('badge ');
  });

  // --- deleteAlertConfig ---

  it('deleteAlertConfig removes config on success', () => {
    spyOn(window, 'confirm').and.returnValue(true);
    component.configs = [MOCK_ALERT_CONFIG, { ...MOCK_ALERT_CONFIG, id: 99 }];
    component.deleteAlertConfig(MOCK_ALERT_CONFIG);
    expect(serviceSpy.deleteAlertConfig).toHaveBeenCalledWith(10);
    expect(component.configs.length).toBe(1);
    expect(component.configs[0].id).toBe(99);
  });

  it('deleteAlertConfig does nothing when confirm returns false', () => {
    spyOn(window, 'confirm').and.returnValue(false);
    component.deleteAlertConfig(MOCK_ALERT_CONFIG);
    expect(serviceSpy.deleteAlertConfig).not.toHaveBeenCalled();
  });

  it('deleteAlertConfig handles error without crashing', () => {
    spyOn(window, 'confirm').and.returnValue(true);
    serviceSpy.deleteAlertConfig.and.returnValue(throwError(() => new Error('fail')));
    spyOn(console, 'error');
    expect(() => component.deleteAlertConfig(MOCK_ALERT_CONFIG)).not.toThrow();
  });
});
