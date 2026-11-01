import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { ReconIQTabsComponent } from './recon-iq-tabs.component';
import { SubscriptionService } from '../../../core/services/subscription.service';

describe('ReconIQTabsComponent', () => {
  let component: ReconIQTabsComponent;
  let fixture: ComponentFixture<ReconIQTabsComponent>;
  let userRole$: BehaviorSubject<string>;

  async function setUp(role: string): Promise<void> {
    userRole$ = new BehaviorSubject<string>(role);

    await TestBed.configureTestingModule({
      declarations: [ReconIQTabsComponent],
      imports: [RouterTestingModule],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: SubscriptionService, useValue: { userRole$ } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReconIQTabsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  it('should create', async () => {
    await setUp('AR Specialist');
    expect(component).toBeTruthy();
  });

  it('should have a dashboard tab', async () => {
    await setUp('AR Specialist');
    expect(component.dashboardTab).toEqual({ label: 'Dashboard', link: 'dashboard' });
  });

  it('trackByLabel should return the tab label', async () => {
    await setUp('AR Specialist');
    expect(component.trackByLabel(0, { label: 'Test', link: 'test' })).toBe('Test');
  });

  describe('otherTabs$', () => {
    it('exposes the six non-admin tabs to a non-admin', async () => {
      await setUp('AR Specialist');
      const tabs = await firstValueFrom(component.otherTabs$);
      expect(tabs.length).toBe(6);
      expect(tabs.some(t => t.label === 'Admin')).toBeFalse();
    });

    it('adds the Admin tab for an admin', async () => {
      await setUp('Admin');
      const tabs = await firstValueFrom(component.otherTabs$);
      expect(tabs.length).toBe(7);
      expect(tabs.some(t => t.label === 'Admin')).toBeTrue();
    });

    it('includes Encounter Research', async () => {
      await setUp('AR Specialist');
      const tabs = await firstValueFrom(component.otherTabs$);
      expect(tabs.some(t => t.label === 'Encounter Research')).toBeTrue();
    });

    it('includes Matching', async () => {
      await setUp('AR Specialist');
      const tabs = await firstValueFrom(component.otherTabs$);
      expect(tabs.some(t => t.label === 'Matching')).toBeTrue();
    });
  });

  describe('isAdmin$', () => {
    it('is false for a non-admin role', async () => {
      await setUp('AR Specialist');
      expect(await firstValueFrom(component.isAdmin$)).toBeFalse();
    });

    it('is true for Super Admin', async () => {
      await setUp('Super Admin');
      expect(await firstValueFrom(component.isAdmin$)).toBeTrue();
    });
  });
});
