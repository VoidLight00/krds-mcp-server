# KRDS Design System MCP Server 🎨

한국 정부 KRDS 웹사이트(https://v04.krds.go.kr)의 UI/UX 패턴과 디자인 시스템을 추출하는 MCP 서버입니다.
Magic MCP와 유사한 방식으로 웹사이트의 디자인 요소를 분석하고 재사용 가능한 컴포넌트로 변환합니다.

## 🚀 주요 기능

### 디자인 시스템 추출
- **색상 팔레트**: Primary, Secondary, Semantic colors 추출
- **타이포그래피**: 폰트, 크기, 굵기, 행간 분석
- **여백 시스템**: Margins, Paddings, Gaps 매핑
- **컴포넌트 패턴**: Header, Navigation, Form, Table, Card 등 식별

### 4가지 MCP 도구

#### 1. `analyze_design`
KRDS 디자인 시스템 전체 분석

```javascript
{
  "name": "analyze_design",
  "arguments": {
    "url": "https://v04.krds.go.kr",
    "depth": "detailed"  // basic | detailed | complete
  }
}
```

**응답 예시:**
```
# 🎨 KRDS 디자인 시스템 분석

## 색상 팔레트
• rgb(0, 55, 100)  - Primary Blue
• rgb(0, 160, 233) - Secondary Blue
• rgb(248, 249, 250) - Background

## 타이포그래피
### 폰트
• "Noto Sans KR", -apple-system, sans-serif

### 크기
• 14px - Body text
• 16px - Subtitle
• 20px - Title

## 컴포넌트 발견
• Headers: 2개
• Navigation: 3개
• Forms: 5개
• Tables: 8개
```

#### 2. `extract_component`
특정 UI 컴포넌트 추출

```javascript
{
  "name": "extract_component",
  "arguments": {
    "componentType": "header",  // header|navigation|form|table|card|button|footer
    "url": "https://v04.krds.go.kr"
  }
}
```

**응답 예시:**
```
# 📦 HEADER 컴포넌트

## HTML 구조
\`\`\`html
<header class="main-header">
  <div class="container">
    <h1>KRDS</h1>
    <nav>...</nav>
  </div>
</header>
\`\`\`

## CSS 스타일
\`\`\`css
display: flex;
backgroundColor: #003764;
padding: 1rem 2rem;
\`\`\`
```

#### 3. `get_design_tokens`
디자인 토큰 CSS 변수 생성

```javascript
{
  "name": "get_design_tokens",
  "arguments": {
    "category": "all"  // colors | typography | spacing | all
  }
}
```

**응답 예시:**
```css
/* KRDS Design Tokens */
:root {
  /* Primary Colors */
  --krds-primary: #003764;
  --krds-primary-light: #0056a6;
  
  /* Typography */
  --krds-font-primary: 'Noto Sans KR', sans-serif;
  --krds-text-base: 1rem;
  --krds-text-lg: 1.125rem;
  
  /* Spacing */
  --krds-space-4: 1rem;
  --krds-space-8: 2rem;
  
  /* Border Radius */
  --krds-radius-md: 0.25rem;
}
```

#### 4. `generate_code`
KRDS 패턴 기반 컴포넌트 코드 생성

```javascript
{
  "name": "generate_code",
  "arguments": {
    "componentType": "button",
    "framework": "react",  // html | react | vue | angular
    "style": "css"  // inline | css | styled-components | tailwind
  }
}
```

**응답 예시:**
```jsx
// React Component
import React from 'react';

const KrdsButton = ({ children, variant = 'primary', onClick }) => {
  return (
    <button 
      className={`krds-button krds-button--${variant}`}
      onClick={onClick}
    >
      <span className="krds-button__text">{children}</span>
    </button>
  );
};

export default KrdsButton;
```

## 🛠️ 설치 및 설정

### 1. MCP 서버 설치

```bash
# 프로젝트 복제
git clone https://github.com/yourusername/krds-mcp-server.git
cd krds-mcp-server

# 종속성 설치
npm install

# 빌드
npm run build
```

### 2. Claude Desktop 설정

`~/.claude/mcp_settings.json` 파일에 추가:

```json
{
  "mcpServers": {
    "krds": {
      "command": "node",
      "args": ["/path/to/krds-mcp-server/dist/server-design.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

### 3. 사용 방법

Claude Desktop을 재시작한 후 도구 사용:

```
1. 디자인 시스템 분석
   - "KRDS 웹사이트의 디자인 시스템을 분석해줘"
   
2. 컴포넌트 추출
   - "KRDS의 헤더 컴포넌트를 추출해줘"
   
3. 디자인 토큰 생성
   - "KRDS 색상 팔레트를 CSS 변수로 만들어줘"
   
4. 코드 생성
   - "KRDS 스타일의 React 버튼 컴포넌트를 만들어줘"
```

## 📋 사용 사례

### 정부 웹사이트 개발
```javascript
// 1. 디자인 시스템 분석
const design = await analyze_design({ url: 'https://v04.krds.go.kr' });

// 2. 컴포넌트 추출
const header = await extract_component({ componentType: 'header' });

// 3. 디자인 토큰 생성
const tokens = await get_design_tokens({ category: 'all' });

// 4. React 컴포넌트 생성
const button = await generate_code({ 
  componentType: 'button', 
  framework: 'react' 
});
```

### 디자인 일관성 유지
- KRDS 공식 색상 및 타이포그래피 사용
- 정부 웹 접근성 가이드라인 준수
- 반응형 디자인 패턴 적용
- 한국어 UI 최적화

## 🎨 지원 프레임워크

### 프론트엔드 프레임워크
- **HTML/CSS**: 순수 마크업
- **React**: JSX 컴포넌트
- **Vue**: 템플릿 컴포넌트  
- **Angular**: TypeScript 컴포넌트

### 스타일링 옵션
- **CSS**: 표준 CSS
- **Inline**: 인라인 스타일
- **Styled Components**: CSS-in-JS
- **Tailwind**: 유틸리티 클래스

## 🏛️ 정부 표준 준수

### 웹 접근성
- WCAG 2.1 AA 준수
- 키보드 네비게이션 지원
- 스크린 리더 호환
- 색상 대비 검증

### 한국 정부 브랜딩
- 공식 색상 팔레트
- 표준 타이포그래피
- 로고 배치 가이드라인
- 레이아웃 요구사항

## 🔧 고급 기능

### 캐싱
- 디자인 시스템 분석 결과 캐싱
- 컴포넌트 추출 결과 재사용
- 성능 최적화

### 실시간 분석
- Puppeteer 기반 동적 콘텐츠 분석
- CSS Custom Properties 추출
- Computed Styles 분석
- DOM 구조 파싱

## 📚 관련 문서

- [디자인 시스템 가이드](./docs/DESIGN_SYSTEM_GUIDE.md)
- [컴포넌트 카탈로그](./docs/COMPONENT_CATALOG.md)
- [API 문서](./docs/API.md)
- [기여 가이드](./CONTRIBUTING.md)

## 🚀 로드맵

### 계획된 기능
- [ ] Figma 플러그인 연동
- [ ] Sketch 익스포트
- [ ] Adobe XD 통합
- [ ] Storybook 생성
- [ ] 다크모드 지원
- [ ] 애니메이션 패턴 추출
- [ ] 접근성 자동 검증
- [ ] 성능 메트릭 분석

## 🤝 기여

기여를 환영합니다! PR을 보내주세요.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 라이선스

MIT License - 자세한 내용은 [LICENSE](LICENSE) 파일 참조

## 🙏 감사의 말

- 한국 정부 KRDS 팀
- Magic MCP 개발자
- MCP SDK 커뮤니티
- 오픈소스 기여자들

---

Made with ❤️ for Korean Government Web Development Community