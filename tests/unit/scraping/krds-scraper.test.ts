/**
 * KRDS Scraper Unit Tests
 * 
 * Comprehensive unit tests for the KRDS scraper functionality including:
 * - Basic scraping operations
 * - Korean text processing
 * - Error handling and retries
 * - Caching integration
 * - Rate limiting
 * 
 * @author KRDS MCP Server
 * @version 1.0.0
 */

import { jest } from '@jest/globals';
import type { Browser, Page } from 'puppeteer';
import { KrdsScraper } from '@/scraping/krds-scraper.js';
import type { ScrapingConfig, KrdsDocument, ScrapeResult } from '@/types/index.js';
import { createMockLogger } from '../../helpers/test-helpers.js';
import { mockKrdsDocument, mockKrdsPage } from '../../mock-data/krds-mock-data.js';

// Mock Puppeteer
const mockPage = {
  goto: jest.fn(),
  content: jest.fn(),
  evaluate: jest.fn(),
  waitForSelector: jest.fn(),
  waitForLoadState: jest.fn(),
  close: jest.fn(),
  setViewport: jest.fn(),
  setUserAgent: jest.fn(),
} as unknown as Page;

const mockBrowser = {
  newPage: jest.fn().mockResolvedValue(mockPage),
  close: jest.fn(),
} as unknown as Browser;

jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue(mockBrowser),
}));

