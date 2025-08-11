/**
 * KRDS Web Scraper
 * 
 * Main scraping class that orchestrates web scraping operations for the KRDS
 * website using Puppeteer. Handles dynamic JavaScript content, extracts structured
 * data, manages caching, and ensures proper Korean text processing.
 * 
 * @author KRDS MCP Server
 * @version 1.0.0
 */

import puppeteer, { type Browser, type Page } from 'puppeteer';
import type { Logger } from 'winston';
import type { 
  ScrapingConfig, 
  KrdsDocument, 
  KrdsImage, 
  KrdsAttachment, 
  KrdsMetadata,
  ScrapeResult,
  BaseService,
  CacheEntry 
} from '@/types/index.js';
import { 
  DEFAULT_SCRAPER_CONFIG, 
  KRDS_SELECTORS, 
  KOREAN_TEXT_PATTERNS,
  EXTRACTION_CONFIG,
  PAGE_LOAD_CONFIG,
  ERROR_CONFIG,
  configurePage,
  generateCacheKey,
  isKrdsUrl,
  normalizeUrl 
} from './scraper-config.js';
import { KrdsRateLimiter } from './rate-limiter.js';
import { NavigationCrawler, type NavigationNode } from './navigation-crawler.js';
import * as cheerio from 'cheerio';

/**
 * Scraping options for individual operations
 */
export interface ScrapeOptions {
  includeImages: boolean;
  includeAttachments: boolean;
  processKoreanText: boolean;
  useCache: boolean;
  retryOnFailure: boolean;
  maxRetries: number;
  timeout: number;
  waitStrategy: keyof typeof PAGE_LOAD_CONFIG.waitStrategies;
  extractTables: boolean;
  followPagination: boolean;
  maxPages: number;
}

/**
 * Default scraping options
 */
export const DEFAULT_SCRAPE_OPTIONS: ScrapeOptions = {
  includeImages: true,
  includeAttachments: true,
  processKoreanText: true,
  useCache: true,
  retryOnFailure: true,
  maxRetries: 3,
  timeout: 30000,
  waitStrategy: 'networkidle2',
  extractTables: true,
  followPagination: false,
  maxPages: 1,
};

/**
 * Cache interface for scraping results
 */
interface ScrapingCache {
  get<T = any>(key: string): Promise<CacheEntry<T> | null>;
  set<T = any>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  has(key: string): Promise<boolean>;
}

/**
 * Main KRDS scraper implementation
 */
export class KrdsScraper implements BaseService {
  private browser: Browser | null = null;
  private config: ScrapingConfig;
  private logger: Logger;
  private rateLimiter: KrdsRateLimiter;
  private cache: ScrapingCache;
  private baseUrl: string;
  private isInitialized = false;

  constructor(
    config: ScrapingConfig,
    logger: Logger,
    cache: ScrapingCache,
    baseUrl: string = 'https://v04.krds.go.kr'
  ) {
    this.config = { ...DEFAULT_SCRAPER_CONFIG, ...config };
    this.logger = logger;
    this.cache = cache;
    this.baseUrl = baseUrl;
    this.rateLimiter = new KrdsRateLimiter(logger);
  }

  /**
   * Initialize the scraper
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    this.logger.info('Initializing KRDS scraper', { baseUrl: this.baseUrl });

    try {
      // Launch Puppeteer browser
      this.browser = await puppeteer.launch({
        headless: this.config.puppeteer.headless,
        slowMo: this.config.puppeteer.slowMo,
        args: this.config.puppeteer.args,
        defaultViewport: this.config.puppeteer.viewport,
      });

      this.logger.info('Browser launched successfully');
      this.isInitialized = true;
    } catch (error) {
      this.logger.error('Failed to initialize scraper', { error });
      throw error;
    }
  }

  /**
   * Shutdown the scraper
   */
  async shutdown(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    
    this.isInitialized = false;
    this.logger.info('KRDS scraper shut down');
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.browser || !this.isInitialized) {
        return false;
      }

      // Test basic browser functionality
      const page = await this.browser.newPage();
      await page.goto('about:blank');
      await page.close();
      
