/** @type {import('jest').Config} */
export default {
  // Test Environment
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  
  // Module Configuration
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/tools/(.*)$': '<rootDir>/src/tools/$1',
    '^@/services/(.*)$': '<rootDir>/src/services/$1',
    '^@/scraping/(.*)$': '<rootDir>/src/scraping/$1',
    '^@/parsing/(.*)$': '<rootDir>/src/parsing/$1',
    '^@/cache/(.*)$': '<rootDir>/src/cache/$1',
    '^@/korean/(.*)$': '<rootDir>/src/korean/$1',
    '^@/types/(.*)$': '<rootDir>/src/types/$1',
    '^@/utils/(.*)$': '<rootDir>/src/utils/$1',
  },
  
  // E2E Test Configuration
  testMatch: [
    '<rootDir>/tests/e2e/**/*.test.ts',
  ],
  
  // TypeScript Configuration
  globals: {
    'ts-jest': {
      useESM: true,
      tsconfig: 'tsconfig.json',
    },
  },
  
  // Coverage Configuration (disabled for E2E)
  collectCoverage: false,
  
  // Setup Files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  
  // Performance
  maxWorkers: 1, // Run E2E tests sequentially
  
  // Timeouts
  testTimeout: 120000, // 2 minutes for E2E tests
  
  // Environment Variables
  setupFiles: ['<rootDir>/tests/e2e/setup-e2e.ts'],
  
  // Reporters
  reporters: [
    'default',
    [
      'jest-html-reporters',
      {
        publicDir: './coverage/e2e',
        filename: 'e2e-report.html',
        pageTitle: 'KRDS MCP Server E2E Test Report',
        includeFailureMsg: true,
        includeSuiteFailure: true,
      },
    ],
  ],
  
  // Verbose output
  verbose: true,
  
  // Detect open handles for proper cleanup
  detectOpenHandles: true,
  forceExit: false,
};