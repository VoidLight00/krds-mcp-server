/**
 * Cache Manager Unit Tests
 * 
 * Comprehensive tests for the cache management system:
 * - Multi-backend cache operations (memory, Redis, file)
 * - Cache strategies and intelligent routing
 * - Korean text key normalization
 * - Performance monitoring and metrics
 * - Distributed caching coordination
 * 
 * @author KRDS MCP Server
 * @version 1.0.0
 */

import { jest } from '@jest/globals';
import { CacheManager } from '@/cache/cache-manager.js';
import { MemoryCache } from '@/cache/memory-cache.js';
import { RedisCache } from '@/cache/redis-cache.js';
import { FileCache } from '@/cache/file-cache.js';
import type { CacheConfig, CacheEntry, CacheStats } from '@/types/index.js';
import { createMockLogger } from '../../helpers/test-helpers.js';

// Mock the cache backends
jest.mock('@/cache/memory-cache.js');
jest.mock('@/cache/redis-cache.js');
jest.mock('@/cache/file-cache.js');

describe('CacheManager', () => {
  let cacheManager: CacheManager;
  let mockLogger: any;
  let mockConfig: CacheConfig;
  let mockMemoryCache: jest.Mocked<MemoryCache>;
  let mockRedisCache: jest.Mocked<RedisCache>;
  let mockFileCache: jest.Mocked<FileCache>;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockConfig = {
      type: ['memory', 'redis', 'file'],
      ttl: 3600, // 1 hour
      maxSize: 1024 * 1024 * 100, // 100MB
      redis: {
        host: 'localhost',
        port: 6379,
        db: 0,
        keyPrefix: 'krds:',
      },
      file: {
        baseDir: '/tmp/krds-cache',
        maxSizeMB: 500,
        cleanupInterval: 3600,
      },
      memory: {
        maxMemoryMB: 100,
        cleanupInterval: 1800,
      },
      strategy: {
        defaultStrategy: 'adaptive',
        koreanContentBoost: 1.5,
        enablePredictive: true,
      },
      monitoring: {
        enabled: true,
        metricsInterval: 60,
      },
    };

    // Create mock instances
    mockMemoryCache = {
      name: 'memory',
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
      has: jest.fn(),
      keys: jest.fn(),
      size: jest.fn(),
      stats: jest.fn(),
      healthCheck: jest.fn(),
    } as any;

    mockRedisCache = {
      name: 'redis',
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
      has: jest.fn(),
      keys: jest.fn(),
      size: jest.fn(),
      stats: jest.fn(),
      healthCheck: jest.fn(),
    } as any;

    mockFileCache = {
      name: 'file',
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
      has: jest.fn(),
      keys: jest.fn(),
      size: jest.fn(),
      stats: jest.fn(),
      healthCheck: jest.fn(),
    } as any;

    // Mock constructors
    (MemoryCache as jest.MockedClass<typeof MemoryCache>).mockImplementation(() => mockMemoryCache);
    (RedisCache as jest.MockedClass<typeof RedisCache>).mockImplementation(() => mockRedisCache);
    (FileCache as jest.MockedClass<typeof FileCache>).mockImplementation(() => mockFileCache);

    cacheManager = new CacheManager({
      config: mockConfig,
      logger: mockLogger,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with multiple cache backends', async () => {
      await cacheManager.initialize();

      expect(MemoryCache).toHaveBeenCalledWith(expect.any(Object));
      expect(RedisCache).toHaveBeenCalledWith(expect.any(Object));
      expect(FileCache).toHaveBeenCalledWith(expect.any(Object));
      expect(mockLogger.info).toHaveBeenCalledWith('CacheManager initialized with backends: memory,redis,file');
    });

    it('should initialize with single cache backend', async () => {
      const singleBackendConfig = { ...mockConfig, type: 'memory' as const };
      const singleManager = new CacheManager({
        config: singleBackendConfig,
        logger: mockLogger,
      });

      await singleManager.initialize();
      expect(MemoryCache).toHaveBeenCalledTimes(2); // Previous + this test
      expect(RedisCache).toHaveBeenCalledTimes(1); // Only from previous test
    });

    it('should handle initialization errors gracefully', async () => {
      mockRedisCache.healthCheck.mockRejectedValue(new Error('Redis connection failed'));

      await cacheManager.initialize();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Cache backend redis failed health check',
        expect.any(Object)
      );
    });
  });

  describe('Basic Cache Operations', () => {
    beforeEach(async () => {
      await cacheManager.initialize();
      // Setup default mock responses
      mockMemoryCache.healthCheck.mockResolvedValue(true);
      mockRedisCache.healthCheck.mockResolvedValue(true);
      mockFileCache.healthCheck.mockResolvedValue(true);
    });

    it('should get value from cache with fallback strategy', async () => {
      const testKey = 'test:key';
      const testValue = { data: '테스트 데이터' };

      // Memory cache miss, Redis hit
      mockMemoryCache.get.mockResolvedValue(null);
      mockRedisCache.get.mockResolvedValue(testValue);

      const result = await cacheManager.get(testKey);

      expect(result).toEqual(testValue);
      expect(mockMemoryCache.get).toHaveBeenCalledWith(testKey);
      expect(mockRedisCache.get).toHaveBeenCalledWith(testKey);
      expect(mockFileCache.get).not.toHaveBeenCalled(); // Should stop at Redis hit
    });

    it('should set value to appropriate cache backends', async () => {
      const testKey = 'document:한글키';
      const testValue = { title: '한국어 문서', content: '내용...' };
      const ttl = 1800;

      await cacheManager.set(testKey, testValue, ttl);

      // Should set to all available backends
      expect(mockMemoryCache.set).toHaveBeenCalledWith(testKey, testValue, ttl);
      expect(mockRedisCache.set).toHaveBeenCalledWith(testKey, testValue, ttl);
      expect(mockFileCache.set).toHaveBeenCalledWith(testKey, testValue, ttl);
    });

    it('should delete from all cache backends', async () => {
      const testKey = 'test:delete';

      mockMemoryCache.delete.mockResolvedValue(true);
      mockRedisCache.delete.mockResolvedValue(true);
      mockFileCache.delete.mockResolvedValue(false);

      const result = await cacheManager.delete(testKey);

      expect(result).toBe(true); // Should return true if any backend succeeded
      expect(mockMemoryCache.delete).toHaveBeenCalledWith(testKey);
      expect(mockRedisCache.delete).toHaveBeenCalledWith(testKey);
      expect(mockFileCache.delete).toHaveBeenCalledWith(testKey);
    });

    it('should check existence across all backends', async () => {
      const testKey = 'exists:test';

      mockMemoryCache.has.mockResolvedValue(false);
      mockRedisCache.has.mockResolvedValue(true);
      mockFileCache.has.mockResolvedValue(false);

      const result = await cacheManager.has(testKey);

      expect(result).toBe(true);
      expect(mockMemoryCache.has).toHaveBeenCalledWith(testKey);
      expect(mockRedisCache.has).toHaveBeenCalledWith(testKey);
    });
  });

  describe('Korean Text Key Handling', () => {
    beforeEach(async () => {
      await cacheManager.initialize();
    });

    it('should normalize Korean keys consistently', async () => {
      const koreanKey1 = '문서:한국어제목';
      const koreanKey2 = '문서:한국어제목'; // Same but might be different Unicode normalization
      const testValue = { content: 'test' };

      await cacheManager.set(koreanKey1, testValue);
      const result = await cacheManager.get(koreanKey2);

      // Both operations should use the same normalized key
      const expectedNormalizedKey = expect.stringMatching(/^document:/);
      expect(mockMemoryCache.set).toHaveBeenCalledWith(expectedNormalizedKey, testValue, expect.any(Number));
      expect(mockMemoryCache.get).toHaveBeenCalledWith(expectedNormalizedKey);
    });

    it('should handle complex Korean characters in keys', async () => {
      const complexKey = 'search:정책/교육부/2024년도/상반기/계획안';
      const testValue = { results: [] };

      await cacheManager.set(complexKey, testValue);

      expect(mockMemoryCache.set).toHaveBeenCalledWith(
        expect.stringMatching(/^search:/),
        testValue,
        expect.any(Number)
      );
    });

    it('should apply Korean content boost to TTL', async () => {
      const koreanKey = 'doc:한국정부정책문서';
      const koreanValue = {
        title: '대한민국 정부 정책',
        content: '한국어로 작성된 정부 정책 문서입니다.',
        isKorean: true,
      };
      const baseTtl = 3600;

      await cacheManager.set(koreanKey, koreanValue, baseTtl);

      // Should apply Korean content boost (1.5x)
      const expectedTtl = Math.floor(baseTtl * 1.5);
      expect(mockMemoryCache.set).toHaveBeenCalledWith(
        expect.any(String),
        koreanValue,
        expectedTtl
      );
    });
  });

  describe('Cache Strategy and Routing', () => {
    beforeEach(async () => {
      await cacheManager.initialize();
    });

    it('should route small data to memory cache first', async () => {
      const smallKey = 'metadata:small';
      const smallValue = { size: 'small', length: 100 };

      mockMemoryCache.get.mockResolvedValue(smallValue);

      const result = await cacheManager.get(smallKey);

      expect(result).toEqual(smallValue);
      expect(mockMemoryCache.get).toHaveBeenCalledFirst();
    });

    it('should route large data to file cache', async () => {
      const largeKey = 'document:large';
      const largeValue = {
        content: 'x'.repeat(1024 * 1024), // 1MB content
        images: Array(100).fill({ url: 'image.jpg', data: 'base64data...' }),
      };

      await cacheManager.set(largeKey, largeValue);

      // Large data should prioritize file cache
      expect(mockFileCache.set).toHaveBeenCalledWith(
        expect.any(String),
        largeValue,
        expect.any(Number)
      );
    });

    it('should use adaptive strategy for cache selection', async () => {
      const adaptiveKey = 'adaptive:test';
      const value = { type: 'adaptive', data: 'test' };

      // Simulate different backend performance
      mockMemoryCache.stats.mockResolvedValue({
        hitRate: 0.95,
        totalKeys: 1000,
        hitCount: 950,
        missCount: 50,
        memoryUsage: 50 * 1024 * 1024,
        oldestEntry: Date.now() - 3600000,
        newestEntry: Date.now(),
      });

      mockRedisCache.stats.mockResolvedValue({
        hitRate: 0.80,
        totalKeys: 5000,
        hitCount: 4000,
        missCount: 1000,
        memoryUsage: 200 * 1024 * 1024,
        oldestEntry: Date.now() - 7200000,
        newestEntry: Date.now(),
      });

      await cacheManager.set(adaptiveKey, value);

      // Should prefer memory cache due to higher hit rate
      expect(mockMemoryCache.set).toHaveBeenCalledWith(
        expect.any(String),
        value,
        expect.any(Number)
      );
    });
  });

  describe('Cache Monitoring and Statistics', () => {
    beforeEach(async () => {
      await cacheManager.initialize();
    });

    it('should collect combined statistics from all backends', async () => {
      const memoryStats: CacheStats = {
        totalKeys: 100,
        hitCount: 80,
        missCount: 20,
        hitRate: 0.8,
        memoryUsage: 10 * 1024 * 1024,
        oldestEntry: Date.now() - 3600000,
        newestEntry: Date.now(),
      };

      const redisStats: CacheStats = {
        totalKeys: 500,
        hitCount: 400,
        missCount: 100,
        hitRate: 0.8,
        memoryUsage: 50 * 1024 * 1024,
        oldestEntry: Date.now() - 7200000,
        newestEntry: Date.now(),
      };

      mockMemoryCache.stats.mockResolvedValue(memoryStats);
      mockRedisCache.stats.mockResolvedValue(redisStats);
      mockFileCache.stats.mockResolvedValue({
        totalKeys: 200,
        hitCount: 150,
        missCount: 50,
        hitRate: 0.75,
        memoryUsage: 100 * 1024 * 1024,
        oldestEntry: Date.now() - 10800000,
        newestEntry: Date.now(),
      });

      const combinedStats = await cacheManager.getStats();

      expect(combinedStats.totalKeys).toBe(800); // 100 + 500 + 200
      expect(combinedStats.hitCount).toBe(630); // 80 + 400 + 150
      expect(combinedStats.missCount).toBe(170); // 20 + 100 + 50
      expect(combinedStats.memoryUsage).toBe(160 * 1024 * 1024); // Combined memory usage
    });

    it('should monitor cache performance over time', async () => {
      const performanceMetrics = await cacheManager.getPerformanceMetrics();

      expect(performanceMetrics).toMatchObject({
        backends: expect.objectContaining({
          memory: expect.any(Object),
          redis: expect.any(Object),
          file: expect.any(Object),
        }),
        overallHitRate: expect.any(Number),
        averageResponseTime: expect.any(Number),
        errorRate: expect.any(Number),
      });
    });

    it('should detect performance degradation', async () => {
      // Simulate poor performance
      mockRedisCache.stats.mockResolvedValue({
        totalKeys: 1000,
        hitCount: 300,
        missCount: 700,
        hitRate: 0.3, // Poor hit rate
        memoryUsage: 500 * 1024 * 1024,
        oldestEntry: Date.now() - 3600000,
        newestEntry: Date.now(),
      });

      const healthStatus = await cacheManager.healthCheck();
      
      expect(healthStatus).toBe(false); // Should detect performance issues
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Cache performance degradation detected'),
        expect.any(Object)
      );
    });
  });

  describe('Error Handling and Resilience', () => {
    beforeEach(async () => {
      await cacheManager.initialize();
    });

    it('should handle backend failures gracefully', async () => {
      const testKey = 'failure:test';
      const testValue = { data: 'test' };

      // Redis fails, but memory and file succeed
      mockMemoryCache.set.mockResolvedValue();
      mockRedisCache.set.mockRejectedValue(new Error('Redis connection lost'));
      mockFileCache.set.mockResolvedValue();

      await expect(cacheManager.set(testKey, testValue)).resolves.not.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Cache backend redis operation failed',
        expect.objectContaining({
          operation: 'set',
          key: testKey,
          error: expect.any(Error),
        })
      );
    });

    it('should continue operating with partial backend failure', async () => {
      const testKey = 'partial:failure';

      // Redis is down
      mockRedisCache.get.mockRejectedValue(new Error('Redis unavailable'));
      mockMemoryCache.get.mockResolvedValue(null);
      mockFileCache.get.mockResolvedValue({ data: 'from file' });

      const result = await cacheManager.get(testKey);

      expect(result).toEqual({ data: 'from file' });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Falling back to next cache backend'),
        expect.any(Object)
      );
    });

    it('should handle cache key validation errors', async () => {
      const invalidKey = ''; // Empty key
      const testValue = { data: 'test' };

      await expect(cacheManager.set(invalidKey, testValue)).resolves.not.toThrow();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Invalid cache key provided',
        expect.objectContaining({ key: invalidKey })
      );
    });
  });

  describe('Cache Warming and Preloading', () => {
    beforeEach(async () => {
      await cacheManager.initialize();
    });

    it('should warm cache with predefined keys', async () => {
      const warmupKeys = [
        'common:categories',
        'common:agencies',
        'popular:documents',
      ];

      const mockDataLoader = jest.fn()
        .mockResolvedValueOnce(['정책', '보고서', '통계'])
        .mockResolvedValueOnce(['교육부', '국토교통부', '보건복지부'])
        .mockResolvedValueOnce([{ id: '1', title: '인기 문서' }]);

      await cacheManager.warmCache(warmupKeys, mockDataLoader);

      expect(mockDataLoader).toHaveBeenCalledTimes(3);
      expect(mockMemoryCache.set).toHaveBeenCalledTimes(3);
      expect(mockLogger.info).toHaveBeenCalledWith('Cache warming completed', {
        warmedKeys: 3,
        failedKeys: 0,
      });
    });

    it('should handle cache warming failures gracefully', async () => {
      const warmupKeys = ['failing:key'];
      const mockDataLoader = jest.fn().mockRejectedValue(new Error('Data loading failed'));

      await cacheManager.warmCache(warmupKeys, mockDataLoader);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Cache warming failed for key',
        expect.objectContaining({
          key: 'failing:key',
          error: expect.any(Error),
        })
      );
    });
  });

  describe('Cleanup and Resource Management', () => {
    beforeEach(async () => {
      await cacheManager.initialize();
    });

    it('should cleanup expired entries across all backends', async () => {
      await cacheManager.cleanup();

      // Each backend should be asked to perform cleanup
      expect(mockMemoryCache.clear).not.toHaveBeenCalled(); // Should be selective cleanup
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Cache cleanup completed',
        expect.any(Object)
      );
    });

    it('should shutdown all cache backends properly', async () => {
      await cacheManager.shutdown();

      expect(mockRedisCache.healthCheck).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('CacheManager shutdown completed');
    });

    it('should handle shutdown errors gracefully', async () => {
      mockRedisCache.clear.mockRejectedValue(new Error('Shutdown error'));

      await expect(cacheManager.shutdown()).resolves.not.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error during cache backend shutdown',
        expect.any(Object)
      );
    });
  });
});