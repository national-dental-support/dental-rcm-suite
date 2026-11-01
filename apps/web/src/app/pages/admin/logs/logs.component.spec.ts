import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { LogsComponent } from './logs.component';
import { AdminLogsService } from '../../../core/services/admin-logs.service';

describe('LogsComponent', () => {
  let component: LogsComponent;
  let fixture: ComponentFixture<LogsComponent>;
  let svcSpy: jasmine.SpyObj<AdminLogsService>;

  beforeEach(async () => {
    svcSpy = jasmine.createSpyObj('AdminLogsService', ['getEvents', 'getErrors', 'fetchAuditLog']);
    svcSpy.getEvents.and.returnValue(of([
      { id: 1, user_id: 'u1', event_name: 'login', url: '/app', timestamp: '2026-01-01T10:00:00Z', properties: '{}' },
    ] as any));
    svcSpy.getErrors.and.returnValue(of([]));
    svcSpy.fetchAuditLog.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      declarations: [LogsComponent],
      providers: [{ provide: AdminLogsService, useValue: svcSpy }],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(LogsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize column configs', () => {
    expect(component.eventsColumns.length).toBeGreaterThan(0);
    expect(component.errorsColumns.length).toBeGreaterThan(0);
    expect(component.auditColumns.length).toBeGreaterThan(0);
  });

  it('should load events on init', () => {
    expect(component.events.length).toBe(1);
    expect(component.eventsLoading).toBeFalse();
  });

  it('should call all loaders on refresh()', () => {
    component.refresh();
    expect(svcSpy.getEvents).toHaveBeenCalledTimes(2);
    expect(svcSpy.getErrors).toHaveBeenCalledTimes(2);
    expect(svcSpy.fetchAuditLog).toHaveBeenCalledTimes(2);
  });

  it('fmtDate should return em-dash for null', () => {
    expect(component.fmtDate(null)).toBe('\u2014');
  });

  it('fmtDate should format a valid date', () => {
    const result = component.fmtDate('2026-03-12T08:00:00Z');
    expect(result).toContain('2026');
  });

  it('formatProps should parse JSON', () => {
    expect(component.formatProps('{"key":"value"}')).toBe('key: value');
  });

  it('formatProps should return raw string on parse failure', () => {
    expect(component.formatProps('not-json')).toBe('not-json');
  });

  it('formatProps should return em-dash for null', () => {
    expect(component.formatProps(null)).toBe('\u2014');
  });

  it('formatDiff should return em-dash when both null', () => {
    expect(component.formatDiff(null, null)).toBe('\u2014');
  });

  it('formatDiff should show changes', () => {
    const result = component.formatDiff('{"role":"User"}', '{"role":"Admin"}');
    expect(result).toContain('role');
    expect(result).toContain('Admin');
  });

  it('safeTypeClass should kebab-case the value', () => {
    expect(component.safeTypeClass('HTTP Error')).toBe('http-error');
  });

  it('safeTypeClass should handle null/undefined', () => {
    expect(component.safeTypeClass(null)).toBe('');
    expect(component.safeTypeClass(undefined)).toBe('');
  });

  it('safeActionClass should replace dots and special chars', () => {
    expect(component.safeActionClass('user.create')).toBe('user-create');
    expect(component.safeActionClass(null)).toBe('');
  });

  it('formatDiff should return "no change" when values are identical', () => {
    expect(component.formatDiff('{"role":"Admin"}', '{"role":"Admin"}')).toBe('no change');
  });

  it('formatDiff should return raw string on JSON parse error', () => {
    expect(component.formatDiff('bad', 'json')).toBe('json');
  });

  it('formatDiff should handle only before being null', () => {
    const result = component.formatDiff(null, '{"role":"Admin"}');
    expect(result).toContain('role');
  });

  it('formatDiff should handle only after being null', () => {
    const result = component.formatDiff('{"role":"User"}', null);
    expect(result).toContain('role');
  });

  it('eventsColumns accessors should work', () => {
    const row = { timestamp: '2026-01-01T10:00:00Z', user_id: 'u1', event_name: 'login', url: '/app', properties: '{"k":"v"}' };
    const tsCol = component.eventsColumns.find(c => c.id === 'timestamp')!;
    expect(tsCol.accessor(row as any)).toBe('2026-01-01T10:00:00Z');
    expect(tsCol.displayFormatter!('', row as any)).toContain('2026');
    expect(tsCol.sortAccessor!(row as any)).toBeGreaterThan(0);

    const propsCol = component.eventsColumns.find(c => c.id === 'properties')!;
    expect(propsCol.displayFormatter!('', row as any)).toBe('k: v');
  });

  it('errorsColumns accessors should work', () => {
    const row = { timestamp: '2026-01-01', user_id: 'u1', error_type: 'HTTP', message: 'fail', http_status: 500, http_method: 'GET', http_url: '/api/test' };
    const methodCol = component.errorsColumns.find(c => c.id === 'http_method')!;
    expect(methodCol.accessor(row as any)).toBe('GET /api/test');
  });

  it('auditColumns accessors should work', () => {
    const row = { timestamp: '2026-01-01', actor_id: 'admin', action: 'update', target_id: 'user1', before_state: '{"a":1}', after_state: '{"a":2}', ip_address: '127.0.0.1' };
    const diffCol = component.auditColumns.find(c => c.id === 'diff')!;
    expect(diffCol.displayFormatter!('', row as any)).toContain('a');
  });

  it('should handle error on loadEvents', () => {
    svcSpy.getEvents.and.returnValue(new (require('rxjs').Observable)((sub: any) => sub.error('fail')));
    component.refresh();
    expect(component.eventsLoading).toBeFalse();
  });

  it('should handle null data from getEvents', () => {
    svcSpy.getEvents.and.returnValue(of(null as any));
    component.refresh();
    expect(component.events).toEqual([]);
  });

  it('should handle error on loadErrors', () => {
    svcSpy.getErrors.and.returnValue(new (require('rxjs').Observable)((sub: any) => sub.error('fail')));
    component.refresh();
    expect(component.errorsLoading).toBeFalse();
  });

  it('should handle error on loadAuditLog', () => {
    svcSpy.fetchAuditLog.and.returnValue(new (require('rxjs').Observable)((sub: any) => sub.error('fail')));
    component.refresh();
    expect(component.auditLoading).toBeFalse();
  });

  it('eventsColumns user_id accessor should return empty string for null', () => {
    const col = component.eventsColumns.find(c => c.id === 'user_id')!;
    expect(col.accessor({ user_id: null } as any)).toBe('');
  });

  it('eventsColumns event_name accessor should return empty string for null', () => {
    const col = component.eventsColumns.find(c => c.id === 'event_name')!;
    expect(col.accessor({ event_name: null } as any)).toBe('');
  });

  it('eventsColumns url accessor should return empty string for null', () => {
    const col = component.eventsColumns.find(c => c.id === 'url')!;
    expect(col.accessor({ url: null } as any)).toBe('');
  });

  it('eventsColumns properties accessor should return empty string for null', () => {
    const col = component.eventsColumns.find(c => c.id === 'properties')!;
    expect(col.accessor({ properties: null } as any)).toBe('');
  });

  it('eventsColumns properties displayFormatter should handle null properties', () => {
    const col = component.eventsColumns.find(c => c.id === 'properties')!;
    expect(col.displayFormatter!('', { properties: null } as any)).toBe('\u2014');
  });

  it('eventsColumns timestamp sortAccessor should handle null timestamp', () => {
    const col = component.eventsColumns.find(c => c.id === 'timestamp')!;
    const result = col.sortAccessor!({ timestamp: null } as any);
    expect(isNaN(result as number)).toBeTrue();
  });

  it('errorsColumns user_id accessor should return empty string for null', () => {
    const col = component.errorsColumns.find(c => c.id === 'user_id')!;
    expect(col.accessor({ user_id: null } as any)).toBe('');
  });

  it('errorsColumns error_type accessor should return empty string for null', () => {
    const col = component.errorsColumns.find(c => c.id === 'error_type')!;
    expect(col.accessor({ error_type: null } as any)).toBe('');
  });

  it('errorsColumns message accessor should return empty string for null', () => {
    const col = component.errorsColumns.find(c => c.id === 'message')!;
    expect(col.accessor({ message: null } as any)).toBe('');
  });

  it('errorsColumns http_status accessor should return null for null', () => {
    const col = component.errorsColumns.find(c => c.id === 'http_status')!;
    expect(col.accessor({ http_status: null } as any)).toBeNull();
  });

  it('errorsColumns http_method accessor should trim when method or url null', () => {
    const col = component.errorsColumns.find(c => c.id === 'http_method')!;
    expect(col.accessor({ http_method: null, http_url: '/api/test' } as any)).toBe('/api/test');
    expect(col.accessor({ http_method: 'GET', http_url: null } as any)).toBe('GET');
    expect(col.accessor({ http_method: null, http_url: null } as any)).toBe('');
  });

  it('errorsColumns timestamp displayFormatter should format date', () => {
    const col = component.errorsColumns.find(c => c.id === 'timestamp')!;
    const result = col.displayFormatter!('', { timestamp: '2026-01-01T10:00:00Z' } as any);
    expect(result).toContain('2026');
  });

  it('errorsColumns timestamp displayFormatter should return dash for null', () => {
    const col = component.errorsColumns.find(c => c.id === 'timestamp')!;
    expect(col.displayFormatter!('', { timestamp: null } as any)).toBe('\u2014');
  });

  it('auditColumns actor_id accessor should return empty string for null', () => {
    const col = component.auditColumns.find(c => c.id === 'actor_id')!;
    expect(col.accessor({ actor_id: null } as any)).toBe('');
  });

  it('auditColumns action accessor should return empty string for null', () => {
    const col = component.auditColumns.find(c => c.id === 'action')!;
    expect(col.accessor({ action: null } as any)).toBe('');
  });

  it('auditColumns target_id accessor should return empty string for null', () => {
    const col = component.auditColumns.find(c => c.id === 'target_id')!;
    expect(col.accessor({ target_id: null } as any)).toBe('');
  });

  it('auditColumns ip_address accessor should return empty string for null', () => {
    const col = component.auditColumns.find(c => c.id === 'ip_address')!;
    expect(col.accessor({ ip_address: null } as any)).toBe('');
  });

  it('auditColumns diff accessor should handle null before and after state', () => {
    const col = component.auditColumns.find(c => c.id === 'diff')!;
    expect(col.accessor({ before_state: null, after_state: null } as any)).toBe('');
  });

  it('auditColumns diff displayFormatter should handle both null', () => {
    const col = component.auditColumns.find(c => c.id === 'diff')!;
    expect(col.displayFormatter!('', { before_state: null, after_state: null } as any)).toBe('\u2014');
  });

  it('auditColumns timestamp displayFormatter should format date', () => {
    const col = component.auditColumns.find(c => c.id === 'timestamp')!;
    const result = col.displayFormatter!('', { timestamp: '2026-01-01T10:00:00Z' } as any);
    expect(result).toContain('2026');
  });

  it('auditColumns timestamp sortAccessor should sort by epoch', () => {
    const col = component.auditColumns.find(c => c.id === 'timestamp')!;
    const result = col.sortAccessor!({ timestamp: '2026-01-01T10:00:00Z' } as any);
    expect(result).toBeGreaterThan(0);
  });

  it('auditColumns diff displayFormatter bv/av nullish fallback', () => {
    const col = component.auditColumns.find(c => c.id === 'diff')!;
    // before has 'role', after doesn't => av is undefined -> '-'
    const result = col.displayFormatter!('', {
      before_state: '{"role":"Admin"}', after_state: '{}',
    } as any);
    expect(result).toContain('role');
    expect(result).toContain('\u2014');
  });

  it('should handle null data from getErrors', () => {
    svcSpy.getErrors.and.returnValue(of(null as any));
    component.refresh();
    expect(component.errors).toEqual([]);
  });

  it('should handle null data from fetchAuditLog', () => {
    svcSpy.fetchAuditLog.and.returnValue(of(null as any));
    component.refresh();
    expect(component.audit).toEqual([]);
  });
});
