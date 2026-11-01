import { TestBed } from '@angular/core/testing';
import { KeyboardShortcutsService, ShortcutAction } from './keyboard-shortcuts.service';

function fireKey(key: string, options: Partial<KeyboardEventInit> = {}): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...options }));
}

describe('KeyboardShortcutsService', () => {
  let service: KeyboardShortcutsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(KeyboardShortcutsService);
    service.start();
  });

  afterEach(() => {
    service.stop();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should expose onAction$ observable', () => {
    expect(service.onAction$).toBeDefined();
  });

  describe('start / stop', () => {
    it('should not add duplicate listeners on multiple start calls', () => {
      const emitted: ShortcutAction[] = [];
      service.onAction$.subscribe(a => emitted.push(a));

      service.start(); // second call - no-op
      fireKey('n');

      expect(emitted.length).toBe(1);
    });

    it('should stop emitting after stop()', () => {
      const emitted: ShortcutAction[] = [];
      service.onAction$.subscribe(a => emitted.push(a));

      service.stop();
      fireKey('n');

      expect(emitted.length).toBe(0);
    });
  });

  describe('enable / disable', () => {
    it('should not emit when disabled', () => {
      const emitted: ShortcutAction[] = [];
      service.onAction$.subscribe(a => emitted.push(a));

      service.disable();
      fireKey('n');

      expect(emitted.length).toBe(0);
    });

    it('should resume emitting after re-enable', () => {
      const emitted: ShortcutAction[] = [];
      service.onAction$.subscribe(a => emitted.push(a));

      service.disable();
      service.enable();
      fireKey('n');

      expect(emitted.length).toBe(1);
    });
  });

  describe('single-key shortcuts', () => {
    it('should emit next-claim on "n"', () => {
      const emitted: ShortcutAction[] = [];
      service.onAction$.subscribe(a => emitted.push(a));
      fireKey('n');
      expect(emitted).toContain('next-claim');
    });

    it('should emit escalate on "e"', () => {
      const emitted: ShortcutAction[] = [];
      service.onAction$.subscribe(a => emitted.push(a));
      fireKey('e');
      expect(emitted).toContain('escalate');
    });

    it('should emit save-close on "s"', () => {
      const emitted: ShortcutAction[] = [];
      service.onAction$.subscribe(a => emitted.push(a));
      fireKey('s');
      expect(emitted).toContain('save-close');
    });

    it('should emit go-home on "h"', () => {
      const emitted: ShortcutAction[] = [];
      service.onAction$.subscribe(a => emitted.push(a));
      fireKey('h');
      expect(emitted).toContain('go-home');
    });

    it('should emit go-queue on "q"', () => {
      const emitted: ShortcutAction[] = [];
      service.onAction$.subscribe(a => emitted.push(a));
      fireKey('q');
      expect(emitted).toContain('go-queue');
    });
  });

  describe('Ctrl+K / Cmd+K shortcut', () => {
    it('should emit command-palette on Ctrl+K', () => {
      const emitted: ShortcutAction[] = [];
      service.onAction$.subscribe(a => emitted.push(a));
      fireKey('k', { ctrlKey: true });
      expect(emitted).toContain('command-palette');
    });

    it('should emit command-palette on Meta+K', () => {
      const emitted: ShortcutAction[] = [];
      service.onAction$.subscribe(a => emitted.push(a));
      fireKey('k', { metaKey: true });
      expect(emitted).toContain('command-palette');
    });
  });

  describe('modifier-key suppression', () => {
    it('should not emit single-key shortcuts when Ctrl is held', () => {
      const emitted: ShortcutAction[] = [];
      service.onAction$.subscribe(a => emitted.push(a));
      fireKey('n', { ctrlKey: true });
      expect(emitted).not.toContain('next-claim');
    });

    it('should not emit single-key shortcuts when Alt is held', () => {
      const emitted: ShortcutAction[] = [];
      service.onAction$.subscribe(a => emitted.push(a));
      fireKey('n', { altKey: true });
      expect(emitted).not.toContain('next-claim');
    });
  });

  describe('ngOnDestroy', () => {
    it('should call stop on destroy', () => {
      spyOn(service, 'stop');
      service.ngOnDestroy();
      expect(service.stop).toHaveBeenCalled();
    });
  });
});
