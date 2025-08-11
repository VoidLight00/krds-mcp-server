/**
 * Navigation Crawler
 * 
 * Systematically discovers and maps the navigation structure of the KRDS website.
 * Builds a comprehensive sitemap by following links, analyzing menu structures,
 * and discovering content pages with proper depth control and duplicate detection.
 * 
 * @author KRDS MCP Server
 * @version 1.0.0
 */

import type { Page, Browser } from 'puppeteer';
import type { Logger } from 'winston';
import { URL } from 'url';
import { KRDS_SELECTORS, isKrdsUrl, normalizeUrl } from './scraper-config.js';
import { KrdsRateLimiter } from './rate-limiter.js';

/**
 * Navigation node representing a discovered page
 */
export interface NavigationNode {
  id: string;
  url: string;
  title: string;
  titleKorean?: string;
  level: number;
  parentId?: string;
  children: string[];
  pageType: 'homepage' | 'category' | 'content' | 'list' | 'search' | 'unknown';
  metadata: {
    breadcrumb: string[];
    category?: string;
    lastModified?: Date;
    contentLength?: number;
    hasImages: boolean;
    hasAttachments: boolean;
    hasTable: boolean;
    language: 'ko' | 'ko-en' | 'en' | 'unknown';
  };
  discoveredAt: Date;
  lastCrawled?: Date;
  crawlStatus: 'pending' | 'success' | 'failed' | 'skipped';
  error?: string;
}

/**
 * Crawl statistics
 */
interface CrawlStats {
  pagesDiscovered: number;
  pagesCrawled: number;
  pagesSkipped: number;
  pagesFailed: number;
  totalLinks: number;
  uniqueUrls: number;
  crawlDepth: number;
  startTime: Date;
  endTime?: Date;
  duration?: number;
}

/**
 * Crawl options
 */
export interface CrawlOptions {
  maxDepth: number;
  maxPages: number;
  followExternalLinks: boolean;
  includeAssets: boolean;
  respectRobotsTxt: boolean;
  crawlDelay: number;
  timeout: number;
  skipPatterns: RegExp[];
  includePatterns: RegExp[];
}

/**
 * Default crawl options
 */
export const DEFAULT_CRAWL_OPTIONS: CrawlOptions = {
  maxDepth: 5,
  maxPages: 1000,
  followExternalLinks: false,
  includeAssets: false,
  respectRobotsTxt: true,
  crawlDelay: 1000,
  timeout: 30000,
  skipPatterns: [
    /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|exe)$/i,
    /\/download\//i,
    /\/api\//i,
    /\/admin\//i,
  ],
  includePatterns: [],
};

/**
 * Navigation structure crawler for KRDS website
 */
export class NavigationCrawler {
  private browser: Browser;
  private page: Page;
  private logger: Logger;
  private rateLimiter: KrdsRateLimiter;
  private discoveredNodes: Map<string, NavigationNode> = new Map();
  private urlQueue: Array<{ url: string; parentId?: string; level: number }> = [];
  private visitedUrls: Set<string> = new Set();
  private crawlStats: CrawlStats;
  private baseUrl: string;

  constructor(
    browser: Browser,
    logger: Logger,
    rateLimiter: KrdsRateLimiter,
    baseUrl: string = 'https://v04.krds.go.kr'
  ) {
    this.browser = browser;
    this.logger = logger;
    this.rateLimiter = rateLimiter;
    this.baseUrl = baseUrl;
    
    this.crawlStats = {
      pagesDiscovered: 0,
      pagesCrawled: 0,
      pagesSkipped: 0,
      pagesFailed: 0,
      totalLinks: 0,
      uniqueUrls: 0,
      crawlDepth: 0,
      startTime: new Date(),
    };
  }

  /**
   * Initialize crawler with a new page
   */
  async initialize(): Promise<void> {
    this.page = await this.browser.newPage();
    
    // Configure page for Korean content
    await this.page.setExtraHTTPHeaders({
      'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
    });

    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Set up request interception for better performance
    await this.page.setRequestInterception(true);
    this.page.on('request', (request) => {
      const resourceType = request.resourceType();
      
      // Block unnecessary resources during navigation discovery
      if (resourceType === 'image' || resourceType === 'media' || resourceType === 'font') {
        request.abort();
      } else {
        request.continue();
      }
    });

    this.logger.info('Navigation crawler initialized');
  }

