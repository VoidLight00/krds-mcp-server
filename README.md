# KRDS MCP 서버 🇰🇷

KRDS 웹사이트(https://v04.krds.go.kr)의 UI/UX 디자인 시스템을 추출하고 분석하는 Model Context Protocol(MCP) 서버입니다. Magic MCP와 유사하게 디자인 패턴을 추출하여 다양한 프레임워크에서 사용할 수 있는 컴포넌트 코드를 생성합니다.

## 🚀 주요 기능

### 디자인 시스템 MCP 도구 (Magic MCP 스타일)

이 서버는 KRDS 웹사이트의 디자인 시스템을 실시간으로 분석하고 추출하여, 개발자가 정부 표준 UI를 쉽게 구현할 수 있도록 지원합니다.

#### 🎨 4가지 핵심 도구

1. **`analyze_design`** - KRDS 디자인 시스템 분석
   - 색상 팔레트 추출
   - 타이포그래피 규칙 분석
   - 여백 및 레이아웃 패턴 파악
   - UI 컴포넌트 목록화

2. **`extract_component`** - 특정 UI 컴포넌트 추출
   - 헤더, 푸터, 네비게이션 등 주요 컴포넌트 구조 추출
   - HTML 구조 및 CSS 스타일 분석
   - 컴포넌트별 디자인 토큰 추출
   - 실제 사용 예시 포함

3. **`get_design_tokens`** - 디자인 토큰 추출
   - CSS 변수 및 커스텀 속성 추출
   - 색상 시스템 (Primary, Secondary, 상태 색상)
   - 타이포그래피 스케일 (폰트 크기, 행간, 자간)
   - 여백 시스템 (Spacing, Padding, Margin)
   - 그림자 및 테두리 스타일

4. **`generate_code`** - 프레임워크별 컴포넌트 코드 생성
   - **React**: JSX + CSS/Styled Components/Tailwind
   - **Vue**: SFC (Single File Component) 형식
   - **Angular**: TypeScript + 템플릿
   - **순수 HTML**: 바닐라 HTML + CSS

### 주요 특징

- **🔄 실시간 추출**: KRDS 웹사이트에서 실시간으로 디자인 정보 추출
- **🛡️ 폴백 모드**: 네트워크 오류 시 정적 디자인 패턴 제공
- **🎯 정부 표준 준수**: 한국 정부 웹 접근성 및 디자인 가이드라인 반영
- **⚡ 성능 최적화**: 캐싱 및 재시도 로직으로 안정적인 서비스 제공
- **🇰🇷 한글 지원**: 한국어 텍스트 및 UI 라벨 완벽 지원

## 📁 프로젝트 구조

```
krds-mcp-server/
├── src/                      # 소스 코드
│   ├── server.ts            # MCP 서버 메인 진입점
│   ├── tools/               # MCP 도구 구현체
│   │   ├── content-retrieval.ts  # 콘텐츠 검색 도구
│   │   ├── search.ts        # 검색 기능
│   │   ├── navigation.ts    # 웹사이트 내비게이션
│   │   ├── export.ts        # 데이터 내보내기 도구
│   │   ├── image-tools.ts   # 이미지 처리
│   │   └── korean-text.ts   # 한국어 텍스트 분석
│   ├── scraping/            # 웹 스크래핑 모듈
│   │   ├── krds-scraper.ts  # KRDS 메인 스크래퍼
│   │   ├── navigation-crawler.ts  # 내비게이션 크롤러
│   │   ├── content-integration.ts # 콘텐츠 통합
│   │   └── rate-limiter.ts        # 속도 제한기
│   ├── parsing/             # 콘텐츠 파싱
│   │   ├── content-parser.ts      # 콘텐츠 파서
│   │   ├── korean-text-processor.ts # 한국어 텍스트 프로세서
│   │   ├── image-extractor.ts     # 이미지 추출기
│   │   ├── metadata-extractor.ts  # 메타데이터 추출기
│   │   └── table-parser.ts        # 테이블 파서
│   ├── cache/               # 캐싱 시스템
│   │   ├── cache-manager.ts       # 캐시 관리자
│   │   ├── memory-cache.ts        # 메모리 캐시
│   │   ├── redis-cache.ts         # Redis 캐시
│   │   ├── file-cache.ts          # 파일 캐시
│   │   └── cache-strategies.ts    # 캐시 전략
│   ├── korean/              # 한국어 언어 처리
│   ├── types/               # TypeScript 타입 정의
│   │   └── index.ts
│   └── utils/               # 유틸리티 함수
│       ├── config.ts        # 설정
│       └── logger.ts        # 로깅
├── tests/                   # 테스트 스위트
│   ├── unit/               # 단위 테스트
│   ├── integration/        # 통합 테스트
│   ├── e2e/               # 엔드투엔드 테스트
│   ├── helpers/           # 테스트 유틸리티
│   └── mock-data/         # 테스트 데이터
├── docs/                   # 문서
├── config/                 # 설정 파일
└── dist/                  # 컴파일된 출력물
```

## 🛠️ 설치 방법

### 사전 요구사항
- Node.js 18.0.0 이상
- npm 9.0.0 이상
- TypeScript 5.3.0 이상
- Redis (선택사항, 분산 캐싱용)

### 빠른 시작

1. **저장소 복제**
   ```bash
   git clone https://github.com/yourusername/krds-mcp-server.git
   cd krds-mcp-server
   ```

2. **종속성 설치**
   ```bash
   npm install
   ```

3. **환경 설정**
   ```bash
   cp .env.example .env
   # .env 파일을 편집하여 설정을 입력하세요
   ```

4. **프로젝트 빌드**
   ```bash
   npm run build
   ```

5. **서버 시작**
   ```bash
   npm start
   ```

### 개발 환경 설정

```bash
# 핫 리로딩을 사용한 개발 모드 실행
npm run dev

# 특정 설정으로 실행
NODE_ENV=development LOG_LEVEL=debug npm run dev
```

### Docker 설정

```bash
# Docker 이미지 빌드
npm run docker:build

# Docker Compose로 실행
docker-compose up -d

# 또는 단일 컨테이너 실행
npm run docker:run
```

## ⚙️ 설정

### 환경 변수

프로젝트 루트에 `.env` 파일을 생성하세요:

```bash
# 서버 설정
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# KRDS 웹사이트 설정
KRDS_BASE_URL=https://v04.krds.go.kr
KRDS_TIMEOUT=30000
KRDS_RETRY_ATTEMPTS=3
KRDS_RETRY_DELAY=1000
KRDS_USER_AGENT=KRDS-MCP-Server/1.0.0

# 속도 제한 설정
KRDS_RATE_LIMIT_ENABLED=true
KRDS_REQUESTS_PER_MINUTE=60
KRDS_CONCURRENT_REQUESTS=5

# Puppeteer 설정
PUPPETEER_HEADLESS=true
PUPPETEER_TIMEOUT=30000
PUPPETEER_SLOWMO=0
PUPPETEER_VIEWPORT_WIDTH=1920
PUPPETEER_VIEWPORT_HEIGHT=1080

# 캐시 설정
CACHE_TYPE=memory,redis,file
CACHE_TTL=3600
CACHE_MAX_SIZE=104857600

# 메모리 캐시
CACHE_MEMORY_MAX_MB=100
CACHE_MEMORY_CLEANUP_INTERVAL=300

# Redis 캐시 (선택사항)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_KEY_PREFIX=krds:

# 파일 캐시
CACHE_FILE_BASE_DIR=/tmp/krds-cache
CACHE_FILE_MAX_SIZE_MB=500
CACHE_FILE_CLEANUP_INTERVAL=3600

# 한국어 언어 처리
KOREAN_PROCESSING_ENABLED=true
KOREAN_STEMMING_ENABLED=true
KOREAN_ROMANIZATION_ENABLED=true
KOREAN_KEYWORD_EXTRACTION_ENABLED=true

# 내보내기 설정
EXPORT_MAX_FILE_SIZE_MB=50
EXPORT_DEFAULT_FORMAT=json

# 보안 설정
CORS_ENABLED=true
CORS_ORIGIN=*
HELMET_ENABLED=true
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

### 고급 설정

자세한 설정 옵션은 [설정 가이드](./docs/configuration.md)를 참조하세요.

## 🧪 테스트

### 테스트 실행

```bash
# 모든 테스트 실행
npm test

# 특정 테스트 스위트 실행
npm run test:unit          # 단위 테스트만 실행
npm run test:integration   # 통합 테스트만 실행
npm run test:e2e          # 엔드투엔드 테스트만 실행

# 커버리지와 함께 테스트 실행
npm run test:coverage

# 감시 모드에서 테스트 실행
npm run test:watch

# 특정 패턴으로 테스트 실행
npm test -- --testNamePattern="Korean.*processing"
```

### 테스트 구조

- **단위 테스트** (`tests/unit/`): 개별 구성 요소를 독립적으로 테스트
- **통합 테스트** (`tests/integration/`): 구성 요소 간의 상호작용 테스트
- **E2E 테스트** (`tests/e2e/`): 완전한 워크플로와 MCP 프로토콜 준수성 테스트

### 한국어 텍스트 테스트

테스트 스위트에는 포괄적인 한국어 언어 처리 테스트가 포함되어 있습니다:

```typescript
// 한국어 텍스트 테스트 예제
describe('한국어 텍스트 처리', () => {
  it('정부 정책 문서를 처리해야 함', async () => {
    const koreanText = '교육부는 새로운 정책을 발표했습니다.';
    const analysis = await koreanProcessor.analyzeText(koreanText);
    
    expect(analysis.keywords).toContain('교육부');
    expect(analysis.romanized).toBe('gyoyugbuneun saeroun jeongchaegeul balphyohaetsseumnida');
    expect(analysis.sentiment).toBe('positive');
  });
});
```

### 성능 테스트

```bash
# 성능 벤치마크 실행
npm run test:performance

# 메모리 사용량 프로파일링
NODE_OPTIONS="--max-old-space-size=2048" npm run test:e2e
```

## 📚 MCP 도구 문서

### 콘텐츠 검색 도구

전체 텍스트 처리 기능을 포함한 한국 정부 문서 검색.

```javascript
{
  "name": "retrieve_content",
  "arguments": {
    "url": "https://v04.krds.go.kr/policy/education/2024/plan",
    "includeImages": true,
    "includeAttachments": true,
    "processKoreanText": true
  }
}
```

**매개변수:**
- `url` (문자열) - KRDS 문서 URL
- `documentId` (문자열) - URL 대신 사용할 문서 식별자
- `includeImages` (불린, 기본값: true) - 이미지 추출 및 처리
- `includeAttachments` (불린, 기본값: true) - 첨부 파일 포함
- `processKoreanText` (불린, 기본값: true) - 한국어 텍스트 처리 활성화

**응답:**
```javascript
{
  "success": true,
  "document": {
    "id": "krds-doc-2024-edu-001",
    "title": "Educational Policy Development Plan 2024",
    "titleKorean": "2024년 교육정책 발전방안",
    "content": "Full document content...",
    "contentKorean": "한국어 문서 내용...",
    "metadata": {
      "agency": "Ministry of Education",
      "agencyKorean": "교육부",
      "keywords": ["education", "policy"],
      "keywordsKorean": ["교육", "정책"],
      "language": "ko"
    },
    "images": [...],
    "attachments": [...]
  },
  "executionTimeMs": 2500
}
```

### 검색 도구

고급 한국어 언어 지원을 통한 KRDS 문서 검색.

```javascript
{
  "name": "search_documents",
  "arguments": {
    "query": "교육정책",
    "category": "교육",
    "maxResults": 20,
    "sortBy": "date",
    "sortOrder": "desc"
  }
}
```

**매개변수:**
- `query` (문자열) - 검색 쿼리 (한국어 지원)
- `category` (문자열, 선택사항) - 검색할 카테고리 (예: "교육", "보건", "경제")
- `maxResults` (숫자, 기본값: 10) - 최대 결과 수
- `sortBy` (문자열, 기본값: "relevance") - 정렬 기준 ("date", "relevance", "title")
- `sortOrder` (문자열, 기본값: "desc") - 정렬 순서 ("asc", "desc")

### 한국어 텍스트 분석 도구

언어학적 기능을 포함한 고급 한국어 텍스트 분석 수행.

```javascript
{
  "name": "analyze_korean_text",
  "arguments": {
    "texts": ["교육부는 새로운 정책을 발표했습니다."],
    "includeRomanization": true,
    "includeSentiment": true,
    "extractKeywords": true,
    "analyzeStemming": true
  }
}
```

**매개변수:**
- `texts` (배열) - 분석할 한국어 텍스트 배열
- `includeRomanization` (불린, 기본값: false) - 로마자 변환 포함
- `includeSentiment` (불린, 기본값: false) - 감정 분석 포함
- `extractKeywords` (불린, 기본값: true) - 키워드 추출
- `analyzeStemming` (불린, 기본값: false) - 어간 분석 포함

**응답:**
```javascript
{
  "success": true,
  "analyses": [{
    "originalText": "교육부는 새로운 정책을 발표했습니다.",
    "romanized": "gyoyugbuneun saeroun jeongchaegeul balphyohaetsseumnida",
    "keywords": ["교육부", "정책", "발표"],
    "stemmed": ["교육부", "새롭다", "정책", "발표"],
    "sentiment": "positive",
    "wordCount": 6,
    "characterCount": 19
  }]
}
```

### 내비게이션 도구

KRDS 웹사이트 구조 및 카테고리 탐색.

```javascript
{
  "name": "navigate_site",
  "arguments": {
    "action": "list_categories"
  }
}

{
  "name": "navigate_site", 
  "arguments": {
    "action": "browse_category",
    "category": "education"
  }
}
```

**매개변수:**
- `action` (문자열) - 수행할 작업 ("list_categories", "browse_category", "get_sitemap")
- `category` (문자열, 선택사항) - 탐색할 카테고리 (예: "education", "health", "economy")
- `depth` (숫자, 선택사항) - 탐색 깊이 (기본값: 2)

### 내보내기 도구

다양한 형식으로 문서 내보내기.

```javascript
{
  "name": "export_documents",
  "arguments": {
    "documents": [/* 문서 객체들 */],
    "format": "pdf",
    "includeImages": true,
    "filename": "education-policies-2024"
  }
}
```

**매개변수:**
- `documents` (배열) - 내보낼 문서 객체 배열
- `format` (문자열) - 내보내기 형식 ("json", "csv", "xlsx", "pdf", "xml")
- `includeImages` (불린, 기본값: false) - 이미지 포함 여부
- `filename` (문자열, 선택사항) - 출력 파일명
- `encoding` (문자열, 기본값: "utf-8") - 텍스트 인코딩

**지원 형식:** `json`, `csv`, `xlsx`, `pdf`, `xml`

## 🚀 성능

### 최적화 기능

- **⚡ 연결 풀링**: 브라우저 인스턴스 및 HTTP 연결 재사용
- **🧠 지능형 캐싱**: 한국어 텍스트 최적화를 포함한 다층 캐싱
- **🔄 동시 처리**: 병렬 문서 처리
- **⏰ 속도 제한**: 설정 가능한 제한으로 정중한 스크래핑
- **🗄️ 메모리 관리**: 자동 정리 및 리소스 모니터링

### 성능 벤치마크

최신 하드웨어에서의 일반적인 성능 지표:

| 작업 | 시간 | 처리량 |
|------|------|---------|
| 문서 검색 | 1.5-3초 | 20-40 문서/분 |
| 한국어 텍스트 분석 | 50-200ms | 300-1200 텍스트/분 |
| 검색 쿼리 | 0.8-2초 | 30-75 쿼리/분 |
| 캐시 히트 | 5-20ms | 3000+ 연산/분 |

### 모니터링

```bash
# 성능 메트릭 보기
curl http://localhost:3000/metrics

# 캐시 통계 확인
curl http://localhost:3000/cache/stats

# 건강 상태 확인
curl http://localhost:3000/health
```

## 🔧 개발

### 코드 품질

```bash
# 린팅
npm run lint
npm run lint:fix

# 포매팅  
npm run format
npm run format:check

# 타입 검사
npm run typecheck
```

### 디버깅

```bash
# 디버그 로그와 함께 실행
LOG_LEVEL=debug npm run dev

# 특정 디버그 네임스페이스 활성화
DEBUG=krds:scraper,krds:parser npm run dev

# 성능 프로파일링
NODE_OPTIONS="--inspect" npm run dev
```

### 새로운 도구 추가

1. `src/tools/your-tool.ts`에 도구 파일 생성:

```typescript
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const yourTool: Tool = {
  name: 'your_tool_name',
  description: '도구 설명',
  inputSchema: {
    type: 'object',
    properties: {
      param: { type: 'string', description: '매개변수 설명' }
    },
    required: ['param']
  }
};

export async function yourToolHandler(params: any, context: ToolContext) {
  // 구현 코드
}
```

2. `src/tools/index.ts`에 등록
3. `tests/unit/tools/your-tool.test.ts`에 테스트 추가
4. 문서 업데이트

## 🚢 배포

### 프로덕션 배포

```bash
# 프로덕션용 빌드
npm run build

# 프로덕션 서버 시작
NODE_ENV=production npm start

# 또는 PM2 사용
pm2 start ecosystem.config.js
```

### Docker 배포

```bash
# 이미지 빌드
docker build -t krds-mcp-server .

# 컨테이너 실행
docker run -d \
  --name krds-mcp-server \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e REDIS_HOST=redis \
  krds-mcp-server
```

### 환경별 설정

- **개발**: `.env.development`
- **테스트**: `.env.test`
- **스테이징**: `.env.staging`
- **프로덕션**: `.env.production`

### 건강 상태 검사

서버는 건강 상태 검사 엔드포인트를 제공합니다:

```bash
# 기본 건강 상태 검사
GET /health

# 상세 건강 상태 검사
GET /health/detailed

# 준비 상태 검사
GET /ready
```

### 모니터링 및 로깅

- **구조화된 로깅**: 상관관계 ID가 포함된 JSON 로그
- **메트릭**: Prometheus 호환 메트릭 엔드포인트
- **오류 추적**: 스택 트레이스를 포함한 포괄적인 오류 로깅
- **성능 모니터링**: 요청 시간 및 리소스 사용량

## 🤝 기여

기여를 환영합니다! 자세한 내용은 [기여 가이드](./docs/contributing.md)를 참조하세요.

### 기여자를 위한 빠른 시작

1. 저장소 포크
2. 기능 브랜치 생성: `git checkout -b feature/amazing-feature`
3. 변경 사항 작성
4. 새로운 기능에 대한 테스트 추가
5. 모든 테스트 통과 확인: `npm test`
6. 변경 사항 커밋: `git commit -m 'Add amazing feature'`
7. 브랜치에 푸시: `git push origin feature/amazing-feature`
8. Pull Request 열기

### 개발 가이드라인

- TypeScript 모범 사례 준수
- 새로운 기능에 대한 포괄적인 테스트 추가
- API 변경에 대한 문서 업데이트
- 반식 커밋 메시지 사용
- 한국어 텍스트 처리가 제대로 테스트되도록 보장

## 📄 라이선스

MIT 라이선스 - 자세한 내용은 [LICENSE](LICENSE) 파일을 참조하세요.

## 🐛 문제 및 지원

- **버그 리포트**: [GitHub Issues](https://github.com/yourusername/krds-mcp-server/issues)
- **기능 요청**: [GitHub Discussions](https://github.com/yourusername/krds-mcp-server/discussions)
- **보안 문제**: security@yourserver.com으로 이메일 송부

## 📖 추가 문서

- [API 문서](./docs/api.md)
- [설정 가이드](./docs/configuration.md)
- [배포 가이드](./docs/deployment.md)
- [한국어 언어 처리](./docs/korean-processing.md)
- [아키텍처 개요](./docs/architecture.md)
- [기여 가이드](./docs/contributing.md)

## 🙏 감사 인사

- KRDS 데이터 액세스를 제공해주신 한국 정부
- MCP SDK 개발자들과 커뮤니티
- 한국어 언어 처리 라이브러리 유지보수자들
- 오픈소스 테스트 및 개발 도구들
- 기여자들과 커뮤니티 멤버들

---

한국 정부 데이터 커뮤니티를 위해 ❤️으로 제작되었습니다