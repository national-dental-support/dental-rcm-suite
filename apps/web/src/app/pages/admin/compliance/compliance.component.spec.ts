import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { ComplianceAdminComponent } from './compliance.component';
import { ComplianceService } from '../../../core/services/compliance.service';

describe('ComplianceAdminComponent', () => {
  let component: ComplianceAdminComponent;
  let fixture: ComponentFixture<ComplianceAdminComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ComplianceAdminComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        {
          provide: ComplianceService,
          useValue: {
            getDashboard: () => of({
              training: { complianceRate: 92, completed: 10, total: 12, overdue: 0 },
              security: { failedLogins30d: 3, uniqueFailedUsers: 2, lockedAccounts: 0, dormantAccounts: 1 },
              users: { total: 20, disabled: 2, locked: 0, dormant: 1 },
              auditActivity: [],
            }),
            getAccessReview: () => of([]),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ComplianceAdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
