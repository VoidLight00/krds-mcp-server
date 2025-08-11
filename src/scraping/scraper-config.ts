/**
 * Scraper Configuration
 * 
 * Configuration settings and constants specific to web scraping operations
 * for the KRDS website. Includes Puppeteer settings, retry logic configuration,
 * and site-specific scraping parameters.
 * 
 * @author KRDS MCP Server
 * @version 1.0.0
 */

import type { Page } from 'puppeteer';
import type { ScrapingConfig } from '@/types/index.js';

/**
 * Default scraping configuration
 */
export const DEFAULT_SCRAPER_CONFIG: ScrapingConfig = {
  puppeteer: {
    headless: true,
    slowMo: 100, // Add delay between actions for stability
    timeout: 30000,
    viewport: {
      width: 1920,
      height: 1080,
    },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=VizDisplayCompositor',
    ],
  },
  retry: {
    maxAttempts: 3,
    delayMs: 1000,
    backoffMultiplier: 2,
  },
};

/**
 * KRDS website specific selectors and patterns
 */
export const KRDS_SELECTORS = {
  // Navigation selectors
  navigation: {
    mainMenu: 'nav.main-nav, .main-menu, #main-menu',
    subMenu: '.sub-menu, .dropdown-menu',
    breadcrumb: '.breadcrumb, .path',
    pagination: '.pagination, .paging',
  },
  
  // Content selectors
  content: {
    title: 'h1, .title, .page-title, .content-title',
    body: '.content, .body, .main-content, article, .article-content',
    date: '.date, .created-date, .publish-date, time',
    author: '.author, .writer, .created-by',
    category: '.category, .section, .department',
    attachments: 'a[href*=".pdf"], a[href*=".doc"], a[href*=".xls"], .attachment-list a',
  },
  
  // Table selectors
  tables: {
    dataTable: 'table, .data-table, .board-table',
    header: 'th, .table-header',
    row: 'tr, .table-row',
    cell: 'td, .table-cell',
  },
  
  // Image selectors
  images: {
    content: '.content img, article img, .main-content img',
    gallery: '.gallery img, .image-gallery img',
    thumbnail: '.thumbnail, .thumb',
  },
  
  // List selectors
  lists: {
    boardList: '.board-list, .list, .data-list',
    listItem: 'li, .list-item, .board-item',
    moreButton: '.more, .load-more, .btn-more',
  },
  
  // Form selectors
  forms: {
    search: '.search-form, #search-form, form[name="search"]',
    searchInput: 'input[name*="search"], input[type="search"]',
    searchButton: 'button[type="submit"], .btn-search, .search-btn',
  },
} as const;

/**
 * Korean text patterns for content detection
 */
export const KOREAN_TEXT_PATTERNS = {
  // Detect Korean characters
  hasKorean: /[\u3131-\u314e\u314f-\u3163\uac00-\ud7a3]/,
  
  // Common Korean government terms
  govTerms: [
    '정부', '부처', '기관', '공공', '행정', '정책', '법령',
    '규정', '지침', '고시', '공고', '발표', '시행', '개정',
    '제정', '폐지', '신설', '개선', '추진', '계획', '방안',
  ],
  
  // Date patterns in Korean
  datePatterns: [
    /\d{4}년\s*\d{1,2}월\s*\d{1,2}일/g,
    /\d{4}-\d{2}-\d{2}/g,
    /\d{4}\.\d{2}\.\d{2}/g,
  ],
  
  // Common classification terms
  classifications: [
    '분류', '유형', '종류', '구분', '범주', '영역', '분야',
    '부문', '섹션', '카테고리', '항목', '목록', '리스트',
  ],
} as const;

/**
 * Rate limiting configuration
 */
export const RATE_LIMIT_CONFIG = {
  // Requests per second (1 request per second as specified)
  requestsPerSecond: 1,
  
  // Burst allowance
  burstLimit: 3,
  
  // Cooldown period after hitting rate limit (in milliseconds)
  cooldownMs: 5000,
  
  // Maximum wait time for rate limit reset
  maxWaitTimeMs: 30000,
} as const;

/**
 * Cache configuration for scraped content
 */
export const CACHE_CONFIG = {
  // Cache TTL for different content types (in seconds)
  ttl: {
    navigation: 3600, // 1 hour
    contentPage: 1800, // 30 minutes
    searchResults: 900, // 15 minutes
    images: 7200, // 2 hours
    attachments: 3600, // 1 hour
    robotsTxt: 86400, // 24 hours
  },
  
  // Cache key prefixes
  keyPrefixes: {
    page: 'krds:page:',
    navigation: 'krds:nav:',
    search: 'krds:search:',
    image: 'krds:image:',
    attachment: 'krds:attachment:',
    robots: 'krds:robots:',
  },
} as const;

/**
 * Robots.txt compliance settings
 */
