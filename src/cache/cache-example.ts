/**
 * Cache System Integration Example
 * 
 * Demonstrates how to integrate and use the comprehensive caching system
 * with the KRDS MCP server. Shows configuration, initialization, and
 * common usage patterns for Korean content caching.
 * 
 * @author KRDS MCP Server
 * @version 1.0.0
 */

import { Logger } from 'winston';
import { setupLogger } from '@/utils/logger.js';
import {
  CacheManager,
  initializeCacheSystem,
  CacheUtils,
  CacheMetrics,
  DEFAULT_CACHE_CONFIG,
} from './index.js';
import type { 
  CacheConfig,
  KrdsDocument,
  LoggingConfig 
} from '@/types/index.js';

/**
 * Example configuration for production KRDS caching
 */
const PRODUCTION_CACHE_CONFIG: CacheConfig = {
  // Use multiple backends with Redis as primary, memory as secondary, file as tertiary
  type: ['redis', 'memory', 'file'],
  ttl: 2 * 60 * 60 * 1000, // 2 hours default TTL
  maxSize: 5000, // Allow up to 5000 cached entries
  
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
    keyPrefix: 'krds:prod:',
    enableCompression: true,
    enablePubSub: true,
    poolSize: 5,
    maxRetries: 3,
    // Cluster configuration for high availability
    cluster: process.env.REDIS_CLUSTER ? {
      nodes: process.env.REDIS_CLUSTER.split(','),
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
    } : undefined,
  },
  
  memory: {
    maxMemoryMB: 200, // 200MB memory cache
    cleanupInterval: 60000, // Clean up every minute
  },
  
  file: {
    baseDir: './cache-storage',
    maxSizeMB: 2000, // 2GB file cache
    cleanupInterval: 300000, // Clean up every 5 minutes
    enableCompression: true,
    compressionThreshold: 50 * 1024, // Compress files larger than 50KB
  },
  
  strategy: {
    defaultStrategy: 'korean-optimized',
    koreanContentBoost: 1.5,
    enablePredictive: true,
  },
  
  monitoring: {
    enabled: true,
    metricsInterval: 30000,
    alertThresholds: {
      hitRateMin: 0.75, // 75% minimum hit rate
      latencyMax: 800, // 800ms maximum latency
      errorRateMax: 0.03, // 3% maximum error rate
    },
  },
};

/**
 * Example: Initialize cache system for KRDS server
 */
export async function initializeKrdsCaching(logger: Logger): Promise<CacheManager> {
  try {
    // Initialize with production configuration
    const cacheManager = await initializeCacheSystem({
      config: PRODUCTION_CACHE_CONFIG,
      logger,
      enableDistributed: true,
      // Warm up cache with common Korean search terms
      warmupKeys: [
        'kr:search:정부',
        'kr:search:정책',
        'kr:search:공고',
        'kr:search:법령',
        'kr:category:정부정책',
        'kr:category:공공데이터',
      ],
    });
    
    logger.info('KRDS cache system initialized successfully');
    
    // Set up monitoring alerts
    const monitor = cacheManager.getMonitor();
    
    monitor.on('alert', (alert) => {
      logger.warn('Cache performance alert', {
        type: alert.type,
        severity: alert.severity,
        message: alert.message,
      });
    });
    
    monitor.on('alert-resolved', (alert) => {
      logger.info('Cache alert resolved', {
        type: alert.type,
        message: alert.message,
      });
    });
    
    // Log periodic performance summaries
    setInterval(async () => {
      const summary = monitor.getPerformanceSummary();
      const efficiency = CacheMetrics.calculateEfficiencyScore(monitor.getCurrentMetrics());
      
      logger.info('Cache performance summary', {
        efficiency: `${efficiency}%`,
        hitRate: `${(summary.overall.hitRate * 100).toFixed(1)}%`,
        avgLatency: `${summary.overall.avgLatency.toFixed(0)}ms`,
        koreanContentRatio: `${(summary.korean.contentRatio * 100).toFixed(1)}%`,
        recommendations: summary.recommendations.slice(0, 3), // Top 3 recommendations
      });
    }, 10 * 60 * 1000); // Every 10 minutes
    
    return cacheManager;
    
  } catch (error) {
    logger.error('Failed to initialize KRDS caching system', { error });
    throw error;
  }
}

/**
 * Example: Cache KRDS document with optimized settings
 */
export async function cacheKrdsDocument(
  cacheManager: CacheManager,
  document: KrdsDocument
): Promise<void> {
  // Generate optimized cache key
  const cacheKey = CacheUtils.generateKey('document', {
    id: document.id,
    category: document.category,
    agency: document.metadata.agency,
  });
  
  // Generate content tags for invalidation strategies
  const tags = CacheUtils.generateTags(document, 'krds-document');
  
  // Add document-specific tags
  tags.push(`agency:${document.metadata.agency}`);
  tags.push(`category:${document.category}`);
  tags.push(`status:${document.metadata.status}`);
  
  // Calculate recommended TTL based on content
  const ttl = CacheUtils.getRecommendedTTL(document);
  
  // Cache with Korean optimization
  await cacheManager.set(cacheKey, document, {
    ttl,
    strategy: 'korean-optimized',
    tags,
    priority: 'high', // High priority for documents
    compress: true,
  });
  
  console.log(`Cached document ${document.id} with key: ${cacheKey}`);
}

/**
 * Example: Retrieve cached document with fallback
 */
