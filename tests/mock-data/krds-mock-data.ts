/**
 * Mock Data for KRDS Testing
 * 
 * Provides realistic mock data for testing KRDS MCP server functionality.
 * Includes Korean government documents, search results, and HTML fixtures.
 * 
 * @author KRDS MCP Server
 * @version 1.0.0
 */

import type { 
  KrdsDocument, 
  KrdsSearchResult, 
  KrdsImage, 
  KrdsAttachment,
  KoreanTextAnalysis 
} from '@/types/index.js';

/**
 * Mock KRDS document with comprehensive Korean content
 */
export function mockKrdsDocument(overrides: Partial<KrdsDocument> = {}): KrdsDocument {
  const defaultDocument: KrdsDocument = {
    id: 'krds-doc-2024-edu-001',
    title: 'Educational Policy Development Plan 2024',
    titleKorean: '2024년 교육정책 발전방안',
    url: 'https://v04.krds.go.kr/policy/education/2024/development-plan',
    category: 'Education Policy',
    subcategory: 'Strategic Planning',
    content: `
      The Ministry of Education announces the comprehensive educational policy development plan for 2024.
      This plan focuses on digital transformation, inclusive education, and future-ready curriculum development.
      Key initiatives include AI-assisted learning, expanded vocational training, and enhanced teacher development programs.
    `,
    contentKorean: `
      교육부는 2024년 종합적인 교육정책 발전방안을 발표합니다.
      이 계획은 디지털 전환, 포용적 교육, 그리고 미래 준비 교육과정 개발에 중점을 둡니다.
      주요 이니셔티브로는 AI 보조 학습, 직업훈련 확대, 교사 개발 프로그램 강화가 포함됩니다.
      
      세부 추진 과제:
      1. 디지털 리터러시 교육 강화
      2. 맞춤형 학습 지원 시스템 구축
      3. 창의·융합 교육과정 운영
      4. 교육 공공성 및 책무성 제고
      5. 교육복지 안전망 확충
      
      이번 정책은 모든 학생이 미래 사회의 핵심 인재로 성장할 수 있도록 
      지원하는 것을 목표로 하고 있습니다.
    `,
    metadata: {
      agency: 'Ministry of Education',
      agencyKorean: '교육부',
      publicationDate: new Date('2024-01-15'),
      documentType: '정책발표자료',
      keywords: ['education', 'policy', 'digital transformation', 'AI', 'curriculum'],
      keywordsKorean: ['교육', '정책', '디지털전환', '인공지능', '교육과정', '미래교육', '포용교육'],
      language: 'ko',
      classification: 'public',
      status: 'active',
    },
    images: [
      {
        id: 'img-edu-chart-2024',
        url: 'https://v04.krds.go.kr/images/education/budget-chart-2024.png',
        alt: 'Education Budget Distribution Chart 2024',
        altKorean: '2024년 교육예산 배분 차트',
        caption: 'Distribution of education budget across different sectors',
        captionKorean: '각 분야별 교육예산 배분 현황',
        width: 800,
        height: 600,
        format: 'png',
        sizeBytes: 245760,
        downloadUrl: 'https://v04.krds.go.kr/download/images/edu-chart-2024.png',
      },
    ],
    attachments: [
      {
        id: 'att-edu-policy-detail',
        filename: '교육정책발전방안_상세자료.pdf',
        url: 'https://v04.krds.go.kr/files/education/policy-development-plan-2024-detailed.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048576, // 2MB
        description: 'Detailed educational policy development plan document',
        descriptionKorean: '교육정책 발전방안 상세 문서',
      },
      {
        id: 'att-edu-budget-data',
        filename: '교육예산분석데이터.xlsx',
        url: 'https://v04.krds.go.kr/files/education/budget-analysis-2024.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: 512000, // 500KB
        description: 'Education budget analysis data',
        descriptionKorean: '교육예산 분석 데이터',
      },
    ],
    createdAt: new Date('2024-01-15T09:00:00Z'),
    updatedAt: new Date('2024-01-15T14:30:00Z'),
    scrapedAt: new Date('2024-01-15T15:00:00Z'),
  };

  return { ...defaultDocument, ...overrides };
}

/**
 * Mock KRDS search result with multiple documents
 */
