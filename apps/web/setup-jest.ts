import { setupZoneTestEnv } from 'jest-preset-angular/setup-env/zone';

// @angular-builders/jest automatically injects its own setupZoneTestEnv call
// before setupFilesAfterEnv entries. Angular 21's TestBed.initTestEnvironment
// is also non-idempotent when multiple spec files share a Jest worker.
// Absorb the "already been called" error so this file is safe in both contexts.
try {
  setupZoneTestEnv();
} catch (e: any) {
  if (!String(e?.message ?? '').includes('already been called')) throw e;
}

// Polyfill jasmine APIs not included in jest-jasmine2's lightweight implementation
declare const jasmine: any;

// createSpyObj: creates an object whose methods are jasmine spies
(jasmine as any).createSpyObj = function <T>(
  baseName: string,
  methodNames: string[] | Record<string, any>,
  propertyNames?: string[] | Record<string, any>
): T {
  const obj: Record<string, any> = {};

  const methods = Array.isArray(methodNames) ? methodNames : Object.keys(methodNames);
  for (const method of methods) {
    const defaultValue = !Array.isArray(methodNames) ? methodNames[method] : undefined;
    obj[method] = jasmine.createSpy(`${baseName}.${method}`);
    if (defaultValue !== undefined) {
      obj[method].and.returnValue(defaultValue);
    }
  }

  if (propertyNames) {
    if (Array.isArray(propertyNames)) {
      for (const prop of propertyNames) {
        obj[prop] = undefined;
      }
    } else {
      // Object form: each property is a getter spy so tests can use
      // (Object.getOwnPropertyDescriptor(spy, 'prop')!.get as jasmine.Spy).and.returnValue(...)
      for (const [prop, defaultVal] of Object.entries(propertyNames)) {
        const getterSpy = jasmine.createSpy(`${baseName}.${prop}`);
        getterSpy.and.returnValue(defaultVal);
        Object.defineProperty(obj, prop, {
          get: getterSpy,
          configurable: true,
          enumerable: true,
        });
      }
    }
  }

  return obj as T;
};

// stringContaining: maps to expect.stringContaining
if (!jasmine.stringContaining) {
  (jasmine as any).stringContaining = (str: string) => expect.stringContaining(str);
}

// Override jasmine asymmetric matchers to return jest's native equivalents.
// jest-jasmine2's built-in versions use jasmineMatches() which jest's toContain
// does not recognise - only jest's own expect.* matchers are fully supported.
(jasmine as any).objectContaining = (sample: Record<string, any>) => expect.objectContaining(sample);
(jasmine as any).arrayContaining = (sample: any[]) => expect.arrayContaining(sample);
(jasmine as any).any = (expectedClass: any) => expect.any(expectedClass);
(jasmine as any).anything = () => expect.anything();

// expectAsync: Jasmine 3+ async assertion polyfill
// Always wraps in Promise.resolve() so non-Promise values (undefined etc.) work.
(global as any).expectAsync = (value: any) => {
  const p = Promise.resolve(value);
  return {
    toBeResolved: async () => { await p; },
    toBeResolvedTo: (expected: any) => expect(p).resolves.toEqual(expected),
    toBeRejected: () => expect(p).rejects.toBeDefined(),
    toBeRejectedWith: (val: any) => expect(p).rejects.toEqual(val),
    toBeRejectedWithError: (val: any) => expect(p).rejects.toThrow(val),
    not: {
      toBeResolved: () => expect(p).rejects.toBeDefined(),
      toBeRejected: async () => { await p; },
    },
  };
};

// jsdom missing browser APIs
if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = jest.fn().mockReturnValue('blob:mock-url');
}
if (typeof URL.revokeObjectURL === 'undefined') {
  URL.revokeObjectURL = jest.fn();
}
if (typeof window !== 'undefined' && !window.speechSynthesis) {
  Object.defineProperty(window, 'speechSynthesis', {
    value: {
      cancel: jest.fn(),
      speak: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      getVoices: jest.fn().mockReturnValue([]),
      pending: false,
      speaking: false,
      paused: false,
    },
    writable: true,
  });
}
if (typeof window !== 'undefined' && !window.fetch) {
  (window as any).fetch = jest.fn().mockResolvedValue({ ok: true, json: jest.fn() });
}

// Blob.text() and Blob.arrayBuffer() are not in older jsdom versions
if (typeof Blob !== 'undefined' && !Blob.prototype.text) {
  Blob.prototype.text = function (): Promise<string> {
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsText(this);
    });
  };
}
if (typeof Blob !== 'undefined' && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function (): Promise<ArrayBuffer> {
    return new Promise<ArrayBuffer>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(this);
    });
  };
}

// clock: delegate to jest fake timers
if (!jasmine.clock) {
  (jasmine as any).clock = () => ({
    install: () => { jest.useFakeTimers(); return jasmine.clock(); },
    uninstall: () => jest.useRealTimers(),
    tick: (millis: number) => jest.advanceTimersByTime(millis),
    mockDate: (date?: Date) => {
      if (date) jest.setSystemTime(date);
    },
  });
}

// Fetch API: jsdom 26 does not expose Response/Request/Headers by default.
// Polyfill a minimal Response so specs can do `new Response(body, init)`.
if (typeof (global as any).Response === 'undefined') {
  (global as any).Response = class MockResponse {
    private _body: string | null;
    status: number;
    ok: boolean;
    headers: { get: (name: string) => string | null };

    constructor(
      body?: string | null,
      init: { status?: number; headers?: Record<string, string> } = {}
    ) {
      this._body = typeof body === 'string' ? body : null;
      this.status = init.status ?? 200;
      this.ok = this.status >= 200 && this.status < 300;
      const hdrs: Record<string, string> = {};
      if (init.headers) {
        for (const [k, v] of Object.entries(init.headers)) {
          hdrs[k.toLowerCase()] = v;
        }
      }
      this.headers = { get: (name: string) => hdrs[name.toLowerCase()] ?? null };
    }

    async json() { return JSON.parse(this._body!); }
    async text() { return this._body ?? ''; }
  };
}

// SpeechSynthesisUtterance is not in jsdom.
if (typeof (global as any).SpeechSynthesisUtterance === 'undefined') {
  (global as any).SpeechSynthesisUtterance = class MockSpeechSynthesisUtterance {
    text: string;
    lang = '';
    rate = 1;
    pitch = 1;
    volume = 1;
    voice: any = null;
    constructor(text = '') { this.text = text; }
  };
}

// Replace sessionStorage and localStorage with plain objects whose methods are
// own writable properties. jsdom's Storage uses a Proxy that intercepts property
// assignment, preventing spyOn from installing spies that actually intercept calls.
function createStorageMock(): Storage {
  const store: Record<string, string> = {};
  return {
    getItem(key: string): string | null {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key: string, value: string): void { store[key] = String(value); },
    removeItem(key: string): void { delete store[key]; },
    clear(): void { Object.keys(store).forEach(k => delete store[k]); },
    key(index: number): string | null { return Object.keys(store)[index] ?? null; },
    get length(): number { return Object.keys(store).length; },
  } as Storage;
}

if (typeof window !== 'undefined') {
  try {
    Object.defineProperty(window, 'sessionStorage', {
      value: createStorageMock(),
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'localStorage', {
      value: createStorageMock(),
      writable: true,
      configurable: true,
    });
  } catch {
    // If already non-configurable in this environment, leave as-is
  }
}
