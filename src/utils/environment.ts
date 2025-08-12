/**
 * Environment validation utilities
 */

import { logger } from './logger.js';

/**
 * Required environment variables
 */
const REQUIRED_ENV_VARS = [
  'NODE_ENV',
] as const;

/**
 * Optional environment variables with defaults
 */
const OPTIONAL_ENV_VARS = {
  PORT: '3000',
  LOG_LEVEL: 'info',
  CACHE_TYPE: 'memory',
  CACHE_TTL: '3600000', // 1 hour in milliseconds
  RATE_LIMIT_MAX: '100',
  RATE_LIMIT_WINDOW_MS: '60000', // 1 minute in milliseconds
  PUPPETEER_HEADLESS: 'true',
  PUPPETEER_TIMEOUT: '30000',
  USER_AGENT_ROTATION: 'true',
  REQUEST_DELAY_MIN: '1000',
  REQUEST_DELAY_MAX: '3000',
} as const;

export interface EnvironmentConfig {
  NODE_ENV: string;
  PORT: number;
  LOG_LEVEL: string;
  CACHE_TYPE: string;
  CACHE_TTL: number;
  RATE_LIMIT_MAX: number;
  RATE_LIMIT_WINDOW_MS: number;
  PUPPETEER_HEADLESS: boolean;
  PUPPETEER_TIMEOUT: number;
  USER_AGENT_ROTATION: boolean;
  REQUEST_DELAY_MIN: number;
  REQUEST_DELAY_MAX: number;
}

/**
 * Validate that all required environment variables are set
 */
export async function validateEnvironment(): Promise<EnvironmentConfig> {
  const errors: string[] = [];
  
  // Check required variables
  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName]) {
      errors.push(`Missing required environment variable: ${varName}`);
    }
  }
  
  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n${errors.join('\n')}`);
  }
  
  // Build config with defaults
  const config: EnvironmentConfig = {
    NODE_ENV: process.env.NODE_ENV!,
    PORT: parseInt(process.env.PORT || OPTIONAL_ENV_VARS.PORT, 10),
    LOG_LEVEL: process.env.LOG_LEVEL || OPTIONAL_ENV_VARS.LOG_LEVEL,
    CACHE_TYPE: process.env.CACHE_TYPE || OPTIONAL_ENV_VARS.CACHE_TYPE,
    CACHE_TTL: parseInt(process.env.CACHE_TTL || OPTIONAL_ENV_VARS.CACHE_TTL, 10),
    RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || OPTIONAL_ENV_VARS.RATE_LIMIT_MAX, 10),
    RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || OPTIONAL_ENV_VARS.RATE_LIMIT_WINDOW_MS, 10),
    PUPPETEER_HEADLESS: process.env.PUPPETEER_HEADLESS === 'true' || OPTIONAL_ENV_VARS.PUPPETEER_HEADLESS === 'true',
    PUPPETEER_TIMEOUT: parseInt(process.env.PUPPETEER_TIMEOUT || OPTIONAL_ENV_VARS.PUPPETEER_TIMEOUT, 10),
    USER_AGENT_ROTATION: process.env.USER_AGENT_ROTATION === 'true' || OPTIONAL_ENV_VARS.USER_AGENT_ROTATION === 'true',
    REQUEST_DELAY_MIN: parseInt(process.env.REQUEST_DELAY_MIN || OPTIONAL_ENV_VARS.REQUEST_DELAY_MIN, 10),
    REQUEST_DELAY_MAX: parseInt(process.env.REQUEST_DELAY_MAX || OPTIONAL_ENV_VARS.REQUEST_DELAY_MAX, 10),
  };
  
  // Validate numeric values
  if (config.PORT <= 0 || config.PORT > 65535) {
    errors.push(`PORT must be between 1 and 65535, got: ${config.PORT}`);
  }
  
  if (config.CACHE_TTL < 0) {
    errors.push(`CACHE_TTL must be non-negative, got: ${config.CACHE_TTL}`);
  }
  
  if (config.RATE_LIMIT_MAX <= 0) {
    errors.push(`RATE_LIMIT_MAX must be positive, got: ${config.RATE_LIMIT_MAX}`);
  }
  
  if (config.RATE_LIMIT_WINDOW_MS <= 0) {
    errors.push(`RATE_LIMIT_WINDOW_MS must be positive, got: ${config.RATE_LIMIT_WINDOW_MS}`);
  }
  
  if (config.REQUEST_DELAY_MIN < 0) {
    errors.push(`REQUEST_DELAY_MIN must be non-negative, got: ${config.REQUEST_DELAY_MIN}`);
  }
  
  if (config.REQUEST_DELAY_MAX < config.REQUEST_DELAY_MIN) {
    errors.push(`REQUEST_DELAY_MAX (${config.REQUEST_DELAY_MAX}) must be >= REQUEST_DELAY_MIN (${config.REQUEST_DELAY_MIN})`);
  }
  
  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n${errors.join('\n')}`);
  }
  
  logger.info('Environment validation completed successfully', {
    NODE_ENV: config.NODE_ENV,
    PORT: config.PORT,
    CACHE_TYPE: config.CACHE_TYPE,
  });
  
  return config;
}

/**
 * Check if running in production environment
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Check if running in development environment
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * Check if running in test environment
 */
export function isTest(): boolean {
  return process.env.NODE_ENV === 'test';
}