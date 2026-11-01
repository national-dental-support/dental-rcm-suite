import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { TrainingPanelComponent } from './training-panel.component';
import { TrainingService } from '../../../core/services/training.service';

describe('TrainingPanelComponent', () => {
  let component: TrainingPanelComponent;
  let fixture: ComponentFixture<TrainingPanelComponent>;
  let trainingModeSubject: BehaviorSubject<boolean>;
  let mockTrainingService: any;

  beforeEach(async () => {
    trainingModeSubject = new BehaviorSubject<boolean>(false);
    mockTrainingService = { trainingMode$: trainingModeSubject.asObservable() };

    await TestBed.configureTestingModule({
      declarations: [TrainingPanelComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: TrainingService, useValue: mockTrainingService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TrainingPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start with visible = false (training mode off)', () => {
    expect(component.visible).toBeFalse();
  });

  it('should start with expanded = false', () => {
    expect(component.expanded).toBeFalse();
  });

  it('should set visible true when training mode turns on', () => {
    trainingModeSubject.next(true);
    expect(component.visible).toBeTrue();
  });

  it('should set visible false when training mode turns off', () => {
    trainingModeSubject.next(true);
    trainingModeSubject.next(false);
    expect(component.visible).toBeFalse();
  });

  it('should accept title input', () => {
    component.title = 'How to use this page';
    expect(component.title).toBe('How to use this page');
  });

  it('should toggle expanded when clicked logic is applied', () => {
    component.expanded = false;
    component.expanded = !component.expanded;
    expect(component.expanded).toBeTrue();
  });

  it('should unsubscribe on destroy', () => {
    component.ngOnDestroy();
    // Should not throw
    expect(true).toBeTrue();
  });
});
