/**
 * Korean Text Processor for KRDS Documents
 * 
 * Specialized processor for Korean text normalization, analysis, and processing.
 * Handles various aspects of Korean language processing including Hangul normalization,
 * romanization, keyword extraction, and text analysis specific to Korean government
 * documents and official content.
 * 
 * Features:
 * - Hangul normalization (NFC/NFD)
 * - Korean text romanization
 * - Keyword extraction from Korean text
 * - Text sentiment analysis
 * - Readability scoring
 * - Word segmentation and morphological analysis
 * - Hanja (Chinese character) conversion
 * 
 * @author KRDS MCP Server
 * @version 1.0.0
 */

import { Logger } from 'winston';
import { KoreanTextAnalysis, KrdsError } from '../types/index.js';

// Import Korean processing libraries
// Note: These would need to be installed via npm
// import Hangul from 'hangul-js';
// import { romanize } from 'korean-romanization';

/**
 * Korean text processing options
 */
export interface KoreanTextProcessingOptions {
  /** Normalize Hangul characters */
  normalizeHangul: boolean;
  /** Generate romanized version */
  generateRomanization: boolean;
  /** Extract keywords from text */
  extractKeywords: boolean;
  /** Perform sentiment analysis */
  analyzeSentiment: boolean;
  /** Calculate readability score */
  calculateReadability: boolean;
  /** Convert Hanja to Hangul */
  convertHanja: boolean;
  /** Maximum number of keywords to extract */
  maxKeywords: number;
  /** Minimum keyword length */
  minKeywordLength: number;
}

/**
 * Default Korean text processing options
 */
export const DEFAULT_KOREAN_OPTIONS: KoreanTextProcessingOptions = {
  normalizeHangul: true,
  generateRomanization: true,
  extractKeywords: true,
  analyzeSentiment: false,
  calculateReadability: true,
  convertHanja: true,
  maxKeywords: 10,
  minKeywordLength: 2,
};

/**
 * Korean morphological analysis result
 */
interface MorphAnalysis {
  word: string;
  pos: string; // Part of speech
  stem: string;
  surface: string;
}

/**
 * Korean stopwords commonly used in government documents
 */
const KOREAN_STOPWORDS = new Set([
  '그리고', '또한', '그러나', '하지만', '따라서', '즉', '예를 들어',
  '이', '그', '저', '이것', '그것', '저것',
  '있다', '없다', '되다', '하다', '이다', '아니다',
  '것', '수', '등', '및', '또는', '혹은', '만약',
  '때문', '위해', '통해', '따라', '관련', '대한', '대해',
  '경우', '때', '중', '간', '후', '전', '동안',
  '그래서', '그런데', '그러면', '그리고', '또',
  '정부', '부처', '기관', '담당자', '관계자',
]);

/**
 * Korean formal endings commonly used in government documents
 */
const FORMAL_ENDINGS = [
  '습니다', '합니다', '됩니다', '입니다',
  '하였습니다', '되었습니다', '있습니다',
  '하겠습니다', '예정입니다',
];

/**
 * Government-specific Korean terms
 */
const GOVERNMENT_TERMS = new Map([
  ['법령', 'legislation'],
  ['정책', 'policy'],
  ['제도', 'system'],
  ['사업', 'project'],
  ['예산', 'budget'],
  ['계획', 'plan'],
  ['추진', 'promotion'],
  ['시행', 'implementation'],
  ['개선', 'improvement'],
  ['지원', 'support'],
  ['관리', 'management'],
  ['운영', 'operation'],
  ['협력', 'cooperation'],
  ['참여', 'participation'],
  ['발전', 'development'],
]);

/**
 * Korean text processor class
 */
export class KoreanTextProcessor {
  constructor(private logger: Logger) {}

