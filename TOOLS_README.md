# KRDS MCP Server - Tools Documentation

This document describes the MCP tools implemented for the KRDS (Korean government Records Data Service) server.

## Overview

The KRDS MCP server provides 6 comprehensive tools for interacting with Korean government data:

1. **Search Tool** - Comprehensive search with Korean language support
2. **Content Retrieval Tool** - Get complete document content with metadata  
3. **Navigation Tool** - Explore site structure and discover content
4. **Image Tools** - Process and analyze images from KRDS documents
5. **Export Tool** - Export documents in various formats
6. **Korean Text Tool** - Advanced Korean text processing and analysis

## Tool Descriptions

### 1. Search Tool (`krds_search`)

**Purpose**: Search KRDS website for Korean government records and documents

**Key Features**:
- Full-text search with Korean language support
- Category and date-based filtering
- Agency and document type filtering
- Relevance and date-based sorting
- Pagination and result limiting
- Caching for performance optimization
- Korean text normalization and processing

**Parameters**:
- `query` (required): Search query in Korean or English
- `queryKorean` (optional): Additional Korean search terms
- `category`, `agency`, `documentType`: Filtering options
- `dateFrom`, `dateTo`: Date range filtering
- `maxResults`: Maximum number of results (default: 20)
- `sortBy`: Sort by relevance, date, or title
- `useCache`: Whether to use cached results

### 2. Content Retrieval Tool (`krds_content_retrieval`)

**Purpose**: Retrieve complete content from specific KRDS documents

**Key Features**:
- Full document content retrieval by URL or document ID
- Image extraction with metadata and download options
- Attachment retrieval with file information
- Korean text processing and normalization
- Content section parsing and structuring
- Caching for performance optimization

**Parameters**:
- `url` or `documentId` (one required): Document identifier
- `includeImages`: Whether to extract images (default: true)
- `includeAttachments`: Whether to extract attachments (default: true)
- `processKoreanText`: Whether to apply Korean text processing
- `maxContentLength`: Maximum content length limit
- `downloadImages`: Whether to download images locally

### 3. Navigation Tool (`krds_navigation`)

**Purpose**: Navigate and explore KRDS website structure

**Key Features**:
- Complete site navigation tree discovery
- Category and subcategory listing
- Page discovery within categories
- Hierarchical content structure mapping
- Korean language navigation support
- Breadcrumb and path resolution

**Parameters**:
- `action` (required): Action type (list_categories, browse_category, get_navigation_tree)
- `category`: Category name for browsing
- `depth`: Maximum tree traversal depth (default: 3)
- `maxResults`: Maximum navigation items (default: 100)
- `language`: Language preference (ko, en, both)

### 4. Image Tools (`krds_image_tools`)

**Purpose**: Extract, process, and analyze images from KRDS documents

**Key Features**:
- Image extraction with complete metadata
- Korean text extraction from images (OCR)
- Image format conversion and optimization
- Image download and local storage
- Bulk image processing for documents
- Image dimension and quality analysis
- Alt text and caption processing in Korean

**Parameters**:
- `documentId`, `url`, or `imageUrl` (one required): Content identifier
- `downloadImages`: Whether to download images locally
- `processImages`: Whether to process images for metadata
- `extractText`: Whether to extract text using OCR
- `maxWidth`, `maxHeight`: Image processing size limits
- `format`: Output image format (original, webp, jpeg, png, avif)

### 5. Export Tool (`krds_export`)

**Purpose**: Export KRDS documents in various formats

**Key Features**:
- Multi-format export (PDF, Markdown, JSON, CSV, XML, Excel, HTML)
- Korean text preservation and formatting
- Image and attachment embedding or linking
- Batch document export with pagination
- Customizable export templates and styling
- Metadata preservation across formats
- Archive creation for multiple documents

**Parameters**:
- `documents` (required): Array of document IDs or objects
- `format` (required): Export format (json, csv, xlsx, pdf, xml, markdown, html)
- `filename`: Custom filename for export
- `includeImages`, `includeAttachments`: Content inclusion options
- `preserveKoreanText`: Whether to preserve Korean text formatting
- `options`: Format-specific export options

### 6. Korean Text Tool (`krds_korean_text`)

**Purpose**: Process and analyze Korean text with government document specialization

**Key Features**:
- Korean text normalization and cleaning
- Hangul romanization and transliteration
- Korean keyword extraction with NLP
- Semantic search with Korean language models
- Government terminology processing
- Korean date and number parsing
- Document classification by Korean content

**Parameters**:
- `action` (required): Processing action (normalize, romanize, extract_keywords, etc.)
- `text` (required): Korean text to process
- `compareText`: Additional text for comparison operations
- `maxKeywords`: Maximum keywords to extract (default: 15)
- `romanizationSystem`: Romanization system (revised, mccune, yale)
- `analysisDepth`: Analysis depth (basic, detailed, comprehensive)

## Architecture Integration

All tools follow consistent patterns:

1. **Input Validation**: Using Zod schemas for type safety
2. **Error Handling**: Comprehensive error handling with detailed logging
3. **Caching**: Optional caching for performance optimization
4. **Korean Language Support**: Specialized Korean text processing throughout
5. **Logging**: Detailed logging for debugging and monitoring
6. **Documentation**: Comprehensive inline documentation and examples

## Usage Examples

### Basic Search
```json
{
  "name": "krds_search",
  "arguments": {
    "query": "환경정책",
    "maxResults": 10,
    "sortBy": "relevance"
  }
}
```

### Content Retrieval
```json
{
  "name": "krds_content_retrieval",
  "arguments": {
    "url": "https://krds.go.kr/document/123",
    "includeImages": true,
    "processKoreanText": true
  }
}
```

### Export Documents
```json
{
  "name": "krds_export",
  "arguments": {
    "documents": ["doc123", "doc456"],
    "format": "pdf",
    "includeImages": true
  }
}
```

### Korean Text Processing
```json
{
  "name": "krds_korean_text",
  "arguments": {
    "action": "extract_keywords",
    "text": "정부의 환경정책에 대한 보고서입니다.",
    "maxKeywords": 10
  }
}
```

## Error Handling

All tools implement comprehensive error handling:

- **Validation Errors**: Input parameter validation with detailed messages
- **Network Errors**: Retry mechanisms and timeout handling
- **Processing Errors**: Graceful degradation and partial results
- **Cache Errors**: Fallback to direct processing when cache fails
- **Korean Text Errors**: Encoding and processing error handling

## Performance Considerations

- **Caching**: All tools support optional caching for improved performance
- **Rate Limiting**: Respectful scraping with built-in rate limiting
- **Chunking**: Large content processing with pagination support  
- **Timeout Handling**: Configurable timeouts for all operations
- **Resource Management**: Proper cleanup and resource management

## Future Enhancements

Potential improvements include:

1. **Machine Learning**: Enhanced Korean NLP with ML models
2. **Real-time Processing**: WebSocket support for real-time updates
3. **Advanced OCR**: Better Korean OCR with specialized models
4. **Data Analysis**: Statistical analysis tools for government data
5. **API Integration**: Integration with other government APIs
6. **Mobile Support**: Mobile-optimized content processing

---

*Generated for KRDS MCP Server v1.0.0*