export function mockKrdsSearchResult(overrides: Partial<KrdsSearchResult> = {}): KrdsSearchResult {
  const documents = overrides.documents || [
    mockKrdsDocument(),
    mockKrdsDocument({
      id: 'krds-doc-2024-health-002',
      title: 'Healthcare System Innovation Strategy',
      titleKorean: '의료시스템 혁신 전략',
      category: 'Healthcare Policy',
      url: 'https://v04.krds.go.kr/policy/health/innovation-strategy',
      metadata: {
        agency: 'Ministry of Health and Welfare',
        agencyKorean: '보건복지부',
        publicationDate: new Date('2024-01-12'),
        documentType: '정책전략서',
        keywords: ['healthcare', 'innovation', 'digital health', 'AI diagnosis'],
        keywordsKorean: ['의료', '혁신', '디지털헬스', 'AI진단', '스마트의료'],
        language: 'ko',
        classification: 'public',
        status: 'active',
      },
    }),
    mockKrdsDocument({
      id: 'krds-doc-2024-transport-003',
      title: 'Smart City Transportation Development',
      titleKorean: '스마트시티 교통 개발',
      category: 'Transportation Policy',
      url: 'https://v04.krds.go.kr/policy/transport/smart-city-development',
      metadata: {
        agency: 'Ministry of Land, Infrastructure and Transport',
        agencyKorean: '국토교통부',
        publicationDate: new Date('2024-01-10'),
        documentType: '개발계획서',
        keywords: ['smart city', 'transportation', 'autonomous vehicles', 'IoT'],
        keywordsKorean: ['스마트시티', '교통', '자율주행', '사물인터넷', '지능형교통'],
        language: 'ko',
        classification: 'public',
        status: 'active',
      },
    }),
  ];

  const defaultResult: KrdsSearchResult = {
    documents,
    totalCount: documents.length,
    currentPage: 1,
    totalPages: 1,
    hasNext: false,
    hasPrevious: false,
    searchQuery: {
      query: '정책',
      queryKorean: '정책',
      page: 1,
      limit: 20,
      sortBy: 'date',
      sortOrder: 'desc',
    },
    executionTimeMs: 1250,
  };

  return { ...defaultResult, ...overrides };
}

/**
 * Mock Korean text analysis results
 */
export const mockKoreanAnalyses = {
  educationPolicy: (): KoreanTextAnalysis => ({
    originalText: '교육부는 디지털 전환과 미래 교육을 위한 종합적인 정책을 발표했습니다.',
    romanized: 'gyoyugbuneun dijiteol jeonhwangwa mirae gyoyugeul wihan jonghapjeogin jeongchaegeul balphyohaetsseumnida',
    stemmed: ['교육부', '디지털', '전환', '미래', '교육', '종합적', '정책', '발표'],
    keywords: ['교육부', '디지털전환', '미래교육', '정책', '발표'],
    sentiment: 'positive',
    readabilityScore: 8.2,
    wordCount: 12,
    characterCount: 39,
  }),

  healthcareInnovation: (): KoreanTextAnalysis => ({
    originalText: '보건복지부는 AI 기반 의료진단 시스템 도입을 통해 의료서비스 질 향상을 추진하고 있습니다.',
    romanized: 'bogeonbokjibuneun AI giban uiryojindan siseutem doibeul tonghae uiryoseobi jil hyangsangeul chujinhago itsseumnida',
    stemmed: ['보건복지부', 'AI', '기반', '의료진단', '시스템', '도입', '의료서비스', '질', '향상', '추진'],
    keywords: ['보건복지부', 'AI', '의료진단', '시스템', '의료서비스', '향상'],
    sentiment: 'positive',
    readabilityScore: 7.8,
    wordCount: 14,
    characterCount: 43,
  }),

  transportationPolicy: (): KoreanTextAnalysis => ({
    originalText: '국토교통부는 자율주행차 상용화와 지능형 교통시스템 구축을 위한 로드맵을 제시했습니다.',
    romanized: 'gugtoggyotongbuneun jayuljuhaengcha sangyonghwawa jineunghyeong gyotongsisstem guchug wihan rodemaebeul jesihatesseumnida',
    stemmed: ['국토교통부', '자율주행차', '상용화', '지능형', '교통시스템', '구축', '로드맵', '제시'],
    keywords: ['국토교통부', '자율주행차', '상용화', '지능형교통시스템', '로드맵'],
    sentiment: 'neutral',
    readabilityScore: 7.5,
    wordCount: 13,
    characterCount: 40,
  }),

  complexGovernmentText: (): KoreanTextAnalysis => ({
    originalText: `
      대한민국 정부는 제4차 산업혁명 시대에 대응하기 위해 
      인공지능, 빅데이터, 사물인터넷(IoT) 등 신기술을 활용한 
      디지털 정부혁신을 적극 추진하고 있습니다. 
      이를 통해 국민 맞춤형 행정서비스 제공과 
      정부 운영의 효율성 및 투명성을 크게 향상시킬 계획입니다.
    `,
    romanized: 'daehanmingug jeongbuneun je4cha saneobyeogmyeong sidaee daeeunghagi wihae ingongjineung bigdeiteo samurinteonet IoT deung singisuleul hwalyonghan dijiteol jeongbubyeogsineul jeokgeug chujinhago itsseumnida ireul tonghae gungmin matchumhyeong haengjeongseobi jegonggwa jeongbu unyeongui hyoyulseong mich tumyeongseongeul keuge hyangsangsikil gyehoegimnida',
    stemmed: [
      '대한민국', '정부', '4차', '산업혁명', '시대', '대응', 
      '인공지능', '빅데이터', '사물인터넷', 'IoT', '신기술', '활용',
      '디지털', '정부혁신', '추진', '국민', '맞춤형', '행정서비스', 
      '제공', '운영', '효율성', '투명성', '향상', '계획'
    ],
    keywords: [
      '정부', '4차산업혁명', '인공지능', '빅데이터', '사물인터넷', 'IoT',
      '디지털정부', '행정서비스', '효율성', '투명성', '혁신'
    ],
    sentiment: 'positive',
    readabilityScore: 6.8,
    wordCount: 45,
    characterCount: 156,
  }),
};

