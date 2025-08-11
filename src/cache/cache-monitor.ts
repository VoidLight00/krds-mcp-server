/**
 * Cache Monitor
 * 
 * Comprehensive monitoring and analytics system for cache performance.
 * Provides real-time metrics, performance analysis, and alerting capabilities
 * with specialized Korean content analytics.
 * 
 * Features:
 * - Real-time performance monitoring
 * - Hit/miss rate tracking with trends
 * - Backend performance comparison
 * - Memory and disk usage monitoring
 * - Korean content-specific metrics
 * - Performance alerts and thresholds
 * - Historical data aggregation
 * - Export capabilities for analysis
 * - Integration with external monitoring systems
 * 
 * @author KRDS MCP Server
 * @version 1.0.0
 */

import type { Logger } from 'winston';
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { join } from 'path';

export interface CacheMetrics {
  timestamp: number;
  operations: {
    get: number;
    set: number;
    delete: number;
    clear: number;
  };
  performance: {
    hits: number;
    misses: number;
    hitRate: number;
    avgLatency: number;
    p95Latency: number;
    p99Latency: number;
  };
  backends: Record<string, BackendMetrics>;
  memory: {
    usage: number;
    limit: number;
    utilizationRate: number;
  };
  korean: {
    totalEntries: number;
    hitRate: number;
    avgProcessingTime: number;
  };
  errors: {
    total: number;
    byType: Record<string, number>;
    byBackend: Record<string, number>;
  };
}

export interface BackendMetrics {
  name: string;
  operations: number;
  hits: number;
  misses: number;
  hitRate: number;
  avgLatency: number;
  errors: number;
  availability: number;
  lastHealthCheck: number;
}

export interface PerformanceAlert {
  type: 'performance' | 'availability' | 'capacity' | 'error';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  metrics: Record<string, any>;
  timestamp: number;
  resolved: boolean;
}

export interface MonitoringConfig {
  metricsInterval: number; // How often to collect metrics (ms)
  historyRetention: number; // How long to keep historical data (ms)
  alertThresholds: AlertThresholds;
  enableExport: boolean;
  exportPath?: string;
  enableRealTime: boolean;
}

export interface AlertThresholds {
  hitRateMin: number; // Minimum acceptable hit rate
  latencyMax: number; // Maximum acceptable latency (ms)
  errorRateMax: number; // Maximum acceptable error rate
  memoryUtilizationMax: number; // Maximum memory utilization
  availabilityMin: number; // Minimum backend availability
}

export interface TrendAnalysis {
  metric: string;
  period: string;
  trend: 'increasing' | 'decreasing' | 'stable';
  change: number; // Percentage change
  confidence: number; // 0-1
  recommendation?: string;
}

/**
 * Cache monitoring and analytics system
 */
export class CacheMonitor extends EventEmitter {
  private logger: Logger;
  private config: MonitoringConfig;
  private currentMetrics: CacheMetrics;
  private metricsHistory: CacheMetrics[] = [];
  private alerts: PerformanceAlert[] = [];
  private latencyBuffer: number[] = [];
  private koreanMetrics = new Map<string, KoreanContentMetrics>();
  
  // Monitoring timers
  private metricsTimer?: NodeJS.Timeout;
  private alertTimer?: NodeJS.Timeout;
  private exportTimer?: NodeJS.Timeout;
  
  // Performance tracking
  private operationCounters = new Map<string, number>();
  private backendCounters = new Map<string, BackendCounters>();
  private errorCounters = new Map<string, number>();
  
  // Korean content analysis
  private static readonly KOREAN_PATTERNS = {
    hangul: /[\uAC00-\uD7AF]/g,
    mixed: /[\uAC00-\uD7AF].*[a-zA-Z]|[a-zA-Z].*[\uAC00-\uD7AF]/,
    technical: /[\uAC00-\uD7AF].*(API|HTTP|URL|JSON)/i,
  };
  
