/**
 * Cache Manager
 * 
 * Central cache manager that coordinates different cache backends and strategies.
 * Provides a unified interface for caching operations while supporting multiple
 * storage backends (memory, Redis, file system) with intelligent routing based
 * on data characteristics and configuration.
 * 
 * Features:
 * - Multi-backend support with automatic fallback
 * - Cache warming and preloading capabilities
 * - Korean text key normalization and encoding
 * - Intelligent cache routing based on content size and type
 * - Distributed caching coordination
 * - Performance monitoring and analytics
 * 
 * @author KRDS MCP Server
 * @version 1.0.0
 */

import type { Logger } from 'winston';
import type { CacheEntry, CacheStats, CacheConfig } from '@/types/index.js';
import { MemoryCache } from './memory-cache.js';
import { RedisCache } from './redis-cache.js';
import { FileCache } from './file-cache.js';
import { CacheStrategies, type CacheStrategy } from './cache-strategies.js';
import { CacheMonitor } from './cache-monitor.js';
import { KrdsError } from '@/types/index.js';

export interface CacheBackend {
  name: string;
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
  has(key: string): Promise<boolean>;
  keys(pattern?: string): Promise<string[]>;
  size(): Promise<number>;
  stats(): Promise<CacheStats>;
  healthCheck(): Promise<boolean>;
}

export interface CacheManagerOptions {
  config: CacheConfig;
  logger: Logger;
  enableDistributed?: boolean;
  warmupKeys?: string[];
}

export interface CacheOptions {
  ttl?: number;
  strategy?: CacheStrategy;
  forceBackend?: string;
  tags?: string[];
  compress?: boolean;
  priority?: 'low' | 'medium' | 'high';
}

export interface WarmupConfig {
  keys: string[];
  batchSize?: number;
  concurrency?: number;
  onProgress?: (completed: number, total: number) => void;
  onError?: (key: string, error: Error) => void;
}

/**
 * Central cache manager with multi-backend support
 */
export class CacheManager {
  private backends: Map<string, CacheBackend> = new Map();
  private primaryBackend: string;
  private strategies: CacheStrategies;
  private monitor: CacheMonitor;
  private logger: Logger;
  private config: CacheConfig;
  private enableDistributed: boolean;
  private isInitialized = false;

  // Korean text key normalization patterns
  private static readonly HANGUL_NORMALIZE_PATTERNS = {
    // Normalize Hangul composition forms
    composed: /[\uAC00-\uD7AF]/g,
    decomposed: /[\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uD7B0-\uD7FF]/g,
    // Common Korean punctuation and spacing
    punctuation: /[·․‥…‧‖''""〈〉《》「」『』【】〔〕]/g,
  };

  constructor(options: CacheManagerOptions) {
    this.config = options.config;
    this.logger = options.logger;
    this.enableDistributed = options.enableDistributed || false;
    
    this.strategies = new CacheStrategies(this.logger);
    this.monitor = new CacheMonitor(this.logger);
    
    this.primaryBackend = this.determinePrimaryBackend();
    
    this.logger.info('Cache manager initialized', {
      primaryBackend: this.primaryBackend,
      distributed: this.enableDistributed,
      backends: this.config.type,
    });
  }

  /**
   * Initialize cache manager and backends
   */
  async initialize(): Promise<void> {
    try {
      await this.initializeBackends();
      await this.monitor.initialize();
      
      // Perform health checks
      await this.performHealthChecks();
      
      // Start background tasks
      this.startBackgroundTasks();
      
      this.isInitialized = true;
      this.logger.info('Cache manager initialization completed');
      
    } catch (error) {
      this.logger.error('Failed to initialize cache manager', { error });
      throw new KrdsError('CACHE_ERROR', 'Cache manager initialization failed', error as Error);
    }
  }

