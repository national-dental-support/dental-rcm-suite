import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CustomTabStripComponent } from './custom-tab-strip.component';

describe('CustomTabStripComponent', () => {
  let component: CustomTabStripComponent;
  let fixture: ComponentFixture<CustomTabStripComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [CustomTabStripComponent]
    });
    fixture = TestBed.createComponent(CustomTabStripComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
