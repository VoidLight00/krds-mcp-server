/**
 * Rate Limiter with Robots.txt Compliance
 * 
 * Implements rate limiting for web scraping operations with respect for
 * robots.txt directives. Ensures compliance with KRDS website crawling
 * policies and implements sophisticated backoff strategies.
 * 
 * @author KRDS MCP Server
 * @version 1.0.0
 */

import { RateLimiterMemory } from 'rate-limiter-flexible';
import type { Logger } from 'winston';
import type { RateLimiter } from '@/types/index.js';
import { RATE_LIMIT_CONFIG, ROBOTS_CONFIG } from './scraper-config.js';

/**
 * Robots.txt parsing result
 */
interface RobotsDirective {
  userAgent: string;
  rules: {
    allow: string[];
    disallow: string[];
    crawlDelay?: number;
    sitemap?: string[];
  };
}

/**
 * Request timing information
 */
interface RequestTiming {
  lastRequest: number;
  requestCount: number;
  cooldownUntil?: number;
}

/**
 * Advanced rate limiter with robots.txt compliance
 */
export class KrdsRateLimiter implements RateLimiter {
  private limiter: RateLimiterMemory;
  private requestTimings: Map<string, RequestTiming> = new Map();
  private robotsCache: Map<string, RobotsDirective> = new Map();
  private robotsCacheExpiry: Map<string, number> = new Map();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    
    // Initialize rate limiter with burst support
    this.limiter = new RateLimiterMemory({
      keyGenerator: (req: any) => req.identifier || 'default',
      points: RATE_LIMIT_CONFIG.burstLimit, // Number of requests
      duration: 1, // Per 1 second
      blockDuration: RATE_LIMIT_CONFIG.cooldownMs / 1000, // Block for cooldown period
    });
  }

  /**
   * Check if request is allowed under rate limits
   */
  async checkLimit(identifier: string = 'default'): Promise<boolean> {
    try {
      // Check basic rate limit
      const rateLimitResult = await this.limiter.get(identifier);
      
      // If we're in cooldown, check if it's expired
      const timing = this.requestTimings.get(identifier);
      if (timing?.cooldownUntil && Date.now() < timing.cooldownUntil) {
        this.logger.debug('Request blocked: still in cooldown period', {
          identifier,
          cooldownUntil: new Date(timing.cooldownUntil),
        });
        return false;
      }

      // Check if we need to wait due to crawl delay
      if (timing?.lastRequest) {
        const timeSinceLastRequest = Date.now() - timing.lastRequest;
        const minDelay = 1000 / RATE_LIMIT_CONFIG.requestsPerSecond; // Convert to milliseconds
        
        if (timeSinceLastRequest < minDelay) {
          this.logger.debug('Request blocked: minimum delay not met', {
            identifier,
            timeSinceLastRequest,
            minDelay,
          });
          return false;
        }
      }

      // Check against rate limiter
      if (rateLimitResult && rateLimitResult.remainingHits <= 0) {
        // Trigger cooldown
        this.setCooldown(identifier);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error('Error checking rate limit', { identifier, error });
      return false;
    }
  }

  /**
   * Record a successful request
   */
  async recordRequest(identifier: string = 'default'): Promise<void> {
    try {
      // Consume a point from the rate limiter
      await this.limiter.consume(identifier);
      
      // Update timing information
      const now = Date.now();
      const timing = this.requestTimings.get(identifier) || {
        lastRequest: 0,
        requestCount: 0,
      };

      timing.lastRequest = now;
      timing.requestCount += 1;
      
      // Clear cooldown if it exists
      if (timing.cooldownUntil) {
        delete timing.cooldownUntil;
      }

      this.requestTimings.set(identifier, timing);

      this.logger.debug('Request recorded', {
        identifier,
        requestCount: timing.requestCount,
        lastRequest: new Date(timing.lastRequest),
      });
    } catch (error) {
      this.logger.error('Error recording request', { identifier, error });
    }
  }

  /**
   * Get remaining requests for identifier
   */
  async getRemainingRequests(identifier: string = 'default'): Promise<number> {
    try {
      const result = await this.limiter.get(identifier);
      return result ? result.remainingHits : RATE_LIMIT_CONFIG.burstLimit;
    } catch (error) {
      this.logger.error('Error getting remaining requests', { identifier, error });
      return 0;
    }
  }

  /**
   * Reset rate limit for identifier
   */
  async resetLimit(identifier: string = 'default'): Promise<void> {
    try {
      await this.limiter.delete(identifier);
      this.requestTimings.delete(identifier);
      this.logger.info('Rate limit reset', { identifier });
    } catch (error) {
      this.logger.error('Error resetting rate limit', { identifier, error });
    }
  }

  /**
   * Check if URL is allowed by robots.txt
   */
  async isUrlAllowed(url: string, userAgent: string = ROBOTS_CONFIG.userAgent): Promise<boolean> {
    try {
      const urlObj = new URL(url);
      const robotsUrl = `${urlObj.origin}/robots.txt`;
      
      // Get robots.txt directives
      const robots = await this.getRobotsDirectives(robotsUrl);
      if (!robots) {
        // If robots.txt doesn't exist or can't be parsed, allow by default
        return true;
      }

      // Check against user-agent specific rules
      const rules = this.findApplicableRules(robots, userAgent);
      
      // Check disallow rules first
      for (const disallowPattern of rules.disallow) {
        if (this.matchesPattern(urlObj.pathname, disallowPattern)) {
          this.logger.debug('URL disallowed by robots.txt', {
            url,
            pattern: disallowPattern,
            userAgent,
          });
          return false;
        }
      }

      // Check allow rules (override disallow)
      for (const allowPattern of rules.allow) {
        if (this.matchesPattern(urlObj.pathname, allowPattern)) {
          this.logger.debug('URL explicitly allowed by robots.txt', {
            url,
            pattern: allowPattern,
            userAgent,
          });
          return true;
        }
      }

      // If not explicitly disallowed, allow by default
      return true;
    } catch (error) {
      this.logger.error('Error checking robots.txt', { url, error });
      // On error, be conservative and allow
      return true;
    }
  }

  /**
   * Get crawl delay from robots.txt
   */
  async getCrawlDelay(url: string, userAgent: string = ROBOTS_CONFIG.userAgent): Promise<number> {
    try {
      const urlObj = new URL(url);
      const robotsUrl = `${urlObj.origin}/robots.txt`;
      
      const robots = await this.getRobotsDirectives(robotsUrl);
      if (!robots) {
        return ROBOTS_CONFIG.defaultCrawlDelay;
      }

      const rules = this.findApplicableRules(robots, userAgent);
      return rules.crawlDelay || ROBOTS_CONFIG.defaultCrawlDelay;
    } catch (error) {
      this.logger.error('Error getting crawl delay', { url, error });
      return ROBOTS_CONFIG.defaultCrawlDelay;
    }
  }

  /**
   * Wait for appropriate delay before next request
   */
  async waitForNextRequest(identifier: string = 'default', url?: string): Promise<void> {
    const timing = this.requestTimings.get(identifier);
    if (!timing?.lastRequest) {
      return; // First request, no wait needed
    }

    let requiredDelay = 1000 / RATE_LIMIT_CONFIG.requestsPerSecond; // Base delay

    // If URL is provided, check for robots.txt crawl delay
    if (url) {
      try {
        const robotsDelay = await this.getCrawlDelay(url);
        requiredDelay = Math.max(requiredDelay, robotsDelay * 1000); // Convert to milliseconds
      } catch (error) {
        this.logger.warn('Could not get crawl delay, using default', { url, error });
      }
    }

    const timeSinceLastRequest = Date.now() - timing.lastRequest;
    const waitTime = requiredDelay - timeSinceLastRequest;

    if (waitTime > 0) {
      this.logger.debug('Waiting before next request', {
        identifier,
        waitTimeMs: waitTime,
        requiredDelayMs: requiredDelay,
      });
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Set cooldown period for identifier
   */
  private setCooldown(identifier: string): void {
    const timing = this.requestTimings.get(identifier) || {
      lastRequest: 0,
      requestCount: 0,
    };

    timing.cooldownUntil = Date.now() + RATE_LIMIT_CONFIG.cooldownMs;
    this.requestTimings.set(identifier, timing);

    this.logger.warn('Rate limit exceeded, entering cooldown', {
      identifier,
      cooldownUntil: new Date(timing.cooldownUntil),
    });
  }

  /**
   * Fetch and parse robots.txt
   */
  private async getRobotsDirectives(robotsUrl: string): Promise<RobotsDirective | null> {
    // Check cache first
    const cached = this.robotsCache.get(robotsUrl);
    const cacheExpiry = this.robotsCacheExpiry.get(robotsUrl);
    
    if (cached && cacheExpiry && Date.now() < cacheExpiry) {
      return cached;
    }

    try {
      this.logger.debug('Fetching robots.txt', { robotsUrl });
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), ROBOTS_CONFIG.robotsTimeout);

      const response = await fetch(robotsUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': ROBOTS_CONFIG.userAgent,
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        if (response.status === 404) {
          this.logger.debug('robots.txt not found', { robotsUrl });
          return null;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const content = await response.text();
      const directive = this.parseRobotsTxt(content);

      // Cache the result
      this.robotsCache.set(robotsUrl, directive);
      this.robotsCacheExpiry.set(robotsUrl, Date.now() + ROBOTS_CONFIG.robotsCacheTtl * 1000);

      return directive;
    } catch (error) {
      this.logger.warn('Failed to fetch robots.txt', { robotsUrl, error });
      return null;
    }
  }

  /**
   * Parse robots.txt content
   */
  private parseRobotsTxt(content: string): RobotsDirective {
    const lines = content.split('\n').map(line => line.trim());
    const directive: RobotsDirective = {
      userAgent: '*',
      rules: {
        allow: [],
        disallow: [],
        sitemap: [],
      },
    };

    let currentUserAgent = '*';

    for (const line of lines) {
      if (line.startsWith('#') || !line) {
        continue; // Skip comments and empty lines
      }

      const [key, ...valueParts] = line.split(':');
      const value = valueParts.join(':').trim();

      switch (key.toLowerCase()) {
        case 'user-agent':
          currentUserAgent = value;
          break;
        case 'disallow':
          directive.rules.disallow.push(value);
          break;
        case 'allow':
          directive.rules.allow.push(value);
          break;
        case 'crawl-delay':
          const delay = parseInt(value, 10);
          if (!isNaN(delay)) {
            directive.rules.crawlDelay = delay;
          }
          break;
        case 'sitemap':
          directive.rules.sitemap?.push(value);
          break;
      }
    }

    return directive;
  }

  /**
   * Find applicable rules for user agent
   */
  private findApplicableRules(robots: RobotsDirective, userAgent: string): RobotsDirective['rules'] {
    // For simplicity, we'll use the general rules
    // In a more sophisticated implementation, we would parse user-agent specific rules
    return robots.rules;
  }

  /**
   * Check if path matches robots.txt pattern
   */
  private matchesPattern(path: string, pattern: string): boolean {
    if (!pattern) return false;
    
    // Convert robots.txt pattern to regex
    // * matches any sequence of characters
    // $ at the end means exact match
    
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\$$/g, '$');
    
    const regex = new RegExp('^' + regexPattern);
    return regex.test(path);
  }

  /**
   * Clean up expired cache entries
   */
  public cleanup(): void {
    const now = Date.now();
    
    // Clean robots cache
    for (const [url, expiry] of this.robotsCacheExpiry.entries()) {
      if (now > expiry) {
        this.robotsCache.delete(url);
        this.robotsCacheExpiry.delete(url);
      }
    }

    // Clean timing entries that are very old
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    for (const [identifier, timing] of this.requestTimings.entries()) {
      if (now - timing.lastRequest > maxAge) {
        this.requestTimings.delete(identifier);
      }
    }

    this.logger.debug('Rate limiter cleanup completed', {
      robotsCacheSize: this.robotsCache.size,
      timingEntriesSize: this.requestTimings.size,
    });
  }

  /**
   * Get statistics about rate limiting
   */
  public getStats(): {
    activeIdentifiers: number;
    robotsCacheSize: number;
    totalRequests: number;
  } {
    const totalRequests = Array.from(this.requestTimings.values())
      .reduce((sum, timing) => sum + timing.requestCount, 0);

    return {
      activeIdentifiers: this.requestTimings.size,
      robotsCacheSize: this.robotsCache.size,
      totalRequests,
    };
  }
}