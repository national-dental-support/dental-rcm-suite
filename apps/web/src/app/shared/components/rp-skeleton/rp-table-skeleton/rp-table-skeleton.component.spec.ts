import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { RpTableSkeletonComponent } from './rp-table-skeleton.component';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('RpTableSkeletonComponent', () => {
  let component: RpTableSkeletonComponent;
  let fixture: ComponentFixture<RpTableSkeletonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    declarations: [RpTableSkeletonComponent],
    schemas: [NO_ERRORS_SCHEMA],
    imports: [NoopAnimationsModule],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
}).compileComponents();

    fixture = TestBed.createComponent(RpTableSkeletonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
