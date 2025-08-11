/**
 * Main Content Parser for KRDS Documents
 * 
 * This module provides the primary content parsing functionality for KRDS documents,
 * extracting and structuring text content while preserving document hierarchy and
 * semantic information. It serves as the central orchestrator for specialized parsers.
 * 
 * Features:
 * - HTML content extraction and structuring
 * - Document hierarchy preservation
 * - Korean text normalization and processing
 * - Integration with specialized parsers (tables, images, metadata)
 * - Graceful handling of malformed HTML
 * - Support for various content formats
 * 
 * @author KRDS MCP Server
 * @version 1.0.0
 */

import * as cheerio from 'cheerio';
import type { CheerioAPI, Element } from 'cheerio';
import { Logger } from 'winston';
import { KrdsDocument, KrdsMetadata, KrdsImage, KrdsAttachment, KrdsError } from '../types/index.js';
import { TableParser } from './table-parser.js';
import { ImageExtractor } from './image-extractor.js';
import { MetadataExtractor } from './metadata-extractor.js';
import { KoreanTextProcessor } from './korean-text-processor.js';

/**
 * Content parsing options
 */
export interface ContentParsingOptions {
  /** Extract and parse table data */
  extractTables: boolean;
  /** Extract image information and metadata */
  extractImages: boolean;
  /** Process Korean text (normalization, romanization, etc.) */
  processKoreanText: boolean;
  /** Extract metadata from document */
  extractMetadata: boolean;
  /** Preserve HTML structure in content */
  preserveHtml: boolean;
  /** Maximum content length (0 = no limit) */
  maxContentLength: number;
  /** Include inline CSS styles */
  includeStyles: boolean;
  /** Extract and include attachments */
  extractAttachments: boolean;
}

/**
 * Default parsing options
 */
export const DEFAULT_PARSING_OPTIONS: ContentParsingOptions = {
  extractTables: true,
  extractImages: true,
  processKoreanText: true,
  extractMetadata: true,
  preserveHtml: false,
  maxContentLength: 0,
  includeStyles: false,
  extractAttachments: true,
};

/**
 * Content section structure
 */
export interface ContentSection {
  type: 'heading' | 'paragraph' | 'list' | 'table' | 'quote' | 'code' | 'definition';
  level?: number; // For headings (h1=1, h2=2, etc.)
  content: string;
  contentKorean?: string;
  html?: string;
  metadata?: Record<string, any>;
  children?: ContentSection[];
}

/**
 * Parsed content structure
 */
export interface ParsedContent {
  title: string;
  titleKorean: string;
  content: string;
  contentKorean: string;
  sections: ContentSection[];
  wordCount: number;
  characterCount: number;
  readabilityScore?: number;
  language: 'ko' | 'ko-en' | 'en';
  tables?: any[];
  images?: KrdsImage[];
  attachments?: KrdsAttachment[];
  metadata?: KrdsMetadata;
  processingTimeMs: number;
}

/**
 * Main content parser class
 */
export class ContentParser {
  private tableParser: TableParser;
  private imageExtractor: ImageExtractor;
  private metadataExtractor: MetadataExtractor;
  private koreanProcessor: KoreanTextProcessor;

  constructor(private logger: Logger) {
    this.tableParser = new TableParser(logger);
    this.imageExtractor = new ImageExtractor(logger);
    this.metadataExtractor = new MetadataExtractor(logger);
    this.koreanProcessor = new KoreanTextProcessor(logger);
  }

