/**
 * Test Helper Functions
 * 
 * Common utility functions and mocks for testing the KRDS MCP server.
 * Provides consistent mock objects, test data generators, and assertion helpers.
 * 
 * @author KRDS MCP Server
 * @version 1.0.0
 */

import { jest } from '@jest/globals';
import type { Logger } from 'winston';
import type { 
  ToolContext, 
  ServerConfig,
  KrdsDocument, 
  KrdsSearchResult,
  KoreanTextAnalysis,
  CacheEntry,
  CacheStats 
} from '@/types/index.js';

/**
 * Creates a mock Winston logger for testing
 */
export function createMockLogger(): jest.Mocked<Logger> {
  return {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
    level: 'info',
    levels: {},
    format: {} as any,
    transports: [],
    exitOnError: true,
    silent: false,
    emitErrs: false,
    add: jest.fn(),
    remove: jest.fn(),
    clear: jest.fn(),
    close: jest.fn(),
    query: jest.fn(),
    stream: jest.fn(),
    configure: jest.fn(),
    child: jest.fn().mockReturnThis(),
    profile: jest.fn(),
    profiler: jest.fn(),
    startTimer: jest.fn(),
    setMaxListeners: jest.fn(),
    getMaxListeners: jest.fn(),
    emit: jest.fn(),
    addListener: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
    off: jest.fn(),
    removeAllListeners: jest.fn(),
    listeners: jest.fn(),
    rawListeners: jest.fn(),
    listenerCount: jest.fn(),
    prependListener: jest.fn(),
    prependOnceListener: jest.fn(),
    eventNames: jest.fn(),
  } as any;
}

/**
 * Creates a mock server configuration for testing
 */
