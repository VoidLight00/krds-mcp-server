/**
 * Cache System Exports
 * 
 * Central export file for the comprehensive caching system of the KRDS MCP server.
 * Provides unified access to all cache components including managers, backends,
 * strategies, and monitoring capabilities.
 * 
 * @author KRDS MCP Server
 * @version 1.0.0
 */

// Main cache manager and backend interfaces
export {
  CacheManager,
  type CacheBackend,
  type CacheManagerOptions,
  type CacheOptions,
  type WarmupConfig,
} from './cache-manager.js';

// Memory cache implementation
export {
  MemoryCache,
  type MemoryCacheOptions,
  type MemoryCacheEntry,
} from './memory-cache.js';

// Redis cache implementation
export {
  RedisCache,
  type RedisCacheOptions,
  type RedisEntry,
} from './redis-cache.js';

// File cache implementation
export {
  FileCache,
  type FileCacheOptions,
  type FileCacheEntry,
  type FileCacheMetadata,
} from './file-cache.js';

// Cache strategies and optimization
export {
  CacheStrategies,
  type CacheStrategy,
  type StrategyConfig,
  type AccessPattern,
  type CacheRecommendation,
  type BackendRecommendation,
} from './cache-strategies.js';

// Cache monitoring and analytics
export {
  CacheMonitor,
  type CacheMetrics,
  type BackendMetrics,
  type PerformanceAlert,
  type MonitoringConfig,
  type AlertThresholds,
  type TrendAnalysis,
} from './cache-monitor.js';

// Re-export shared types from main types module
export type {
  CacheEntry,
  CacheStats,
  CacheConfig,
} from '@/types/index.js';

/**
 * Default cache configuration optimized for KRDS usage patterns
 */
export const DEFAULT_CACHE_CONFIG = {
  // Multi-backend configuration with fallbacks
  backends: ['redis', 'memory', 'file'] as const,
  
  // TTL settings optimized for Korean content
  ttl: {
    default: 60 * 60 * 1000, // 1 hour
    korean: 2 * 60 * 60 * 1000, // 2 hours for Korean content
    large: 30 * 60 * 1000, // 30 minutes for large files
    frequent: 4 * 60 * 60 * 1000, // 4 hours for frequently accessed
  },
  
  // Size limits
  memory: {
    maxSize: 1000, // Maximum number of entries
    maxMemoryMB: 100, // Maximum memory usage
  },
  
  redis: {
    host: 'localhost',
    port: 6379,
    keyPrefix: 'krds:cache:',
    enableCompression: true,
    compressionThreshold: 1024, // 1KB
  },
  
  file: {
    maxSizeMB: 500, // Maximum cache size
    cleanupInterval: 300000, // 5 minutes
    enableCompression: true,
    compressionThreshold: 10240, // 10KB
  },
  
  // Strategy configuration
  strategy: {
    defaultStrategy: 'adaptive' as const,
    koreanContentBoost: 1.2,
    sizePenaltyThreshold: 1024 * 1024, // 1MB
    enablePredictive: true,
  },
  
  // Monitoring configuration
  monitoring: {
    metricsInterval: 30000, // 30 seconds
    historyRetention: 24 * 60 * 60 * 1000, // 24 hours
    alertThresholds: {
      hitRateMin: 0.7, // 70%
      latencyMax: 1000, // 1 second
      errorRateMax: 0.05, // 5%
      memoryUtilizationMax: 0.9, // 90%
      availabilityMin: 0.95, // 95%
    },
    enableExport: true,
    enableRealTime: true,
  },
};

/**
 * Cache initialization utility function
 * 
 * Initializes and configures the complete caching system with sensible defaults
 * for KRDS-specific usage patterns including Korean text optimization.
 * 
 * @param options Partial configuration to override defaults
 * @returns Initialized cache manager
 */
export async function initializeCacheSystem(
  options: Partial<CacheManagerOptions> = {}
): Promise<CacheManager> {
  const config = {
    ...DEFAULT_CACHE_CONFIG,
    ...options.config,
  };
  
  const cacheManager = new CacheManager({
    config: config as any, // Type assertion for complex merged config
    logger: options.logger!,
    enableDistributed: options.enableDistributed,
    warmupKeys: options.warmupKeys,
  });
  
  await cacheManager.initialize();
  
  return cacheManager;
}

/**
 * Cache utilities for common operations
 */
