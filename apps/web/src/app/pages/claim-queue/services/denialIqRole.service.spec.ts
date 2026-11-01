import { TestBed } from '@angular/core/testing';
import { DenialIqContextService, DenialIqRole } from './denialIqRole.service';

describe('DenialIqContextService', () => {
  let service: DenialIqContextService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DenialIqContextService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should default role to ar-specialist', () => {
    expect(service.currentRole).toBe('ar-specialist');
  });

  it('role$ should emit default value', (done) => {
    service.role$.subscribe((role) => {
      expect(role).toBe('ar-specialist');
      done();
    });
  });

  it('setRole should update currentRole', () => {
    service.setRole('manager');
    expect(service.currentRole).toBe('manager');
  });

  it('role$ should emit new value after setRole', (done) => {
    service.setRole('manager');
    service.role$.subscribe((role) => {
      expect(role).toBe('manager');
      done();
    });
  });

  it('should switch back to ar-specialist', () => {
    service.setRole('manager');
    service.setRole('ar-specialist');
    expect(service.currentRole).toBe('ar-specialist');
  });
});
