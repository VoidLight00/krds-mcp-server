/**
 * Metadata Extractor for KRDS Documents
 * 
 * Extracts comprehensive metadata from HTML documents including page metadata,
 * document properties, publication information, and Korean-specific metadata.
 * Supports various metadata standards and formats commonly used in Korean
 * government websites.
 * 
 * Features:
 * - HTML meta tag extraction
 * - Open Graph metadata
 * - Schema.org structured data
 * - Korean government metadata standards
 * - Publication date detection
 * - Agency and classification extraction
 * - Document type inference
 * 
 * @author KRDS MCP Server
 * @version 1.0.0
 */

import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { Logger } from 'winston';
import { KrdsMetadata, KrdsError } from '../types/index.js';

/**
 * Metadata extraction options
 */
export interface MetadataExtractionOptions {
  /** Extract Open Graph metadata */
  extractOpenGraph: boolean;
  /** Extract Schema.org structured data */
  extractStructuredData: boolean;
  /** Process Korean-specific metadata */
  processKoreanMetadata: boolean;
  /** Extract publication and modification dates */
  extractDates: boolean;
  /** Extract keyword and classification metadata */
  extractKeywords: boolean;
  /** Extract agency and organizational metadata */
  extractAgencyInfo: boolean;
  /** Maximum number of keywords to extract */
  maxKeywords: number;
}

/**
 * Default metadata extraction options
 */
export const DEFAULT_METADATA_OPTIONS: MetadataExtractionOptions = {
  extractOpenGraph: true,
  extractStructuredData: true,
  processKoreanMetadata: true,
  extractDates: true,
  extractKeywords: true,
  extractAgencyInfo: true,
  maxKeywords: 20,
};

/**
 * Raw metadata collection
 */
interface RawMetadata {
  title?: string;
  description?: string;
  keywords?: string[];
  author?: string;
  agency?: string;
  publicationDate?: Date;
  modifiedDate?: Date;
  documentType?: string;
  classification?: string;
  language?: string;
  openGraph?: Record<string, string>;
  structuredData?: any[];
  customMeta?: Record<string, string>;
}

/**
 * Korean date patterns for parsing
 */
const KOREAN_DATE_PATTERNS = [
  /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/g,
  /(\d{4})[-.]\s*(\d{1,2})[-.]\s*(\d{1,2})/g,
  /(\d{4})\/(\d{1,2})\/(\d{1,2})/g,
];

/**
 * Korean agency patterns
 */
const AGENCY_PATTERNS = [
  /(.+?)(부|청|처|원|위원회|공사|공단|진흥원|센터)$/,
  /(.+?)(ministry|department|agency|office|center)$/i,
];

/**
 * Document type patterns
 */
const DOCUMENT_TYPE_PATTERNS = new Map([
  ['공고', 'notice'],
  ['공지', 'announcement'],
  ['보도자료', 'press_release'],
  ['정책자료', 'policy'],
  ['법령', 'regulation'],
  ['통계', 'statistics'],
  ['보고서', 'report'],
  ['제안서', 'proposal'],
  ['계획서', 'plan'],
  ['지침서', 'guideline'],
]);

/**
 * Metadata extractor class
 */
export class MetadataExtractor {
  constructor(private logger: Logger) {}

