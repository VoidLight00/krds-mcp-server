/**
 * Configuration Management Utility
 * 
 * This module handles loading, validating, and managing configuration
 * for the KRDS MCP server. It supports multiple configuration sources
 * including environment variables, configuration files, and defaults.
 * 
 * @author Your Name
 * @version 1.0.0
 */

import { config as dotenvConfig } from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { ServerConfig, ValidationResult } from '@/types/index.js';

// Load environment variables
dotenvConfig();

/**
 * Load and validate server configuration
 * 
 * @returns Promise<ServerConfig> Validated configuration object
 * @throws Error if configuration is invalid
 */
export async function loadConfig(): Promise<ServerConfig> {
  const config: ServerConfig = {
    server: {
      name: process.env.SERVER_NAME || 'krds-mcp-server',
      version: getPackageVersion(),
      port: parseInt(process.env.PORT || '3000', 10),
      environment: (process.env.NODE_ENV as any) || 'development',
    },
    
    krds: {
      baseUrl: process.env.KRDS_BASE_URL || 'https://v04.krds.go.kr',
      timeout: parseInt(process.env.KRDS_TIMEOUT || '30000', 10),
      retryAttempts: parseInt(process.env.KRDS_RETRY_ATTEMPTS || '3', 10),
      retryDelay: parseInt(process.env.KRDS_RETRY_DELAY || '1000', 10),
      userAgent: process.env.PUPPETEER_USER_AGENT || 'Mozilla/5.0 (compatible; KRDS-MCP-Server/1.0)',
      rateLimiting: {
        enabled: process.env.RATE_LIMIT_ENABLED === 'true',
        requestsPerMinute: parseInt(process.env.RATE_LIMIT_REQUESTS_PER_MINUTE || '30', 10),
        concurrentRequests: parseInt(process.env.RATE_LIMIT_CONCURRENT || '3', 10),
      },
    },
    
    scraping: {
      puppeteer: {
        headless: process.env.PUPPETEER_HEADLESS !== 'false',
        slowMo: parseInt(process.env.PUPPETEER_SLOWMO || '0', 10),
        timeout: parseInt(process.env.PUPPETEER_TIMEOUT || '30000', 10),
        viewport: {
          width: parseInt(process.env.PUPPETEER_VIEWPORT_WIDTH || '1920', 10),
          height: parseInt(process.env.PUPPETEER_VIEWPORT_HEIGHT || '1080', 10),
        },
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
      },
      retry: {
        maxAttempts: parseInt(process.env.SCRAPING_MAX_ATTEMPTS || '3', 10),
        delayMs: parseInt(process.env.SCRAPING_RETRY_DELAY || '1000', 10),
        backoffMultiplier: parseFloat(process.env.SCRAPING_BACKOFF_MULTIPLIER || '2', 10),
      },
    },
    
    cache: {
      type: (process.env.CACHE_TYPE as any) || 'memory',
      ttl: parseInt(process.env.CACHE_TTL || '3600', 10),
      maxSize: parseInt(process.env.CACHE_MAX_SIZE || '100', 10),
      redis: process.env.CACHE_TYPE === 'redis' ? {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0', 10),
      } : undefined,
    },
    
    korean: {
      enabled: process.env.KOREAN_PROCESSING_ENABLED !== 'false',
      features: {
        stemming: process.env.KOREAN_STEMMING_ENABLED !== 'false',
        romanization: process.env.KOREAN_ROMANIZATION_ENABLED !== 'false',
        hangulProcessing: process.env.KOREAN_HANGUL_PROCESSING_ENABLED !== 'false',
        keywordExtraction: process.env.KOREAN_KEYWORD_EXTRACTION_ENABLED !== 'false',
      },
    },
    
    logging: {
      level: (process.env.LOG_LEVEL as any) || 'info',
      fileEnabled: process.env.LOG_FILE_ENABLED !== 'false',
      consoleEnabled: process.env.LOG_CONSOLE_ENABLED !== 'false',
      filePath: process.env.LOG_FILE_PATH || './logs/krds-mcp-server.log',
      maxSize: process.env.LOG_MAX_SIZE || '10m',
      maxFiles: parseInt(process.env.LOG_MAX_FILES || '5', 10),
    },
    
    security: {
      cors: {
        enabled: process.env.CORS_ENABLED !== 'false',
        origin: process.env.CORS_ORIGIN || '*',
      },
      rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
      },
      helmet: {
        enabled: process.env.HELMET_ENABLED !== 'false',
      },
    },
    
    export: {
      maxFileSizeMB: parseInt(process.env.EXPORT_MAX_FILE_SIZE_MB || '50', 10),
      allowedFormats: (process.env.EXPORT_ALLOWED_FORMATS?.split(',') as any) || ['json', 'csv', 'xlsx', 'pdf'],
      defaultFormat: (process.env.EXPORT_DEFAULT_FORMAT as any) || 'json',
    },
  };
  
  // Validate configuration
  const validation = validateConfig(config);
  if (!validation.valid) {
    throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
  }
  
  return config;
}

/**
 * Validate configuration object
 */
function validateConfig(config: ServerConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Server validation
  if (config.server.port < 1 || config.server.port > 65535) {
    errors.push('Server port must be between 1 and 65535');
  }
  
  // KRDS validation
  if (!config.krds.baseUrl.startsWith('http')) {
    errors.push('KRDS base URL must start with http or https');
  }
  
  if (config.krds.timeout < 1000) {
    warnings.push('KRDS timeout is very low, consider increasing it');
  }
  
  // Cache validation
  if (config.cache.type === 'redis' && !config.cache.redis) {
    errors.push('Redis configuration required when cache type is redis');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Get package version from package.json
 */
function getPackageVersion(): string {
  try {
    const packagePath = join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
    return packageJson.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}