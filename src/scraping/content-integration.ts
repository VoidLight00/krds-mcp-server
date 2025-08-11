/**
 * Content Parsing Integration for KRDS Scraper
 * 
 * This module provides integration between the existing KRDS scraper and the new
 * content parsing modules. It replaces the basic content extraction with comprehensive
 * parsing that includes tables, images, metadata, and Korean text processing.
 * 
 * @author KRDS MCP Server
 * @version 1.0.0
 */

import type { Page } from 'puppeteer';
import type { Logger } from 'winston';
import * as cheerio from 'cheerio';
import { 
  ContentParser, 
  type ParsedContent,
  KRDS_PARSING_CONFIG 
} from '../parsing/index.js';
import type { KrdsDocument, KrdsMetadata, KrdsImage, KrdsAttachment } from '../types/index.js';

/**
 * Enhanced content extraction options
 */
export interface EnhancedExtractionOptions {
  /** Use new parsing modules */
  useEnhancedParsing: boolean;
  /** Include table parsing */
  includeTables: boolean;
  /** Include image extraction */
  includeImages: boolean;
  /** Include metadata extraction */
  includeMetadata: boolean;
  /** Process Korean text */
  processKoreanText: boolean;
  /** Include attachments */
  includeAttachments: boolean;
  /** Maximum content length (0 = no limit) */
  maxContentLength: number;
}

/**
 * Default enhanced extraction options
 */
export const DEFAULT_ENHANCED_OPTIONS: EnhancedExtractionOptions = {
  useEnhancedParsing: true,
  includeTables: true,
  includeImages: true,
  includeMetadata: true,
  processKoreanText: true,
  includeAttachments: true,
  maxContentLength: 0,
};

/**
 * Enhanced content extractor that integrates parsing modules
 */
export class ContentIntegrator {
  private contentParser: ContentParser;

  constructor(private logger: Logger) {
    this.contentParser = new ContentParser(logger);
  }

