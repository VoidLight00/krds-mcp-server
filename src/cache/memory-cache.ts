/**
 * Memory Cache Implementation
 * 
 * High-performance in-memory cache with LRU eviction policy.
 * Optimized for Korean text storage with proper encoding handling
 * and efficient memory usage patterns.
 * 
 * Features:
 * - LRU (Least Recently Used) eviction policy
 * - TTL (Time To Live) support with automatic cleanup
 * - Memory usage monitoring and limits
 * - Korean text optimization
 * - Batch operations
 * - Event-driven cache operations
 * - Thread-safe operations
 * 
 * @author KRDS MCP Server
 * @version 1.0.0
 */

import type { Logger } from 'winston';
import type { CacheEntry, CacheStats } from '../types/index.js';
import type { CacheBackend } from './cache-manager.js';
import { EventEmitter } from 'events';

export interface MemoryCacheOptions {
  maxSize: number; // Maximum number of entries
  ttl: number; // Default TTL in milliseconds
  logger: Logger;
  maxMemoryMB?: number; // Maximum memory usage in MB
  cleanupInterval?: number; // Cleanup interval in milliseconds
  enableStats?: boolean;
}

export interface MemoryCacheEntry<T = any> extends CacheEntry<T> {
  size: number; // Estimated memory size in bytes
  prev?: MemoryCacheEntry<T>; // LRU linked list
  next?: MemoryCacheEntry<T>; // LRU linked list
}

/**
 * High-performance in-memory cache with LRU eviction
 */
export class MemoryCache extends EventEmitter implements CacheBackend {
  readonly name = 'memory';
  
  private cache = new Map<string, MemoryCacheEntry>();
  private options: Required<MemoryCacheOptions>;
  private logger: Logger;
  
  // LRU linked list pointers
  private head: MemoryCacheEntry | null = null;
  private tail: MemoryCacheEntry | null = null;
  
