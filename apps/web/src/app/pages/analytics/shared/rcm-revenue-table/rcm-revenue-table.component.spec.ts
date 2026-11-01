import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RcmRevenueTableComponent } from './rcm-revenue-table.component';

describe('RcmRevenueTableComponent', () => {
  let component: RcmRevenueTableComponent;
  let fixture: ComponentFixture<RcmRevenueTableComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [RcmRevenueTableComponent]
    });
    fixture = TestBed.createComponent(RcmRevenueTableComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
