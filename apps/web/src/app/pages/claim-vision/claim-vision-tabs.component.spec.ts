import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { RouterTestingModule } from '@angular/router/testing';
import { ClaimVisionTabsComponent } from './claim-vision-tabs.component';

describe('ClaimVisionTabsComponent', () => {
  let component: ClaimVisionTabsComponent;
  let fixture: ComponentFixture<ClaimVisionTabsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ClaimVisionTabsComponent],
      imports: [RouterTestingModule],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(ClaimVisionTabsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have 2 tabs', () => {
    expect(component.tabs.length).toBe(2);
  });

  it('should have Rejected Claims as first tab', () => {
    expect(component.tabs[0].label).toBe('Rejected Claims');
    expect(component.tabs[0].link).toBe('rejected-claims');
  });

  it('should have Rules as second tab', () => {
    expect(component.tabs[1].label).toBe('Rules');
    expect(component.tabs[1].link).toBe('rules');
  });

  it('trackByLabel should return tab label', () => {
    expect(component.trackByLabel(0, { label: 'Test', link: 'test' })).toBe('Test');
  });
});