export const ROBOTS_CONFIG = {
  // Default crawl delay (in seconds)
  defaultCrawlDelay: 1,
  
  // User agent for robots.txt checking
  userAgent: 'krds-mcp-server',
  
  // Respect robots.txt by default
  respectRobotsTxt: true,
  
  // Robots.txt cache duration (in seconds)
  robotsCacheTtl: 86400, // 24 hours
  
  // Timeout for robots.txt fetch
  robotsTimeout: 5000,
} as const;

/**
 * Content extraction configuration
 */
export const EXTRACTION_CONFIG = {
  // Maximum content length per page (in characters)
  maxContentLength: 1000000, // 1MB of text
  
  // Image processing settings
  images: {
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedFormats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
    downloadImages: false, // Set to true to download images locally
    generateThumbnails: false,
    thumbnailSize: { width: 200, height: 200 },
  },
  
  // Table extraction settings
  tables: {
    maxRows: 10000,
    maxColumns: 100,
    includeHeaders: true,
    preserveFormatting: false,
  },
  
  // Text processing settings
  text: {
    removeExtraWhitespace: true,
    normalizeLineBreaks: true,
    preserveFormatting: false,
    extractKeywords: true,
    minTextLength: 10,
  },
} as const;

/**
 * Page load configuration
 */
export const PAGE_LOAD_CONFIG = {
  // Wait strategies
  waitStrategies: {
    domContentLoaded: 'domcontentloaded' as const,
    networkIdle0: 'networkidle0' as const,
    networkIdle2: 'networkidle2' as const,
  },
  
  // Default wait strategy
  defaultWaitStrategy: 'networkidle2' as const,
  
  // Additional wait times
  additionalWaitTime: 1000, // Extra 1 second after page load
  
  // JavaScript execution timeout
  jsTimeout: 10000,
  
  // Resource loading timeout
  resourceTimeout: 30000,
} as const;

/**
 * Error handling configuration
 */
export const ERROR_CONFIG = {
  // Retry conditions
  retryableErrors: [
    'TimeoutError',
    'ProtocolError',
    'NetworkError',
    'ECONNRESET',
    'ENOTFOUND',
    'ETIMEDOUT',
  ],
  
  // Non-retryable HTTP status codes
  nonRetryableStatusCodes: [
    400, 401, 403, 404, 405, 410, // Client errors
    501, 505, // Server errors that won't be fixed by retry
  ],
  
  // Error message patterns to ignore
  ignorableErrors: [
    'net::ERR_ABORTED',
    'net::ERR_FAILED',
    'Navigation timeout of',
  ],
} as const;

/**
 * Puppeteer page configuration utility
 */
export async function configurePage(page: Page, config: ScrapingConfig): Promise<void> {
  // Set viewport
  await page.setViewport(config.puppeteer.viewport);
  
  // Set user agent with Korean language support
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  
  // Set extra HTTP headers
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
  });
  
  // Block unnecessary resources to speed up scraping
  await page.setRequestInterception(true);
  
  page.on('request', (request) => {
    const resourceType = request.resourceType();
    const url = request.url();
    
    // Block ads, analytics, and other unnecessary resources
    if (
      resourceType === 'font' ||
      resourceType === 'media' ||
      url.includes('google-analytics') ||
      url.includes('googletagmanager') ||
      url.includes('doubleclick') ||
      url.includes('facebook') ||
      url.includes('twitter')
    ) {
      request.abort();
    } else {
      request.continue();
    }
  });
  
  // Set timeouts
  page.setDefaultTimeout(config.puppeteer.timeout);
  page.setDefaultNavigationTimeout(config.puppeteer.timeout);
  
  // Handle JavaScript errors gracefully
  page.on('pageerror', (error) => {
    console.warn('Page JavaScript error:', error.message);
  });
  
  // Handle console messages from the page
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.warn('Page console error:', msg.text());
    }
  });
}

/**
 * Generate cache key for a given URL and options
 */
export function generateCacheKey(
  prefix: string,
  url: string,
  options?: Record<string, any>
): string {
  const baseKey = `${prefix}${encodeURIComponent(url)}`;
  
  if (!options || Object.keys(options).length === 0) {
    return baseKey;
  }
  
  // Create a hash of options for consistent cache keys
  const optionsString = JSON.stringify(options, Object.keys(options).sort());
  const optionsHash = Buffer.from(optionsString).toString('base64').slice(0, 8);
  
  return `${baseKey}:${optionsHash}`;
}

/**
 * Check if a URL belongs to the KRDS domain
 */
export function isKrdsUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.includes('krds.go.kr');
  } catch {
    return false;
  }
}

/**
 * Normalize URL for consistent processing
 */
export function normalizeUrl(url: string, baseUrl: string = 'https://v04.krds.go.kr'): string {
  try {
    // Handle relative URLs
    if (url.startsWith('/')) {
      return new URL(url, baseUrl).href;
    }
    
    // Handle absolute URLs
    if (url.startsWith('http')) {
      return url;
    }
    
    // Handle protocol-relative URLs
    if (url.startsWith('//')) {
      return `https:${url}`;
    }
    
    // Handle relative paths
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
}