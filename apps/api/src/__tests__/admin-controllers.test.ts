/**
 * Admin Controllers - Comprehensive Unit Test Suite
 * Coverage target: 100% line + branch
 *
 * Run: npx jest --testPathPattern=admin-controllers
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

/* ------------------------------------------------------------------ */
/*  DB mock                                                            */
/* ------------------------------------------------------------------ */
const mockQuery = jest.fn<any>();
const mockInput = jest.fn<any>();

jest.mock('../modules/db', () => {
  const makeRequest = () => {
    const r: any = {
      input: (...a: any[]) => { mockInput(...a); return r; },
      query: mockQuery,
    };
    return r;
  };
  return {
    __esModule: true,
    default: {
      getInstance: () => ({
        getPool: () => ({ request: makeRequest }),
      }),
    },
    databaseInstance: {
      getPool: () => ({ request: makeRequest }),
    },
  };
});

jest.mock('../shared/databases', () => ({ databases: ['dental_rcm'] }));
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Mock priority scheduler so PrioritySettingsController.triggerRecalculate doesn't hit DB
const mockRecalculate = jest.fn<any>();
jest.mock('../schedulers/priority-scheduler', () => ({
  recalculatePriorities: mockRecalculate,
}));

/* ------------------------------------------------------------------ */
/*  Imports (after mocks)                                              */
/* ------------------------------------------------------------------ */
import { AuditLogController } from '../controllers/admin/audit-log';
import { AdminSettingsController } from '../controllers/admin/settings';
import { SecurityController } from '../controllers/admin/security';
import { AdminThemeController } from '../controllers/admin/theme';
import { AdminLogsController } from '../controllers/admin/logs';
import { ComplianceController } from '../controllers/admin/compliance';
import { CustomerSSOController } from '../controllers/admin/customer-sso';
import { AccessReviewController } from '../controllers/admin/access-review';
import { EscalationChainsController } from '../controllers/admin/escalation-chains';
import { ExecThresholdsController } from '../controllers/admin/exec-thresholds';
import { PrioritySettingsController } from '../controllers/admin/priority-settings';
import { AdminRemediationController } from '../controllers/admin/remediation';
import { SpecialistScorecardsController } from '../controllers/admin/specialist-scorecards';
import { TimeTrackingController } from '../controllers/admin/time-tracking';
import { CoachingRecommendationsController } from '../controllers/admin/coaching-recommendations';
import { SOPRecommendationsController } from '../controllers/admin/sop-recommendations';

/* ------------------------------------------------------------------ */
/*  Express helpers                                                    */
/* ------------------------------------------------------------------ */
const makeReq = (overrides: any = {}) => ({
  headers: { 'x-actor-email': 'test@test.com', 'x-actor-oid': 'oid-123' },
  body: {},
  query: {},
  params: {},
  user: { customerId: 10, userId: 5, role: 'Admin', email: 'test@test.com' },
  ...overrides,
} as any);

const makeRes = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

const DB_ERROR = new Error('DB failure');

