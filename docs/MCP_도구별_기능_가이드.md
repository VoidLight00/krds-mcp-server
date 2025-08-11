# KRDS MCP 도구별 기능 상세 가이드 🛠️

## 📋 개요

KRDS MCP 서버는 한국 정부 웹사이트의 콘텐츠를 효과적으로 처리하기 위한 6개의 전문 도구를 제공합니다. 각 도구는 특정한 역할과 기능을 가지고 있으며, 한국어 텍스트 처리에 최적화되어 있습니다.

---

## 🔍 1. search_documents (문서 검색 도구)

### 주요 역할
- KRDS 웹사이트 전체에서 키워드 기반 문서 검색
- 한국어 검색어 처리 및 형태소 분석
- 관련도 기반 검색 결과 정렬

### 핵심 기능
✅ **한국어 검색 최적화**
- 한글 자모 분리/결합 자동 처리
- 한국어 불용어 제거
- 동의어 및 유의어 확장 검색

✅ **지능형 필터링**
- 기관별 문서 필터링 (교육부, 행정안전부 등)
- 문서 유형별 분류 (가이드라인, 매뉴얼, 보고서)
- 발행일 범위 지정 검색

✅ **검색 결과 최적화**
- 관련도 점수 계산
- 중복 문서 제거
- 요약 정보 자동 생성

### 사용 예시
```json
{
  "tool": "search_documents",
  "arguments": {
    "query": "웹 접근성 가이드라인",
    "maxResults": 20,
    "category": "accessibility",
    "agency": "교육부",
    "dateFrom": "2023-01-01",
    "sortBy": "relevance"
  }
}
```

### 응답 형태
```json
{
  "results": [
    {
      "title": "웹 접근성 가이드라인 2024 버전",
      "url": "https://v04.krds.go.kr/guide/accessibility/...",
      "summary": "정부 웹사이트의 접근성 준수를 위한 종합 가이드라인",
      "relevanceScore": 0.95,
      "lastUpdated": "2024-01-15",
      "agency": "교육부",
      "documentType": "가이드라인"
    }
  ]
}
```

---

## 📄 2. retrieve_content (콘텐츠 추출 도구)

### 주요 역할
- 특정 KRDS 페이지의 모든 콘텐츠 추출
- 구조화된 데이터로 변환
- 한국어 텍스트 전처리 및 최적화

### 핵심 기능
✅ **전체 페이지 분석**
- HTML 구조 분석 및 콘텐츠 추출
- 메타데이터 자동 수집 (제목, 작성자, 발행일)
- 내장된 링크 및 참조 정보 추출

✅ **한국어 텍스트 처리**
- 한글 정규화 (NFC/NFD)
- 특수문자 및 공백 정리
- 문단 구조 보존

✅ **미디어 콘텐츠 처리**
- 이미지 URL 및 메타데이터 수집
- 표(Table) 구조 분석 및 데이터 추출
- PDF 링크 및 첨부파일 정보

### 사용 예시
```json
{
  "tool": "retrieve_content",
  "arguments": {
    "url": "https://v04.krds.go.kr/guide/outline/outline_01.html",
    "includeImages": true,
    "processKoreanText": true,
    "extractTables": true
  }
}
```

### 응답 형태
```json
{
  "content": {
    "title": "KRDS 개요 및 목적",
    "rawText": "원본 HTML 텍스트...",
    "processedText": "정제된 한국어 텍스트...",
    "structure": {
      "headings": ["개요", "목적", "적용범위"],
      "paragraphs": 15,
      "sections": 3
    },
    "metadata": {
      "author": "디지털정부부",
      "publishDate": "2024-01-10",
      "lastModified": "2024-03-15"
    },
    "media": {
      "images": [
        {
          "url": "https://v04.krds.go.kr/images/diagram1.png",
          "alt": "KRDS 구조도",
          "size": "1024x768"
        }
      ],
      "tables": [
        {
          "caption": "접근성 체크리스트",
          "rows": 12,
          "columns": 4,
          "data": "..."
        }
      ]
    }
  }
}
```

---

## 🧭 3. navigate_site (사이트 탐색 도구)

### 주요 역할
- KRDS 웹사이트의 전체 구조 매핑
- 카테고리별 콘텐츠 분류
- 사이트맵 자동 생성

