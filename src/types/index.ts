/**
 * Core Type Definitions for KRDS MCP Server
 * 
 * This file contains all the essential TypeScript type definitions used
 * throughout the KRDS MCP server application. These types ensure type
 * safety and provide clear contracts between different layers.
 * 
 * Type Categories:
 * ================
 * 1. Configuration Types - Server and service configuration
 * 2. KRDS Data Types - Korean government data structures
 * 3. MCP Tool Types - Tool input/output definitions
 * 4. Service Types - Internal service interfaces
 * 5. Korean Language Types - Language processing structures
 * 6. Cache Types - Caching system definitions
 * 7. Export Types - Data export formats and options
 * 
 * @author Your Name
 * @version 1.0.0
 */

import type { Logger } from 'winston';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Main server configuration interface
 */
export interface ServerConfig {
  server: {
    name: string;
    version: string;
    port: number;
    environment: 'development' | 'production' | 'test';
  };
  krds: KrdsConfig;
  scraping: ScrapingConfig;
  cache: CacheConfig;
  korean: KoreanConfig;
  logging: LoggingConfig;
  security: SecurityConfig;
  export: ExportConfig;
}

/**
 * KRDS website-specific configuration
 */
export interface KrdsConfig {
  baseUrl: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
  userAgent: string;
  rateLimiting: {
    enabled: boolean;
    requestsPerMinute: number;
    concurrentRequests: number;
  };
}

/**
 * Web scraping configuration
 */
export interface ScrapingConfig {
  puppeteer: {
    headless: boolean;
    slowMo: number;
    timeout: number;
    viewport: {
      width: number;
      height: number;
    };
    args: string[];
  };
  retry: {
    maxAttempts: number;
    delayMs: number;
    backoffMultiplier: number;
  };
}

/**
 * Caching system configuration
 */
export interface CacheConfig {
  type: 'memory' | 'redis' | 'file' | ('memory' | 'redis' | 'file')[];
  ttl: number;
  maxSize: number;
  redis?: {
    host: string;
    port: number;
    password?: string;
    db: number;
    keyPrefix?: string;
    enableCompression?: boolean;
    enablePubSub?: boolean;
    cluster?: {
      nodes: string[];
      [key: string]: any;
    };
    poolSize?: number;
    maxRetries?: number;
  };
  file?: {
    baseDir?: string;
    maxSizeMB?: number;
    cleanupInterval?: number;
    enableCompression?: boolean;
    compressionThreshold?: number;
  };
  memory?: {
    maxMemoryMB?: number;
    cleanupInterval?: number;
  };
  strategy?: {
    defaultStrategy?: 'lru' | 'lfu' | 'ttl' | 'size' | 'adaptive' | 'korean-optimized';
    koreanContentBoost?: number;
    enablePredictive?: boolean;
  };
  monitoring?: {
    enabled?: boolean;
    metricsInterval?: number;
    alertThresholds?: {
      hitRateMin?: number;
      latencyMax?: number;
      errorRateMax?: number;
    };
  };
}

/**
 * Korean language processing configuration
 */
export interface KoreanConfig {
  enabled: boolean;
  features: {
    stemming: boolean;
    romanization: boolean;
    hangulProcessing: boolean;
    keywordExtraction: boolean;
  };
}

/**
 * Logging configuration
 */
export interface LoggingConfig {
  level: 'error' | 'warn' | 'info' | 'debug';
  fileEnabled: boolean;
  consoleEnabled: boolean;
  filePath?: string;
  maxSize?: string;
  maxFiles?: number;
}

/**
 * Security configuration
 */