export async function getCachedDocument(
  cacheManager: CacheManager,
  documentId: string,
  category?: string,
  agency?: string
): Promise<KrdsDocument | null> {
  // Generate the same cache key used for storage
  const cacheKey = CacheUtils.generateKey('document', {
    id: documentId,
    category,
    agency,
  });
  
  try {
    const document = await cacheManager.get<KrdsDocument>(cacheKey);
    
    if (document) {
      console.log(`Cache hit for document ${documentId}`);
      return document;
    } else {
      console.log(`Cache miss for document ${documentId}`);
      return null;
    }
    
  } catch (error) {
    console.error(`Cache retrieval error for document ${documentId}:`, error);
    return null;
  }
}

/**
 * Example: Cache invalidation by agency or category
 */
export async function invalidateByTag(
  cacheManager: CacheManager,
  tag: string,
  reason: string
): Promise<void> {
  const invalidatedCount = await cacheManager.invalidate({
    tags: [tag],
  });
  
  console.log(`Invalidated ${invalidatedCount} cache entries for tag '${tag}' (${reason})`);
}

/**
 * Example: Bulk cache operations for search results
 */
export async function cacheSearchResults(
  cacheManager: CacheManager,
  searchQuery: string,
  results: KrdsDocument[]
): Promise<void> {
  // Cache the search results list
  const searchKey = CacheUtils.generateKey('search', {
    query: searchQuery,
    timestamp: Date.now(),
  });
  
  await cacheManager.set(searchKey, {
    query: searchQuery,
    results: results.map(doc => doc.id), // Store IDs only
    timestamp: Date.now(),
    count: results.length,
  }, {
    ttl: 30 * 60 * 1000, // 30 minutes for search results
    strategy: CacheUtils.isKoreanContent(searchQuery) ? 'korean-optimized' : 'lru',
    tags: ['search', CacheUtils.isKoreanContent(searchQuery) ? 'korean-search' : 'general-search'],
  });
  
  // Cache individual documents
  for (const document of results) {
    await cacheKrdsDocument(cacheManager, document);
  }
  
  console.log(`Cached search results for query: "${searchQuery}" (${results.length} documents)`);
}

/**
 * Example: Performance monitoring and health checks
 */
export async function performCacheHealthCheck(cacheManager: CacheManager): Promise<void> {
  const healthCheck = await CacheMetrics.quickHealthCheck(cacheManager);
  const monitor = cacheManager.getMonitor();
  const trends = monitor.analyzeTrends('hour');
  
  console.log('=== Cache Health Check ===');
  console.log(`Status: ${healthCheck.healthy ? 'HEALTHY' : 'NEEDS ATTENTION'}`);
  
  if (healthCheck.issues.length > 0) {
    console.log('Issues:');
    healthCheck.issues.forEach(issue => console.log(`  - ${issue}`));
  }
  
  if (healthCheck.recommendations.length > 0) {
    console.log('Recommendations:');
    healthCheck.recommendations.forEach(rec => console.log(`  - ${rec}`));
  }
  
  console.log('\n=== Performance Trends ===');
  trends.forEach(trend => {
    console.log(`${trend.metric}: ${trend.trend} (${trend.change > 0 ? '+' : ''}${trend.change.toFixed(1)}% over ${trend.period})`);
  });
  
  console.log('\n=== Current Metrics ===');
  const metrics = monitor.getCurrentMetrics();
  console.log(`Hit Rate: ${(metrics.performance.hitRate * 100).toFixed(1)}%`);
  console.log(`Avg Latency: ${metrics.performance.avgLatency.toFixed(0)}ms`);
  console.log(`Korean Content: ${metrics.korean.totalEntries} entries`);
  console.log(`Memory Usage: ${(metrics.memory.utilizationRate * 100).toFixed(1)}%`);
}

/**
 * Example usage in a typical KRDS service
 */
export async function exampleUsage(): Promise<void> {
  // Setup logger
  const loggingConfig: LoggingConfig = {
    level: 'info',
    fileEnabled: true,
    consoleEnabled: true,
    filePath: './logs/cache-example.log',
  };
  
  const logger = setupLogger(loggingConfig);
  
  try {
    // Initialize caching system
    const cacheManager = await initializeKrdsCaching(logger);
    
    // Example document to cache
    const exampleDocument: KrdsDocument = {
      id: 'doc-001',
      title: 'Government Digital Transformation Policy',
      titleKorean: '정부 디지털 전환 정책',
      url: 'https://v04.krds.go.kr/doc-001',
      category: 'policy',
      content: 'This document outlines the government digital transformation policy...',
      contentKorean: '이 문서는 정부의 디지털 전환 정책을 설명합니다...',
      metadata: {
        agency: 'Ministry of Digital Government',
        agencyKorean: '디지털정부부',
        documentType: 'policy',
        keywords: ['digital', 'transformation', 'government'],
        keywordsKorean: ['디지털', '전환', '정부'],
        language: 'ko',
        classification: 'public',
        status: 'active',
        publicationDate: new Date('2024-01-15'),
      },
      images: [],
      attachments: [],
      createdAt: new Date('2024-01-15'),
      updatedAt: new Date('2024-01-15'),
      scrapedAt: new Date(),
    };
    
    // Cache the document
    await cacheKrdsDocument(cacheManager, exampleDocument);
    
    // Retrieve from cache
    const cachedDoc = await getCachedDocument(cacheManager, 'doc-001', 'policy', 'Ministry of Digital Government');
    console.log('Retrieved document:', cachedDoc?.titleKorean);
    
    // Perform health check
    await performCacheHealthCheck(cacheManager);
    
    // Cleanup
    setTimeout(async () => {
      await cacheManager.shutdown();
    }, 5000);
    
  } catch (error) {
    logger.error('Example usage failed', { error });
  }
}

// Run example if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  exampleUsage().catch(console.error);
}