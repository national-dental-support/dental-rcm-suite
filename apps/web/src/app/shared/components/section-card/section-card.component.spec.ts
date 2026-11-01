import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { SectionCardComponent } from './section-card.component';

describe('SectionCardComponent', () => {
  let component: SectionCardComponent;
  let fixture: ComponentFixture<SectionCardComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [SectionCardComponent],
      schemas: [NO_ERRORS_SCHEMA],
    });
    fixture = TestBed.createComponent(SectionCardComponent);
    component = fixture.componentInstance;
    component.title = 'Test Section';
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should set hasTitle true when title is provided', () => {
    expect(component.hasTitle).toBeTrue();
  });

  it('should leave hasTitle false when no title is provided', () => {
    // Create a second fixture without setting title
    const fixture2 = TestBed.createComponent(SectionCardComponent);
    const comp2 = fixture2.componentInstance;
    // title is undefined by default - ngOnInit condition is false
    fixture2.detectChanges();
    expect(comp2.hasTitle).toBeFalse();
  });
});
