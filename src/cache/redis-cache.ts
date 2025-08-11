/**
 * Redis Cache Implementation
 * 
 * Redis-backed cache with connection pooling, clustering support,
 * and optimized Korean text handling. Provides distributed caching
 * capabilities for scalable deployments.
 * 
 * Features:
 * - Connection pooling with automatic failover
 * - Redis Cluster support
 * - Korean text serialization optimization
 * - Atomic operations and transactions
 * - Pub/Sub for cache invalidation
 * - Pipeline operations for batch processing
 * - Compression for large values
 * - Connection monitoring and recovery
 * 
 * @author KRDS MCP Server
 * @version 1.0.0
 */

import { Redis, RedisOptions, Cluster, ClusterOptions } from 'ioredis';
import type { Logger } from 'winston';
import type { CacheEntry, CacheStats } from '@/types/index.js';
import type { CacheBackend } from './cache-manager.js';
import { EventEmitter } from 'events';
import { promisify } from 'util';
import { gzip, gunzip } from 'zlib';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export interface RedisCacheOptions extends RedisOptions {
  ttl: number;
  logger: Logger;
  keyPrefix?: string;
  enableCompression?: boolean;
  compressionThreshold?: number; // Compress values larger than this (bytes)
  enablePubSub?: boolean; // Enable pub/sub for distributed invalidation
  cluster?: ClusterOptions & { nodes: string[] };
  poolSize?: number;
  maxRetries?: number;
  retryDelayOnFailover?: number;
}

export interface RedisEntry {
  value: any;
  createdAt: number;
  accessCount: number;
  lastAccessed: number;
  compressed?: boolean;
}

/**
 * Redis-backed cache with connection pooling and clustering
 */
export class RedisCache extends EventEmitter implements CacheBackend {
  readonly name = 'redis';
  
  private client: Redis | Cluster;
  private pubSubClient?: Redis | Cluster;
  private options: Required<Omit<RedisCacheOptions, keyof RedisOptions | 'cluster'>>;
  private logger: Logger;
  private isCluster: boolean;
  private connectionPool: (Redis | Cluster)[] = [];
  private poolIndex = 0;
  
