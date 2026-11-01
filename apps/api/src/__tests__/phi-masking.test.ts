/**
 * Unit Test - PHI Masking
 *
 * Tests that PHI fields are masked for User role but fully visible for Admin.
 *
 * Run: npm test -- --testPathPattern=phi-masking
 */
import { describe, it, expect } from '@jest/globals';
import { maskRecord, getRoleLevel } from '../middleware/data-masking';

describe('PHI Masking', () => {
  const record = {
    FName: 'Jane',
    LName: 'Doe',
    dob: '1985-03-15',
    SSN: '123-45-6789',
    Phone: '555-123-4567',
    subscriber_id: 'SUB1234567',
    Email: 'jane@test.com',
  };

  it('masks DOB for User role (level 0)', () => {
    const level = getRoleLevel('User');
    expect(level).toBe(0);
    const masked = maskRecord(record, level);
    expect(masked.dob).toBe('**/**/****');
  });

  it('masks SSN for User role \u2014 shows last 4', () => {
    const level = getRoleLevel('User');
    const masked = maskRecord(record, level);
    expect(masked.SSN).toBe('***-**-6789');
  });

  it('masks subscriber_id for User role', () => {
    const level = getRoleLevel('User');
    const masked = maskRecord(record, level);
    expect(masked.subscriber_id).toContain('****');
    expect(masked.subscriber_id).toContain('4567');
  });

  it('does NOT mask name or email', () => {
    const level = getRoleLevel('User');
    const masked = maskRecord(record, level);
    expect(masked.FName).toBe('Jane');
    expect(masked.LName).toBe('Doe');
    expect(masked.Email).toBe('jane@test.com');
  });

  it('shows DOB for AR Specialist role (level 1)', () => {
    const level = getRoleLevel('AR Specialist');
    expect(level).toBe(1);
    const masked = maskRecord(record, level);
    // DOB visible at level 1+ (visibleAbove = 1)
    expect(masked.dob).toBe('1985-03-15');
  });

  it('masks SSN for AR Specialist role', () => {
    const level = getRoleLevel('AR Specialist');
    const masked = maskRecord(record, level);
    expect(masked.SSN).toBe('***-**-6789');
  });

  it('shows full data for Admin role (level 4)', () => {
    const level = getRoleLevel('Admin');
    expect(level).toBe(4);
    const masked = maskRecord(record, level);
    expect(masked.dob).toBe('1985-03-15');
    expect(masked.SSN).toBe('123-45-6789');
    expect(masked.subscriber_id).toBe('SUB1234567');
  });

  it('shows full data for Super Admin role (level 5)', () => {
    const level = getRoleLevel('Super Admin');
    expect(level).toBe(5);
    const masked = maskRecord(record, level);
    expect(masked.dob).toBe('1985-03-15');
    expect(masked.SSN).toBe('123-45-6789');
  });

  it('returns level 0 for unknown role', () => {
    const level = getRoleLevel('Unknown');
    expect(level).toBe(0);
  });
});
