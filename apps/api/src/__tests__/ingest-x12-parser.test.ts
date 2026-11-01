/**
 * X12 parser unit tests - pure functions, no mocks required.
 * Covers parse835(), parse837(), and edge cases.
 */

import { describe, it, expect } from '@jest/globals';
import { parse835, parse837 } from '../modules/edi-parser/x12-parser';

// -- X12 test fixtures ---------------------------------------------------------
// ISA must be exactly 106 chars: element-sep at [3], sub-elem-sep at [104], seg-term at [105].

// A minimal valid X12 835 (ERA/remittance)
const ISA_835 = 'ISA*00*          *00*          *ZZ*PAYER001       *ZZ*PAYEE001       *200101*1200*^*00501*000000001*0*P*:~';
const SAMPLE_835 = [
  ISA_835,
  'GS*HP*PAYER001*PAYEE001*20200101*1200*1*X*005010X221A1~',
  'ST*835*0001~',
  // BPR: seg[2]=amount, seg[4]=paymentMethod, seg[16]=effectiveDate
  'BPR*I*1500.00*C*ACH*CCP*01*111000025*DA*12345678***01*222333444*DA*99999999*20200115~',
  'TRN*1*T001*1222333444~',
  'N1*PR*Test Payer*XX*1234567890~',
  'N1*PE*Test Payee*XX*0987654321~',
  // CLP: seg[1]=claimId, seg[2]=status, seg[3]=charged, seg[4]=paid, seg[5]=patResp
  'CLP*CL50001*1*500.00*400.00*0.00*MC*999ABC~',
  // SVC: seg[1]=HC:proc, seg[2]=charged, seg[3]=paid
  'SVC*HC:99213*300.00*250.00~',
  // CAS: seg[1]=group, then triplets: carc, amount at i=2 (step 3)
  'CAS*CO*45*100.00~',
  'SE*10*0001~',
  'GE*1*1~',
  'IEA*1*000000001~',
].join('');

// A minimal valid X12 835 with no claims (BPR only)
const SAMPLE_835_NO_CLAIMS = [
  ISA_835,
  'GS*HP*PAYER001*PAYEE001*20200101*1200*1*X*005010X221A1~',
  'ST*835*0001~',
  'BPR*I*500.00*C*ACH*CCP*01*111000025*DA*12345678**01*222333444*DA*99999999*20200115~',
  'TRN*1*T002*1222333444~',
  'N1*PR*Test Payer*XX*1234567890~',
  'SE*7*0001~',
  'GE*1*1~',
  'IEA*1*000000001~',
].join('');

// A minimal valid X12 835 where SVC has no CAS (no adjustments)
const SAMPLE_835_NO_CAS = [
  ISA_835,
  'GS*HP*PAYER001*PAYEE001*20200101*1200*1*X*005010X221A1~',
  'ST*835*0001~',
  'BPR*I*400.00*C*ACH*CCP*01*111000025*DA*12345678**01*222333444*DA*99999999*20200115~',
  'TRN*1*T003*1222333444~',
  'N1*PR*Test Payer 2*XX*1234567890~',
  'CLP*CL50002*1*400.00*400.00*0.00*MC*999ABC~',
  'SVC*HC:99214*400.00*400.00~',
  'SE*9*0001~',
  'GE*1*1~',
  'IEA*1*000000001~',
].join('');

// A minimal valid X12 837P (professional claim)
const ISA_837 = 'ISA*00*          *00*          *ZZ*PROVIDER001    *ZZ*PAYER001       *200101*1200*^*00501*000000002*0*P*:~';
const SAMPLE_837 = [
  ISA_837,
  'GS*HC*PROVIDER001*PAYER001*20200101*1200*1*X*005010X222A1~',
  'ST*837*0001~',
  'BHT*0019*00*7216*20200101*1200*CH~',
  // NM1*85 = billing provider; seg[9] = NPI
  'NM1*85*2*Test Provider*****XX*1234567890~',
  // NM1*IL = subscriber; seg[3]=last, seg[4]=first, seg[9]=memberId
  'NM1*IL*1*DOE*JOHN****MI*S123~',
  // NM1*PR = payer
  'NM1*PR*2*Test Payer*****PI*PAYER001~',
  // CLM: seg[1]=claimId, seg[2]=totalCharge
  'CLM*CL60001*500.00***11:B:1*Y*A*Y*I~',
  // DTP*472 = date of service
  'DTP*472*D8*20200101~',
  // HI = diagnosis codes (ABK:primary, ABF:additional)
  'HI*ABK:Z34*ABF:A09~',
  // SV1: seg[1]=HC:proc, seg[2]=charge, seg[4]=units
  'SV1*HC:99213*150.00*UN*1***1~',
  'SE*12*0001~',
  'GE*1*1~',
  'IEA*1*000000002~',
].join('');

// 837 with no HI segment
const SAMPLE_837_NO_HI = [
  ISA_837,
  'GS*HC*PROVIDER001*PAYER001*20200101*1200*1*X*005010X222A1~',
  'ST*837*0001~',
  'NM1*IL*1*SMITH*JANE****MI*S456~',
  'CLM*CL60002*200.00***11:B:1*Y*A*Y*I~',
  'DTP*472*D8*20200201~',
  'SV1*HC:99212*200.00*UN*1***1~',
  'SE*8*0001~',
  'GE*1*1~',
  'IEA*1*000000002~',
].join('');

// -- parse835 tests ------------------------------------------------------------

