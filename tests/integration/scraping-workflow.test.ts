/**
 * End-to-End Scraping Workflow Integration Tests
 * 
 * Integration tests for the complete scraping workflow:
 * - Scraper + Parser + Cache integration
 * - Korean text processing pipeline
 * - Error recovery and retry mechanisms
 * - Performance under load
 * 
 * @author KRDS MCP Server
 * @version 1.0.0
 */

import { jest } from '@jest/globals';
import { KrdsScraper } from '@/scraping/krds-scraper.js';
import { KoreanTextProcessor } from '@/parsing/korean-text-processor.js';
import { CacheManager } from '@/cache/cache-manager.js';
import { ContentParser } from '@/parsing/content-parser.js';
import type { ScrapingConfig, CacheConfig, KoreanConfig } from '@/types/index.js';
import { createMockLogger } from '../helpers/test-helpers.js';

// Create a test server for integration testing
import express from 'express';
import http from 'http';

describe('Scraping Workflow Integration', () => {
  let scraper: KrdsScraper;
  let koreanProcessor: KoreanTextProcessor;
  let cacheManager: CacheManager;
  let contentParser: ContentParser;
  let mockLogger: any;
  let testServer: http.Server;
  let testPort: number;

  beforeAll(async () => {
    // Start a test server to serve mock KRDS pages
    const app = express();
    
    app.use(express.static('tests/mock-data/html-fixtures'));
    
    // Mock KRDS document endpoint
    app.get('/document/:id', (req, res) => {
      const mockHtml = `
        <!DOCTYPE html>
        <html lang="ko">
        <head>
          <meta charset="UTF-8">
          <title>테스트 문서 ${req.params.id}</title>
          <meta name="keywords" content="정책, 교육, 정부">
          <meta name="description" content="대한민국 정부 정책 문서">
        </head>
        <body>
          <div class="document-header">
            <h1 class="document-title">교육부 정책 개발 방안</h1>
            <div class="document-meta">
              <span class="agency">교육부</span>
              <span class="date">2024-01-15</span>
              <span class="type">정책보고서</span>
            </div>
          </div>
          
          <div class="document-content">
            <h2>1. 개요</h2>
            <p>본 문서는 대한민국 교육부가 수립한 새로운 교육 정책 개발 방안에 관한 내용을 다루고 있습니다.</p>
            
            <h2>2. 주요 정책</h2>
            <ul>
              <li>디지털 교육 혁신</li>
              <li>창의적 인재 양성</li>
              <li>교육 형평성 제고</li>
            </ul>
            
            <h2>3. 추진 계획</h2>
            <p>2024년부터 단계적으로 시행될 예정이며, 다음과 같은 세부 계획이 수립되었습니다:</p>
            
            <div class="statistics">
              <img src="/images/education-chart.png" alt="교육 통계 차트" width="600" height="400" />
              <p>교육 예산 배분 현황</p>
            </div>
            
            <div class="attachments">
              <h3>관련 자료</h3>
              <a href="/files/education-policy-2024.pdf" class="attachment">교육정책 상세자료.pdf</a>
              <a href="/files/budget-analysis.xlsx" class="attachment">예산분석 데이터.xlsx</a>
            </div>
          </div>
          
          <div class="document-footer">
            <p>발행: 대한민국 교육부</p>
            <p>문의: policy@moe.go.kr</p>
          </div>
        </body>
        </html>
      `;
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.send(mockHtml);
    });

    // Mock image endpoint
    app.get('/images/:filename', (req, res) => {
      res.set('Content-Type', 'image/png');
      res.send(Buffer.from('fake-image-data'));
    });

    // Mock file download endpoint
    app.get('/files/:filename', (req, res) => {
      const filename = req.params.filename;
      if (filename.endsWith('.pdf')) {
        res.set('Content-Type', 'application/pdf');
      } else if (filename.endsWith('.xlsx')) {
        res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      }
      res.send(Buffer.from(`fake-file-content-${filename}`));
    });

    testServer = app.listen(0);
    testPort = (testServer.address() as any).port;
  });

  afterAll(async () => {
    if (testServer) {
      testServer.close();
    }
  });

  beforeEach(async () => {
    mockLogger = createMockLogger();

    const scrapingConfig: ScrapingConfig = {
      puppeteer: {
        headless: true,
        slowMo: 0,
        timeout: 10000,
        viewport: { width: 1920, height: 1080 },
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
      retry: {
        maxAttempts: 2,
        delayMs: 100,
        backoffMultiplier: 1.5,
      },
    };

    const cacheConfig: CacheConfig = {
      type: 'memory',
      ttl: 3600,
      maxSize: 1024 * 1024 * 50, // 50MB
      memory: {
        maxMemoryMB: 50,
        cleanupInterval: 300,
      },
    };

    const koreanConfig: KoreanConfig = {
      enabled: true,
      features: {
        stemming: true,
        romanization: true,
        hangulProcessing: true,
        keywordExtraction: true,
      },
    };

    // Initialize components
    cacheManager = new CacheManager({
      config: cacheConfig,
      logger: mockLogger,
    });
    await cacheManager.initialize();

    koreanProcessor = new KoreanTextProcessor({
      config: koreanConfig,
      logger: mockLogger,
    });

    contentParser = new ContentParser({
      koreanProcessor,
      logger: mockLogger,
    });

    scraper = new KrdsScraper({
      config: scrapingConfig,
      logger: mockLogger,
      cacheManager,
    });
    await scraper.initialize();
  });

  afterEach(async () => {
    await scraper.shutdown();
    await cacheManager.shutdown();
  });

  describe('Complete Document Processing Workflow', () => {
    it('should process a Korean government document end-to-end', async () => {
      const testUrl = `http://localhost:${testPort}/document/policy-123`;
      
      const result = await scraper.scrapeDocument(testUrl, {
        includeImages: true,
        includeAttachments: true,
        processKoreanText: true,
        useCache: true,
        retryOnFailure: true,
        maxRetries: 2,
        timeout: 10000,
      });

      // Verify scraping success
      expect(result.success).toBe(true);
      expect(result.document).toBeDefined();

      const document = result.document!;

      // Verify basic document structure
      expect(document.title).toBe('교육부 정책 개발 방안');
      expect(document.url).toBe(testUrl);
      expect(document.content).toContain('교육 정책 개발 방안');
      expect(document.contentKorean).toContain('대한민국 교육부');

      // Verify metadata extraction
      expect(document.metadata.agency).toBe('교육부');
      expect(document.metadata.agencyKorean).toBe('교육부');
      expect(document.metadata.documentType).toBe('정책보고서');
      expect(document.metadata.language).toBe('ko');

      // Verify Korean keyword extraction
      expect(document.metadata.keywordsKorean).toEqual(
        expect.arrayContaining(['교육부', '정책', '교육', '정부'])
      );

      // Verify image extraction
      expect(document.images).toHaveLength(1);
      expect(document.images[0]).toMatchObject({
        alt: '교육 통계 차트',
        altKorean: '교육 통계 차트',
        url: expect.stringContaining('education-chart.png'),
        width: 600,
        height: 400,
      });

      // Verify attachment extraction
      expect(document.attachments).toHaveLength(2);
      expect(document.attachments[0]).toMatchObject({
        filename: '교육정책 상세자료.pdf',
        mimeType: 'application/pdf',
      });
      expect(document.attachments[1]).toMatchObject({
        filename: '예산분석 데이터.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    }, 30000);

    it('should handle mixed Korean-English content properly', async () => {
      const app = express();
      app.get('/mixed-content', (req, res) => {
        const mixedHtml = `
          <html>
          <head><title>Digital Korea Policy 디지털 한국 정책</title></head>
          <body>
            <h1>AI-based Education System 인공지능 기반 교육시스템</h1>
            <p>The Korean government 한국 정부 is implementing AI technology 인공지능 기술 in education.</p>
            <p>Key features include Machine Learning 머신러닝, Natural Language Processing 자연어처리, and IoT devices IoT 기기.</p>
            <div class="keywords">AI, 인공지능, Education, 교육, Technology, 기술</div>
          </body>
          </html>
        `;
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.send(mixedHtml);
      });
      
      const mixedServer = app.listen(0);
      const mixedPort = (mixedServer.address() as any).port;
      
      try {
        const testUrl = `http://localhost:${mixedPort}/mixed-content`;
        
        const result = await scraper.scrapeDocument(testUrl, {
          includeImages: false,
          includeAttachments: false,
          processKoreanText: true,
          useCache: false,
          retryOnFailure: false,
          maxRetries: 0,
          timeout: 10000,
        });

        expect(result.success).toBe(true);
        expect(result.document?.metadata.language).toBe('ko-en');
        expect(result.document?.contentKorean).toContain('인공지능 기반');
        expect(result.document?.content).toContain('AI-based Education');
        expect(result.document?.metadata.keywordsKorean).toEqual(
          expect.arrayContaining(['인공지능', '교육', '기술'])
        );
      } finally {
        mixedServer.close();
      }
    });
  });

  describe('Cache Integration Workflow', () => {
    it('should cache and retrieve processed documents', async () => {
      const testUrl = `http://localhost:${testPort}/document/cache-test`;
      
      // First request - should scrape and cache
      const firstResult = await scraper.scrapeDocument(testUrl, {
        includeImages: false,
        includeAttachments: false,
        processKoreanText: true,
        useCache: true,
        retryOnFailure: false,
        maxRetries: 0,
        timeout: 10000,
      });

      expect(firstResult.success).toBe(true);
      const firstExecutionTime = firstResult.executionTimeMs;

      // Second request - should use cache (much faster)
      const secondResult = await scraper.scrapeDocument(testUrl, {
        includeImages: false,
        includeAttachments: false,
        processKoreanText: true,
        useCache: true,
        retryOnFailure: false,
        maxRetries: 0,
        timeout: 10000,
      });

      expect(secondResult.success).toBe(true);
      expect(secondResult.executionTimeMs).toBeLessThan(firstExecutionTime);
      
      // Documents should be identical
      expect(secondResult.document).toEqual(firstResult.document);
    });

    it('should handle cache failures gracefully', async () => {
      // Force cache error
      jest.spyOn(cacheManager, 'set').mockRejectedValue(new Error('Cache backend error'));
      
      const testUrl = `http://localhost:${testPort}/document/cache-error-test`;
      
      const result = await scraper.scrapeDocument(testUrl, {
        includeImages: false,
        includeAttachments: false,
        processKoreanText: true,
        useCache: true,
        retryOnFailure: false,
        maxRetries: 0,
        timeout: 10000,
      });

      // Should still succeed despite cache error
      expect(result.success).toBe(true);
      expect(result.document).toBeDefined();
    });
  });

  describe('Error Recovery and Retry Workflow', () => {
    it('should retry failed operations and eventually succeed', async () => {
      // Create a server that fails first few requests
      let requestCount = 0;
      const app = express();
      
      app.get('/flaky-endpoint', (req, res) => {
        requestCount++;
        if (requestCount <= 2) {
          res.status(500).send('Server Error');
          return;
        }
        
        res.send('<html><body><h1>성공적으로 로드됨</h1><p>재시도 후 성공</p></body></html>');
      });
      
      const flakyServer = app.listen(0);
      const flakyPort = (flakyServer.address() as any).port;
      
      try {
        const testUrl = `http://localhost:${flakyPort}/flaky-endpoint`;
        
        const result = await scraper.scrapeDocument(testUrl, {
          includeImages: false,
          includeAttachments: false,
          processKoreanText: true,
          useCache: false,
          retryOnFailure: true,
          maxRetries: 3,
          timeout: 5000,
        });

        expect(result.success).toBe(true);
        expect(result.retryCount).toBe(2); // Failed twice, succeeded on third attempt
        expect(result.document?.content).toContain('재시도 후 성공');
      } finally {
        flakyServer.close();
      }
    });

    it('should fail after exceeding max retries', async () => {
      // Create a server that always fails
      const app = express();
      app.get('/always-fails', (req, res) => {
        res.status(500).send('Always fails');
      });
      
      const failingServer = app.listen(0);
      const failingPort = (failingServer.address() as any).port;
      
      try {
        const testUrl = `http://localhost:${failingPort}/always-fails`;
        
        const result = await scraper.scrapeDocument(testUrl, {
          includeImages: false,
          includeAttachments: false,
          processKoreanText: false,
          useCache: false,
          retryOnFailure: true,
          maxRetries: 2,
          timeout: 5000,
        });

        expect(result.success).toBe(false);
        expect(result.retryCount).toBe(2);
        expect(result.error).toContain('Max retries exceeded');
      } finally {
        failingServer.close();
      }
    });
  });

  describe('Performance Under Load', () => {
    it('should handle concurrent scraping requests efficiently', async () => {
      const concurrentRequests = 5;
      const testUrls = Array.from(
        { length: concurrentRequests }, 
        (_, i) => `http://localhost:${testPort}/document/concurrent-${i}`
      );

      const startTime = Date.now();
      
      const promises = testUrls.map(url => 
        scraper.scrapeDocument(url, {
          includeImages: false,
          includeAttachments: false,
          processKoreanText: true,
          useCache: true,
          retryOnFailure: false,
          maxRetries: 0,
          timeout: 10000,
        })
      );

      const results = await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      // All requests should succeed
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.document?.url).toBe(testUrls[index]);
      });

      // Should complete within reasonable time (less than 30 seconds for 5 requests)
      expect(totalTime).toBeLessThan(30000);
      
      // Log performance metrics
      console.log(`Processed ${concurrentRequests} concurrent requests in ${totalTime}ms`);
      console.log(`Average time per request: ${totalTime / concurrentRequests}ms`);
    }, 45000);

    it('should maintain cache consistency under concurrent access', async () => {
      const testUrl = `http://localhost:${testPort}/document/cache-consistency`;
      const concurrentRequests = 3;

      // Make multiple concurrent requests to the same URL
      const promises = Array.from({ length: concurrentRequests }, () => 
        scraper.scrapeDocument(testUrl, {
          includeImages: true,
          includeAttachments: true,
          processKoreanText: true,
          useCache: true,
          retryOnFailure: false,
          maxRetries: 0,
          timeout: 10000,
        })
      );

      const results = await Promise.all(promises);

      // All requests should succeed
      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      // All results should be identical (due to caching)
      const firstDocument = results[0].document;
      results.forEach(result => {
        expect(result.document).toEqual(firstDocument);
      });
    });
  });

  describe('Memory and Resource Management', () => {
    it('should not leak memory during extended operations', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      const iterations = 10;

      // Perform multiple scraping operations
      for (let i = 0; i < iterations; i++) {
        const testUrl = `http://localhost:${testPort}/document/memory-test-${i}`;
        
        const result = await scraper.scrapeDocument(testUrl, {
          includeImages: true,
          includeAttachments: true,
          processKoreanText: true,
          useCache: false, // Disable cache to test memory cleanup
          retryOnFailure: false,
          maxRetries: 0,
          timeout: 5000,
        });

        expect(result.success).toBe(true);
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      const memoryIncreaseMB = memoryIncrease / (1024 * 1024);

      console.log(`Memory increase after ${iterations} operations: ${memoryIncreaseMB.toFixed(2)}MB`);
      
      // Memory increase should be reasonable (less than 50MB for 10 operations)
      expect(memoryIncreaseMB).toBeLessThan(50);
    });

    it('should properly clean up browser resources', async () => {
      const testUrl = `http://localhost:${testPort}/document/cleanup-test`;
      
      // Perform scraping operation
      const result = await scraper.scrapeDocument(testUrl, {
        includeImages: false,
        includeAttachments: false,
        processKoreanText: false,
        useCache: false,
        retryOnFailure: false,
        maxRetries: 0,
        timeout: 5000,
      });

      expect(result.success).toBe(true);

      // Verify health check passes (resources are properly managed)
      const healthStatus = await scraper.healthCheck();
      expect(healthStatus).toBe(true);
    });
  });
});