  /**
   * Shutdown cache manager and cleanup resources
   */
  async shutdown(): Promise<void> {
    try {
      this.logger.info('Shutting down cache manager');
      
      // Stop background tasks
      this.stopBackgroundTasks();
      
      // Close all backends
      for (const [name, backend] of this.backends) {
        try {
          if ('close' in backend && typeof backend.close === 'function') {
            await (backend as any).close();
          }
          this.logger.debug(`Backend ${name} closed`);
        } catch (error) {
          this.logger.error(`Error closing backend ${name}`, { error });
        }
      }
      
      await this.monitor.shutdown();
      this.isInitialized = false;
      
      this.logger.info('Cache manager shutdown completed');
      
    } catch (error) {
      this.logger.error('Error during cache manager shutdown', { error });
    }
  }

  /**
   * Get value from cache with automatic backend selection
   */
  async get<T>(key: string, options?: CacheOptions): Promise<T | null> {
    const normalizedKey = this.normalizeKey(key);
    const backend = this.selectBackend(normalizedKey, 'read', options);
    
    try {
      const startTime = Date.now();
      const value = await backend.get<T>(normalizedKey);
      const duration = Date.now() - startTime;
      
      // Record metrics
      await this.monitor.recordOperation('get', backend.name, duration, value !== null);
      
      if (value !== null) {
        this.logger.debug('Cache hit', { key: normalizedKey, backend: backend.name, duration });
        
        // Update access patterns for strategy optimization
        await this.strategies.recordAccess(normalizedKey, backend.name);
      } else {
        this.logger.debug('Cache miss', { key: normalizedKey, backend: backend.name, duration });
      }
      
      return value;
      
    } catch (error) {
      await this.monitor.recordError('get', backend.name, error as Error);
      this.logger.error('Cache get operation failed', {
        key: normalizedKey,
        backend: backend.name,
        error,
      });
      
      // Try fallback backend if available
      return this.tryFallbackGet<T>(normalizedKey, backend.name, options);
    }
  }

  /**
   * Set value in cache with intelligent backend routing
   */
  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    const normalizedKey = this.normalizeKey(key);
    const ttl = options?.ttl || this.config.ttl;
    const strategy = options?.strategy || 'lru';
    
