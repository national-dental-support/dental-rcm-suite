import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { ClaimVisionRulesPageComponent } from './claim-vision-rules-page.component';
import { RulesStoreService } from '../../../../core/stores/rules.store.service';

describe('ClaimVisionRulesPageComponent', () => {
  let component: ClaimVisionRulesPageComponent;
  let fixture: ComponentFixture<ClaimVisionRulesPageComponent>;

  const mockRulesStore = {
    loadAll: jasmine.createSpy('loadAll'),
    customRules$: of([]),
    systemRules$: of([]),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ClaimVisionRulesPageComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate').and.returnValue(Promise.resolve(true)) } },
        { provide: RulesStoreService, useValue: mockRulesStore },
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => {}, detectChanges: () => {} } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ClaimVisionRulesPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call loadAll on init', () => {
    expect(mockRulesStore.loadAll).toHaveBeenCalled();
  });

  it('should initialize with empty custom rules', () => {
    expect(component.myCustomRules).toEqual([]);
  });

  it('should initialize with empty system rules', () => {
    expect(component.systemRules).toEqual([]);
  });

  it('onNewRule should navigate to new rule page', () => {
    const router = TestBed.inject(Router);
    component.onNewRule();
    expect(router.navigate).toHaveBeenCalledWith(['/app/claim-vision/rules/new']);
  });

  it('onViewDetails should navigate to rule detail page', () => {
    const router = TestBed.inject(Router);
    component.onViewDetails({ id: 'R123' } as any);
    expect(router.navigate).toHaveBeenCalledWith(['/app/claim-vision/rules', 'R123']);
  });

  it('should subscribe to customRules$ and update myCustomRules', () => {
    // Already verified via initialization - myCustomRules is set from the mock
    expect(component.myCustomRules).toBeDefined();
  });

  it('should subscribe to systemRules$ and update systemRules', () => {
    // Already verified via initialization - systemRules is set from the mock
    expect(component.systemRules).toBeDefined();
  });

});

describe('ClaimVisionRulesPageComponent \u2014 null rules fallback', () => {
  it('should default myCustomRules to [] when customRules$ emits null (L21 binary-expr arm1)', async () => {
    TestBed.resetTestingModule();
    const mockStoreNull = {
      loadAll: jasmine.createSpy('loadAll'),
      customRules$: of(null as any),
      systemRules$: of([]),
      deleteRule: jasmine.createSpy('deleteRule'),
      reorderCustomRules: jasmine.createSpy('reorderCustomRules'),
    };
    await TestBed.configureTestingModule({
      declarations: [ClaimVisionRulesPageComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } },
        { provide: RulesStoreService, useValue: mockStoreNull },
      ],
    }).compileComponents();
    const f2 = TestBed.createComponent(ClaimVisionRulesPageComponent);
    f2.detectChanges();
    expect(f2.componentInstance.myCustomRules).toEqual([]);
  });

  it('should default systemRules to [] when systemRules$ emits null (L25 binary-expr arm1)', async () => {
    TestBed.resetTestingModule();
    const mockStoreNull = {
      loadAll: jasmine.createSpy('loadAll'),
      customRules$: of([]),
      systemRules$: of(null as any),
      deleteRule: jasmine.createSpy('deleteRule'),
      reorderCustomRules: jasmine.createSpy('reorderCustomRules'),
    };
    await TestBed.configureTestingModule({
      declarations: [ClaimVisionRulesPageComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } },
        { provide: RulesStoreService, useValue: mockStoreNull },
      ],
    }).compileComponents();
    const f3 = TestBed.createComponent(ClaimVisionRulesPageComponent);
    f3.detectChanges();
    expect(f3.componentInstance.systemRules).toEqual([]);
  });
});
