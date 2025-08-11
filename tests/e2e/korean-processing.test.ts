/**
 * Korean Text Processing End-to-End Tests
 * 
 * Comprehensive E2E tests for Korean language processing capabilities:
 * - Real-world Korean government document processing
 * - Complex Korean text analysis scenarios
 * - Performance benchmarks for Korean text
 * - Unicode and encoding edge cases
 * 
 * @author KRDS MCP Server
 * @version 1.0.0
 */

import { jest } from '@jest/globals';
import { KoreanTextProcessor } from '@/parsing/korean-text-processor.js';
import { ContentParser } from '@/parsing/content-parser.js';
import { KrdsScraper } from '@/scraping/krds-scraper.js';
import { CacheManager } from '@/cache/cache-manager.js';
import type { KoreanConfig, CacheConfig, ScrapingConfig } from '@/types/index.js';
import { createMockLogger } from '../helpers/test-helpers.js';
import { promises as fs } from 'fs';
import path from 'path';

describe('Korean Text Processing E2E', () => {
  let koreanProcessor: KoreanTextProcessor;
  let contentParser: ContentParser;
  let cacheManager: CacheManager;
  let mockLogger: any;

  beforeAll(async () => {
    mockLogger = createMockLogger();

    const koreanConfig: KoreanConfig = {
      enabled: true,
      features: {
        stemming: true,
        romanization: true,
        hangulProcessing: true,
        keywordExtraction: true,
      },
    };

    const cacheConfig: CacheConfig = {
      type: 'memory',
      ttl: 3600,
      maxSize: 1024 * 1024 * 10, // 10MB
    };

    cacheManager = new CacheManager({
      config: cacheConfig,
      logger: mockLogger,
    });
    await cacheManager.initialize();

    koreanProcessor = new KoreanTextProcessor({
      config: koreanConfig,
      logger: mockLogger,
    });

    contentParser = new ContentParser({
      koreanProcessor,
      logger: mockLogger,
    });
  });

  afterAll(async () => {
    await cacheManager.shutdown();
  });

  describe('Real Korean Government Documents', () => {
    it('should process Ministry of Education policy document', async () => {
      const educationPolicyText = `
        교육부 공고 제2024-15호
        
        대한민국 교육부(이하 "교육부")는 「초·중등교육법」 제23조 및 같은 법 시행령 제50조에 
        따라 2024년도 교육과정 개정 방안을 다음과 같이 공고합니다.
        
        1. 개정 목적
        가. 미래 사회에 필요한 핵심역량 함양
        나. 학습자 맞춤형 교육과정 구현
        다. 창의적 사고력과 문제해결능력 신장
        
        2. 주요 개정 내용
        가. 디지털 리터러시 교육 강화
        나. 융합(STEAM) 교육과정 확대
        다. 인공지능(AI) 교육 도입
        라. 생태전환 교육 내실화
        
        3. 추진 일정
        - 2024. 3월: 교육과정 개정 연구위원회 구성
        - 2024. 6월: 개정 교육과정(안) 개발 완료
        - 2024. 9월: 공청회 및 의견수렴
        - 2024. 12월: 고시 예정
        
        ※ 문의사항이 있으시면 교육부 교육과정정책과(전화: 044-203-6000)로 연락하시기 바랍니다.
        
        2024년 1월 15일
        교육부장관 이주호
      `;

      const analysis = await koreanProcessor.analyzeText(educationPolicyText);

      // Verify comprehensive analysis
      expect(analysis.originalText).toBe(educationPolicyText);
      expect(analysis.wordCount).toBeGreaterThan(100);
      expect(analysis.characterCount).toBeGreaterThan(500);

      // Check Korean keyword extraction
      expect(analysis.keywords).toEqual(expect.arrayContaining([
        '교육부', '교육과정', '개정', '학습자', '창의적', 
        '디지털', '인공지능', 'AI', '교육'
      ]));

      // Verify government-specific terms
      expect(analysis.keywords).toEqual(expect.arrayContaining([
        '공고', '시행령', '정책', '장관'
      ]));

      // Check romanization quality
      expect(analysis.romanized).toContain('gyoyugbu');
      expect(analysis.romanized).toContain('gaejeong');
      expect(analysis.romanized).toContain('hagseunja');

      // Verify stemming results
      expect(analysis.stemmed).toEqual(expect.arrayContaining([
        '교육', '개정', '구현', '신장', '강화', '확대', '도입'
      ]));

      // Check sentiment analysis
      expect(analysis.sentiment).toBe('positive'); // Policy announcements are typically positive

      // Verify readability score
      expect(analysis.readabilityScore).toBeDefined();
      expect(analysis.readabilityScore).toBeGreaterThan(0);
    });

    it('should process Ministry of Health and Welfare document', async () => {
      const healthPolicyText = `
        보건복지부는 코로나19 팬데믹 이후 국민건강증진을 위한 종합계획을 수립하여 발표하였다.
        
        이번 계획의 주요 내용은 다음과 같다:
        
        ◎ 감염병 대응체계 강화
        - 질병관리청과의 협력체계 구축
        - 의료진 전문성 향상 프로그램 운영
        - 백신 개발 및 생산 역량 확충
        
        ◎ 디지털 헬스케어 활성화
        - 원격의료 서비스 확대
        - 헬스케어 빅데이터 플랫폼 구축
        - AI 기반 진단·치료 시스템 도입
        
        ◎ 건강격차 해소
        - 취약계층 의료접근성 개선
        - 지역 간 의료서비스 격차 완화
        - 만성질환 관리체계 고도화
        
        이 계획은 2024년부터 2028년까지 5년간 시행되며, 총 예산 15조원이 투입될 예정이다.
        
        보건복지부 관계자는 "이번 종합계획을 통해 모든 국민이 건강한 삶을 누릴 수 있는 
        기반을 마련하겠다"고 밝혔다.
      `;

      const analysis = await koreanProcessor.analyzeText(healthPolicyText);

      // Verify health-specific keyword extraction
      expect(analysis.keywords).toEqual(expect.arrayContaining([
        '보건복지부', '코로나19', '팬데믹', '국민건강', '감염병',
        '질병관리청', '의료진', '백신', '원격의료', '헬스케어',
        '빅데이터', '진단', '치료', '취약계층', '만성질환'
      ]));

      // Check for technical terms in romanization
      expect(analysis.romanized).toContain('paendemig');
      expect(analysis.romanized).toContain('baegsin');
      expect(analysis.romanized).toContain('helseukeeo');

      // Verify proper handling of mixed Korean-English terms
      expect(analysis.keywords).toContain('AI');
      expect(analysis.keywords).toContain('빅데이터');

      // Check sentiment (health policy should be positive/neutral)
      expect(['positive', 'neutral']).toContain(analysis.sentiment);
    });

    it('should handle legal document format', async () => {
      const legalText = `
        국가공무원법 시행령
        [시행 2024. 1. 1.] [대통령령 제33000호, 2023. 12. 29., 일부개정]
        
        제1장 총칙
        
        제1조(목적) 이 영은 「국가공무원법」에서 위임된 사항과 그 시행에 필요한 사항을 규정함을 목적으로 한다.
        
        제2조(정의) 이 영에서 사용하는 용어의 뜻은 다음과 같다.
        1. "임용권자"란 공무원의 임용에 관한 권한을 가진 자를 말한다.
        2. "임용"이란 신규채용, 승진, 전보, 겸임, 파견, 강임, 휴직, 복직 및 면직을 말한다.
        3. "근무성적"이란 공무원이 맡은 직무를 수행함에 있어서 나타내는 근무실적과 근무태도를 종합한 것을 말한다.
        
        제3조(적용범위) 이 영은 「국가공무원법」 제2조에 따른 국가공무원에게 적용한다.
        다만, 다른 법령에서 달리 정한 경우에는 그에 따른다.
        
        부칙 <대통령령 제33000호, 2023. 12. 29.>
        이 영은 2024년 1월 1일부터 시행한다.
      `;

      const analysis = await koreanProcessor.analyzeText(legalText);

      // Legal-specific keywords
      expect(analysis.keywords).toEqual(expect.arrayContaining([
        '공무원법', '시행령', '대통령령', '개정', '임용권자',
        '임용', '신규채용', '승진', '전보', '근무성적', '적용범위'
      ]));

      // Legal document structure terms
      expect(analysis.keywords).toEqual(expect.arrayContaining([
        '총칙', '목적', '정의', '부칙'
      ]));

      // Verify proper handling of legal terminology
      expect(analysis.stemmed).toEqual(expect.arrayContaining([
        '규정', '권한', '수행', '적용', '시행'
      ]));

      // Legal documents tend to be neutral in sentiment
      expect(analysis.sentiment).toBe('neutral');
    });
  });

  describe('Complex Korean Text Scenarios', () => {
    it('should handle old Korean (한문) mixed with modern Korean', async () => {
      const mixedText = `
        大韓民國 정부는 弘益人間(홍익인간)의 理念(이념) 아래 
        모든 國民(국민)이 人間(인간)으로서의 尊嚴(존엄)과 價値(가치)를 
        가지며 幸福(행복)을 追求(추구)할 權利(권리)를 보장한다.
        
        이는 憲法(헌법) 第1條(제1조)에서 明示(명시)한 바와 같이 
        대한민국이 民主共和國(민주공화국)임을 확인하는 것이다.
      `;

      const analysis = await koreanProcessor.analyzeText(mixedText);

      // Should extract both Hanja and Hangul keywords
      expect(analysis.keywords).toEqual(expect.arrayContaining([
        '대한민국', '정부', '홍익인간', '이념', '국민',
        '인간', '존엄', '가치', '행복', '추구', '권리',
        '헌법', '명시', '민주공화국'
      ]));

      // Romanization should handle Korean parts
      expect(analysis.romanized).toContain('daehanmingug');
      expect(analysis.romanized).toContain('jeongbu');

      expect(analysis.wordCount).toBeGreaterThan(20);
    });

    it('should process scientific/technical Korean text', async () => {
      const technicalText = `
        한국과학기술원(KAIST) 연구팀이 개발한 차세대 양자컴퓨터는 
        기존의 실리콘 기반 반도체와는 다른 원리로 작동한다.
        
        이 양자컴퓨터는 큐비트(qubit)라는 양자정보의 기본단위를 이용하여
        중첩(superposition)과 얽힘(entanglement) 현상을 활용한다.
        
        연구 결과에 따르면, 이 시스템은 기존 컴퓨터 대비 10^6배 빠른 
        연산 속도를 보였으며, 특히 암호화 알고리즘 해독 분야에서 
        혁신적인 성능을 입증했다.
        
        연구책임자 김박사는 "이번 성과는 4차 산업혁명의 핵심기술인 
        인공지능(AI), 사물인터넷(IoT), 빅데이터 처리에 획기적인 
        변화를 가져올 것"이라고 전망했다.
      `;

      const analysis = await koreanProcessor.analyzeText(technicalText);

      // Technical keywords including English abbreviations
      expect(analysis.keywords).toEqual(expect.arrayContaining([
        'KAIST', '양자컴퓨터', '실리콘', '반도체', '큐비트',
        'qubit', '중첩', 'superposition', '얽힘', 'entanglement',
        '암호화', '알고리즘', '4차', '산업혁명', 'AI', '인공지능',
        'IoT', '사물인터넷', '빅데이터'
      ]));

      // Scientific notation and numbers
      expect(analysis.originalText).toContain('10^6');

      // Mixed terminology handling
      expect(analysis.romanized).toContain('yangjakeompyuteo');
      expect(analysis.romanized).toContain('sillikog');
    });

    it('should handle regional dialects and variations', async () => {
      const dialectText = `
        부산 사투리: "뭐하노? 밥 먹었나?"
        제주 방언: "어서 옵서예. 어디 감수광?"
        전라도 사투리: "뭣하러 왔노? 그냥 가지 말고 밥이나 먹고 가라잉."
        경상도 사투리: "야 이놈아, 어디 가노? 같이 가자 아이가."
        강원도 사투리: "어디 가는 기야? 조심해서 다녀와라."
        
        이러한 지역별 방언은 우리나라 언어문화의 다양성을 보여주는 
        중요한 문화유산이다.
      `;

      const analysis = await koreanProcessor.analyzeText(dialectText);

      // Should extract both dialect and standard Korean
      expect(analysis.keywords).toEqual(expect.arrayContaining([
        '사투리', '방언', '부산', '제주', '전라도', '경상도', '강원도',
        '지역별', '언어문화', '다양성', '문화유산'
      ]));

      // Should handle dialect-specific particles and endings
      expect(analysis.wordCount).toBeGreaterThan(30);
      expect(analysis.characterCount).toBeGreaterThan(100);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should process large Korean document efficiently', async () => {
      // Create a large Korean text (approximately 10,000 characters)
      const baseText = `
        대한민국 정부는 지속가능한 발전을 위한 종합적인 정책을 수립하고 있습니다. 
        이는 경제성장과 환경보호를 동시에 추구하는 녹색성장 전략의 일환으로, 
        신재생에너지 보급 확대, 에너지 효율성 향상, 친환경 기술개발 등을 
        핵심 과제로 설정하고 있습니다. 특히 탄소중립 실현을 위해 2050년까지 
        온실가스 순배출량을 '0'으로 만드는 목표를 제시했습니다.
      `;
      
      const largeText = baseText.repeat(20); // About 10,000 characters

      const startTime = Date.now();
      const analysis = await koreanProcessor.analyzeText(largeText);
      const processingTime = Date.now() - startTime;

      console.log(`Processed ${largeText.length} characters in ${processingTime}ms`);
      console.log(`Processing rate: ${Math.round(largeText.length / processingTime)} chars/ms`);

      // Performance expectations
      expect(processingTime).toBeLessThan(5000); // Should process within 5 seconds
      expect(analysis.wordCount).toBeGreaterThan(1500);
      expect(analysis.keywords.length).toBeGreaterThan(20);
      expect(analysis.stemmed.length).toBeGreaterThan(100);
    });

    it('should handle concurrent Korean text processing', async () => {
      const texts = [
        '교육부의 새로운 교육정책 발표',
        '보건복지부 의료서비스 개선 방안',
        '국토교통부 스마트시티 구축 계획',
        '과학기술정보통신부 AI 기술개발 전략',
        '환경부 탄소중립 추진 로드맵',
      ];

      const startTime = Date.now();
      const promises = texts.map(text => koreanProcessor.analyzeText(text));
      const results = await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      console.log(`Processed ${texts.length} texts concurrently in ${totalTime}ms`);

      // All analyses should succeed
      expect(results).toHaveLength(5);
      results.forEach((result, index) => {
        expect(result.originalText).toBe(texts[index]);
        expect(result.keywords.length).toBeGreaterThan(2);
        expect(result.wordCount).toBeGreaterThan(5);
      });

      // Concurrent processing should be efficient
      expect(totalTime).toBeLessThan(3000); // Should complete within 3 seconds
    });
  });

  describe('Unicode and Encoding Edge Cases', () => {
    it('should handle various Unicode Korean characters', async () => {
      const unicodeText = `
        한글: ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ
        모음: ㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣ
        합성: 가각간갇갈갉갊감
        특수: ㉠㉡㉢㉣㉤㉥㉦㉧㉨㉩
        한자: 漢字韓國語言文化
        기호: ㆍ～〈〉《》「」『』【】
        숫자: ①②③④⑤⑥⑦⑧⑨⑩
      `;

      const analysis = await koreanProcessor.analyzeText(unicodeText);

      expect(analysis.originalText).toBe(unicodeText);
      expect(analysis.characterCount).toBe(unicodeText.length);
      expect(analysis.wordCount).toBeGreaterThan(0);
    });

    it('should handle malformed or incomplete Korean characters', async () => {
      const malformedText = 'ㅎㅏㄴㄱㅜㄱㅓ ㅌㅔㅅㅌㅡ 테스트';

      const analysis = await koreanProcessor.analyzeText(malformedText);

      expect(analysis.originalText).toBe(malformedText);
      expect(analysis.wordCount).toBeGreaterThan(0);
      expect(analysis.keywords).toContain('테스트');
    });

    it('should handle different Korean encoding normalization', async () => {
      // Same text in different Unicode normalization forms
      const nfc = '한국어'; // NFC (Canonical Decomposition + Canonical Composition)
      const nfd = '한국어'; // NFD (Canonical Decomposition)

      const analysisNFC = await koreanProcessor.analyzeText(nfc);
      const analysisNFD = await koreanProcessor.analyzeText(nfd);

      // Results should be equivalent after normalization
      expect(analysisNFC.keywords).toEqual(analysisNFD.keywords);
      expect(analysisNFC.romanized).toEqual(analysisNFD.romanized);
    });

    it('should handle very long Korean words and compound terms', async () => {
      const longCompoundText = `
        초고속정보통신망구축사업추진위원회는 
        차세대인터넷프로토콜기반네트워크인프라 구축을 위한
        정보통신기술발전및활용촉진에관한법률 개정안을 검토했다.
      `;

      const analysis = await koreanProcessor.analyzeText(longCompoundText);

      // Should handle very long compound words
      expect(analysis.keywords).toEqual(expect.arrayContaining([
        '초고속정보통신망', '구축사업', '추진위원회',
        '차세대', '인터넷', '프로토콜', '네트워크', '인프라',
        '정보통신', '기술발전', '법률', '개정안'
      ]));

      expect(analysis.wordCount).toBeGreaterThan(10);
    });
  });

  describe('Integration with Content Parsing', () => {
    it('should extract and process Korean text from HTML content', async () => {
      const htmlContent = `
        <html>
        <head>
          <title>정부정책 브리핑</title>
          <meta name="keywords" content="정책, 정부, 브리핑">
        </head>
        <body>
          <h1>대한민국 정부 정책 발표</h1>
          <div class="content">
            <p>오늘 청와대에서 열린 국무회의에서 새로운 경제정책이 발표되었습니다.</p>
            <p>주요 내용은 다음과 같습니다:</p>
            <ul>
              <li>소상공인 지원 확대</li>
              <li>일자리 창출 프로그램 운영</li>
              <li>중소기업 투자 활성화</li>
            </ul>
          </div>
          <div class="metadata">
            <span>발행: 대한민국 정부</span>
            <span>날짜: 2024년 1월 15일</span>
          </div>
        </body>
        </html>
      `;

      const parsed = await contentParser.parseContent(htmlContent, {
        extractText: true,
        processKorean: true,
        extractMetadata: true,
      });

      expect(parsed.title).toBe('정부정책 브리핑');
      expect(parsed.content).toContain('대한민국 정부 정책 발표');
      expect(parsed.content).toContain('소상공인 지원 확대');

      expect(parsed.koreanAnalysis).toBeDefined();
      expect(parsed.koreanAnalysis.keywords).toEqual(expect.arrayContaining([
        '정부', '정책', '발표', '경제정책', '소상공인',
        '일자리', '중소기업', '투자', '활성화'
      ]));

      expect(parsed.metadata.keywords).toEqual(expect.arrayContaining([
        '정책', '정부', '브리핑'
      ]));
    });
  });
});