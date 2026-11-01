import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { SharedStatCardComponent } from './stat-card.component';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('SharedStatCardComponent', () => {
  let component: SharedStatCardComponent;
  let fixture: ComponentFixture<SharedStatCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    declarations: [SharedStatCardComponent],
    schemas: [NO_ERRORS_SCHEMA],
    imports: [NoopAnimationsModule],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
}).compileComponents();

    fixture = TestBed.createComponent(SharedStatCardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
