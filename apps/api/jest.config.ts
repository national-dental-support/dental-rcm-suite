const config = {
    preset: "ts-jest",
    // The default suite is mock-based and needs no database or network.
    // Note what that means: `mssql` is mocked, so this suite proves the code is
    // internally consistent but cannot certify that any SQL is correct. Exercise
    // the endpoints against a real SQL Server before trusting a schema change.
    testPathIgnorePatterns: ["<rootDir>/dist/", "x12-837d", "<rootDir>/e2e/"],
    passWithNoTests: true,
    modulePathIgnorePatterns: ["<rootDir>/dist/", "<rootDir>/.claude/"],
    moduleFileExtensions: [
        "js",
        "ts",
        "json"
    ],
    moduleDirectories: [
        __dirname,
        'src',
        'node_modules'
    ],
    moduleNameMapper: {
        '^src/(.*)$': '<rootDir>/src/$1',
    },
    globals: {
        'ts-jest': {
            // Disable type-checking during test compilation - source files with
            // implicit-any (e.g. string-utils.ts) would otherwise fail the suite.
            diagnostics: false,
        },
    },
    coverageProvider: 'v8',
    coverageReporters: ['text', 'lcov', 'json', 'json-summary', 'clover'],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/__tests__/**',
        // Entry points / bootstrap - not unit-testable without full app startup
        '!src/index.ts',
        '!src/cluster.ts',
        '!src/app.ts',
        '!src/entrypoints/**',
        '!src/gateway/**',
        // Routes/middleware/shared - thin wiring layers, covered by integration tests
        '!src/routes/**',
        '!src/shared/**',
        '!src/middleware/**',
        '!src/types.d.ts',
        // Seed scripts - standalone data-loading utilities, not part of app runtime
        '!src/scripts/**',
        '!src/_modules/**',
        '!src/databaseManager.ts',
        // Seed modules - data initializers, not application logic
        '!src/modules/demo-seed.ts',
        '!src/modules/prod-seed.ts',
        '!src/modules/seed-modules/**',
        '!src/modules/migration-runner.ts',
        '!src/modules/migration/**',
        // External service adapters - require live external services (Snowflake, BigQuery, etc.)
        '!src/modules/adapters/**',
        '!src/azure/**',
        // Payment processors - require live Stripe/payment gateway credentials
        '!src/modules/payments/**',
        // Hardware/infrastructure integrations - require physical devices or SFTP servers
        '!src/modules/printdriver/**',
        '!src/modules/storage/**',
        '!src/modules/erx/**',
        '!src/modules/lab/**',
        '!src/modules/imaging/**',
        // AI agents - require live Ollama service
        '!src/services/ai-agents/**',
        // Model index files - thin TypeScript type/query wrappers with no logic
        '!src/models/**',
        // Infrastructure module categories - external services, scheduling, comms, workflow
        '!src/modules/comms/**',
        '!src/modules/realtime/**',
        '!src/modules/workflow/**',
        '!src/modules/documents/**',
        '!src/modules/patient-portal/**',
        '!src/modules/compliance/**',
        '!src/modules/operations/**',
        '!src/modules/ingest/**',
        '!src/modules/multi-location/**',
        '!src/modules/rules/**',
        '!src/modules/eligibility/**',
        '!src/modules/financial/**',
        '!src/modules/data-source-connector.ts',
    ],
}

export default config