  // Statistics tracking
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    errors: 0,
    compressions: 0,
    decompressions: 0,
    operations: 0,
    connectionErrors: 0,
  };
  
  // Connection monitoring
  private healthCheckInterval?: NodeJS.Timeout;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  
  // Korean text optimization
  private static readonly KOREAN_ENCODING = 'utf8';
  private static readonly COMPRESSION_PREFIX = 'gz:';
  private static readonly KOREAN_PREFIX = 'kr:';
  
  constructor(options: RedisCacheOptions) {
    super();
    
    this.logger = options.logger;
    this.isCluster = !!options.cluster;
    
    this.options = {
      ttl: options.ttl,
      keyPrefix: options.keyPrefix || 'krds:cache:',
      enableCompression: options.enableCompression ?? true,
      compressionThreshold: options.compressionThreshold || 1024, // 1KB
      enablePubSub: options.enablePubSub ?? true,
      poolSize: options.poolSize || 3,
      maxRetries: options.maxRetries || 3,
      retryDelayOnFailover: options.retryDelayOnFailover || 100,
    };
    
    this.logger.info('Redis cache initializing', {
      isCluster: this.isCluster,
      keyPrefix: this.options.keyPrefix,
      compression: this.options.enableCompression,
      pubsub: this.options.enablePubSub,
    });
  }

  /**
   * Initialize Redis connection(s) and connection pool
   */
  async initialize(): Promise<void> {
    try {
      await this.createConnections();
      await this.setupPubSub();
      await this.startHealthCheck();
      
      this.logger.info('Redis cache initialized successfully', {
        poolSize: this.connectionPool.length,
        cluster: this.isCluster,
      });
      
    } catch (error) {
      this.logger.error('Failed to initialize Redis cache', { error });
      throw error;
    }
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    const prefixedKey = this.prefixKey(key);
    const client = this.getClient();
    
    try {
      const rawData = await client.get(prefixedKey);
      
      if (rawData === null) {
        this.recordMiss();
        return null;
      }
      
      // Parse and decompress if needed
      const data = await this.deserializeValue(rawData);
      
      if (!data || !this.isValidEntry(data)) {
        await this.delete(key);
        this.recordMiss();
        return null;
      }
      
      // Update access tracking in background
      this.updateAccessTracking(prefixedKey, data).catch(error => {
        this.logger.warn('Failed to update access tracking', { key, error });
      });
      
      this.recordHit();
      this.emit('hit', key, data.value);
      
      return data.value as T;
      
    } catch (error) {
      this.recordError(error as Error);
      this.logger.error('Redis get operation failed', { key: prefixedKey, error });
      throw error;
    }
  }

  /**
   * Set value in cache
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const prefixedKey = this.prefixKey(key);
    const client = this.getClient();
    const entryTtl = ttl || this.options.ttl;
    
    try {
      const entry: RedisEntry = {
        value,
        createdAt: Date.now(),
        accessCount: 0,
        lastAccessed: Date.now(),
      };
      
      // Serialize and compress if needed
      const serializedData = await this.serializeValue(entry);
      
      // Set with TTL
      if (entryTtl > 0) {
        await client.setex(prefixedKey, Math.ceil(entryTtl / 1000), serializedData);
      } else {
        await client.set(prefixedKey, serializedData);
      }
      
      this.stats.sets++;
      this.recordOperation();
      
      this.emit('set', key, value, entryTtl);
      
      // Notify other instances if pub/sub is enabled
      if (this.options.enablePubSub && this.pubSubClient) {
        await this.publishCacheEvent('set', key);
      }
      
      this.logger.debug('Redis entry set', {
        key: prefixedKey,
        ttl: entryTtl,
        compressed: entry.compressed,
      });
      
    } catch (error) {
      this.recordError(error as Error);
      this.logger.error('Redis set operation failed', { key: prefixedKey, error });
      throw error;
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<boolean> {
    const prefixedKey = this.prefixKey(key);
    const client = this.getClient();
    
    try {
      const result = await client.del(prefixedKey);
      const deleted = result > 0;
      
      if (deleted) {
        this.stats.deletes++;
        this.recordOperation();
        
        this.emit('delete', key);
        
        // Notify other instances if pub/sub is enabled
        if (this.options.enablePubSub && this.pubSubClient) {
          await this.publishCacheEvent('delete', key);
        }
        
        this.logger.debug('Redis entry deleted', { key: prefixedKey });
      }
      
      return deleted;
      
    } catch (error) {
      this.recordError(error as Error);
      this.logger.error('Redis delete operation failed', { key: prefixedKey, error });
      return false;
    }
  }

  /**
   * Clear all entries with the key prefix
   */
  async clear(): Promise<void> {
    const client = this.getClient();
    
    try {
      let cursor = 0;
      let totalDeleted = 0;
      
      do {
        const result = await client.scan(cursor, 'MATCH', `${this.options.keyPrefix}*`, 'COUNT', 1000);
        cursor = parseInt(result[0], 10);
        const keys = result[1] as string[];
        
        if (keys.length > 0) {
          const deleted = await client.del(...keys);
          totalDeleted += deleted;
        }
        
      } while (cursor !== 0);
      
      this.recordOperation();
      this.emit('clear', totalDeleted);
      
      // Notify other instances if pub/sub is enabled
      if (this.options.enablePubSub && this.pubSubClient) {
        await this.publishCacheEvent('clear', '*');
      }
      
      this.logger.info('Redis cache cleared', { entriesDeleted: totalDeleted });
      
    } catch (error) {
      this.recordError(error as Error);
      this.logger.error('Redis clear operation failed', { error });
      throw error;
    }
  }

  /**
   * Check if key exists
   */
  async has(key: string): Promise<boolean> {
    const prefixedKey = this.prefixKey(key);
    const client = this.getClient();
    
    try {
      const result = await client.exists(prefixedKey);
      return result === 1;
      
    } catch (error) {
      this.recordError(error as Error);
      this.logger.error('Redis exists check failed', { key: prefixedKey, error });
      return false;
    }
  }

  /**
   * Get all keys matching pattern
   */
  async keys(pattern?: string): Promise<string[]> {
    const client = this.getClient();
    const searchPattern = pattern 
      ? `${this.options.keyPrefix}${pattern}` 
      : `${this.options.keyPrefix}*`;
    
    try {
      const keys: string[] = [];
      let cursor = 0;
      
      do {
        const result = await client.scan(cursor, 'MATCH', searchPattern, 'COUNT', 1000);
        cursor = parseInt(result[0], 10);
        const foundKeys = result[1] as string[];
        
        // Remove prefix from keys
        const unprefixedKeys = foundKeys.map(key => 
          key.startsWith(this.options.keyPrefix) 
            ? key.substring(this.options.keyPrefix.length)
            : key
        );
        
        keys.push(...unprefixedKeys);
        
      } while (cursor !== 0);
      
      return keys;
      
    } catch (error) {
      this.recordError(error as Error);
      this.logger.error('Redis keys operation failed', { pattern: searchPattern, error });
      return [];
    }
  }

  /**
   * Get cache size (approximate)
   */
  async size(): Promise<number> {
    const client = this.getClient();
    
    try {
      // Use SCAN to count keys with our prefix
      let cursor = 0;
      let count = 0;
      
      do {
        const result = await client.scan(cursor, 'MATCH', `${this.options.keyPrefix}*`, 'COUNT', 1000);
        cursor = parseInt(result[0], 10);
        count += (result[1] as string[]).length;
        
      } while (cursor !== 0);
      
      return count;
      
    } catch (error) {
      this.recordError(error as Error);
      this.logger.error('Redis size operation failed', { error });
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  async stats(): Promise<CacheStats> {
    try {
      const client = this.getClient();
      const info = await client.info('memory');
      
      // Parse memory usage from Redis info
      const memoryMatch = info.match(/used_memory:(\d+)/);
      const memoryUsage = memoryMatch ? parseInt(memoryMatch[1], 10) : 0;
      
      const totalKeys = await this.size();
      
      return {
        totalKeys,
        hitCount: this.stats.hits,
        missCount: this.stats.misses,
        hitRate: this.calculateHitRate(),
        memoryUsage,
        oldestEntry: 0, // Redis doesn't track creation time globally
        newestEntry: Date.now(),
      };
      
    } catch (error) {
      this.recordError(error as Error);
      this.logger.error('Failed to get Redis stats', { error });
      
      return {
        totalKeys: 0,
        hitCount: this.stats.hits,
        missCount: this.stats.misses,
        hitRate: this.calculateHitRate(),
        memoryUsage: 0,
        oldestEntry: Date.now(),
        newestEntry: Date.now(),
      };
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const client = this.getClient();
      const result = await client.ping();
      return result === 'PONG';
      
    } catch (error) {
      this.logger.error('Redis health check failed', { error });
      return false;
    }
  }

  /**
   * Batch operations using Redis pipeline
   */
  async mget<T>(keys: string[]): Promise<Map<string, T | null>> {
    const client = this.getClient();
    const prefixedKeys = keys.map(key => this.prefixKey(key));
    const results = new Map<string, T | null>();
    
    try {
      const pipeline = client.pipeline();
      
      for (const prefixedKey of prefixedKeys) {
        pipeline.get(prefixedKey);
      }
      
      const pipelineResults = await pipeline.exec();
      
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const result = pipelineResults?.[i];
        
        if (result && result[0] === null) { // No error
          const rawData = result[1] as string | null;
          
          if (rawData) {
            try {
              const data = await this.deserializeValue(rawData);
              results.set(key, data.value as T);
              this.recordHit();
            } catch (error) {
              this.logger.warn('Failed to deserialize value in mget', { key, error });
              results.set(key, null);
              this.recordMiss();
            }
          } else {
            results.set(key, null);
            this.recordMiss();
          }
        } else {
          results.set(key, null);
          this.recordMiss();
          if (result && result[0]) {
            this.recordError(result[0] as Error);
          }
        }
      }
      
      return results;
      
    } catch (error) {
      this.recordError(error as Error);
      this.logger.error('Redis mget operation failed', { keyCount: keys.length, error });
      
      // Return empty results
      for (const key of keys) {
        results.set(key, null);
      }
      return results;
    }
  }

  /**
   * Batch set operations
   */
  async mset<T>(entries: Map<string, T>, ttl?: number): Promise<void> {
    const client = this.getClient();
    const entryTtl = ttl || this.options.ttl;
    
    try {
      const pipeline = client.pipeline();
      
      for (const [key, value] of entries) {
        const prefixedKey = this.prefixKey(key);
        const entry: RedisEntry = {
          value,
          createdAt: Date.now(),
          accessCount: 0,
          lastAccessed: Date.now(),
        };
        
        const serializedData = await this.serializeValue(entry);
        
        if (entryTtl > 0) {
          pipeline.setex(prefixedKey, Math.ceil(entryTtl / 1000), serializedData);
        } else {
          pipeline.set(prefixedKey, serializedData);
        }
      }
      
      await pipeline.exec();
      
      this.stats.sets += entries.size;
      this.recordOperation();
      
      this.emit('mset', Array.from(entries.keys()), entryTtl);
      
    } catch (error) {
      this.recordError(error as Error);
      this.logger.error('Redis mset operation failed', { entryCount: entries.size, error });
      throw error;
    }
  }

  /**
   * Close Redis connections
   */
  async close(): Promise<void> {
    try {
      this.stopHealthCheck();
      
      // Close pub/sub client
      if (this.pubSubClient) {
        await this.pubSubClient.disconnect();
      }
      
      // Close connection pool
      for (const client of this.connectionPool) {
        await client.disconnect();
      }
      
      this.connectionPool = [];
      this.removeAllListeners();
      
      this.logger.info('Redis cache closed');
      
    } catch (error) {
      this.logger.error('Error closing Redis cache', { error });
    }
  }

  /**
   * Private methods
   */

  private async createConnections(): Promise<void> {
    const { cluster, ...redisOptions } = this.options as any;
    
    // Create main client
    if (this.isCluster && cluster) {
      this.client = new Cluster(cluster.nodes, {
        ...redisOptions,
        ...cluster,
        redisOptions: {
          ...redisOptions,
          retryDelayOnFailover: this.options.retryDelayOnFailover,
          maxRetriesPerRequest: this.options.maxRetries,
          lazyConnect: true,
        },
      });
    } else {
      this.client = new Redis({
        ...redisOptions,
        retryDelayOnFailover: this.options.retryDelayOnFailover,
        maxRetriesPerRequest: this.options.maxRetries,
        lazyConnect: true,
      });
    }
    
    // Add to connection pool
    this.connectionPool.push(this.client);
    
    // Create additional connections for pool
    for (let i = 1; i < this.options.poolSize; i++) {
      let poolClient: Redis | Cluster;
      
      if (this.isCluster && cluster) {
        poolClient = new Cluster(cluster.nodes, {
          ...redisOptions,
          ...cluster,
          redisOptions: {
            ...redisOptions,
            retryDelayOnFailover: this.options.retryDelayOnFailover,
            maxRetriesPerRequest: this.options.maxRetries,
            lazyConnect: true,
          },
        });
      } else {
        poolClient = new Redis({
          ...redisOptions,
          retryDelayOnFailover: this.options.retryDelayOnFailover,
          maxRetriesPerRequest: this.options.maxRetries,
          lazyConnect: true,
        });
      }
      
      this.connectionPool.push(poolClient);
    }
    
    // Connect all clients
    await Promise.all(
      this.connectionPool.map(async (client, index) => {
        try {
          await client.connect();
          this.setupClientEvents(client, `pool-${index}`);
        } catch (error) {
          this.logger.error(`Failed to connect Redis client ${index}`, { error });
          throw error;
        }
      })
    );
  }

  private async setupPubSub(): Promise<void> {
    if (!this.options.enablePubSub) {
      return;
    }
    
    try {
      // Create separate client for pub/sub
      if (this.isCluster) {
        this.pubSubClient = this.client; // Use same cluster client
      } else {
        const { cluster, ...redisOptions } = this.options as any;
        this.pubSubClient = new Redis({
          ...redisOptions,
          lazyConnect: true,
        });
        await this.pubSubClient.connect();
      }
      
      // Subscribe to cache events
      const channel = `${this.options.keyPrefix}events`;
      await this.pubSubClient.subscribe(channel);
      
      this.pubSubClient.on('message', (receivedChannel, message) => {
        if (receivedChannel === channel) {
          try {
            const event = JSON.parse(message);
            this.emit('remote-cache-event', event);
          } catch (error) {
            this.logger.warn('Failed to parse pub/sub message', { message, error });
          }
        }
      });
      
      this.logger.debug('Redis pub/sub initialized', { channel });
      
    } catch (error) {
      this.logger.error('Failed to setup Redis pub/sub', { error });
      // Don't throw - pub/sub is optional
    }
  }

  private setupClientEvents(client: Redis | Cluster, clientId: string): void {
    client.on('error', (error) => {
      this.stats.connectionErrors++;
      this.logger.error(`Redis client ${clientId} error`, { error });
      this.emit('connection-error', error);
    });
    
    client.on('reconnecting', () => {
      this.reconnectAttempts++;
      this.logger.info(`Redis client ${clientId} reconnecting`, {
        attempts: this.reconnectAttempts,
      });
    });
    
    client.on('connect', () => {
      this.reconnectAttempts = 0;
      this.logger.info(`Redis client ${clientId} connected`);
      this.emit('connection-restored');
    });
  }

  private getClient(): Redis | Cluster {
    // Simple round-robin selection
    this.poolIndex = (this.poolIndex + 1) % this.connectionPool.length;
    return this.connectionPool[this.poolIndex];
  }

  private prefixKey(key: string): string {
    // Add Korean prefix if the key contains Korean characters
    if (this.containsKorean(key)) {
      return `${this.options.keyPrefix}${RedisCache.KOREAN_PREFIX}${key}`;
    }
    
    return `${this.options.keyPrefix}${key}`;
  }

  private containsKorean(text: string): boolean {
    // Korean character ranges
    return /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uD7B0-\uD7FF]/.test(text);
  }

  private async serializeValue(entry: RedisEntry): Promise<string> {
    try {
      let serialized = JSON.stringify(entry);
      
      // Compress if enabled and above threshold
      if (this.options.enableCompression && 
          Buffer.byteLength(serialized, RedisCache.KOREAN_ENCODING) > this.options.compressionThreshold) {
        
        const compressed = await gzipAsync(Buffer.from(serialized, RedisCache.KOREAN_ENCODING));
        entry.compressed = true;
        this.stats.compressions++;
        
        return `${RedisCache.COMPRESSION_PREFIX}${compressed.toString('base64')}`;
      }
      
      return serialized;
      
    } catch (error) {
      this.logger.error('Failed to serialize value', { error });
      throw error;
    }
  }

  private async deserializeValue(data: string): Promise<RedisEntry> {
    try {
      let jsonData: string;
      
      // Check if compressed
      if (data.startsWith(RedisCache.COMPRESSION_PREFIX)) {
        const compressedData = data.substring(RedisCache.COMPRESSION_PREFIX.length);
        const compressed = Buffer.from(compressedData, 'base64');
        const decompressed = await gunzipAsync(compressed);
        jsonData = decompressed.toString(RedisCache.KOREAN_ENCODING);
        this.stats.decompressions++;
      } else {
        jsonData = data;
      }
      
      return JSON.parse(jsonData) as RedisEntry;
      
    } catch (error) {
      this.logger.error('Failed to deserialize value', { error });
      throw error;
    }
  }

  private isValidEntry(entry: any): entry is RedisEntry {
    return entry &&
           typeof entry === 'object' &&
           typeof entry.createdAt === 'number' &&
           typeof entry.accessCount === 'number' &&
           typeof entry.lastAccessed === 'number';
  }

  private async updateAccessTracking(key: string, entry: RedisEntry): Promise<void> {
    try {
      entry.accessCount++;
      entry.lastAccessed = Date.now();
      
      const serialized = await this.serializeValue(entry);
      const client = this.getClient();
      
      // Update without changing TTL
      const ttl = await client.ttl(key);
      if (ttl > 0) {
        await client.setex(key, ttl, serialized);
      } else {
        await client.set(key, serialized);
      }
      
    } catch (error) {
      // Don't propagate errors from access tracking
      this.logger.debug('Failed to update access tracking', { key, error });
    }
  }

  private async publishCacheEvent(operation: string, key: string): Promise<void> {
    if (!this.pubSubClient) {
      return;
    }
    
    try {
      const event = {
        operation,
        key,
        timestamp: Date.now(),
        source: 'redis-cache',
      };
      
      const channel = `${this.options.keyPrefix}events`;
      await this.pubSubClient.publish(channel, JSON.stringify(event));
      
    } catch (error) {
      this.logger.warn('Failed to publish cache event', { operation, key, error });
    }
  }

  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        const healthy = await this.healthCheck();
        
        if (!healthy && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.logger.warn('Redis health check failed, attempting reconnection');
          // Reconnection is handled automatically by ioredis
        }
        
      } catch (error) {
        this.logger.error('Health check error', { error });
      }
    }, 30000); // Every 30 seconds
  }

  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  // Statistics methods
  private recordHit(): void {
    this.stats.hits++;
    this.recordOperation();
  }

  private recordMiss(): void {
    this.stats.misses++;
    this.recordOperation();
  }

  private recordError(error: Error): void {
    this.stats.errors++;
    this.recordOperation();
  }

  private recordOperation(): void {
    this.stats.operations++;
    
    // Emit periodic stats
    if (this.stats.operations % 1000 === 0) {
      this.emit('stats', {
        operations: this.stats.operations,
        hitRate: this.calculateHitRate(),
        errors: this.stats.errors,
        compressions: this.stats.compressions,
        decompressions: this.stats.decompressions,
      });
    }
  }

  private calculateHitRate(): number {
    const total = this.stats.hits + this.stats.misses;
    return total > 0 ? this.stats.hits / total : 0;
  }
}