/**
 * Mock HTML content for parsing tests
 */
export const mockKrdsPage = `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <title>교육정책 발전방안 - 교육부</title>
    <meta name="description" content="2024년 교육정책 발전방안에 대한 교육부 발표자료">
    <meta name="keywords" content="교육정책,교육부,디지털교육,미래교육">
    <meta name="author" content="대한민국 교육부">
    <meta property="og:title" content="교육정책 발전방안">
    <meta property="og:description" content="디지털 전환 시대의 교육정책 방향">
</head>
<body>
    <header class="page-header">
        <div class="logo">
            <img src="/images/moe-logo.png" alt="교육부 로고">
        </div>
        <nav class="main-nav">
            <ul>
                <li><a href="/policy">정책</a></li>
                <li><a href="/news">보도자료</a></li>
                <li><a href="/data">통계자료</a></li>
            </ul>
        </nav>
    </header>

    <main class="content-main">
        <article class="document-article">
            <header class="document-header">
                <h1 class="document-title">2024년 교육정책 발전방안</h1>
                <div class="document-meta">
                    <span class="agency">교육부</span>
                    <span class="date">2024.01.15</span>
                    <span class="category">정책발표</span>
                </div>
            </header>

            <section class="document-summary">
                <h2>개요</h2>
                <p class="summary-text">
                    교육부는 디지털 전환 시대를 맞아 모든 학생이 미래 사회의 핵심 인재로 
                    성장할 수 있도록 지원하는 종합적인 교육정책을 발표합니다.
                </p>
            </section>

            <section class="document-content">
                <h2>주요 정책 방향</h2>
                
                <h3>1. 디지털 교육 혁신</h3>
                <ul class="policy-list">
                    <li>AI 기반 맞춤형 학습 시스템 구축</li>
                    <li>디지털 리터러시 교육과정 강화</li>
                    <li>에듀테크 활용 수업 모델 개발</li>
                </ul>

                <h3>2. 포용적 교육 실현</h3>
                <ul class="policy-list">
                    <li>교육 격차 해소를 위한 맞춤형 지원</li>
                    <li>다문화·탈북학생 교육 지원 확대</li>
                    <li>특수교육 대상자 통합교육 강화</li>
                </ul>

                <h3>3. 미래형 교육과정 운영</h3>
                <ul class="policy-list">
                    <li>창의·융합형 인재 양성</li>
                    <li>진로맞춤형 교육과정 다양화</li>
                    <li>생태전환교육 및 민주시민교육 내실화</li>
                </ul>

                <div class="statistics-section">
                    <h3>예산 배분 현황</h3>
                    <img src="/images/budget-chart-2024.png" 
                         alt="2024년 교육예산 배분 차트" 
                         class="statistics-chart"
                         width="600" height="400">
                    <p class="chart-caption">분야별 교육예산 배분 비율</p>
                </div>

                <div class="timeline-section">
                    <h3>추진 일정</h3>
                    <table class="timeline-table">
                        <thead>
                            <tr>
                                <th>시기</th>
                                <th>추진 내용</th>
                                <th>담당 부서</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>2024.03</td>
                                <td>정책 세부 실행계획 수립</td>
                                <td>정책기획과</td>
                            </tr>
                            <tr>
                                <td>2024.06</td>
                                <td>시범사업 추진</td>
                                <td>교육과정정책과</td>
                            </tr>
                            <tr>
                                <td>2024.12</td>
                                <td>전국 확대 시행</td>
                                <td>교육정책과</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <section class="attachments-section">
                <h2>관련 자료</h2>
                <ul class="attachments-list">
                    <li>
                        <a href="/files/education-policy-2024-detailed.pdf" class="attachment-link">
                            <span class="file-icon">📄</span>
                            <span class="file-name">교육정책발전방안_상세자료.pdf</span>
                            <span class="file-size">(2.1MB)</span>
                        </a>
                    </li>
                    <li>
                        <a href="/files/budget-analysis-2024.xlsx" class="attachment-link">
                            <span class="file-icon">📊</span>
                            <span class="file-name">예산분석데이터.xlsx</span>
                            <span class="file-size">(524KB)</span>
                        </a>
                    </li>
                    <li>
                        <a href="/files/implementation-timeline.docx" class="attachment-link">
                            <span class="file-icon">📝</span>
                            <span class="file-name">추진일정표.docx</span>
                            <span class="file-size">(186KB)</span>
                        </a>
                    </li>
                </ul>
            </section>
        </article>
    </main>

    <footer class="page-footer">
        <div class="footer-content">
            <div class="contact-info">
                <h3>문의처</h3>
                <p>교육부 정책기획과</p>
                <p>전화: 044-203-6000</p>
                <p>이메일: policy@moe.go.kr</p>
            </div>
            <div class="copyright">
                <p>&copy; 2024 대한민국 교육부. All rights reserved.</p>
            </div>
        </div>
    </footer>
</body>
</html>
`;

