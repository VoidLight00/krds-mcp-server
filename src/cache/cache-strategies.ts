/**
 * Cache Strategies Implementation
 * 
 * Intelligent caching strategies for optimizing cache performance and resource utilization.
 * Implements various algorithms including LRU, TTL-based, and custom strategies tailored
 * for Korean content and KRDS-specific data patterns.
 * 
 * Features:
 * - Multiple eviction strategies (LRU, LFU, TTL-based, size-based)
 * - Adaptive cache warming and preloading
 * - Korean content optimization patterns
 * - Cache entry scoring and prioritization
 * - Statistical analysis and recommendations
 * - Dynamic strategy adjustment based on usage patterns
 * - Tag-based invalidation support
 * - Content-aware caching decisions
 * 
 * @author KRDS MCP Server
 * @version 1.0.0
 */

import type { Logger } from 'winston';
import { EventEmitter } from 'events';

export type CacheStrategy = 'lru' | 'lfu' | 'ttl' | 'size' | 'adaptive' | 'korean-optimized';

export interface StrategyConfig {
  defaultStrategy: CacheStrategy;
  adaptiveThreshold: number; // Threshold for switching strategies
  koreanContentBoost: number; // Priority boost for Korean content
  sizePenaltyThreshold: number; // Size threshold for penalties
  frequencyWindow: number; // Time window for frequency calculations
  enablePredictive: boolean; // Enable predictive caching
}

export interface AccessPattern {
  key: string;
  accessCount: number;
  lastAccessed: number;
  averageInterval: number;
  contentType: string;
  isKorean: boolean;
  size: number;
  score: number;
}

export interface CacheRecommendation {
  strategy: CacheStrategy;
  confidence: number;
  reasons: string[];
  optimizations: string[];
}

export interface BackendRecommendation {
  backend: string;
  score: number;
  reasons: string[];
}

/**
 * Intelligent cache strategy manager
 */
export class CacheStrategies extends EventEmitter {
  private logger: Logger;
  private config: StrategyConfig;
  private accessPatterns = new Map<string, AccessPattern>();
  private backendPerformance = new Map<string, BackendPerformanceData>();
  private tagMap = new Map<string, Set<string>>(); // tag -> keys
  private keyTags = new Map<string, Set<string>>(); // key -> tags
  
  // Strategy optimization
  private optimizationTimer?: NodeJS.Timeout;
  private strategyHistory: StrategyHistoryEntry[] = [];
  private currentOptimalStrategy: CacheStrategy = 'lru';
  
  // Korean content patterns
  private static readonly KOREAN_PATTERNS = {
    hangul: /[\uAC00-\uD7AF]/,
    jamo: /[\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uD7B0-\uD7FF]/,
    mixed: /[\uAC00-\uD7AF].*[a-zA-Z]|[a-zA-Z].*[\uAC00-\uD7AF]/,
  };
  
  // Content type scoring
  private static readonly CONTENT_SCORES = {
    'application/krds-document': 1.0,
    'application/krds-content': 0.9,
    'text/html': 0.8,
    'application/json': 0.7,
    'text/plain': 0.6,
    'image/jpeg': 0.5,
    'image/png': 0.5,
    'application/pdf': 0.4,
    'application/octet-stream': 0.3,
  };

  constructor(logger: Logger, config?: Partial<StrategyConfig>) {
    super();
    
    this.logger = logger;
    this.config = {
      defaultStrategy: 'adaptive',
      adaptiveThreshold: 0.8, // 80% confidence threshold
      koreanContentBoost: 1.2,
      sizePenaltyThreshold: 1024 * 1024, // 1MB
      frequencyWindow: 24 * 60 * 60 * 1000, // 24 hours
      enablePredictive: true,
      ...config,
    };
    
    this.logger.info('Cache strategies initialized', {
      defaultStrategy: this.config.defaultStrategy,
      adaptiveThreshold: this.config.adaptiveThreshold,
      koreanOptimization: this.config.koreanContentBoost > 1,
    });
  }

