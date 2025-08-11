/**
 * Content Parsing Module Exports
 * 
 * Central export file for all content parsing functionality in the KRDS MCP server.
 * Provides a clean API for importing parsing classes, utilities, and type definitions.
 * 
 * @author KRDS MCP Server
 * @version 1.0.0
 */

// Main content parser
export {
  ContentParser,
  type ContentParsingOptions,
  type ContentSection,
  type ParsedContent,
  DEFAULT_PARSING_OPTIONS,
} from './content-parser.js';

// Table parser
export {
  TableParser,
  type TableCell,
  type TableRow,
  type TableData,
  type TableParsingOptions,
  DEFAULT_TABLE_OPTIONS,
} from './table-parser.js';

// Image extractor
export {
  ImageExtractor,
  type ImageExtractionOptions,
  type ImageContext,
  DEFAULT_IMAGE_OPTIONS,
} from './image-extractor.js';

// Metadata extractor
export {
  MetadataExtractor,
  type MetadataExtractionOptions,
  DEFAULT_METADATA_OPTIONS,
} from './metadata-extractor.js';

// Korean text processor
export {
  KoreanTextProcessor,
  type KoreanTextProcessingOptions,
  DEFAULT_KOREAN_OPTIONS,
} from './korean-text-processor.js';

// Utility functions and constants
export const PARSING_VERSION = '1.0.0';

/**
 * Default parsing configuration for KRDS documents
 */
export const KRDS_PARSING_CONFIG = {
  content: {
    extractTables: true,
    extractImages: true,
    processKoreanText: true,
    extractMetadata: true,
    preserveHtml: false,
    maxContentLength: 0,
    includeStyles: false,
    extractAttachments: true,
  },
  tables: {
    processKoreanText: true,
    includeRawHtml: false,
    generateCsvData: true,
    maxTableSize: 10000,
    inferDataTypes: true,
    processNestedTables: false,
  },
  images: {
    extractInlineImages: true,
    processKoreanText: true,
    generateDownloadUrls: true,
    extractDimensions: true,
    maxImages: 100,
    minImageSize: 16,
    extractBackgroundImages: false,
    includeDecorativeImages: false,
  },
  metadata: {
    extractOpenGraph: true,
    extractStructuredData: true,
    processKoreanMetadata: true,
    extractDates: true,
    extractKeywords: true,
    extractAgencyInfo: true,
    maxKeywords: 20,
  },
  korean: {
    normalizeHangul: true,
    generateRomanization: true,
    extractKeywords: true,
    analyzeSentiment: false,
    calculateReadability: true,
    convertHanja: true,
    maxKeywords: 15,
    minKeywordLength: 2,
  },
} as const;

/**
 * Common selectors used in KRDS document parsing
 */
export const KRDS_CONTENT_SELECTORS = {
  // Main content areas
  content: [
    '.content',
    '.main-content',
    '.document-content',
    '.article-content',
    'main',
    '.post-content',
    '#content',
    '.view-content',
  ],
  
  // Title selectors
  title: [
    'h1.title',
    '.page-title',
    '.document-title',
    '.main-title',
    'h1',
    'title',
    '.title',
    '.subject',
  ],
  
  // Date selectors
  date: [
    '.date',
    '.publish-date',
    '.reg-date',
    '.write-date',
    '.meta-date',
    '.post-date',
    '.article-date',
    '[class*="date"]',
    '[id*="date"]',
  ],
  
  // Agency/organization selectors
  agency: [
    '.agency',
    '.organization',
    '.dept',
    '.department',
    'header .org-name',
    'footer .org-name',
    '.site-name',
    '.logo-text',
  ],
  
  // Navigation and breadcrumb selectors
  navigation: [
    '.breadcrumb',
    '.location',
    '.navi',
    '.navigation',
    '.nav',
    '.path',
  ],
  
  // Table selectors
  tables: [
    'table',
    '.data-table',
    '.content-table',
    '.info-table',
  ],
  
  // Image selectors
  images: [
    'img',
    '.image',
    '.photo',
    '.picture',
    'figure img',
  ],
} as const;

/**
 * Korean text patterns commonly found in KRDS documents
 */
export const KOREAN_DOCUMENT_PATTERNS = {
  // Date patterns
  datePatterns: [
    /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/g,
    /(\d{4})[-.]\s*(\d{1,2})[-.]\s*(\d{1,2})/g,
    /(\d{4})\/(\d{1,2})\/(\d{1,2})/g,
  ],
  
  // Agency patterns
  agencyPatterns: [
    /(.+?)(부|청|처|원|위원회|공사|공단|진흥원|센터)$/,
    /(.+?)(ministry|department|agency|office|center)$/i,
  ],
  
  // Document type indicators
  documentTypes: new Map([
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
  ]),
  
  // Common Korean stopwords in government documents
  stopwords: new Set([
    '그리고', '또한', '그러나', '하지만', '따라서', '즉', '예를 들어',
    '이', '그', '저', '이것', '그것', '저것',
    '있다', '없다', '되다', '하다', '이다', '아니다',
    '것', '수', '등', '및', '또는', '혹은', '만약',
    '때문', '위해', '통해', '따라', '관련', '대한', '대해',
    '경우', '때', '중', '간', '후', '전', '동안',
    '정부', '부처', '기관', '담당자', '관계자',
  ]),
} as const;

/**
 * Utility function to create a complete parsing pipeline
 */
export function createParsingPipeline(logger: any) {
  return {
    contentParser: new ContentParser(logger),
    tableParser: new TableParser(logger),
    imageExtractor: new ImageExtractor(logger),
    metadataExtractor: new MetadataExtractor(logger),
    koreanTextProcessor: new KoreanTextProcessor(logger),
  };
}