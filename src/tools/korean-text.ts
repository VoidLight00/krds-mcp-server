/**
 * KRDS Korean Text Processing MCP Tool
 * 
 * This tool provides comprehensive Korean text search and processing functionality
 * specifically designed for KRDS documents. It handles Korean text normalization,
 * search, analysis, and linguistic processing with government document context.
 * 
 * Features:
 * =========
 * 1. Korean text normalization and cleaning
 * 2. Hangul romanization and transliteration
 * 3. Korean keyword extraction with NLP
 * 4. Semantic search with Korean language models
 * 5. Government terminology processing
 * 6. Korean date and number parsing
 * 7. Document classification by Korean content
 * 
 * Usage Examples:
 * ===============
 * - Normalize text: { "action": "normalize", "text": "정부정책관련문서" }
 * - Extract keywords: { "action": "extract_keywords", "text": "환경부 정책..." }
 * - Romanize text: { "action": "romanize", "text": "한국어 문서" }
 * 
 * @author KRDS MCP Server
 * @version 1.0.0
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// Internal imports
import type { 
  ToolContext,
  KoreanTextAnalysis
} from '@/types/index.js';
import { KoreanTextProcessor } from '@/parsing/index.js';
import { KrdsError } from '@/types/index.js';

// ============================================================================
// Schema Definitions
// ============================================================================

/**
 * Korean text processing actions
 */
const KoreanTextAction = z.enum([
  'normalize',
  'romanize',
  'extract_keywords',
  'analyze_sentiment',
  'classify_content',
  'parse_dates',
  'parse_numbers',
  'detect_agencies',
  'search_similar',
  'translate_terms'
]);

/**
 * Input schema for the Korean text tool
 */
const KoreanTextSchema = z.object({
  // Action to perform
  action: KoreanTextAction
    .describe('Korean text processing action to perform'),
    
  // Input text
  text: z.string()
    .min(1, 'Text cannot be empty')
    .max(100000, 'Text too long (max 100,000 characters)')
    .describe('Korean text to process'),
    
  // Additional text for comparison operations
  compareText: z.string()
    .max(100000, 'Compare text too long')
    .optional()
    .describe('Additional text for comparison operations'),
    
  // Processing options
  preserveSpacing: z.boolean()
    .default(true)
    .describe('Whether to preserve original spacing in normalization'),
    
  removeStopwords: z.boolean()
    .default(false)
    .describe('Whether to remove common Korean stopwords'),
    
  includePunctuation: z.boolean()
    .default(false)
    .describe('Whether to include punctuation in results'),
    
  // Keyword extraction options
  maxKeywords: z.number()
    .int()
    .min(1, 'At least 1 keyword required')
    .max(50, 'Maximum 50 keywords allowed')
    .default(15)
    .describe('Maximum number of keywords to extract'),
    
  minKeywordLength: z.number()
    .int()
    .min(1, 'Minimum keyword length is 1')
    .max(20, 'Maximum keyword length is 20')
    .default(2)
    .describe('Minimum length for extracted keywords'),
    
  includeCompoundWords: z.boolean()
    .default(true)
    .describe('Whether to include compound words in keyword extraction'),
    
  // Romanization options
  romanizationSystem: z.enum(['revised', 'mccune', 'yale'])
    .default('revised')
    .describe('Romanization system to use'),
    
  includeHanja: z.boolean()
    .default(true)
    .describe('Whether to include Hanja (Chinese characters) in processing'),
    
  // Analysis options
  analysisDepth: z.enum(['basic', 'detailed', 'comprehensive'])
    .default('detailed')
    .describe('Depth of linguistic analysis'),
    
  includeReadability: z.boolean()
    .default(true)
    .describe('Whether to calculate readability scores'),
    
  includeSentiment: z.boolean()
    .default(false)
    .describe('Whether to perform sentiment analysis'),
    
  // Government document specific options
  detectAgencies: z.boolean()
    .default(true)
    .describe('Whether to detect government agency names'),
    
  extractDates: z.boolean()
    .default(true)
    .describe('Whether to extract and parse Korean dates'),
    
  extractNumbers: z.boolean()
    .default(false)
    .describe('Whether to extract and parse Korean numbers'),
    
  classifyDocumentType: z.boolean()
    .default(false)
    .describe('Whether to classify government document type'),
    
  // Search and similarity options
  similarityThreshold: z.number()
    .min(0, 'Similarity threshold must be at least 0')
    .max(1, 'Similarity threshold cannot exceed 1')
    .default(0.7)
    .describe('Similarity threshold for text comparison'),
    
  searchType: z.enum(['exact', 'fuzzy', 'semantic'])
    .default('semantic')
    .describe('Type of text search to perform'),
    
  // Output options
  includeMetadata: z.boolean()
    .default(true)
    .describe('Whether to include processing metadata in results'),
    
  outputFormat: z.enum(['detailed', 'compact', 'json'])
    .default('detailed')
    .describe('Format for output results'),
    
  // Performance options
  useCache: z.boolean()
    .default(true)
    .describe('Whether to use cached processing results'),
    
  timeout: z.number()
    .int()
    .min(1000, 'Timeout must be at least 1 second')
    .max(120000, 'Timeout cannot exceed 2 minutes')
    .default(30000)
    .describe('Processing timeout in milliseconds'),
});