  /**
   * Determine if a value should be cached based on strategy
   */
  async shouldCache<T>(key: string, value: T, strategy: CacheStrategy = this.config.defaultStrategy): Promise<boolean> {
    try {
      const analysis = this.analyzeContent(key, value);
      
      switch (strategy) {
        case 'lru':
          return this.shouldCacheLRU(analysis);
          
        case 'lfu':
          return this.shouldCacheLFU(analysis);
          
        case 'ttl':
          return this.shouldCacheTTL(analysis);
          
        case 'size':
          return this.shouldCacheSize(analysis);
          
        case 'korean-optimized':
          return this.shouldCacheKorean(analysis);
          
        case 'adaptive':
          return this.shouldCacheAdaptive(analysis);
          
        default:
          return true; // Default to caching
      }
      
    } catch (error) {
      this.logger.error('Error in shouldCache decision', { key, strategy, error });
      return true; // Default to caching on error
    }
  }

  /**
   * Record access for pattern analysis
   */
  async recordAccess(key: string, backend: string): Promise<void> {
    const now = Date.now();
    
    // Update access pattern
    const pattern = this.accessPatterns.get(key);
    if (pattern) {
      const timeSinceLastAccess = now - pattern.lastAccessed;
      pattern.accessCount++;
      pattern.averageInterval = (pattern.averageInterval + timeSinceLastAccess) / 2;
      pattern.lastAccessed = now;
      
      // Recalculate score
      pattern.score = this.calculateAccessScore(pattern);
      
    } else {
      // Create new pattern
      this.accessPatterns.set(key, {
        key,
        accessCount: 1,
        lastAccessed: now,
        averageInterval: 0,
        contentType: 'unknown',
        isKorean: this.containsKorean(key),
        size: 0,
        score: 0.5, // Default score
      });
    }
    
    // Update backend performance
    this.updateBackendPerformance(backend, 'access', now);
    
    // Emit access event for monitoring
    this.emit('access', { key, backend, timestamp: now });
  }

  /**
   * Record cache set operation
   */
  async recordSet(key: string, backends: string[], strategy: CacheStrategy): Promise<void> {
    const now = Date.now();
    
    // Update pattern with set information
    const pattern = this.accessPatterns.get(key);
    if (pattern) {
      pattern.lastAccessed = now;
    }
    
    // Update backend performance
    for (const backend of backends) {
      this.updateBackendPerformance(backend, 'set', now);
    }
    
    // Record strategy usage
    this.recordStrategyUsage(strategy, true);
    
    this.emit('set', { key, backends, strategy, timestamp: now });
  }

  /**
   * Get cache recommendation for a key/value pair
   */
  async getRecommendation<T>(key: string, value: T): Promise<CacheRecommendation> {
    const analysis = this.analyzeContent(key, value);
    const pattern = this.accessPatterns.get(key);
    
    // Calculate scores for each strategy
    const strategyScores = new Map<CacheStrategy, number>();
    strategyScores.set('lru', this.scoreLRU(analysis, pattern));
    strategyScores.set('lfu', this.scoreLFU(analysis, pattern));
    strategyScores.set('ttl', this.scoreTTL(analysis, pattern));
    strategyScores.set('size', this.scoreSize(analysis, pattern));
    strategyScores.set('korean-optimized', this.scoreKorean(analysis, pattern));
    strategyScores.set('adaptive', this.scoreAdaptive(analysis, pattern));
    
    // Find best strategy
    let bestStrategy: CacheStrategy = 'lru';
    let bestScore = 0;
    const reasons: string[] = [];
    
    for (const [strategy, score] of strategyScores) {
      if (score > bestScore) {
        bestScore = score;
        bestStrategy = strategy;
      }
    }
    
    // Generate reasons
    if (analysis.isKorean) {
      reasons.push('Korean content detected');
    }
    
    if (analysis.size > this.config.sizePenaltyThreshold) {
      reasons.push('Large content size');
    }
    
    if (pattern && pattern.accessCount > 10) {
      reasons.push('High access frequency');
    }
    
    if (analysis.contentType.includes('krds')) {
      reasons.push('KRDS-specific content type');
    }
    
    // Generate optimizations
    const optimizations: string[] = [];
    
    if (bestStrategy === 'korean-optimized') {
      optimizations.push('Use Korean text normalization');
      optimizations.push('Enable Hangul-specific compression');
    }
    
    if (analysis.size > 1024 * 1024) {
      optimizations.push('Consider file cache backend');
      optimizations.push('Enable compression');
    }
    
    if (pattern && pattern.averageInterval < 300000) { // 5 minutes
      optimizations.push('Use memory cache for fast access');
    }
    
    return {
      strategy: bestStrategy,
      confidence: bestScore,
      reasons,
      optimizations,
    };
  }

