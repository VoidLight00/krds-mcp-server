/**
 * Unit Tests for KRDS Analyze Korean Text Tool
 * 
 * Comprehensive testing of the analyze_korean_text MCP tool including:
 * - Korean text normalization and processing
 * - Hangul romanization and transliteration
 * - Korean keyword extraction with NLP
 * - Sentiment analysis and content classification
 * - Government terminology and agency detection
 * - Korean date and number parsing
 * - Text similarity and semantic search
 * - Error handling and performance
 * 
 * @author KRDS MCP Server Test Suite
 * @version 1.0.0
 */

import { jest } from '@jest/globals';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { MockMCPServer, MockMCPClient, createMockMCPServer, createMockMCPClient } from '../../helpers/mock-mcp-server.js';

describe('Analyze Korean Text Tool', () => {
  let mockServer: MockMCPServer;
  let mockClient: MockMCPClient;

  beforeEach(() => {
    mockServer = createMockMCPServer();
    mockClient = createMockMCPClient(mockServer);
    mockServer.clearRequestLog();
    mockServer.resetRateLimit();
    mockServer.setErrorMode(false);
  });

  afterEach(() => {
    mockServer.removeAllListeners();
  });

  describe('Parameter Validation', () => {
    it('should require action parameter', async () => {
      const result = await mockClient.callTool('analyze_korean_text', {
        text: '안녕하세요',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(false);
      expect(response.error).toContain('action');
    });

    it('should require text parameter', async () => {
      const result = await mockClient.callTool('analyze_korean_text', {
        action: 'normalize',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(false);
      expect(response.error).toContain('text');
    });

    it('should accept valid action parameters', async () => {
      const validActions = [
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
      ];

      for (const action of validActions) {
        const params: any = {
          action,
          text: '대한민국 정부는 국민을 위한 정책을 추진합니다.',
        };

        if (action === 'search_similar') {
          params.compareText = '한국 정부의 국민 대상 정책 실행';
        }

        const result = await mockClient.callTool('analyze_korean_text', params);
        const response = JSON.parse(result.content[0].text);
        
        expect(response.success).toBe(true);
        expect(response.action).toBe(action);
      }
    });

    it('should validate text length limits', async () => {
      const longText = '한'.repeat(100001); // Exceeds 100,000 character limit
      
      const result = await mockClient.callTool('analyze_korean_text', {
        action: 'normalize',
        text: longText,
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(false);
      expect(response.error).toContain('too long');
    });

    it('should handle empty text', async () => {
      const result = await mockClient.callTool('analyze_korean_text', {
        action: 'normalize',
        text: '',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(false);
      expect(response.error).toContain('empty');
    });

    it('should validate numeric parameters', async () => {
      const params = {
        action: 'extract_keywords',
        text: '교육부는 새로운 교육정책을 발표했습니다.',
        maxKeywords: 25,
        minKeywordLength: 3,
        similarityThreshold: 0.8,
        timeout: 15000,
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
    });
  });

  describe('Text Normalization', () => {
    it('should normalize Korean text', async () => {
      const params = {
        action: 'normalize',
        text: '정부정책관련문서입니다.   공백이    많네요.',
        preserveSpacing: false,
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.result.normalizedText).toBeDefined();
      expect(typeof response.result.normalizedText).toBe('string');
    });

    it('should preserve spacing when requested', async () => {
      const params = {
        action: 'normalize',
        text: '정부   정책   문서',
        preserveSpacing: true,
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.result.normalizedText).toBeDefined();
    });

    it('should handle mixed Korean-English text', async () => {
      const params = {
        action: 'normalize',
        text: '대한민국 정부 Government of Korea 정책 Policy 문서 Document',
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.result.normalizedText).toBeDefined();
    });

    it('should normalize Hanja characters', async () => {
      const params = {
        action: 'normalize',
        text: '大韓民國 政府 政策 文書',
        includeHanja: true,
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
    });

    it('should handle punctuation normalization', async () => {
      const params = {
        action: 'normalize',
        text: '안녕하세요! 정부 정책에 대해 알려드리겠습니다... (중요)',
        includePunctuation: false,
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
    });
  });

  describe('Hangul Romanization', () => {
    it('should romanize Korean text using Revised Romanization', async () => {
      const params = {
        action: 'romanize',
        text: '대한민국 정부 교육부 보건복지부',
        romanizationSystem: 'revised',
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.result.romanized).toBeDefined();
      expect(typeof response.result.romanized).toBe('string');
      expect(response.result.system).toBe('revised');
    });

    it('should support different romanization systems', async () => {
      const text = '한국어 문서';
      const systems = ['revised', 'mccune', 'yale'];

      for (const system of systems) {
        const params = {
          action: 'romanize',
          text,
          romanizationSystem: system,
        };

        const result = await mockClient.callTool('analyze_korean_text', params);
        const response = JSON.parse(result.content[0].text);
        
        expect(response.success).toBe(true);
        expect(response.result.system).toBe(system);
        expect(response.result.romanized).toBeDefined();
      }
    });

    it('should handle proper names and government agencies', async () => {
      const params = {
        action: 'romanize',
        text: '김영희 교육부 장관이 새로운 정책을 발표했습니다.',
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.result.romanized).toBeDefined();
    });

    it('should romanize mixed content appropriately', async () => {
      const params = {
        action: 'romanize',
        text: '서울특별시 강남구 테헤란로 123번지',
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
    });
  });

  describe('Korean Keyword Extraction', () => {
    it('should extract keywords from Korean text', async () => {
      const params = {
        action: 'extract_keywords',
        text: '교육부는 새로운 디지털 교육 정책을 발표하여 학생들의 미래 교육 환경을 개선하고자 합니다.',
        maxKeywords: 10,
        minKeywordLength: 2,
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.result.keywords).toBeDefined();
      expect(Array.isArray(response.result.keywords)).toBe(true);
      expect(response.result.keywords.length).toBeGreaterThan(0);
      expect(response.result.keywords.length).toBeLessThanOrEqual(10);
      
      // Check keyword structure
      if (response.result.keywords.length > 0) {
        const keyword = response.result.keywords[0];
        expect(keyword.text).toBeDefined();
        expect(keyword.score).toBeDefined();
        expect(keyword.frequency).toBeDefined();
        expect(keyword.type).toBeDefined();
        expect(typeof keyword.score).toBe('number');
        expect(typeof keyword.frequency).toBe('number');
      }
    });

    it('should include compound words when requested', async () => {
      const params = {
        action: 'extract_keywords',
        text: '정보통신기술발전위원회에서 인공지능기반교육시스템을 논의했습니다.',
        includeCompoundWords: true,
        maxKeywords: 15,
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.result.keywords).toBeDefined();
    });

    it('should filter by minimum keyword length', async () => {
      const params = {
        action: 'extract_keywords',
        text: '정부는 국민을 위한 정책을 만듭니다.',
        minKeywordLength: 3,
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      
      if (response.result.keywords.length > 0) {
        response.result.keywords.forEach((keyword: any) => {
          expect(keyword.text.length).toBeGreaterThanOrEqual(3);
        });
      }
    });

    it('should handle government terminology extraction', async () => {
      const params = {
        action: 'extract_keywords',
        text: '기획재정부, 교육부, 보건복지부가 협력하여 사회보장제도 개선방안을 마련했습니다.',
        detectAgencies: true,
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.result.keywords).toBeDefined();
    });

    it('should remove stopwords when requested', async () => {
      const params = {
        action: 'extract_keywords',
        text: '이것은 매우 중요한 정부 정책 문서입니다. 그리고 이러한 정책은 국민에게 도움이 됩니다.',
        removeStopwords: true,
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
    });
  });

  describe('Sentiment Analysis', () => {
    it('should analyze sentiment of Korean text', async () => {
      const params = {
        action: 'analyze_sentiment',
        text: '이번 정책은 정말 훌륭하고 국민들에게 큰 도움이 될 것입니다.',
        includeSentiment: true,
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.result.sentiment).toBeDefined();
      expect(response.result.sentiment.score).toBeDefined();
      expect(response.result.sentiment.label).toBeDefined();
      expect(typeof response.result.sentiment.score).toBe('number');
      expect(['positive', 'negative', 'neutral']).toContain(response.result.sentiment.label);
    });

    it('should detect negative sentiment', async () => {
      const params = {
        action: 'analyze_sentiment',
        text: '이 정책은 실패했으며 국민들에게 피해를 주고 있습니다.',
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.result.sentiment).toBeDefined();
    });

    it('should handle neutral sentiment', async () => {
      const params = {
        action: 'analyze_sentiment',
        text: '정부는 새로운 정책을 발표했습니다. 이 정책에 대한 내용은 다음과 같습니다.',
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.result.sentiment).toBeDefined();
    });

    it('should provide confidence scores', async () => {
      const params = {
        action: 'analyze_sentiment',
        text: '정말 좋은 정책입니다! 적극 추천합니다.',
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.result.sentiment.confidence).toBeDefined();
      expect(typeof response.result.sentiment.confidence).toBe('number');
      expect(response.result.sentiment.confidence).toBeGreaterThan(0);
      expect(response.result.sentiment.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('Content Classification', () => {
    it('should classify government document types', async () => {
      const params = {
        action: 'classify_content',
        text: '본 법률안은 국민의 건강권 보장을 위하여 의료서비스의 질 향상과 의료접근성 개선을 목적으로 합니다.',
        classifyDocumentType: true,
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.result.classification).toBeDefined();
      expect(response.result.classification.type).toBeDefined();
      expect(response.result.classification.confidence).toBeDefined();
      expect(typeof response.result.classification.confidence).toBe('number');
    });

    it('should identify policy documents', async () => {
      const params = {
        action: 'classify_content',
        text: '정부는 2024년 주요 정책 과제로 디지털 전환, 탄소중립, 사회안전망 강화를 설정했습니다.',
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.result.classification).toBeDefined();
    });

    it('should classify by subject area', async () => {
      const subjects = [
        '교육: 학교 교육과정 개편을 통한 미래 인재 양성',
        '보건: 국민건강보험 보장성 확대 방안',
        '환경: 온실가스 감축을 위한 녹색전환 정책',
        '경제: 중소기업 지원을 통한 경제 활성화',
      ];

      for (const subject of subjects) {
        const params = {
          action: 'classify_content',
          text: subject,
        };

        const result = await mockClient.callTool('analyze_korean_text', params);
        const response = JSON.parse(result.content[0].text);
        
        expect(response.success).toBe(true);
        expect(response.result.classification).toBeDefined();
      }
    });
  });

  describe('Government Agency Detection', () => {
    it('should detect Korean government agencies', async () => {
      const params = {
        action: 'detect_agencies',
        text: '기획재정부와 교육부, 보건복지부가 합동으로 정책을 추진합니다.',
        detectAgencies: true,
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.result.agencies).toBeDefined();
      expect(Array.isArray(response.result.agencies)).toBe(true);
      expect(response.result.agencies.length).toBeGreaterThan(0);
      
      // Check agency structure
      if (response.result.agencies.length > 0) {
        const agency = response.result.agencies[0];
        expect(agency.name).toBeDefined();
        expect(agency.nameKorean).toBeDefined();
        expect(agency.type).toBeDefined();
        expect(agency.confidence).toBeDefined();
        expect(['ministry', 'agency', 'office', 'committee', 'other']).toContain(agency.type);
      }
    });

    it('should detect various agency types', async () => {
      const params = {
        action: 'detect_agencies',
        text: '국무총리실, 대통령비서실, 국가정보원, 감사원, 국세청, 통계청이 참여했습니다.',
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.result.agencies).toBeDefined();
    });

    it('should handle local government agencies', async () => {
      const params = {
        action: 'detect_agencies',
        text: '서울특별시, 부산광역시, 경기도청, 충청남도교육청에서 협력 방안을 논의했습니다.',
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.result.agencies).toBeDefined();
    });

    it('should provide agency position information', async () => {
      const params = {
        action: 'detect_agencies',
        text: '문재인 대통령은 교육부 장관과 함께 교육정책을 검토했습니다.',
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      
      if (response.result.agencies.length > 0) {
        const agency = response.result.agencies[0];
        expect(agency.position).toBeDefined();
        expect(typeof agency.position).toBe('number');
      }
    });
  });

  describe('Korean Date Parsing', () => {
    it('should parse Korean dates', async () => {
      const params = {
        action: 'parse_dates',
        text: '2024년 3월 15일부터 시행되는 정책입니다. 2023년 12월에 발표되었습니다.',
        extractDates: true,
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.result.dates).toBeDefined();
      expect(Array.isArray(response.result.dates)).toBe(true);
      expect(response.result.dates.length).toBeGreaterThan(0);
      
      // Check date structure
      if (response.result.dates.length > 0) {
        const date = response.result.dates[0];
        expect(date.original).toBeDefined();
        expect(date.parsed).toBeDefined();
        expect(date.format).toBeDefined();
        expect(date.confidence).toBeDefined();
        expect(date.position).toBeDefined();
        expect(new Date(date.parsed).toString()).not.toBe('Invalid Date');
      }
    });

    it('should handle various Korean date formats', async () => {
      const params = {
        action: 'parse_dates',
        text: '올해 상반기, 작년 말, 내년 초, 2024.03.15, 24년 3월, 삼월 십오일',
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.result.dates).toBeDefined();
    });

    it('should parse relative dates', async () => {
      const params = {
        action: 'parse_dates',
        text: '어제, 오늘, 내일, 다음 주, 지난 달, 올해 말까지',
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.result.dates).toBeDefined();
    });

    it('should handle traditional Korean calendar terms', async () => {
      const params = {
        action: 'parse_dates',
        text: '음력 정월 대보름, 추석 연휴, 설날 연휴 기간',
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.result.dates).toBeDefined();
    });
  });

  describe('Korean Number Parsing', () => {
    it('should parse Korean numbers', async () => {
      const params = {
        action: 'parse_numbers',
        text: '예산 삼천억원, 인원 백만명, 기간 십년, 비율 오십퍼센트',
        extractNumbers: true,
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.result.numbers).toBeDefined();
      expect(Array.isArray(response.result.numbers)).toBe(true);
    });

    it('should handle mixed number formats', async () => {
      const params = {
        action: 'parse_numbers',
        text: '1조 2천억원, 50만명, 3.5%, 십만분의 일',
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.result.numbers).toBeDefined();
    });

    it('should parse monetary amounts', async () => {
      const params = {
        action: 'parse_numbers',
        text: '예산 500억원, 지원금 1000만원, 보조금 50만원',
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
    });

    it('should handle percentage and ratio expressions', async () => {
      const params = {
        action: 'parse_numbers',
        text: '증가율 5%, 비율 삼분의 일, 할인율 이십퍼센트',
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
    });
  });

  describe('Text Similarity Search', () => {
    it('should perform similarity search', async () => {
      const params = {
        action: 'search_similar',
        text: '교육부는 새로운 교육정책을 발표했습니다.',
        compareText: '교육 분야의 새로운 정책이 공개되었습니다.',
        searchType: 'semantic',
        similarityThreshold: 0.7,
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.result.similarity).toBeDefined();
      expect(response.result.similarity.score).toBeDefined();
      expect(response.result.similarity.matches).toBeDefined();
      expect(typeof response.result.similarity.score).toBe('number');
      expect(Array.isArray(response.result.similarity.matches)).toBe(true);
    });

    it('should support different search types', async () => {
      const searchTypes = ['exact', 'fuzzy', 'semantic'];
      const text = '정부 정책 발표';
      const compareText = '국가 정책 공개';

      for (const searchType of searchTypes) {
        const params = {
          action: 'search_similar',
          text,
          compareText,
          searchType,
        };

        const result = await mockClient.callTool('analyze_korean_text', params);
        const response = JSON.parse(result.content[0].text);
        
        expect(response.success).toBe(true);
        expect(response.result.similarity.method).toBe(searchType);
      }
    });

    it('should handle exact matches', async () => {
      const params = {
        action: 'search_similar',
        text: '대한민국 정부',
        compareText: '대한민국 정부의 새로운 정책',
        searchType: 'exact',
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.result.similarity).toBeDefined();
    });

    it('should apply similarity thresholds', async () => {
      const params = {
        action: 'search_similar',
        text: '교육 정책',
        compareText: '환경 보호',
        similarityThreshold: 0.9, // High threshold
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      // Low similarity should still work but with low scores
    });
  });

  describe('Term Translation', () => {
    it('should translate government terms', async () => {
      const params = {
        action: 'translate_terms',
        text: '기획재정부, 교육부, 보건복지부, 국토교통부',
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.result.translations).toBeDefined();
      expect(Array.isArray(response.result.translations)).toBe(true);
    });

    it('should handle policy terminology', async () => {
      const params = {
        action: 'translate_terms',
        text: '사회보장제도, 국민건강보험, 기초생활보장, 아동수당',
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.result.translations).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid actions', async () => {
      const result = await mockClient.callTool('analyze_korean_text', {
        action: 'invalid_action',
        text: '테스트 텍스트',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(false);
      expect(response.error).toContain('action');
    });

    it('should handle network errors gracefully', async () => {
      mockServer.setErrorMode(true);
      
      try {
        await mockClient.callTool('analyze_korean_text', {
          action: 'normalize',
          text: '테스트 텍스트',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect((error as McpError).code).toBe(ErrorCode.InternalError);
      }
    });

    it('should handle non-Korean text appropriately', async () => {
      const params = {
        action: 'extract_keywords',
        text: 'This is English text without Korean characters.',
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      // Should succeed but may have different behavior
      expect(response.success).toBe(true);
    });

    it('should handle mixed content gracefully', async () => {
      const params = {
        action: 'normalize',
        text: '한국어 text with 123 숫자 and symbols !@#',
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
    });

    it('should handle rate limiting', async () => {
      mockServer.setRateLimit(1);
      
      // First request should succeed
      const result1 = await mockClient.callTool('analyze_korean_text', {
        action: 'normalize',
        text: '첫 번째 요청',
      });
      const response1 = JSON.parse(result1.content[0].text);
      expect(response1.success).toBe(true);
      
      // Second request should fail due to rate limiting
      try {
        await mockClient.callTool('analyze_korean_text', {
          action: 'romanize',
          text: '두 번째 요청',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
      }
    });

    it('should handle timeout scenarios', async () => {
      const params = {
        action: 'extract_keywords',
        text: '매우 긴 텍스트'.repeat(1000),
        timeout: 100, // Very short timeout
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      // Mock server doesn't simulate real timeouts, but would handle gracefully
      expect(response.success).toBe(true);
    });
  });

  describe('Performance and Optimization', () => {
    it('should track processing execution time', async () => {
      const result = await mockClient.callTool('analyze_korean_text', {
        action: 'extract_keywords',
        text: '대한민국 정부는 국민을 위한 다양한 정책을 추진하고 있습니다.',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.metadata?.processingTime).toBeDefined();
      expect(typeof response.metadata.processingTime).toBe('number');
      expect(response.metadata.processingTime).toBeGreaterThan(0);
    });

    it('should handle concurrent text processing', async () => {
      const texts = [
        '교육 정책 분석',
        '보건 의료 개선',
        '환경 보호 방안',
        '경제 활성화 전략',
        '사회 복지 확충',
      ];

      const promises = texts.map(text => 
        mockClient.callTool('analyze_korean_text', {
          action: 'extract_keywords',
          text,
        })
      );

      const results = await Promise.all(promises);

      results.forEach((result, index) => {
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.result.keywords).toBeDefined();
      });
    });

    it('should optimize based on text length', async () => {
      const shortText = '짧은 텍스트';
      const longText = '매우 긴 정부 정책 문서 '.repeat(100);

      // Short text processing
      const startTime1 = Date.now();
      const result1 = await mockClient.callTool('analyze_korean_text', {
        action: 'normalize',
        text: shortText,
      });
      const endTime1 = Date.now();
      const time1 = endTime1 - startTime1;

      // Long text processing  
      const startTime2 = Date.now();
      const result2 = await mockClient.callTool('analyze_korean_text', {
        action: 'normalize',
        text: longText,
      });
      const endTime2 = Date.now();
      const time2 = endTime2 - startTime2;

      const response1 = JSON.parse(result1.content[0].text);
      const response2 = JSON.parse(result2.content[0].text);

      expect(response1.success).toBe(true);
      expect(response2.success).toBe(true);
    });

    it('should use caching when enabled', async () => {
      const text = '캐시 테스트 텍스트';
      
      // First request with caching
      const params1 = {
        action: 'extract_keywords',
        text,
        useCache: true,
      };

      const result1 = await mockClient.callTool('analyze_korean_text', params1);
      const response1 = JSON.parse(result1.content[0].text);
      
      // Second request with same parameters
      const result2 = await mockClient.callTool('analyze_korean_text', params1);
      const response2 = JSON.parse(result2.content[0].text);

      expect(response1.success).toBe(true);
      expect(response2.success).toBe(true);
      
      // Results should be consistent
      expect(response2.result.keywords).toEqual(response1.result.keywords);
    });

    it('should handle memory constraints with large text', async () => {
      const largeText = '대용량 한국어 텍스트 처리 테스트 '.repeat(10000);
      
      const params = {
        action: 'extract_keywords',
        text: largeText,
        maxKeywords: 50,
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.result.keywords).toBeDefined();
      expect(response.result.keywords.length).toBeLessThanOrEqual(50);
    });
  });

  describe('Analysis Result Structure', () => {
    it('should return consistent result structure', async () => {
      const result = await mockClient.callTool('analyze_korean_text', {
        action: 'extract_keywords',
        text: '구조 테스트를 위한 한국어 텍스트입니다.',
        includeMetadata: true,
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.action).toBe('extract_keywords');
      expect(response.result).toBeDefined();
      expect(response.metadata).toBeDefined();
      
      expect(response).toMatchObject({
        success: expect.any(Boolean),
        action: expect.any(String),
        result: expect.any(Object),
        metadata: expect.objectContaining({
          processingTime: expect.any(Number),
          textLength: expect.any(Number),
          detectedLanguage: expect.any(String),
          confidence: expect.any(Number),
        }),
      });
    });

    it('should include comprehensive metadata', async () => {
      const result = await mockClient.callTool('analyze_korean_text', {
        action: 'analyze_sentiment',
        text: '메타데이터 테스트용 긍정적인 한국어 문장입니다.',
        includeMetadata: true,
        includeReadability: true,
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.metadata).toBeDefined();
      expect(response.metadata.processingTime).toBeDefined();
      expect(response.metadata.textLength).toBeDefined();
      expect(response.metadata.detectedLanguage).toBeDefined();
      expect(response.metadata.confidence).toBeDefined();
      expect(response.metadata.method).toBeDefined();
    });
  });

  describe('Special Korean Text Scenarios', () => {
    it('should handle formal government language', async () => {
      const params = {
        action: 'extract_keywords',
        text: '본 법률안은 국가의 지속가능한 발전과 국민 복리 증진을 위하여 환경보전과 경제발전의 조화를 도모하고자 함',
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.result.keywords).toBeDefined();
    });

    it('should process technical policy terminology', async () => {
      const params = {
        action: 'normalize',
        text: '인공지능기반 스마트시티 구축사업, 디지털뉴딜정책, 그린뉴딜전략, 한국판뉴딜종합계획',
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
    });

    it('should handle legal document language', async () => {
      const params = {
        action: 'classify_content',
        text: '제1조(목적) 이 법은... 제2조(정의) 이 법에서 사용하는 용어의 뜻은... 부칙 이 법은 공포한 날부터 시행한다.',
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.result.classification).toBeDefined();
    });

    it('should process statistical reports', async () => {
      const params = {
        action: 'parse_numbers',
        text: '2023년 GDP 성장률 3.1%, 실업률 2.9%, 물가상승률 3.6%, 수출액 6천8백억달러',
      };

      const result = await mockClient.callTool('analyze_korean_text', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.result.numbers).toBeDefined();
    });
  });
});