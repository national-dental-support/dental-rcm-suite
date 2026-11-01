import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { TopNavComponent } from './top-nav.component';
import { Router } from '@angular/router';
import { DenialIqContextService } from '../../pages/claim-queue/services/denialIqRole.service';
import { ClaimContextService } from '../../pages/claim-queue/services/claim-context.service';
import { GlobalFiltersStore, PayerIqFiltersStore } from '../../shared/components/global-filters/global-filters.store';
import { PayerIqService } from '../../core/services/payer-iq.service';
import { RefDataStore } from '../../store/global/ref-data.store';
import { ThemeService } from '../../core/services/theme.service';
import { EnterpriseService } from '../../core/services/enterprise.service';

describe('TopNav', () => {
  let component: TopNavComponent;
  let fixture: ComponentFixture<TopNavComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [TopNavComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: Router, useValue: { events: of(), navigate: () => {} } },
        { provide: DenialIqContextService, useValue: { role$: of('ar-specialist') } },
        { provide: ClaimContextService, useValue: { activeClaim$: of(null) } },
        { provide: GlobalFiltersStore, useValue: { applied$: of(null), setOptions: () => {}, set: () => {} } },
        { provide: PayerIqFiltersStore, useValue: { set: () => {} } },
        { provide: PayerIqService, useValue: {} },
        { provide: RefDataStore, useValue: { data$: of(null) } },
        { provide: ThemeService, useValue: { isDarkMode: () => false, darkMode$: of(false), chartColors$: of([]), primaryColor$: of('#000') } },
        { provide: EnterpriseService, useValue: { active$: of(null), activeEnterprise: null, activeEnterpriseId: null } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TopNavComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