// ============================================================================
// Korean Text Result Types
// ============================================================================

interface KoreanProcessingResult {
  action: string;
  success: boolean;
  result: any;
  metadata?: {
    processingTime: number;
    textLength: number;
    detectedLanguage: string;
    confidence: number;
    method: string;
  };
  errors?: string[];
}

interface KoreanKeywordResult {
  keywords: Array<{
    text: string;
    score: number;
    frequency: number;
    type: 'noun' | 'verb' | 'adjective' | 'compound' | 'proper';
    romanized?: string;
  }>;
  totalWords: number;
  uniqueWords: number;
  language: string;
}

interface KoreanSimilarityResult {
  similarity: number;
  matches: Array<{
    text: string;
    position: number;
    type: 'exact' | 'partial' | 'semantic';
  }>;
  method: string;
}

interface KoreanAgencyResult {
  agencies: Array<{
    name: string;
    nameKorean: string;
    type: 'ministry' | 'agency' | 'office' | 'committee' | 'other';
    confidence: number;
    position: number;
  }>;
}

interface KoreanDateResult {
  dates: Array<{
    original: string;
    parsed: Date;
    format: string;
    confidence: number;
    position: number;
  }>;
}

// ============================================================================
// Tool Implementation
// ============================================================================

/**
 * Register the Korean text processing tool with the MCP server
 */
