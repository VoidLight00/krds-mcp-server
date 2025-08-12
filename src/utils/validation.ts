/**
 * Validation utilities for KRDS MCP Server
 * 
 * Provides validation functions for various input types and data structures
 * used throughout the server, including MCP tool parameters, Korean text,
 * and configuration values.
 */

import type { ValidationResult } from '../types/index.js';

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate Korean text (contains Korean characters)
 */
export function containsKorean(text: string): boolean {
  const koreanRegex = /[\u1100-\u11FF\u3130-\u318F\u3200-\u32FF\uA960-\uA97F\uAC00-\uD7AF\uD7B0-\uD7FF]/;
  return koreanRegex.test(text);
}

/**
 * Validate search query parameters
 */
export function validateSearchParams(params: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate query
  if (!params.query || typeof params.query !== 'string') {
    errors.push('Query is required and must be a string');
  } else if (params.query.trim().length === 0) {
    errors.push('Query cannot be empty');
  } else if (params.query.length > 500) {
    errors.push('Query is too long (max 500 characters)');
  }

  // Validate maxResults
  if (params.maxResults !== undefined) {
    if (typeof params.maxResults !== 'number' || params.maxResults < 1) {
      errors.push('maxResults must be a positive number');
    } else if (params.maxResults > 1000) {
      warnings.push('maxResults is very high, consider reducing for better performance');
    }
  }

  // Validate dates
  if (params.dateFrom && !isValidDate(params.dateFrom)) {
    errors.push('dateFrom must be a valid date string');
  }

  if (params.dateTo && !isValidDate(params.dateTo)) {
    errors.push('dateTo must be a valid date string');
  }

  if (params.dateFrom && params.dateTo) {
    const fromDate = new Date(params.dateFrom);
    const toDate = new Date(params.dateTo);
    if (fromDate > toDate) {
      errors.push('dateFrom must be before dateTo');
    }
  }

  // Validate sortBy
  if (params.sortBy && !['relevance', 'date', 'title'].includes(params.sortBy)) {
    errors.push('sortBy must be one of: relevance, date, title');
  }

  // Validate sortOrder
  if (params.sortOrder && !['asc', 'desc'].includes(params.sortOrder)) {
    errors.push('sortOrder must be either "asc" or "desc"');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate content retrieval parameters
 */
export function validateContentParams(params: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Must have either url or documentId
  if (!params.url && !params.documentId) {
    errors.push('Either url or documentId is required');
  }

  // Validate URL if provided
  if (params.url && !isValidUrl(params.url)) {
    errors.push('url must be a valid URL');
  }

  // Validate documentId if provided
  if (params.documentId && typeof params.documentId !== 'string') {
    errors.push('documentId must be a string');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if string is a valid date
 */
function isValidDate(dateString: string): boolean {
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

/**
 * Sanitize string for safe usage (remove dangerous characters)
 */
export function sanitizeString(input: string): string {
  return input
    .replace(/[<>\"'&]/g, '') // Remove HTML/XML dangerous chars
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars
    .trim();
}

/**
 * Validate export parameters
 */
export function validateExportParams(params: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate format
  const validFormats = ['json', 'csv', 'xlsx', 'pdf', 'xml'];
  if (!params.format || !validFormats.includes(params.format)) {
    errors.push(`format must be one of: ${validFormats.join(', ')}`);
  }

  // Validate documents
  if (!params.documents || !Array.isArray(params.documents)) {
    errors.push('documents must be an array');
  } else if (params.documents.length === 0) {
    errors.push('documents array cannot be empty');
  } else if (params.documents.length > 1000) {
    warnings.push('Large number of documents may affect performance');
  }

  // Validate filename if provided
  if (params.filename && typeof params.filename !== 'string') {
    errors.push('filename must be a string');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate Korean text processing parameters
 */
export function validateKoreanTextParams(params: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate text
  if (!params.text || typeof params.text !== 'string') {
    errors.push('text is required and must be a string');
  } else if (params.text.trim().length === 0) {
    errors.push('text cannot be empty');
  } else if (params.text.length > 10000) {
    warnings.push('Very long text may affect processing performance');
  }

  // Check if text contains Korean
  if (params.text && !containsKorean(params.text)) {
    warnings.push('Text does not appear to contain Korean characters');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}