describe('KrdsScraper', () => {
  let scraper: KrdsScraper;
  let mockLogger: any;
  let mockConfig: ScrapingConfig;
  let mockCacheManager: any;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockConfig = {
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
    };
    
    mockCacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      has: jest.fn(),
      delete: jest.fn(),
    };

    scraper = new KrdsScraper({
      config: mockConfig,
      logger: mockLogger,
      cacheManager: mockCacheManager,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with valid configuration', () => {
      expect(scraper).toBeInstanceOf(KrdsScraper);
      expect(mockLogger.info).toHaveBeenCalledWith('KrdsScraper initialized');
    });

    it('should throw error with invalid configuration', () => {
      const invalidConfig = { ...mockConfig, puppeteer: null };
      expect(() => {
        new KrdsScraper({
          config: invalidConfig as any,
          logger: mockLogger,
          cacheManager: mockCacheManager,
        });
      }).toThrow('Invalid scraping configuration');
    });
  });

  describe('scrapeDocument', () => {
    const testUrl = 'https://v04.krds.go.kr/test/document/123';

    beforeEach(() => {
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.content.mockResolvedValue(mockKrdsPage);
      mockPage.waitForSelector.mockResolvedValue(undefined);
    });

    it('should successfully scrape a document', async () => {
      mockCacheManager.has.mockResolvedValue(false);
      
      const result = await scraper.scrapeDocument(testUrl, {
        includeImages: true,
        includeAttachments: true,
        processKoreanText: true,
        useCache: false,
        retryOnFailure: true,
        maxRetries: 3,
        timeout: 30000,
      });

      expect(result.success).toBe(true);
      expect(result.document).toBeDefined();
      expect(result.document?.title).toBe('테스트 문서 제목');
      expect(result.document?.content).toContain('한국어 내용');
      expect(mockPage.goto).toHaveBeenCalledWith(testUrl, { waitUntil: 'networkidle2' });
    });

    it('should use cached document when available', async () => {
      const cachedDocument = mockKrdsDocument();
      mockCacheManager.has.mockResolvedValue(true);
      mockCacheManager.get.mockResolvedValue(cachedDocument);

      const result = await scraper.scrapeDocument(testUrl, {
        includeImages: false,
        includeAttachments: false,
        processKoreanText: false,
        useCache: true,
        retryOnFailure: false,
        maxRetries: 0,
        timeout: 30000,
      });

      expect(result.success).toBe(true);
      expect(result.document).toEqual(cachedDocument);
      expect(mockPage.goto).not.toHaveBeenCalled();
      expect(mockCacheManager.get).toHaveBeenCalled();
    });

    it('should handle network errors with retry', async () => {
      mockCacheManager.has.mockResolvedValue(false);
      mockPage.goto
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce(undefined);
      mockPage.content.mockResolvedValue(mockKrdsPage);

      const result = await scraper.scrapeDocument(testUrl, {
        includeImages: false,
        includeAttachments: false,
        processKoreanText: false,
        useCache: false,
        retryOnFailure: true,
        maxRetries: 3,
        timeout: 30000,
      });

      expect(result.success).toBe(true);
      expect(mockPage.goto).toHaveBeenCalledTimes(3);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Retrying scrape operation'),
        expect.any(Object)
      );
    });

    it('should fail after max retries', async () => {
      mockCacheManager.has.mockResolvedValue(false);
      mockPage.goto.mockRejectedValue(new Error('Network timeout'));

      const result = await scraper.scrapeDocument(testUrl, {
        includeImages: false,
        includeAttachments: false,
        processKoreanText: false,
        useCache: false,
        retryOnFailure: true,
        maxRetries: 2,
        timeout: 30000,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Max retries exceeded');
      expect(mockPage.goto).toHaveBeenCalledTimes(3); // Initial attempt + 2 retries
    });

    it('should validate KRDS URLs', async () => {
      const invalidUrl = 'https://example.com/document';
      
      const result = await scraper.scrapeDocument(invalidUrl, {
        includeImages: false,
        includeAttachments: false,
        processKoreanText: false,
        useCache: false,
        retryOnFailure: false,
        maxRetries: 0,
        timeout: 30000,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid KRDS URL');
    });

    it('should process Korean text when enabled', async () => {
      mockCacheManager.has.mockResolvedValue(false);
      mockPage.content.mockResolvedValue(`
        <html>
          <body>
            <h1 class="title">한국어 제목 테스트</h1>
            <div class="content">
              <p>이것은 한국어 내용입니다. 정부 정책에 관한 문서입니다.</p>
              <p>키워드: 정책, 정부, 한국, 테스트</p>
            </div>
          </body>
        </html>
      `);

      const result = await scraper.scrapeDocument(testUrl, {
        includeImages: false,
        includeAttachments: false,
        processKoreanText: true,
        useCache: false,
        retryOnFailure: false,
        maxRetries: 0,
        timeout: 30000,
      });

      expect(result.success).toBe(true);
      expect(result.document?.contentKorean).toContain('한국어 내용');
      expect(result.document?.metadata.keywordsKorean).toEqual(
        expect.arrayContaining(['정책', '정부', '한국'])
      );
    });

    it('should extract images when enabled', async () => {
      mockCacheManager.has.mockResolvedValue(false);
      mockPage.content.mockResolvedValue(`
        <html>
          <body>
            <h1>테스트 문서</h1>
            <img src="/images/chart1.png" alt="차트 1" data-original-title="정부 통계 차트" />
            <img src="/images/graph.jpg" alt="그래프" width="500" height="300" />
            <div class="content">문서 내용</div>
          </body>
        </html>
      `);

      const result = await scraper.scrapeDocument(testUrl, {
        includeImages: true,
        includeAttachments: false,
        processKoreanText: true,
        useCache: false,
        retryOnFailure: false,
        maxRetries: 0,
        timeout: 30000,
      });

      expect(result.success).toBe(true);
      expect(result.document?.images).toHaveLength(2);
      expect(result.document?.images[0]).toMatchObject({
        alt: '차트 1',
        altKorean: '차트 1',
        url: expect.stringContaining('chart1.png'),
      });
      expect(result.document?.images[1]).toMatchObject({
        width: 500,
        height: 300,
        format: 'jpg',
      });
    });

    it('should extract attachments when enabled', async () => {
      mockCacheManager.has.mockResolvedValue(false);
      mockPage.content.mockResolvedValue(`
        <html>
          <body>
            <h1>테스트 문서</h1>
            <div class="attachments">
              <a href="/files/report.pdf" class="attachment">정부 보고서.pdf</a>
              <a href="/files/data.xlsx" class="attachment">데이터 파일.xlsx</a>
            </div>
            <div class="content">문서 내용</div>
          </body>
        </html>
      `);

      const result = await scraper.scrapeDocument(testUrl, {
        includeImages: false,
        includeAttachments: true,
        processKoreanText: true,
        useCache: false,
        retryOnFailure: false,
        maxRetries: 0,
        timeout: 30000,
      });

      expect(result.success).toBe(true);
      expect(result.document?.attachments).toHaveLength(2);
      expect(result.document?.attachments[0]).toMatchObject({
        filename: '정부 보고서.pdf',
        mimeType: 'application/pdf',
      });
      expect(result.document?.attachments[1]).toMatchObject({
        filename: '데이터 파일.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    });

    it('should handle timeout errors', async () => {
      mockCacheManager.has.mockResolvedValue(false);
      mockPage.goto.mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Navigation timeout')), 100);
        });
      });

      const result = await scraper.scrapeDocument(testUrl, {
        includeImages: false,
        includeAttachments: false,
        processKoreanText: false,
        useCache: false,
        retryOnFailure: false,
        maxRetries: 0,
        timeout: 50,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });
  });

  describe('Korean Text Processing', () => {
    beforeEach(() => {
      mockCacheManager.has.mockResolvedValue(false);
    });

    it('should correctly identify and process Korean text', async () => {
      const koreanContent = `
        <html>
          <body>
            <h1>정부 정책 문서</h1>
            <div class="content">
              <p>이 문서는 대한민국 정부의 새로운 정책에 관한 내용입니다.</p>
              <p>주요 키워드: 정책, 정부, 행정, 국민</p>
              <ul>
                <li>첫 번째 항목: 정책 개요</li>
                <li>두 번째 항목: 추진 계획</li>
                <li>세 번째 항목: 기대 효과</li>
              </ul>
            </div>
          </body>
        </html>
      `;
      
      mockPage.content.mockResolvedValue(koreanContent);
      
      const result = await scraper.scrapeDocument(
        'https://v04.krds.go.kr/policy/doc/123',
        {
          includeImages: false,
          includeAttachments: false,
          processKoreanText: true,
          useCache: false,
          retryOnFailure: false,
          maxRetries: 0,
          timeout: 30000,
        }
      );

      expect(result.success).toBe(true);
      expect(result.document?.contentKorean).toContain('대한민국');
      expect(result.document?.metadata.keywordsKorean).toEqual(
        expect.arrayContaining(['정책', '정부', '행정'])
      );
      expect(result.document?.metadata.language).toBe('ko');
    });

    it('should handle mixed Korean-English content', async () => {
      const mixedContent = `
        <html>
          <body>
            <h1>Digital Government Policy 디지털 정부 정책</h1>
            <div class="content">
              <p>The Korean government 한국 정부 is implementing new digital policies.</p>
              <p>Key areas include AI 인공지능, IoT, and digital transformation 디지털 전환.</p>
            </div>
          </body>
        </html>
      `;
      
      mockPage.content.mockResolvedValue(mixedContent);
      
      const result = await scraper.scrapeDocument(
        'https://v04.krds.go.kr/digital/doc/456',
        {
          includeImages: false,
          includeAttachments: false,
          processKoreanText: true,
          useCache: false,
          retryOnFailure: false,
          maxRetries: 0,
          timeout: 30000,
        }
      );

      expect(result.success).toBe(true);
      expect(result.document?.content).toContain('Digital Government Policy');
      expect(result.document?.contentKorean).toContain('디지털 정부 정책');
      expect(result.document?.metadata.language).toBe('ko-en');
    });
  });

  describe('Cache Integration', () => {
    const testUrl = 'https://v04.krds.go.kr/test/doc/cache-test';

    it('should cache successful scrape results', async () => {
      mockCacheManager.has.mockResolvedValue(false);
      mockPage.content.mockResolvedValue(mockKrdsPage);

      await scraper.scrapeDocument(testUrl, {
        includeImages: false,
        includeAttachments: false,
        processKoreanText: false,
        useCache: true,
        retryOnFailure: false,
        maxRetries: 0,
        timeout: 30000,
      });

      expect(mockCacheManager.set).toHaveBeenCalledWith(
        expect.stringContaining('scrape:'),
        expect.objectContaining({
          success: true,
          document: expect.any(Object),
        }),
        expect.any(Number)
      );
    });

    it('should not cache failed scrape results', async () => {
      mockCacheManager.has.mockResolvedValue(false);
      mockPage.goto.mockRejectedValue(new Error('Network error'));

      await scraper.scrapeDocument(testUrl, {
        includeImages: false,
        includeAttachments: false,
        processKoreanText: false,
        useCache: true,
        retryOnFailure: false,
        maxRetries: 0,
        timeout: 30000,
      });

      expect(mockCacheManager.set).not.toHaveBeenCalled();
    });

    it('should invalidate cache when document is updated', async () => {
      const oldDocument = mockKrdsDocument();
      oldDocument.updatedAt = new Date('2023-01-01');
      
      mockCacheManager.has.mockResolvedValue(true);
      mockCacheManager.get.mockResolvedValue({
        document: oldDocument,
        scrapedAt: new Date('2023-01-01'),
      });

      // Mock a newer document
      mockPage.content.mockResolvedValue(mockKrdsPage);
      
      const result = await scraper.scrapeDocument(testUrl, {
        includeImages: false,
        includeAttachments: false,
        processKoreanText: false,
        useCache: true,
        retryOnFailure: false,
        maxRetries: 0,
        timeout: 30000,
      });

      expect(result.success).toBe(true);
      expect(mockCacheManager.delete).toHaveBeenCalled();
      expect(mockPage.goto).toHaveBeenCalled(); // Should scrape fresh content
    });
  });

  describe('Resource Management', () => {
    it('should initialize browser resources', async () => {
      await scraper.initialize();
      expect(mockBrowser.newPage).not.toHaveBeenCalled(); // Lazy loading
    });

    it('should cleanup browser resources', async () => {
      await scraper.initialize();
      await scraper.shutdown();
      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it('should handle cleanup errors gracefully', async () => {
      mockBrowser.close.mockRejectedValue(new Error('Browser cleanup error'));
      
      await scraper.initialize();
      await expect(scraper.shutdown()).resolves.not.toThrow();
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error during scraper shutdown',
        expect.any(Object)
      );
    });
  });

  describe('Health Check', () => {
    it('should return healthy status when browser is functional', async () => {
      await scraper.initialize();
      const isHealthy = await scraper.healthCheck();
      expect(isHealthy).toBe(true);
    });

    it('should return unhealthy status when browser fails', async () => {
      mockBrowser.newPage.mockRejectedValue(new Error('Browser error'));
      await scraper.initialize();
      
      const isHealthy = await scraper.healthCheck();
      expect(isHealthy).toBe(false);
    });
  });
});