export function createMockConfig(): ServerConfig {
  return {
    server: {
      name: 'krds-mcp-server-test',
      version: '1.0.0-test',
      port: 3000,
      environment: 'test',
    },
    krds: {
      baseUrl: 'https://v04.krds.go.kr',
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      userAgent: 'KRDS-MCP-Server-Test/1.0.0',
      rateLimiting: {
        enabled: true,
        requestsPerMinute: 60,
        concurrentRequests: 5,
      },
    },
    scraping: {
      puppeteer: {
        headless: true,
        slowMo: 0,
        timeout: 30000,
        viewport: { width: 1920, height: 1080 },
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
      retry: {
        maxAttempts: 3,
        delayMs: 1000,
        backoffMultiplier: 2,
      },
    },
    cache: {
      type: 'memory',
      ttl: 3600,
      maxSize: 1024 * 1024 * 100,
      memory: {
        maxMemoryMB: 100,
        cleanupInterval: 300,
      },
    },
    korean: {
      enabled: true,
      features: {
        stemming: true,
        romanization: true,
        hangulProcessing: true,
        keywordExtraction: true,
      },
    },
    logging: {
      level: 'error',
      fileEnabled: false,
      consoleEnabled: true,
    },
    security: {
      cors: {
        enabled: true,
        origin: '*',
      },
      rateLimit: {
        windowMs: 60000,
        maxRequests: 100,
      },
      helmet: {
        enabled: true,
      },
    },
    export: {
      maxFileSizeMB: 50,
      allowedFormats: ['json', 'csv', 'xlsx', 'pdf'],
      defaultFormat: 'json',
    },
  };
}

/**
 * Creates a mock tool context for testing MCP tools
 */
export function createMockToolContext(overrides: Partial<ToolContext> = {}): ToolContext {
  const mockLogger = createMockLogger();
  const mockConfig = createMockConfig();

  const defaultMocks = {
    krdsService: {
      scrapeDocument: jest.fn(),
      searchDocuments: jest.fn(),
      getDocument: jest.fn(),
      validateUrl: jest.fn(),
      getNavigationTree: jest.fn(),
      listCategories: jest.fn(),
      browseCategory: jest.fn(),
    },
    cacheManager: {
      get: jest.fn(),
      set: jest.fn(),
      has: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
      keys: jest.fn(),
      size: jest.fn(),
      stats: jest.fn(),
      healthCheck: jest.fn(),
    },
    logger: mockLogger,
    config: mockConfig,
  };

  return { ...defaultMocks, ...overrides } as ToolContext;
}

/**
 * Creates a mock KRDS document for testing
 */
export function createMockDocument(overrides: Partial<KrdsDocument> = {}): KrdsDocument {
  const defaultDocument: KrdsDocument = {
    id: 'test-doc-123',
    title: 'Test Government Policy Document',
    titleKorean: '테스트 정부 정책 문서',
    url: 'https://v04.krds.go.kr/test/document/123',
    category: '정책',
    subcategory: '교육정책',
    content: 'This is a test document content with policy information.',
    contentKorean: '이것은 정책 정보가 포함된 테스트 문서 내용입니다.',
    metadata: {
      agency: 'Ministry of Education',
      agencyKorean: '교육부',
      publicationDate: new Date('2024-01-15'),
      documentType: '정책보고서',
      keywords: ['policy', 'education', 'government'],
      keywordsKorean: ['정책', '교육', '정부'],
      language: 'ko',
      classification: 'public',
      status: 'active',
    },
    images: [],
    attachments: [],
    createdAt: new Date('2024-01-15T09:00:00Z'),
    updatedAt: new Date('2024-01-15T10:30:00Z'),
    scrapedAt: new Date('2024-01-15T11:00:00Z'),
  };

  return { ...defaultDocument, ...overrides };
}

/**
 * Creates a mock search result for testing
 */
export function createMockSearchResult(overrides: Partial<KrdsSearchResult> = {}): KrdsSearchResult {
  const documents = overrides.documents || [
    createMockDocument(),
    createMockDocument({
      id: 'test-doc-124',
      title: 'Another Test Document',
      titleKorean: '또 다른 테스트 문서',
    }),
  ];

  const defaultResult: KrdsSearchResult = {
    documents,
    totalCount: documents.length,
    currentPage: 1,
    totalPages: 1,
    hasNext: false,
    hasPrevious: false,
    searchQuery: {
      query: 'test query',
      queryKorean: '테스트 검색어',
      page: 1,
      limit: 20,
      sortBy: 'relevance',
      sortOrder: 'desc',
    },
    executionTimeMs: 1200,
  };

  return { ...defaultResult, ...overrides };
}

/**
 * Creates a mock Korean text analysis result
 */
export function createMockKoreanAnalysis(overrides: Partial<KoreanTextAnalysis> = {}): KoreanTextAnalysis {
  const defaultAnalysis: KoreanTextAnalysis = {
    originalText: '한국 정부의 새로운 정책 발표',
    romanized: 'hangug jeongbuui saeroun jeongchaeg balpyo',
    stemmed: ['한국', '정부', '새롭다', '정책', '발표'],
    keywords: ['한국', '정부', '정책', '발표'],
    sentiment: 'positive',
    readabilityScore: 7.5,
    wordCount: 6,
    characterCount: 15,
  };

  return { ...defaultAnalysis, ...overrides };
}

/**
 * Creates a mock cache entry
 */
export function createMockCacheEntry<T>(value: T, overrides: Partial<CacheEntry<T>> = {}): CacheEntry<T> {
  const now = Date.now();
  
  const defaultEntry: CacheEntry<T> = {
    key: 'test:cache:key',
    value,
    expiresAt: now + 3600000, // 1 hour from now
    createdAt: now,
    accessCount: 1,
    lastAccessed: now,
    tags: ['test'],
    isKorean: false,
    contentType: 'application/json',
    size: JSON.stringify(value).length,
    compressed: false,
  };

  return { ...defaultEntry, ...overrides };
}

/**
 * Creates mock cache statistics
 */
export function createMockCacheStats(overrides: Partial<CacheStats> = {}): CacheStats {
  const defaultStats: CacheStats = {
    totalKeys: 100,
    hitCount: 80,
    missCount: 20,
    hitRate: 0.8,
    memoryUsage: 10 * 1024 * 1024, // 10MB
    oldestEntry: Date.now() - 3600000, // 1 hour ago
    newestEntry: Date.now(),
  };

  return { ...defaultStats, ...overrides };
}

/**
 * Test assertion helpers
 */
export const assertions = {
  /**
   * Asserts that a function was called before another function
   */
  expectCalledBefore(firstFn: jest.MockedFunction<any>, secondFn: jest.MockedFunction<any>) {
    const firstCallTime = firstFn.mock.invocationCallOrder[0];
    const secondCallTime = secondFn.mock.invocationCallOrder[0];
    
    expect(firstCallTime).toBeLessThan(secondCallTime);
  },

  /**
   * Asserts that a Korean text contains specific keywords
   */
  expectKoreanKeywords(analysis: KoreanTextAnalysis, expectedKeywords: string[]) {
    expectedKeywords.forEach(keyword => {
      expect(analysis.keywords).toContain(keyword);
    });
  },

  /**
   * Asserts that romanization follows expected patterns
   */
  expectValidRomanization(romanized: string) {
    // Should not contain Korean characters
    expect(romanized).not.toMatch(/[가-힣]/);
    // Should be lowercase
    expect(romanized).toBe(romanized.toLowerCase());
    // Should not have consecutive spaces
    expect(romanized).not.toMatch(/\s{2,}/);
  },

  /**
   * Asserts that a document has required Korean fields
   */
  expectKoreanDocument(document: KrdsDocument) {
    expect(document.titleKorean).toBeDefined();
    expect(document.contentKorean).toBeDefined();
    expect(document.metadata.agencyKorean).toBeDefined();
    expect(document.metadata.keywordsKorean).toBeInstanceOf(Array);
    expect(document.metadata.language).toMatch(/ko/);
  },

  /**
   * Asserts that cache statistics are valid
   */
  expectValidCacheStats(stats: CacheStats) {
    expect(stats.hitCount).toBeGreaterThanOrEqual(0);
    expect(stats.missCount).toBeGreaterThanOrEqual(0);
    expect(stats.totalKeys).toBe(stats.hitCount + stats.missCount);
    expect(stats.hitRate).toBeGreaterThanOrEqual(0);
    expect(stats.hitRate).toBeLessThanOrEqual(1);
    expect(stats.memoryUsage).toBeGreaterThanOrEqual(0);
    expect(stats.oldestEntry).toBeLessThanOrEqual(stats.newestEntry);
  },
};

/**
 * Performance measurement utilities
 */
export const performance = {
  /**
   * Measures execution time of an async function
   */
  async measure<T>(fn: () => Promise<T>): Promise<{ result: T; timeMs: number }> {
    const startTime = Date.now();
    const result = await fn();
    const timeMs = Date.now() - startTime;
    return { result, timeMs };
  },

  /**
   * Runs a function multiple times and returns performance statistics
   */
  async benchmark(
    fn: () => Promise<any>, 
    iterations: number = 10
  ): Promise<{
    iterations: number;
    totalTimeMs: number;
    averageTimeMs: number;
    minTimeMs: number;
    maxTimeMs: number;
  }> {
    const times: number[] = [];
    
    for (let i = 0; i < iterations; i++) {
      const { timeMs } = await this.measure(fn);
      times.push(timeMs);
    }

    const totalTimeMs = times.reduce((sum, time) => sum + time, 0);
    const averageTimeMs = totalTimeMs / iterations;
    const minTimeMs = Math.min(...times);
    const maxTimeMs = Math.max(...times);

    return {
      iterations,
      totalTimeMs,
      averageTimeMs,
      minTimeMs,
      maxTimeMs,
    };
  },
};

/**
 * Test data generators
 */
export const generators = {
  /**
   * Generates Korean text of specified length
   */
  koreanText(length: number): string {
    const koreanWords = [
      '정부', '정책', '국민', '사회', '경제', '교육', '문화', '환경',
      '기술', '개발', '발전', '미래', '혁신', '디지털', '지속가능',
      '복지', '안전', '건강', '평화', '통일', '민주주의', '자유',
    ];

    const words: string[] = [];
    let currentLength = 0;

    while (currentLength < length) {
      const word = koreanWords[Math.floor(Math.random() * koreanWords.length)];
      if (currentLength + word.length + 1 <= length) {
        words.push(word);
        currentLength += word.length + 1; // +1 for space
      } else {
        break;
      }
    }

    return words.join(' ');
  },

  /**
   * Generates a list of mock documents
   */
  documents(count: number): KrdsDocument[] {
    return Array.from({ length: count }, (_, i) => 
      createMockDocument({
        id: `doc-${i + 1}`,
        title: `Test Document ${i + 1}`,
        titleKorean: `테스트 문서 ${i + 1}`,
      })
    );
  },

  /**
   * Generates test URLs
   */
  krdsUrls(count: number): string[] {
    return Array.from({ length: count }, (_, i) => 
      `https://v04.krds.go.kr/test/document/${i + 1}`
    );
  },
};

/**
 * Wait utilities for async testing
 */
export const wait = {
  /**
   * Waits for a specified number of milliseconds
   */
  delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Waits for a condition to become true
   */
  until(condition: () => boolean, timeoutMs: number = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const check = () => {
        if (condition()) {
          resolve();
        } else if (Date.now() - startTime > timeoutMs) {
          reject(new Error('Condition timeout'));
        } else {
          setTimeout(check, 100);
        }
      };
      
      check();
    });
  },
};