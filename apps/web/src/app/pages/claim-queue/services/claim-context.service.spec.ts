import { TestBed } from '@angular/core/testing';
import { ClaimContextService, ActiveClaimContext } from './claim-context.service';

describe('ClaimContextService', () => {
  let service: ClaimContextService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ClaimContextService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should emit null initially', (done) => {
    service.activeClaim$.subscribe((val) => {
      expect(val).toBeNull();
      done();
    });
  });

  it('should emit context after setActiveClaim', (done) => {
    const ctx: ActiveClaimContext = { id: 'CL001', patient: 'Jane Doe' };
    service.setActiveClaim(ctx);

    service.activeClaim$.subscribe((val) => {
      expect(val).toEqual(ctx);
      done();
    });
  });

  it('should emit null after clear()', (done) => {
    service.setActiveClaim({ id: 'CL001', patient: 'Jane Doe' });
    service.clear();

    service.activeClaim$.subscribe((val) => {
      expect(val).toBeNull();
      done();
    });
  });

  it('should replace context on multiple setActiveClaim calls', (done) => {
    const ctx1: ActiveClaimContext = { id: 'CL001', patient: 'Patient A' };
    const ctx2: ActiveClaimContext = { id: 'CL002', patient: 'Patient B' };

    service.setActiveClaim(ctx1);
    service.setActiveClaim(ctx2);

    service.activeClaim$.subscribe((val) => {
      expect(val).toEqual(ctx2);
      done();
    });
  });
});
