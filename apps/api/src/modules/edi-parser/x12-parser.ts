/**
 * Full X12 segment-level parser for 835 (ERA/remittance) and 837P (professional claim).
 * Splits on the segment terminator detected from the ISA envelope, then walks each
 * segment by ID - no regex shortcuts.
 */

export interface Parsed835Claim {
  claimId: string;
  claimStatus: string;       // '1'=paid, '2'=$0, '4'=denied
  chargedAmount: number;
  paidAmount: number;
  patientResponsibility: number;
  serviceLines: Array<{
    procedureCode: string;
    chargedAmount: number;
    paidAmount: number;
    adjCodes: Array<{ group: string; carc: string; amount: number }>;
  }>;
}

export interface Parsed835 {
  paymentMethod: string;     // 'EFT'|'CHECK'|other
  paymentAmount: number;
  paymentDate: string;       // ISO date YYYY-MM-DD
  eftTrace?: string;
  checkNumber?: string;
  payerName: string;
  payeeTaxId?: string;
  claims: Parsed835Claim[];
}

export interface Parsed837Claim {
  claimId: string;
  totalCharge: number;
  dateOfService: string;
  facilityType?: string;
  diagnosisCodes: string[];
  serviceLines: Array<{
    procedureCode: string;
    charge: number;
    units: number;
  }>;
}

export interface Parsed837 {
  providerId?: string;
  providerNpi?: string;
  providerTaxId?: string;
  subscriber: { id: string; firstName: string; lastName: string; dob: string };
  patient?: { firstName: string; lastName: string; dob: string };
  payer: { id: string; name: string };
  claims: Parsed837Claim[];
}

// -- Shared utilities ---------------------------------------------------------

function toDate(x12Date: string): string {
  // CCYYMMDD -> YYYY-MM-DD
  if (!x12Date || x12Date.length < 8) return x12Date ?? '';
  return `${x12Date.slice(0, 4)}-${x12Date.slice(4, 6)}-${x12Date.slice(6, 8)}`;
}

function toNum(s: string | undefined): number {
  return parseFloat(s ?? '0') || 0;
}

/**
 * Split an X12 document into segments.  Detects the element separator (char 3),
 * component separator (char 104), and segment terminator (char 105) from the
 * ISA envelope per the spec, so files with non-standard terminators are handled.
 */
function splitSegments(raw: string): { segs: string[][]; elSep: string } {
  const clean = raw.replace(/\r?\n/g, '');
  if (!clean.startsWith('ISA')) throw new Error('Not a valid X12 document \u2014 missing ISA');
  const elSep = clean[3];
  const segTerm = clean[105];
  const segments = clean.split(segTerm).map(s => s.trim()).filter(Boolean);
  return { segs: segments.map(s => s.split(elSep)), elSep };
}

// -- 835 parser ---------------------------------------------------------------

export function parse835(raw: string): Parsed835 {
  const { segs } = splitSegments(raw);

  const result: Parsed835 = {
    paymentMethod: '',
    paymentAmount: 0,
    paymentDate: '',
    payerName: '',
    claims: [],
  };

  let currentClaim: Parsed835Claim | null = null;
  let currentSvc: Parsed835Claim['serviceLines'][0] | null = null;

  for (const seg of segs) {
    const id = seg[0];

    if (id === 'BPR') {
      // BPR*I/C*amount*C/D*payment-method*...*trace*...*eff-date
      result.paymentMethod = seg[4] ?? '';
      result.paymentAmount = toNum(seg[2]);
      // effective date is element 16 (BPR16)
      result.paymentDate = toDate(seg[16] ?? '');
    } else if (id === 'TRN') {
      // TRN*1*trace-number
      if (seg[1] === '1') {
        result.eftTrace = seg[2];
      }
    } else if (id === 'N1') {
      if (seg[1] === 'PR') result.payerName = seg[2] ?? '';
      if (seg[1] === 'PE' && seg[4]) result.payeeTaxId = seg[4];
    } else if (id === 'CLP') {
      // Flush previous service line
      if (currentSvc && currentClaim) currentClaim.serviceLines.push(currentSvc);
      currentSvc = null;
      // Flush previous claim
      if (currentClaim) result.claims.push(currentClaim);
      currentClaim = {
        claimId: seg[1] ?? '',
        claimStatus: seg[2] ?? '',
        chargedAmount: toNum(seg[3]),
        paidAmount: toNum(seg[4]),
        patientResponsibility: toNum(seg[5]),
        serviceLines: [],
      };
    } else if (id === 'SVC' && currentClaim) {
      if (currentSvc) currentClaim.serviceLines.push(currentSvc);
      // SVC*HC:proc*charged*paid
      const procRaw = seg[1] ?? '';
      const proc = procRaw.includes(':') ? procRaw.split(':')[1] : procRaw;
      currentSvc = {
        procedureCode: proc,
        chargedAmount: toNum(seg[2]),
        paidAmount: toNum(seg[3]),
        adjCodes: [],
      };
    } else if (id === 'CAS' && currentSvc) {
      // CAS*group*reason*amount[*qty*reason*amount...] (triplets starting at element 2)
      for (let i = 2; i + 1 < seg.length; i += 3) {
        const carc = seg[i];
        const amt  = toNum(seg[i + 1]);
        if (carc) currentSvc.adjCodes.push({ group: seg[1] ?? '', carc, amount: amt });
      }
    }
  }

  // Flush last open objects
  if (currentSvc && currentClaim) currentClaim.serviceLines.push(currentSvc);
  if (currentClaim) result.claims.push(currentClaim);

  // Derive check number from payment method + trace
  if (['CHK', 'CHC', 'NON'].includes(result.paymentMethod) && result.eftTrace) {
    result.checkNumber = result.eftTrace;
    delete result.eftTrace;
  }

  return result;
}