  /**
   * Extract metadata from HTML document
   */
  public async extractMetadata(
    $: CheerioAPI,
    url: string,
    options: Partial<MetadataExtractionOptions> = {}
  ): Promise<KrdsMetadata> {
    const opts = { ...DEFAULT_METADATA_OPTIONS, ...options };

    try {
      this.logger.debug('Starting metadata extraction', { url, options: opts });

      // Collect raw metadata from various sources
      const rawMetadata = this.collectRawMetadata($, opts);

      // Process and normalize metadata
      const metadata = await this.processMetadata(rawMetadata, url, opts);

      this.logger.info('Metadata extraction completed', {
        url,
        agency: metadata.agency,
        documentType: metadata.documentType,
        keywordsCount: metadata.keywords.length,
      });

      return metadata;

    } catch (error) {
      this.logger.error('Metadata extraction failed', {
        url,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new KrdsError(
        'PARSING_ERROR',
        `Failed to extract metadata from ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
        { url }
      );
    }
  }

  /**
   * Collect raw metadata from various HTML sources
   */
  private collectRawMetadata($: CheerioAPI, options: MetadataExtractionOptions): RawMetadata {
    const raw: RawMetadata = {
      keywords: [],
      customMeta: {},
    };

    // Extract basic HTML meta tags
    $('meta').each((_, element) => {
      const meta = $(element);
      const name = meta.attr('name')?.toLowerCase();
      const property = meta.attr('property')?.toLowerCase();
      const content = meta.attr('content');

      if (!content) return;

      // Standard meta tags
      if (name === 'title' || property === 'title') raw.title = content;
      if (name === 'description' || property === 'description') raw.description = content;
      if (name === 'author') raw.author = content;
      if (name === 'keywords') raw.keywords = content.split(',').map(k => k.trim());
      if (name === 'language' || name === 'lang') raw.language = content;
      if (name === 'classification') raw.classification = content;

      // Date meta tags
      if (name === 'date' || name === 'pubdate' || name === 'publication-date') {
        raw.publicationDate = this.parseDate(content);
      }
      if (name === 'last-modified' || name === 'modified-date') {
        raw.modifiedDate = this.parseDate(content);
      }

      // Korean-specific meta tags
      if (options.processKoreanMetadata) {
        if (name === 'agency' || name === 'dept' || name === 'department') raw.agency = content;
        if (name === 'document-type' || name === 'doc-type') raw.documentType = content;
      }

      // Open Graph tags
      if (options.extractOpenGraph && property?.startsWith('og:')) {
        if (!raw.openGraph) raw.openGraph = {};
        raw.openGraph[property] = content;
      }

      // Custom meta tags
      if (name && !['title', 'description', 'author', 'keywords', 'language', 'classification'].includes(name)) {
        raw.customMeta![name] = content;
      }
    });

    // Extract title from title tag if not found in meta
    if (!raw.title) {
      raw.title = $('title').first().text().trim();
    }

    // Extract structured data if enabled
    if (options.extractStructuredData) {
      raw.structuredData = this.extractStructuredData($);
    }

    // Extract additional Korean metadata
    if (options.processKoreanMetadata) {
      this.extractKoreanSpecificMetadata($, raw);
    }

    // Extract dates from content if not found in meta
    if (options.extractDates && !raw.publicationDate) {
      raw.publicationDate = this.extractDateFromContent($);
    }

    // Extract agency info if not found
    if (options.extractAgencyInfo && !raw.agency) {
      raw.agency = this.extractAgencyFromContent($);
    }

    return raw;
  }

  /**
   * Process raw metadata into final KrdsMetadata structure
   */
  private async processMetadata(
    raw: RawMetadata,
    url: string,
    options: MetadataExtractionOptions
  ): Promise<KrdsMetadata> {
    // Determine agency names
    const agency = raw.agency || 'Unknown Agency';
    const agencyKorean = this.extractKoreanAgencyName(agency);

    // Process keywords
    const keywords = this.processKeywords(raw.keywords || [], options.maxKeywords);
    const keywordsKorean = this.extractKoreanKeywords(keywords);

    // Determine document type
    const documentType = this.inferDocumentType(raw.documentType, raw.title, url);

    // Determine language
    const language = this.inferLanguage(raw.language, raw.title, raw.description);

    // Determine status
    const status = this.inferDocumentStatus(raw.customMeta || {});

    // Extract classification
    const classification = this.normalizeClassification(raw.classification || 'general');

    const metadata: KrdsMetadata = {
      agency,
      agencyKorean,
      publicationDate: raw.publicationDate,
      documentType,
      keywords,
      keywordsKorean,
      language,
      classification,
      status,
    };

    return metadata;
  }

  /**
   * Extract Schema.org structured data
   */
  private extractStructuredData($: CheerioAPI): any[] {
    const structuredData: any[] = [];

    // JSON-LD structured data
    $('script[type="application/ld+json"]').each((_, element) => {
      try {
        const jsonText = $(element).html();
        if (jsonText) {
          const data = JSON.parse(jsonText);
          structuredData.push(data);
        }
      } catch (error) {
        this.logger.warn('Failed to parse JSON-LD structured data', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Microdata (simplified extraction)
    $('[itemscope]').each((_, element) => {
      const item: any = {};
      const itemType = $(element).attr('itemtype');
      if (itemType) item['@type'] = itemType;

      $(element).find('[itemprop]').each((_, prop) => {
        const propName = $(prop).attr('itemprop');
        const propValue = $(prop).attr('content') || $(prop).text().trim();
        if (propName && propValue) {
          item[propName] = propValue;
        }
      });

      if (Object.keys(item).length > 1) {
        structuredData.push(item);
      }
    });

    return structuredData;
  }

  /**
   * Extract Korean-specific metadata patterns
   */
  private extractKoreanSpecificMetadata($: CheerioAPI, raw: RawMetadata): void {
    // Look for Korean government standard metadata
    const metaPatterns = [
      { selector: '.meta-agency, .agency-info', field: 'agency' },
      { selector: '.meta-date, .publish-date', field: 'date' },
      { selector: '.meta-classification, .document-class', field: 'classification' },
      { selector: '.meta-type, .document-type', field: 'documentType' },
    ];

    metaPatterns.forEach(({ selector, field }) => {
      const element = $(selector).first();
      if (element.length > 0) {
        const content = element.text().trim();
        if (content) {
          if (field === 'date') {
            const date = this.parseDate(content);
            if (date) raw.publicationDate = date;
          } else {
            (raw as any)[field] = content;
          }
        }
      }
    });

    // Extract from breadcrumb navigation (common in Korean gov sites)
    const breadcrumb = $('.breadcrumb, .location, .navi').text();
    if (breadcrumb && !raw.agency) {
      const agencyMatch = breadcrumb.match(/([^>]+?)(부|청|처|원|위원회)/);
      if (agencyMatch) {
        raw.agency = agencyMatch[0].trim();
      }
    }
  }

  /**
   * Extract publication date from page content
   */
  private extractDateFromContent($: CheerioAPI): Date | undefined {
    // Common date selectors in Korean government sites
    const dateSelectors = [
      '.date, .publish-date, .reg-date, .write-date',
      '.meta-date, .post-date, .article-date',
      '[class*="date"], [id*="date"]',
    ];

    for (const selector of dateSelectors) {
      const dateElement = $(selector).first();
      if (dateElement.length > 0) {
        const dateText = dateElement.text().trim();
        const date = this.parseDate(dateText);
        if (date) return date;
      }
    }

    // Look for date patterns in the main content
    const contentText = $('body').text();
    for (const pattern of KOREAN_DATE_PATTERNS) {
      const match = pattern.exec(contentText);
      if (match) {
        const date = this.parseKoreanDate(match);
        if (date) return date;
      }
    }

    return undefined;
  }

  /**
   * Extract agency information from content
   */
  private extractAgencyFromContent($: CheerioAPI): string | undefined {
    // Look for agency in header or footer
    const agencySelectors = [
      '.agency, .organization, .dept, .department',
      'header .org-name, footer .org-name',
      '.site-name, .logo-text',
    ];

    for (const selector of agencySelectors) {
      const element = $(selector).first();
      if (element.length > 0) {
        const text = element.text().trim();
        if (text.length > 2 && text.length < 50) {
          return text;
        }
      }
    }

    // Extract from URL hostname
    try {
      const url = new URL($('base').attr('href') || window.location?.href || '');
      const hostname = url.hostname;
      
      // Korean government domains often indicate agency
      const govMatch = hostname.match(/([^.]+)\.go\.kr/);
      if (govMatch) {
        return this.formatAgencyName(govMatch[1]);
      }
    } catch (error) {
      // Ignore URL parsing errors
    }

    return undefined;
  }

  /**
   * Parse various date formats including Korean dates
   */
  private parseDate(dateString: string): Date | undefined {
    if (!dateString) return undefined;

    // Try standard ISO format first
    let date = new Date(dateString);
    if (!isNaN(date.getTime())) return date;

    // Try Korean date formats
    for (const pattern of KOREAN_DATE_PATTERNS) {
      pattern.lastIndex = 0; // Reset regex
      const match = pattern.exec(dateString);
      if (match) {
        const parsed = this.parseKoreanDate(match);
        if (parsed) return parsed;
      }
    }

    // Try common date formats
    const formats = [
      /(\d{4})-(\d{1,2})-(\d{1,2})/,
      /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
      /(\d{4})\.(\d{1,2})\.(\d{1,2})/,
    ];

    for (const format of formats) {
      const match = dateString.match(format);
      if (match) {
        const [, first, second, third] = match;
        // Assume YYYY-MM-DD or YYYY.MM.DD format for 4-digit first part
        if (first.length === 4) {
          date = new Date(parseInt(first), parseInt(second) - 1, parseInt(third));
        } else {
          // Assume MM/DD/YYYY format
          date = new Date(parseInt(third), parseInt(first) - 1, parseInt(second));
        }
        
        if (!isNaN(date.getTime())) return date;
      }
    }

    return undefined;
  }

  /**
   * Parse Korean date pattern match
   */
  private parseKoreanDate(match: RegExpExecArray): Date | undefined {
    if (match.length >= 4) {
      const year = parseInt(match[1]);
      const month = parseInt(match[2]) - 1; // JavaScript months are 0-based
      const day = parseInt(match[3]);
      
      const date = new Date(year, month, day);
      return !isNaN(date.getTime()) ? date : undefined;
    }
    return undefined;
  }

  /**
   * Process and normalize keywords
   */
  private processKeywords(rawKeywords: string[], maxKeywords: number): string[] {
    const keywords = new Set<string>();

    rawKeywords.forEach(keyword => {
      const cleaned = keyword.trim().toLowerCase();
      if (cleaned.length > 1 && cleaned.length < 50) {
        keywords.add(cleaned);
      }
    });

    return Array.from(keywords).slice(0, maxKeywords);
  }

  /**
   * Extract Korean keywords from processed keywords
   */
  private extractKoreanKeywords(keywords: string[]): string[] {
    return keywords.filter(keyword => /[\u3130-\u318F\uAC00-\uD7AF]/.test(keyword));
  }

  /**
   * Extract Korean agency name
   */
  private extractKoreanAgencyName(agency: string): string {
    // If already in Korean, return as-is
    if (/[\u3130-\u318F\uAC00-\uD7AF]/.test(agency)) {
      return agency;
    }

    // Try to map English agency names to Korean (would need a lookup table)
    // For now, return the original
    return agency;
  }

  /**
   * Infer document type from various sources
   */
  private inferDocumentType(
    explicitType?: string,
    title?: string,
    url?: string
  ): string {
    // Use explicit type if available
    if (explicitType) {
      const normalized = DOCUMENT_TYPE_PATTERNS.get(explicitType) || explicitType;
      return normalized;
    }

    // Infer from title
    if (title) {
      for (const [korean, english] of DOCUMENT_TYPE_PATTERNS) {
        if (title.includes(korean)) {
          return english;
        }
      }
    }

    // Infer from URL
    if (url) {
      for (const [korean, english] of DOCUMENT_TYPE_PATTERNS) {
        if (url.includes(english) || url.includes(korean)) {
          return english;
        }
      }
    }

    return 'document';
  }

  /**
   * Infer document language
   */
  private inferLanguage(
    explicitLang?: string,
    title?: string,
    description?: string
  ): 'ko' | 'ko-en' | 'en' {
    if (explicitLang) {
      if (explicitLang.startsWith('ko')) return 'ko';
      if (explicitLang.startsWith('en')) return 'en';
    }

    const text = `${title || ''} ${description || ''}`;
    const hasKorean = /[\u3130-\u318F\uAC00-\uD7AF]/.test(text);
    const hasEnglish = /[a-zA-Z]/.test(text);

    if (hasKorean && hasEnglish) return 'ko-en';
    if (hasKorean) return 'ko';
    return 'en';
  }

  /**
   * Infer document status from metadata
   */
  private inferDocumentStatus(customMeta: Record<string, string>): 'active' | 'archived' | 'deleted' {
    const status = customMeta.status?.toLowerCase();
    
    if (status === 'archived' || status === '보관') return 'archived';
    if (status === 'deleted' || status === '삭제') return 'deleted';
    
    return 'active';
  }

  /**
   * Normalize classification information
   */
  private normalizeClassification(classification: string): string {
    const normalizations: Record<string, string> = {
      '일반': 'general',
      '공개': 'public',
      '비공개': 'restricted',
      '대외비': 'confidential',
      '기밀': 'secret',
    };

    return normalizations[classification] || classification.toLowerCase();
  }

  /**
   * Format agency name from URL subdomain
   */
  private formatAgencyName(subdomain: string): string {
    // Convert common subdomain patterns to readable agency names
    const agencyMap: Record<string, string> = {
      'moef': 'Ministry of Economy and Finance',
      'moe': 'Ministry of Education',
      'moel': 'Ministry of Employment and Labor',
      'mohw': 'Ministry of Health and Welfare',
      'molit': 'Ministry of Land, Infrastructure and Transport',
      'krds': 'Korea Research Data Service',
    };

    return agencyMap[subdomain] || subdomain.toUpperCase();
  }
}