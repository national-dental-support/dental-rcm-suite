import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import {
  DashboardCustomizeDialogComponent,
  CustomizeDialogData,
} from './dashboard-customize-dialog.component';
import { DashboardLayout } from '../../../../core/models/dashboard-layout.model';

const mockSections = [
  { slug: 'denial-iq', label: 'Denial IQ', kpis: [{ key: 'denialRate', label: 'Denial Rate' }] },
  { slug: 'recon-iq',  label: 'Recon IQ',  kpis: [{ key: 'collectionRate', label: 'Collection Rate' }] },
];

const mockLayout: DashboardLayout = {
  id: 1,
  name: 'Daily Ops',
  isDefault: false,
  config: {
    version: 1,
    sections: [
      { slug: 'recon-iq',  visible: true,  order: 0, kpis: [{ key: 'collectionRate', visible: true, order: 0 }] },
      { slug: 'denial-iq', visible: false, order: 1, kpis: [{ key: 'denialRate',     visible: true, order: 0 }] },
    ],
  },
  createdAt: '2026-04-01T00:00:00Z',
  updatedAt: '2026-04-01T00:00:00Z',
};

describe('DashboardCustomizeDialogComponent', () => {
  let component: DashboardCustomizeDialogComponent;
  let fixture: ComponentFixture<DashboardCustomizeDialogComponent>;
  let mockDialogRef: jasmine.SpyObj<MatDialogRef<DashboardCustomizeDialogComponent>>;

  function createComponent(data: CustomizeDialogData) {
    mockDialogRef = jasmine.createSpyObj('MatDialogRef', ['close']);
    TestBed.configureTestingModule({
      declarations: [DashboardCustomizeDialogComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(DashboardCustomizeDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  describe('with no existing layout (create mode)', () => {
    beforeEach(() => createComponent({ sections: mockSections as any, layout: null }));

    it('should create', () => expect(component).toBeTruthy());

    it('should default layoutName to empty string', () => {
      expect(component.layoutName).toBe('');
    });

    it('should default isDefault to false', () => {
      expect(component.isDefault).toBeFalse();
    });

    it('should build edit sections with all visible and original order', () => {
      expect(component.editSections.length).toBe(2);
      expect(component.editSections[0].slug).toBe('denial-iq');
      expect(component.editSections[0].visible).toBeTrue();
      expect(component.editSections[0].kpis[0].visible).toBeTrue();
    });

    it('canSave should be false when layoutName is empty', () => {
      component.layoutName = '';
      expect(component.canSave).toBeFalse();
    });

    it('canSave should be true when layoutName has content', () => {
      component.layoutName = 'My Layout';
      expect(component.canSave).toBeTrue();
    });

    it('save should not close if layoutName is empty', () => {
      component.layoutName = '';
      component.save();
      expect(mockDialogRef.close).not.toHaveBeenCalled();
    });

    it('save should close with correct config when valid', () => {
      component.layoutName = 'Test Layout';
      component.save();
      const result = mockDialogRef.close.calls.mostRecent().args[0];
      expect(result.name).toBe('Test Layout');
      expect(result.config.version).toBe(1);
      expect(result.config.sections.length).toBe(2);
      expect(result.config.sections[0].order).toBe(0);
      expect(result.config.sections[1].order).toBe(1);
    });

    it('save should assign kpi orders based on array index', () => {
      component.layoutName = 'L';
      component.save();
      const result = mockDialogRef.close.calls.mostRecent().args[0];
      expect(result.config.sections[0].kpis[0].order).toBe(0);
    });

    it('cancel should close without result', () => {
      component.cancel();
      expect(mockDialogRef.close).toHaveBeenCalledWith();
    });
  });

  describe('with existing layout (edit mode)', () => {
    beforeEach(() => createComponent({ sections: mockSections as any, layout: mockLayout }));

    it('should set layoutName from layout', () => {
      expect(component.layoutName).toBe('Daily Ops');
    });

    it('should respect config visibility \u2014 denial-iq hidden in config is hidden', () => {
      const denial = component.editSections.find(s => s.slug === 'denial-iq');
      expect(denial?.visible).toBeFalse();
    });

    it('should sort sections by config order \u2014 recon-iq first', () => {
      expect(component.editSections[0].slug).toBe('recon-iq');
      expect(component.editSections[1].slug).toBe('denial-iq');
    });
  });

  describe('toggleExpand', () => {
    beforeEach(() => createComponent({ sections: mockSections as any, layout: null }));

    it('should toggle section expanded state', () => {
      const section = component.editSections[0];
      expect(section.expanded).toBeFalse();
      component.toggleExpand(section);
      expect(section.expanded).toBeTrue();
      component.toggleExpand(section);
      expect(section.expanded).toBeFalse();
    });
  });

  describe('dropSection', () => {
    beforeEach(() => createComponent({ sections: mockSections as any, layout: null }));

    it('should reorder editSections on drop', () => {
      const originalFirst = component.editSections[0].slug;
      component.dropSection({ previousIndex: 0, currentIndex: 1 } as any);
      expect(component.editSections[0].slug).not.toBe(originalFirst);
      expect(component.editSections[1].slug).toBe(originalFirst);
    });
  });
});
