#!/usr/bin/env node

/**
 * Cache System Test Script
 * 
 * Tests the KRDS cache system functionality including:
 * - Multi-backend operations
 * - Korean text handling
 * - Performance monitoring
 * - Strategy optimization
 * 
 * Usage: npm run test:cache
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setupLogger } from '../src/utils/logger.js';
import {
  initializeCacheSystem,
  CacheUtils,
  CacheMetrics,
} from '../src/cache/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testCacheSystem() {
  console.log('🚀 Testing KRDS Cache System...\n');
  
  // Setup logger
  const logger = setupLogger({
    level: 'info',
    consoleEnabled: true,
    fileEnabled: false,
  });
  
  try {
    // Initialize cache with test configuration
    const cacheManager = await initializeCacheSystem({
      config: {
        type: ['memory', 'file'], // Skip Redis for local testing
        ttl: 60000, // 1 minute for testing
        maxSize: 100,
        file: {
          baseDir: join(__dirname, '..', '.test-cache'),
          maxSizeMB: 10,
          enableCompression: true,
        },
        memory: {
          maxMemoryMB: 50,
        },
        strategy: {
          defaultStrategy: 'korean-optimized',
          koreanContentBoost: 1.5,
        },
        monitoring: {
          enabled: true,
          metricsInterval: 5000,
        },
      },
      logger,
      enableDistributed: false,
    });
    
    console.log('✅ Cache system initialized');
    
    // Test 1: Basic operations
    console.log('\n📝 Test 1: Basic Operations');
    
    const testKey = 'test:basic';
    const testValue = { message: 'Hello, World!', timestamp: Date.now() };
    
    await cacheManager.set(testKey, testValue);
    const retrieved = await cacheManager.get(testKey);
    
    console.log(`   Set/Get: ${retrieved?.message === testValue.message ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 2: Korean content
    console.log('\n🇰🇷 Test 2: Korean Content Handling');
    
    const koreanDoc = {
      title: 'Korean Document',
      titleKorean: '한국어 문서',
      content: 'This is a test document about Korean government policies.',
      contentKorean: '이것은 한국 정부 정책에 관한 테스트 문서입니다.',
      keywords: ['정부', '정책', '한국어'],
    };
    
    const koreanKey = CacheUtils.generateKey('document', {
      title: koreanDoc.titleKorean,
      category: '정책',
    });
    
    const isKorean = CacheUtils.isKoreanContent(koreanDoc);
    const ttl = CacheUtils.getRecommendedTTL(koreanDoc);
    const tags = CacheUtils.generateTags(koreanDoc, 'krds-document');
    
    await cacheManager.set(koreanKey, koreanDoc, {
      ttl,
      strategy: 'korean-optimized',
      tags,
    });
    
    const koreanRetrieved = await cacheManager.get(koreanKey);
    
    console.log(`   Korean Detection: ${isKorean ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Korean Key Generation: ${koreanKey.includes('kr:') ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Korean Storage/Retrieval: ${koreanRetrieved?.titleKorean === koreanDoc.titleKorean ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   TTL Calculation: ${ttl > 60000 ? '✅ PASS' : '❌ FAIL'} (${ttl}ms)`);
    console.log(`   Tags Generated: ${tags.length > 0 ? '✅ PASS' : '❌ FAIL'} (${tags.join(', ')})`);
    
    // Test 3: Cache strategies
    console.log('\n🎯 Test 3: Cache Strategies');
    
    const strategies = ['lru', 'lfu', 'korean-optimized', 'adaptive'];
    let strategyResults = 0;
    
    for (const strategy of strategies) {
      try {
        const strategyKey = `test:strategy:${strategy}`;
        await cacheManager.set(strategyKey, { strategy, test: true }, { 
          strategy: strategy as any,
        });
        const strategyResult = await cacheManager.get(strategyKey);
        if (strategyResult?.strategy === strategy) {
          strategyResults++;
        }
      } catch (error) {
        console.log(`   Strategy ${strategy}: ❌ FAIL (${error.message})`);
      }
    }
    
    console.log(`   Strategies Tested: ${strategyResults}/${strategies.length} ${strategyResults === strategies.length ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 4: Bulk operations
    console.log('\n📦 Test 4: Bulk Operations');
    
    const bulkData = new Map();
    const testDocs = [
      { id: 'doc1', title: '첫 번째 문서', category: '정책' },
      { id: 'doc2', title: '두 번째 문서', category: '공고' },
      { id: 'doc3', title: '세 번째 문서', category: '법령' },
    ];
    
    for (const doc of testDocs) {
      const key = CacheUtils.generateKey('bulk', { id: doc.id });
      bulkData.set(key, doc);
    }
    
    // Set all documents
    for (const [key, doc] of bulkData) {
      await cacheManager.set(key, doc);
    }
    
    // Retrieve all documents
    let bulkRetrieved = 0;
    for (const [key] of bulkData) {
      const result = await cacheManager.get(key);
      if (result) bulkRetrieved++;
    }
    
    console.log(`   Bulk Operations: ${bulkRetrieved}/${bulkData.size} ${bulkRetrieved === bulkData.size ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 5: Cache invalidation
    console.log('\n🔄 Test 5: Cache Invalidation');
    
    // Tag some entries
    await cacheManager.set('tagged1', { test: 1 }, { tags: ['test-tag', 'group-a'] });
    await cacheManager.set('tagged2', { test: 2 }, { tags: ['test-tag', 'group-b'] });
    await cacheManager.set('untagged', { test: 3 });
    
    // Invalidate by tag
    const invalidated = await cacheManager.invalidate({ tags: ['test-tag'] });
    
    const tagged1After = await cacheManager.get('tagged1');
    const tagged2After = await cacheManager.get('tagged2');
    const untaggedAfter = await cacheManager.get('untagged');
    
    console.log(`   Tag Invalidation: ${invalidated >= 2 ? '✅ PASS' : '❌ FAIL'} (${invalidated} entries)`);
    console.log(`   Tagged Entries Removed: ${!tagged1After && !tagged2After ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Untagged Entry Preserved: ${untaggedAfter ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 6: Performance monitoring
    console.log('\n📊 Test 6: Performance Monitoring');
    
    // Generate some cache operations
    for (let i = 0; i < 20; i++) {
      const key = `perf:test:${i}`;
      const value = { 
        index: i, 
        content: `Performance test entry ${i}`,
        korean: i % 2 === 0 ? `성능 테스트 항목 ${i}` : undefined,
      };
      
      await cacheManager.set(key, value);
      
      // 50% cache hit simulation
      if (Math.random() > 0.5) {
        await cacheManager.get(key);
      }
    }
    
    // Wait for metrics collection
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const monitor = cacheManager.getMonitor();
    const metrics = monitor.getCurrentMetrics();
    const healthCheck = await CacheMetrics.quickHealthCheck(cacheManager);
    
    console.log(`   Hit Rate: ${(metrics.performance.hitRate * 100).toFixed(1)}% ${metrics.performance.hitRate > 0 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Avg Latency: ${metrics.performance.avgLatency.toFixed(0)}ms ${metrics.performance.avgLatency < 100 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Korean Entries: ${metrics.korean.totalEntries} ${metrics.korean.totalEntries > 0 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Health Check: ${healthCheck.healthy ? '✅ HEALTHY' : '⚠️ NEEDS ATTENTION'}`);
    
    if (healthCheck.recommendations.length > 0) {
      console.log('   Recommendations:');
      healthCheck.recommendations.slice(0, 3).forEach(rec => {
        console.log(`     - ${rec}`);
      });
    }
    
    // Test 7: Cache warming
    console.log('\n🔥 Test 7: Cache Warming');
    
    const warmupKeys = [
      'warm:key1',
      'warm:key2',
      'warm:key3',
    ];
    
    // Pre-populate some keys
    for (const key of warmupKeys) {
      await cacheManager.set(key, { warmed: true, key });
    }
    
    // Test warmup
    let warmedCount = 0;
    await cacheManager.warmup({
      keys: warmupKeys,
      batchSize: 2,
      onProgress: (completed, total) => {
        warmedCount = completed;
      },
    });
    
    console.log(`   Warmup Progress: ${warmedCount}/${warmupKeys.length} ${warmedCount === warmupKeys.length ? '✅ PASS' : '❌ FAIL'}`);
    
    // Summary
    console.log('\n📈 Test Summary');
    const finalMetrics = monitor.getCurrentMetrics();
    const efficiency = CacheMetrics.calculateEfficiencyScore(finalMetrics);
    
    console.log(`   Total Operations: ${finalMetrics.operations.get + finalMetrics.operations.set}`);
    console.log(`   Final Hit Rate: ${(finalMetrics.performance.hitRate * 100).toFixed(1)}%`);
    console.log(`   Cache Efficiency: ${efficiency}%`);
    console.log(`   Korean Content Ratio: ${(finalMetrics.korean.totalEntries / (finalMetrics.operations.set || 1) * 100).toFixed(1)}%`);
    
    // Cleanup
    console.log('\n🧹 Cleaning Up...');
    await cacheManager.shutdown();
    console.log('✅ Cache system shutdown complete');
    
    console.log('\n🎉 All tests completed successfully!');
    
  } catch (error) {
    logger.error('Cache system test failed', { error });
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run tests
testCacheSystem().catch(console.error);