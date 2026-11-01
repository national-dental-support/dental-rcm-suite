import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RcmSummaryCardsComponent } from './rcm-summary-cards.component';

describe('RcmSummaryCardsComponent', () => {
  let component: RcmSummaryCardsComponent;
  let fixture: ComponentFixture<RcmSummaryCardsComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [RcmSummaryCardsComponent]
    });
    fixture = TestBed.createComponent(RcmSummaryCardsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
