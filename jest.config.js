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
  
  // File Patterns
  testMatch: [
    '<rootDir>/tests/unit/**/*.test.ts',
    '<rootDir>/tests/integration/**/*.test.ts',
  ],
  
  // TypeScript Configuration
  globals: {
    'ts-jest': {
      useESM: true,
      tsconfig: 'tsconfig.json',
    },
  },
  
  // Coverage Configuration
  collectCoverage: false,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  
  // Setup Files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  
  // Performance
  maxWorkers: '50%',
  
  // Timeouts
  testTimeout: 30000,
};