### 핵심 기능
✅ **지능형 사이트 구조 분석**
- 메뉴 구조 자동 탐지
- 브레드크럼(Breadcrumb) 분석
- 페이지 계층 관계 매핑

✅ **카테고리별 분류**
- 주제별 문서 그룹화
- 기관별 콘텐츠 분류
- 문서 유형별 정리

✅ **새로운 콘텐츠 탐지**
- 신규 페이지 자동 발견
- 업데이트된 콘텐츠 식별
- 링크 상태 검증

### 사용 예시
```json
{
  "tool": "navigate_site",
  "arguments": {
    "startUrl": "https://v04.krds.go.kr",
    "maxDepth": 3,
    "discoverCategories": true,
    "followExternalLinks": false
  }
}
```

### 응답 형태
```json
{
  "siteStructure": {
    "totalPages": 156,
    "categories": [
      {
        "name": "가이드라인",
        "url": "https://v04.krds.go.kr/guide/",
        "subcategories": ["접근성", "UI/UX", "모바일"],
        "pageCount": 45
      }
    ],
    "navigationTree": {
      "root": "KRDS 홈",
      "children": [
        {
          "title": "개요",
          "url": "/guide/outline/",
          "children": ["개요_01", "개요_02"]
        }
      ]
    }
  }
}
```

---

## 🖼️ 4. process_images (이미지 처리 도구)

### 주요 역할
- KRDS 문서 내 이미지 추출 및 분석
- 이미지 메타데이터 수집
- 한국어 OCR 텍스트 추출

### 핵심 기능
✅ **이미지 자동 추출**
- 웹페이지 내 모든 이미지 수집
- 고해상도 원본 이미지 다운로드
- 이미지 형식 자동 변환

✅ **한국어 OCR 처리**
- 이미지 내 한글 텍스트 인식
- 표 형태 데이터 구조화
- 차트 및 그래프 데이터 추출

✅ **메타데이터 분석**
- 이미지 크기, 해상도 정보
- 파일 형식 및 압축 정보
- Alt 텍스트 및 캡션 수집

### 사용 예시
```json
{
  "tool": "process_images",
  "arguments": {
    "url": "https://v04.krds.go.kr/guide/design/color_01.html",
    "downloadImages": true,
    "performOCR": true,
    "extractCharts": true
  }
}
```

### 응답 형태
```json
{
  "images": [
    {
      "url": "https://v04.krds.go.kr/images/color_palette.png",
      "localPath": "/cache/images/color_palette.png",
      "metadata": {
        "width": 800,
        "height": 600,
        "format": "PNG",
        "size": "245KB"
      },
      "ocrText": "정부 웹사이트 컬러 팔레트\n주색상: #1B365D\n보조색상: #E8F4F8",
      "analysis": {
        "type": "차트",
        "description": "컬러 팔레트 가이드라인",
        "textContent": "한글 텍스트 내용..."
      }
    }
  ]
}
```

---

## 📊 5. export_documents (문서 내보내기 도구)

### 주요 역할
- 수집된 데이터를 다양한 형식으로 내보내기
- 한국어 콘텐츠 최적화된 포맷팅
- 대용량 데이터 처리

### 핵심 기능
✅ **다양한 내보내기 형식**
- JSON: API 연동 및 개발자용
- CSV: 데이터 분석 및 스프레드시트
- XLSX: Excel 호환 고급 분석
- PDF: 문서 보고서 형태

✅ **한국어 최적화**
- UTF-8 인코딩 보장
- 한글 폰트 최적화 (PDF)
- 한국어 정렬 및 정리

✅ **사용자 정의 형식**
- 템플릿 기반 내보내기
- 필드 선택 및 필터링
- 자동 요약 및 통계

### 사용 예시
```json
{
  "tool": "export_documents",
  "arguments": {
    "data": "검색결과_데이터_ID",
    "format": "xlsx",
    "includeImages": true,
    "template": "정부문서_템플릿",
    "filename": "KRDS_가이드라인_모음_2024"
  }
}
```

### 응답 형태
```json
{
  "export": {
    "format": "xlsx",
    "filename": "KRDS_가이드라인_모음_2024.xlsx",
    "size": "2.3MB",
    "path": "/exports/KRDS_가이드라인_모음_2024.xlsx",
    "summary": {
      "totalDocuments": 45,
      "totalPages": 156,
      "categories": 8,
      "images": 23
    },
    "downloadUrl": "https://cache.krds-mcp/exports/..."
  }
}
```

