/**
 * Logging Utility
 * 
 * Configures and provides Winston logger instance with structured logging
 * support for the KRDS MCP server. Includes file rotation, console output,
 * and structured JSON logging for production environments.
 * 
 * @author Your Name
 * @version 1.0.0
 */

import winston from 'winston';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import type { LoggingConfig } from '@/types/index.js';

/**
 * Setup and configure Winston logger
 * 
 * @param config Logging configuration
 * @returns Winston logger instance
 */
export function setupLogger(config: LoggingConfig): winston.Logger {
  const transports: winston.transport[] = [];
  
  // Console transport
  if (config.consoleEnabled) {
    transports.push(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
            return `${timestamp} [${level}]: ${message}${metaStr}`;
          })
        ),
      })
    );
  }
  
  // File transport
  if (config.fileEnabled && config.filePath) {
    // Ensure log directory exists
    const logDir = join(config.filePath, '..');
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
    
    transports.push(
      new winston.transports.File({
        filename: config.filePath,
        maxsize: parseSize(config.maxSize || '10m'),
        maxFiles: config.maxFiles || 5,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json()
        ),
      })
    );
  }
  
  return winston.createLogger({
    level: config.level,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] })
    ),
    transports,
    defaultMeta: {
      service: 'krds-mcp-server',
      version: process.env.npm_package_version || '1.0.0',
    },
  });
}

/**
 * Parse size string to bytes
 */
function parseSize(size: string): number {
  const units: Record<string, number> = {
    b: 1,
    k: 1024,
    m: 1024 * 1024,
    g: 1024 * 1024 * 1024,
  };
  
  const match = size.toLowerCase().match(/^(\d+)([bkmg])?$/);
  if (!match) return 10 * 1024 * 1024; // Default 10MB
  
  const [, num, unit] = match;
  return parseInt(num, 10) * (units[unit || 'b'] || 1);
}