  /**
   * Process Korean text and return analysis results
   */
  public async processText(
    text: string,
    options: Partial<KoreanTextProcessingOptions> = {}
  ): Promise<KoreanTextAnalysis> {
    const opts = { ...DEFAULT_KOREAN_OPTIONS, ...options };

    try {
      this.logger.debug('Starting Korean text processing', { 
        textLength: text.length,
        options: opts 
      });

      let processedText = text;

      // Step 1: Normalize Hangul if requested
      if (opts.normalizeHangul) {
        processedText = this.normalizeHangul(processedText);
      }

      // Step 2: Convert Hanja to Hangul if requested
      if (opts.convertHanja) {
        processedText = this.convertHanjaToHangul(processedText);
      }

      // Step 3: Generate romanization
      const romanized = opts.generateRomanization 
        ? this.romanizeText(processedText)
        : '';

      // Step 4: Perform morphological analysis
      const morphAnalysis = this.performMorphologicalAnalysis(processedText);

      // Step 5: Extract stemmed words
      const stemmed = morphAnalysis.map(m => m.stem).filter(Boolean);

      // Step 6: Extract keywords
      const keywords = opts.extractKeywords 
        ? this.extractKeywords(processedText, morphAnalysis, opts)
        : [];

      // Step 7: Analyze sentiment
      const sentiment = opts.analyzeSentiment 
        ? this.analyzeSentiment(processedText)
        : undefined;

      // Step 8: Calculate readability
      const readabilityScore = opts.calculateReadability 
        ? this.calculateReadability(processedText)
        : undefined;

      // Step 9: Count words and characters
      const wordCount = this.countWords(processedText);
      const characterCount = processedText.length;

      const analysis: KoreanTextAnalysis = {
        originalText: processedText,
        romanized,
        stemmed,
        keywords,
        sentiment,
        readabilityScore,
        wordCount,
        characterCount,
      };

      this.logger.info('Korean text processing completed', {
        textLength: text.length,
        keywordsExtracted: keywords.length,
        wordCount,
        sentiment,
        readabilityScore,
      });

      return analysis;

    } catch (error) {
      this.logger.error('Korean text processing failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        textLength: text.length,
      });

      throw new KrdsError(
        'KOREAN_PROCESSING_ERROR',
        `Failed to process Korean text: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
        { textLength: text.length }
      );
    }
  }

  /**
   * Normalize Hangul characters using NFC normalization
   */
  private normalizeHangul(text: string): string {
    try {
      // Unicode normalization for Korean text
      // NFC (Canonical Decomposition, followed by Canonical Composition)
      let normalized = text.normalize('NFC');

      // Remove invisible characters and normalize whitespace
      normalized = normalized.replace(/[\u200B-\u200D\uFEFF]/g, ''); // Zero-width characters
      normalized = normalized.replace(/\s+/g, ' '); // Multiple whitespace to single space
      normalized = normalized.trim();

      // Normalize Korean punctuation
      const punctuationMap: Record<string, string> = {
        '。': '.', // Japanese period to regular period
        '、': ',', // Japanese comma to regular comma
        '「': '"', // Japanese quotation marks
        '」': '"',
        '『': '"',
        '』': '"',
      };

      for (const [oldPunct, newPunct] of Object.entries(punctuationMap)) {
        normalized = normalized.replace(new RegExp(oldPunct, 'g'), newPunct);
      }

      return normalized;

    } catch (error) {
      this.logger.warn('Failed to normalize Hangul', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return text;
    }
  }

  /**
   * Convert Hanja (Chinese characters) to Hangul
   */
  private convertHanjaToHangul(text: string): string {
    // This is a simplified implementation
    // In a real implementation, you would use a comprehensive Hanja-to-Hangul dictionary
    
    const commonHanja: Record<string, string> = {
      '大': '대',
      '小': '소',
      '中': '중',
      '高': '고',
      '低': '저',
      '新': '신',
      '舊': '구',
      '東': '동',
      '西': '서',
      '南': '남',
      '北': '북',
      '學': '학',
      '校': '교',
      '生': '생',
      '先': '선',
      '後': '후',
      '上': '상',
      '下': '하',
      '左': '좌',
      '右': '우',
      '內': '내',
      '外': '외',
      '國': '국',
      '人': '인',
      '民': '민',
      '社': '사',
      '會': '회',
      '文': '문',
      '化': '화',
      '政': '정',
      '府': '부',
      '法': '법',
      '令': '령',
      '制': '제',
      '度': '도',
    };

    let converted = text;
    for (const [hanja, hangul] of Object.entries(commonHanja)) {
      converted = converted.replace(new RegExp(hanja, 'g'), hangul);
    }

    return converted;
  }

  /**
   * Romanize Korean text using the Revised Romanization system
   */
  private romanizeText(text: string): string {
    try {
      // This is a simplified romanization implementation
      // In production, you would use a proper romanization library
      
      const romanizationMap: Record<string, string> = {
        // Basic consonants
        'ㄱ': 'g', 'ㄴ': 'n', 'ㄷ': 'd', 'ㄹ': 'r', 'ㅁ': 'm',
        'ㅂ': 'b', 'ㅅ': 's', 'ㅇ': '', 'ㅈ': 'j', 'ㅊ': 'ch',
        'ㅋ': 'k', 'ㅌ': 't', 'ㅍ': 'p', 'ㅎ': 'h',
        
        // Tensed consonants
        'ㄲ': 'kk', 'ㄸ': 'tt', 'ㅃ': 'pp', 'ㅆ': 'ss', 'ㅉ': 'jj',
        
        // Basic vowels
        'ㅏ': 'a', 'ㅑ': 'ya', 'ㅓ': 'eo', 'ㅕ': 'yeo', 'ㅗ': 'o',
        'ㅛ': 'yo', 'ㅜ': 'u', 'ㅠ': 'yu', 'ㅡ': 'eu', 'ㅣ': 'i',
        
        // Diphthongs
        'ㅐ': 'ae', 'ㅒ': 'yae', 'ㅔ': 'e', 'ㅖ': 'ye',
        'ㅘ': 'wa', 'ㅙ': 'wae', 'ㅚ': 'oe', 'ㅝ': 'wo',
        'ㅞ': 'we', 'ㅟ': 'wi', 'ㅢ': 'ui',
      };

      // This is a very basic implementation
      // Real romanization requires syllable decomposition and complex rules
      let romanized = '';
      for (const char of text) {
        if (char >= '가' && char <= '힣') {
          // Korean syllable - would need proper decomposition
          romanized += '[KOR]';
        } else if (romanizationMap[char]) {
          romanized += romanizationMap[char];
        } else if (/[a-zA-Z0-9\s.,!?]/.test(char)) {
          romanized += char;
        }
      }

      return romanized.replace(/\[KOR\]/g, 'kor');

    } catch (error) {
      this.logger.warn('Failed to romanize Korean text', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return '';
    }
  }

  /**
   * Perform simplified morphological analysis
   */
  private performMorphologicalAnalysis(text: string): MorphAnalysis[] {
    // This is a very simplified implementation
    // In production, you would use libraries like KoNLPy or similar
    
    const results: MorphAnalysis[] = [];
    const words = this.tokenizeKoreanText(text);

    for (const word of words) {
      if (word.length < 2) continue;

      // Simple stem extraction (remove common endings)
      let stem = word;
      for (const ending of FORMAL_ENDINGS) {
        if (word.endsWith(ending)) {
          stem = word.slice(0, -ending.length);
          break;
        }
      }

      // Simple POS tagging based on patterns
      let pos = 'UNKNOWN';
      if (word.endsWith('다') || word.endsWith('된다') || word.endsWith('한다')) {
        pos = 'VERB';
      } else if (word.endsWith('이') || word.endsWith('의') || word.endsWith('을')) {
        pos = 'PARTICLE';
      } else if (/[가-힣]+/.test(word)) {
        pos = 'NOUN';
      }

      results.push({
        word,
        pos,
        stem,
        surface: word,
      });
    }

    return results;
  }

  /**
   * Tokenize Korean text into words
   */
  private tokenizeKoreanText(text: string): string[] {
    // Simple tokenization - split on whitespace and punctuation
    return text
      .replace(/[.,!?;:()[\]{}\"']/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 0 && /[가-힣]/.test(word));
  }

  /**
   * Extract keywords from Korean text
   */
  private extractKeywords(
    text: string,
    morphAnalysis: MorphAnalysis[],
    options: KoreanTextProcessingOptions
  ): string[] {
    const keywords = new Set<string>();

    // Extract from morphological analysis
    const nouns = morphAnalysis
      .filter(m => m.pos === 'NOUN' && m.stem.length >= options.minKeywordLength)
      .map(m => m.stem);

    // Filter out stopwords and add to keywords
    for (const noun of nouns) {
      if (!KOREAN_STOPWORDS.has(noun) && noun.length >= options.minKeywordLength) {
        keywords.add(noun);
      }
    }

    // Extract government-specific terms
    for (const [term] of GOVERNMENT_TERMS) {
      if (text.includes(term)) {
        keywords.add(term);
      }
    }

    // Extract compound nouns (simplified)
    const compoundPattern = /([가-힣]{2,})\s+([가-힣]{2,})/g;
    let match;
    while ((match = compoundPattern.exec(text)) !== null) {
      const compound = match[1] + match[2];
      if (compound.length >= options.minKeywordLength && compound.length <= 10) {
        keywords.add(compound);
      }
    }

    return Array.from(keywords).slice(0, options.maxKeywords);
  }

  /**
   * Analyze sentiment of Korean text (simplified)
   */
  private analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
    // This is a very simplified sentiment analysis
    // In production, you would use a proper Korean sentiment analysis model
    
    const positiveWords = [
      '좋', '우수', '성공', '발전', '개선', '증가', '향상', '효과',
      '만족', '추천', '긍정', '유익', '도움', '편리', '안전',
    ];

    const negativeWords = [
      '나쁘', '문제', '실패', '감소', '악화', '부족', '어려움',
      '불만', '비판', '부정', '위험', '손실', '불편', '지연',
    ];

    let positiveCount = 0;
    let negativeCount = 0;

    for (const word of positiveWords) {
      positiveCount += (text.match(new RegExp(word, 'g')) || []).length;
    }

    for (const word of negativeWords) {
      negativeCount += (text.match(new RegExp(word, 'g')) || []).length;
    }

    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  /**
   * Calculate readability score for Korean text
   */
  private calculateReadability(text: string): number {
    try {
      // Simplified Korean readability calculation
      // Based on sentence length, word complexity, and Hanja usage
      
      const sentences = text.split(/[.!?]/).filter(s => s.trim().length > 0);
      const words = this.tokenizeKoreanText(text);
      
      if (sentences.length === 0 || words.length === 0) return 0;

      // Average sentence length
      const avgSentenceLength = words.length / sentences.length;

      // Hanja complexity (more Hanja = harder to read)
      const hanjaCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
      const hanjaRatio = hanjaCount / text.length;

      // Formal language complexity
      let formalityScore = 0;
      for (const ending of FORMAL_ENDINGS) {
        if (text.includes(ending)) formalityScore += 0.1;
      }

      // Calculate readability score (0-100, higher = more readable)
      let score = 100;
      
      // Penalize long sentences
      score -= Math.min(avgSentenceLength * 2, 30);
      
      // Penalize Hanja usage
      score -= hanjaRatio * 50;
      
      // Penalize excessive formality
      score -= Math.min(formalityScore * 10, 20);

      return Math.max(Math.min(score, 100), 0);

    } catch (error) {
      this.logger.warn('Failed to calculate readability', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return 50; // Default middle score
    }
  }

  /**
   * Count words in Korean text
   */
  private countWords(text: string): number {
    // For Korean text, count both Korean words and other language words
    const koreanWords = this.tokenizeKoreanText(text).length;
    const otherWords = (text.match(/\b[a-zA-Z]+\b/g) || []).length;
    
    return koreanWords + otherWords;
  }
}