    try {
      // Apply caching strategy
      const shouldCache = await this.strategies.shouldCache(normalizedKey, value, strategy);
      if (!shouldCache) {
        this.logger.debug('Value rejected by caching strategy', { key: normalizedKey, strategy });
        return;
      }
      
      // Select appropriate backends based on value characteristics
      const backends = this.selectBackendsForSet(normalizedKey, value, options);
      const startTime = Date.now();
      
      // Write to all selected backends
      await Promise.allSettled(
        backends.map(async (backend) => {
          try {
            await backend.set(normalizedKey, value, ttl);
            this.logger.debug('Cache set successful', {
              key: normalizedKey,
              backend: backend.name,
              ttl,
            });
          } catch (error) {
            this.logger.error('Cache set failed', {
              key: normalizedKey,
              backend: backend.name,
              error,
            });
            throw error;
          }
        })
      );
      
      const duration = Date.now() - startTime;
      
      // Record successful set operation
      await this.monitor.recordOperation('set', backends[0].name, duration, true);
      
      // Update strategy metrics
      await this.strategies.recordSet(normalizedKey, backends.map(b => b.name), strategy);
      
    } catch (error) {
      await this.monitor.recordError('set', this.primaryBackend, error as Error);
      this.logger.error('Cache set operation failed', { key: normalizedKey, error });
      throw new KrdsError('CACHE_ERROR', `Failed to cache key: ${normalizedKey}`, error as Error);
    }
  }

  /**
   * Delete value from all backends
   */
  async delete(key: string): Promise<boolean> {
    const normalizedKey = this.normalizeKey(key);
    let deleted = false;
    
    // Delete from all backends
    for (const [backendName, backend] of this.backends) {
      try {
        const result = await backend.delete(normalizedKey);
        deleted = deleted || result;
        
        this.logger.debug('Cache delete operation', {
          key: normalizedKey,
          backend: backendName,
          deleted: result,
        });
        
      } catch (error) {
        await this.monitor.recordError('delete', backendName, error as Error);
        this.logger.error('Cache delete failed', {
          key: normalizedKey,
          backend: backendName,
          error,
        });
      }
    }
    
    return deleted;
  }

  /**
   * Clear all caches
   */
  async clear(): Promise<void> {
    const errors: Error[] = [];
    
    for (const [backendName, backend] of this.backends) {
      try {
        await backend.clear();
        this.logger.info(`Cache cleared: ${backendName}`);
      } catch (error) {
        errors.push(error as Error);
        await this.monitor.recordError('clear', backendName, error as Error);
        this.logger.error(`Failed to clear cache: ${backendName}`, { error });
      }
    }
    
    if (errors.length > 0) {
      throw new KrdsError('CACHE_ERROR', 'Failed to clear some caches', errors[0]);
    }
  }

  /**
   * Check if key exists in any backend
   */
  async has(key: string): Promise<boolean> {
    const normalizedKey = this.normalizeKey(key);
    
    for (const backend of this.backends.values()) {
      try {
        if (await backend.has(normalizedKey)) {
          return true;
        }
      } catch (error) {
        this.logger.error('Cache has check failed', {
          key: normalizedKey,
          backend: backend.name,
          error,
        });
      }
    }
    
    return false;
  }

  /**
   * Get all keys matching pattern
   */
  async keys(pattern?: string): Promise<string[]> {
    const allKeys = new Set<string>();
    
    for (const backend of this.backends.values()) {
      try {
        const keys = await backend.keys(pattern);
        keys.forEach(key => allKeys.add(key));
      } catch (error) {
        this.logger.error('Cache keys operation failed', {
          backend: backend.name,
          pattern,
          error,
        });
      }
    }
    
    return Array.from(allKeys);
  }

  /**
   * Get aggregated cache statistics
   */
  async getStats(): Promise<CacheStats> {
    const backendStats = new Map<string, CacheStats>();
    
    for (const [name, backend] of this.backends) {
      try {
        backendStats.set(name, await backend.stats());
      } catch (error) {
        this.logger.error(`Failed to get stats for backend ${name}`, { error });
      }
    }
    
    return this.aggregateStats(backendStats);
  }

  /**
   * Warm up cache with predefined keys
   */
  async warmup(config: WarmupConfig): Promise<void> {
    const { keys, batchSize = 10, concurrency = 3, onProgress, onError } = config;
    
    this.logger.info('Starting cache warmup', {
      keyCount: keys.length,
      batchSize,
      concurrency,
    });
    
    let completed = 0;
    const batches = this.chunkArray(keys, batchSize);
    
    // Process batches with controlled concurrency
    await this.processBatches(batches, concurrency, async (batch) => {
      await Promise.allSettled(
        batch.map(async (key) => {
          try {
            await this.get(key, { priority: 'low' });
            completed++;
            onProgress?.(completed, keys.length);
          } catch (error) {
            onError?.(key, error as Error);
            this.logger.error('Warmup failed for key', { key, error });
          }
        })
      );
    });
    
    this.logger.info('Cache warmup completed', { completed, total: keys.length });
  }

  /**
   * Invalidate cache entries by tags or patterns
   */
  async invalidate(options: { tags?: string[]; patterns?: string[]; keys?: string[] }): Promise<number> {
    let invalidatedCount = 0;
    
    // Direct key invalidation
    if (options.keys) {
      for (const key of options.keys) {
        if (await this.delete(key)) {
          invalidatedCount++;
        }
      }
    }
    
    // Pattern-based invalidation
    if (options.patterns) {
      for (const pattern of options.patterns) {
        const keys = await this.keys(pattern);
        for (const key of keys) {
          if (await this.delete(key)) {
            invalidatedCount++;
          }
        }
      }
    }
    
    // Tag-based invalidation (if supported by strategy)
    if (options.tags) {
      const taggedKeys = await this.strategies.getKeysByTags(options.tags);
      for (const key of taggedKeys) {
        if (await this.delete(key)) {
          invalidatedCount++;
        }
      }
    }
    
    this.logger.info('Cache invalidation completed', { invalidatedCount, options });
    return invalidatedCount;
  }

  /**
   * Get cache monitor instance for external access
   */
  getMonitor(): CacheMonitor {
    return this.monitor;
  }

  /**
   * Private methods
   */

  private determinePrimaryBackend(): string {
    if (typeof this.config.type === 'string') {
      return this.config.type;
    }
    
    // If array, prefer Redis > Memory > File
    const types = Array.isArray(this.config.type) ? this.config.type : [this.config.type];
    if (types.includes('redis')) return 'redis';
    if (types.includes('memory')) return 'memory';
    return 'file';
  }

  private async initializeBackends(): Promise<void> {
    const types = Array.isArray(this.config.type) ? this.config.type : [this.config.type];
    
    for (const type of types) {
      try {
        let backend: CacheBackend;
        
        switch (type) {
          case 'memory':
            backend = new MemoryCache({
              maxSize: this.config.maxSize,
              ttl: this.config.ttl,
              logger: this.logger,
            });
            break;
            
          case 'redis':
            if (!this.config.redis) {
              throw new Error('Redis configuration required for redis backend');
            }
            backend = new RedisCache({
              ...this.config.redis,
              ttl: this.config.ttl,
              logger: this.logger,
            });
            break;
            
          case 'file':
            backend = new FileCache({
              ttl: this.config.ttl,
              logger: this.logger,
            });
            break;
            
          default:
            throw new Error(`Unsupported cache type: ${type}`);
        }
        
        // Initialize backend if it has an initialize method
        if ('initialize' in backend && typeof backend.initialize === 'function') {
          await (backend as any).initialize();
        }
        
        this.backends.set(type, backend);
        this.logger.info(`Cache backend initialized: ${type}`);
        
      } catch (error) {
        this.logger.error(`Failed to initialize backend: ${type}`, { error });
        if (type === this.primaryBackend) {
          throw error; // Fail fast if primary backend fails
        }
      }
    }
  }

  private async performHealthChecks(): Promise<void> {
    const healthResults = new Map<string, boolean>();
    
    for (const [name, backend] of this.backends) {
      try {
        const healthy = await backend.healthCheck();
        healthResults.set(name, healthy);
        
        if (!healthy) {
          this.logger.warn(`Backend health check failed: ${name}`);
        }
      } catch (error) {
        healthResults.set(name, false);
        this.logger.error(`Backend health check error: ${name}`, { error });
      }
    }
    
    // Ensure at least one backend is healthy
    const hasHealthyBackend = Array.from(healthResults.values()).some(healthy => healthy);
    if (!hasHealthyBackend) {
      throw new Error('No healthy cache backends available');
    }
  }

  private startBackgroundTasks(): void {
    // Start cache monitoring
    this.monitor.startMonitoring();
    
    // Start strategy optimization
    this.strategies.startOptimization();
  }

  private stopBackgroundTasks(): void {
    this.monitor.stopMonitoring();
    this.strategies.stopOptimization();
  }

  private normalizeKey(key: string): string {
    // Handle Korean text normalization
    let normalized = key
      // Normalize Unicode composition
      .normalize('NFC')
      // Replace problematic Korean characters
      .replace(CacheManager.HANGUL_NORMALIZE_PATTERNS.punctuation, '_')
      // Remove null bytes and control characters
      .replace(/[\x00-\x1F\x7F]/g, '')
      // Limit key length
      .substring(0, 250);
    
    // Add prefix for Korean content identification
    if (this.containsKorean(normalized)) {
      normalized = `kr:${normalized}`;
    }
    
    return normalized;
  }

  private containsKorean(text: string): boolean {
    return CacheManager.HANGUL_NORMALIZE_PATTERNS.composed.test(text) ||
           CacheManager.HANGUL_NORMALIZE_PATTERNS.decomposed.test(text);
  }

  private selectBackend(key: string, operation: 'read' | 'write', options?: CacheOptions): CacheBackend {
    // Use forced backend if specified
    if (options?.forceBackend) {
      const backend = this.backends.get(options.forceBackend);
      if (backend) return backend;
    }
    
    // Select based on strategy recommendations
    const recommendedBackend = this.strategies.recommendBackend(key, operation, {
      backends: Array.from(this.backends.keys()),
      priority: options?.priority,
    });
    
    return this.backends.get(recommendedBackend) || this.backends.get(this.primaryBackend)!;
  }

  private selectBackendsForSet(key: string, value: any, options?: CacheOptions): CacheBackend[] {
    const selectedBackends: CacheBackend[] = [];
    const valueSize = this.estimateSize(value);
    
    // Always include primary backend
    const primary = this.backends.get(this.primaryBackend);
    if (primary) selectedBackends.push(primary);
    
    // Add additional backends based on value characteristics
    if (valueSize > 1024 * 1024) { // > 1MB
      // Large values go to file cache
      const fileCache = this.backends.get('file');
      if (fileCache && !selectedBackends.includes(fileCache)) {
        selectedBackends.push(fileCache);
      }
    } else if (options?.priority === 'high') {
      // High priority items go to memory cache
      const memCache = this.backends.get('memory');
      if (memCache && !selectedBackends.includes(memCache)) {
        selectedBackends.push(memCache);
      }
    }
    
    // For distributed caching, also write to Redis
    if (this.enableDistributed) {
      const redisCache = this.backends.get('redis');
      if (redisCache && !selectedBackends.includes(redisCache)) {
        selectedBackends.push(redisCache);
      }
    }
    
    return selectedBackends.length > 0 ? selectedBackends : [this.backends.get(this.primaryBackend)!];
  }

  private async tryFallbackGet<T>(key: string, failedBackend: string, options?: CacheOptions): Promise<T | null> {
    for (const [name, backend] of this.backends) {
      if (name === failedBackend) continue;
      
      try {
        const value = await backend.get<T>(key);
        if (value !== null) {
          this.logger.debug('Fallback cache hit', {
            key,
            failedBackend,
            fallbackBackend: name,
          });
          return value;
        }
      } catch (error) {
        this.logger.error('Fallback cache get failed', { key, backend: name, error });
      }
    }
    
    return null;
  }

  private estimateSize(value: any): number {
    try {
      return JSON.stringify(value).length * 2; // Rough UTF-16 byte estimate
    } catch {
      return 1000; // Default estimate
    }
  }

  private aggregateStats(backendStats: Map<string, CacheStats>): CacheStats {
    let totalKeys = 0;
    let hitCount = 0;
    let missCount = 0;
    let memoryUsage = 0;
    let oldestEntry = Date.now();
    let newestEntry = 0;
    
    for (const stats of backendStats.values()) {
      totalKeys += stats.totalKeys;
      hitCount += stats.hitCount;
      missCount += stats.missCount;
      memoryUsage += stats.memoryUsage;
      oldestEntry = Math.min(oldestEntry, stats.oldestEntry);
      newestEntry = Math.max(newestEntry, stats.newestEntry);
    }
    
    return {
      totalKeys,
      hitCount,
      missCount,
      hitRate: (hitCount + missCount) > 0 ? hitCount / (hitCount + missCount) : 0,
      memoryUsage,
      oldestEntry,
      newestEntry,
    };
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private async processBatches<T>(
    batches: T[],
    concurrency: number,
    processor: (batch: T) => Promise<void>
  ): Promise<void> {
    const executing: Promise<void>[] = [];
    
    for (const batch of batches) {
      const promise = processor(batch);
      executing.push(promise);
      
      if (executing.length >= concurrency) {
        await Promise.race(executing);
        const completed = executing.findIndex(p => p);
        if (completed !== -1) {
          executing.splice(completed, 1);
        }
      }
    }
    
    await Promise.all(executing);
  }
}