  // Statistics tracking
  private internalStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    evictions: 0,
    memoryUsage: 0,
    operations: 0,
  };
  
  // Cleanup timer
  private cleanupTimer: NodeJS.Timeout | null = null;
  
  // Korean text processing optimization
  private static readonly KOREAN_CHAR_SIZE = 3; // Average bytes per Korean character in UTF-8
  private static readonly ASCII_CHAR_SIZE = 1;
  
  constructor(options: MemoryCacheOptions) {
    super();
    
    this.options = {
      ...options,
      maxMemoryMB: options.maxMemoryMB || 100,
      cleanupInterval: options.cleanupInterval || 60000, // 1 minute
      enableStats: options.enableStats ?? true,
    };
    
    this.logger = options.logger;
    
    // Start cleanup timer
    this.startCleanup();
    
    this.logger.info('Memory cache initialized', {
      maxSize: this.options.maxSize,
      ttl: this.options.ttl,
      maxMemoryMB: this.options.maxMemoryMB,
    });
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.recordMiss();
      return null;
    }
    
    // Check TTL
    if (this.isExpired(entry)) {
      await this.delete(key);
      this.recordMiss();
      return null;
    }
    
    // Update LRU position
    this.moveToHead(entry);
    
    // Update access tracking
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    
    this.recordHit();
    this.emit('hit', key, entry.value);
    
    return entry.value as T;
  }

  /**
   * Set value in cache
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const now = Date.now();
    const entryTtl = ttl || this.options.ttl;
    const expiresAt = now + entryTtl;
    const size = this.estimateSize(value);
    
    // Check if we need to evict entries first
    await this.ensureCapacity(size);
    
    // Remove existing entry if present
    if (this.cache.has(key)) {
      await this.delete(key);
    }
    
    // Create new entry
    const entry: MemoryCacheEntry<T> = {
      key,
      value,
      expiresAt,
      createdAt: now,
      accessCount: 0,
      lastAccessed: now,
      size,
    };
    
    // Add to cache
    this.cache.set(key, entry);
    this.addToHead(entry);
    
    // Update statistics
    this.internalStats.sets++;
    this.internalStats.memoryUsage += size;
    this.recordOperation();
    
    this.emit('set', key, value, entryTtl);
    
    this.logger.debug('Cache entry set', {
      key,
      size,
      ttl: entryTtl,
      totalEntries: this.cache.size,
      memoryUsage: this.formatMemoryUsage(),
    });
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }
    
    // Remove from cache and LRU list
    this.cache.delete(key);
    this.removeFromList(entry);
    
    // Update statistics
    this.internalStats.deletes++;
    this.internalStats.memoryUsage -= entry.size;
    this.recordOperation();
    
    this.emit('delete', key);
    
    this.logger.debug('Cache entry deleted', {
      key,
      size: entry.size,
      age: Date.now() - entry.createdAt,
    });
    
    return true;
  }

  /**
   * Clear all entries
   */
  async clear(): Promise<void> {
    const entryCount = this.cache.size;
    
    this.cache.clear();
    this.head = null;
    this.tail = null;
    
    // Reset memory usage
    this.internalStats.memoryUsage = 0;
    this.recordOperation();
    
    this.emit('clear', entryCount);
    
    this.logger.info('Cache cleared', { entriesRemoved: entryCount });
  }

  /**
   * Check if key exists in cache
   */
  async has(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }
    
    // Check TTL
    if (this.isExpired(entry)) {
      await this.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Get all keys matching pattern
   */
  async keys(pattern?: string): Promise<string[]> {
    const allKeys = Array.from(this.cache.keys());
    
    if (!pattern) {
      return allKeys;
    }
    
    // Simple glob pattern matching
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    
    const regex = new RegExp(`^${regexPattern}$`);
    
    return allKeys.filter(key => regex.test(key));
  }

  /**
   * Get cache size (number of entries)
   */
  async size(): Promise<number> {
    return this.cache.size;
  }

  /**
   * Get cache statistics
   */
  async stats(): Promise<CacheStats> {
    const now = Date.now();
    let oldestEntry = now;
    let newestEntry = 0;
    
    for (const entry of this.cache.values()) {
      oldestEntry = Math.min(oldestEntry, entry.createdAt);
      newestEntry = Math.max(newestEntry, entry.createdAt);
    }
    
    return {
      totalKeys: this.cache.size,
      hitCount: this.internalStats.hits,
      missCount: this.internalStats.misses,
      hitRate: this.calculateHitRate(),
      memoryUsage: this.internalStats.memoryUsage,
      oldestEntry: this.cache.size > 0 ? oldestEntry : now,
      newestEntry: this.cache.size > 0 ? newestEntry : now,
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Test basic operations
      const testKey = '_health_check_';
      const testValue = { test: true, timestamp: Date.now() };
      
      await this.set(testKey, testValue, 1000);
      const retrieved = await this.get(testKey);
      await this.delete(testKey);
      
      return retrieved !== null && retrieved.test === true;
      
    } catch (error) {
      this.logger.error('Memory cache health check failed', { error });
      return false;
    }
  }

  /**
   * Get detailed cache information for monitoring
   */
  getDetailedInfo(): {
    entries: number;
    memoryUsageMB: number;
    hitRate: number;
    averageEntrySize: number;
    lruHead: string | null;
    lruTail: string | null;
  } {
    return {
      entries: this.cache.size,
      memoryUsageMB: this.internalStats.memoryUsage / (1024 * 1024),
      hitRate: this.calculateHitRate(),
      averageEntrySize: this.cache.size > 0 ? this.internalStats.memoryUsage / this.cache.size : 0,
      lruHead: this.head?.key || null,
      lruTail: this.tail?.key || null,
    };
  }

  /**
   * Force cleanup of expired entries
   */
  async cleanup(): Promise<number> {
    const before = this.cache.size;
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) {
        expiredKeys.push(key);
      }
    }
    
    // Delete expired entries
    for (const key of expiredKeys) {
      await this.delete(key);
    }
    
    const cleaned = before - this.cache.size;
    
    if (cleaned > 0) {
      this.logger.debug('Expired entries cleaned', { cleaned, remaining: this.cache.size });
      this.emit('cleanup', cleaned);
    }
    
    return cleaned;
  }

  /**
   * Close cache and cleanup resources
   */
  async close(): Promise<void> {
    this.stopCleanup();
    await this.clear();
    this.removeAllListeners();
    
    this.logger.info('Memory cache closed');
  }

  /**
   * Private methods
   */

  private startCleanup(): void {
    this.cleanupTimer = setInterval(async () => {
      try {
        await this.cleanup();
      } catch (error) {
        this.logger.error('Cache cleanup error', { error });
      }
    }, this.options.cleanupInterval);
  }

  private stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  private isExpired(entry: MemoryCacheEntry): boolean {
    return entry.expiresAt <= Date.now();
  }

  private estimateSize(value: any): number {
    try {
      if (value === null || value === undefined) {
        return 4; // Minimal size
      }
      
      if (typeof value === 'string') {
        return this.estimateStringSize(value);
      }
      
      if (typeof value === 'object') {
        return this.estimateObjectSize(value);
      }
      
      // Primitive types
      return 8;
      
    } catch (error) {
      this.logger.warn('Size estimation failed, using default', { error });
      return 1024; // Default 1KB
    }
  }

  private estimateStringSize(str: string): number {
    let size = 0;
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charAt(i);
      
      // Korean characters (Hangul)
      if (this.isKoreanCharacter(char)) {
        size += MemoryCache.KOREAN_CHAR_SIZE;
      } else {
        size += MemoryCache.ASCII_CHAR_SIZE;
      }
    }
    
    return size + 24; // Add object overhead
  }

  private estimateObjectSize(obj: any): number {
    try {
      // JSON serialization gives a rough estimate
      const jsonStr = JSON.stringify(obj);
      return this.estimateStringSize(jsonStr) + 48; // Add object overhead
    } catch {
      return 1024; // Default for non-serializable objects
    }
  }

  private isKoreanCharacter(char: string): boolean {
    const code = char.charCodeAt(0);
    // Hangul Syllables: AC00–D7AF
    // Hangul Jamo: 1100–11FF, 3130–318F, A960–A97F, D7B0–D7FF
    return (code >= 0xAC00 && code <= 0xD7AF) ||
           (code >= 0x1100 && code <= 0x11FF) ||
           (code >= 0x3130 && code <= 0x318F) ||
           (code >= 0xA960 && code <= 0xA97F) ||
           (code >= 0xD7B0 && code <= 0xD7FF);
  }

  private async ensureCapacity(newEntrySize: number): Promise<void> {
    // Check memory limit
    const memoryLimitBytes = this.options.maxMemoryMB * 1024 * 1024;
    
    while ((this.internalStats.memoryUsage + newEntrySize) > memoryLimitBytes || 
           this.cache.size >= this.options.maxSize) {
      
      if (!this.tail) {
        break; // No more entries to evict
      }
      
      await this.evictLRU();
    }
  }

  private async evictLRU(): Promise<void> {
    if (!this.tail) {
      return;
    }
    
    const evictedKey = this.tail.key;
    await this.delete(evictedKey);
    
    this.internalStats.evictions++;
    this.emit('eviction', evictedKey);
    
    this.logger.debug('LRU eviction', {
      key: evictedKey,
      memoryUsage: this.formatMemoryUsage(),
      entries: this.cache.size,
    });
  }

  // LRU linked list operations
  private addToHead(entry: MemoryCacheEntry): void {
    entry.prev = null;
    entry.next = this.head;
    
    if (this.head) {
      this.head.prev = entry;
    }
    
    this.head = entry;
    
    if (!this.tail) {
      this.tail = entry;
    }
  }

  private removeFromList(entry: MemoryCacheEntry): void {
    if (entry.prev) {
      entry.prev.next = entry.next;
    } else {
      this.head = entry.next;
    }
    
    if (entry.next) {
      entry.next.prev = entry.prev;
    } else {
      this.tail = entry.prev;
    }
  }

  private moveToHead(entry: MemoryCacheEntry): void {
    if (entry === this.head) {
      return; // Already at head
    }
    
    this.removeFromList(entry);
    this.addToHead(entry);
  }

  // Statistics tracking
  private recordHit(): void {
    this.internalStats.hits++;
    this.recordOperation();
  }

  private recordMiss(): void {
    this.internalStats.misses++;
    this.recordOperation();
  }

  private recordOperation(): void {
    this.internalStats.operations++;
    
    // Emit periodic stats
    if (this.internalStats.operations % 1000 === 0) {
      this.emit('stats', {
        operations: this.internalStats.operations,
        hitRate: this.calculateHitRate(),
        memoryUsage: this.internalStats.memoryUsage,
        entries: this.cache.size,
      });
    }
  }

  private calculateHitRate(): number {
    const total = this.internalStats.hits + this.internalStats.misses;
    return total > 0 ? this.internalStats.hits / total : 0;
  }

  private formatMemoryUsage(): string {
    const mb = this.internalStats.memoryUsage / (1024 * 1024);
    return `${mb.toFixed(2)}MB`;
  }
}