---

## 🔤 6. analyze_korean_text (한국어 텍스트 분석 도구)

### 주요 역할
- 한국어 텍스트의 고급 언어학적 분석
- 정부 문서 특화 키워드 추출
- 문서 감정 및 어조 분석

### 핵심 기능
✅ **형태소 분석**
- 한국어 단어 분해 및 품사 태깅
- 어근 추출 및 활용형 분석
- 복합어 분해 및 의미 분석

✅ **정부 문서 전문 분석**
- 행정 용어 및 법령 용어 인식
- 기관별 특수 용어 처리
- 문서 유형별 특성 분석

✅ **의미 분석**
- 키워드 중요도 계산
- 문서간 유사도 분석
- 주제 모델링 및 카테고리 추천

### 사용 예시
```json
{
  "tool": "analyze_korean_text",
  "arguments": {
    "text": "정부 웹사이트의 사용자 접근성을 향상시키기 위한 종합적인 가이드라인을 제시합니다...",
    "analysisType": "comprehensive",
    "extractKeywords": true,
    "performSentiment": true,
    "governmentTerms": true
  }
}
```

### 응답 형태
```json
{
  "analysis": {
    "textStats": {
      "totalCharacters": 1250,
      "totalWords": 89,
      "sentences": 12,
      "paragraphs": 4
    },
    "morphologyAnalysis": [
      {
        "word": "접근성",
        "pos": "명사",
        "lemma": "접근성",
        "frequency": 8
      }
    ],
    "keywords": [
      {
        "term": "웹 접근성",
        "score": 0.89,
        "frequency": 12,
        "importance": "high"
      }
    ],
    "governmentTerms": [
      {
        "term": "디지털정부",
        "category": "정책용어",
        "definition": "디지털 기술을 활용한 정부 서비스"
      }
    ],
    "sentiment": {
      "overall": "중립",
      "positivity": 0.65,
      "formality": "formal",
      "tone": "informative"
    }
  }
}
```

---

## 🎯 통합 사용 시나리오

### 시나리오 1: 전체 사이트 분석
```bash
1. navigate_site → 사이트 구조 파악
2. search_documents → 관심 주제 문서 검색
3. retrieve_content → 상세 콘텐츠 추출
4. analyze_korean_text → 텍스트 분석
5. export_documents → 결과 내보내기
```

### 시나리오 2: 특정 주제 심층 분석
```bash
1. search_documents → "웹 접근성" 관련 문서 검색
2. process_images → 관련 이미지 및 차트 분석
3. analyze_korean_text → 전문 용어 및 키워드 추출
4. export_documents → PDF 보고서 생성
```

### 시나리오 3: 정기적 모니터링
```bash
1. navigate_site → 새로운 콘텐츠 탐지
2. retrieve_content → 업데이트된 페이지 추출
3. analyze_korean_text → 변경 사항 분석
4. export_documents → 변경 리포트 생성
```

---

## 📈 성능 및 제한사항

### 처리 성능
- **동시 요청**: 최대 10개 동시 처리
- **페이지 처리 속도**: 평균 2-3초/페이지
- **대용량 문서**: 최대 50MB 텍스트 처리 가능
- **이미지 처리**: 최대 20MB/이미지, 100개/배치

### 제한사항
- **robots.txt 준수**: 웹사이트 정책 엄격 준수
- **속도 제한**: 초당 최대 2-3 요청으로 제한
- **메모리 사용**: 대용량 처리 시 8GB RAM 권장
- **저장 공간**: 캐시 및 내보내기 파일용 충분한 디스크 공간 필요

---

## 🛡️ 보안 및 개인정보 보호

### 데이터 보안
- **HTTPS 전용**: 모든 통신 암호화
- **접근 로그**: 모든 요청 기록 및 모니터링
- **캐시 암호화**: 민감한 데이터 암호화 저장
- **자동 삭제**: 임시 파일 자동 정리

### 개인정보 보호
- **익명화**: 개인 식별 정보 자동 제거
- **데이터 최소화**: 필요한 데이터만 수집
- **보존 기간**: 캐시 데이터 자동 만료
- **규정 준수**: 정부 데이터 처리 규정 준수

---

이 가이드를 통해 KRDS MCP 서버의 각 도구를 효과적으로 활용하여 한국 정부 웹사이트의 콘텐츠를 체계적으로 처리하고 분석할 수 있습니다. 🚀