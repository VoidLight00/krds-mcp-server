/**
 * File Cache Implementation
 * 
 * File-based cache optimized for large content, images, and attachments.
 * Provides persistent storage with efficient organization and cleanup.
 * Supports Korean filename handling and content categorization.
 * 
 * Features:
 * - Hierarchical directory organization
 * - Content-based file naming with hash collision handling
 * - Atomic write operations with temporary files
 * - Automatic cleanup of expired entries
 * - Korean filename sanitization
 * - Image and document optimization
 * - Metadata storage for cache entries
 * - Disk usage monitoring and limits
 * - Background cleanup and compression
 * 
 * @author KRDS MCP Server
 * @version 1.0.0
 */

import { promises as fs, constants as fsConstants, createReadStream, createWriteStream } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { createHash } from 'crypto';
import { promisify } from 'util';
import { pipeline } from 'stream';
import { gzip, gunzip } from 'zlib';
import type { Logger } from 'winston';
import type { CacheEntry, CacheStats } from '@/types/index.js';
import type { CacheBackend } from './cache-manager.js';
import { EventEmitter } from 'events';

const pipelineAsync = promisify(pipeline);
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export interface FileCacheOptions {
  ttl: number;
  logger: Logger;
  baseDir?: string;
  maxSizeMB?: number; // Maximum cache size in MB
  cleanupInterval?: number; // Cleanup interval in milliseconds
  enableCompression?: boolean;
  compressionThreshold?: number; // Compress files larger than this (bytes)
  directoryDepth?: number; // Hash-based directory depth
  maxFileSize?: number; // Maximum individual file size
  enableMetadata?: boolean; // Store metadata for entries
}

export interface FileCacheEntry extends CacheEntry {
  filePath: string;
  originalSize: number;
  compressedSize?: number;
  compressed: boolean;
  contentType?: string;
  checksum: string;
}

export interface FileCacheMetadata {
  version: string;
  entries: Record<string, FileCacheEntry>;
  totalSize: number;
  lastCleanup: number;
  created: number;
}

/**
 * File-based cache for large content and persistent storage
 */
export class FileCache extends EventEmitter implements CacheBackend {
  readonly name = 'file';
  
  private options: Required<FileCacheOptions>;
  private logger: Logger;
  private baseDir: string;
  private metadataFile: string;
  private metadata: FileCacheMetadata;
  
  // Cleanup and monitoring
  private cleanupTimer?: NodeJS.Timeout;
  private diskUsageTimer?: NodeJS.Timeout;
  
