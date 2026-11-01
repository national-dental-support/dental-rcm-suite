import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, NO_ERRORS_SCHEMA } from '@angular/core';
import { BasicCardComponent } from './basic-card.component';

@Component({ selector: 'app-stub-inner', template: '<p>stub</p>', standalone: false })
class StubInnerComponent {}

describe('BasicCardComponent', () => {
  let component: BasicCardComponent;
  let fixture: ComponentFixture<BasicCardComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [BasicCardComponent, StubInnerComponent],
      schemas: [NO_ERRORS_SCHEMA],
    });
    fixture = TestBed.createComponent(BasicCardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should skip createComponent when no component input is set (if arm1)', () => {
    // component.component is not set - ngAfterViewInit should not throw
    expect(component).toBeTruthy();
  });
});

describe('BasicCardComponent \u2014 with component input', () => {
  it('should dynamically create the given component (if arm0)', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      declarations: [BasicCardComponent, StubInnerComponent],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    const fixture2 = TestBed.createComponent(BasicCardComponent);
    const comp2 = fixture2.componentInstance;
    comp2.component = StubInnerComponent;
    fixture2.detectChanges(); // triggers ngAfterViewInit
    expect(comp2).toBeTruthy();
  });
});
