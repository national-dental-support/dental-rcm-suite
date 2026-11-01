import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { PageContentWrapperComponent } from './page-content-wrapper.component';

describe('PageContentWrapperComponent', () => {
  let component: PageContentWrapperComponent;
  let fixture: ComponentFixture<PageContentWrapperComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [PageContentWrapperComponent],
      schemas: [NO_ERRORS_SCHEMA],
    });
    fixture = TestBed.createComponent(PageContentWrapperComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
