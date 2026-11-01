import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { RouterTestingModule } from '@angular/router/testing';
import { PayerIQTabsComponent } from './payer-iq-tabs.component';

describe('PayerIQTabsComponent', () => {
  let component: PayerIQTabsComponent;
  let fixture: ComponentFixture<PayerIQTabsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [PayerIQTabsComponent],
      imports: [RouterTestingModule],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(PayerIQTabsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have 5 tabs', () => {
    // #89 added the Compare tab for side-by-side DSO analysis
    expect(component.tabs.length).toBe(5);
  });

  it('should have Dashboard as first tab', () => {
    expect(component.tabs[0].label).toBe('Dashboard');
  });

  it('should include Underpayments tab', () => {
    expect(component.tabs.some(t => t.label === 'Underpayments')).toBeTrue();
  });

  it('should include Strategy tab', () => {
    expect(component.tabs.some(t => t.label === 'Strategy')).toBeTrue();
  });

  it('should include Compare tab (#89 DSO side-by-side)', () => {
    expect(component.tabs.some(t => t.label === 'Compare')).toBeTrue();
  });

  it('trackByLabel should return tab label', () => {
    expect(component.trackByLabel(0, { label: 'Test', link: 'test' })).toBe('Test');
  });
});
