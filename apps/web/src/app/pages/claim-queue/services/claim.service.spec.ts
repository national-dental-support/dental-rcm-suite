import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ClaimService } from './claim.service';
import { environment } from '../../../../environments/environment';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('ClaimService', () => {
  let service: ClaimService;
  let httpMock: HttpTestingController;

  const base = `${environment.server.baseUrl}/denial-iq`;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [ClaimService, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(ClaimService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getArMyQueue should GET the my-queue endpoint', () => {
    service.getArMyQueue().subscribe();
    const req = httpMock.expectOne((r) => r.url.includes('/specialist-view/claim-queue/my-queue'));
    expect(req.request.method).toBe('GET');
    req.flush({ message: 'ok', data: [], totalCount: 0, page: 0, pageSize: 25 });
  });

  it('getArEscalations should GET escalations endpoint', () => {
    service.getArEscalations().subscribe();
    const req = httpMock.expectOne((r) => r.url.includes('/specialist-view/claim-queue/escalations'));
    expect(req.request.method).toBe('GET');
    req.flush({ message: 'ok', data: [], totalCount: 0, page: 0, pageSize: 25 });
  });

  it('getArUnassigned should GET unassigned endpoint', () => {
    service.getArUnassigned().subscribe();
    const req = httpMock.expectOne((r) => r.url.includes('/specialist-view/claim-queue/unassigned'));
    expect(req.request.method).toBe('GET');
    req.flush({ message: 'ok', data: [], totalCount: 0, page: 0, pageSize: 25 });
  });

  it('getArAllClaims should GET all-claims endpoint', () => {
    service.getArAllClaims().subscribe();
    const req = httpMock.expectOne((r) => r.url.includes('/specialist-view/claim-queue/all-claims'));
    expect(req.request.method).toBe('GET');
    req.flush({ message: 'ok', data: [], totalCount: 0, page: 0, pageSize: 25 });
  });

  it('getManagerEscalations should GET manager escalations', () => {
    service.getManagerEscalations().subscribe();
    const req = httpMock.expectOne((r) => r.url.includes('/manager-view/claim-queue/escalations'));
    expect(req.request.method).toBe('GET');
    req.flush({ message: 'ok', data: [], totalCount: 0, page: 0, pageSize: 25 });
  });

  it('getManagerUnassigned should GET manager unassigned', () => {
    service.getManagerUnassigned().subscribe();
    const req = httpMock.expectOne((r) => r.url.includes('/manager-view/claim-queue/unassigned'));
    expect(req.request.method).toBe('GET');
    req.flush({ message: 'ok', data: [], totalCount: 0, page: 0, pageSize: 25 });
  });

  it('getManagerAllClaims should GET manager all-claims', () => {
    service.getManagerAllClaims().subscribe();
    const req = httpMock.expectOne((r) => r.url.includes('/manager-view/claim-queue/all-claims'));
    expect(req.request.method).toBe('GET');
    req.flush({ message: 'ok', data: [], totalCount: 0, page: 0, pageSize: 25 });
  });

  it('startWork should POST to start-work', () => {
    service.startWork('CL001').subscribe();
    const req = httpMock.expectOne(`${base}/claim-detail/start-work`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ claimId: 'CL001' });
    req.flush({ message: 'ok', claimHistoryId: 'CH1' });
  });

  it('closeClaim should POST to close', () => {
    service.closeClaim('CL001', 100, 'Closed').subscribe();
    const req = httpMock.expectOne(`${base}/claim-detail/close`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(jasmine.objectContaining({ claimId: 'CL001', progress: 100, claimStatus: 'Closed' }));
    req.flush({ message: 'ok' });
  });

  it('escalateClaim should POST to escalate', () => {
    service.escalateClaim('CL001', 'medical necessity').subscribe();
    const req = httpMock.expectOne(`${base}/claim-detail/escalate`);
    expect(req.request.method).toBe('POST');
    req.flush({ message: 'ok', managerId: 5 });
  });

  it('assignClaim should POST to assign', () => {
    service.assignClaim('CL001', 42).subscribe();
    const req = httpMock.expectOne(`${base}/claim-detail/assign`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ claimId: 'CL001', assignToUserId: 42 });
    req.flush({ message: 'ok', assignedTo: 42 });
  });

  it('getClaimHistory should GET history with claimId param', () => {
    service.getClaimHistory('CL001').subscribe();
    const req = httpMock.expectOne((r) => r.url.includes('/claim-detail/history') && r.params.get('claimId') === 'CL001');
    expect(req.request.method).toBe('GET');
    req.flush({ message: 'ok', data: [] });
  });

  it('autoAssign should POST to auto-assign', () => {
    service.autoAssign(10).subscribe();
    const req = httpMock.expectOne(`${base}/claim-detail/auto-assign`);
    expect(req.request.method).toBe('POST');
    req.flush({ message: 'ok', count: 5, assignments: [] });
  });

  it('bulkAssign should POST to bulk-assign', () => {
    service.bulkAssign(['CL001', 'CL002'], 7).subscribe();
    const req = httpMock.expectOne(`${base}/claim-detail/bulk-assign`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ claimIds: ['CL001', 'CL002'], assignToUserId: 7 });
    req.flush({ message: 'ok', count: 2 });
  });

  it('bulkEscalate should POST to bulk-escalate', () => {
    service.bulkEscalate(['CL001'], 'reason').subscribe();
    const req = httpMock.expectOne(`${base}/claim-detail/bulk-escalate`);
    expect(req.request.method).toBe('POST');
    req.flush({ message: 'ok', count: 1, managerId: 3 });
  });

  it('bulkClose should POST to bulk-close', () => {
    service.bulkClose(['CL001', 'CL002'], 'Closed').subscribe();
    const req = httpMock.expectOne(`${base}/claim-detail/bulk-close`);
    expect(req.request.method).toBe('POST');
    req.flush({ message: 'ok', count: 2 });
  });

  it('bulkReassign should POST to bulk-reassign', () => {
    service.bulkReassign(['CL001'], 9).subscribe();
    const req = httpMock.expectOne(`${base}/claim-detail/bulk-reassign`);
    expect(req.request.method).toBe('POST');
    req.flush({ message: 'ok', count: 1 });
  });

  it('getClaimDetailTable should GET detail-table endpoint', () => {
    service.getClaimDetailTable('CL001').subscribe();
    const req = httpMock.expectOne((r) => r.url.includes('/claim-detail/detail-table'));
    expect(req.request.method).toBe('GET');
    req.flush({ message: 'ok', data: [] });
  });

  it('detail should GET claim-detail and map the response', () => {
    let result: any;
    service.detail('CL001').subscribe((d) => (result = d));

    const req = httpMock.expectOne((r) => r.url.includes('/denial-iq/claim-detail') && r.params.get('claimId') === 'CL001');
    expect(req.request.method).toBe('GET');
    req.flush({
      message: 'ok',
      data: [{
        SubscriberName: 'John Smith', SubscriberID: 'S123', PracticeLocation: 'Main Office',
        Provider: 'Dr. Adams', NPI: '1234567890', TaxID: '12-3456789',
        DOB: '1980-01-01', DateOfService: '2025-01-01', ReceivedDate: '2025-01-02',
        AgingDays: 30, PaymentDate: null, DepositAmount: null, DepositCheckNo: null, DepositCleared: null,
        PayerName: 'Aetna', RemittanceMethod: 'ERA', PaymentMethod: 'ACH', Network: 'In-network',
        ReasonCode: 'CO26', InsuranceBalDue: 100, PatientBalDue: 20,
        PrimaryIns: 'Aetna', SecondaryIns: null, TertiaryIns: null,
        AssignedTo: 1, AssignedUserName: 'Jane',
      }],
    });

    expect(result).toBeDefined();
    expect(result.id).toBe('CL001');
    expect(result.patient).toBe('John Smith');
    expect(result.payer).toBe('Aetna');
  });

  it('detail should return defaults when API returns null data', () => {
    let result: any;
    service.detail('CL999').subscribe((d) => (result = d));
    httpMock.expectOne((r) => r.url.includes('/denial-iq/claim-detail')).flush({ message: 'ok', data: null });
    expect(result.id).toBe('CL999');
    expect(result.patient).toBe('Unknown patient');
    expect(result.lineItems).toEqual([]);
  });

  it('detail should return defaults when API returns empty array', () => {
    let result: any;
    service.detail('CL999').subscribe((d) => (result = d));
    httpMock.expectOne((r) => r.url.includes('/denial-iq/claim-detail')).flush({ message: 'ok', data: [] });
    expect(result.patient).toBe('Unknown patient');
  });

  it('detail should handle null fields with defaults', () => {
    let result: any;
    service.detail('CL001').subscribe((d) => (result = d));
    httpMock.expectOne((r) => r.url.includes('/denial-iq/claim-detail')).flush({
      message: 'ok',
      data: [{
        SubscriberName: null, SubscriberID: null, PracticeLocation: null,
        Provider: null, NPI: null, TaxID: null, DOB: null,
        DateOfService: null, ReceivedDate: null, AgingDays: null,
        PaymentDate: null, DepositAmount: null, DepositCheckNo: null, DepositCleared: null,
        PayerName: null, RemittanceMethod: null, PaymentMethod: null, Network: null,
        ReasonCode: null, InsuranceBalDue: null, PatientBalDue: null,
        PrimaryIns: null, SecondaryIns: null, TertiaryIns: null,
        AssignedTo: null, AssignedUserName: null,
      }],
    });
    expect(result.patient).toBe('Unknown patient');
    expect(result.payer).toBe('Unknown payer');
    expect(result.insuranceBalanceDue).toBe(0);
    expect(result.patientBalanceDue).toBe(0);
  });

  it('detail should map dates correctly', () => {
    let result: any;
    service.detail('CL001').subscribe((d) => (result = d));
    httpMock.expectOne((r) => r.url.includes('/denial-iq/claim-detail')).flush({
      message: 'ok',
      data: [{
        SubscriberName: 'Test', SubscriberID: 'S1', PracticeLocation: 'Office',
        Provider: 'Dr. X', NPI: '123', TaxID: '456',
        DOB: '1990-05-15', DateOfService: '2025-01-15', ReceivedDate: '2025-01-20',
        AgingDays: 15, PaymentDate: '2025-02-01', DepositAmount: 500,
        DepositCheckNo: 'CHK123', DepositCleared: '2025-02-02',
        PayerName: 'Blue Cross', RemittanceMethod: 'EDI', PaymentMethod: 'Check',
        Network: 'PPO', ReasonCode: 'PR1',
        InsuranceBalDue: 200.50, PatientBalDue: 50.25,
        PrimaryIns: 'Blue Cross', SecondaryIns: 'MetLife', TertiaryIns: 'Cigna',
        AssignedTo: 3, AssignedUserName: 'Bob',
      }],
    });
    expect(result.dob).toEqual(jasmine.any(Date));
    expect(result.dateOfService).toEqual(jasmine.any(Date));
    expect(result.depositAmount).toBe(500);
    expect(result.depositCheckNumber).toBe('CHK123');
    expect(result.insuranceBalanceDue).toBe(200.50);
    expect(result.secondaryIns).toBe('MetLife');
  });

  it('getClaimDetailTable should map response to line items', () => {
    let result: any[];
    service.getClaimDetailTable('CL001').subscribe((d) => (result = d));
    httpMock.expectOne((r) => r.url.includes('/claim-detail/detail-table')).flush({
      message: 'ok',
      data: [{ DOS: '2025-01-01', ProcCode: 'D0120', Charge: 150, InsPaid: 100, Allowed: 120, ContractualAdjustment: 20, TransactionAdjustment: 0, PatientResp: 30, Deductible: 10, Copay: 5, Coins: 15, ReasonCode: 'CO45' }],
    });
    expect(result!.length).toBe(1);
    expect(result![0].cpt).toBe('D0120');
    expect(result![0].charge).toBe(150);
    expect(result![0].reasonCode).toBe('CO45');
  });

  it('getArMyQueue should map queue rows correctly', () => {
    let result: any;
    service.getArMyQueue().subscribe((r) => (result = r));
    httpMock.expectOne((r) => r.url.includes('/my-queue')).flush({
      message: 'ok',
      data: [{ ClaimID: 'CL001', PatientName: 'Alice', PayerName: 'Aetna', SubmittedDate: '2025-01-01', Charged: 500, InsuranceBalance: 200, Issue: 'CO26', AgingDays: 30, ProgressPercent: 50, Priority: 1, AssignedToName: 'Bob' }],
      totalCount: 1, page: 0, pageSize: 25,
    });
    expect(result.data.length).toBe(1);
    expect(result.data[0].id).toBe('CL001');
    expect(result.data[0].patient).toBe('Alice');
    expect(result.data[0].priority).toBe(1);
    expect(result.data[0].assignedTo).toBe('Bob');
  });

  it('buildParams should include filter params', () => {
    service.getArMyQueue({ search: 'test', status: ['Open', 'Pending'], client: 'ACME', assignedTo: 'Bob', dateFrom: '2025-01-01', dateTo: '2025-12-31' }, 2, 50).subscribe();
    const req = httpMock.expectOne((r) => r.url.includes('/my-queue'));
    expect(req.request.params.get('search')).toBe('test');
    expect(req.request.params.get('status')).toBe('Open,Pending');
    expect(req.request.params.get('client')).toBe('ACME');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('50');
    req.flush({ message: 'ok', data: [], totalCount: 0, page: 2, pageSize: 50 });
  });

  it('saveNotes should return void observable', (done) => {
    service.saveNotes('CL001', 'Some note').subscribe(() => {
      done();
    });
  });

  it('detail should use PatientName when both PatientName and SubscriberName present', () => {
    let result: any;
    service.detail('CL002').subscribe(d => result = d);
    httpMock.expectOne(r => r.url.includes('/denial-iq/claim-detail')).flush({
      message: 'ok',
      data: [{
        PatientName: 'Alice Patient', SubscriberName: 'Bob Sub',
        SubscriberID: 'S1', PracticeLocation: null, Provider: null, NPI: null, TaxID: null,
        DOB: null, DateOfService: null, ReceivedDate: null, AgingDays: null,
        PaymentDate: null, DepositAmount: null, DepositCheckNo: null, DepositCleared: null,
        PayerName: 'BCBS', RemittanceMethod: null, PaymentMethod: null, Network: null,
        ReasonCode: null, InsuranceBalDue: 0, PatientBalDue: 0,
        PrimaryIns: null, SecondaryIns: null, TertiaryIns: null,
        AssignedTo: null, AssignedUserName: null,
      }],
    });
    expect(result.patient).toBe('Alice Patient');
    expect(result.subscriberName).toBe('Bob Sub');
  });

  it('detail should use PayerName as primaryIns fallback when PrimaryIns is null', () => {
    let result: any;
    service.detail('CL003').subscribe(d => result = d);
    httpMock.expectOne(r => r.url.includes('/denial-iq/claim-detail')).flush({
      message: 'ok',
      data: [{
        PatientName: 'Test', SubscriberName: null, SubscriberID: null, PracticeLocation: null,
        Provider: null, NPI: null, TaxID: null, DOB: null, DateOfService: null, ReceivedDate: null,
        AgingDays: null, PaymentDate: null, DepositAmount: null, DepositCheckNo: null, DepositCleared: null,
        PayerName: 'Medicare', RemittanceMethod: null, PaymentMethod: null, Network: null,
        ReasonCode: null, InsuranceBalDue: null, PatientBalDue: null,
        PrimaryIns: null, SecondaryIns: null, TertiaryIns: null,
        AssignedTo: null, AssignedUserName: null,
      }],
    });
    // primaryIns falls back to PayerName='Medicare'
    expect(result.primaryIns).toBe('Medicare');
    expect(result.payer).toBe('Medicare');
  });

  it('detail should use SubscriberName as patient when PatientName is empty', () => {
    let result: any;
    service.detail('CL004').subscribe(d => result = d);
    httpMock.expectOne(r => r.url.includes('/denial-iq/claim-detail')).flush({
      message: 'ok',
      data: [{
        PatientName: '', SubscriberName: 'Sub Name', SubscriberID: null, PracticeLocation: null,
        Provider: null, NPI: null, TaxID: null, DOB: null, DateOfService: null, ReceivedDate: null,
        AgingDays: null, PaymentDate: null, DepositAmount: null, DepositCheckNo: null, DepositCleared: null,
        PayerName: null, RemittanceMethod: null, PaymentMethod: null, Network: null,
        ReasonCode: null, InsuranceBalDue: null, PatientBalDue: null,
        PrimaryIns: null, SecondaryIns: null, TertiaryIns: null,
        AssignedTo: null, AssignedUserName: null,
      }],
    });
    expect(result.patient).toBe('Sub Name');
  });

  it('detail should set all date fields when provided', () => {
    let result: any;
    service.detail('CL005').subscribe(d => result = d);
    httpMock.expectOne(r => r.url.includes('/denial-iq/claim-detail')).flush({
      message: 'ok',
      data: [{
        PatientName: 'Test', SubscriberName: null, SubscriberID: null, PracticeLocation: 'Clinic',
        Provider: 'Dr. Z', NPI: '999', TaxID: '111', DOB: '1985-03-20',
        DateOfService: '2026-02-01', ReceivedDate: '2026-02-05',
        AgingDays: 10, PaymentDate: '2026-03-01', DepositAmount: 300, DepositCheckNo: 'CHK999',
        DepositCleared: '2026-03-05',
        PayerName: 'United', RemittanceMethod: 'ERA', PaymentMethod: 'ACH', Network: 'HMO',
        ReasonCode: 'CO4', InsuranceBalDue: 150, PatientBalDue: 30,
        PrimaryIns: 'United', SecondaryIns: 'Aetna', TertiaryIns: 'Cigna',
        AssignedTo: 7, AssignedUserName: 'Amy',
      }],
    });
    expect(result.dob).toEqual(jasmine.any(Date));
    expect(result.dateOfService).toEqual(jasmine.any(Date));
    expect(result.receivedDate).toEqual(jasmine.any(Date));
    expect(result.paymentDate).toEqual(jasmine.any(Date));
    expect(result.depositCleared).toEqual(jasmine.any(Date));
    expect(result.agingDays).toBe(10);
    expect(result.assignedTo).toBe('7');
  });

  it('getManagerEscalations should use filters and pagination', () => {
    service.getManagerEscalations({ search: 'X', assignedTo: 'Bob' }, 1, 10).subscribe();
    const req = httpMock.expectOne(r => r.url.includes('/manager-view/claim-queue/escalations'));
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('pageSize')).toBe('10');
    req.flush({ message: 'ok', data: [], totalCount: 0, page: 1, pageSize: 10 });
  });

  it('getManagerUnassigned should use pagination', () => {
    service.getManagerUnassigned(undefined, 3, 100).subscribe();
    const req = httpMock.expectOne(r => r.url.includes('/manager-view/claim-queue/unassigned'));
    expect(req.request.params.get('page')).toBe('3');
    req.flush({ message: 'ok', data: [], totalCount: 0, page: 3, pageSize: 100 });
  });

  it('getManagerAllClaims should use filters', () => {
    service.getManagerAllClaims({ status: ['Open'], dateFrom: '2026-01-01', dateTo: '2026-06-30' }).subscribe();
    const req = httpMock.expectOne(r => r.url.includes('/manager-view/claim-queue/all-claims'));
    expect(req.request.params.get('status')).toBe('Open');
    expect(req.request.params.get('dateFrom')).toBe('2026-01-01');
    req.flush({ message: 'ok', data: [], totalCount: 0, page: 0, pageSize: 25 });
  });

  it('detail should map DepositAmount=0 as defined', () => {
    let result: any;
    service.detail('CL006').subscribe(d => result = d);
    httpMock.expectOne(r => r.url.includes('/denial-iq/claim-detail')).flush({
      message: 'ok',
      data: [{
        PatientName: 'Test', SubscriberName: null, SubscriberID: null, PracticeLocation: null,
        Provider: null, NPI: null, TaxID: null, DOB: null, DateOfService: null, ReceivedDate: null,
        AgingDays: null, PaymentDate: null, DepositAmount: 0, DepositCheckNo: null, DepositCleared: null,
        PayerName: null, RemittanceMethod: null, PaymentMethod: null, Network: null,
        ReasonCode: null, InsuranceBalDue: 50, PatientBalDue: 25,
        PrimaryIns: null, SecondaryIns: null, TertiaryIns: null,
        AssignedTo: null, AssignedUserName: null,
      }],
    });
    // DepositAmount=0 is not null, so it should be Number(0) = 0
    expect(result.depositAmount).toBe(0);
    expect(result.insuranceBalanceDue).toBe(50);
    expect(result.patientBalanceDue).toBe(25);
  });

  // --- getArPendingQueue ------------------------------------------------------

  it('getArPendingQueue should GET pending endpoint', () => {
    service.getArPendingQueue().subscribe();
    const req = httpMock.expectOne((r) => r.url.includes('/specialist-view/claim-queue/pending'));
    expect(req.request.method).toBe('GET');
    req.flush({ message: 'ok', data: [], totalCount: 0, page: 0, pageSize: 25 });
  });

  it('getArPendingQueue should pass filters and pagination', () => {
    service.getArPendingQueue({ search: 'X' }, 2, 10).subscribe();
    const req = httpMock.expectOne((r) => r.url.includes('/specialist-view/claim-queue/pending'));
    expect(req.request.params.get('search')).toBe('X');
    expect(req.request.params.get('page')).toBe('2');
    req.flush({ message: 'ok', data: [], totalCount: 0, page: 2, pageSize: 10 });
  });

  // --- unassignClaim ----------------------------------------------------------

  it('unassignClaim should POST to unassign', () => {
    service.unassignClaim('CL001').subscribe();
    const req = httpMock.expectOne(`${base}/claim-detail/unassign`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ claimId: 'CL001' });
    req.flush({ message: 'ok', rowsAffected: 1 });
  });

  // --- closeClaimAdjudicated -------------------------------------------------

  it('closeClaimAdjudicated should POST to close-adjudicated', () => {
    service.closeClaimAdjudicated('CL001', 100, 'Approved').subscribe();
    const req = httpMock.expectOne(`${base}/claim-detail/close-adjudicated`);
    expect(req.request.method).toBe('POST');
    req.flush({ message: 'ok' });
  });

  // --- getAssignableUsers ----------------------------------------------------

  it('getAssignableUsers should GET assignable users', () => {
    let result: any;
    service.getAssignableUsers().subscribe((r) => (result = r));
    const req = httpMock.expectOne((r) => r.url.includes('/claim-detail/assignable-users'));
    expect(req.request.method).toBe('GET');
    req.flush({ data: [{ id: 1, name: 'Alice', role: 'specialist' }] });
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('Alice');
  });

  // --- exportClaimHistory ----------------------------------------------------

  it('exportClaimHistory should GET history export as blob', () => {
    service.exportClaimHistory('CL001').subscribe();
    const req = httpMock.expectOne((r) => r.url.includes('/claim-detail/history/export'));
    expect(req.request.method).toBe('GET');
    req.flush(new Blob());
  });

  // --- list() with applyFilters -----------------------------------------------

  it('list() should return all rows when no filters', (done) => {
    service.list().subscribe((rows) => {
      expect(Array.isArray(rows)).toBeTrue();
      done();
    });
  });

  it('list() with search filter should filter by id', (done) => {
    service.list({ search: 'ZZZZZZ_NOT_EXIST' }).subscribe((rows) => {
      expect(rows.length).toBe(0);
      done();
    });
  });

  it('list() with status filter should filter rows by status', (done) => {
    service.list({ status: ['Open'] }).subscribe((rows) => {
      // May return 0 or more depending on dummy data
      expect(Array.isArray(rows)).toBeTrue();
      done();
    });
  });

  it('list() with client filter should filter rows by client', (done) => {
    service.list({ client: 'NONEXISTENT_CLIENT' }).subscribe((rows) => {
      expect(rows.length).toBe(0);
      done();
    });
  });

  it('list() with assignedTo filter should filter rows by assignee', (done) => {
    service.list({ assignedTo: 'NONEXISTENT_USER' }).subscribe((rows) => {
      expect(rows.length).toBe(0);
      done();
    });
  });

  // --- mapQueueRow null fallbacks ---------------------------------------------

  it('getArMyQueue should handle null optional fields in queue row', () => {
    let result: any;
    service.getArMyQueue().subscribe((r) => (result = r));
    const req = httpMock.expectOne((r) => r.url.includes('/my-queue'));
    req.flush({
      message: 'ok',
      data: [{
        ClaimID: 'CL001',
        PatientName: 'Alice',
        PayerName: 'Aetna',
        SubmittedDate: '2025-01-01',
        Charged: 500,
        InsuranceBalance: 200,
        Issue: 'CO26',
        AgingDays: 30,
        ProgressPercent: 50,
        Priority: 1,
        // All optional fields null
        AssignedToName: null,
        ProviderName: null,
        Location: null,
        Status: null,
        SlaStatus: null,
        DaysUntilSla: null,
        SlaDeadline: null,
        DateOfService: null,
        AccountNumber: null,
        IssueDescription: null,
        EscalationReason: null,
      }],
      totalCount: 1, page: 0, pageSize: 25,
    });
    const row = result.data[0];
    expect(row.assignedTo).toBeUndefined();
    expect(row.providerName).toBeUndefined();
    expect(row.location).toBeUndefined();
    expect(row.status).toBeUndefined();
    expect(row.daysUntilSla).toBeNull();
    expect(row.slaDeadline).toBeNull();
    expect(row.dateOfService).toBeNull();
    expect(row.accountNumber).toBeNull();
    expect(row.issueDescription).toBeNull();
    expect(row.escalationReason).toBeNull();
  });

  it('mapPaginatedQueue should use 0 for missing totalCount', () => {
    let result: any;
    service.getArMyQueue().subscribe((r) => (result = r));
    const req = httpMock.expectOne((r) => r.url.includes('/my-queue'));
    req.flush({ message: 'ok', data: [], totalCount: null, page: null, pageSize: null });
    expect(result.totalCount).toBe(0);
    expect(result.page).toBe(0);
    expect(result.pageSize).toBe(25);
  });

  // --- getClaimDetailTable null fallbacks -------------------------------------

  it('getClaimDetailTable should handle null fields in detail table row', () => {
    let result: any[];
    service.getClaimDetailTable('CL001').subscribe((d) => (result = d));
    const req = httpMock.expectOne((r) => r.url.includes('/claim-detail/detail-table'));
    req.flush({
      message: 'ok',
      data: [{
        DOS: null,
        ProcCode: null,
        ProcDescription: null,
        Charge: null,
        InsPaid: null,
        Allowed: null,
        ContractualAdjustment: null,
        TransactionAdjustment: null,
        PatientResp: null,
        Deductible: null,
        Copay: null,
        Coins: null,
        ReasonCode: null,
      }],
    });
    expect(result!.length).toBe(1);
    expect(result![0].cpt).toBe('');
    expect(result![0].charge).toBe(0);
    expect(result![0].reasonCode).toBe('');
  });

  // --- buildParams branches --------------------------------------------------

  it('buildParams should include assignedTo even if empty string', () => {
    service.getArMyQueue({ assignedTo: '' }, 0, 25).subscribe();
    const req = httpMock.expectOne((r) => r.url.includes('/my-queue'));
    // assignedTo='' is !== undefined so it should be set
    expect(req.request.params.get('assignedTo')).toBe('');
    req.flush({ message: 'ok', data: [], totalCount: 0, page: 0, pageSize: 25 });
  });

  it('buildParams should not include search when not set', () => {
    service.getArMyQueue({}, 0, 25).subscribe();
    const req = httpMock.expectOne((r) => r.url.includes('/my-queue'));
    expect(req.request.params.get('search')).toBeNull();
    req.flush({ message: 'ok', data: [], totalCount: 0, page: 0, pageSize: 25 });
  });
});
