import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DataCardComponent } from './data-card.component';

describe('DataCardComponent', () => {
  let component: DataCardComponent;
  let fixture: ComponentFixture<DataCardComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [DataCardComponent]
    });
    fixture = TestBed.createComponent(DataCardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('showTrend should be false when trendDirection and trendColor are not set', () => {
    expect(component.showTrend).toBeFalse();
  });

  it('showTrend should be true when both trendDirection and trendColor are set', () => {
    component.trendDirection = 'up';
    component.trendColor = 'green';
    expect(component.showTrend).toBeTrue();
  });

  it('showTrend should be false when only trendDirection is set', () => {
    component.trendDirection = 'up';
    expect(component.showTrend).toBeFalse();
  });

  it('onActionClicked should emit actionClick event', () => {
    const spy = spyOn(component.actionClick, 'emit');
    const event = new MouseEvent('click');
    spyOn(event, 'stopPropagation');
    component.onActionClicked(event);
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(spy).toHaveBeenCalled();
  });
});