export async function registerKoreanTextTool(
  server: Server,
  context: ToolContext
): Promise<void> {
  const { logger, krdsService, cacheManager, config } = context;
  
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== 'krds_korean_text') {
      return;
    }
    
    const toolLogger = logger.child({ 
      tool: 'korean_text', 
      requestId: generateRequestId() 
    });
    toolLogger.info('Processing Korean text request');
    
    try {
      // Step 1: Validate and parse input parameters
      const params = KoreanTextSchema.parse(request.params.arguments);
      toolLogger.debug('Korean text parameters validated', { 
        action: params.action,
        textLength: params.text.length 
      });
      
      // Step 2: Check cache for existing results
      const cacheKey = generateKoreanTextCacheKey(params);
      let result: KoreanProcessingResult | null = null;
      
      if (params.useCache && cacheManager) {
        result = await cacheManager.get<KoreanProcessingResult>(cacheKey);
        if (result) {
          toolLogger.info('Returning cached Korean text processing result', {
            cacheKey,
            action: params.action
          });
          
          return {
            content: [
              {
                type: 'text',
                text: formatKoreanTextResult(result, true),
              },
            ],
          };
        }
      }
      
      // Step 3: Initialize Korean text processor
      const processor = new KoreanTextProcessor(toolLogger);
      const processingStartTime = Date.now();
      
      // Step 4: Execute Korean text processing action
      result = await executeKoreanTextAction(
        params,
        processor,
        toolLogger
      );
      
      const processingTime = Date.now() - processingStartTime;
      
      // Add metadata
      result.metadata = {
        processingTime,
        textLength: params.text.length,
        detectedLanguage: detectTextLanguage(params.text),
        confidence: 1.0,
        method: params.action
      };
      
      toolLogger.info('Korean text processing completed', {
        action: params.action,
        success: result.success,
        processingTimeMs: processingTime,
        textLength: params.text.length
      });
      
      // Step 5: Cache the results
      if (params.useCache && cacheManager && result.success) {
        await cacheManager.set(cacheKey, result, config.cache.ttl);
        toolLogger.debug('Korean text processing result cached', { cacheKey });
      }
      
      // Step 6: Format and return results
      return {
        content: [
          {
            type: 'text',
            text: formatKoreanTextResult(result, false),
          },
        ],
      };
      
    } catch (error) {
      toolLogger.error('Korean text processing error', { error });
      
      if (error instanceof McpError) {
        throw error;
      }
      
      if (error instanceof KrdsError) {
        throw new McpError(
          ErrorCode.InternalError,
          `KRDS Korean text processing error: ${error.message}`,
        );
      }
      
      throw new McpError(
        ErrorCode.InternalError,
        `Korean text processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  });
  
  // Tool metadata is handled by the centralized registry
}

// ============================================================================
// Korean Text Processing Actions
// ============================================================================

/**
 * Execute Korean text processing action
 */
async function executeKoreanTextAction(
  params: z.infer<typeof KoreanTextSchema>,
  processor: KoreanTextProcessor,
  logger: any
): Promise<KoreanProcessingResult> {
  
  try {
    switch (params.action) {
      case 'normalize':
        return await normalizeKoreanText(params, processor, logger);
        
      case 'romanize':
        return await romanizeKoreanText(params, processor, logger);
        
      case 'extract_keywords':
        return await extractKoreanKeywords(params, processor, logger);
        
      case 'analyze_sentiment':
        return await analyzeKoreanSentiment(params, processor, logger);
        
      case 'classify_content':
        return await classifyKoreanContent(params, processor, logger);
        
      case 'parse_dates':
        return await parseKoreanDates(params, processor, logger);
        
      case 'parse_numbers':
        return await parseKoreanNumbers(params, processor, logger);
        
      case 'detect_agencies':
        return await detectGovernmentAgencies(params, processor, logger);
        
      case 'search_similar':
        return await searchSimilarKoreanText(params, processor, logger);
        
      case 'translate_terms':
        return await translateKoreanTerms(params, processor, logger);
        
      default:
        throw new KrdsError(
          'INVALID_REQUEST',
          `Unsupported Korean text action: ${params.action}`
        );
    }
  } catch (error) {
    return {
      action: params.action,
      success: false,
      result: null,
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
  }
}

/**
 * Normalize Korean text
 */
async function normalizeKoreanText(
  params: z.infer<typeof KoreanTextSchema>,
  processor: KoreanTextProcessor,
  logger: any
): Promise<KoreanProcessingResult> {
  
  const normalizeOptions = {
    preserveSpacing: params.preserveSpacing,
    removeStopwords: params.removeStopwords,
    includePunctuation: params.includePunctuation,
    includeHanja: params.includeHanja,
  };
  
  const analysis = await processor.processText(params.text, normalizeOptions);
  
  return {
    action: 'normalize',
    success: true,
    result: {
      originalText: params.text,
      normalizedText: analysis.normalizedText,
      changes: {
        spacingChanges: analysis.spacingChanges || 0,
        punctuationRemoved: analysis.punctuationRemoved || 0,
        stopwordsRemoved: analysis.stopwordsRemoved || 0,
      },
      wordCount: analysis.wordCount,
      characterCount: analysis.characterCount,
    }
  };
}

/**
 * Romanize Korean text
 */
async function romanizeKoreanText(
  params: z.infer<typeof KoreanTextSchema>,
  processor: KoreanTextProcessor,
  logger: any
): Promise<KoreanProcessingResult> {
  
  const romanizedText = await processor.romanizeText(params.text, {
    system: params.romanizationSystem,
    preserveSpacing: params.preserveSpacing,
  });
  
  return {
    action: 'romanize',
    success: true,
    result: {
      originalText: params.text,
      romanizedText,
      system: params.romanizationSystem,
      preservedSpacing: params.preserveSpacing,
    }
  };
}

/**
 * Extract Korean keywords
 */
async function extractKoreanKeywords(
  params: z.infer<typeof KoreanTextSchema>,
  processor: KoreanTextProcessor,
  logger: any
): Promise<KoreanProcessingResult> {
  
  const keywords = await processor.extractKeywords(params.text, {
    maxKeywords: params.maxKeywords,
    minLength: params.minKeywordLength,
    includeCompoundWords: params.includeCompoundWords,
    removeStopwords: params.removeStopwords,
    includeRomanization: true,
  });
  
  const result: KoreanKeywordResult = {
    keywords: keywords.map(kw => ({
      text: kw.text,
      score: kw.score || 1.0,
      frequency: kw.frequency || 1,
      type: kw.type || 'noun',
      romanized: kw.romanized,
    })),
    totalWords: keywords.length,
    uniqueWords: new Set(keywords.map(kw => kw.text)).size,
    language: 'ko',
  };
  
  return {
    action: 'extract_keywords',
    success: true,
    result
  };
}

/**
 * Analyze Korean sentiment
 */
async function analyzeKoreanSentiment(
  params: z.infer<typeof KoreanTextSchema>,
  processor: KoreanTextProcessor,
  logger: any
): Promise<KoreanProcessingResult> {
  
  // This would use a Korean sentiment analysis model
  // For now, provide a basic implementation
  const sentimentScore = calculateBasicKoreanSentiment(params.text);
  
  return {
    action: 'analyze_sentiment',
    success: true,
    result: {
      sentiment: sentimentScore > 0.1 ? 'positive' : sentimentScore < -0.1 ? 'negative' : 'neutral',
      score: sentimentScore,
      confidence: 0.7,
      method: 'basic_lexicon',
      breakdown: {
        positiveWords: extractPositiveWords(params.text),
        negativeWords: extractNegativeWords(params.text),
        neutralWords: extractNeutralWords(params.text),
      }
    }
  };
}

/**
 * Classify Korean content
 */
async function classifyKoreanContent(
  params: z.infer<typeof KoreanTextSchema>,
  processor: KoreanTextProcessor,
  logger: any
): Promise<KoreanProcessingResult> {
  
  const classification = classifyGovernmentDocument(params.text);
  
  return {
    action: 'classify_content',
    success: true,
    result: {
      documentType: classification.type,
      confidence: classification.confidence,
      categories: classification.categories,
      indicators: classification.indicators,
    }
  };
}

/**
 * Parse Korean dates
 */
async function parseKoreanDates(
  params: z.infer<typeof KoreanTextSchema>,
  processor: KoreanTextProcessor,
  logger: any
): Promise<KoreanProcessingResult> {
  
  const dates = extractKoreanDates(params.text);
  
  const result: KoreanDateResult = {
    dates: dates.map(date => ({
      original: date.original,
      parsed: date.parsed,
      format: date.format,
      confidence: date.confidence,
      position: date.position,
    }))
  };
  
  return {
    action: 'parse_dates',
    success: true,
    result
  };
}

/**
 * Parse Korean numbers
 */
async function parseKoreanNumbers(
  params: z.infer<typeof KoreanTextSchema>,
  processor: KoreanTextProcessor,
  logger: any
): Promise<KoreanProcessingResult> {
  
  const numbers = extractKoreanNumbers(params.text);
  
  return {
    action: 'parse_numbers',
    success: true,
    result: {
      numbers: numbers.map(num => ({
        original: num.original,
        value: num.value,
        type: num.type,
        position: num.position,
      }))
    }
  };
}

/**
 * Detect government agencies
 */
async function detectGovernmentAgencies(
  params: z.infer<typeof KoreanTextSchema>,
  processor: KoreanTextProcessor,
  logger: any
): Promise<KoreanProcessingResult> {
  
  const agencies = detectKoreanGovernmentAgencies(params.text);
  
  const result: KoreanAgencyResult = {
    agencies: agencies.map(agency => ({
      name: agency.name,
      nameKorean: agency.nameKorean,
      type: agency.type,
      confidence: agency.confidence,
      position: agency.position,
    }))
  };
  
  return {
    action: 'detect_agencies',
    success: true,
    result
  };
}

/**
 * Search similar Korean text
 */
async function searchSimilarKoreanText(
  params: z.infer<typeof KoreanTextSchema>,
  processor: KoreanTextProcessor,
  logger: any
): Promise<KoreanProcessingResult> {
  
  if (!params.compareText) {
    throw new KrdsError(
      'INVALID_REQUEST',
      'Compare text is required for similarity search'
    );
  }
  
  const similarity = calculateKoreanTextSimilarity(
    params.text,
    params.compareText,
    params.searchType
  );
  
  const result: KoreanSimilarityResult = {
    similarity: similarity.score,
    matches: similarity.matches,
    method: params.searchType,
  };
  
  return {
    action: 'search_similar',
    success: true,
    result
  };
}

/**
 * Translate Korean terms
 */
async function translateKoreanTerms(
  params: z.infer<typeof KoreanTextSchema>,
  processor: KoreanTextProcessor,
  logger: any
): Promise<KoreanProcessingResult> {
  
  const terms = extractSpecializedTerms(params.text);
  const translations = terms.map(term => ({
    korean: term,
    english: translateGovernmentTerm(term),
    category: categorizeTerm(term),
  }));
  
  return {
    action: 'translate_terms',
    success: true,
    result: {
      terms: translations,
      totalTerms: terms.length,
      categories: [...new Set(translations.map(t => t.category))],
    }
  };
}

// ============================================================================
// Korean Text Processing Helper Functions
// ============================================================================

/**
 * Detect primary language of text
 */
function detectTextLanguage(text: string): string {
  // Simple Korean detection based on Hangul characters
  const koreanChars = text.match(/[가-힣]/g);
  const totalChars = text.replace(/\s/g, '').length;
  
  if (koreanChars && koreanChars.length / totalChars > 0.3) {
    return 'ko';
  } else if (/[a-zA-Z]/.test(text)) {
    return 'en';
  }
  
  return 'mixed';
}

/**
 * Calculate basic Korean sentiment (placeholder)
 */
function calculateBasicKoreanSentiment(text: string): number {
  // This is a very basic implementation
  // In practice, you would use a proper Korean sentiment analysis model
  
  const positiveWords = ['좋다', '훌륭하다', '성공', '발전', '개선', '효과적', '우수'];
  const negativeWords = ['나쁘다', '문제', '실패', '위기', '부족', '어려움', '문제점'];
  
  let score = 0;
  
  positiveWords.forEach(word => {
    const matches = (text.match(new RegExp(word, 'g')) || []).length;
    score += matches * 0.1;
  });
  
  negativeWords.forEach(word => {
    const matches = (text.match(new RegExp(word, 'g')) || []).length;
    score -= matches * 0.1;
  });
  
  return Math.max(-1, Math.min(1, score));
}

/**
 * Extract positive words from Korean text
 */
function extractPositiveWords(text: string): string[] {
  const positiveWords = ['좋다', '훌륭하다', '성공', '발전', '개선', '효과적', '우수', '만족'];
  return positiveWords.filter(word => text.includes(word));
}

/**
 * Extract negative words from Korean text
 */
function extractNegativeWords(text: string): string[] {
  const negativeWords = ['나쁘다', '문제', '실패', '위기', '부족', '어려움', '문제점', '불만'];
  return negativeWords.filter(word => text.includes(word));
}

/**
 * Extract neutral words from Korean text
 */
function extractNeutralWords(text: string): string[] {
  const neutralWords = ['정책', '방안', '계획', '추진', '검토', '논의', '결정', '시행'];
  return neutralWords.filter(word => text.includes(word));
}

/**
 * Classify government document type
 */
function classifyGovernmentDocument(text: string): any {
  const classifications = [
    { type: 'policy', keywords: ['정책', '방침', '시책'], weight: 1.0 },
    { type: 'report', keywords: ['보고서', '결과', '분석'], weight: 1.0 },
    { type: 'notice', keywords: ['공고', '알림', '공지'], weight: 1.0 },
    { type: 'regulation', keywords: ['규정', '법령', '조례'], weight: 1.0 },
    { type: 'statistics', keywords: ['통계', '현황', '데이터'], weight: 1.0 },
  ];
  
  let bestMatch = { type: 'unknown', confidence: 0, categories: [], indicators: [] };
  
  for (const classification of classifications) {
    const matches = classification.keywords.filter(keyword => text.includes(keyword));
    const score = matches.length / classification.keywords.length;
    
    if (score > bestMatch.confidence) {
      bestMatch = {
        type: classification.type,
        confidence: score,
        categories: [classification.type],
        indicators: matches,
      };
    }
  }
  
  return bestMatch;
}

/**
 * Extract Korean dates from text
 */
function extractKoreanDates(text: string): any[] {
  const datePatterns = [
    { pattern: /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/g, format: 'YYYY년 MM월 DD일' },
    { pattern: /(\d{4})[-.]\s*(\d{1,2})[-.]\s*(\d{1,2})/g, format: 'YYYY-MM-DD' },
    { pattern: /(\d{4})\/(\d{1,2})\/(\d{1,2})/g, format: 'YYYY/MM/DD' },
  ];
  
  const dates: any[] = [];
  
  datePatterns.forEach(({ pattern, format }) => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const year = parseInt(match[1]);
      const month = parseInt(match[2]) - 1; // JavaScript months are 0-indexed
      const day = parseInt(match[3]);
      
      dates.push({
        original: match[0],
        parsed: new Date(year, month, day),
        format,
        confidence: 0.9,
        position: match.index,
      });
    }
  });
  
  return dates;
}

/**
 * Extract Korean numbers from text
 */
function extractKoreanNumbers(text: string): any[] {
  const numberPatterns = [
    { pattern: /([일이삼사오육칠팔구십백천만억]+)/g, type: 'korean_digit' },
    { pattern: /(\d+)/g, type: 'arabic_digit' },
    { pattern: /([\d,]+)/g, type: 'formatted_number' },
  ];
  
  const numbers: any[] = [];
  
  numberPatterns.forEach(({ pattern, type }) => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      let value: number;
      
      if (type === 'korean_digit') {
        value = convertKoreanNumberToArabic(match[1]);
      } else {
        value = parseInt(match[1].replace(/,/g, '')) || 0;
      }
      
      numbers.push({
        original: match[0],
        value,
        type,
        position: match.index,
      });
    }
  });
  
  return numbers;
}

/**
 * Convert Korean number words to Arabic numerals (placeholder)
 */
function convertKoreanNumberToArabic(koreanNumber: string): number {
  // This would need a proper Korean number conversion algorithm
  // For now, return a placeholder
  return 0;
}

/**
 * Detect Korean government agencies
 */
function detectKoreanGovernmentAgencies(text: string): any[] {
  const agencies = [
    { name: 'Ministry of Environment', nameKorean: '환경부', type: 'ministry' },
    { name: 'Ministry of Economy and Finance', nameKorean: '기획재정부', type: 'ministry' },
    { name: 'Ministry of Education', nameKorean: '교육부', type: 'ministry' },
    { name: 'Ministry of Health and Welfare', nameKorean: '보건복지부', type: 'ministry' },
    { name: 'Ministry of Land, Infrastructure and Transport', nameKorean: '국토교통부', type: 'ministry' },
    { name: 'Korea Development Bank', nameKorean: '한국개발은행', type: 'agency' },
    { name: 'Statistics Korea', nameKorean: '통계청', type: 'agency' },
  ];
  
  const detectedAgencies: any[] = [];
  
  agencies.forEach(agency => {
    const koreanIndex = text.indexOf(agency.nameKorean);
    const englishIndex = text.indexOf(agency.name);
    
    if (koreanIndex !== -1) {
      detectedAgencies.push({
        ...agency,
        confidence: 0.95,
        position: koreanIndex,
      });
    } else if (englishIndex !== -1) {
      detectedAgencies.push({
        ...agency,
        confidence: 0.85,
        position: englishIndex,
      });
    }
  });
  
  return detectedAgencies;
}

/**
 * Calculate Korean text similarity
 */
function calculateKoreanTextSimilarity(text1: string, text2: string, method: string): any {
  // This would use proper Korean text similarity algorithms
  // For now, provide a basic implementation
  
  const words1 = text1.split(/\s+/);
  const words2 = text2.split(/\s+/);
  
  const commonWords = words1.filter(word => words2.includes(word));
  const similarity = (commonWords.length * 2) / (words1.length + words2.length);
  
  return {
    score: similarity,
    matches: commonWords.map((word, index) => ({
      text: word,
      position: text1.indexOf(word),
      type: 'exact' as const,
    })),
  };
}

/**
 * Extract specialized terms from Korean text
 */
function extractSpecializedTerms(text: string): string[] {
  // Extract terms that might need translation
  const specialTermPatterns = [
    /([가-힣]{2,}부)/g, // Government ministries
    /([가-힣]{2,}청)/g, // Government agencies
    /([가-힣]{2,}원)/g, // Institutions
    /([가-힣]{3,}정책)/g, // Policies
  ];
  
  const terms: string[] = [];
  
  specialTermPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      terms.push(match[1]);
    }
  });
  
  return [...new Set(terms)]; // Remove duplicates
}

/**
 * Translate government term (placeholder)
 */
function translateGovernmentTerm(term: string): string {
  const translations: Record<string, string> = {
    '환경부': 'Ministry of Environment',
    '기획재정부': 'Ministry of Economy and Finance',
    '교육부': 'Ministry of Education',
    '보건복지부': 'Ministry of Health and Welfare',
    '국토교통부': 'Ministry of Land, Infrastructure and Transport',
    '통계청': 'Statistics Korea',
    '환경정책': 'Environmental Policy',
    '경제정책': 'Economic Policy',
  };
  
  return translations[term] || term;
}

/**
 * Categorize Korean term
 */
function categorizeTerm(term: string): string {
  if (term.endsWith('부')) return 'ministry';
  if (term.endsWith('청')) return 'agency';
  if (term.endsWith('원')) return 'institution';
  if (term.includes('정책')) return 'policy';
  return 'other';
}

/**
 * Generate a unique request ID for logging and tracing
 */
function generateRequestId(): string {
  return `korean_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a cache key for Korean text parameters
 */
function generateKoreanTextCacheKey(params: z.infer<typeof KoreanTextSchema>): string {
  const keyComponents = [
    'krds_korean',
    params.action,
    params.text.substring(0, 100), // First 100 chars for uniqueness
    params.maxKeywords || '',
    params.romanizationSystem || '',
    params.analysisDepth || '',
  ];
  
  return keyComponents.join('|');
}

/**
 * Format Korean text processing result for display
 */
function formatKoreanTextResult(
  result: KoreanProcessingResult, 
  fromCache: boolean
): string {
  let output = `# Korean Text Processing Result ${fromCache ? '(Cached)' : ''}\n\n`;
  
  output += `**Action:** ${result.action}\n`;
  output += `**Status:** ${result.success ? '✅ Success' : '❌ Failed'}\n\n`;
  
  if (result.metadata) {
    output += `**Processing Metadata:**\n`;
    output += `- Text Length: ${result.metadata.textLength} characters\n`;
    output += `- Detected Language: ${result.metadata.detectedLanguage}\n`;
    output += `- Processing Time: ${result.metadata.processingTime}ms\n`;
    output += `- Confidence: ${(result.metadata.confidence * 100).toFixed(1)}%\n`;
    output += `- Method: ${result.metadata.method}\n\n`;
  }
  
  if (result.success && result.result) {
    output += `**Results:**\n\n`;
    
    switch (result.action) {
      case 'normalize':
        output += formatNormalizeResult(result.result);
        break;
      case 'romanize':
        output += formatRomanizeResult(result.result);
        break;
      case 'extract_keywords':
        output += formatKeywordResult(result.result);
        break;
      case 'analyze_sentiment':
        output += formatSentimentResult(result.result);
        break;
      case 'classify_content':
        output += formatClassificationResult(result.result);
        break;
      case 'parse_dates':
        output += formatDateResult(result.result);
        break;
      case 'detect_agencies':
        output += formatAgencyResult(result.result);
        break;
      default:
        output += `${JSON.stringify(result.result, null, 2)}\n`;
    }
  }
  
  if (result.errors && result.errors.length > 0) {
    output += `\n**Errors:**\n`;
    result.errors.forEach((error, index) => {
      output += `${index + 1}. ${error}\n`;
    });
  }
  
  output += `\n---\n\n`;
  output += `*Processed on ${new Date().toISOString().split('T')[0]}*\n`;
  
  return output;
}

/**
 * Format normalization result
 */
function formatNormalizeResult(result: any): string {
  let output = `**Original Text:**\n${result.originalText}\n\n`;
  output += `**Normalized Text:**\n${result.normalizedText}\n\n`;
  output += `**Statistics:**\n`;
  output += `- Word Count: ${result.wordCount}\n`;
  output += `- Character Count: ${result.characterCount}\n`;
  output += `- Spacing Changes: ${result.changes.spacingChanges}\n`;
  output += `- Punctuation Removed: ${result.changes.punctuationRemoved}\n`;
  output += `- Stopwords Removed: ${result.changes.stopwordsRemoved}\n\n`;
  
  return output;
}

/**
 * Format romanization result
 */
function formatRomanizeResult(result: any): string {
  let output = `**Original Korean:**\n${result.originalText}\n\n`;
  output += `**Romanized Text:**\n${result.romanizedText}\n\n`;
  output += `**Romanization System:** ${result.system}\n`;
  output += `**Spacing Preserved:** ${result.preservedSpacing ? 'Yes' : 'No'}\n\n`;
  
  return output;
}

/**
 * Format keyword extraction result
 */
function formatKeywordResult(result: KoreanKeywordResult): string {
  let output = `**Extracted Keywords (${result.keywords.length}):**\n\n`;
  
  result.keywords.forEach((keyword, index) => {
    output += `${index + 1}. **${keyword.text}**`;
    if (keyword.romanized) {
      output += ` (${keyword.romanized})`;
    }
    output += `\n`;
    output += `   - Type: ${keyword.type}\n`;
    output += `   - Score: ${keyword.score.toFixed(2)}\n`;
    output += `   - Frequency: ${keyword.frequency}\n\n`;
  });
  
  output += `**Summary:**\n`;
  output += `- Total Words: ${result.totalWords}\n`;
  output += `- Unique Words: ${result.uniqueWords}\n`;
  output += `- Language: ${result.language}\n\n`;
  
  return output;
}

/**
 * Format sentiment analysis result
 */
function formatSentimentResult(result: any): string {
  let output = `**Sentiment:** ${result.sentiment.toUpperCase()}\n`;
  output += `**Score:** ${result.score.toFixed(2)} (range: -1.0 to 1.0)\n`;
  output += `**Confidence:** ${(result.confidence * 100).toFixed(1)}%\n`;
  output += `**Method:** ${result.method}\n\n`;
  
  output += `**Word Breakdown:**\n`;
  if (result.breakdown.positiveWords.length > 0) {
    output += `- Positive Words: ${result.breakdown.positiveWords.join(', ')}\n`;
  }
  if (result.breakdown.negativeWords.length > 0) {
    output += `- Negative Words: ${result.breakdown.negativeWords.join(', ')}\n`;
  }
  if (result.breakdown.neutralWords.length > 0) {
    output += `- Neutral Words: ${result.breakdown.neutralWords.join(', ')}\n`;
  }
  output += `\n`;
  
  return output;
}

/**
 * Format classification result
 */
function formatClassificationResult(result: any): string {
  let output = `**Document Type:** ${result.documentType}\n`;
  output += `**Confidence:** ${(result.confidence * 100).toFixed(1)}%\n`;
  output += `**Categories:** ${result.categories.join(', ')}\n`;
  output += `**Indicators:** ${result.indicators.join(', ')}\n\n`;
  
  return output;
}

/**
 * Format date parsing result
 */
function formatDateResult(result: KoreanDateResult): string {
  let output = `**Extracted Dates (${result.dates.length}):**\n\n`;
  
  result.dates.forEach((date, index) => {
    output += `${index + 1}. **${date.original}**\n`;
    output += `   - Parsed: ${date.parsed.toISOString().split('T')[0]}\n`;
    output += `   - Format: ${date.format}\n`;
    output += `   - Confidence: ${(date.confidence * 100).toFixed(1)}%\n`;
    output += `   - Position: ${date.position}\n\n`;
  });
  
  return output;
}

/**
 * Format agency detection result
 */
function formatAgencyResult(result: KoreanAgencyResult): string {
  let output = `**Detected Agencies (${result.agencies.length}):**\n\n`;
  
  result.agencies.forEach((agency, index) => {
    output += `${index + 1}. **${agency.nameKorean}** (${agency.name})\n`;
    output += `   - Type: ${agency.type}\n`;
    output += `   - Confidence: ${(agency.confidence * 100).toFixed(1)}%\n`;
    output += `   - Position: ${agency.position}\n\n`;
  });
  
  return output;
}

// ============================================================================
// Exports
// ============================================================================

export { KoreanTextSchema };
export type { 
  KoreanProcessingResult, 
  KoreanKeywordResult, 
  KoreanSimilarityResult,
  KoreanAgencyResult,
  KoreanDateResult 
};