  /**
   * Extract content using enhanced parsing modules
   */
  public async extractEnhancedContent(
    page: Page,
    url: string,
    options: Partial<EnhancedExtractionOptions> = {}
  ): Promise<KrdsDocument> {
    const opts = { ...DEFAULT_ENHANCED_OPTIONS, ...options };

    try {
      this.logger.debug('Starting enhanced content extraction', { url, options: opts });

      // Get HTML content from page
      const html = await page.content();

      // Parse content using the new parsing modules
      const parsedContent = await this.contentParser.parseContent(html, url, {
        extractTables: opts.includeTables,
        extractImages: opts.includeImages,
        extractMetadata: opts.includeMetadata,
        processKoreanText: opts.processKoreanText,
        extractAttachments: opts.includeAttachments,
        maxContentLength: opts.maxContentLength,
        preserveHtml: false,
        includeStyles: false,
      });

      // Generate document ID
      const documentId = this.generateDocumentId(url);

      // Create KRDS document from parsed content
      const document: KrdsDocument = {
        id: documentId,
        title: parsedContent.title,
        titleKorean: parsedContent.titleKorean,
        url,
        category: this.inferCategory(parsedContent.title, url),
        subcategory: this.inferSubcategory(parsedContent.sections),
        content: parsedContent.content,
        contentKorean: parsedContent.contentKorean,
        metadata: parsedContent.metadata || this.createDefaultMetadata(),
        images: parsedContent.images || [],
        attachments: parsedContent.attachments || [],
        createdAt: new Date(),
        updatedAt: new Date(),
        scrapedAt: new Date(),
      };

      this.logger.info('Enhanced content extraction completed', {
        url,
        documentId,
        contentLength: parsedContent.content.length,
        sectionsCount: parsedContent.sections.length,
        tablesCount: parsedContent.tables?.length || 0,
        imagesCount: parsedContent.images?.length || 0,
        attachmentsCount: parsedContent.attachments?.length || 0,
        processingTimeMs: parsedContent.processingTimeMs,
      });

      return document;

    } catch (error) {
      this.logger.error('Enhanced content extraction failed', {
        url,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Fallback to basic extraction
      return this.fallbackToBasicExtraction(page, url);
    }
  }

  /**
   * Fallback to basic content extraction if enhanced parsing fails
   */
  private async fallbackToBasicExtraction(page: Page, url: string): Promise<KrdsDocument> {
    this.logger.warn('Falling back to basic content extraction', { url });

    try {
      const extractedData = await page.evaluate(() => {
        // Basic title extraction
        const titleEl = document.querySelector('h1, .title, .page-title, .content-title');
        const title = titleEl?.textContent?.trim() || 'Untitled Document';

        // Basic content extraction
        const contentEl = document.querySelector('.content, .body, .main-content, article, .article-content');
        const content = contentEl?.textContent?.trim() || '';

        // Basic metadata
        const dateEl = document.querySelector('.date, .publish-date, .reg-date');
        const authorEl = document.querySelector('.author, .writer');
        const categoryEl = document.querySelector('.category, .classification');

        return {
          title,
          content: content.length > 50000 ? content.substring(0, 50000) + '...' : content,
          date: dateEl?.textContent?.trim() || '',
          author: authorEl?.textContent?.trim() || '',
          category: categoryEl?.textContent?.trim() || '',
        };
      });

      const documentId = this.generateDocumentId(url);

      return {
        id: documentId,
        title: extractedData.title,
        titleKorean: extractedData.title,
        url,
        category: extractedData.category || this.inferCategory(extractedData.title, url),
        subcategory: undefined,
        content: extractedData.content,
        contentKorean: extractedData.content,
        metadata: this.createDefaultMetadata(),
        images: [],
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        scrapedAt: new Date(),
      };

    } catch (fallbackError) {
      this.logger.error('Basic content extraction also failed', {
        url,
        error: fallbackError instanceof Error ? fallbackError.message : 'Unknown error',
      });

      // Return minimal document structure
      return this.createMinimalDocument(url);
    }
  }

  /**
   * Create minimal document when all extraction methods fail
   */
  private createMinimalDocument(url: string): KrdsDocument {
    const documentId = this.generateDocumentId(url);

    return {
      id: documentId,
      title: 'Failed to Extract Title',
      titleKorean: '제목 추출 실패',
      url,
      category: 'unknown',
      subcategory: undefined,
      content: 'Failed to extract content',
      contentKorean: '내용 추출 실패',
      metadata: this.createDefaultMetadata(),
      images: [],
      attachments: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      scrapedAt: new Date(),
    };
  }

  /**
   * Generate unique document ID from URL
   */
  private generateDocumentId(url: string): string {
    const timestamp = Date.now().toString();
    const urlHash = Buffer.from(url).toString('base64').substring(0, 10);
    return `krds_${timestamp}_${urlHash}`;
  }

  /**
   * Infer document category from title and URL
   */
  private inferCategory(title: string, url: string): string {
    const categoryPatterns = [
      { pattern: /공고|notice/i, category: 'notice' },
      { pattern: /공지|announcement/i, category: 'announcement' },
      { pattern: /보도자료|press/i, category: 'press_release' },
      { pattern: /정책|policy/i, category: 'policy' },
      { pattern: /법령|regulation/i, category: 'regulation' },
      { pattern: /통계|statistics/i, category: 'statistics' },
      { pattern: /보고서|report/i, category: 'report' },
      { pattern: /제안서|proposal/i, category: 'proposal' },
      { pattern: /계획서|plan/i, category: 'plan' },
      { pattern: /지침|guideline/i, category: 'guideline' },
    ];

    const textToAnalyze = `${title} ${url}`;
    
    for (const { pattern, category } of categoryPatterns) {
      if (pattern.test(textToAnalyze)) {
        return category;
      }
    }

    return 'document';
  }

  /**
   * Infer subcategory from content sections
   */
  private inferSubcategory(sections: any[]): string | undefined {
    // This could be enhanced based on section analysis
    // For now, return undefined to use main category only
    return undefined;
  }

  /**
   * Create default metadata when none is extracted
   */
  private createDefaultMetadata(): KrdsMetadata {
    return {
      agency: 'Unknown Agency',
      agencyKorean: '알 수 없는 기관',
      publicationDate: undefined,
      documentType: 'document',
      keywords: [],
      keywordsKorean: [],
      language: 'ko',
      classification: 'general',
      status: 'active',
    };
  }

  /**
   * Check if enhanced parsing should be used based on page content
   */
  public async shouldUseEnhancedParsing(page: Page): Promise<boolean> {
    try {
      const pageInfo = await page.evaluate(() => {
        const hasComplexTables = document.querySelectorAll('table').length > 0;
        const hasImages = document.querySelectorAll('img').length > 0;
        const hasKoreanContent = /[\u3131-\u314e\u314f-\u3163\uac00-\ud7a3]/.test(document.body.textContent || '');
        const contentLength = document.body.textContent?.length || 0;

        return {
          hasComplexTables,
          hasImages,
          hasKoreanContent,
          contentLength,
        };
      });

      // Use enhanced parsing for pages with complex content
      return (
        pageInfo.hasComplexTables ||
        pageInfo.hasImages ||
        pageInfo.hasKoreanContent ||
        pageInfo.contentLength > 5000
      );

    } catch (error) {
      this.logger.warn('Failed to determine parsing method, defaulting to enhanced', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return true; // Default to enhanced parsing
    }
  }
}

/**
 * Integration utility functions
 */
export class ContentIntegrationUtils {
  /**
   * Convert legacy extracted data to enhanced format
   */
  static convertLegacyData(legacyData: any): Partial<KrdsDocument> {
    return {
      title: legacyData.title || 'Untitled',
      titleKorean: legacyData.titleKorean || legacyData.title || 'Untitled',
      content: legacyData.content || '',
      contentKorean: legacyData.contentKorean || legacyData.content || '',
      category: legacyData.category || 'document',
      metadata: legacyData.metadata || {},
    };
  }

  /**
   * Merge parsed content with existing document data
   */
  static mergeContentData(
    existingDocument: Partial<KrdsDocument>,
    parsedContent: ParsedContent
  ): KrdsDocument {
    const now = new Date();

    return {
      id: existingDocument.id || ContentIntegrationUtils.generateId(),
      title: parsedContent.title || existingDocument.title || 'Untitled',
      titleKorean: parsedContent.titleKorean || existingDocument.titleKorean || 'Untitled',
      url: existingDocument.url || '',
      category: existingDocument.category || 'document',
      subcategory: existingDocument.subcategory,
      content: parsedContent.content,
      contentKorean: parsedContent.contentKorean,
      metadata: parsedContent.metadata || existingDocument.metadata || {} as KrdsMetadata,
      images: parsedContent.images || [],
      attachments: parsedContent.attachments || [],
      createdAt: existingDocument.createdAt || now,
      updatedAt: now,
      scrapedAt: now,
    };
  }

  /**
   * Generate unique ID
   */
  private static generateId(): string {
    return `krds_${Date.now()}_${Math.random().toString(36).substring(2, 12)}`;
  }
}