  constructor(logger: Logger, config?: Partial<MonitoringConfig>) {
    super();
    
    this.logger = logger;
    this.config = {
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
      exportPath: './cache-metrics',
      enableRealTime: true,
      ...config,
    };
    
    // Initialize current metrics
    this.currentMetrics = this.createEmptyMetrics();
    
    this.logger.info('Cache monitor initialized', {
      metricsInterval: this.config.metricsInterval,
      exportEnabled: this.config.enableExport,
      realTimeEnabled: this.config.enableRealTime,
    });
  }

  /**
   * Initialize monitoring system
   */
  async initialize(): Promise<void> {
    try {
      // Ensure export directory exists
      if (this.config.enableExport && this.config.exportPath) {
        await fs.mkdir(this.config.exportPath, { recursive: true });
      }
      
      // Load historical data if available
      await this.loadHistoricalData();
      
      this.logger.info('Cache monitor initialization completed');
      
    } catch (error) {
      this.logger.error('Failed to initialize cache monitor', { error });
      throw error;
    }
  }

  /**
   * Start monitoring
   */
  startMonitoring(): void {
    // Start metrics collection
    this.metricsTimer = setInterval(() => {
      this.collectMetrics();
    }, this.config.metricsInterval);
    
    // Start alert checking
    this.alertTimer = setInterval(() => {
      this.checkAlerts();
    }, this.config.metricsInterval / 2); // Check alerts more frequently
    
    // Start export timer if enabled
    if (this.config.enableExport) {
      this.exportTimer = setInterval(() => {
        this.exportMetrics().catch(error => {
          this.logger.error('Metrics export failed', { error });
        });
      }, this.config.metricsInterval * 10); // Export every 10 intervals
    }
    
    this.logger.info('Cache monitoring started');
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = undefined;
    }
    
    if (this.alertTimer) {
      clearInterval(this.alertTimer);
      this.alertTimer = undefined;
    }
    
    if (this.exportTimer) {
      clearInterval(this.exportTimer);
      this.exportTimer = undefined;
    }
    