  /**
   * Start crawling from the base URL
   */
  async crawl(options: Partial<CrawlOptions> = {}): Promise<NavigationNode[]> {
    const opts = { ...DEFAULT_CRAWL_OPTIONS, ...options };
    
    this.logger.info('Starting navigation crawl', { baseUrl: this.baseUrl, options: opts });
    this.crawlStats.startTime = new Date();

    try {
      // Add base URL to queue
      this.addToQueue(this.baseUrl, undefined, 0);
      
      while (this.urlQueue.length > 0 && this.shouldContinueCrawling(opts)) {
        const queueItem = this.urlQueue.shift()!;
        await this.crawlPage(queueItem.url, queueItem.parentId, queueItem.level, opts);
        
        // Respect crawl delay
        if (opts.crawlDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, opts.crawlDelay));
        }
      }

      this.crawlStats.endTime = new Date();
      this.crawlStats.duration = this.crawlStats.endTime.getTime() - this.crawlStats.startTime.getTime();

      this.logger.info('Navigation crawl completed', { stats: this.crawlStats });
      
      return Array.from(this.discoveredNodes.values());
    } catch (error) {
      this.logger.error('Crawl failed', { error });
      throw error;
    } finally {
      if (this.page) {
        await this.page.close();
      }
    }
  }

  /**
   * Get navigation tree structure
   */
  getNavigationTree(): NavigationNode[] {
    const nodes = Array.from(this.discoveredNodes.values());
    
    // Build tree structure
    const rootNodes: NavigationNode[] = [];
    const nodeMap = new Map<string, NavigationNode>();
    
    // First pass: create map
    nodes.forEach(node => {
      nodeMap.set(node.id, { ...node, children: [] });
    });
    
    // Second pass: build tree
    nodes.forEach(node => {
      const nodeWithChildren = nodeMap.get(node.id)!;
      
      if (node.parentId) {
        const parent = nodeMap.get(node.parentId);
        if (parent) {
          parent.children.push(node.id);
        } else {
          rootNodes.push(nodeWithChildren);
        }
      } else {
        rootNodes.push(nodeWithChildren);
      }
    });
    
    return rootNodes;
  }

  /**
   * Get crawl statistics
   */
  getStats(): CrawlStats {
    return { ...this.crawlStats };
  }

  /**
   * Find pages by criteria
   */
  findPages(criteria: {
    pageType?: NavigationNode['pageType'];
    category?: string;
    hasImages?: boolean;
    hasAttachments?: boolean;
    minContentLength?: number;
  }): NavigationNode[] {
    return Array.from(this.discoveredNodes.values()).filter(node => {
      if (criteria.pageType && node.pageType !== criteria.pageType) return false;
      if (criteria.category && node.metadata.category !== criteria.category) return false;
      if (criteria.hasImages !== undefined && node.metadata.hasImages !== criteria.hasImages) return false;
      if (criteria.hasAttachments !== undefined && node.metadata.hasAttachments !== criteria.hasAttachments) return false;
      if (criteria.minContentLength && (!node.metadata.contentLength || node.metadata.contentLength < criteria.minContentLength)) return false;
      
      return true;
    });
  }

  /**
   * Crawl individual page
   */
  private async crawlPage(
    url: string,
    parentId: string | undefined,
    level: number,
    options: CrawlOptions
  ): Promise<void> {
    // Check if already visited
    if (this.visitedUrls.has(url)) {
      return;
    }

    // Check URL patterns
    if (this.shouldSkipUrl(url, options)) {
      this.crawlStats.pagesSkipped++;
      return;
    }

    // Check robots.txt compliance
    if (options.respectRobotsTxt) {
      const allowed = await this.rateLimiter.isUrlAllowed(url);
      if (!allowed) {
        this.logger.debug('URL blocked by robots.txt', { url });
        this.crawlStats.pagesSkipped++;
        return;
      }
    }

    // Wait for rate limit
    await this.rateLimiter.waitForNextRequest('navigation', url);

    const nodeId = this.generateNodeId(url);
    this.visitedUrls.add(url);

    try {
      this.logger.debug('Crawling page', { url, level, nodeId });

      // Navigate to page
      const response = await this.page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: options.timeout,
      });

      if (!response || !response.ok()) {
        throw new Error(`HTTP ${response?.status()}: ${response?.statusText()}`);
      }

      // Extract page information
      const pageInfo = await this.extractPageInfo(url, level, parentId);
      this.discoveredNodes.set(nodeId, pageInfo);
      
      // Record successful request
      await this.rateLimiter.recordRequest('navigation');
      this.crawlStats.pagesCrawled++;

      // Discovery links for further crawling
      if (level < options.maxDepth) {
        const links = await this.discoverLinks(url, level);
        this.processDiscoveredLinks(links, nodeId, level + 1, options);
      }

    } catch (error) {
      this.logger.error('Failed to crawl page', { url, level, error });
      
      // Create failed node
      const failedNode: NavigationNode = {
        id: nodeId,
        url,
        title: 'Failed to load',
        level,
        parentId,
        children: [],
        pageType: 'unknown',
        metadata: {
          breadcrumb: [],
          hasImages: false,
          hasAttachments: false,
          hasTable: false,
          language: 'unknown',
        },
        discoveredAt: new Date(),
        crawlStatus: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      
      this.discoveredNodes.set(nodeId, failedNode);
      this.crawlStats.pagesFailed++;
    }
  }

  /**
   * Extract page information
   */
  private async extractPageInfo(
    url: string,
    level: number,
    parentId?: string
  ): Promise<NavigationNode> {
    const nodeId = this.generateNodeId(url);
    
    // Extract title
    const title = await this.page.evaluate(() => {
      const titleElement = document.querySelector('title, h1, .title, .page-title');
      return titleElement?.textContent?.trim() || 'Untitled';
    });

    // Extract Korean title if different
    const titleKorean = await this.page.evaluate(() => {
      const koreanTitleEl = document.querySelector('[lang="ko"], .title-ko, .korean-title');
      const koreanText = koreanTitleEl?.textContent?.trim();
      const hasKorean = /[\u3131-\u314e\u314f-\u3163\uac00-\ud7a3]/.test(koreanText || '');
      return hasKorean ? koreanText : undefined;
    });

    // Extract breadcrumb
    const breadcrumb = await this.page.evaluate((selectors) => {
      const breadcrumbEl = document.querySelector(selectors.breadcrumb);
      if (breadcrumbEl) {
        const items = Array.from(breadcrumbEl.querySelectorAll('a, span'));
        return items.map(item => item.textContent?.trim()).filter(Boolean);
      }
      return [];
    }, KRDS_SELECTORS.navigation);

    // Determine page type
    const pageType = await this.determinePageType();
    
    // Extract metadata
    const metadata = await this.extractMetadata();

    // Get content length
    const contentLength = await this.page.evaluate(() => {
      const contentEl = document.querySelector('.content, .body, .main-content, article');
      return contentEl?.textContent?.length || 0;
    });

    const node: NavigationNode = {
      id: nodeId,
      url,
      title,
      titleKorean,
      level,
      parentId,
      children: [],
      pageType,
      metadata: {
        ...metadata,
        contentLength,
        breadcrumb: breadcrumb as string[],
      },
      discoveredAt: new Date(),
      lastCrawled: new Date(),
      crawlStatus: 'success',
    };

    return node;
  }

  /**
   * Determine page type based on content and structure
   */
  private async determinePageType(): Promise<NavigationNode['pageType']> {
    return await this.page.evaluate(() => {
      const url = window.location.href;
      const pathname = window.location.pathname;
      
      // Check if homepage
      if (pathname === '/' || pathname === '/index.html' || pathname === '/main.html') {
        return 'homepage';
      }

      // Check for list/board pages
      if (document.querySelector('.board-list, .list, .data-list, table.board-table')) {
        return 'list';
      }

      // Check for search pages
      if (document.querySelector('.search-form, #search-form, [name*="search"]') ||
          url.includes('search') || url.includes('검색')) {
        return 'search';
      }

      // Check for category pages
      if (document.querySelector('nav, .menu, .category-list') &&
          !document.querySelector('article, .article-content, .content')) {
        return 'category';
      }

      // Default to content page
      return 'content';
    });
  }

  /**
   * Extract page metadata
   */
  private async extractMetadata() {
    return await this.page.evaluate((selectors) => {
      // Check for images
      const hasImages = document.querySelectorAll('img').length > 0;

      // Check for attachments
      const hasAttachments = document.querySelectorAll(selectors.attachments).length > 0;

      // Check for tables
      const hasTable = document.querySelectorAll('table').length > 0;

      // Determine language
      const bodyText = document.body.textContent || '';
      const hasKorean = /[\u3131-\u314e\u314f-\u3163\uac00-\ud7a3]/.test(bodyText);
      const hasEnglish = /[a-zA-Z]/.test(bodyText);
      
      let language: 'ko' | 'ko-en' | 'en' | 'unknown';
      if (hasKorean && hasEnglish) {
        language = 'ko-en';
      } else if (hasKorean) {
        language = 'ko';
      } else if (hasEnglish) {
        language = 'en';
      } else {
        language = 'unknown';
      }

      // Extract category
      const categoryEl = document.querySelector(selectors.category);
      const category = categoryEl?.textContent?.trim();

      // Extract last modified date
      const dateEl = document.querySelector(selectors.date);
      let lastModified: Date | undefined;
      if (dateEl) {
        const dateText = dateEl.textContent?.trim();
        if (dateText) {
          const parsed = new Date(dateText);
          if (!isNaN(parsed.getTime())) {
            lastModified = parsed;
          }
        }
      }

      return {
        hasImages,
        hasAttachments,
        hasTable,
        language,
        category,
        lastModified,
      };
    }, KRDS_SELECTORS.content);
  }

  /**
   * Discover links on current page
   */
  private async discoverLinks(currentUrl: string, level: number): Promise<string[]> {
    const links = await this.page.evaluate(() => {
      const linkElements = document.querySelectorAll('a[href]');
      const urls: string[] = [];
      
      linkElements.forEach(link => {
        const href = (link as HTMLAnchorElement).href;
        if (href && href.startsWith('http')) {
          urls.push(href);
        }
      });
      
      return urls;
    });

    this.crawlStats.totalLinks += links.length;
    
    // Normalize and filter links
    const normalizedLinks = links
      .map(link => normalizeUrl(link, this.baseUrl))
      .filter(link => isKrdsUrl(link))
      .filter((link, index, array) => array.indexOf(link) === index); // Remove duplicates

    this.crawlStats.uniqueUrls += normalizedLinks.length;
    
    this.logger.debug('Discovered links', {
      currentUrl,
      level,
      totalLinks: links.length,
      uniqueKrdsLinks: normalizedLinks.length,
    });

    return normalizedLinks;
  }

  /**
   * Process discovered links and add to queue
   */
  private processDiscoveredLinks(
    links: string[],
    parentId: string,
    level: number,
    options: CrawlOptions
  ): void {
    for (const link of links) {
      if (!this.visitedUrls.has(link) && !this.shouldSkipUrl(link, options)) {
        this.addToQueue(link, parentId, level);
      }
    }
  }

  /**
   * Add URL to crawl queue
   */
  private addToQueue(url: string, parentId: string | undefined, level: number): void {
    // Check if already in queue
    const alreadyQueued = this.urlQueue.some(item => item.url === url);
    if (alreadyQueued) {
      return;
    }

    this.urlQueue.push({ url, parentId, level });
    this.crawlStats.pagesDiscovered++;
    this.crawlStats.crawlDepth = Math.max(this.crawlStats.crawlDepth, level);
    
    this.logger.debug('Added to queue', { url, parentId, level });
  }

  /**
   * Check if URL should be skipped
   */
  private shouldSkipUrl(url: string, options: CrawlOptions): boolean {
    // Check external links
    if (!options.followExternalLinks && !isKrdsUrl(url)) {
      return true;
    }

    // Check skip patterns
    if (options.skipPatterns.some(pattern => pattern.test(url))) {
      return true;
    }

    // Check include patterns (if any)
    if (options.includePatterns.length > 0 && 
        !options.includePatterns.some(pattern => pattern.test(url))) {
      return true;
    }

    return false;
  }

  /**
   * Check if should continue crawling
   */
  private shouldContinueCrawling(options: CrawlOptions): boolean {
    return this.crawlStats.pagesCrawled < options.maxPages;
  }

  /**
   * Generate unique node ID from URL
   */
  private generateNodeId(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathSegments = urlObj.pathname.split('/').filter(Boolean);
      const id = pathSegments.length > 0 ? pathSegments.join('-') : 'home';
      
      // Add query parameters if present
      if (urlObj.search) {
        const params = new URLSearchParams(urlObj.search);
        const paramString = Array.from(params.entries())
          .map(([key, value]) => `${key}-${value}`)
          .join('-');
        return `${id}-${paramString}`;
      }
      
      return id;
    } catch {
      // Fallback to URL hash
      return Buffer.from(url).toString('base64').slice(0, 10);
    }
  }
}