export interface SecurityConfig {
  cors: {
    enabled: boolean;
    origin: string | string[];
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  helmet: {
    enabled: boolean;
  };
}

/**
 * Export functionality configuration
 */
export interface ExportConfig {
  maxFileSizeMB: number;
  allowedFormats: ExportFormat[];
  defaultFormat: ExportFormat;
}// ============================================================================
// KRDS Data Types
// ============================================================================

/**
 * KRDS document/record structure
 */
export interface KrdsDocument {
  id: string;
  title: string;
  titleKorean: string;
  url: string;
  category: string;
  subcategory?: string;
  content: string;
  contentKorean: string;
  metadata: KrdsMetadata;
  images: KrdsImage[];
  attachments: KrdsAttachment[];
  createdAt: Date;
  updatedAt: Date;
  scrapedAt: Date;
}

/**
 * KRDS document metadata
 */
export interface KrdsMetadata {
  agency: string;
  agencyKorean: string;
  publicationDate?: Date;
  documentType: string;
  keywords: string[];
  keywordsKorean: string[];
  language: 'ko' | 'ko-en' | 'en';
  classification: string;
  status: 'active' | 'archived' | 'deleted';
}

/**
 * KRDS image information
 */
export interface KrdsImage {
  id: string;
  url: string;
  alt: string;
  altKorean: string;
  caption?: string;
  captionKorean?: string;
  width?: number;
  height?: number;
  format: string;
  sizeBytes: number;
  downloadUrl?: string;
  localPath?: string;
}

/**
 * KRDS attachment information
 */
export interface KrdsAttachment {
  id: string;
  filename: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  description?: string;
  descriptionKorean?: string;
}

/**
 * KRDS search result structure
 */
export interface KrdsSearchResult {
  documents: KrdsDocument[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
  searchQuery: KrdsSearchQuery;
  executionTimeMs: number;
}

/**
 * KRDS search query parameters
 */
export interface KrdsSearchQuery {
  query: string;
  queryKorean?: string;
  category?: string;
  dateFrom?: Date;
  dateTo?: Date;
  agency?: string;
  documentType?: string;
  page: number;
  limit: number;
  sortBy: 'relevance' | 'date' | 'title';
  sortOrder: 'asc' | 'desc';
}

// ============================================================================
// MCP Tool Types
// ============================================================================

/**
 * Base MCP tool context passed to all tools
 */
export interface ToolContext {
  krdsService: any; // Will be replaced with actual service interface
  cacheManager: any; // Will be replaced with actual cache interface
  logger: Logger;
  config: ServerConfig;
}

/**
 * Content retrieval tool parameters
 */
export interface ContentRetrievalParams {
  url?: string;
  documentId?: string;
  includeImages: boolean;
  includeAttachments: boolean;
  processKoreanText: boolean;
}

/**
 * Search tool parameters
 */
export interface SearchParams extends Omit<KrdsSearchQuery, 'page' | 'limit'> {
  maxResults?: number;
  useCache?: boolean;
}

/**
 * Navigation tool parameters
 */
export interface NavigationParams {
  action: 'list_categories' | 'browse_category' | 'get_navigation_tree';
  category?: string;
  depth?: number;
}

/**
 * Export tool parameters
 */
export interface ExportParams {
  documents: KrdsDocument[] | string[]; // Documents or document IDs
  format: ExportFormat;
  includeImages: boolean;
  includeAttachments: boolean;
  filename?: string;
  options?: ExportOptions;
}

/**
 * Image tool parameters
 */
export interface ImageToolParams {
  documentId?: string;
  url?: string;
  downloadImages: boolean;
  processImages: boolean;
  maxWidth?: number;
  maxHeight?: number;
  format?: 'original' | 'webp' | 'jpeg' | 'png';
}

// ============================================================================
// Korean Language Types
// ============================================================================

/**
 * Korean text processing result
 */
export interface KoreanTextAnalysis {
  originalText: string;
  romanized: string;
  stemmed: string[];
  keywords: string[];
  sentiment?: 'positive' | 'negative' | 'neutral';
  readabilityScore?: number;
  wordCount: number;
  characterCount: number;
}// ============================================================================
// Cache Types
// ============================================================================

/**
 * Cache entry structure
 */
export interface CacheEntry<T = any> {
  key: string;
  value: T;
  expiresAt: number;
  createdAt: number;
  accessCount: number;
  lastAccessed: number;
  tags?: string[];
  isKorean?: boolean;
  contentType?: string;
  size?: number;
  compressed?: boolean;
  checksum?: string;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  totalKeys: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  memoryUsage: number;
  oldestEntry: number;
  newestEntry: number;
}

// ============================================================================
// Export Types
// ============================================================================

/**
 * Supported export formats
 */
export type ExportFormat = 'json' | 'csv' | 'xlsx' | 'pdf' | 'xml';

/**
 * Export options for different formats
 */
export interface ExportOptions {
  // JSON options
  json?: {
    pretty: boolean;
    includeMetadata: boolean;
  };
  
  // CSV options
  csv?: {
    delimiter: string;
    headers: boolean;
    encoding: 'utf8' | 'euc-kr';
  };
  
  // Excel options
  xlsx?: {
    sheetName: string;
    includeCharts: boolean;
    autoFilter: boolean;
  };
  
  // PDF options
  pdf?: {
    pageSize: 'A4' | 'Letter' | 'Legal';
    orientation: 'portrait' | 'landscape';
    margins: {
      top: number;
      right: number;
      bottom: number;
      left: number;
    };
  };
}

/**
 * Export result
 */
export interface ExportResult {
  success: boolean;
  format: ExportFormat;
  filename: string;
  filePath?: string;
  downloadUrl?: string;
  sizeBytes: number;
  documentCount: number;
  processingTimeMs: number;
  error?: string;
}

// ============================================================================
// Service Interface Types
// ============================================================================

/**
 * Base service interface
 */
export interface BaseService {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  healthCheck(): Promise<boolean>;
}

/**
 * Scraper result interface
 */
export interface ScrapeResult {
  success: boolean;
  url: string;
  content?: string;
  document?: KrdsDocument;
  images?: KrdsImage[];
  attachments?: KrdsAttachment[];
  error?: string;
  executionTimeMs: number;
  retryCount: number;
}

/**
 * Rate limiter interface
 */
export interface RateLimiter {
  checkLimit(identifier: string): Promise<boolean>;
  getRemainingRequests(identifier: string): Promise<number>;
  resetLimit(identifier: string): Promise<void>;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * KRDS-specific error types
 */
export type KrdsErrorType =
  | 'NETWORK_ERROR'
  | 'TIMEOUT_ERROR'
  | 'PARSING_ERROR'
  | 'NOT_FOUND'
  | 'ACCESS_DENIED'
  | 'RATE_LIMITED'
  | 'INVALID_REQUEST'
  | 'SERVER_ERROR'
  | 'CACHE_ERROR'
  | 'KOREAN_PROCESSING_ERROR';

/**
 * Custom error class for KRDS operations
 */
export class KrdsError extends Error {
  constructor(
    public type: KrdsErrorType,
    message: string,
    public originalError?: Error,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = 'KrdsError';
  }
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Make all properties optional recursively
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Extract promise result type
 */
export type Awaited<T> = T extends Promise<infer U> ? U : T;

/**
 * Configuration validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}