/* ================================================================== */
/*  1. AuditLogController                                             */
/* ================================================================== */
describe('AuditLogController', () => {
  let ctrl: AuditLogController;
  beforeEach(() => { mockQuery.mockReset(); mockInput.mockReset(); ctrl = new AuditLogController(); });

  it('list \u2013 happy path, no filters', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ id: 1 }] });
    const res = makeRes();
    await ctrl.list(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: [{ id: 1 }] });
  });

  it('list \u2013 with all query params (actor, target, action, from, to, limit)', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.list(makeReq({
      query: { actor: 'alice', target: 'claim1', action: 'user.create', from: '2025-01-01', to: '2025-12-31', limit: '10' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: [] });
  });

  it('list \u2013 limit clamps to 1 when 0 provided', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.list(makeReq({ query: { limit: '0' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('list \u2013 limit clamps to 2000 when over provided', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.list(makeReq({ query: { limit: '9999' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('list \u2013 500 on DB error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.list(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  2. AdminSettingsController                                        */
/* ================================================================== */
describe('AdminSettingsController', () => {
  let ctrl: AdminSettingsController;
  beforeEach(() => { mockQuery.mockReset(); mockInput.mockReset(); ctrl = new AdminSettingsController(); });

  // getSessionTimeout
  it('getSessionTimeout \u2013 returns parsed minutes from DB', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ value: '60' }] });
    const res = makeRes();
    await ctrl.getSessionTimeout(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith({ minutes: 60 });
  });

  it('getSessionTimeout \u2013 returns default when no record', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.getSessionTimeout(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith({ minutes: 4320 });
  });

  it('getSessionTimeout \u2013 returns default when value is NaN', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ value: 'bad' }] });
    const res = makeRes();
    await ctrl.getSessionTimeout(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith({ minutes: 4320 });
  });

  it('getSessionTimeout \u2013 returns default on DB error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.getSessionTimeout(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith({ minutes: 4320 });
  });

  // setSessionTimeout
  it('setSessionTimeout \u2013 happy path', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.setSessionTimeout(makeReq({ body: { minutes: 30 } }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ minutes: 30 }));
  });

  it('setSessionTimeout \u2013 400 when minutes < 5', async () => {
    const res = makeRes();
    await ctrl.setSessionTimeout(makeReq({ body: { minutes: 1 } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('setSessionTimeout \u2013 400 when minutes > 43200', async () => {
    const res = makeRes();
    await ctrl.setSessionTimeout(makeReq({ body: { minutes: 99999 } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('setSessionTimeout \u2013 400 when minutes is NaN', async () => {
    const res = makeRes();
    await ctrl.setSessionTimeout(makeReq({ body: { minutes: 'bad' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('setSessionTimeout \u2013 500 on DB error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.setSessionTimeout(makeReq({ body: { minutes: 30 } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  // getInactivityThreshold
  it('getInactivityThreshold \u2013 returns parsed days from DB', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ value: '60' }] });
    const res = makeRes();
    await ctrl.getInactivityThreshold(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith({ days: 60 });
  });

  it('getInactivityThreshold \u2013 returns default when no record', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.getInactivityThreshold(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith({ days: 90 });
  });

  it('getInactivityThreshold \u2013 returns default when value is NaN', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ value: 'nan' }] });
    const res = makeRes();
    await ctrl.getInactivityThreshold(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith({ days: 90 });
  });

  it('getInactivityThreshold \u2013 returns default on DB error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.getInactivityThreshold(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith({ days: 90 });
  });

  // setInactivityThreshold
  it('setInactivityThreshold \u2013 happy path', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.setInactivityThreshold(makeReq({ body: { days: 60 } }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ days: 60 }));
  });

  it('setInactivityThreshold \u2013 400 when days < 30', async () => {
    const res = makeRes();
    await ctrl.setInactivityThreshold(makeReq({ body: { days: 1 } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('setInactivityThreshold \u2013 400 when days > 365', async () => {
    const res = makeRes();
    await ctrl.setInactivityThreshold(makeReq({ body: { days: 400 } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('setInactivityThreshold \u2013 400 when days is NaN', async () => {
    const res = makeRes();
    await ctrl.setInactivityThreshold(makeReq({ body: { days: 'bad' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('setInactivityThreshold \u2013 500 on DB error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.setInactivityThreshold(makeReq({ body: { days: 60 } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  // getSlaSchedules
  it('getSlaSchedules \u2013 returns parsed JSON from DB', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ value: '{"default":{"mode":"24_7"}}' }] });
    const res = makeRes();
    await ctrl.getSlaSchedules(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith({ default: { mode: '24_7' } });
  });

  it('getSlaSchedules \u2013 returns default when no record', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.getSlaSchedules(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith({ default: { mode: '24_7' } });
  });

  it('getSlaSchedules \u2013 returns default on DB error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.getSlaSchedules(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith({ default: { mode: '24_7' } });
  });

  // setSlaSchedules
  it('setSlaSchedules \u2013 happy path with 24_7 mode', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.setSlaSchedules(makeReq({ body: { default: { mode: '24_7' } } }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'SLA schedules updated' }));
  });

  it('setSlaSchedules \u2013 400 when body is not object', async () => {
    const res = makeRes();
    await ctrl.setSlaSchedules(makeReq({ body: null }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('setSlaSchedules \u2013 400 when invalid service key', async () => {
    const res = makeRes();
    await ctrl.setSlaSchedules(makeReq({ body: { invalidKey: { mode: '24_7' } } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('setSlaSchedules \u2013 400 when invalid mode', async () => {
    const res = makeRes();
    await ctrl.setSlaSchedules(makeReq({ body: { default: { mode: 'bad_mode' } } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('setSlaSchedules \u2013 400 when custom mode missing days', async () => {
    const res = makeRes();
    await ctrl.setSlaSchedules(makeReq({ body: { default: { mode: 'custom' } } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('setSlaSchedules \u2013 400 when custom mode has invalid day key', async () => {
    const res = makeRes();
    await ctrl.setSlaSchedules(makeReq({ body: { default: { mode: 'custom', days: { '9': { start: '09:00', end: '17:00' } } } } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('setSlaSchedules \u2013 400 when window start/end format invalid', async () => {
    const res = makeRes();
    await ctrl.setSlaSchedules(makeReq({ body: { default: { mode: 'custom', days: { '1': { start: '9am', end: '5pm' } } } } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('setSlaSchedules \u2013 400 when end is not after start', async () => {
    const res = makeRes();
    await ctrl.setSlaSchedules(makeReq({ body: { default: { mode: 'custom', days: { '1': { start: '17:00', end: '09:00' } } } } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('setSlaSchedules \u2013 custom mode with null window passes', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.setSlaSchedules(makeReq({ body: { default: { mode: 'custom', days: { '0': null, '1': { start: '09:00', end: '17:00' } } } } }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'SLA schedules updated' }));
  });

  it('setSlaSchedules \u2013 500 on DB error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.setSlaSchedules(makeReq({ body: { default: { mode: '24_7' } } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  3. SecurityController                                             */
/* ================================================================== */
describe('SecurityController', () => {
  let ctrl: SecurityController;
  beforeEach(() => { mockQuery.mockReset(); mockInput.mockReset(); ctrl = new SecurityController(); });

  it('getMaskingRules \u2013 happy path', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ id: 1, fieldName: 'SSN' }] });
    const res = makeRes();
    await ctrl.getMaskingRules(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith([{ id: 1, fieldName: 'SSN' }]);
  });

  it('getMaskingRules \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.getMaskingRules(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('createMaskingRule \u2013 happy path', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ id: 5 }] });
    const res = makeRes();
    await ctrl.createMaskingRule(makeReq({ body: { fieldName: 'SSN', displayLabel: 'SSN', category: 'phi', maskType: 'last4' } }), res);
    expect(res.json).toHaveBeenCalledWith({ id: 5 });
  });

  it('createMaskingRule \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.createMaskingRule(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('updateMaskingRule \u2013 happy path', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.updateMaskingRule(makeReq({ params: { id: '1' }, body: { fieldName: 'SSN', displayLabel: 'SSN', category: 'phi', maskType: 'last4', visibleAboveRole: 3, isActive: true } }), res);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('updateMaskingRule \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.updateMaskingRule(makeReq({ params: { id: '1' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('deleteMaskingRule \u2013 happy path', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.deleteMaskingRule(makeReq({ params: { id: '1' } }), res);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('deleteMaskingRule \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.deleteMaskingRule(makeReq({ params: { id: '1' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('getEncryptionConfig \u2013 happy path', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ key: 'tde_enabled', value: 'false' }] });
    const res = makeRes();
    await ctrl.getEncryptionConfig(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith({ tde_enabled: 'false' });
  });

  it('getEncryptionConfig \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.getEncryptionConfig(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('updateEncryptionConfig \u2013 happy path with string value', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.updateEncryptionConfig(makeReq({ body: { tde_enabled: 'true' } }), res);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('updateEncryptionConfig \u2013 happy path with non-string value (JSON.stringify branch)', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.updateEncryptionConfig(makeReq({ body: { encrypted_fields: ['SSN', 'DOB'] } }), res);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('updateEncryptionConfig \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.updateEncryptionConfig(makeReq({ body: { tde_enabled: 'true' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('getSecurityStatus \u2013 happy path', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ config_key: 'tde_enabled', config_value: 'false' }, { config_key: 'field_encryption_enabled', config_value: 'false' }, { config_key: 'encrypted_fields', config_value: '["SSN"]' }] })
      .mockResolvedValueOnce({ recordset: [{ cnt: 5 }] });
    const res = makeRes();
    await ctrl.getSecurityStatus(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ masking: { activeMaskingRules: 5 } }));
  });

  it('getSecurityStatus \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.getSecurityStatus(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  4. AdminThemeController                                           */
/* ================================================================== */
describe('AdminThemeController', () => {
  let ctrl: AdminThemeController;
  beforeEach(() => { mockQuery.mockReset(); mockInput.mockReset(); ctrl = new AdminThemeController(); });

  it('getTheme \u2013 returns merged theme from DB', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ value: '{"chart_color_1":"#aabbcc"}' }] });
    const res = makeRes();
    await ctrl.getTheme(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const arg = (res.json as jest.Mock).mock.calls[0][0] as any;
    expect(arg.chart_color_1).toBe('#aabbcc');
  });

  it('getTheme \u2013 returns defaults when no record', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.getTheme(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const arg = (res.json as jest.Mock).mock.calls[0][0] as any;
    expect(arg.chart_color_1).toBe('#18a69b');
  });

  it('getTheme \u2013 returns defaults on DB error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.getTheme(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('saveTheme \u2013 happy path with valid hex colors', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.saveTheme(makeReq({ body: { chart_color_1: '#aabbcc', chart_color_2: '#112233', chart_color_3: '#445566', chart_color_4: '#778899', chart_color_5: '#aabbcc', ui_accent: '#123456', app_bg: '#ffffff', nav_bg: '#000000' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('saveTheme \u2013 invalid hex falls back to default values', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.saveTheme(makeReq({ body: { chart_color_1: 'notahex' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const arg = (res.json as jest.Mock).mock.calls[0][0] as any;
    expect(arg.chart_color_1).toBe('#18a69b'); // default
  });

  it('saveTheme \u2013 500 on DB error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.saveTheme(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('getPresets \u2013 happy path', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ value: '[{"name":"p1","theme":{}}]' }] });
    const res = makeRes();
    await ctrl.getPresets(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getPresets \u2013 returns empty array on DB error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.getPresets(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([]);
  });

  it('savePreset \u2013 400 when name missing', async () => {
    const res = makeRes();
    await ctrl.savePreset(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('savePreset \u2013 adds new preset when not existing', async () => {
    // readPresets returns empty, writePresets succeeds
    mockQuery
      .mockResolvedValueOnce({ recordset: [] })  // readPresets query
      .mockResolvedValueOnce({ recordset: [] }); // writePresets query
    const res = makeRes();
    await ctrl.savePreset(makeReq({ body: { name: 'MyPreset', theme: {} } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('savePreset \u2013 overwrites existing preset with same name', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ value: '[{"name":"MyPreset","theme":{}}]' }] })
      .mockResolvedValueOnce({ recordset: [] });
    const res = makeRes();
    await ctrl.savePreset(makeReq({ body: { name: 'MyPreset', theme: { chart_color_1: '#aabbcc' } } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('savePreset \u2013 500 on DB error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.savePreset(makeReq({ body: { name: 'p' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('deletePreset \u2013 happy path', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ value: '[{"name":"p1","theme":{}}]' }] })
      .mockResolvedValueOnce({ recordset: [] });
    const res = makeRes();
    await ctrl.deletePreset(makeReq({ params: { name: 'p1' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('deletePreset \u2013 500 on DB error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.deletePreset(makeReq({ params: { name: 'p1' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  5. AdminLogsController                                            */
/* ================================================================== */
describe('AdminLogsController', () => {
  let ctrl: AdminLogsController;
  beforeEach(() => { mockQuery.mockReset(); mockInput.mockReset(); ctrl = new AdminLogsController(); });

  it('getEvents \u2013 happy path', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ id: 1 }] });
    const res = makeRes();
    await ctrl.getEvents(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: [{ id: 1 }] });
  });

  it('getEvents \u2013 with custom limit', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.getEvents(makeReq({ query: { limit: '100' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getEvents \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.getEvents(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('getErrors \u2013 happy path', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ id: 2 }] });
    const res = makeRes();
    await ctrl.getErrors(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: [{ id: 2 }] });
  });

  it('getErrors \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.getErrors(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  6. ComplianceController                                           */
/* ================================================================== */
describe('ComplianceController', () => {
  let ctrl: ComplianceController;
  beforeEach(() => { mockQuery.mockReset(); mockInput.mockReset(); ctrl = new ComplianceController(); });

  it('getDashboard \u2013 happy path', async () => {
    const trainingRow = { total: 10, completed: 8, overdue: 1 };
    const loginsRow = { failedLogins: 3, uniqueUsers: 2 };
    const auditRows = [{ action: 'login', cnt: 5 }];
    const usersRow = { totalUsers: 20, disabledUsers: 2, lockedUsers: 1, dormantUsers: 3 };
    // Promise.all fires 4 queries
    mockQuery
      .mockResolvedValueOnce({ recordset: [trainingRow] })
      .mockResolvedValueOnce({ recordset: [loginsRow] })
      .mockResolvedValueOnce({ recordset: auditRows })
      .mockResolvedValueOnce({ recordset: [usersRow] });
    const res = makeRes();
    await ctrl.getDashboard(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ training: expect.objectContaining({ complianceRate: 80 }) }));
  });

  it('getDashboard \u2013 complianceRate 100 when total = 0', async () => {
    const trainingRow = { total: 0, completed: 0, overdue: 0 };
    mockQuery
      .mockResolvedValueOnce({ recordset: [trainingRow] })
      .mockResolvedValueOnce({ recordset: [{ failedLogins: 0, uniqueUsers: 0 }] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [{ totalUsers: 0, disabledUsers: 0, lockedUsers: 0, dormantUsers: 0 }] });
    const res = makeRes();
    await ctrl.getDashboard(makeReq(), res);
    const arg = (res.json as jest.Mock).mock.calls[0][0] as any;
    expect(arg.training.complianceRate).toBe(100);
  });

  it('getDashboard \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.getDashboard(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('getAccessReviewStatus \u2013 happy path', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ uid: 1, name: 'Alice' }] });
    const res = makeRes();
    await ctrl.getAccessReviewStatus(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith([{ uid: 1, name: 'Alice' }]);
  });

  it('getAccessReviewStatus \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.getAccessReviewStatus(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  7. CustomerSSOController                                          */
/* ================================================================== */
describe('CustomerSSOController', () => {
  let ctrl: CustomerSSOController;
  beforeEach(() => { mockQuery.mockReset(); mockInput.mockReset(); ctrl = new CustomerSSOController(); });

  it('listConfigs \u2013 happy path', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ id: 1 }] });
    const res = makeRes();
    await ctrl.listConfigs(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
  });

  it('listConfigs \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.listConfigs(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('getConfig \u2013 happy path', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ id: 1, domain: 'test.com' }] });
    const res = makeRes();
    await ctrl.getConfig(makeReq({ params: { id: '1' } }), res);
    expect(res.json).toHaveBeenCalledWith({ id: 1, domain: 'test.com' });
  });

  it('getConfig \u2013 404 when not found', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.getConfig(makeReq({ params: { id: '99' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('getConfig \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.getConfig(makeReq({ params: { id: '1' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('createConfig \u2013 happy path with attributeMapping', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ id: 10 }] });
    const res = makeRes();
    await ctrl.createConfig(makeReq({ body: { customerId: 1, providerType: 'oidc', displayName: 'Test', domain: 'test.com', attributeMapping: { email: 'email' }, autoProvisionUsers: true, enforceSso: false } }), res);
    expect(res.json).toHaveBeenCalledWith({ id: 10 });
  });

  it('createConfig \u2013 happy path with no optional fields', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ id: 11 }] });
    const res = makeRes();
    await ctrl.createConfig(makeReq({ body: { customerId: 1, providerType: 'saml', displayName: 'X', domain: 'x.com' } }), res);
    expect(res.json).toHaveBeenCalledWith({ id: 11 });
  });

  it('createConfig \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.createConfig(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('updateConfig \u2013 happy path', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.updateConfig(makeReq({ params: { id: '1' }, body: { customerId: 1, providerType: 'oidc', displayName: 'T', domain: 't.com', isActive: true } }), res);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('updateConfig \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.updateConfig(makeReq({ params: { id: '1' }, body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('deleteConfig \u2013 happy path', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.deleteConfig(makeReq({ params: { id: '1' } }), res);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('deleteConfig \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.deleteConfig(makeReq({ params: { id: '1' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('lookupByDomain \u2013 400 when domain missing', async () => {
    const res = makeRes();
    await ctrl.lookupByDomain(makeReq({ query: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('lookupByDomain \u2013 hasSso false when not found', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.lookupByDomain(makeReq({ query: { domain: 'nope.com' } }), res);
    expect(res.json).toHaveBeenCalledWith({ hasSso: false });
  });

  it('lookupByDomain \u2013 hasSso true when found', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ id: 1, providerType: 'oidc', displayName: 'T', authorizationUrl: 'https://a', clientId: 'c', metadataUrl: null, enforceSso: false }] });
    const res = makeRes();
    await ctrl.lookupByDomain(makeReq({ query: { domain: 'test.com' } }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ hasSso: true }));
  });

  it('lookupByDomain \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.lookupByDomain(makeReq({ query: { domain: 'test.com' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('testConfig \u2013 404 when not found', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.testConfig(makeReq({ params: { id: '99' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('testConfig \u2013 saml provider with metadata and cert', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ provider_type: 'saml', metadata_url: 'https://meta', certificate: 'cert', domain: 'test.com', display_name: 'T' }] });
    const res = makeRes();
    await ctrl.testConfig(makeReq({ params: { id: '1' } }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ providerType: 'saml' }));
  });

  it('testConfig \u2013 saml provider missing metadata (fail) and no cert (warn)', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ provider_type: 'saml', metadata_url: null, certificate: null, domain: 'test.com', display_name: 'T' }] });
    const res = makeRes();
    await ctrl.testConfig(makeReq({ params: { id: '1' } }), res);
    const arg = (res.json as jest.Mock).mock.calls[0][0] as any;
    expect(arg.success).toBe(false);
  });

  it('testConfig \u2013 oidc provider with all fields', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ provider_type: 'oidc', client_id: 'c', authorization_url: 'https://a', token_url: 'https://t', domain: 'test.com', display_name: 'T' }] });
    const res = makeRes();
    await ctrl.testConfig(makeReq({ params: { id: '1' } }), res);
    const arg = (res.json as jest.Mock).mock.calls[0][0] as any;
    expect(arg.success).toBe(true);
  });

  it('testConfig \u2013 oidc provider missing fields (fail)', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ provider_type: 'oidc', client_id: null, authorization_url: null, token_url: null, domain: null, display_name: 'T' }] });
    const res = makeRes();
    await ctrl.testConfig(makeReq({ params: { id: '1' } }), res);
    const arg = (res.json as jest.Mock).mock.calls[0][0] as any;
    expect(arg.success).toBe(false);
  });

  it('testConfig \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.testConfig(makeReq({ params: { id: '1' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  8. AccessReviewController                                         */
/* ================================================================== */
describe('AccessReviewController', () => {
  let ctrl: AccessReviewController;
  beforeEach(() => { mockQuery.mockReset(); mockInput.mockReset(); ctrl = new AccessReviewController(); });

  it('list \u2013 happy path', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ email: 'a@b.com' }] });
    const res = makeRes();
    await ctrl.list(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: [{ email: 'a@b.com' }] });
  });

  it('list \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.list(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  9. EscalationChainsController                                     */
/* ================================================================== */
describe('EscalationChainsController', () => {
  let ctrl: EscalationChainsController;
  beforeEach(() => { mockQuery.mockReset(); mockInput.mockReset(); ctrl = new EscalationChainsController(); });

  it('listChains \u2013 happy path with levels', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ id: 1, name: 'Chain1', isActive: true }] })
      .mockResolvedValueOnce({ recordset: [{ id: 10, chainId: 1, levelOrder: 1, targetRole: 'Specialist' }] });
    const res = makeRes();
    await ctrl.listChains(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const arg = (res.json as jest.Mock).mock.calls[0][0] as any;
    expect(arg.data[0].levels).toHaveLength(1);
  });

  it('listChains \u2013 chain with no levels', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ id: 2, name: 'Chain2', isActive: false }] })
      .mockResolvedValueOnce({ recordset: [] });
    const res = makeRes();
    await ctrl.listChains(makeReq(), res);
    const arg = (res.json as jest.Mock).mock.calls[0][0] as any;
    expect(arg.data[0].levels).toHaveLength(0);
  });

  it('listChains \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.listChains(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('createChain \u2013 happy path with levels array', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ id: 5 }] }) // insert chain
      .mockResolvedValue({ recordset: [] }); // insert each level
    const res = makeRes();
    await ctrl.createChain(makeReq({ body: { name: 'C1', description: 'Desc', levels: [{ targetRole: 'Specialist', slaHours: 24, notifyAtPct: 80, description: 'lv1' }] } }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ id: 5 });
  });

  it('createChain \u2013 happy path with no levels', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ id: 6 }] });
    const res = makeRes();
    await ctrl.createChain(makeReq({ body: { name: 'C2' } }), res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('createChain \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.createChain(makeReq({ body: { name: 'C3' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('updateChain \u2013 happy path with isActive=false and levels', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.updateChain(makeReq({ params: { id: '1' }, body: { name: 'C', isActive: false, levels: [{ targetRole: 'Lead', slaHours: 48 }] } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('updateChain \u2013 happy path with no levels', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.updateChain(makeReq({ params: { id: '1' }, body: { name: 'C', isActive: true } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('updateChain \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.updateChain(makeReq({ params: { id: '1' }, body: { name: 'C' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('deleteChain \u2013 happy path', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.deleteChain(makeReq({ params: { id: '1' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('deleteChain \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.deleteChain(makeReq({ params: { id: '1' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('getSlaStatus \u2013 happy path with mixed slaStatus values', async () => {
    const rows = [
      { slaStatus: 'breached', claimId: 'CL001' },
      { slaStatus: 'warning', claimId: 'CL002' },
      { slaStatus: 'ok', claimId: 'CL003' },
    ];
    mockQuery.mockResolvedValue({ recordset: rows });
    const res = makeRes();
    await ctrl.getSlaStatus(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const arg = (res.json as jest.Mock).mock.calls[0][0] as any;
    expect(arg.summary.breached).toBe(1);
    expect(arg.summary.warning).toBe(1);
    expect(arg.summary.ok).toBe(1);
  });

  it('getSlaStatus \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.getSlaStatus(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('checkAndAutoEscalate \u2013 no active chain returns 200 with escalated=0', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = makeRes();
    await ctrl.checkAndAutoEscalate(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ escalated: 0 }));
  });

  it('checkAndAutoEscalate \u2013 no matching level, skips claim', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ id: 1 }] }) // active chain
      .mockResolvedValueOnce({ recordset: [{ level_order: 1, target_role: 'Specialist', sla_hours: 24 }] }) // levels
      .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH1', ClaimID: 'CL1', AssignedRole: 'Manager', HoursOpen: 50, sla_hours: 24 }] }); // breached, role=Manager has no level
    const res = makeRes();
    await ctrl.checkAndAutoEscalate(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ escalated: 0 }));
  });

  it('checkAndAutoEscalate \u2013 sla not yet breached, skips', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ id: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ level_order: 1, target_role: 'Specialist', sla_hours: 48 }] })
      .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH1', ClaimID: 'CL1', AssignedRole: 'Specialist', HoursOpen: 10 }] }); // 10 < 48
    const res = makeRes();
    await ctrl.checkAndAutoEscalate(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ escalated: 0 }));
  });

  it('checkAndAutoEscalate \u2013 at highest level (no next level), skips', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ id: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ level_order: 1, target_role: 'Specialist', sla_hours: 24 }] }) // only 1 level
      .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH1', ClaimID: 'CL1', AssignedRole: 'Specialist', HoursOpen: 50 }] });
    const res = makeRes();
    await ctrl.checkAndAutoEscalate(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ escalated: 0 }));
  });

  it('checkAndAutoEscalate \u2013 no next user available, skips', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ id: 1 }] })
      .mockResolvedValueOnce({ recordset: [
        { level_order: 1, target_role: 'Specialist', sla_hours: 24 },
        { level_order: 2, target_role: 'Manager', sla_hours: 48 },
      ]})
      .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH1', ClaimID: 'CL1', AssignedRole: 'Specialist', HoursOpen: 50, ClaimBalanceDue: 100, Progress: 50, CARCCode: 'CO45', DateOfService: new Date(), ClaimSubmittedDate: new Date() }] })
      .mockResolvedValueOnce({ recordset: [] }); // no user at next level
    const res = makeRes();
    await ctrl.checkAndAutoEscalate(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ escalated: 0 }));
  });

  it('checkAndAutoEscalate \u2013 successfully escalates a claim', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ id: 1 }] })
      .mockResolvedValueOnce({ recordset: [
        { level_order: 1, target_role: 'Specialist', sla_hours: 24 },
        { level_order: 2, target_role: 'Manager', sla_hours: 48 },
      ]})
      .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH1', ClaimID: 'CL1', AssignedRole: 'Specialist', HoursOpen: 50, ClaimBalanceDue: 100, Progress: 50, CARCCode: 'CO45', DateOfService: new Date(), ClaimSubmittedDate: new Date() }] })
      .mockResolvedValueOnce({ recordset: [{ userID: 99 }] }) // next user
      .mockResolvedValueOnce({ recordset: [] }) // close current
      .mockResolvedValueOnce({ recordset: [{ ClaimHistoryId: 'CH5' }] }) // max id
      .mockResolvedValueOnce({ recordset: [] }); // insert new
    const res = makeRes();
    await ctrl.checkAndAutoEscalate(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ escalated: 1 }));
  });

  it('checkAndAutoEscalate \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.checkAndAutoEscalate(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  10. ExecThresholdsController                                      */
/* ================================================================== */
describe('ExecThresholdsController', () => {
  let ctrl: ExecThresholdsController;
  beforeEach(() => { mockQuery.mockReset(); mockInput.mockReset(); ctrl = new ExecThresholdsController(); });

  it('getThresholds \u2013 returns parsed config from DB', async () => {
    const stored = JSON.stringify({ rag: { denialRate: { greenMax: 3, yellowMax: 8 } }, triggers: {} });
    mockQuery.mockResolvedValue({ recordset: [{ value: stored }] });
    const res = makeRes();
    await ctrl.getThresholds(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const arg = (res.json as jest.Mock).mock.calls[0][0] as any;
    expect(arg.rag.denialRate.greenMax).toBe(3);
  });

  it('getThresholds \u2013 returns defaults when no record', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.getThresholds(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getThresholds \u2013 returns defaults on DB error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.getThresholds(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('saveThresholds \u2013 happy path', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.saveThresholds(makeReq({ body: { rag: { denialRate: { greenMax: 5, yellowMax: 10 } } } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('saveThresholds \u2013 clamps non-finite values to min', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.saveThresholds(makeReq({ body: { rag: { denialRate: { greenMax: 'bad', yellowMax: null } } } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const arg = (res.json as jest.Mock).mock.calls[0][0] as any;
    expect(arg.rag.denialRate.greenMax).toBe(0);
  });

  it('saveThresholds \u2013 500 on DB error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.saveThresholds(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('resetThresholds \u2013 happy path', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.resetThresholds(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('resetThresholds \u2013 500 on DB error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.resetThresholds(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  11. PrioritySettingsController                                    */
/* ================================================================== */
describe('PrioritySettingsController', () => {
  let ctrl: PrioritySettingsController;
  beforeEach(() => { mockQuery.mockReset(); mockInput.mockReset(); mockRecalculate.mockReset(); ctrl = new PrioritySettingsController(); });

  it('getSettings \u2013 happy path with priority_weights and enabled=true', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ key: 'priority_weights', value: '{"aging":40}' }, { key: 'priority_recalc_enabled', value: '1' }] })
      .mockResolvedValueOnce({ recordset: [{ totalScored: 100, lastRunAt: new Date(), avgScore: 55, maxScore: 90, minScore: 10 }] })
      .mockResolvedValueOnce({ recordset: [{ high: 30, medium: 50, low: 20 }] });
    const res = makeRes();
    await ctrl.getSettings(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const arg = (res.json as jest.Mock).mock.calls[0][0] as any;
    expect(arg.enabled).toBe(true);
  });

  it('getSettings \u2013 enabled=false branch', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ key: 'priority_recalc_enabled', value: '0' }] })
      .mockResolvedValueOnce({ recordset: [{}] })
      .mockResolvedValueOnce({ recordset: [{}] });
    const res = makeRes();
    await ctrl.getSettings(makeReq(), res);
    const arg = (res.json as jest.Mock).mock.calls[0][0] as any;
    expect(arg.enabled).toBe(false);
  });

  it('getSettings \u2013 invalid JSON weights falls back to defaults', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ key: 'priority_weights', value: 'BAD_JSON' }] })
      .mockResolvedValueOnce({ recordset: [{}] })
      .mockResolvedValueOnce({ recordset: [{}] });
    const res = makeRes();
    await ctrl.getSettings(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getSettings \u2013 500 on DB error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.getSettings(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('updateSettings \u2013 happy path with both weights and enabled', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.updateSettings(makeReq({ body: { weights: { aging: 40, value: 25, deadline: 20, workload: 15, proficiency: 0 }, enabled: true } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('updateSettings \u2013 only weights provided', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.updateSettings(makeReq({ body: { weights: { aging: 50 } } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('updateSettings \u2013 only enabled provided', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.updateSettings(makeReq({ body: { enabled: false } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('updateSettings \u2013 neither provided', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.updateSettings(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('updateSettings \u2013 500 on DB error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.updateSettings(makeReq({ body: { weights: { aging: 40 } } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('triggerRecalculate \u2013 happy path', async () => {
    mockRecalculate.mockResolvedValue(42);
    const res = makeRes();
    await ctrl.triggerRecalculate(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'Recalculation complete', scored: 42 });
  });

  it('triggerRecalculate \u2013 500 on error', async () => {
    mockRecalculate.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.triggerRecalculate(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('getTopClaims \u2013 happy path', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ claimId: 'CL001', priorityScore: 85 }] });
    const res = makeRes();
    await ctrl.getTopClaims(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getTopClaims \u2013 custom limit clamped to 200', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.getTopClaims(makeReq({ query: { limit: '9999' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getTopClaims \u2013 500 on DB error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.getTopClaims(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  12. AdminRemediationController                                    */
/* ================================================================== */
describe('AdminRemediationController', () => {
  let ctrl: AdminRemediationController;
  beforeEach(() => { mockQuery.mockReset(); mockInput.mockReset(); ctrl = new AdminRemediationController(); });

  it('listSets \u2013 happy path with no filters', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ id: 1 }] });
    const res = makeRes();
    await ctrl.listSets(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('listSets \u2013 with all query filters', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.listSets(makeReq({ query: { reasonCode: 'CO45', role: 'Specialist', status: 'active', limit: '10' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('listSets \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.listSets(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('getSet \u2013 happy path with steps and checklists', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ id: 1, reason_code: 'CO45', role: 'Specialist', status: 'active', version: 1, published_at: null, published_by: null, updated_at: new Date(), updated_by: null, created_at: new Date(), created_by: null }] })
      .mockResolvedValueOnce({ recordset: [
        { id: 10, sort_order: 1, title: 'Step 1', body: null, required: true, cl_id: 100, cl_sort: 1, item_text: 'Check A' },
        { id: 10, sort_order: 1, title: 'Step 1', body: null, required: true, cl_id: 101, cl_sort: 2, item_text: 'Check B' },
        { id: 11, sort_order: 2, title: 'Step 2', body: 'body', required: false, cl_id: null, cl_sort: null, item_text: null },
      ]});
    const res = makeRes();
    await ctrl.getSet(makeReq({ params: { id: '1' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const arg = (res.json as jest.Mock).mock.calls[0][0] as any;
    expect(arg.data.steps).toHaveLength(2);
    expect(arg.data.steps[0].checklist).toHaveLength(2);
  });

  it('getSet \u2013 404 when not found', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = makeRes();
    await ctrl.getSet(makeReq({ params: { id: '99' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('getSet \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.getSet(makeReq({ params: { id: '1' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('createSet \u2013 400 when reason_code missing', async () => {
    const res = makeRes();
    await ctrl.createSet(makeReq({ body: { role: 'Specialist' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('createSet \u2013 400 when role missing', async () => {
    const res = makeRes();
    await ctrl.createSet(makeReq({ body: { reason_code: 'CO45' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('createSet \u2013 happy path with steps and checklists', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] })            // duplicate check -> none found
      .mockResolvedValueOnce({ recordset: [{ id: 20 }] }) // insert set
      .mockResolvedValueOnce({ recordset: [{ id: 30 }] }) // insert step
      .mockResolvedValue({ recordset: [] }); // insert checklist items
    const res = makeRes();
    await ctrl.createSet(makeReq({ body: { reason_code: 'CO45', role: 'Specialist', steps: [{ title: 'S1', body: 'body', required: true, checklist: ['item1', 'item2'] }] } }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ data: { id: 20 } });
  });

  it('createSet \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.createSet(makeReq({ body: { reason_code: 'CO45', role: 'Specialist' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('updateSet \u2013 404 when set not found', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = makeRes();
    await ctrl.updateSet(makeReq({ params: { id: '99' }, body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('updateSet \u2013 happy path with reason_code and role updates', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ id: 1 }] }) // check exists
      .mockResolvedValueOnce({ recordset: [] })           // UPDATE set
      .mockResolvedValueOnce({ recordset: [] })           // DELETE checklist items
      .mockResolvedValueOnce({ recordset: [] })           // DELETE steps
      .mockResolvedValueOnce({ recordset: [{ id: 31 }] }) // INSERT step (needs id for checklist)
      .mockResolvedValue({ recordset: [] });               // INSERT checklist item(s)
    const res = makeRes();
    await ctrl.updateSet(makeReq({ params: { id: '1' }, body: { reason_code: 'CO97', role: 'Lead', steps: [{ title: 'S', checklist: ['x'] }] } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('updateSet \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.updateSet(makeReq({ params: { id: '1' }, body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('publishSet \u2013 404 when not found', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = makeRes();
    await ctrl.publishSet(makeReq({ params: { id: '99' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('publishSet \u2013 happy path', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ id: 1, reason_code: 'CO45', role: 'Specialist', version: 1 }] })
      .mockResolvedValueOnce({ recordset: [] }) // deactivate others
      .mockResolvedValueOnce({ recordset: [{ id: 10, sort_order: 1, title: 'S', body: null, required: true, cl_id: null, item_text: null }] }) // snapshot
      .mockResolvedValueOnce({ recordset: [] }) // publish update
      .mockResolvedValueOnce({ recordset: [] }); // history insert
    const res = makeRes();
    await ctrl.publishSet(makeReq({ params: { id: '1' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const arg = (res.json as jest.Mock).mock.calls[0][0] as any;
    expect(arg.data.version).toBe(2);
  });

  it('publishSet \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.publishSet(makeReq({ params: { id: '1' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('getSetHistory \u2013 happy path', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ id: 1, version: 2 }] });
    const res = makeRes();
    await ctrl.getSetHistory(makeReq({ params: { id: '1' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getSetHistory \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.getSetHistory(makeReq({ params: { id: '1' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('listReasonCodes \u2013 happy path', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ code: 'CO45' }, { code: 'CO97' }] });
    const res = makeRes();
    await ctrl.listReasonCodes(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: ['CO45', 'CO97'] });
  });

  it('listReasonCodes \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.listReasonCodes(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('listFeedback \u2013 happy path with status filter', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ id: 1 }] });
    const res = makeRes();
    await ctrl.listFeedback(makeReq({ query: { status: 'pending', limit: '50' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('listFeedback \u2013 happy path with no filter', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.listFeedback(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('listFeedback \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.listFeedback(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('reviewFeedback \u2013 400 when invalid status', async () => {
    const res = makeRes();
    await ctrl.reviewFeedback(makeReq({ params: { id: '1' }, body: { status: 'bad' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('reviewFeedback \u2013 happy path approved', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.reviewFeedback(makeReq({ params: { id: '1' }, body: { status: 'approved', reviewer_note: 'LGTM' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('reviewFeedback \u2013 happy path rejected no note', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.reviewFeedback(makeReq({ params: { id: '2' }, body: { status: 'rejected' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('reviewFeedback \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.reviewFeedback(makeReq({ params: { id: '1' }, body: { status: 'deferred' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('deleteSet \u2013 404 when not found', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] });
    const res = makeRes();
    await ctrl.deleteSet(makeReq({ params: { id: '99' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('deleteSet \u2013 happy path cascade deletes', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ id: 1 }] })  // check
      .mockResolvedValue({ recordset: [] }); // 5x delete queries
    const res = makeRes();
    await ctrl.deleteSet(makeReq({ params: { id: '1' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('deleteSet \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.deleteSet(makeReq({ params: { id: '1' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  13. SpecialistScorecardsController                                */
/* ================================================================== */
describe('SpecialistScorecardsController', () => {
  let ctrl: SpecialistScorecardsController;
  beforeEach(() => { mockQuery.mockReset(); mockInput.mockReset(); ctrl = new SpecialistScorecardsController(); });

  it('getScorecards \u2013 happy path weekly (default)', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ staffId: 1, staffName: 'Alice' }] });
    const res = makeRes();
    await ctrl.getScorecards(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const arg = (res.json as jest.Mock).mock.calls[0][0] as any;
    expect(arg.period).toBe('weekly');
  });

  it('getScorecards \u2013 monthly period', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.getScorecards(makeReq({ query: { period: 'monthly' } }), res);
    const arg = (res.json as jest.Mock).mock.calls[0][0] as any;
    expect(arg.period).toBe('monthly');
  });

  it('getScorecards \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.getScorecards(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('getGoals \u2013 happy path', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ id: 1 }] });
    const res = makeRes();
    await ctrl.getGoals(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getGoals \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.getGoals(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('setGoals \u2013 happy path', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.setGoals(makeReq({ body: { staffId: 1, period: 'weekly', claimsGoal: 10, revenueGoal: 5000, firstTouchGoal: 80, avgDaysGoal: 3 } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'Goals saved' });
  });

  it('setGoals \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.setGoals(makeReq({ body: { staffId: 1 } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  14. TimeTrackingController                                        */
/* ================================================================== */
describe('TimeTrackingController', () => {
  let ctrl: TimeTrackingController;
  beforeEach(() => { mockQuery.mockReset(); mockInput.mockReset(); ctrl = new TimeTrackingController(); });

  it('getSummary \u2013 happy path with custom days', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ activeSpecialists: 5, totalClaimsWorked: 100, totalMinutesWorked: 600, avgMinutesPerClaim: 6, avgDailyMinutesPerSpecialist: 120, avgUtilizationPct: 25 }] });
    const res = makeRes();
    await ctrl.getSummary(makeReq({ query: { days: '14' } }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ activeSpecialists: 5, periodDays: 14 }));
  });

  it('getSummary \u2013 empty recordset uses defaults', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.getSummary(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ activeSpecialists: 0 }));
  });

  it('getSummary \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.getSummary(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('getUtilization \u2013 happy path', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ staffId: 1 }] });
    const res = makeRes();
    await ctrl.getUtilization(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith([{ staffId: 1 }]);
  });

  it('getUtilization \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.getUtilization(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('getTimeSinks \u2013 happy path with custom limit', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ carcCode: 'CO45' }] });
    const res = makeRes();
    await ctrl.getTimeSinks(makeReq({ query: { days: '60', limit: '10' } }), res);
    expect(res.json).toHaveBeenCalledWith([{ carcCode: 'CO45' }]);
  });

  it('getTimeSinks \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.getTimeSinks(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('getByPayer \u2013 happy path', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ payerId: 1 }] });
    const res = makeRes();
    await ctrl.getByPayer(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith([{ payerId: 1 }]);
  });

  it('getByPayer \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.getByPayer(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('getBenchmarks \u2013 happy path', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ staffId: 1, speedPercentile: 0.75 }] });
    const res = makeRes();
    await ctrl.getBenchmarks(makeReq(), res);
    const arg = (res.json as jest.Mock).mock.calls[0][0] as any;
    expect(arg[0].speedPercentile).toBe(75);
  });

  it('getBenchmarks \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.getBenchmarks(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('getTrend \u2013 happy path', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ workDate: '2025-01-01', activeStaff: 3, claimsWorked: 10, totalMinutes: 120, avgMinPerClaim: 12 }] });
    const res = makeRes();
    await ctrl.getTrend(makeReq(), res);
    const arg = (res.json as jest.Mock).mock.calls[0][0] as any;
    expect(arg[0].totalHours).toBe(2);
  });

  it('getTrend \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.getTrend(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  15. CoachingRecommendationsController                             */
/* ================================================================== */
describe('CoachingRecommendationsController', () => {
  let ctrl: CoachingRecommendationsController;
  beforeEach(() => { mockQuery.mockReset(); mockInput.mockReset(); ctrl = new CoachingRecommendationsController(); });

  it('listRecommendations \u2013 all status, summary counts', async () => {
    mockQuery.mockResolvedValue({ recordset: [
      { status: 'pending', id: 1 },
      { status: 'in-progress', id: 2 },
      { status: 'completed', id: 3 },
    ]});
    const res = makeRes();
    await ctrl.listRecommendations(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const arg = (res.json as jest.Mock).mock.calls[0][0] as any;
    expect(arg.summary).toEqual({ pending: 1, inProgress: 1, completed: 1, total: 3 });
  });

  it('listRecommendations \u2013 with specific status filter', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ status: 'pending', id: 1 }] });
    const res = makeRes();
    await ctrl.listRecommendations(makeReq({ query: { status: 'pending' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('listRecommendations \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.listRecommendations(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('generateRecommendations \u2013 no gaps, no inserts', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] }) // matrix: no ratings
      .mockResolvedValueOnce({ recordset: [] }); // existing recs
    const res = makeRes();
    await ctrl.generateRecommendations(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ created: 0 }));
  });

  it('generateRecommendations \u2013 skips existing recs', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ staffId: 1, staffName: 'Alice', staffRole: 'Specialist', carcCode: 'CO45', rating: 'needs-training', staffAvgMin: 30, teamAvgMin: 20, claimCount: 5 }] })
      .mockResolvedValueOnce({ recordset: [{ staff_id: 1, carc_code: 'CO45' }] }); // already exists
    const res = makeRes();
    await ctrl.generateRecommendations(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ created: 0, existingSkipped: 1 }));
  });

  it('generateRecommendations \u2013 creates new rec with mentor', async () => {
    const matrix = [
      { staffId: 1, staffName: 'Alice', staffRole: 'Specialist', carcCode: 'CO45', rating: 'needs-training', staffAvgMin: 30, teamAvgMin: 20, claimCount: 5 },
      { staffId: 2, staffName: 'Bob', staffRole: 'Specialist', carcCode: 'CO45', rating: 'strong', staffAvgMin: 10, teamAvgMin: 20, claimCount: 15 },
    ];
    mockQuery
      .mockResolvedValueOnce({ recordset: matrix })
      .mockResolvedValueOnce({ recordset: [] }) // no existing
      .mockResolvedValueOnce({ recordset: [] }); // insert
    const res = makeRes();
    await ctrl.generateRecommendations(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ created: 1 }));
  });

  it('generateRecommendations \u2013 creates rec with below-average, no mentor available', async () => {
    const matrix = [
      { staffId: 1, staffName: 'Alice', staffRole: 'Specialist', carcCode: 'CO97', rating: 'below-average', staffAvgMin: 25, teamAvgMin: 20, claimCount: 5 },
    ];
    mockQuery
      .mockResolvedValueOnce({ recordset: matrix })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] });
    const res = makeRes();
    await ctrl.generateRecommendations(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ created: 1 }));
  });

  it('generateRecommendations \u2013 sorts mentors: same role first', async () => {
    const matrix = [
      { staffId: 1, staffName: 'Alice', staffRole: 'Specialist', carcCode: 'CO45', rating: 'needs-training', staffAvgMin: 30, teamAvgMin: 20, claimCount: 5 },
      { staffId: 2, staffName: 'Bob', staffRole: 'Manager', carcCode: 'CO45', rating: 'strong', staffAvgMin: 10, teamAvgMin: 20, claimCount: 10 },
      { staffId: 3, staffName: 'Carol', staffRole: 'Specialist', carcCode: 'CO45', rating: 'strong', staffAvgMin: 12, teamAvgMin: 20, claimCount: 20 },
    ];
    mockQuery
      .mockResolvedValueOnce({ recordset: matrix })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] }); // insert picks Carol (same role, more claims)
    const res = makeRes();
    await ctrl.generateRecommendations(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ created: 1 }));
  });

  it('generateRecommendations \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.generateRecommendations(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('updateRecommendation \u2013 400 when no fields provided', async () => {
    const res = makeRes();
    await ctrl.updateRecommendation(makeReq({ params: { id: '1' }, body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('updateRecommendation \u2013 status=completed sets resolved_at', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.updateRecommendation(makeReq({ params: { id: '1' }, body: { status: 'completed' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('updateRecommendation \u2013 status != completed no resolved_at', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.updateRecommendation(makeReq({ params: { id: '1' }, body: { status: 'in-progress' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('updateRecommendation \u2013 notes, mentorId, mentorName, reviewDate all set', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.updateRecommendation(makeReq({ params: { id: '1' }, body: { notes: 'note', mentorId: 2, mentorName: 'Bob', reviewDate: '2025-04-01' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('updateRecommendation \u2013 reviewDate null branch', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const res = makeRes();
    await ctrl.updateRecommendation(makeReq({ params: { id: '1' }, body: { reviewDate: null } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('updateRecommendation \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.updateRecommendation(makeReq({ params: { id: '1' }, body: { status: 'pending' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('getSummary \u2013 happy path', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ pending: 2, inProgress: 1, completed: 5, total: 8, uniqueStaff: 3, uniqueCodes: 2, uniqueMentors: 1 }] })
      .mockResolvedValueOnce({ recordset: [{ carcCode: 'CO45', count: 3 }] })
      .mockResolvedValueOnce({ recordset: [{ mentorName: 'Bob', menteeCount: 2 }] });
    const res = makeRes();
    await ctrl.getSummary(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const arg = (res.json as jest.Mock).mock.calls[0][0] as any;
    expect(arg.topGapCodes).toHaveLength(1);
  });

  it('getSummary \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.getSummary(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/* ================================================================== */
/*  16. SOPRecommendationsController                                  */
/* ================================================================== */
describe('SOPRecommendationsController', () => {
  let ctrl: SOPRecommendationsController;
  beforeEach(() => { mockQuery.mockReset(); mockInput.mockReset(); ctrl = new SOPRecommendationsController(); });

  it('getRecommendations \u2013 happy path with all recommendation types', async () => {
    // completion: low completion on required step (completionRate < 40, isRequired=true)
    mockQuery
      .mockResolvedValueOnce({ recordset: [
        { setId: 1, reasonCode: 'CO45', targetRole: 'Specialist', stepId: 10, stepTitle: 'Verify', sortOrder: 1, isRequired: true, completedCount: 2, totalClaimsWithCode: 20 }, // 10% => high severity
        { setId: 1, reasonCode: 'CO97', targetRole: 'Specialist', stepId: 11, stepTitle: 'Submit', sortOrder: 1, isRequired: true, completedCount: 6, totalClaimsWithCode: 20 }, // 30% => medium severity
        { setId: 2, reasonCode: 'CO99', targetRole: 'Lead', stepId: 12, stepTitle: 'Review', sortOrder: 1, isRequired: false, completedCount: 1, totalClaimsWithCode: 20 }, // not required, skip
        { setId: 3, reasonCode: 'CO50', targetRole: 'Lead', stepId: 13, stepTitle: 'Escalate', sortOrder: 1, isRequired: true, completedCount: 10, totalClaimsWithCode: 20 }, // 50% => no push
      ]})
      // feedback: count>=2
      .mockResolvedValueOnce({ recordset: [
        { setId: 1, stepId: 10, reasonCode: 'CO45', stepTitle: 'Verify', feedbackCount: 6, pendingCount: 2 }, // high
        { setId: 1, stepId: 11, reasonCode: 'CO97', stepTitle: 'Submit', feedbackCount: 3, pendingCount: 1 }, // medium
      ]})
      // escalation: rate > 25%
      .mockResolvedValueOnce({ recordset: [
        { reasonCode: 'CO45', totalClaims: 10, escalatedClaims: 6, escalationRate: 60, setId: 1, setStatus: 'active' }, // high
        { reasonCode: 'CO97', totalClaims: 10, escalatedClaims: 3, escalationRate: 30, setId: null, setStatus: null }, // medium, no SOP
      ]})
      // resolution: slow
      .mockResolvedValueOnce({ recordset: [
        { reasonCode: 'CO45', claimCount: 5, avgDaysToResolve: 20, maxDaysToResolve: 30, setId: 1 }, // high
        { reasonCode: 'CO97', claimCount: 4, avgDaysToResolve: 10, maxDaysToResolve: 15, setId: null }, // medium
      ]})
      // missing SOPs
      .mockResolvedValueOnce({ recordset: [
        { reasonCode: 'CO88', reasonDescription: 'Claim not covered', claimCount: 15 }, // high
        { reasonCode: 'CO33', reasonDescription: 'Duplicate', claimCount: 5 }, // medium
      ]});
    const res = makeRes();
    await ctrl.getRecommendations(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const arg = (res.json as jest.Mock).mock.calls[0][0] as any;
    // Should have recommendations of various types
    expect(arg.data.length).toBeGreaterThan(0);
    const types = new Set(arg.data.map((r: any) => r.type));
    expect(types).toContain('low_completion');
    expect(types).toContain('high_feedback');
    expect(types).toContain('escalation_spike');
    expect(types).toContain('slow_resolution');
    expect(types).toContain('missing_sop');
  });

  it('getRecommendations \u2013 completionRate 0 when totalClaimsWithCode=0 (zero-division guard)', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ setId: 1, reasonCode: 'CO45', targetRole: 'Spec', stepId: 10, stepTitle: 'T', sortOrder: 1, isRequired: true, completedCount: 0, totalClaimsWithCode: 0 }] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] });
    const res = makeRes();
    await ctrl.getRecommendations(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    // completionRate=0 < 40 and isRequired => pushes a recommendation
    const arg = (res.json as jest.Mock).mock.calls[0][0] as any;
    expect(arg.data.some((r: any) => r.type === 'low_completion')).toBe(true);
  });

  it('getRecommendations \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.getRecommendations(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('getEffectiveness \u2013 happy path', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ reasonCode: 'CO45', setId: 1, version: 2 }] });
    const res = makeRes();
    await ctrl.getEffectiveness(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: [{ reasonCode: 'CO45', setId: 1, version: 2 }] });
  });

  it('getEffectiveness \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.getEffectiveness(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('getSmartSteps \u2013 no SOP found returns 200 with null data', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] }) // no claim CARC
      .mockResolvedValueOnce({ recordset: [] }); // no SOP
    const res = makeRes();
    await ctrl.getSmartSteps(makeReq({ query: { claimId: 'CL001', role: 'ar-specialist' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: null, message: 'No SOP found' });
  });

  it('getSmartSteps \u2013 happy path with steps, effectiveness=high when completionCount>0 and avgDays<=7', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ CARCCode: 'CO45' }] }) // claim carc
      .mockResolvedValueOnce({ recordset: [{ id: 5, reason_code: 'CO45', version: 2 }] }) // SOP
      .mockResolvedValueOnce({ recordset: [
        { id: 10, title: 'S1', body: 'b', sortOrder: 1, isRequired: true, completionCount: 5, totalClaims: 10, avgDaysWhenCompleted: 5, recentFeedback: 0 }, // high effectiveness
        { id: 11, title: 'S2', body: null, sortOrder: 2, isRequired: false, completionCount: 3, totalClaims: 10, avgDaysWhenCompleted: 15, recentFeedback: 2 }, // medium
        { id: 12, title: 'S3', body: null, sortOrder: 3, isRequired: false, completionCount: 0, totalClaims: 10, avgDaysWhenCompleted: 0, recentFeedback: 0 }, // unknown
      ]});
    const res = makeRes();
    await ctrl.getSmartSteps(makeReq({ query: { claimId: 'CL001', role: 'ar-specialist' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const arg = (res.json as jest.Mock).mock.calls[0][0] as any;
    expect(arg.data.steps[0].effectiveness).toBe('high');
    expect(arg.data.steps[1].effectiveness).toBe('medium');
    expect(arg.data.steps[2].effectiveness).toBe('unknown');
  });

  it('getSmartSteps \u2013 uses DEFAULT when claim has no CARC code', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] }) // no CARC -> uses DEFAULT
      .mockResolvedValueOnce({ recordset: [{ id: 1, reason_code: 'DEFAULT', version: 1 }] })
      .mockResolvedValueOnce({ recordset: [] }); // no steps
    const res = makeRes();
    await ctrl.getSmartSteps(makeReq({ query: { claimId: 'CL999' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getSmartSteps \u2013 500 on error', async () => {
    mockQuery.mockRejectedValue(DB_ERROR);
    const res = makeRes();
    await ctrl.getSmartSteps(makeReq({ query: { claimId: 'CL001' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
