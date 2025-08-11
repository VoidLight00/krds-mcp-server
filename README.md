# KRDS MCP Server

A comprehensive Model Context Protocol (MCP) server for scraping, processing, and analyzing Korean government documents from the KRDS website (https://v04.krds.go.kr).

## 🚀 Features

### Core Capabilities
- **Korean Language Processing**: Advanced Korean text analysis with romanization, stemming, and keyword extraction
- **Intelligent Scraping**: Puppeteer-based scraping with retry mechanisms and rate limiting
- **Multi-tier Caching**: Memory, Redis, and file-based caching with Korean text optimization
- **MCP Tools**: Complete set of tools for document retrieval, search, navigation, and export
- **Performance Optimized**: Concurrent processing, connection pooling, and resource management
- **Comprehensive Testing**: Unit, integration, and E2E tests with 80%+ code coverage

### MCP Tools
- `retrieve_content` - Retrieve documents by URL or ID with Korean processing
- `search_documents` - Search KRDS website with advanced Korean language support
- `navigate_site` - Browse website structure and categories
- `export_documents` - Export data in multiple formats (JSON, CSV, Excel, PDF)
- `process_images` - Download and process document images
- `analyze_korean_text` - Advanced Korean text analysis with linguistic features

## 📁 Project Structure

```
krds-mcp-server/
├── src/                      # Source code
│   ├── server.ts            # Main MCP server entry point
│   ├── tools/               # MCP tool implementations
│   │   ├── content-retrieval.ts
│   │   ├── search.ts        # Search functionality
│   │   ├── navigation.ts    # Website navigation
│   │   ├── export.ts        # Data export tools
│   │   ├── image-tools.ts   # Image processing
│   │   └── korean-text.ts   # Korean text analysis
│   ├── scraping/            # Web scraping modules
│   │   ├── krds-scraper.ts  # Main KRDS scraper
│   │   ├── navigation-crawler.ts
│   │   ├── content-integration.ts
│   │   └── rate-limiter.ts
│   ├── parsing/             # Content parsing
│   │   ├── content-parser.ts
│   │   ├── korean-text-processor.ts
│   │   ├── image-extractor.ts
│   │   ├── metadata-extractor.ts
│   │   └── table-parser.ts
│   ├── cache/               # Caching system
│   │   ├── cache-manager.ts
│   │   ├── memory-cache.ts
│   │   ├── redis-cache.ts
│   │   ├── file-cache.ts
│   │   └── cache-strategies.ts
│   ├── korean/              # Korean language processing
│   ├── types/               # TypeScript definitions
│   │   └── index.ts
│   └── utils/               # Utility functions
│       ├── config.ts
│       └── logger.ts
├── tests/                   # Test suites
│   ├── unit/               # Unit tests
│   ├── integration/        # Integration tests
│   ├── e2e/               # End-to-end tests
│   ├── helpers/           # Test utilities
│   └── mock-data/         # Test data
├── docs/                   # Documentation
├── config/                 # Configuration files
└── dist/                  # Compiled output
```

## 🛠️ Installation

### Prerequisites
- Node.js 18.0.0 or higher
- npm 9.0.0 or higher
- TypeScript 5.3.0 or higher
- Redis (optional, for distributed caching)

### Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/krds-mcp-server.git
   cd krds-mcp-server
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Build the project**
   ```bash
   npm run build
   ```

5. **Start the server**
   ```bash
   npm start
   ```

### Development Setup

```bash
# Run in development mode with hot reloading
npm run dev

# Run with specific configuration
NODE_ENV=development LOG_LEVEL=debug npm run dev
```

### Docker Setup

```bash
# Build Docker image
npm run docker:build

# Run with Docker Compose
docker-compose up -d

# Or run single container
npm run docker:run
```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
# Server Configuration
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# KRDS Website Configuration
KRDS_BASE_URL=https://v04.krds.go.kr
KRDS_TIMEOUT=30000
KRDS_RETRY_ATTEMPTS=3
KRDS_RETRY_DELAY=1000
KRDS_USER_AGENT=KRDS-MCP-Server/1.0.0

# Rate Limiting
KRDS_RATE_LIMIT_ENABLED=true
KRDS_REQUESTS_PER_MINUTE=60
KRDS_CONCURRENT_REQUESTS=5

# Puppeteer Configuration
PUPPETEER_HEADLESS=true
PUPPETEER_TIMEOUT=30000
PUPPETEER_SLOWMO=0
PUPPETEER_VIEWPORT_WIDTH=1920
PUPPETEER_VIEWPORT_HEIGHT=1080

# Cache Configuration
CACHE_TYPE=memory,redis,file
CACHE_TTL=3600
CACHE_MAX_SIZE=104857600

# Memory Cache
CACHE_MEMORY_MAX_MB=100
CACHE_MEMORY_CLEANUP_INTERVAL=300

# Redis Cache (optional)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_KEY_PREFIX=krds:

# File Cache
CACHE_FILE_BASE_DIR=/tmp/krds-cache
CACHE_FILE_MAX_SIZE_MB=500
CACHE_FILE_CLEANUP_INTERVAL=3600

# Korean Language Processing
KOREAN_PROCESSING_ENABLED=true
KOREAN_STEMMING_ENABLED=true
KOREAN_ROMANIZATION_ENABLED=true
KOREAN_KEYWORD_EXTRACTION_ENABLED=true

# Export Configuration
EXPORT_MAX_FILE_SIZE_MB=50
EXPORT_DEFAULT_FORMAT=json

# Security
CORS_ENABLED=true
CORS_ORIGIN=*
HELMET_ENABLED=true
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

### Advanced Configuration

For detailed configuration options, see the [Configuration Guide](./docs/configuration.md).

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run test:e2e          # End-to-end tests only

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run tests with specific pattern
npm test -- --testNamePattern="Korean.*processing"
```

### Test Structure

- **Unit Tests** (`tests/unit/`): Test individual components in isolation
- **Integration Tests** (`tests/integration/`): Test component interactions
- **E2E Tests** (`tests/e2e/`): Test complete workflows and MCP protocol compliance

### Korean Text Testing

The test suite includes comprehensive Korean language processing tests:

```typescript
// Example Korean text test
describe('Korean Text Processing', () => {
  it('should process government policy documents', async () => {
    const koreanText = '교육부는 새로운 정책을 발표했습니다.';
    const analysis = await koreanProcessor.analyzeText(koreanText);
    
    expect(analysis.keywords).toContain('교육부');
    expect(analysis.romanized).toBe('gyoyugbuneun saeroun jeongchaegeul balphyohaetsseumnida');
    expect(analysis.sentiment).toBe('positive');
  });
});
```

### Performance Testing

```bash
# Run performance benchmarks
npm run test:performance

# Profile memory usage
NODE_OPTIONS="--max-old-space-size=2048" npm run test:e2e
```

## 📚 MCP Tools Documentation

### Content Retrieval Tool

Retrieve Korean government documents with full text processing.

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

**Parameters:**
- `url` (string) - KRDS document URL
- `documentId` (string) - Alternative to URL, document identifier
- `includeImages` (boolean, default: true) - Extract and process images
- `includeAttachments` (boolean, default: true) - Include file attachments
- `processKoreanText` (boolean, default: true) - Enable Korean text processing

**Response:**
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

### Search Tool

Search KRDS documents with advanced Korean language support.

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

### Korean Text Analysis Tool

Perform advanced Korean text analysis with linguistic features.

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

**Response:**
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

### Navigation Tool

Browse KRDS website structure and categories.

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

### Export Tool

Export documents in multiple formats.

```javascript
{
  "name": "export_documents",
  "arguments": {
    "documents": [/* document objects */],
    "format": "pdf",
    "includeImages": true,
    "filename": "education-policies-2024"
  }
}
```

Supported formats: `json`, `csv`, `xlsx`, `pdf`, `xml`

## 🚀 Performance

### Optimization Features

- **Connection Pooling**: Reuse browser instances and HTTP connections
- **Intelligent Caching**: Multi-tier caching with Korean text optimization
- **Concurrent Processing**: Parallel document processing
- **Rate Limiting**: Respectful scraping with configurable limits
- **Memory Management**: Automatic cleanup and resource monitoring

### Performance Benchmarks

Typical performance metrics on modern hardware:

| Operation | Time | Throughput |
|-----------|------|------------|
| Document Retrieval | 1.5-3s | 20-40 docs/min |
| Korean Text Analysis | 50-200ms | 300-1200 texts/min |
| Search Query | 0.8-2s | 30-75 queries/min |
| Cache Hit | 5-20ms | 3000+ ops/min |

### Monitoring

```bash
# View performance metrics
curl http://localhost:3000/metrics

# Check cache statistics
curl http://localhost:3000/cache/stats

# Health check
curl http://localhost:3000/health
```

## 🔧 Development

### Code Quality

```bash
# Linting
npm run lint
npm run lint:fix

# Formatting  
npm run format
npm run format:check

# Type checking
npm run typecheck
```

### Debugging

```bash
# Run with debug logs
LOG_LEVEL=debug npm run dev

# Enable specific debug namespaces
DEBUG=krds:scraper,krds:parser npm run dev

# Profile performance
NODE_OPTIONS="--inspect" npm run dev
```

### Adding New Tools

1. Create tool file in `src/tools/your-tool.ts`:

```typescript
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const yourTool: Tool = {
  name: 'your_tool_name',
  description: 'Tool description',
  inputSchema: {
    type: 'object',
    properties: {
      param: { type: 'string', description: 'Parameter description' }
    },
    required: ['param']
  }
};

export async function yourToolHandler(params: any, context: ToolContext) {
  // Implementation
}
```

2. Register in `src/tools/index.ts`
3. Add tests in `tests/unit/tools/your-tool.test.ts`
4. Update documentation

## 🚢 Deployment

### Production Deployment

```bash
# Build for production
npm run build

# Start production server
NODE_ENV=production npm start

# Or use PM2
pm2 start ecosystem.config.js
```

### Docker Deployment

```bash
# Build image
docker build -t krds-mcp-server .

# Run container
docker run -d \
  --name krds-mcp-server \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e REDIS_HOST=redis \
  krds-mcp-server
```

### Environment-Specific Configurations

- **Development**: `.env.development`
- **Testing**: `.env.test`
- **Staging**: `.env.staging`
- **Production**: `.env.production`

### Health Checks

The server provides health check endpoints:

```bash
# Basic health check
GET /health

# Detailed health check
GET /health/detailed

# Ready check
GET /ready
```

### Monitoring and Logging

- **Structured Logging**: JSON logs with correlation IDs
- **Metrics**: Prometheus-compatible metrics endpoint
- **Error Tracking**: Comprehensive error logging with stack traces
- **Performance Monitoring**: Request timing and resource usage

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./docs/contributing.md) for details.

### Quick Start for Contributors

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass: `npm test`
6. Commit changes: `git commit -m 'Add amazing feature'`
7. Push to branch: `git push origin feature/amazing-feature`
8. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Add comprehensive tests for new features
- Update documentation for API changes
- Use conventional commit messages
- Ensure Korean text handling is properly tested

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🐛 Issues and Support

- **Bug Reports**: [GitHub Issues](https://github.com/yourusername/krds-mcp-server/issues)
- **Feature Requests**: [GitHub Discussions](https://github.com/yourusername/krds-mcp-server/discussions)
- **Security Issues**: Send email to security@yourserver.com

## 📖 Additional Documentation

- [API Documentation](./docs/api.md)
- [Configuration Guide](./docs/configuration.md)
- [Deployment Guide](./docs/deployment.md)
- [Korean Language Processing](./docs/korean-processing.md)
- [Architecture Overview](./docs/architecture.md)
- [Contributing Guide](./docs/contributing.md)

## 🙏 Acknowledgments

- Korean government for providing KRDS data access
- MCP SDK developers and community
- Korean language processing library maintainers
- Open source testing and development tools
- Contributors and community members

---

Built with ❤️ for the Korean government data community