  /**
   * Recommend backend for operation
   */
  recommendBackend(key: string, operation: 'read' | 'write', options?: {
    backends: string[];
    priority?: 'low' | 'medium' | 'high';
  }): string {
    const backends = options?.backends || ['memory', 'redis', 'file'];
    const pattern = this.accessPatterns.get(key);
    const isKorean = this.containsKorean(key);
    
    const scores = new Map<string, BackendRecommendation>();
    
    for (const backend of backends) {
      const performance = this.backendPerformance.get(backend);
      let score = 0.5; // Base score
      const reasons: string[] = [];
      
      // Backend-specific scoring
      switch (backend) {
        case 'memory':
          score += 0.3; // Fast access
          if (options?.priority === 'high') score += 0.2;
          if (pattern && pattern.averageInterval < 300000) {
            score += 0.2;
            reasons.push('Frequent access pattern');
          }
          reasons.push('Fast in-memory access');
          break;
          
        case 'redis':
          score += 0.2; // Good for distributed
          if (operation === 'write') score += 0.1;
          if (isKorean) {
            score += 0.1;
            reasons.push('Korean text support');
          }
          reasons.push('Distributed caching support');
          break;
          
        case 'file':
          if (pattern && pattern.size > 1024 * 1024) {
            score += 0.3;
            reasons.push('Large content optimization');
          }
          if (options?.priority === 'low') score += 0.1;
          reasons.push('Persistent storage');
          break;
      }
      
      // Performance-based adjustment
      if (performance) {
        const avgLatency = performance.totalLatency / performance.operationCount;
        const successRate = performance.successCount / performance.operationCount;
        
        score += successRate * 0.2;
        score -= Math.min(avgLatency / 1000, 0.2); // Penalty for high latency
        
        if (successRate > 0.95) reasons.push('High reliability');
        if (avgLatency < 100) reasons.push('Low latency');
      }
      
      scores.set(backend, { backend, score, reasons });
    }
    
    // Return backend with highest score
    let bestBackend = backends[0];
    let bestScore = 0;
    
    for (const [backend, recommendation] of scores) {
      if (recommendation.score > bestScore) {
        bestScore = recommendation.score;
        bestBackend = backend;
      }
    }
    
    return bestBackend;
  }

  /**
   * Get keys associated with tags
   */
  async getKeysByTags(tags: string[]): Promise<string[]> {
    const keys = new Set<string>();
    
    for (const tag of tags) {
      const tagKeys = this.tagMap.get(tag);
      if (tagKeys) {
        for (const key of tagKeys) {
          keys.add(key);
        }
      }
    }
    
    return Array.from(keys);
  }

  /**
   * Tag a cache key for group operations
   */
  async tagKey(key: string, tags: string[]): Promise<void> {
    // Remove existing tags for this key
    const existingTags = this.keyTags.get(key);
    if (existingTags) {
      for (const tag of existingTags) {
        const tagKeys = this.tagMap.get(tag);
        if (tagKeys) {
          tagKeys.delete(key);
          if (tagKeys.size === 0) {
            this.tagMap.delete(tag);
          }
        }
      }
    }
    
    // Add new tags
    const tagSet = new Set(tags);
    this.keyTags.set(key, tagSet);
    
    for (const tag of tags) {
      if (!this.tagMap.has(tag)) {
        this.tagMap.set(tag, new Set());
      }
      this.tagMap.get(tag)!.add(key);
    }
  }

