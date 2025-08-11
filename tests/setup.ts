/**
 * Test Setup Configuration
 * 
 * This file configures the testing environment for the KRDS MCP server.
 * It sets up mocks, test utilities, and global test configuration.
 * 
 * @author Your Name
 * @version 1.0.0
 */

import { jest } from '@jest/globals';
import { config } from 'dotenv';

// Load test environment variables
config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise in tests

// Global test timeout
jest.setTimeout(30000);

// Mock Puppeteer for tests
jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      goto: jest.fn(),
      content: jest.fn().mockResolvedValue('<html><body>Mock content</body></html>'),
      close: jest.fn(),
    }),
    close: jest.fn(),
  }),
}));

// Mock Redis for tests
jest.mock('redis', () => ({
  createClient: jest.fn().mockReturnValue({
    connect: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    quit: jest.fn(),
  }),
}));

// Global test utilities
global.testUtils = {
  createMockDocument: () => ({
    id: 'test-doc-1',
    title: 'Test Document',
    titleKorean: '테스트 문서',
    url: 'https://v04.krds.go.kr/test/doc/1',
    category: '테스트',
    content: 'Test content',
    contentKorean: '테스트 내용',
    metadata: {
      agency: 'Test Agency',
      agencyKorean: '테스트 기관',
      publicationDate: new Date('2023-01-01'),
      documentType: '보고서',
      keywords: ['test', 'document'],
      keywordsKorean: ['테스트', '문서'],
      language: 'ko' as const,
      classification: 'public',
      status: 'active' as const,
    },
    images: [],
    attachments: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    scrapedAt: new Date(),
  }),
  
  createMockSearchResult: () => ({
    documents: [global.testUtils.createMockDocument()],
    totalCount: 1,
    currentPage: 1,
    totalPages: 1,
    hasNext: false,
    hasPrevious: false,
    searchQuery: {
      query: 'test',
      page: 1,
      limit: 20,
      sortBy: 'relevance' as const,
      sortOrder: 'desc' as const,
    },
    executionTimeMs: 100,
  }),
};

// Setup global test hooks
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
});

afterEach(() => {
  // Cleanup any test resources
});

export {};