// -- 837P parser --------------------------------------------------------------

export function parse837(raw: string): Parsed837 {
  const { segs } = splitSegments(raw);

  const result: Parsed837 = {
    subscriber: { id: '', firstName: '', lastName: '', dob: '' },
    payer: { id: '', name: '' },
    claims: [],
  };

  let currentClaim: Parsed837Claim | null = null;

  for (const seg of segs) {
    const id = seg[0];

    if (id === 'NM1') {
      const qual = seg[1];
      if (qual === '85') {
        // Billing provider
        result.providerId = seg[9] ?? '';
        result.providerNpi = seg[9] ?? '';
      } else if (qual === 'IL') {
        // Subscriber
        result.subscriber.lastName  = seg[3] ?? '';
        result.subscriber.firstName = seg[4] ?? '';
        result.subscriber.id        = seg[9] ?? '';
      } else if (qual === 'QC') {
        // Patient (if different from subscriber)
        result.patient = {
          lastName:  seg[3] ?? '',
          firstName: seg[4] ?? '',
          dob:       '',
        };
      } else if (qual === 'PR') {
        result.payer.name = seg[3] ?? '';
        result.payer.id   = seg[9] ?? '';
      }
    } else if (id === 'REF' && seg[1] === 'EI' && !result.providerTaxId) {
      result.providerTaxId = seg[2];
    } else if (id === 'DMG') {
      // DMG*D8*CCYYMMDD*gender
      const dob = toDate(seg[2] ?? '');
      if (result.patient) result.patient.dob = dob;
      else result.subscriber.dob = dob;
    } else if (id === 'CLM') {
      if (currentClaim) result.claims.push(currentClaim);
      currentClaim = {
        claimId:        seg[1] ?? '',
        totalCharge:    toNum(seg[2]),
        dateOfService:  '',
        facilityType:   seg[5]?.split(':')[0],
        diagnosisCodes: [],
        serviceLines:   [],
      };
    } else if (id === 'DTP' && seg[1] === '472' && currentClaim) {
      currentClaim.dateOfService = toDate(seg[3] ?? '');
    } else if (id === 'HI' && currentClaim) {
      // HI*ABK:code*ABF:code2...
      for (let i = 1; i < seg.length; i++) {
        const parts = seg[i].split(':');
        if (parts[1]) currentClaim.diagnosisCodes.push(parts[1]);
      }
    } else if (id === 'SV1' && currentClaim) {
      // SV1*HC:proc*charge*UN*units
      const procRaw = seg[1] ?? '';
      const proc = procRaw.includes(':') ? procRaw.split(':')[1] : procRaw;
      currentClaim.serviceLines.push({
        procedureCode: proc,
        charge:        toNum(seg[2]),
        units:         parseInt(seg[4] ?? '1') || 1,
      });
    }
  }

  if (currentClaim) result.claims.push(currentClaim);
  return result;
}