    this.logger.info('Cache monitoring stopped');
  }

  /**
   * Record cache operation
   */
  async recordOperation(
    operation: 'get' | 'set' | 'delete' | 'clear',
    backend: string,
    latency: number,
    success: boolean,
    isKorean?: boolean,
    keyPattern?: string
  ): Promise<void> {
    const timestamp = Date.now();
    
    // Update operation counters
    const opKey = `${operation}:${backend}`;
    this.operationCounters.set(opKey, (this.operationCounters.get(opKey) || 0) + 1);
    
    // Update backend counters
    if (!this.backendCounters.has(backend)) {
      this.backendCounters.set(backend, {
        operations: 0,
        hits: 0,
        misses: 0,
        latencies: [],
        errors: 0,
        lastSeen: timestamp,
      });
    }
    
    const backendCounter = this.backendCounters.get(backend)!;
    backendCounter.operations++;
    backendCounter.latencies.push(latency);
    backendCounter.lastSeen = timestamp;
    
    // Track hit/miss for get operations
    if (operation === 'get') {
      if (success) {
        backendCounter.hits++;
      } else {
        backendCounter.misses++;
      }
    }
    
    // Korean content tracking
    if (isKorean && keyPattern) {
      this.updateKoreanMetrics(keyPattern, latency, success);
    }
    
    // Keep latency buffer for percentile calculations
    this.latencyBuffer.push(latency);
    if (this.latencyBuffer.length > 1000) {
      this.latencyBuffer = this.latencyBuffer.slice(-500);
    }
    
    // Emit real-time event if enabled
    if (this.config.enableRealTime) {
      this.emit('operation', {
        operation,
        backend,
        latency,
        success,
        isKorean,
        timestamp,
      });
    }
  }

  /**
   * Record error
   */
  async recordError(operation: string, backend: string, error: Error): Promise<void> {
    const errorType = error.constructor.name;
    const errorKey = `${errorType}:${backend}`;
    
    this.errorCounters.set(errorKey, (this.errorCounters.get(errorKey) || 0) + 1);
    
    // Update backend error counter
    const backendCounter = this.backendCounters.get(backend);
    if (backendCounter) {
      backendCounter.errors++;
    }
    
    this.emit('error', {
      operation,
      backend,
      errorType,
      message: error.message,
      timestamp: Date.now(),
    });
    
    this.logger.warn('Cache operation error recorded', {
      operation,
      backend,
      errorType,
      message: error.message,
    });
  }

  /**
   * Get current metrics snapshot
   */
  getCurrentMetrics(): CacheMetrics {
    return { ...this.currentMetrics };
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(since?: number): CacheMetrics[] {
    const cutoff = since || (Date.now() - this.config.historyRetention);
    return this.metricsHistory.filter(m => m.timestamp >= cutoff);
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): PerformanceAlert[] {
    return this.alerts.filter(alert => !alert.resolved);
  }

  /**
   * Get all alerts (including resolved)
   */
  getAllAlerts(since?: number): PerformanceAlert[] {
    const cutoff = since || (Date.now() - this.config.historyRetention);
    return this.alerts.filter(alert => alert.timestamp >= cutoff);
  }

  /**
   * Analyze performance trends
   */
  analyzeTrends(period: 'hour' | 'day' | 'week' = 'hour'): TrendAnalysis[] {
    const periodMs = {
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
    }[period];
    
    const since = Date.now() - periodMs;
    const history = this.getMetricsHistory(since);
    
    if (history.length < 10) {
      return []; // Not enough data for trend analysis
    }
    
    const trends: TrendAnalysis[] = [];
    
    // Analyze hit rate trend
    trends.push(this.analyzeTrend('hitRate', history, 'performance.hitRate', period));
    
    // Analyze latency trend
    trends.push(this.analyzeTrend('avgLatency', history, 'performance.avgLatency', period));
    
    // Analyze memory utilization trend
    trends.push(this.analyzeTrend('memoryUtilization', history, 'memory.utilizationRate', period));
    
    // Analyze Korean content performance trend
    trends.push(this.analyzeTrend('koreanHitRate', history, 'korean.hitRate', period));
    
    return trends;
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): {
    overall: {
      hitRate: number;
      avgLatency: number;
      errorRate: number;
      uptime: number;
    };
    backends: Array<{
      name: string;
      performance: number; // 0-1 score
      issues: string[];
    }>;
    korean: {
      contentRatio: number;
      performanceBoost: number;
      processingEfficiency: number;
    };
    recommendations: string[];
  } {
    const metrics = this.currentMetrics;
    const backends = Object.entries(metrics.backends);
    
    // Calculate overall performance
    const totalOps = metrics.operations.get + metrics.operations.set + metrics.operations.delete;
    const errorRate = totalOps > 0 ? metrics.errors.total / totalOps : 0;
    
    // Analyze backend performance
    const backendAnalysis = backends.map(([name, backendMetrics]) => {
      const performance = this.calculateBackendPerformance(backendMetrics);
      const issues: string[] = [];
      
      if (backendMetrics.hitRate < this.config.alertThresholds.hitRateMin) {
        issues.push('Low hit rate');
      }
      
      if (backendMetrics.avgLatency > this.config.alertThresholds.latencyMax) {
        issues.push('High latency');
      }
      
      if (backendMetrics.availability < this.config.alertThresholds.availabilityMin) {
        issues.push('Availability issues');
      }
      
      return { name, performance, issues };
    });
    
    // Korean content analysis
    const koreanEntries = Array.from(this.koreanMetrics.values());
    const totalKorean = koreanEntries.reduce((sum, m) => sum + m.operations, 0);
    const koreanHits = koreanEntries.reduce((sum, m) => sum + m.hits, 0);
    const koreanLatency = koreanEntries.reduce((sum, m) => sum + m.avgLatency, 0) / koreanEntries.length;
    
    const koreanHitRate = totalKorean > 0 ? koreanHits / totalKorean : 0;
    const overallLatency = metrics.performance.avgLatency;
    const performanceBoost = overallLatency > 0 ? (overallLatency - koreanLatency) / overallLatency : 0;
    
    // Generate recommendations
    const recommendations: string[] = [];
    
    if (metrics.performance.hitRate < 0.8) {
      recommendations.push('Consider increasing cache TTL or size limits');
    }
    
    if (metrics.performance.avgLatency > 500) {
      recommendations.push('Optimize slow operations or increase memory cache usage');
    }
    
    if (metrics.memory.utilizationRate > 0.85) {
      recommendations.push('Consider increasing memory limits or implementing better eviction');
    }
    
    if (koreanHitRate > metrics.performance.hitRate * 1.1) {
      recommendations.push('Korean content shows good cache performance - consider Korean-optimized strategies');
    }
    
    return {
      overall: {
        hitRate: metrics.performance.hitRate,
        avgLatency: metrics.performance.avgLatency,
        errorRate,
        uptime: this.calculateUptime(),
      },
      backends: backendAnalysis,
      korean: {
        contentRatio: totalKorean / totalOps,
        performanceBoost,
        processingEfficiency: koreanHitRate,
      },
      recommendations,
    };
  }

  /**
   * Shutdown monitor
   */
  async shutdown(): Promise<void> {
    this.stopMonitoring();
    
    // Export final metrics
    if (this.config.enableExport) {
      await this.exportMetrics();
    }
    
    this.removeAllListeners();
    this.logger.info('Cache monitor shutdown completed');
  }

  /**
   * Private methods
   */

  private createEmptyMetrics(): CacheMetrics {
    return {
      timestamp: Date.now(),
      operations: {
        get: 0,
        set: 0,
        delete: 0,
        clear: 0,
      },
      performance: {
        hits: 0,
        misses: 0,
        hitRate: 0,
        avgLatency: 0,
        p95Latency: 0,
        p99Latency: 0,
      },
      backends: {},
      memory: {
        usage: 0,
        limit: 0,
        utilizationRate: 0,
      },
      korean: {
        totalEntries: 0,
        hitRate: 0,
        avgProcessingTime: 0,
      },
      errors: {
        total: 0,
        byType: {},
        byBackend: {},
      },
    };
  }

  private collectMetrics(): void {
    const timestamp = Date.now();
    
    try {
      // Create new metrics snapshot
      const metrics: CacheMetrics = {
        timestamp,
        operations: {
          get: this.sumOperationCounters('get'),
          set: this.sumOperationCounters('set'),
          delete: this.sumOperationCounters('delete'),
          clear: this.sumOperationCounters('clear'),
        },
        performance: this.calculatePerformanceMetrics(),
        backends: this.calculateBackendMetrics(),
        memory: this.calculateMemoryMetrics(),
        korean: this.calculateKoreanMetrics(),
        errors: this.calculateErrorMetrics(),
      };
      
      // Update current metrics
      this.currentMetrics = metrics;
      
      // Add to history
      this.metricsHistory.push(metrics);
      
      // Cleanup old history
      this.cleanupHistory();
      
      // Emit metrics event
      this.emit('metrics', metrics);
      
    } catch (error) {
      this.logger.error('Error collecting metrics', { error });
    }
  }

  private sumOperationCounters(operation: string): number {
    let sum = 0;
    for (const [key, count] of this.operationCounters) {
      if (key.startsWith(`${operation}:`)) {
        sum += count;
      }
    }
    return sum;
  }

  private calculatePerformanceMetrics(): CacheMetrics['performance'] {
    let totalHits = 0;
    let totalMisses = 0;
    let totalLatency = 0;
    let operationCount = 0;
    
    for (const [, counter] of this.backendCounters) {
      totalHits += counter.hits;
      totalMisses += counter.misses;
      
      for (const latency of counter.latencies) {
        totalLatency += latency;
        operationCount++;
      }
    }
    
    const hitRate = (totalHits + totalMisses) > 0 ? totalHits / (totalHits + totalMisses) : 0;
    const avgLatency = operationCount > 0 ? totalLatency / operationCount : 0;
    
    // Calculate percentiles
    const sortedLatencies = [...this.latencyBuffer].sort((a, b) => a - b);
    const p95Index = Math.floor(sortedLatencies.length * 0.95);
    const p99Index = Math.floor(sortedLatencies.length * 0.99);
    
    return {
      hits: totalHits,
      misses: totalMisses,
      hitRate,
      avgLatency,
      p95Latency: sortedLatencies[p95Index] || 0,
      p99Latency: sortedLatencies[p99Index] || 0,
    };
  }

  private calculateBackendMetrics(): Record<string, BackendMetrics> {
    const backends: Record<string, BackendMetrics> = {};
    
    for (const [backendName, counter] of this.backendCounters) {
      const hitRate = (counter.hits + counter.misses) > 0 
        ? counter.hits / (counter.hits + counter.misses) 
        : 0;
      
      const avgLatency = counter.latencies.length > 0
        ? counter.latencies.reduce((sum, l) => sum + l, 0) / counter.latencies.length
        : 0;
      
      const availability = counter.operations > 0
        ? (counter.operations - counter.errors) / counter.operations
        : 1;
      
      backends[backendName] = {
        name: backendName,
        operations: counter.operations,
        hits: counter.hits,
        misses: counter.misses,
        hitRate,
        avgLatency,
        errors: counter.errors,
        availability,
        lastHealthCheck: counter.lastSeen,
      };
    }
    
    return backends;
  }

  private calculateMemoryMetrics(): CacheMetrics['memory'] {
    // This would need to be implemented based on actual memory monitoring
    // For now, return placeholder values
    const usage = process.memoryUsage().heapUsed;
    const limit = process.memoryUsage().heapTotal;
    
    return {
      usage,
      limit,
      utilizationRate: limit > 0 ? usage / limit : 0,
    };
  }

  private calculateKoreanMetrics(): CacheMetrics['korean'] {
    const koreanEntries = Array.from(this.koreanMetrics.values());
    
    const totalEntries = koreanEntries.length;
    const totalOperations = koreanEntries.reduce((sum, m) => sum + m.operations, 0);
    const totalHits = koreanEntries.reduce((sum, m) => sum + m.hits, 0);
    const totalProcessingTime = koreanEntries.reduce((sum, m) => sum + m.totalProcessingTime, 0);
    
    return {
      totalEntries,
      hitRate: totalOperations > 0 ? totalHits / totalOperations : 0,
      avgProcessingTime: totalEntries > 0 ? totalProcessingTime / totalEntries : 0,
    };
  }

  private calculateErrorMetrics(): CacheMetrics['errors'] {
    const total = Array.from(this.errorCounters.values()).reduce((sum, count) => sum + count, 0);
    
    const byType: Record<string, number> = {};
    const byBackend: Record<string, number> = {};
    
    for (const [key, count] of this.errorCounters) {
      const [type, backend] = key.split(':');
      byType[type] = (byType[type] || 0) + count;
      byBackend[backend] = (byBackend[backend] || 0) + count;
    }
    
    return {
      total,
      byType,
      byBackend,
    };
  }

  private updateKoreanMetrics(keyPattern: string, latency: number, success: boolean): void {
    if (!this.koreanMetrics.has(keyPattern)) {
      this.koreanMetrics.set(keyPattern, {
        pattern: keyPattern,
        operations: 0,
        hits: 0,
        totalProcessingTime: 0,
        avgLatency: 0,
        lastAccessed: Date.now(),
      });
    }
    
    const metrics = this.koreanMetrics.get(keyPattern)!;
    metrics.operations++;
    metrics.totalProcessingTime += latency;
    metrics.avgLatency = metrics.totalProcessingTime / metrics.operations;
    metrics.lastAccessed = Date.now();
    
    if (success) {
      metrics.hits++;
    }
  }

  private checkAlerts(): void {
    const metrics = this.currentMetrics;
    const alerts: PerformanceAlert[] = [];
    
    // Check hit rate threshold
    if (metrics.performance.hitRate < this.config.alertThresholds.hitRateMin) {
      alerts.push({
        type: 'performance',
        severity: metrics.performance.hitRate < 0.5 ? 'high' : 'medium',
        message: `Cache hit rate is ${(metrics.performance.hitRate * 100).toFixed(1)}%, below threshold of ${(this.config.alertThresholds.hitRateMin * 100).toFixed(1)}%`,
        metrics: { hitRate: metrics.performance.hitRate },
        timestamp: Date.now(),
        resolved: false,
      });
    }
    
    // Check latency threshold
    if (metrics.performance.avgLatency > this.config.alertThresholds.latencyMax) {
      alerts.push({
        type: 'performance',
        severity: metrics.performance.avgLatency > this.config.alertThresholds.latencyMax * 2 ? 'high' : 'medium',
        message: `Average latency is ${metrics.performance.avgLatency.toFixed(0)}ms, above threshold of ${this.config.alertThresholds.latencyMax}ms`,
        metrics: { avgLatency: metrics.performance.avgLatency },
        timestamp: Date.now(),
        resolved: false,
      });
    }
    
    // Check memory utilization
    if (metrics.memory.utilizationRate > this.config.alertThresholds.memoryUtilizationMax) {
      alerts.push({
        type: 'capacity',
        severity: metrics.memory.utilizationRate > 0.95 ? 'critical' : 'high',
        message: `Memory utilization is ${(metrics.memory.utilizationRate * 100).toFixed(1)}%, above threshold of ${(this.config.alertThresholds.memoryUtilizationMax * 100).toFixed(1)}%`,
        metrics: { memoryUtilization: metrics.memory.utilizationRate },
        timestamp: Date.now(),
        resolved: false,
      });
    }
    
    // Check backend availability
    for (const [name, backend] of Object.entries(metrics.backends)) {
      if (backend.availability < this.config.alertThresholds.availabilityMin) {
        alerts.push({
          type: 'availability',
          severity: backend.availability < 0.8 ? 'critical' : 'high',
          message: `Backend ${name} availability is ${(backend.availability * 100).toFixed(1)}%, below threshold of ${(this.config.alertThresholds.availabilityMin * 100).toFixed(1)}%`,
          metrics: { backend: name, availability: backend.availability },
          timestamp: Date.now(),
          resolved: false,
        });
      }
    }
    
    // Add new alerts and emit events
    for (const alert of alerts) {
      // Check if similar alert already exists
      const existing = this.alerts.find(a => 
        !a.resolved && 
        a.type === alert.type && 
        a.message === alert.message
      );
      
      if (!existing) {
        this.alerts.push(alert);
        this.emit('alert', alert);
        
        this.logger.warn('Cache performance alert triggered', {
          type: alert.type,
          severity: alert.severity,
          message: alert.message,
        });
      }
    }
    
    // Auto-resolve alerts if conditions are met
    this.resolveAlerts();
  }

  private resolveAlerts(): void {
    const metrics = this.currentMetrics;
    
    for (const alert of this.alerts) {
      if (alert.resolved) continue;
      
      let shouldResolve = false;
      
      switch (alert.type) {
        case 'performance':
          if (alert.message.includes('hit rate')) {
            shouldResolve = metrics.performance.hitRate >= this.config.alertThresholds.hitRateMin;
          } else if (alert.message.includes('latency')) {
            shouldResolve = metrics.performance.avgLatency <= this.config.alertThresholds.latencyMax;
          }
          break;
          
        case 'capacity':
          shouldResolve = metrics.memory.utilizationRate <= this.config.alertThresholds.memoryUtilizationMax;
          break;
          
        case 'availability':
          const backendName = alert.metrics.backend;
          const backend = metrics.backends[backendName];
          shouldResolve = backend && backend.availability >= this.config.alertThresholds.availabilityMin;
          break;
      }
      
      if (shouldResolve) {
        alert.resolved = true;
        this.emit('alert-resolved', alert);
        
        this.logger.info('Cache performance alert resolved', {
          type: alert.type,
          message: alert.message,
        });
      }
    }
  }

  private analyzeTrend(
    name: string,
    history: CacheMetrics[],
    metricPath: string,
    period: string
  ): TrendAnalysis {
    const values = history.map(h => this.getNestedValue(h, metricPath));
    
    if (values.length < 2) {
      return {
        metric: name,
        period,
        trend: 'stable',
        change: 0,
        confidence: 0,
      };
    }
    
    const first = values[0];
    const last = values[values.length - 1];
    const change = last - first;
    const percentChange = first !== 0 ? (change / first) * 100 : 0;
    
    let trend: 'increasing' | 'decreasing' | 'stable';
    if (Math.abs(percentChange) < 5) {
      trend = 'stable';
    } else if (percentChange > 0) {
      trend = 'increasing';
    } else {
      trend = 'decreasing';
    }
    
    // Calculate confidence based on consistency
    let consistency = 0;
    for (let i = 1; i < values.length; i++) {
      const direction = values[i] > values[i - 1] ? 1 : values[i] < values[i - 1] ? -1 : 0;
      const expectedDirection = trend === 'increasing' ? 1 : trend === 'decreasing' ? -1 : 0;
      if (direction === expectedDirection) {
        consistency++;
      }
    }
    
    const confidence = consistency / (values.length - 1);
    
    return {
      metric: name,
      period,
      trend,
      change: percentChange,
      confidence,
    };
  }

  private getNestedValue(obj: any, path: string): number {
    const keys = path.split('.');
    let current = obj;
    
    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return 0;
      }
    }
    
    return typeof current === 'number' ? current : 0;
  }

  private calculateBackendPerformance(metrics: BackendMetrics): number {
    let score = 0.5; // Base score
    
    // Hit rate contribution (40%)
    score += (metrics.hitRate - 0.5) * 0.4;
    
    // Latency contribution (30%)
    const latencyScore = Math.max(0, (1000 - metrics.avgLatency) / 1000);
    score += latencyScore * 0.3;
    
    // Availability contribution (30%)
    score += metrics.availability * 0.3;
    
    return Math.max(0, Math.min(1, score));
  }

  private calculateUptime(): number {
    const now = Date.now();
    const uptime = process.uptime() * 1000; // Convert to milliseconds
    return uptime / (24 * 60 * 60 * 1000); // Return as days
  }

  private cleanupHistory(): void {
    const cutoff = Date.now() - this.config.historyRetention;
    this.metricsHistory = this.metricsHistory.filter(m => m.timestamp >= cutoff);
    this.alerts = this.alerts.filter(a => a.timestamp >= cutoff);
  }

  private async loadHistoricalData(): Promise<void> {
    // Implementation would load from persistent storage
    // For now, just log that it would attempt to load
    this.logger.debug('Historical metrics data loading would be implemented here');
  }

  private async exportMetrics(): Promise<void> {
    if (!this.config.exportPath) {
      return;
    }
    
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `cache-metrics-${timestamp}.json`;
      const filepath = join(this.config.exportPath, filename);
      
      const exportData = {
        timestamp: Date.now(),
        currentMetrics: this.currentMetrics,
        recentHistory: this.metricsHistory.slice(-100), // Last 100 entries
        activeAlerts: this.getActiveAlerts(),
        summary: this.getPerformanceSummary(),
      };
      
      await fs.writeFile(filepath, JSON.stringify(exportData, null, 2));
      
      this.logger.debug('Metrics exported', { filename });
      
    } catch (error) {
      this.logger.error('Failed to export metrics', { error });
    }
  }
}

// Supporting interfaces
interface BackendCounters {
  operations: number;
  hits: number;
  misses: number;
  latencies: number[];
  errors: number;
  lastSeen: number;
}

interface KoreanContentMetrics {
  pattern: string;
  operations: number;
  hits: number;
  totalProcessingTime: number;
  avgLatency: number;
  lastAccessed: number;
}