  // Statistics
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    cleanups: 0,
    compressions: 0,
    decompressions: 0,
    diskReads: 0,
    diskWrites: 0,
    operations: 0,
  };
  
  // Korean text handling
  private static readonly KOREAN_SAFE_CHARS = /[^\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uD7B0-\uD7FFa-zA-Z0-9\-_]/g;
  private static readonly MAX_FILENAME_LENGTH = 200;
  
  // File organization
  private static readonly CACHE_VERSION = '1.0.0';
  private static readonly METADATA_FILENAME = '.cache-metadata.json';
  private static readonly TEMP_SUFFIX = '.tmp';
  private static readonly COMPRESSED_SUFFIX = '.gz';
  
  constructor(options: FileCacheOptions) {
    super();
    
    this.options = {
      ttl: options.ttl,
      logger: options.logger,
      baseDir: options.baseDir || join(process.cwd(), '.cache'),
      maxSizeMB: options.maxSizeMB || 500,
      cleanupInterval: options.cleanupInterval || 300000, // 5 minutes
      enableCompression: options.enableCompression ?? true,
      compressionThreshold: options.compressionThreshold || 10240, // 10KB
      directoryDepth: options.directoryDepth || 2,
      maxFileSize: options.maxFileSize || 100 * 1024 * 1024, // 100MB
      enableMetadata: options.enableMetadata ?? true,
    };
    
    this.logger = options.logger;
    this.baseDir = this.options.baseDir;
    this.metadataFile = join(this.baseDir, FileCache.METADATA_FILENAME);
    
    // Initialize metadata
    this.metadata = {
      version: FileCache.CACHE_VERSION,
      entries: {},
      totalSize: 0,
      lastCleanup: Date.now(),
      created: Date.now(),
    };
    
    this.logger.info('File cache initializing', {
      baseDir: this.baseDir,
      maxSizeMB: this.options.maxSizeMB,
      compression: this.options.enableCompression,
    });
  }

  /**
   * Initialize file cache
   */
  async initialize(): Promise<void> {
    try {
      await this.ensureDirectory(this.baseDir);
      await this.loadMetadata();
      await this.validateCache();
      
      this.startBackgroundTasks();
      
      this.logger.info('File cache initialized', {
        entries: Object.keys(this.metadata.entries).length,
        totalSizeMB: (this.metadata.totalSize / (1024 * 1024)).toFixed(2),
      });
      
    } catch (error) {
      this.logger.error('Failed to initialize file cache', { error });
      throw error;
    }
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    const entry = this.metadata.entries[key];
    
    if (!entry) {
      this.recordMiss();
      return null;
    }
    
    // Check TTL
    if (this.isExpired(entry)) {
      await this.delete(key);
      this.recordMiss();
      return null;
    }
    
    try {
      const filePath = join(this.baseDir, entry.filePath);
      
      // Check if file exists
      await fs.access(filePath, fsConstants.R_OK);
      
      // Read and parse file
      const value = await this.readFile<T>(filePath, entry.compressed);
      
      // Update access tracking
      entry.accessCount++;
      entry.lastAccessed = Date.now();
      await this.saveMetadata();
      
      this.recordHit();
      this.emit('hit', key, value);
      
      return value;
      
    } catch (error) {
      this.logger.error('Failed to read cache file', {
        key,
        filePath: entry.filePath,
        error,
      });
      
      // Clean up invalid entry
      await this.delete(key);
      this.recordMiss();
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const entryTtl = ttl || this.options.ttl;
    const now = Date.now();
    
    try {
      // Remove existing entry if present
      if (this.metadata.entries[key]) {
        await this.delete(key);
      }
      
      // Check cache size limits
      await this.ensureCapacity();
      
      // Generate file path
      const filePath = this.generateFilePath(key);
      const fullPath = join(this.baseDir, filePath);
      
      // Ensure directory exists
      await this.ensureDirectory(dirname(fullPath));
      
      // Write file
      const fileInfo = await this.writeFile(fullPath, value);
      
      // Create cache entry
      const entry: FileCacheEntry = {
        key,
        value: null, // Don't store value in memory for file cache
        expiresAt: now + entryTtl,
        createdAt: now,
        accessCount: 0,
        lastAccessed: now,
        filePath,
        originalSize: fileInfo.originalSize,
        compressedSize: fileInfo.compressedSize,
        compressed: fileInfo.compressed,
        contentType: this.detectContentType(value),
        checksum: fileInfo.checksum,
      };
      
      // Update metadata
      this.metadata.entries[key] = entry;
      this.metadata.totalSize += fileInfo.compressedSize || fileInfo.originalSize;
      await this.saveMetadata();
      
      this.stats.sets++;
      this.recordOperation();
      
      this.emit('set', key, value, entryTtl);
      
      this.logger.debug('File cache entry set', {
        key,
        filePath,
        size: fileInfo.originalSize,
        compressed: fileInfo.compressed,
        ttl: entryTtl,
      });
      
    } catch (error) {
      this.logger.error('Failed to set cache entry', { key, error });
      throw error;
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<boolean> {
    const entry = this.metadata.entries[key];
    
    if (!entry) {
      return false;
    }
    
    try {
      // Delete file
      const fullPath = join(this.baseDir, entry.filePath);
      
      try {
        await fs.unlink(fullPath);
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          this.logger.warn('Failed to delete cache file', {
            key,
            filePath: entry.filePath,
            error,
          });
        }
      }
      
      // Update metadata
      this.metadata.totalSize -= entry.compressedSize || entry.originalSize;
      delete this.metadata.entries[key];
      await this.saveMetadata();
      
      this.stats.deletes++;
      this.recordOperation();
      
      this.emit('delete', key);
      
      this.logger.debug('Cache entry deleted', { key, filePath: entry.filePath });
      
      return true;
      
    } catch (error) {
      this.logger.error('Failed to delete cache entry', { key, error });
      return false;
    }
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    try {
      const entryCount = Object.keys(this.metadata.entries).length;
      
      // Delete all files
      for (const [key, entry] of Object.entries(this.metadata.entries)) {
        const fullPath = join(this.baseDir, entry.filePath);
        
        try {
          await fs.unlink(fullPath);
        } catch (error: any) {
          if (error.code !== 'ENOENT') {
            this.logger.warn('Failed to delete file during clear', {
              key,
              filePath: entry.filePath,
              error,
            });
          }
        }
      }
      
      // Reset metadata
      this.metadata.entries = {};
      this.metadata.totalSize = 0;
      await this.saveMetadata();
      
      this.recordOperation();
      this.emit('clear', entryCount);
      
      this.logger.info('File cache cleared', { entriesDeleted: entryCount });
      
    } catch (error) {
      this.logger.error('Failed to clear cache', { error });
      throw error;
    }
  }

  /**
   * Check if key exists
   */
  async has(key: string): Promise<boolean> {
    const entry = this.metadata.entries[key];
    
    if (!entry) {
      return false;
    }
    
    // Check TTL
    if (this.isExpired(entry)) {
      await this.delete(key);
      return false;
    }
    
    // Check if file exists
    try {
      const fullPath = join(this.baseDir, entry.filePath);
      await fs.access(fullPath, fsConstants.R_OK);
      return true;
    } catch {
      // File doesn't exist, clean up metadata
      await this.delete(key);
      return false;
    }
  }

  /**
   * Get all keys matching pattern
   */
  async keys(pattern?: string): Promise<string[]> {
    const allKeys = Object.keys(this.metadata.entries);
    
    if (!pattern) {
      return allKeys;
    }
    
    // Simple glob pattern matching
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    
    const regex = new RegExp(`^${regexPattern}$`);
    
    return allKeys.filter(key => regex.test(key));
  }

  /**
   * Get cache size
   */
  async size(): Promise<number> {
    return Object.keys(this.metadata.entries).length;
  }

  /**
   * Get cache statistics
   */
  async stats(): Promise<CacheStats> {
    const entries = Object.values(this.metadata.entries);
    const now = Date.now();
    
    let oldestEntry = now;
    let newestEntry = 0;
    
    for (const entry of entries) {
      oldestEntry = Math.min(oldestEntry, entry.createdAt);
      newestEntry = Math.max(newestEntry, entry.createdAt);
    }
    
    return {
      totalKeys: entries.length,
      hitCount: this.stats.hits,
      missCount: this.stats.misses,
      hitRate: this.calculateHitRate(),
      memoryUsage: this.metadata.totalSize,
      oldestEntry: entries.length > 0 ? oldestEntry : now,
      newestEntry: entries.length > 0 ? newestEntry : now,
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Test directory access
      await fs.access(this.baseDir, fsConstants.R_OK | fsConstants.W_OK);
      
      // Test file operations
      const testKey = '_health_check_';
      const testValue = { test: true, timestamp: Date.now() };
      
      await this.set(testKey, testValue, 5000);
      const retrieved = await this.get(testKey);
      await this.delete(testKey);
      
      return retrieved !== null && (retrieved as any).test === true;
      
    } catch (error) {
      this.logger.error('File cache health check failed', { error });
      return false;
    }
  }

  /**
   * Force cleanup of expired entries
   */
  async cleanup(): Promise<number> {
    const before = Object.keys(this.metadata.entries).length;
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    // Find expired entries
    for (const [key, entry] of Object.entries(this.metadata.entries)) {
      if (entry.expiresAt <= now) {
        expiredKeys.push(key);
      }
    }
    
    // Delete expired entries
    for (const key of expiredKeys) {
      await this.delete(key);
    }
    
    const cleaned = before - Object.keys(this.metadata.entries).length;
    
    this.metadata.lastCleanup = now;
    await this.saveMetadata();
    
    if (cleaned > 0) {
      this.stats.cleanups++;
      this.emit('cleanup', cleaned);
      this.logger.debug('Cache cleanup completed', {
        cleaned,
        remaining: Object.keys(this.metadata.entries).length,
      });
    }
    
    return cleaned;
  }

  /**
   * Get detailed cache information
   */
  getDetailedInfo(): {
    entries: number;
    totalSizeMB: number;
    averageFileSizeKB: number;
    compressionRatio: number;
    hitRate: number;
    oldestFile: string | null;
    newestFile: string | null;
  } {
    const entries = Object.values(this.metadata.entries);
    
    let totalOriginalSize = 0;
    let totalCompressedSize = 0;
    let oldestFile: FileCacheEntry | null = null;
    let newestFile: FileCacheEntry | null = null;
    
    for (const entry of entries) {
      totalOriginalSize += entry.originalSize;
      totalCompressedSize += entry.compressedSize || entry.originalSize;
      
      if (!oldestFile || entry.createdAt < oldestFile.createdAt) {
        oldestFile = entry;
      }
      
      if (!newestFile || entry.createdAt > newestFile.createdAt) {
        newestFile = entry;
      }
    }
    
    return {
      entries: entries.length,
      totalSizeMB: totalCompressedSize / (1024 * 1024),
      averageFileSizeKB: entries.length > 0 ? (totalCompressedSize / entries.length) / 1024 : 0,
      compressionRatio: totalOriginalSize > 0 ? totalOriginalSize / totalCompressedSize : 1,
      hitRate: this.calculateHitRate(),
      oldestFile: oldestFile?.key || null,
      newestFile: newestFile?.key || null,
    };
  }

  /**
   * Close file cache
   */
  async close(): Promise<void> {
    this.stopBackgroundTasks();
    await this.saveMetadata();
    this.removeAllListeners();
    
    this.logger.info('File cache closed');
  }

  /**
   * Private methods
   */

  private async loadMetadata(): Promise<void> {
    try {
      const data = await fs.readFile(this.metadataFile, 'utf8');
      const parsed = JSON.parse(data) as FileCacheMetadata;
      
      // Validate metadata version
      if (parsed.version !== FileCache.CACHE_VERSION) {
        this.logger.warn('Cache metadata version mismatch, rebuilding cache', {
          found: parsed.version,
          expected: FileCache.CACHE_VERSION,
        });
        await this.rebuildMetadata();
        return;
      }
      
      this.metadata = parsed;
      
      this.logger.debug('Cache metadata loaded', {
        entries: Object.keys(this.metadata.entries).length,
        totalSize: this.metadata.totalSize,
      });
      
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.logger.info('No existing cache metadata, starting fresh');
        await this.saveMetadata();
      } else {
        this.logger.error('Failed to load cache metadata', { error });
        await this.rebuildMetadata();
      }
    }
  }

  private async saveMetadata(): Promise<void> {
    try {
      const tempFile = `${this.metadataFile}${FileCache.TEMP_SUFFIX}`;
      const data = JSON.stringify(this.metadata, null, 2);
      
      await fs.writeFile(tempFile, data, 'utf8');
      await fs.rename(tempFile, this.metadataFile);
      
    } catch (error) {
      this.logger.error('Failed to save cache metadata', { error });
    }
  }

  private async rebuildMetadata(): Promise<void> {
    this.logger.info('Rebuilding cache metadata');
    
    this.metadata = {
      version: FileCache.CACHE_VERSION,
      entries: {},
      totalSize: 0,
      lastCleanup: Date.now(),
      created: Date.now(),
    };
    
    await this.saveMetadata();
  }

  private async validateCache(): Promise<void> {
    let invalidEntries = 0;
    const keysToDelete: string[] = [];
    
    for (const [key, entry] of Object.entries(this.metadata.entries)) {
      const fullPath = join(this.baseDir, entry.filePath);
      
      try {
        const stats = await fs.stat(fullPath);
        
        // Verify file size matches metadata
        const expectedSize = entry.compressedSize || entry.originalSize;
        if (Math.abs(stats.size - expectedSize) > 100) { // Allow small variance
          keysToDelete.push(key);
          invalidEntries++;
        }
        
      } catch {
        // File doesn't exist
        keysToDelete.push(key);
        invalidEntries++;
      }
    }
    
    // Clean up invalid entries
    for (const key of keysToDelete) {
      delete this.metadata.entries[key];
    }
    
    if (invalidEntries > 0) {
      await this.saveMetadata();
      this.logger.info('Cache validation completed', {
        invalidEntries,
        remainingEntries: Object.keys(this.metadata.entries).length,
      });
    }
  }

  private generateFilePath(key: string): string {
    // Create hash for consistent file naming
    const hash = createHash('sha256').update(key).digest('hex');
    
    // Create directory structure based on hash
    const dirs: string[] = [];
    for (let i = 0; i < this.options.directoryDepth; i++) {
      dirs.push(hash.substring(i * 2, (i * 2) + 2));
    }
    
    // Sanitize key for filename
    const sanitized = this.sanitizeFilename(key);
    const filename = `${sanitized}_${hash.substring(0, 8)}`;
    
    return join(...dirs, filename);
  }

  private sanitizeFilename(filename: string): string {
    // Replace problematic characters
    let sanitized = filename
      .replace(FileCache.KOREAN_SAFE_CHARS, '_')
      .replace(/[/\\:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .trim();
    
    // Limit length
    if (sanitized.length > FileCache.MAX_FILENAME_LENGTH) {
      const hash = createHash('md5').update(sanitized).digest('hex');
      sanitized = sanitized.substring(0, FileCache.MAX_FILENAME_LENGTH - 33) + '_' + hash;
    }
    
    return sanitized || 'cache_entry';
  }

  private async writeFile<T>(filePath: string, value: T): Promise<{
    originalSize: number;
    compressedSize?: number;
    compressed: boolean;
    checksum: string;
  }> {
    const tempPath = `${filePath}${FileCache.TEMP_SUFFIX}`;
    
    try {
      // Serialize value
      const serialized = JSON.stringify(value);
      const originalBuffer = Buffer.from(serialized, 'utf8');
      const originalSize = originalBuffer.length;
      
      // Check size limit
      if (originalSize > this.options.maxFileSize) {
        throw new Error(`File size ${originalSize} exceeds maximum ${this.options.maxFileSize}`);
      }
      
      // Calculate checksum
      const checksum = createHash('sha256').update(originalBuffer).digest('hex');
      
      let finalBuffer = originalBuffer;
      let compressed = false;
      
      // Compress if enabled and above threshold
      if (this.options.enableCompression && originalSize > this.options.compressionThreshold) {
        try {
          finalBuffer = await gzipAsync(originalBuffer);
          compressed = true;
          this.stats.compressions++;
        } catch (error) {
          this.logger.warn('Compression failed, using uncompressed', { error });
        }
      }
      
      // Write to temporary file first
      await fs.writeFile(tempPath, finalBuffer);
      
      // Atomic rename
      await fs.rename(tempPath, compressed ? `${filePath}${FileCache.COMPRESSED_SUFFIX}` : filePath);
      
      this.stats.diskWrites++;
      
      return {
        originalSize,
        compressedSize: compressed ? finalBuffer.length : undefined,
        compressed,
        checksum,
      };
      
    } catch (error) {
      // Clean up temp file if it exists
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      
      throw error;
    }
  }

  private async readFile<T>(filePath: string, compressed: boolean): Promise<T> {
    try {
      const actualPath = compressed ? `${filePath}${FileCache.COMPRESSED_SUFFIX}` : filePath;
      let buffer = await fs.readFile(actualPath);
      
      this.stats.diskReads++;
      
      // Decompress if needed
      if (compressed) {
        buffer = await gunzipAsync(buffer);
        this.stats.decompressions++;
      }
      
      // Parse JSON
      const serialized = buffer.toString('utf8');
      return JSON.parse(serialized) as T;
      
    } catch (error) {
      this.logger.error('Failed to read cache file', { filePath, compressed, error });
      throw error;
    }
  }

  private detectContentType(value: any): string {
    if (typeof value === 'string') {
      return 'text/plain';
    }
    
    if (Buffer.isBuffer(value)) {
      return 'application/octet-stream';
    }
    
    if (Array.isArray(value)) {
      return 'application/json-array';
    }
    
    if (typeof value === 'object' && value !== null) {
      // Check for common data types
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

  private async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error: any) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  private async ensureCapacity(): Promise<void> {
    const maxSizeBytes = this.options.maxSizeMB * 1024 * 1024;
    
    while (this.metadata.totalSize > maxSizeBytes) {
      // Find least recently used entry
      let lruKey: string | null = null;
      let lruAccessTime = Date.now();
      
      for (const [key, entry] of Object.entries(this.metadata.entries)) {
        if (entry.lastAccessed < lruAccessTime) {
          lruAccessTime = entry.lastAccessed;
          lruKey = key;
        }
      }
      
      if (!lruKey) {
        break; // No entries to evict
      }
      
      await this.delete(lruKey);
      this.emit('eviction', lruKey);
      
      this.logger.debug('Cache eviction due to size limit', {
        evictedKey: lruKey,
        totalSizeMB: (this.metadata.totalSize / (1024 * 1024)).toFixed(2),
      });
    }
  }

  private isExpired(entry: FileCacheEntry): boolean {
    return entry.expiresAt <= Date.now();
  }

  private startBackgroundTasks(): void {
    // Start cleanup timer
    this.cleanupTimer = setInterval(async () => {
      try {
        await this.cleanup();
      } catch (error) {
        this.logger.error('Background cleanup error', { error });
      }
    }, this.options.cleanupInterval);
    
    // Start disk usage monitoring
    this.diskUsageTimer = setInterval(async () => {
      try {
        await this.monitorDiskUsage();
      } catch (error) {
        this.logger.error('Disk usage monitoring error', { error });
      }
    }, this.options.cleanupInterval * 2); // Less frequent than cleanup
  }

  private stopBackgroundTasks(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    
    if (this.diskUsageTimer) {
      clearInterval(this.diskUsageTimer);
      this.diskUsageTimer = undefined;
    }
  }

  private async monitorDiskUsage(): Promise<void> {
    try {
      // Calculate actual disk usage
      let actualSize = 0;
      const entryKeys = Object.keys(this.metadata.entries);
      
      for (const key of entryKeys) {
        const entry = this.metadata.entries[key];
        const fullPath = join(this.baseDir, entry.filePath);
        
        try {
          const stats = await fs.stat(
            entry.compressed ? `${fullPath}${FileCache.COMPRESSED_SUFFIX}` : fullPath
          );
          actualSize += stats.size;
        } catch {
          // File missing, will be cleaned up during validation
        }
      }
      
      // Update metadata if there's a significant discrepancy
      if (Math.abs(actualSize - this.metadata.totalSize) > 1024 * 1024) { // 1MB difference
        this.logger.info('Disk usage discrepancy detected, updating metadata', {
          metadataSize: this.metadata.totalSize,
          actualSize,
        });
        
        this.metadata.totalSize = actualSize;
        await this.saveMetadata();
      }
      
      // Emit usage statistics
      this.emit('disk-usage', {
        totalSizeMB: (actualSize / (1024 * 1024)).toFixed(2),
        entryCount: entryKeys.length,
        averageSizeKB: entryKeys.length > 0 ? (actualSize / entryKeys.length) / 1024 : 0,
      });
      
    } catch (error) {
      this.logger.error('Disk usage calculation failed', { error });
    }
  }

  // Statistics methods
  private recordHit(): void {
    this.stats.hits++;
    this.recordOperation();
  }

  private recordMiss(): void {
    this.stats.misses++;
    this.recordOperation();
  }

  private recordOperation(): void {
    this.stats.operations++;
    
    // Emit periodic stats
    if (this.stats.operations % 100 === 0) {
      this.emit('stats', {
        operations: this.stats.operations,
        hitRate: this.calculateHitRate(),
        diskReads: this.stats.diskReads,
        diskWrites: this.stats.diskWrites,
        compressions: this.stats.compressions,
        decompressions: this.stats.decompressions,
      });
    }
  }

  private calculateHitRate(): number {
    const total = this.stats.hits + this.stats.misses;
    return total > 0 ? this.stats.hits / total : 0;
  }
}