      return true;
    } catch (error) {
      this.logger.error('Health check failed', { error });
      return false;
    }
  }

  /**
   * Scrape a single page
   */
  async scrapePage(
    url: string, 
    options: Partial<ScrapeOptions> = {}
  ): Promise<ScrapeResult> {
    const opts = { ...DEFAULT_SCRAPE_OPTIONS, ...options };
    const startTime = Date.now();
    
    if (!this.browser) {
      throw new Error('Scraper not initialized');
    }

    // Normalize URL
    const normalizedUrl = normalizeUrl(url, this.baseUrl);
    
    // Check cache first
    if (opts.useCache) {
      const cacheKey = generateCacheKey('page', normalizedUrl, opts);
      const cached = await this.cache.get<KrdsDocument>(cacheKey);
      
      if (cached && cached.expiresAt > Date.now()) {
        this.logger.debug('Returning cached result', { url: normalizedUrl });
        return {
          success: true,
          url: normalizedUrl,
          document: cached.value,
          executionTimeMs: Date.now() - startTime,
          retryCount: 0,
        };
      }
    }

    let retryCount = 0;
    let lastError: Error | null = null;

    while (retryCount <= (opts.retryOnFailure ? opts.maxRetries : 0)) {
      try {
        const result = await this.performScrape(normalizedUrl, opts, retryCount);
        
        // Cache successful results
        if (result.success && result.document && opts.useCache) {
          const cacheKey = generateCacheKey('page', normalizedUrl, opts);
          await this.cache.set(cacheKey, result.document, 1800); // 30 minutes TTL
        }
        
        result.executionTimeMs = Date.now() - startTime;
        result.retryCount = retryCount;
        
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn('Scrape attempt failed', { 
          url: normalizedUrl, 
          attempt: retryCount + 1, 
          error: lastError.message 
        });

        if (!this.isRetryableError(lastError) || !opts.retryOnFailure) {
          break;
        }

        retryCount++;
        
        if (retryCount <= opts.maxRetries) {
          const delay = this.calculateRetryDelay(retryCount);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    return {
      success: false,
      url: normalizedUrl,
      error: lastError?.message || 'Unknown error',
      executionTimeMs: Date.now() - startTime,
      retryCount,
    };
  }

  /**
   * Scrape multiple pages in sequence
   */
  async scrapePages(
    urls: string[],
    options: Partial<ScrapeOptions> = {}
  ): Promise<ScrapeResult[]> {
    const results: ScrapeResult[] = [];
    
    this.logger.info('Scraping multiple pages', { count: urls.length });
    
    for (const url of urls) {
      try {
        // Wait for rate limiting
        await this.rateLimiter.waitForNextRequest('scraper', url);
        
        const result = await this.scrapePage(url, options);
        results.push(result);
        
        // Record request
        if (result.success) {
          await this.rateLimiter.recordRequest('scraper');
        }
        
        this.logger.debug('Page scraped', { 
          url, 
          success: result.success,
          contentLength: result.document?.content.length 
        });
      } catch (error) {
        this.logger.error('Failed to scrape page', { url, error });
        results.push({
          success: false,
          url,
          error: error instanceof Error ? error.message : 'Unknown error',
          executionTimeMs: 0,
          retryCount: 0,
        });
      }
    }
    
    return results;
  }

  /**
   * Discover and crawl website navigation
   */
  async crawlNavigation(options: {
    maxDepth?: number;
    maxPages?: number;
    respectRobotsTxt?: boolean;
  } = {}): Promise<NavigationNode[]> {
    if (!this.browser) {
      throw new Error('Scraper not initialized');
    }

    const crawler = new NavigationCrawler(
      this.browser,
      this.logger,
      this.rateLimiter,
      this.baseUrl
    );

    try {
      await crawler.initialize();
      const navigationNodes = await crawler.crawl({
        maxDepth: options.maxDepth || 3,
        maxPages: options.maxPages || 100,
        respectRobotsTxt: options.respectRobotsTxt ?? true,
        followExternalLinks: false,
        includeAssets: false,
        crawlDelay: 1000,
        timeout: 30000,
        skipPatterns: [
          /\.(pdf|doc|docx|xls|xlsx)$/i,
          /\/download\//i,
          /\/api\//i,
        ],
        includePatterns: [],
      });

      this.logger.info('Navigation crawl completed', { 
        nodesFound: navigationNodes.length,
        stats: crawler.getStats() 
      });

      return navigationNodes;
    } finally {
      // Crawler handles its own cleanup
    }
  }

  /**
   * Search for content on the KRDS website
   */
  async searchContent(
    query: string,
    options: {
      maxResults?: number;
      category?: string;
      dateFrom?: Date;
      dateTo?: Date;
    } = {}
  ): Promise<KrdsDocument[]> {
    // This would implement search functionality
    // For now, return empty array as search implementation depends on site structure
    this.logger.info('Search functionality not yet implemented', { query, options });
    return [];
  }

  /**
   * Perform the actual scraping operation
   */
  private async performScrape(
    url: string,
    options: ScrapeOptions,
    retryCount: number
  ): Promise<ScrapeResult> {
    const page = await this.browser!.newPage();
    
    try {
      // Configure page
      await configurePage(page, this.config);
      
      // Navigate to page
      const response = await page.goto(url, {
        waitUntil: PAGE_LOAD_CONFIG.waitStrategies[options.waitStrategy],
        timeout: options.timeout,
      });

      if (!response) {
        throw new Error('No response received');
      }

      if (!response.ok()) {
        throw new Error(`HTTP ${response.status()}: ${response.statusText()}`);
      }

      // Wait for additional content to load
      await new Promise(resolve => setTimeout(resolve, PAGE_LOAD_CONFIG.additionalWaitTime));

      // Extract document data
      const document = await this.extractDocument(page, url, options);
      
      return {
        success: true,
        url,
        document,
        executionTimeMs: 0, // Will be set by caller
        retryCount,
      };
    } finally {
      await page.close();
    }
  }

  /**
   * Extract document data from page
   */
  private async extractDocument(
    page: Page, 
    url: string, 
    options: ScrapeOptions
  ): Promise<KrdsDocument> {
    const extractedData = await page.evaluate((selectors, extractionConfig) => {
      // Extract title
      const titleEl = document.querySelector(selectors.content.title);
      const title = titleEl?.textContent?.trim() || 'Untitled';
      
      // Extract Korean title
      const titleKorean = title; // For now, assume title is in Korean

      // Extract main content
      const contentEl = document.querySelector(selectors.content.body);
      let content = contentEl?.textContent?.trim() || '';
      
      // Limit content length
      if (content.length > extractionConfig.maxContentLength) {
        content = content.substring(0, extractionConfig.maxContentLength) + '...';
      }

      // Extract metadata
      const dateEl = document.querySelector(selectors.content.date);
      const authorEl = document.querySelector(selectors.content.author);
      const categoryEl = document.querySelector(selectors.content.category);
      
      const publicationDate = dateEl?.textContent?.trim();
      const author = authorEl?.textContent?.trim();
      const category = categoryEl?.textContent?.trim();

      // Extract images
      const imageElements = document.querySelectorAll(selectors.images.content);
      const images = Array.from(imageElements).map((img: any, index) => ({
        id: `img-${index}`,
        url: img.src || '',
        alt: img.alt || '',
        altKorean: img.alt || '',
        width: img.naturalWidth || 0,
        height: img.naturalHeight || 0,
        format: img.src?.split('.').pop()?.toLowerCase() || 'unknown',
        sizeBytes: 0, // Cannot determine from DOM
      }));

      // Extract attachments
      const attachmentElements = document.querySelectorAll(selectors.content.attachments);
      const attachments = Array.from(attachmentElements).map((link: any, index) => ({
        id: `att-${index}`,
        filename: link.textContent?.trim() || `attachment-${index}`,
        url: link.href || '',
        mimeType: 'application/octet-stream', // Default
        sizeBytes: 0, // Cannot determine from DOM
        description: link.title || link.textContent?.trim() || '',
      }));

      // Extract tables
      let tableData = '';
      if (document.querySelectorAll('table').length > 0) {
        const tables = document.querySelectorAll('table');
        const tableTexts = Array.from(tables).map(table => table.textContent?.trim());
        tableData = tableTexts.join('\n\n');
      }

      // Determine language
      const hasKorean = /[\u3131-\u314e\u314f-\u3163\uac00-\ud7a3]/.test(content + title);
      const hasEnglish = /[a-zA-Z]/.test(content + title);
      
      let language: 'ko' | 'ko-en' | 'en';
      if (hasKorean && hasEnglish) {
        language = 'ko-en';
      } else if (hasKorean) {
        language = 'ko';
      } else {
        language = 'en';
      }

      return {
        title,
        titleKorean,
        content: content + (tableData ? '\n\n' + tableData : ''),
        contentKorean: content + (tableData ? '\n\n' + tableData : ''),
        publicationDate,
        author,
        category,
        images,
        attachments,
        language,
      };
    }, KRDS_SELECTORS, EXTRACTION_CONFIG);

    // Generate document ID
    const documentId = this.generateDocumentId(url);

    // Build metadata
    const metadata: KrdsMetadata = {
      agency: 'KRDS',
      agencyKorean: '한국연구데이터서비스',
      publicationDate: extractedData.publicationDate ? new Date(extractedData.publicationDate) : undefined,
      documentType: 'webpage',
      keywords: this.extractKeywords(extractedData.content),
      keywordsKorean: this.extractKeywords(extractedData.contentKorean),
      language: extractedData.language,
      classification: extractedData.category || 'general',
      status: 'active',
    };

    // Process images if requested
    let images: KrdsImage[] = [];
    if (options.includeImages) {
      images = extractedData.images.map((img: any) => ({
        ...img,
        localPath: undefined, // Would be set if downloading images
        downloadUrl: this.resolveUrl(img.url, url),
      }));
    }

    // Process attachments if requested
    let attachments: KrdsAttachment[] = [];
    if (options.includeAttachments) {
      attachments = extractedData.attachments.map((att: any) => ({
        ...att,
        url: this.resolveUrl(att.url, url),
        descriptionKorean: att.description,
      }));
    }

    const now = new Date();
    const document: KrdsDocument = {
      id: documentId,
      title: extractedData.title,
      titleKorean: extractedData.titleKorean,
      url,
      category: extractedData.category || 'general',
      content: extractedData.content,
      contentKorean: extractedData.contentKorean,
      metadata,
      images,
      attachments,
      createdAt: now,
      updatedAt: now,
      scrapedAt: now,
    };

    return document;
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    
    return ERROR_CONFIG.retryableErrors.some(errorType => 
      message.includes(errorType.toLowerCase())
    );
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(retryCount: number): number {
    const baseDelay = this.config.retry.delayMs;
    const backoffMultiplier = this.config.retry.backoffMultiplier;
    
    return Math.min(
      baseDelay * Math.pow(backoffMultiplier, retryCount - 1),
      30000 // Max 30 seconds
    );
  }

  /**
   * Generate unique document ID
   */
  private generateDocumentId(url: string): string {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname.replace(/\//g, '-').replace(/^-/, '');
      const timestamp = Date.now().toString(36);
      return `krds-${path}-${timestamp}`;
    } catch {
      return `krds-${Date.now().toString(36)}`;
    }
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    if (!text) return [];

    // Simple keyword extraction - split by common delimiters and filter
    const words = text
      .toLowerCase()
      .split(/[\s,.\-!?;:]+/)
      .filter(word => word.length > 2)
      .filter(word => !['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'].includes(word));

    // Get unique words and limit count
    const uniqueWords = Array.from(new Set(words));
    return uniqueWords.slice(0, 20);
  }

  /**
   * Resolve relative URLs
   */
  private resolveUrl(relativeUrl: string, baseUrl: string): string {
    try {
      return new URL(relativeUrl, baseUrl).href;
    } catch {
      return relativeUrl;
    }
  }

  /**
   * Get scraper statistics
   */
  public getStats(): {
    rateLimiterStats: any;
    browserConnected: boolean;
    isInitialized: boolean;
  } {
    return {
      rateLimiterStats: this.rateLimiter.getStats(),
      browserConnected: this.browser?.isConnected() || false,
      isInitialized: this.isInitialized,
    };
  }
}