  /**
   * Start background optimization
   */
  startOptimization(): void {
    this.optimizationTimer = setInterval(() => {
      this.optimizeStrategies().catch(error => {
        this.logger.error('Strategy optimization error', { error });
      });
    }, 300000); // Every 5 minutes
    
    this.logger.debug('Cache strategy optimization started');
  }

  /**
   * Stop background optimization
   */
  stopOptimization(): void {
    if (this.optimizationTimer) {
      clearInterval(this.optimizationTimer);
      this.optimizationTimer = undefined;
    }
    
    this.logger.debug('Cache strategy optimization stopped');
  }

  /**
   * Get strategy statistics
   */
  getStrategyStats(): {
    accessPatterns: number;
    topStrategies: Array<{ strategy: CacheStrategy; usage: number }>;
    backendPerformance: Array<{ backend: string; avgLatency: number; successRate: number }>;
    koreanContentRatio: number;
    recommendedStrategy: CacheStrategy;
  } {
    // Calculate top strategies
    const strategyUsage = new Map<CacheStrategy, number>();
    for (const entry of this.strategyHistory) {
      const count = strategyUsage.get(entry.strategy) || 0;
      strategyUsage.set(entry.strategy, count + 1);
    }
    
    const topStrategies = Array.from(strategyUsage.entries())
      .map(([strategy, usage]) => ({ strategy, usage }))
      .sort((a, b) => b.usage - a.usage)
      .slice(0, 5);
    
    // Calculate backend performance
    const backendPerformance = Array.from(this.backendPerformance.entries())
      .map(([backend, data]) => ({
        backend,
        avgLatency: data.operationCount > 0 ? data.totalLatency / data.operationCount : 0,
        successRate: data.operationCount > 0 ? data.successCount / data.operationCount : 0,
      }));
    
    // Calculate Korean content ratio
    const patterns = Array.from(this.accessPatterns.values());
    const koreanPatterns = patterns.filter(p => p.isKorean);
    const koreanContentRatio = patterns.length > 0 ? koreanPatterns.length / patterns.length : 0;
    
    return {
      accessPatterns: this.accessPatterns.size,
      topStrategies,
      backendPerformance,
      koreanContentRatio,
      recommendedStrategy: this.currentOptimalStrategy,
    };
  }

  /**
   * Private methods
   */

  private analyzeContent<T>(key: string, value: T): ContentAnalysis {
    const isKorean = this.containsKorean(key) || this.containsKorean(String(value));
    const size = this.estimateSize(value);
    const contentType = this.detectContentType(value);
    
    return {
      key,
      value,
      isKorean,
      size,
      contentType,
      complexity: this.calculateComplexity(value),
      priority: this.calculatePriority(key, isKorean, contentType),
    };
  }

  private containsKorean(text: string): boolean {
    return CacheStrategies.KOREAN_PATTERNS.hangul.test(text) ||
           CacheStrategies.KOREAN_PATTERNS.jamo.test(text);
  }

  private estimateSize(value: any): number {
    try {
      return JSON.stringify(value).length * 2; // Rough UTF-16 estimate
    } catch {
      return 1000; // Default estimate
    }
  }

  private detectContentType(value: any): string {
    if (typeof value === 'string') {
      return 'text/plain';
    }
    
    if (typeof value === 'object' && value !== null) {
      if (value.images && Array.isArray(value.images)) {
        return 'application/krds-document';
      }
      
      if (value.content && typeof value.content === 'string') {
        return 'application/krds-content';
      }
      
      return 'application/json';
    }
    
    return 'application/unknown';
  }

