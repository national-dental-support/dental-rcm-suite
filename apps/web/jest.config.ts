import type { Config } from 'jest';

const config: Config = {
  preset: 'jest-preset-angular',
  testRunner: 'jest-jasmine2',
  setupFilesAfterEnv: ['jest-extended/all', '<rootDir>/setup-jest.ts'],
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    // jest-environment-jsdom applies the `browser` export condition, which
    // causes uuid to resolve to its ESM browser build (esm-browser/index.js).
    // Jest cannot execute untransformed ESM in node_modules, so we redirect
    // uuid to its CJS dist directly, bypassing the package.json exports field.
    '^uuid$':                            '<rootDir>/node_modules/uuid/dist/cjs/index.js',
    '^@app/(.*)$':                       '<rootDir>/src/app/$1',
    '^@core/(.*)$':                      '<rootDir>/src/app/core/$1',
    '^@shared/(.*)$':                    '<rootDir>/src/app/shared/$1',
    '^@env/(.*)$':                       '<rootDir>/src/environments/$1',
    '^@assets/(.*)$':                    '<rootDir>/src/assets/$1',
    '^src/environments/(.*)$':           '<rootDir>/src/environments/$1',
    '^src/app/(.*)$':                    '<rootDir>/src/app/$1',
  },
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
};

export default config;
