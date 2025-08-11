/**
 * Korean Text Processor Unit Tests
 * 
 * Comprehensive tests for Korean language processing functionality:
 * - Text analysis and keyword extraction
 * - Hangul processing and romanization
 * - Stemming and normalization
 * - Sentiment analysis
 * - Performance with large Korean texts
 * 
 * @author KRDS MCP Server
 * @version 1.0.0
 */

import { jest } from '@jest/globals';
import { KoreanTextProcessor } from '@/parsing/korean-text-processor.js';
import type { KoreanTextAnalysis, KoreanConfig } from '@/types/index.js';
import { createMockLogger } from '../../helpers/test-helpers.js';

describe('KoreanTextProcessor', () => {
  let processor: KoreanTextProcessor;
  let mockLogger: any;
  let mockConfig: KoreanConfig;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockConfig = {
      enabled: true,
      features: {
        stemming: true,
        romanization: true,
        hangulProcessing: true,
        keywordExtraction: true,
      },
    };

    processor = new KoreanTextProcessor({
      config: mockConfig,
      logger: mockLogger,
    });
  });

  describe('Basic Text Analysis', () => {
    it('should analyze simple Korean text', async () => {
      const text = '한국 정부는 새로운 정책을 발표했습니다.';
      
      const result = await processor.analyzeText(text);
      
      expect(result.originalText).toBe(text);
      expect(result.wordCount).toBeGreaterThan(0);
      expect(result.characterCount).toBe(text.length);
      expect(result.keywords).toEqual(expect.arrayContaining(['정부', '정책']));
    });

    it('should handle empty text gracefully', async () => {
      const result = await processor.analyzeText('');
      
      expect(result.originalText).toBe('');
      expect(result.wordCount).toBe(0);
      expect(result.characterCount).toBe(0);
      expect(result.keywords).toEqual([]);
    });

    it('should process text with mixed Korean and English', async () => {
      const text = '한국의 Digital Transformation 정책이 발표되었습니다.';
      
      const result = await processor.analyzeText(text);
      
      expect(result.originalText).toBe(text);
      expect(result.keywords).toEqual(expect.arrayContaining(['한국', '정책']));
      expect(result.wordCount).toBeGreaterThan(0);
    });

    it('should extract keywords from government documents', async () => {
      const text = `
        대한민국 정부는 국민의 복지 향상과 경제 발전을 위한 
        새로운 정책 방안을 마련하여 발표하였습니다. 
        이번 정책은 디지털 혁신, 인공지능, 그리고 지속가능한 
        발전을 핵심 키워드로 하고 있습니다.
      `;
      
      const result = await processor.analyzeText(text);
      
      expect(result.keywords).toEqual(expect.arrayContaining([
        '정부', '정책', '국민', '경제', '디지털', '인공지능'
      ]));
      expect(result.keywords.length).toBeGreaterThan(5);
    });
  });

  describe('Hangul Processing', () => {
    it('should decompose Hangul characters', async () => {
      const text = '한글';
      
      const result = await processor.analyzeText(text);
      
      // The processor should handle Hangul decomposition internally
      expect(result.originalText).toBe(text);
      expect(result.stemmed).toBeDefined();
    });

    it('should handle various Hangul combinations', async () => {
      const texts = [
        '가나다라마바사',  // Simple consonant-vowel
        '강남구청장님께서', // Complex with particles
        '안녕하십니까',     // Formal endings
        '먹었습니다',       // Past tense
      ];

      for (const text of texts) {
        const result = await processor.analyzeText(text);
        expect(result.originalText).toBe(text);
        expect(result.wordCount).toBeGreaterThan(0);
      }
    });

    it('should normalize similar Hangul characters', async () => {
      // Test normalization of similar-looking characters
      const text1 = '한국어';
      const text2 = '한국어'; // Might use different Unicode composition
      
      const result1 = await processor.analyzeText(text1);
      const result2 = await processor.analyzeText(text2);
      
      // Results should be equivalent after normalization
      expect(result1.keywords).toEqual(result2.keywords);
    });
  });

  describe('Romanization', () => {
    it('should romanize Korean text using Revised Romanization', async () => {
      const text = '서울특별시';
      
      const result = await processor.analyzeText(text);
      
      expect(result.romanized).toBe('seoulteubyeolsi');
    });

    it('should romanize common Korean names and places', async () => {
      const testCases = [
        { korean: '김치', expected: 'gimchi' },
        { korean: '부산', expected: 'busan' },
        { korean: '한강', expected: 'hangang' },
        { korean: '청와대', expected: 'cheongwadae' },
      ];

      for (const testCase of testCases) {
        const result = await processor.analyzeText(testCase.korean);
        expect(result.romanized).toBe(testCase.expected);
      }
    });

    it('should handle mixed Korean-English text romanization', async () => {
      const text = '한국의 K-pop 문화';
      
      const result = await processor.analyzeText(text);
      
      expect(result.romanized).toContain('hangugui');
      expect(result.romanized).toContain('K-pop'); // Should preserve English
      expect(result.romanized).toContain('munhwa');
    });
  });

  describe('Stemming and Morphological Analysis', () => {
    it('should stem Korean verbs and adjectives', async () => {
      const text = '먹었습니다 좋습니다 갔습니다';
      
      const result = await processor.analyzeText(text);
      
      expect(result.stemmed).toEqual(expect.arrayContaining([
        '먹다', '좋다', '가다'
      ]));
    });

    it('should handle particles and postpositions', async () => {
      const text = '학교에서 공부를 합니다';
      
      const result = await processor.analyzeText(text);
      
      expect(result.stemmed).toEqual(expect.arrayContaining([
        '학교', '공부', '하다'
      ]));
      // Particles like '에서', '를' should be removed
      expect(result.stemmed).not.toContain('에서');
      expect(result.stemmed).not.toContain('를');
    });

    it('should recognize honorifics and formal endings', async () => {
      const text = '선생님께서 말씀하셨습니다';
      
      const result = await processor.analyzeText(text);
      
      expect(result.stemmed).toEqual(expect.arrayContaining([
        '선생님', '말씀'
      ]));
    });
  });

  describe('Keyword Extraction', () => {
    it('should extract relevant keywords from government text', async () => {
      const text = `
        국토교통부는 스마트시티 조성사업의 일환으로 
        인공지능과 IoT 기술을 활용한 교통관리시스템을 
        구축한다고 발표했습니다. 이번 사업은 시민의 
        교통편의 증진과 환경친화적 교통체계 구축을 
        목표로 하고 있습니다.
      `;
      
      const result = await processor.analyzeText(text);
      
      expect(result.keywords).toEqual(expect.arrayContaining([
        '국토교통부', '스마트시티', '인공지능', 'IoT', 
        '교통관리시스템', '시민', '교통', '환경'
      ]));
    });

    it('should rank keywords by importance', async () => {
      const text = `
        교육부 교육부 교육부는 새로운 교육정책을 발표했습니다.
        이번 정책은 학생들의 창의성 향상을 목표로 합니다.
      `;
      
      const result = await processor.analyzeText(text);
      
      // '교육부' should be the top keyword due to frequency
      expect(result.keywords[0]).toBe('교육부');
      expect(result.keywords).toContain('교육정책');
      expect(result.keywords).toContain('학생');
    });

    it('should filter out stop words and common particles', async () => {
      const text = '그리고 그러나 하지만 정부는 새로운 정책을 발표했습니다.';
      
      const result = await processor.analyzeText(text);
      
      // Stop words should be filtered out
      expect(result.keywords).not.toContain('그리고');
      expect(result.keywords).not.toContain('그러나');
      expect(result.keywords).not.toContain('하지만');
      
      // Important words should remain
      expect(result.keywords).toContain('정부');
      expect(result.keywords).toContain('정책');
    });
  });

  describe('Sentiment Analysis', () => {
    it('should detect positive sentiment', async () => {
      const text = '훌륭한 정책입니다. 매우 좋은 결과를 기대합니다.';
      
      const result = await processor.analyzeText(text);
      
      expect(result.sentiment).toBe('positive');
    });

    it('should detect negative sentiment', async () => {
      const text = '문제가 있는 정책입니다. 우려스러운 상황입니다.';
      
      const result = await processor.analyzeText(text);
      
      expect(result.sentiment).toBe('negative');
    });

    it('should detect neutral sentiment', async () => {
      const text = '정부는 새로운 정책을 발표했습니다. 관련 내용은 다음과 같습니다.';
      
      const result = await processor.analyzeText(text);
      
      expect(result.sentiment).toBe('neutral');
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle very long Korean texts efficiently', async () => {
      // Generate a long text
      const longText = '대한민국 정부의 새로운 정책 발표에 따른 국민들의 반응과 향후 전망에 대해 살펴보겠습니다. '.repeat(100);
      
      const startTime = Date.now();
      const result = await processor.analyzeText(longText);
      const processingTime = Date.now() - startTime;
      
      expect(processingTime).toBeLessThan(5000); // Should process within 5 seconds
      expect(result.wordCount).toBeGreaterThan(1000);
      expect(result.keywords).toBeDefined();
    });

    it('should handle special characters and punctuation', async () => {
      const text = '!@#$%^&*()한국어[]{}|\\:";\'<>?,./~`';
      
      const result = await processor.analyzeText(text);
      
      expect(result.keywords).toContain('한국어');
      expect(result.characterCount).toBe(text.length);
    });

    it('should handle numbers and dates in Korean text', async () => {
      const text = '2024년 1월 15일 정부는 새로운 정책을 발표했습니다.';
      
      const result = await processor.analyzeText(text);
      
      expect(result.keywords).toContain('정부');
      expect(result.keywords).toContain('정책');
      expect(result.originalText).toContain('2024년');
    });

    it('should maintain thread safety with concurrent processing', async () => {
      const texts = [
        '첫 번째 한국어 문장입니다.',
        '두 번째 한국어 문장입니다.',
        '세 번째 한국어 문장입니다.',
      ];

      const promises = texts.map(text => processor.analyzeText(text));
      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
        expect(result.originalText).toBe(texts[index]);
        expect(result.keywords).toBeDefined();
      });
    });
  });

  describe('Configuration Options', () => {
    it('should disable features when configured', async () => {
      const disabledConfig: KoreanConfig = {
        enabled: true,
        features: {
          stemming: false,
          romanization: false,
          hangulProcessing: true,
          keywordExtraction: true,
        },
      };

      const disabledProcessor = new KoreanTextProcessor({
        config: disabledConfig,
        logger: mockLogger,
      });

      const result = await disabledProcessor.analyzeText('한국어 테스트');
      
      expect(result.stemmed).toEqual([]); // Stemming disabled
      expect(result.romanized).toBe(''); // Romanization disabled
      expect(result.keywords).toBeDefined(); // Keyword extraction enabled
    });

    it('should handle processor disabled state', async () => {
      const disabledConfig: KoreanConfig = {
        enabled: false,
        features: {
          stemming: true,
          romanization: true,
          hangulProcessing: true,
          keywordExtraction: true,
        },
      };

      const disabledProcessor = new KoreanTextProcessor({
        config: disabledConfig,
        logger: mockLogger,
      });

      const result = await disabledProcessor.analyzeText('한국어 테스트');
      
      // Should return minimal analysis when disabled
      expect(result.originalText).toBe('한국어 테스트');
      expect(result.keywords).toEqual([]);
      expect(result.stemmed).toEqual([]);
      expect(result.romanized).toBe('');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed Korean text gracefully', async () => {
      // Text with incomplete Hangul characters
      const malformedText = 'ㅎㅏㄴㄱㅜㄱㅓ ㅌㅔㅅㅌㅡ';
      
      const result = await processor.analyzeText(malformedText);
      
      expect(result.originalText).toBe(malformedText);
      expect(result.wordCount).toBeGreaterThan(0);
    });

    it('should log warnings for processing errors', async () => {
      // Test with problematic input that might cause internal errors
      const problematicText = '\u0000\u0001\u0002한국어\uFFFF';
      
      await processor.analyzeText(problematicText);
      
      // Should handle gracefully without throwing
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Korean text processing'),
        expect.any(Object)
      );
    });

    it('should handle null and undefined inputs', async () => {
      const result1 = await processor.analyzeText(null as any);
      const result2 = await processor.analyzeText(undefined as any);
      
      expect(result1.originalText).toBe('');
      expect(result2.originalText).toBe('');
      expect(result1.keywords).toEqual([]);
      expect(result2.keywords).toEqual([]);
    });
  });
});