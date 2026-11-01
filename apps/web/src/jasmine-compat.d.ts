/** expectAsync: Jasmine 3+ global async assertion */
declare function expectAsync<T>(actual: Promise<T>): {
  toBeResolved(): Promise<void>;
  toBeResolvedTo(expected: T): Promise<void>;
  toBeRejected(): Promise<void>;
  toBeRejectedWith(expected: any): Promise<void>;
  toBeRejectedWithError(expected?: any, message?: string | RegExp): Promise<void>;
  not: {
    toBeResolved(): Promise<void>;
    toBeRejected(): Promise<void>;
    toBeRejectedWith(expected: any): Promise<void>;
  };
};

/**
 * Compatibility shim: provides Jasmine TypeScript types for spec files written
 * for Karma+Jasmine. The jest-jasmine2 runner provides the Jasmine runtime so
 * .and.returnValue() etc. work; this file satisfies TypeScript.
 */
declare namespace jasmine {
  interface Spy<Fn extends (...args: any[]) => any = (...args: any[]) => any> {
    (...args: Parameters<Fn>): ReturnType<Fn>;
    and: SpyStrategy<Fn>;
    calls: Calls<Fn>;
    withArgs(...args: any[]): SpyStrategy<Fn>;
    identity: string;
  }

  interface SpyStrategy<Fn extends (...args: any[]) => any = (...args: any[]) => any> {
    returnValue(val: ReturnType<Fn>): Spy<Fn>;
    returnValue(val: any): Spy<Fn>;
    returnValues(...values: any[]): Spy<Fn>;
    throwError(msg: string | Error): Spy<Fn>;
    callFake(fn: Fn): Spy<Fn>;
    callFake(fn: (...args: any[]) => any): Spy<Fn>;
    callThrough(): Spy<Fn>;
    rejectWith(val: any): Spy<Fn>;
    resolveTo(val: any): Spy<Fn>;
    stub(): Spy<Fn>;
    exec(...args: any[]): ReturnType<Fn>;
  }

  interface Calls<Fn extends (...args: any[]) => any = (...args: any[]) => any> {
    any(): boolean;
    count(): number;
    argsFor(index: number): any[];
    allArgs(): any[][];
    all(): Array<{ object: any; args: any[]; returnValue: any }>;
    mostRecent(): { object: any; args: any[]; returnValue: any };
    first(): { object: any; args: any[]; returnValue: any };
    reset(): void;
  }

  type Func = (...args: any[]) => any;

  /**
   * SpyObj<T>: uses any for all properties so .and.returnValue() etc. compile
   * without fighting Angular 20 Signal<T> intersection constraints. The runtime
   * behavior is provided by jest-jasmine2's Jasmine spy implementation.
   */
  type SpyObj<T> = { [K in keyof T]: any };

  interface AsymmetricMatcher {
    jasmineMatches(other: any): boolean;
    jasmineToString?(): string;
  }

  function any(expectedClass: any): AsymmetricMatcher;
  function anything(): AsymmetricMatcher;
  function arrayContaining<T>(sample: T[]): AsymmetricMatcher;
  function objectContaining<T>(sample: Partial<T>): AsymmetricMatcher;
  function stringContaining(expected: string): AsymmetricMatcher;
  function stringMatching(expected: string | RegExp): AsymmetricMatcher;

  function createSpy(name?: string, originalFn?: (...args: any[]) => any): Spy;
  function createSpyObj<T>(
    baseName: string,
    methodNames: string[] | Record<string, any>,
    propertyNames?: string[] | Record<string, any>
  ): any;
  function createSpyObj(
    baseName: string,
    methodNames: string[] | Record<string, any>,
    propertyNames?: string[] | Record<string, any>
  ): any;

  interface Clock {
    tick(millis: number): void;
    uninstall(): void;
    mockDate(date?: Date): void;
    install(): Clock;
  }

  function clock(): Clock;
}
