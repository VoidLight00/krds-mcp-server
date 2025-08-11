/**
 * Scraping Module Exports
 * 
 * Central export file for all web scraping functionality in the KRDS MCP server.
 * Provides a clean API for importing scraping classes and utilities.
 * 
 * @author KRDS MCP Server
 * @version 1.0.0
 */

// Main scraper class
export { KrdsScraper, type ScrapeOptions, DEFAULT_SCRAPE_OPTIONS } from './krds-scraper.js';

// Navigation discovery
export { NavigationCrawler, type NavigationNode } from './navigation-crawler.js';

// Rate limiting with robots.txt compliance  
export { KrdsRateLimiter } from './rate-limiter.js';

// Content integration with parsing modules
export { 
  ContentIntegrator, 
  ContentIntegrationUtils,
  type EnhancedExtractionOptions,
  DEFAULT_ENHANCED_OPTIONS 
} from './content-integration.js';

// Configuration and utilities
export {
  DEFAULT_SCRAPER_CONFIG,
  KRDS_SELECTORS,
  KOREAN_TEXT_PATTERNS,
  RATE_LIMIT_CONFIG,
  CACHE_CONFIG,
  ROBOTS_CONFIG,
  EXTRACTION_CONFIG,
  PAGE_LOAD_CONFIG,
  ERROR_CONFIG,
  configurePage,
  generateCacheKey,
  isKrdsUrl,
  normalizeUrl,
} from './scraper-config.js';