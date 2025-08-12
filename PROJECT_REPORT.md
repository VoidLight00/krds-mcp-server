# KRDS MCP 서버 개발 프로젝트 상세 보고서

**작성일**: 2025년 1월 12일  
**프로젝트명**: KRDS Design System MCP Server  
**작업 기간**: 2025년 1월 12일 01:00 ~ 19:00 (약 18시간)  
**개발자**: VoidLight (Claude Code 지원)  

---

## 📋 목차

1. [프로젝트 개요](#프로젝트-개요)
2. [초기 요구사항 분석](#초기-요구사항-분석)
3. [개발 진행 과정](#개발-진행-과정)
4. [기술적 도전과 해결](#기술적-도전과-해결)
5. [최종 구현 결과](#최종-구현-결과)
6. [검증 및 테스트](#검증-및-테스트)
7. [문제점 및 한계](#문제점-및-한계)
8. [향후 개선 방향](#향후-개선-방향)
9. [결론](#결론)

---

## 프로젝트 개요

### 배경
사용자는 한국 정부 표준 디자인 시스템(KRDS) 웹사이트(https://v04.krds.go.kr)에서 UI/UX 패턴을 추출하는 MCP(Model Context Protocol) 서버 개발을 요청했습니다. 초기에는 Magic MCP와 유사한 디자인 시스템 추출 도구를 원했으나, 처음에는 웹 스크래핑 도구로 잘못 이해되어 개발이 진행되었습니다.

### 최종 목표
- KRDS 웹사이트의 디자인 시스템을 실시간으로 분석
- UI 컴포넌트 패턴 추출
- 다양한 프레임워크(React, Vue, Angular)용 코드 생성
- Claude Desktop에서 사용 가능한 MCP 서버 구축

---

## 초기 요구사항 분석

### 사용자의 원래 요청 (01:00)
```
"https://v04.krds.go.kr/guide/outline/outline_01.html 해당 사이트의 모든 텍스트 및 이미지를 
magic mcp 와 동일하게 mcp 로 불러오는 기능을 만든다면 어떻게 전문적으로 기획하는게 좋을까?"
```

### 초기 이해 (잘못된 방향)
- 웹 스크래핑 중심의 MCP 서버로 이해
- 6개의 스크래핑 도구 개발:
  1. `search_documents` - 문서 검색
  2. `retrieve_content` - 콘텐츠 검색
  3. `navigate_site` - 사이트 탐색
  4. `process_images` - 이미지 처리
  5. `export_documents` - 문서 내보내기
  6. `analyze_korean_text` - 한국어 텍스트 분석

### 실제 요구사항 확인 (16:00)
```
"스크래핑이 아니라 해당 krds 웹사이트의 텍스트나 기능들을 해당 mcp를 통해서 불러오는걸 원해 
magic mcp 처럼 말이야 ui ux 참고해서 뭔가를 만들수 있다거나"
```

---

## 개발 진행 과정

### Phase 1: 초기 개발 (01:00 ~ 05:00)
1. **프로젝트 구조 설정**
   - TypeScript 프로젝트 초기화
   - MCP SDK 설치 및 설정
   - 폴더 구조 생성

2. **웹 스크래핑 서버 구현**
   - Puppeteer 기반 스크래퍼
   - Cheerio HTML 파싱
   - 한국어 텍스트 처리 (Hangul.js)
   - 캐싱 시스템 (Memory, Redis, File)

3. **TypeScript 컴파일 오류**
   - 초기 222개 오류 발생
   - 타입 정의 문제 해결
   - 네임스페이스 충돌 수정

### Phase 2: 문제 발견 및 수정 (05:00 ~ 10:00)
1. **"진실모드" 검증**
   - MCP 서버가 Claude Desktop에 로드되지 않음 발견
   - 컴파일 오류 80개로 감소
   - 간소화된 서버 버전 작성

2. **Enhanced Server 개발**
   - 실제 Puppeteer 통합
   - Cheerio 기반 파싱
   - 속도 제한 및 캐싱

### Phase 3: 방향 전환 (16:00 ~ 18:00)
1. **Design System Server 개발**
   - 사용자 요구사항 재확인 후 방향 전환
   - 4개 디자인 도구로 재구성:
     - `analyze_design` - 디자인 시스템 분석
     - `extract_component` - UI 컴포넌트 추출
     - `get_design_tokens` - 디자인 토큰 추출
     - `generate_code` - 프레임워크별 코드 생성

2. **Puppeteer 문제 해결**
   - 브라우저 실행 실패 문제
   - WebSocket 연결 오류
   - 폴백 모드 구현

### Phase 4: 최종 개선 (18:00 ~ 19:00)
1. **SuperClaude 및 Agent MCP 활용**
   - code-analyzer 에이전트로 코드 분석
   - coder 에이전트로 Puppeteer 수정
   - 3회 재시도 로직 추가
   - 폴백 메커니즘 구현

2. **문서화 및 배포**
   - 한국어 README 작성
   - GitHub 저장소 업데이트
   - 테스트 클라이언트 작성

---

## 기술적 도전과 해결

### 1. TypeScript 컴파일 오류
**문제**: 초기 222개의 타입 오류
```typescript
// 문제: Puppeteer 타입 충돌
import puppeteer from 'puppeteer';
// Error: Cannot find namespace 'puppeteer'
```

**해결**: 타입을 `any`로 변경하고 개별 컴파일
```typescript
private browser: any = null; // puppeteer.Browser 대신 any 사용
```

### 2. MCP 서버 로딩 실패
**문제**: Claude Desktop에서 서버 인식 불가
```json
// mcp_settings.json에는 있지만 실제 로드 안됨
"krds": {
  "command": "node",
  "args": ["/Users/voidlight/krds-mcp-server/dist/server.js"]
}
```

**해결**: 파일 경로 수정 및 간소화된 버전 작성
```json
"args": ["/Users/voidlight/krds-mcp-server/dist/server-design.js"]
```

### 3. Puppeteer 브라우저 실행 실패
**문제**: WebSocket 연결 오류
```
ErrorEvent {
  [Symbol(kError)]: Error: socket hang up
  code: 'ECONNRESET'
}
```

**해결**: 재시도 로직 및 폴백 모드
```typescript
async launchBrowser(attempt = 1): Promise<boolean> {
  const MAX_ATTEMPTS = 3;
  try {
    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    return true;
  } catch (error) {
    if (attempt < MAX_ATTEMPTS) {
      await new Promise(r => setTimeout(r, 2000 * attempt));
      return this.launchBrowser(attempt + 1);
    }
    this.fallbackMode = true;
    return false;
  }
}
```

### 4. KRDS 사이트 네비게이션 문제
**문제**: Frame detached 오류
```
Error: Navigating frame was detached
```

**해결**: 폴백 데이터 제공
```typescript
private getFallbackDesignAnalysis() {
  return {
    colors: {
      primary: '#003764',
      secondary: '#00a0e9',
      // 정적 KRDS 색상 데이터
    },
    typography: { /* 기본 타이포그래피 */ },
    components: [ /* 표준 컴포넌트 목록 */ ]
  };
}
```

---

## 최종 구현 결과

### 구현된 기능
1. **4개 디자인 도구**
   - ✅ 도구 등록 및 스키마 정의
   - ✅ MCP 프로토콜 준수
   - ✅ 폴백 모드 작동

2. **컴포넌트 코드 생성**
   - ✅ React 컴포넌트 생성
   - ✅ Vue SFC 생성
   - ✅ Angular 컴포넌트 생성
   - ✅ 순수 HTML/CSS 생성

3. **문서화**
   - ✅ 한국어 README
   - ✅ 코드 품질 분석 문서
   - ✅ Puppeteer 수정 문서
   - ✅ 테스트 보고서

### 파일 구조
```
krds-mcp-server/
├── src/
│   ├── server-design.ts (705줄) - 최종 디자인 서버
│   ├── server-enhanced.ts (455줄) - 개선된 스크래핑 서버
│   └── server-simple.ts (186줄) - 간소화 버전
├── dist/
│   ├── server-design.js (52KB) - 컴파일된 최종 버전
│   └── ...
├── test-mcp-client.js - MCP 테스트 클라이언트
├── README.md - 한국어 문서
└── package.json
```

---

## 검증 및 테스트

### 테스트 실행 결과
```bash
$ node test-mcp-client.js

✅ Server started successfully
1️⃣ Testing: List Tools - SUCCESS (4 tools registered)
2️⃣ Testing: Analyze Design - FALLBACK MODE (Browser failed)
3️⃣ Testing: Extract Component - FALLBACK MODE
4️⃣ Testing: Get Design Tokens - FALLBACK MODE
5️⃣ Testing: Generate React Button - SUCCESS
```

### "진실모드" 검증 결과
- ✅ **구현됨**: 코드 작성, 컴파일, GitHub 푸시
- ⚠️ **부분 작동**: 폴백 모드로만 작동
- ❌ **작동 안함**: Claude Desktop MCP 로드, 실시간 추출

---

## 문제점 및 한계

### 1. MCP 서버 로딩 문제
- Claude Desktop 재시작 후에도 인식 안됨
- STDIO 통신 모드 대기 상태 문제
- MCP 디버깅 도구 부족

### 2. Puppeteer 호환성
- KRDS 사이트와 Puppeteer 간 호환성 문제
- Frame detached 오류 지속
- 실제 데이터 추출 불가

### 3. 개발 과정 비효율
- 초기 요구사항 잘못 이해 (15시간 낭비)
- 반복적인 컴파일 오류 해결
- 테스트 환경 미비

---

## 향후 개선 방향

### 단기 개선사항
1. **정적 분석 방식 전환**
   - Puppeteer 대신 정적 CSS 파일 분석
   - 사전 수집된 디자인 데이터 활용
   - API 기반 접근 방식 검토

2. **디버깅 개선**
   - MCP 서버 로깅 강화
   - 에러 메시지 상세화
   - 테스트 자동화

### 장기 개선사항
1. **실제 KRDS API 연동**
   - 공식 API 존재 여부 확인
   - 정부 오픈 데이터 활용
   - 라이선스 검토

2. **UI 빌더 통합**
   - 시각적 컴포넌트 에디터
   - 실시간 프리뷰
   - 코드 export 기능

---

## 결론

### 성과
1. **기술적 구현**: MCP 서버 구조 완성, 4개 도구 구현
2. **문서화**: 포괄적인 한국어 문서 작성
3. **학습**: MCP 프로토콜 이해, Puppeteer 문제 해결 경험

### 교훈
1. **요구사항 명확화**: 초기 단계에서 충분한 확인 필요
2. **점진적 개발**: 작은 단위로 테스트하며 진행
3. **폴백 전략**: 실패 시나리오 대비 필수

### 최종 평가
- **완성도**: 60% (폴백 모드로만 작동)
- **실용성**: 40% (Claude Desktop 로드 실패)
- **코드 품질**: 85% (구조화된 TypeScript 코드)
- **문서화**: 90% (상세한 한국어 문서)

### 소요 시간 분석
- 초기 스크래핑 서버 개발: 10시간 (낭비)
- 디자인 서버 재개발: 4시간
- 디버깅 및 수정: 3시간
- 문서화: 1시간
- **총 소요 시간**: 18시간

---

**작성자**: Claude Code with VoidLight  
**검토일**: 2025년 1월 12일 19:00  
**상태**: 부분 완료 (Partially Completed)  
**GitHub**: https://github.com/VoidLight00/krds-mcp-server