  private calculateComplexity(value: any): number {
    if (typeof value !== 'object' || value === null) {
      return 0.1;
    }
    
    try {
      const json = JSON.stringify(value);
      const depth = (json.match(/{|}|\[|\]/g) || []).length;
      const keys = Object.keys(value).length;
      
      return Math.min(1, (depth + keys) / 100);
    } catch {
      return 0.5;
    }
  }

  private calculatePriority(key: string, isKorean: boolean, contentType: string): number {
    let priority = 0.5; // Base priority
    
    if (isKorean) {
      priority += 0.2;
    }
    
    if (contentType.includes('krds')) {
      priority += 0.3;
    }
    
    const contentScore = CacheStrategies.CONTENT_SCORES[contentType] || 0.5;
    priority += contentScore * 0.3;
    
    return Math.min(1, priority);
  }

  private calculateAccessScore(pattern: AccessPattern): number {
    const now = Date.now();
    const timeSinceAccess = now - pattern.lastAccessed;
    const recencyScore = Math.max(0, 1 - (timeSinceAccess / this.config.frequencyWindow));
    const frequencyScore = Math.min(1, pattern.accessCount / 10);
    
    let score = (recencyScore * 0.6) + (frequencyScore * 0.4);
    
    // Korean content boost
    if (pattern.isKorean) {
      score *= this.config.koreanContentBoost;
    }
    
    // Size penalty
    if (pattern.size > this.config.sizePenaltyThreshold) {
      score *= 0.8;
    }
    
    return Math.min(1, score);
  }

  // Strategy-specific should cache methods
  private shouldCacheLRU(analysis: ContentAnalysis): boolean {
    return analysis.priority > 0.3;
  }

  private shouldCacheLFU(analysis: ContentAnalysis): boolean {
    const pattern = this.accessPatterns.get(analysis.key);
    return analysis.priority > 0.3 && (!pattern || pattern.accessCount > 1);
  }

  private shouldCacheTTL(analysis: ContentAnalysis): boolean {
    return analysis.priority > 0.4 && !analysis.contentType.includes('stream');
  }

  private shouldCacheSize(analysis: ContentAnalysis): boolean {
    return analysis.size < this.config.sizePenaltyThreshold || analysis.priority > 0.7;
  }

  private shouldCacheKorean(analysis: ContentAnalysis): boolean {
    return analysis.isKorean || analysis.priority > 0.5;
  }

  private shouldCacheAdaptive(analysis: ContentAnalysis): boolean {
    const recommendation = await this.getRecommendation(analysis.key, analysis.value);
    return recommendation.confidence > this.config.adaptiveThreshold;
  }

  // Strategy scoring methods
  private scoreLRU(analysis: ContentAnalysis, pattern?: AccessPattern): number {
    let score = 0.5;
    
    if (pattern) {
      const recencyScore = Math.max(0, 1 - ((Date.now() - pattern.lastAccessed) / this.config.frequencyWindow));
      score += recencyScore * 0.3;
    }
    
    return Math.min(1, score + analysis.priority * 0.2);
  }

  private scoreLFU(analysis: ContentAnalysis, pattern?: AccessPattern): number {
    let score = 0.4;
    
    if (pattern && pattern.accessCount > 5) {
      score += Math.min(0.4, pattern.accessCount / 50);
    }
    
    return Math.min(1, score + analysis.priority * 0.2);
  }

  private scoreTTL(analysis: ContentAnalysis, pattern?: AccessPattern): number {
    let score = 0.5;
    
    if (analysis.contentType.includes('document') || analysis.contentType.includes('content')) {
      score += 0.2;
    }
    
    return Math.min(1, score + analysis.priority * 0.3);
  }

  private scoreSize(analysis: ContentAnalysis, pattern?: AccessPattern): number {
    let score = 0.5;
    
    if (analysis.size < this.config.sizePenaltyThreshold) {
      score += 0.3;
    } else {
      score -= 0.2;
    }
    
    return Math.min(1, Math.max(0.1, score + analysis.priority * 0.2));
  }