  /**
   * Parse HTML content into structured format
   */
  public async parseContent(
    html: string,
    url: string,
    options: Partial<ContentParsingOptions> = {}
  ): Promise<ParsedContent> {
    const startTime = Date.now();
    const opts = { ...DEFAULT_PARSING_OPTIONS, ...options };

    try {
      this.logger.debug('Starting content parsing', { url, options: opts });

      // Load HTML with cheerio
      const $ = cheerio.load(html, {
        decodeEntities: true,
        normalizeWhitespace: true,
        xmlMode: false,
        lowerCaseAttributeNames: false,
      });

      // Clean up the HTML
      this.cleanupHtml($);

      // Extract basic content
      const title = this.extractTitle($);
      const mainContent = this.extractMainContent($);
      
      // Process Korean text if enabled
      let titleKorean = title;
      let contentKorean = mainContent;
      let readabilityScore: number | undefined;
      
      if (opts.processKoreanText) {
        const titleAnalysis = await this.koreanProcessor.processText(title);
        const contentAnalysis = await this.koreanProcessor.processText(mainContent);
        
        titleKorean = titleAnalysis.originalText;
        contentKorean = contentAnalysis.originalText;
        readabilityScore = contentAnalysis.readabilityScore;
      }

      // Extract structured sections
      const sections = this.extractSections($, opts);

      // Calculate content metrics
      const wordCount = this.countWords(mainContent);
      const characterCount = mainContent.length;

      // Initialize result
      const result: ParsedContent = {
        title,
        titleKorean,
        content: opts.maxContentLength > 0 
          ? mainContent.substring(0, opts.maxContentLength) 
          : mainContent,
        contentKorean: opts.maxContentLength > 0 
          ? contentKorean.substring(0, opts.maxContentLength) 
          : contentKorean,
        sections,
        wordCount,
        characterCount,
        readabilityScore,
        language: this.detectLanguage(mainContent),
        processingTimeMs: 0, // Will be set at the end
      };

      // Extract additional data based on options
      if (opts.extractTables) {
        result.tables = await this.tableParser.extractTables($, url);
      }

      if (opts.extractImages) {
        result.images = await this.imageExtractor.extractImages($, url);
      }

      if (opts.extractMetadata) {
        result.metadata = await this.metadataExtractor.extractMetadata($, url);
      }

      if (opts.extractAttachments) {
        result.attachments = this.extractAttachments($, url);
      }

      result.processingTimeMs = Date.now() - startTime;

      this.logger.info('Content parsing completed successfully', {
        url,
        wordCount: result.wordCount,
        sectionsCount: result.sections.length,
        tablesCount: result.tables?.length || 0,
        imagesCount: result.images?.length || 0,
        processingTimeMs: result.processingTimeMs,
      });

      return result;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error('Content parsing failed', {
        url,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTimeMs: processingTime,
      });

      throw new KrdsError(
        'PARSING_ERROR',
        `Failed to parse content from ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
        { url, processingTimeMs: processingTime }
      );
    }
  }

  /**
   * Clean up HTML by removing unwanted elements and attributes
   */
  private cleanupHtml($: CheerioAPI): void {
    // Remove script and style tags
    $('script, style, noscript').remove();

    // Remove comments
    $('*').contents().each(function() {
      if (this.type === 'comment') {
        $(this).remove();
      }
    });

    // Remove empty paragraphs and divs
    $('p, div').each(function() {
      if ($(this).text().trim() === '' && $(this).children().length === 0) {
        $(this).remove();
      }
    });

    // Clean up attributes (keep only essential ones)
    $('*').each(function() {
      const element = $(this);
      const tagName = this.tagName?.toLowerCase();
      
      // Keep essential attributes based on tag type
      const keepAttributes = new Set<string>();
      
      if (tagName === 'a') keepAttributes.add('href');
      if (tagName === 'img') keepAttributes.add('src', 'alt', 'title');
      if (tagName === 'table' || tagName === 'th' || tagName === 'td') {
        keepAttributes.add('colspan', 'rowspan', 'scope');
      }
      if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
        keepAttributes.add('id');
      }

      // Remove unwanted attributes
      const attributes = Object.keys(this.attribs || {});
      attributes.forEach(attr => {
        if (!keepAttributes.has(attr)) {
          element.removeAttr(attr);
        }
      });
    });
  }

  /**
   * Extract the main title from the document
   */
  private extractTitle($: CheerioAPI): string {
    // Try different title selectors in order of preference
    const titleSelectors = [
      'h1.title',
      '.page-title',
      '.document-title',
      '.main-title',
      'h1',
      'title',
      '.title',
    ];

    for (const selector of titleSelectors) {
      const element = $(selector).first();
      if (element.length > 0) {
        const title = element.text().trim();
        if (title) return title;
      }
    }

    return 'Untitled Document';
  }

  /**
   * Extract the main content from the document
   */
  private extractMainContent($: CheerioAPI): string {
    // Try different content selectors
    const contentSelectors = [
      '.content',
      '.main-content',
      '.document-content',
      '.article-content',
      'main',
      '.post-content',
      '#content',
    ];

    for (const selector of contentSelectors) {
      const element = $(selector).first();
      if (element.length > 0) {
        return element.text().trim();
      }
    }

    // Fallback: extract text from body, excluding navigation and footer
    $('nav, header, footer, .navigation, .nav, .menu, .sidebar').remove();
    return $('body').text().trim();
  }

  /**
   * Extract structured sections from the content
   */
  private extractSections($: CheerioAPI, options: ContentParsingOptions): ContentSection[] {
    const sections: ContentSection[] = [];

    // Find the main content area
    const contentSelectors = ['.content', '.main-content', 'main', 'article', 'body'];
    let contentRoot = $('body');

    for (const selector of contentSelectors) {
      const element = $(selector).first();
      if (element.length > 0) {
        contentRoot = element;
        break;
      }
    }

    // Process each child element
    contentRoot.children().each((_, element) => {
      const section = this.parseElement($, $(element), options);
      if (section) {
        sections.push(section);
      }
    });

    return sections;
  }

  /**
   * Parse a single element into a content section
   */
  private parseElement($: CheerioAPI, element: cheerio.Cheerio<Element>, options: ContentParsingOptions): ContentSection | null {
    const tagName = element.prop('tagName')?.toLowerCase();
    if (!tagName) return null;

    const text = element.text().trim();
    if (!text && !['table', 'img'].includes(tagName)) return null;

    // Determine section type and level
    let type: ContentSection['type'] = 'paragraph';
    let level: number | undefined;

    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
      type = 'heading';
      level = parseInt(tagName.substring(1));
    } else if (['ul', 'ol', 'dl'].includes(tagName)) {
      type = 'list';
    } else if (tagName === 'table') {
      type = 'table';
    } else if (['blockquote'].includes(tagName)) {
      type = 'quote';
    } else if (['pre', 'code'].includes(tagName)) {
      type = 'code';
    } else if (tagName === 'dl' || element.hasClass('definition')) {
      type = 'definition';
    }

    // Create section
    const section: ContentSection = {
      type,
      level,
      content: text,
      html: options.preserveHtml ? element.html() || undefined : undefined,
    };

    // Process nested elements for complex sections
    if (['list', 'definition'].includes(type)) {
      section.children = [];
      element.children().each((_, child) => {
        const childSection = this.parseElement($, $(child), options);
        if (childSection) {
          section.children!.push(childSection);
        }
      });
    }

    return section;
  }

  /**
   * Extract attachment information
   */
  private extractAttachments($: CheerioAPI, baseUrl: string): KrdsAttachment[] {
    const attachments: KrdsAttachment[] = [];

    // Look for download links and file attachments
    $('a[href]').each((_, element) => {
      const link = $(element);
      const href = link.attr('href');
      if (!href) return;

      // Check if it's a file link
      const fileExtensions = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|hwp|zip|rar)$/i;
      if (!fileExtensions.test(href)) return;

      const url = new URL(href, baseUrl).toString();
      const filename = href.split('/').pop() || 'unknown';
      const description = link.text().trim() || link.attr('title') || '';

      attachments.push({
        id: this.generateId(url),
        filename,
        url,
        mimeType: this.getMimeType(filename),
        sizeBytes: 0, // Would need to fetch to determine actual size
        description,
        descriptionKorean: description, // Could be processed further
      });
    });

    return attachments;
  }

  /**
   * Detect the primary language of the content
   */
  private detectLanguage(content: string): 'ko' | 'ko-en' | 'en' {
    const koreanRegex = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/;
    const englishRegex = /[a-zA-Z]/;

    const hasKorean = koreanRegex.test(content);
    const hasEnglish = englishRegex.test(content);

    if (hasKorean && hasEnglish) return 'ko-en';
    if (hasKorean) return 'ko';
    return 'en';
  }

  /**
   * Count words in text (handles Korean text)
   */
  private countWords(text: string): number {
    // For Korean text, count characters as words are not space-separated
    const koreanRegex = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/;
    
    if (koreanRegex.test(text)) {
      // Count Korean characters and English words separately
      const koreanChars = (text.match(/[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/g) || []).length;
      const englishWords = (text.match(/\b[a-zA-Z]+\b/g) || []).length;
      return koreanChars + englishWords;
    }
    
    // For English text, count words
    return (text.match(/\b\w+\b/g) || []).length;
  }

  /**
   * Generate a unique ID for an element
   */
  private generateId(input: string): string {
    return Buffer.from(input).toString('base64').substring(0, 16);
  }

  /**
   * Get MIME type from filename extension
   */
  private getMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      hwp: 'application/x-hwp',
      zip: 'application/zip',
      rar: 'application/x-rar-compressed',
    };

    return mimeTypes[ext || ''] || 'application/octet-stream';
  }
}