export const CacheUtils = {
  /**
   * Generate cache key with Korean text normalization
   */
  generateKey(base: string, params?: Record<string, any>): string {
    let key = base;
    
    if (params) {
      const paramStr = Object.keys(params)
        .sort()
        .map(k => `${k}=${params[k]}`)
        .join('&');
      key += `:${paramStr}`;
    }
    
    // Normalize Korean text
    return key
      .normalize('NFC')
      .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
      .replace(/[·․‥…‧‖''""〈〉《》「」『』【】〔〕]/g, '_') // Replace Korean punctuation
      .substring(0, 250); // Limit length
  },
  
  /**
   * Detect if content contains Korean text
   */
  isKoreanContent(content: any): boolean {
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    return /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uD7B0-\uD7FF]/.test(text);
  },
  
  /**
   * Calculate recommended TTL based on content characteristics
   */
  getRecommendedTTL(content: any, accessPattern?: AccessPattern): number {
    const isKorean = this.isKoreanContent(content);
    const size = JSON.stringify(content).length;
    
    let ttl = DEFAULT_CACHE_CONFIG.ttl.default;
    
    // Korean content gets longer TTL
    if (isKorean) {
      ttl = DEFAULT_CACHE_CONFIG.ttl.korean;
    }
    
    // Large content gets shorter TTL
    if (size > 100000) { // 100KB
      ttl = DEFAULT_CACHE_CONFIG.ttl.large;
    }
    
    // Frequently accessed content gets longer TTL
    if (accessPattern && accessPattern.accessCount > 10) {
      ttl = DEFAULT_CACHE_CONFIG.ttl.frequent;
    }
    
    return ttl;
  },
  
  /**
   * Select optimal cache backend based on content characteristics
   */
  selectOptimalBackend(content: any, operation: 'read' | 'write'): string {
    const size = JSON.stringify(content).length;
    const isKorean = this.isKoreanContent(content);
    
    // Large content goes to file cache
    if (size > 1024 * 1024) { // 1MB
      return 'file';
    }
    
    // Korean content benefits from Redis compression
    if (isKorean && size > 10240) { // 10KB
      return 'redis';
    }
    
    // Small, frequently accessed content stays in memory
    return 'memory';
  },
  
  /**
   * Create cache tags based on content type and characteristics
   */
  generateTags(content: any, contentType?: string): string[] {
    const tags: string[] = [];
    
    if (this.isKoreanContent(content)) {
      tags.push('korean');
    }
    
    if (contentType) {
      tags.push(`type:${contentType}`);
    }
    
    // Add size-based tags
    const size = JSON.stringify(content).length;
    if (size > 1024 * 1024) {
      tags.push('large');
    } else if (size > 10240) {
      tags.push('medium');
    } else {
      tags.push('small');
    }
    
    // Add content-specific tags
    if (typeof content === 'object' && content !== null) {
      if (content.images && Array.isArray(content.images)) {
        tags.push('document', 'images');
      }
      
      if (content.attachments && Array.isArray(content.attachments)) {
        tags.push('document', 'attachments');
      }
      
      if (content.content && typeof content.content === 'string') {
        tags.push('textual');
      }
    }
    
    return tags;
  },
};

/**
 * Performance monitoring shortcuts
 */
export const CacheMetrics = {
  /**
   * Quick health check for cache system
   */
  async quickHealthCheck(cacheManager: CacheManager): Promise<{
    healthy: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const monitor = cacheManager.getMonitor();
    const metrics = monitor.getCurrentMetrics();
    const summary = monitor.getPerformanceSummary();
    
    const issues: string[] = [];
    const recommendations: string[] = [];
    
    // Check basic health indicators
    if (metrics.performance.hitRate < 0.6) {
      issues.push(`Low hit rate: ${(metrics.performance.hitRate * 100).toFixed(1)}%`);
      recommendations.push('Consider increasing cache size or TTL');
    }
    
    if (metrics.performance.avgLatency > 500) {
      issues.push(`High latency: ${metrics.performance.avgLatency.toFixed(0)}ms`);
      recommendations.push('Check for slow backends or network issues');
    }
    
    if (metrics.memory.utilizationRate > 0.9) {
      issues.push(`High memory usage: ${(metrics.memory.utilizationRate * 100).toFixed(1)}%`);
      recommendations.push('Consider increasing memory limits or better eviction');
    }
    
    // Check backend health
    for (const backend of Object.values(metrics.backends)) {
      if (backend.availability < 0.95) {
        issues.push(`Backend ${backend.name} availability: ${(backend.availability * 100).toFixed(1)}%`);
        recommendations.push(`Check ${backend.name} backend configuration`);
      }
    }
    
    return {
      healthy: issues.length === 0,
      issues,
      recommendations: [...recommendations, ...summary.recommendations],
    };
  },
  
  /**
   * Get cache efficiency score (0-100)
   */
  calculateEfficiencyScore(metrics: CacheMetrics): number {
    let score = 0;
    
    // Hit rate contribution (40%)
    score += metrics.performance.hitRate * 40;
    
    // Latency contribution (30%)
    const latencyScore = Math.max(0, (1000 - metrics.performance.avgLatency) / 1000);
    score += latencyScore * 30;
    
    // Memory efficiency (20%)
    const memoryEfficiency = 1 - metrics.memory.utilizationRate;
    score += memoryEfficiency * 20;
    
    // Error rate contribution (10%)
    const totalOps = metrics.operations.get + metrics.operations.set;
    const errorRate = totalOps > 0 ? metrics.errors.total / totalOps : 0;
    score += (1 - errorRate) * 10;
    
    return Math.round(Math.max(0, Math.min(100, score)));
  },
};