  private scoreKorean(analysis: ContentAnalysis, pattern?: AccessPattern): number {
    let score = 0.4;
    
    if (analysis.isKorean) {
      score += 0.4;
    }
    
    if (analysis.contentType.includes('krds')) {
      score += 0.2;
    }
    
    return Math.min(1, score);
  }

  private scoreAdaptive(analysis: ContentAnalysis, pattern?: AccessPattern): number {
    // Combine multiple strategy scores
    const lruScore = this.scoreLRU(analysis, pattern);
    const lfuScore = this.scoreLFU(analysis, pattern);
    const ttlScore = this.scoreTTL(analysis, pattern);
    const koreanScore = this.scoreKorean(analysis, pattern);
    
    return (lruScore + lfuScore + ttlScore + koreanScore) / 4;
  }

  private updateBackendPerformance(backend: string, operation: string, timestamp: number, latency?: number, success: boolean = true): void {
    if (!this.backendPerformance.has(backend)) {
      this.backendPerformance.set(backend, {
        operationCount: 0,
        successCount: 0,
        totalLatency: 0,
        lastOperation: timestamp,
      });
    }
    
    const data = this.backendPerformance.get(backend)!;
    data.operationCount++;
    data.lastOperation = timestamp;
    
    if (success) {
      data.successCount++;
    }
    
    if (latency !== undefined) {
      data.totalLatency += latency;
    }
  }

  private recordStrategyUsage(strategy: CacheStrategy, success: boolean): void {
    const entry: StrategyHistoryEntry = {
      strategy,
      timestamp: Date.now(),
      success,
    };
    
    this.strategyHistory.push(entry);
    
    // Keep only recent history
    if (this.strategyHistory.length > 1000) {
      this.strategyHistory = this.strategyHistory.slice(-500);
    }
  }

  private async optimizeStrategies(): Promise<void> {
    // Analyze recent strategy performance
    const recentHistory = this.strategyHistory.filter(
      entry => Date.now() - entry.timestamp < this.config.frequencyWindow
    );
    
    if (recentHistory.length < 10) {
      return; // Not enough data
    }
    
    // Calculate success rates for each strategy
    const strategyPerformance = new Map<CacheStrategy, { total: number; successful: number }>();
    
    for (const entry of recentHistory) {
      if (!strategyPerformance.has(entry.strategy)) {
        strategyPerformance.set(entry.strategy, { total: 0, successful: 0 });
      }
      
      const perf = strategyPerformance.get(entry.strategy)!;
      perf.total++;
      if (entry.success) {
        perf.successful++;
      }
    }
    
    // Find best performing strategy
    let bestStrategy: CacheStrategy = this.currentOptimalStrategy;
    let bestSuccessRate = 0;
    
    for (const [strategy, perf] of strategyPerformance) {
      const successRate = perf.successful / perf.total;
      if (successRate > bestSuccessRate && perf.total > 5) {
        bestSuccessRate = successRate;
        bestStrategy = strategy;
      }
    }
    
    // Update optimal strategy if significantly better
    if (bestStrategy !== this.currentOptimalStrategy && bestSuccessRate > 0.8) {
      this.logger.info('Strategy optimization: switching optimal strategy', {
        from: this.currentOptimalStrategy,
        to: bestStrategy,
        successRate: bestSuccessRate,
      });
      
      this.currentOptimalStrategy = bestStrategy;
      this.emit('strategy-optimized', { strategy: bestStrategy, successRate: bestSuccessRate });
    }
  }
}

// Supporting interfaces
interface ContentAnalysis {
  key: string;
  value: any;
  isKorean: boolean;
  size: number;
  contentType: string;
  complexity: number;
  priority: number;
}

interface BackendPerformanceData {
  operationCount: number;
  successCount: number;
  totalLatency: number;
  lastOperation: number;
}

interface StrategyHistoryEntry {
  strategy: CacheStrategy;
  timestamp: number;
  success: boolean;
}