/**
 * Mock navigation structure
 */
export const mockNavigationTree = {
  categories: [
    {
      id: 'education',
      name: 'Education',
      nameKorean: '교육',
      url: '/category/education',
      subcategories: [
        {
          id: 'policy',
          name: 'Policy',
          nameKorean: '정책',
          url: '/category/education/policy',
          documentCount: 142,
        },
        {
          id: 'statistics',
          name: 'Statistics',
          nameKorean: '통계',
          url: '/category/education/statistics',
          documentCount: 87,
        },
        {
          id: 'budget',
          name: 'Budget',
          nameKorean: '예산',
          url: '/category/education/budget',
          documentCount: 64,
        },
      ],
    },
    {
      id: 'healthcare',
      name: 'Healthcare',
      nameKorean: '보건의료',
      url: '/category/healthcare',
      subcategories: [
        {
          id: 'policy',
          name: 'Policy',
          nameKorean: '정책',
          url: '/category/healthcare/policy',
          documentCount: 198,
        },
        {
          id: 'statistics',
          name: 'Statistics',
          nameKorean: '통계',
          url: '/category/healthcare/statistics',
          documentCount: 156,
        },
      ],
    },
    {
      id: 'transportation',
      name: 'Transportation',
      nameKorean: '교통',
      url: '/category/transportation',
      subcategories: [
        {
          id: 'infrastructure',
          name: 'Infrastructure',
          nameKorean: '인프라',
          url: '/category/transportation/infrastructure',
          documentCount: 93,
        },
        {
          id: 'smart-city',
          name: 'Smart City',
          nameKorean: '스마트시티',
          url: '/category/transportation/smart-city',
          documentCount: 45,
        },
      ],
    },
  ],
};

/**
 * Sample Korean texts for testing various scenarios
 */
export const koreanTextSamples = {
  formal: '대한민국 정부는 국민의 복지향상과 경제발전을 위하여 지속적으로 노력하고 있습니다.',
  informal: '정부가 국민들을 위해서 계속 열심히 일하고 있어요.',
  technical: 'IoT 기반 스마트팩토리 구축을 통한 제조업 혁신 및 생산성 향상 방안',
  legal: '본 법률은 국민의 기본권 보장과 국가 발전에 이바지함을 목적으로 한다.',
  mixed: 'AI 인공지능과 Big Data 빅데이터를 활용한 Digital Transformation 디지털 전환',
  dialectPusan: '뭐하노? 밥 먹었나? 같이 가자 아이가.',
  dialectJeju: '어서 옵서예. 어디 감수광? 조심해서 갑서.',
  ancient: '大韓民國 憲法 第1條에 의하면 大韓民國은 民主共和國이다.',
  withNumbers: '2024년 1월 15일 오후 3시 30분에 발표된 제15차 정책회의 결과',
  longCompound: '정보통신기술발전및활용촉진에관한법률시행령개정안검토회의',
};

/**
 * Error scenarios for testing error handling
 */
export const errorScenarios = {
  networkTimeout: {
    error: 'Network timeout after 30 seconds',
    code: 'NETWORK_TIMEOUT',
    retryable: true,
  },
  accessDenied: {
    error: 'Access denied to protected resource',
    code: 'ACCESS_DENIED',
    retryable: false,
  },
  notFound: {
    error: 'Document not found',
    code: 'NOT_FOUND',
    retryable: false,
  },
  rateLimited: {
    error: 'Rate limit exceeded, please try again later',
    code: 'RATE_LIMITED',
    retryable: true,
  },
  serverError: {
    error: 'Internal server error occurred',
    code: 'SERVER_ERROR',
    retryable: true,
  },
  parseError: {
    error: 'Failed to parse document content',
    code: 'PARSE_ERROR',
    retryable: false,
  },
};