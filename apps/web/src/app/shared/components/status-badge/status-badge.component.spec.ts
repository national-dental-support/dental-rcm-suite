import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { SharedStatusBadgeComponent } from './status-badge.component';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('SharedStatusBadgeComponent', () => {
  let component: SharedStatusBadgeComponent;
  let fixture: ComponentFixture<SharedStatusBadgeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    declarations: [SharedStatusBadgeComponent],
    schemas: [NO_ERRORS_SCHEMA],
    imports: [NoopAnimationsModule],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
}).compileComponents();

    fixture = TestBed.createComponent(SharedStatusBadgeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
