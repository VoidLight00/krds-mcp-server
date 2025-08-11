/**
 * E2E Test Setup
 * 
 * Sets up environment and configuration for end-to-end tests.
 * Includes server startup, environment variables, and cleanup.
 * 
 * @author KRDS MCP Server
 * @version 1.0.0
 */

import { config } from 'dotenv';

// Load test environment variables
config({ path: '.env.test' });

// Set E2E test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'warn'; // Reduce log noise but show warnings
process.env.PUPPETEER_HEADLESS = 'true';
process.env.PUPPETEER_SLOWMO = '0';
process.env.CACHE_TYPE = 'memory'; // Use memory cache for E2E tests
process.env.CACHE_TTL = '300'; // Short TTL for testing

// Test configuration overrides
process.env.KRDS_TIMEOUT = '10000'; // 10 second timeout for tests
process.env.KRDS_RETRY_ATTEMPTS = '2'; // Fewer retries for faster tests
process.env.KRDS_RATE_LIMIT_ENABLED = 'false'; // Disable rate limiting in tests

// Mock external services if needed
if (process.env.MOCK_KRDS_SERVICES === 'true') {
  process.env.KRDS_BASE_URL = 'http://localhost:3001'; // Mock KRDS server
}

// Memory and performance settings
process.env.NODE_OPTIONS = '--max-old-space-size=2048'; // 2GB memory limit

console.log('E2E test environment configured:', {
  NODE_ENV: process.env.NODE_ENV,
  LOG_LEVEL: process.env.LOG_LEVEL,
  CACHE_TYPE: process.env.CACHE_TYPE,
  MOCK_SERVICES: process.env.MOCK_KRDS_SERVICES || 'false',
});