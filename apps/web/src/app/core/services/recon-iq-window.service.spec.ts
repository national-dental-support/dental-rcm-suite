import { TestBed } from '@angular/core/testing';
import { ReconIqWindowService } from './recon-iq-window.service';

describe('ReconIqWindowService', () => {
  let service: ReconIqWindowService;
  let mockWindow: any;
  let openSpy: jasmine.Spy;

  beforeEach(() => {
    mockWindow = {
      closed: false,
      document: {
        open: jasmine.createSpy('open'),
        write: jasmine.createSpy('write'),
        close: jasmine.createSpy('close'),
        title: '',
      },
      focus: jasmine.createSpy('focus'),
      moveTo: jasmine.createSpy('moveTo'),
      resizeTo: jasmine.createSpy('resizeTo'),
      screenX: 100,
      screenY: 100,
    };

    openSpy = spyOn(window, 'open').and.returnValue(mockWindow);

    TestBed.configureTestingModule({});
    service = TestBed.inject(ReconIqWindowService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // --- open ---
  it('open should call window.open and render content', () => {
    const result = service.open('claims', 'Test Title', '<p>Body</p>');
    expect(openSpy).toHaveBeenCalled();
    expect(mockWindow.document.write).toHaveBeenCalled();
    expect(result).toBeTruthy();
  });

  it('open should return null if window.open returns null', () => {
    openSpy.and.returnValue(null);
    const result = service.open('claims', 'Test', '<p>x</p>');
    expect(result).toBeNull();
  });

  it('open should reuse existing window if not closed', () => {
    service.open('claims', 'First', '<p>1</p>');
    openSpy.calls.reset();
    mockWindow.document.write.calls.reset();

    service.open('claims', 'Second', '<p>2</p>');
    expect(openSpy).not.toHaveBeenCalled();
    expect(mockWindow.focus).toHaveBeenCalled();
    expect(mockWindow.document.write).toHaveBeenCalled();
  });

  it('open should reopen if existing window is closed', () => {
    service.open('claims', 'First', '<p>1</p>');
    mockWindow.closed = true;
    openSpy.calls.reset();

    const newMock = { ...mockWindow, closed: false, document: { ...mockWindow.document, write: jasmine.createSpy('write'), open: jasmine.createSpy('open'), close: jasmine.createSpy('close') } };
    openSpy.and.returnValue(newMock);
    service.open('claims', 'Reopened', '<p>2</p>');
    expect(openSpy).toHaveBeenCalled();
  });

  // --- openEncounterWindows ---
  it('openEncounterWindows should open two windows', () => {
    service.openEncounterWindows({ patientAccount: 'PA001', paymentId: 'PMT001' });
    expect(openSpy.calls.count()).toBeGreaterThanOrEqual(2);
  });

  it('openEncounterWindows should handle blocked popups', () => {
    openSpy.and.returnValue(null);
    expect(() => service.openEncounterWindows({ patientAccount: 'PA001', paymentId: 'PMT001' })).not.toThrow();
  });

  // --- openClaimsWindow ---
  it('openClaimsWindow should open a claims window', () => {
    service.openClaimsWindow({ patientAccount: 'PA001', paymentId: 'PMT001', claimId: 'CL001' });
    expect(openSpy).toHaveBeenCalled();
    expect(mockWindow.document.write).toHaveBeenCalled();
    const content = mockWindow.document.write.calls.mostRecent().args[0];
    expect(content).toContain('Claim Viewer');
  });

  it('openClaimsWindow should handle null window', () => {
    openSpy.and.returnValue(null);
    expect(() => service.openClaimsWindow({ patientAccount: 'PA001', paymentId: 'PMT001' })).not.toThrow();
  });

  // --- openPaymentWindow ---
  it('openPaymentWindow should open a payment window', () => {
    service.openPaymentWindow({ paymentId: 'PMT001', referenceId: 'REF001', date: '2025-01-01', payer: 'Aetna', type: 'Check', amount: '$500' });
    expect(mockWindow.document.write).toHaveBeenCalled();
    const content = mockWindow.document.write.calls.mostRecent().args[0];
    expect(content).toContain('Payment Viewer');
  });

  // --- openEobWindow ---
  it('openEobWindow should open an EOB window', () => {
    service.openEobWindow({ eobId: 'EOB001', referenceId: 'REF001', date: '2025-01-01', payer: 'Aetna', type: 'EOB', amount: '$500' });
    expect(mockWindow.document.write).toHaveBeenCalled();
    const content = mockWindow.document.write.calls.mostRecent().args[0];
    expect(content).toContain('EOB Viewer');
  });

  // --- openReconciliationWindow ---
  it('openReconciliationWindow should open an EOB window', () => {
    service.openReconciliationWindow({ eobId: 'EOB001', amount: '$1000', location: 'Office A' });
    expect(mockWindow.document.write).toHaveBeenCalled();
  });

  // --- updateEobPdf ---
  it('updateEobPdf should update existing EOB window with iframe', () => {
    service.open('eob', 'EOB', '<p>initial</p>');
    mockWindow.document.write.calls.reset();

    service.updateEobPdf('Updated EOB', 'https://example.com/eob.pdf');
    expect(mockWindow.document.write).toHaveBeenCalled();
    const content = mockWindow.document.write.calls.mostRecent().args[0];
    expect(content).toContain('iframe');
  });

  it('updateEobPdf should handle closed/missing window', () => {
    openSpy.and.returnValue(null);
    expect(() => service.updateEobPdf('Title', 'url')).not.toThrow();
  });

  // --- XSS escape ---
  it('should escape HTML characters in rendered content', () => {
    service.openClaimsWindow({ patientAccount: '<script>alert(1)</script>', paymentId: 'PMT' });
    const content = mockWindow.document.write.calls.mostRecent().args[0];
    expect(content).not.toContain('<script>');
    expect(content).toContain('&lt;script&gt;');
  });

  it('should escape > character in rendered content', () => {
    service.openClaimsWindow({ patientAccount: 'A>B', paymentId: 'PMT' });
    const content = mockWindow.document.write.calls.mostRecent().args[0];
    expect(content).toContain('&gt;');
  });

  it('should escape & character in rendered content', () => {
    service.openClaimsWindow({ patientAccount: 'A&B', paymentId: 'PMT' });
    const content = mockWindow.document.write.calls.mostRecent().args[0];
    expect(content).toContain('&amp;');
  });

  it('should escape " character in rendered content', () => {
    service.openClaimsWindow({ patientAccount: 'A"B', paymentId: 'PMT' });
    const content = mockWindow.document.write.calls.mostRecent().args[0];
    expect(content).toContain('&quot;');
  });

  it('should escape single quote in rendered content', () => {
    service.openClaimsWindow({ patientAccount: "A'B", paymentId: 'PMT' });
    const content = mockWindow.document.write.calls.mostRecent().args[0];
    expect(content).toContain('&#39;');
  });

  it('open should work with cms1500 kind', () => {
    const result = service.open('cms1500', 'CMS1500', '<p>body</p>');
    expect(openSpy).toHaveBeenCalled();
    expect(result).toBeTruthy();
  });

  it('open should work with eob kind', () => {
    const result = service.open('eob', 'EOB Title', '<p>body</p>');
    expect(openSpy).toHaveBeenCalled();
    expect(result).toBeTruthy();
  });

  it('open should use custom features when provided', () => {
    service.open('claims', 'Title', '<p>body</p>', 'width=800,height=600');
    const call = openSpy.calls.mostRecent().args;
    expect(call[2]).toBe('width=800,height=600');
  });

  it('openEncounterWindows should pass null window gracefully', () => {
    openSpy.and.returnValue(null);
    expect(() => service.openEncounterWindows({ patientAccount: 'PA002', paymentId: 'PMT002' })).not.toThrow();
  });

  it('openClaimsWindow with claimId should include it in content', () => {
    service.openClaimsWindow({ patientAccount: 'PA001', paymentId: 'PMT001', claimId: 'CL001' });
    const content = mockWindow.document.write.calls.mostRecent().args[0];
    expect(content).toContain('CL001');
  });

  it('openPaymentWindow should handle null window', () => {
    openSpy.and.returnValue(null);
    expect(() => service.openPaymentWindow({ paymentId: 'PMT001', referenceId: 'REF001', date: '2025-01-01', payer: 'Aetna', type: 'Check', amount: '$500' })).not.toThrow();
  });

  it('openEobWindow should handle null window', () => {
    openSpy.and.returnValue(null);
    expect(() => service.openEobWindow({ eobId: 'EOB001', referenceId: 'REF001', date: '2025-01-01', payer: 'Aetna', type: 'EOB', amount: '$500' })).not.toThrow();
  });

  it('openReconciliationWindow should handle null window', () => {
    openSpy.and.returnValue(null);
    expect(() => service.openReconciliationWindow({ eobId: 'EOB001', amount: '$1000', location: 'Office A' })).not.toThrow();
  });

  it('updateEobPdf should be no-op when eob window is closed', () => {
    service.open('eob', 'EOB', '<p>initial</p>');
    mockWindow.closed = true;
    expect(() => service.updateEobPdf('New Title', 'https://url.com/eob.pdf')).not.toThrow();
  });

  // -- openPaymentWindow: null/undefined optional fields ----------------

  it('openPaymentWindow should use fallback em-dash when amount is missing', () => {
    service.openPaymentWindow({ paymentId: 'PMT001', referenceId: 'REF001' });
    const content = mockWindow.document.write.calls.mostRecent().args[0];
    expect(content).toContain('\u2014');
  });

  it('openPaymentWindow should use "Unknown Payer" when payer is missing', () => {
    service.openPaymentWindow({ paymentId: 'PMT001', referenceId: 'REF001' });
    const content = mockWindow.document.write.calls.mostRecent().args[0];
    expect(content).toContain('Unknown');
  });

  it('openPaymentWindow should use "Payment" as typeLabel when type is missing', () => {
    service.openPaymentWindow({ paymentId: 'PMT001', referenceId: 'REF001' });
    const content = mockWindow.document.write.calls.mostRecent().args[0];
    // type defaults to 'Payment'
    expect(content).toContain('PAYMENT');
  });

  it('openPaymentWindow should use EFT styling when type is EFT', () => {
    service.openPaymentWindow({ paymentId: 'PMT001', referenceId: 'REF001', type: 'EFT', amount: '$1000' });
    const content = mockWindow.document.write.calls.mostRecent().args[0];
    expect(content).toContain('EFT');
    expect(content).toContain('\u26A1');
  });

  it('openPaymentWindow should use Check styling when type is Check', () => {
    service.openPaymentWindow({ paymentId: 'PMT001', referenceId: 'REF001', type: 'Check', amount: '$200' });
    const content = mockWindow.document.write.calls.mostRecent().args[0];
    expect(content).toContain('CHECK');
    expect(content).toContain('\uD83C\uDFE6');
  });

  it('openPaymentWindow should use "Unknown" payer fallback', () => {
    service.openPaymentWindow({ paymentId: 'PMT001', referenceId: 'REF001', payer: undefined });
    const content = mockWindow.document.write.calls.mostRecent().args[0];
    // payer ?? 'Unknown'
    expect(content).toContain('Unknown');
  });

  it('openPaymentWindow should include date when provided', () => {
    service.openPaymentWindow({ paymentId: 'PMT001', referenceId: 'REF001', date: '2025-03-15', payer: 'BCBS' });
    const content = mockWindow.document.write.calls.mostRecent().args[0];
    expect(content).toContain('2025-03-15');
    expect(content).toContain('BCBS');
  });

  // -- openEobWindow: null/undefined optional fields --------------------

  it('openEobWindow should use fallback em-dash when amount is missing', () => {
    service.openEobWindow({ eobId: 'EOB001' });
    const content = mockWindow.document.write.calls.mostRecent().args[0];
    expect(content).toContain('\u2014');
  });

  it('openEobWindow should use "Unknown Payer" when payer is missing', () => {
    service.openEobWindow({ eobId: 'EOB001' });
    const content = mockWindow.document.write.calls.mostRecent().args[0];
    expect(content).toContain('Unknown Payer');
  });

  it('openEobWindow should use ERA type for ERA type', () => {
    service.openEobWindow({ eobId: 'EOB001', type: 'ERA', payer: 'Aetna', amount: '$500' });
    const content = mockWindow.document.write.calls.mostRecent().args[0];
    expect(content).toContain('ERA');
    expect(content).toContain('Electronic Remittance Advice');
  });

  it('openEobWindow should use ERA type when eobId starts with RMF', () => {
    service.openEobWindow({ eobId: 'RMF001', payer: 'Aetna', amount: '$500' });
    const content = mockWindow.document.write.calls.mostRecent().args[0];
    expect(content).toContain('ERA');
  });

  it('openEobWindow should use EOB type by default', () => {
    service.openEobWindow({ eobId: 'EOB001', type: 'EOB', payer: 'Aetna', amount: '$500' });
    const content = mockWindow.document.write.calls.mostRecent().args[0];
    expect(content).toContain('EOB');
    expect(content).toContain('Explanation of Benefits');
  });

  it('openEobWindow should include date and referenceId when provided', () => {
    service.openEobWindow({ eobId: 'EOB001', referenceId: 'REF999', date: '2025-06-01', payer: 'BCBS', amount: '$300' });
    const content = mockWindow.document.write.calls.mostRecent().args[0];
    expect(content).toContain('2025-06-01');
    expect(content).toContain('BCBS');
    expect(content).toContain('REF999');
  });

  // -- escape: edge cases ---------------------------------------------

  it('escape should handle null/undefined (via ??"")', () => {
    // Call escape indirectly by passing null fields to a window renderer
    service.openEobWindow({ eobId: 'EOB001', amount: undefined, payer: undefined, date: undefined });
    // Should not throw and content should contain escaped fallbacks
    expect(mockWindow.document.write).toHaveBeenCalled();
  });

  // -- updateEobPdf: reopen path (closed then reopen succeeds) --------

  it('updateEobPdf should reopen and render when EOB ref is closed', () => {
    // First, open EOB window
    service.open('eob', 'EOB', '<p>initial</p>');
    mockWindow.closed = true;

    // When reopen, return a new working window
    const newWindow = {
      closed: false,
      document: {
        open: jasmine.createSpy('open'),
        write: jasmine.createSpy('write'),
        close: jasmine.createSpy('close'),
        title: '',
      },
      focus: jasmine.createSpy('focus'),
      moveTo: jasmine.createSpy('moveTo'),
      resizeTo: jasmine.createSpy('resizeTo'),
    };
    openSpy.and.returnValue(newWindow);

    service.updateEobPdf('Reopened EOB', 'https://example.com/eob.pdf');
    expect(newWindow.document.write).toHaveBeenCalled();
    const content = newWindow.document.write.calls.mostRecent().args[0];
    expect(content).toContain('iframe');
  });

  // -- openEncounterWindows: both windows open with overlap detection --

  it('openEncounterWindows should handle overlapping windows (same screenX/screenY)', () => {
    const w1 = { ...mockWindow, screenX: 100, screenY: 100 };
    const w2 = { ...mockWindow, screenX: 100, screenY: 100 };  // same position = overlap
    let callCount = 0;
    openSpy.and.callFake(() => callCount++ === 0 ? w1 : w2);

    expect(() => service.openEncounterWindows({ patientAccount: 'PA001', paymentId: 'PMT001' })).not.toThrow();
  });

  it('openEncounterWindows should not throw when only first window opens', () => {
    let callCount = 0;
    openSpy.and.callFake(() => callCount++ === 0 ? mockWindow : null);
    expect(() => service.openEncounterWindows({ patientAccount: 'PA001', paymentId: 'PMT001' })).not.toThrow();
  });

  // -- openReconciliationWindow with missing optional fields ------------

  it('openReconciliationWindow should handle missing optional fields', () => {
    service.openReconciliationWindow({ eobId: 'EOB001' } as any);
    expect(mockWindow.document.write).toHaveBeenCalled();
  });
});