describe('parse835()', () => {
  it('parses payment method and amount from BPR segment', () => {
    const result = parse835(SAMPLE_835);
    expect(result.paymentMethod).toBe('ACH');
    expect(result.paymentAmount).toBe(1500);
  });

  it('parses EFT trace number from TRN*1', () => {
    const result = parse835(SAMPLE_835);
    expect(result.eftTrace).toBe('T001');
  });

  it('parses payment date from BPR element 16', () => {
    const result = parse835(SAMPLE_835);
    expect(result.paymentDate).toBe('2020-01-15');
  });

  it('parses payer name from N1*PR', () => {
    const result = parse835(SAMPLE_835);
    expect(result.payerName).toBe('Test Payer');
  });

  it('parses claim ID, status, charged and paid amounts from CLP', () => {
    const result = parse835(SAMPLE_835);
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].claimId).toBe('CL50001');
    expect(result.claims[0].claimStatus).toBe('1');
    expect(result.claims[0].chargedAmount).toBe(500);
    expect(result.claims[0].paidAmount).toBe(400);
    expect(result.claims[0].patientResponsibility).toBe(0);
  });

  it('parses service line procedure code, charged and paid from SVC', () => {
    const result = parse835(SAMPLE_835);
    const svc = result.claims[0].serviceLines[0];
    expect(svc.procedureCode).toBe('99213');
    expect(svc.chargedAmount).toBe(300);
    expect(svc.paidAmount).toBe(250);
  });

  it('parses CAS adjustment code, group, and amount', () => {
    const result = parse835(SAMPLE_835);
    const adj = result.claims[0].serviceLines[0].adjCodes[0];
    expect(adj.group).toBe('CO');
    expect(adj.carc).toBe('45');
    expect(adj.amount).toBe(100);
  });

  it('returns empty claims array when no CLP segments present', () => {
    const result = parse835(SAMPLE_835_NO_CLAIMS);
    expect(result.claims).toHaveLength(0);
    expect(result.paymentAmount).toBe(500);
    expect(result.eftTrace).toBe('T002');
  });

  it('returns empty adjCodes array when no CAS segment follows SVC', () => {
    const result = parse835(SAMPLE_835_NO_CAS);
    expect(result.claims[0].serviceLines[0].adjCodes).toHaveLength(0);
  });

  it('does not crash when DTM segment is absent (paymentDate may be empty)', () => {
    // SAMPLE_835_NO_CLAIMS has BPR with a date at element 16 - this verifies no-crash
    expect(() => parse835(SAMPLE_835_NO_CLAIMS)).not.toThrow();
  });

  it('throws on input that is not a valid X12 document', () => {
    expect(() => parse835('not a valid x12 string')).toThrow();
  });

  it('sets checkNumber (not eftTrace) for CHK payment method', () => {
    // Build a CHECK 835
    const checkIsa = ISA_835;
    const check835 = [
      checkIsa,
      'GS*HP*PAYER001*PAYEE001*20200101*1200*1*X*005010X221A1~',
      'ST*835*0001~',
      'BPR*I*800.00*C*CHK*CCP*01*111000025*DA*12345678**01*222333444*DA*99999999*20200115~',
      'TRN*1*CHECK99*1222333444~',
      'N1*PR*Check Payer*XX*1234567890~',
      'SE*6*0001~',
      'GE*1*1~',
      'IEA*1*000000001~',
    ].join('');
    const result = parse835(check835);
    expect(result.checkNumber).toBe('CHECK99');
    expect(result.eftTrace).toBeUndefined();
  });
});

// -- parse837 tests ------------------------------------------------------------

describe('parse837()', () => {
  it('parses subscriber ID from NM1*IL element 9', () => {
    const result = parse837(SAMPLE_837);
    expect(result.subscriber.id).toBe('S123');
    expect(result.subscriber.firstName).toBe('JOHN');
    expect(result.subscriber.lastName).toBe('DOE');
  });

  it('parses claim ID and total charge from CLM', () => {
    const result = parse837(SAMPLE_837);
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].claimId).toBe('CL60001');
    expect(result.claims[0].totalCharge).toBe(500);
  });

  it('parses date of service from DTP*472', () => {
    const result = parse837(SAMPLE_837);
    expect(result.claims[0].dateOfService).toBe('2020-01-01');
  });

  it('parses diagnosis codes from HI segment', () => {
    const result = parse837(SAMPLE_837);
    expect(result.claims[0].diagnosisCodes).toContain('Z34');
    expect(result.claims[0].diagnosisCodes).toContain('A09');
  });

  it('parses service line procedure code, charge, and units from SV1', () => {
    const result = parse837(SAMPLE_837);
    const svc = result.claims[0].serviceLines[0];
    expect(svc.procedureCode).toBe('99213');
    expect(svc.charge).toBe(150);
    expect(svc.units).toBe(1);
  });

  it('parses payer name and ID from NM1*PR', () => {
    const result = parse837(SAMPLE_837);
    expect(result.payer.name).toBe('Test Payer');
    expect(result.payer.id).toBe('PAYER001');
  });

  it('parses provider NPI from NM1*85', () => {
    const result = parse837(SAMPLE_837);
    expect(result.providerNpi).toBe('1234567890');
  });

  it('returns empty diagnosisCodes array when no HI segment present', () => {
    const result = parse837(SAMPLE_837_NO_HI);
    expect(result.claims[0].diagnosisCodes).toHaveLength(0);
  });

  it('does not crash on 837 with no patient NM1*QC segment', () => {
    expect(() => parse837(SAMPLE_837)).not.toThrow();
    const result = parse837(SAMPLE_837);
    expect(result.patient).toBeUndefined();
  });

  it('throws on invalid X12 input', () => {
    expect(() => parse837('garbage input')).toThrow();
  });
});
