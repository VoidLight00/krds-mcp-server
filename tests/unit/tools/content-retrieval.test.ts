/**
 * Content Retrieval Tool Unit Tests
 * 
 * Tests for the MCP content retrieval tool functionality:
 * - Document retrieval by URL and ID
 * - Korean text processing integration
 * - Image and attachment handling
 * - Error handling and validation
 * - Cache integration
 * 
 * @author KRDS MCP Server
 * @version 1.0.0
 */

import { jest } from '@jest/globals';
import { contentRetrievalTool } from '@/tools/content-retrieval.js';
import type { ContentRetrievalParams, ToolContext, KrdsDocument } from '@/types/index.js';
import { createMockLogger, createMockToolContext } from '../../helpers/test-helpers.js';
import { mockKrdsDocument } from '../../mock-data/krds-mock-data.js';

describe('Content Retrieval Tool', () => {
  let mockContext: ToolContext;
  let mockKrdsService: any;
  let mockCacheManager: any;

  beforeEach(() => {
    mockKrdsService = {
      scrapeDocument: jest.fn(),
      getDocument: jest.fn(),
      validateUrl: jest.fn(),
    };

    mockCacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      has: jest.fn(),
    };

    mockContext = createMockToolContext({
      krdsService: mockKrdsService,
      cacheManager: mockCacheManager,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Tool Definition', () => {
    it('should have correct tool definition', () => {
      expect(contentRetrievalTool.name).toBe('retrieve_content');
      expect(contentRetrievalTool.description).toContain('KRDS website');
      expect(contentRetrievalTool.inputSchema.type).toBe('object');
      expect(contentRetrievalTool.inputSchema.properties).toHaveProperty('url');
      expect(contentRetrievalTool.inputSchema.properties).toHaveProperty('documentId');
    });

    it('should have proper parameter validation schema', () => {
      const schema = contentRetrievalTool.inputSchema;
      
      expect(schema.properties.url).toMatchObject({
        type: 'string',
        description: expect.stringContaining('KRDS'),
      });
      
      expect(schema.properties.includeImages).toMatchObject({
        type: 'boolean',
        default: true,
      });

      expect(schema.properties.processKoreanText).toMatchObject({
        type: 'boolean',
        default: true,
      });
    });
  });

  describe('URL-based Content Retrieval', () => {
    const testUrl = 'https://v04.krds.go.kr/documents/policy/123';
    const mockDocument = mockKrdsDocument();

    it('should retrieve document by URL successfully', async () => {
      const params: ContentRetrievalParams = {
        url: testUrl,
        includeImages: true,
        includeAttachments: true,
        processKoreanText: true,
      };

      mockKrdsService.validateUrl.mockReturnValue(true);
      mockKrdsService.scrapeDocument.mockResolvedValue({
        success: true,
        document: mockDocument,
        executionTimeMs: 1500,
      });

      const result = await contentRetrievalTool.handler(params, mockContext);

      expect(result.success).toBe(true);
      expect(result.document).toEqual(mockDocument);
      expect(result.executionTimeMs).toBe(1500);
      expect(mockKrdsService.scrapeDocument).toHaveBeenCalledWith(testUrl, {
        includeImages: true,
        includeAttachments: true,
        processKoreanText: true,
        useCache: true,
        retryOnFailure: true,
        maxRetries: 3,
        timeout: 30000,
      });
    });

    it('should handle invalid URLs', async () => {
      const params: ContentRetrievalParams = {
        url: 'https://example.com/not-krds',
        includeImages: false,
        includeAttachments: false,
        processKoreanText: false,
      };

      mockKrdsService.validateUrl.mockReturnValue(false);

      const result = await contentRetrievalTool.handler(params, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid KRDS URL');
      expect(mockKrdsService.scrapeDocument).not.toHaveBeenCalled();
    });

    it('should handle scraping failures', async () => {
      const params: ContentRetrievalParams = {
        url: testUrl,
        includeImages: false,
        includeAttachments: false,
        processKoreanText: false,
      };

      mockKrdsService.validateUrl.mockReturnValue(true);
      mockKrdsService.scrapeDocument.mockResolvedValue({
        success: false,
        error: 'Network timeout occurred',
        retryCount: 3,
        executionTimeMs: 30000,
      });

      const result = await contentRetrievalTool.handler(params, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network timeout occurred');
      expect(result.retryCount).toBe(3);
    });

    it('should handle network errors gracefully', async () => {
      const params: ContentRetrievalParams = {
        url: testUrl,
        includeImages: false,
        includeAttachments: false,
        processKoreanText: false,
      };

      mockKrdsService.validateUrl.mockReturnValue(true);
      mockKrdsService.scrapeDocument.mockRejectedValue(new Error('Connection refused'));

      const result = await contentRetrievalTool.handler(params, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection refused');
    });
  });

  describe('Document ID-based Retrieval', () => {
    const testDocumentId = 'doc-123-policy-education';
    const mockDocument = mockKrdsDocument();

    it('should retrieve document by ID successfully', async () => {
      const params: ContentRetrievalParams = {
        documentId: testDocumentId,
        includeImages: true,
        includeAttachments: false,
        processKoreanText: true,
      };

      mockKrdsService.getDocument.mockResolvedValue({
        success: true,
        document: mockDocument,
        executionTimeMs: 800,
      });

      const result = await contentRetrievalTool.handler(params, mockContext);

      expect(result.success).toBe(true);
      expect(result.document).toEqual(mockDocument);
      expect(mockKrdsService.getDocument).toHaveBeenCalledWith(testDocumentId, {
        includeImages: true,
        includeAttachments: false,
        processKoreanText: true,
      });
    });

    it('should handle document not found', async () => {
      const params: ContentRetrievalParams = {
        documentId: 'nonexistent-doc',
        includeImages: false,
        includeAttachments: false,
        processKoreanText: false,
      };

      mockKrdsService.getDocument.mockResolvedValue({
        success: false,
        error: 'Document not found',
        executionTimeMs: 100,
      });

      const result = await contentRetrievalTool.handler(params, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Document not found');
    });

    it('should validate document ID format', async () => {
      const params: ContentRetrievalParams = {
        documentId: '', // Empty ID
        includeImages: false,
        includeAttachments: false,
        processKoreanText: false,
      };

      const result = await contentRetrievalTool.handler(params, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Document ID cannot be empty');
      expect(mockKrdsService.getDocument).not.toHaveBeenCalled();
    });
  });

  describe('Parameter Validation', () => {
    it('should require either URL or document ID', async () => {
      const params: ContentRetrievalParams = {
        includeImages: true,
        includeAttachments: true,
        processKoreanText: true,
      };

      const result = await contentRetrievalTool.handler(params, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Either url or documentId must be provided');
    });

    it('should not allow both URL and document ID', async () => {
      const params: ContentRetrievalParams = {
        url: 'https://v04.krds.go.kr/doc/123',
        documentId: 'doc-456',
        includeImages: false,
        includeAttachments: false,
        processKoreanText: false,
      };

      const result = await contentRetrievalTool.handler(params, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot provide both url and documentId');
    });

    it('should use default parameter values', async () => {
      const params: ContentRetrievalParams = {
        url: 'https://v04.krds.go.kr/doc/123',
        includeImages: true, // Required params only
        includeAttachments: false,
        processKoreanText: true,
      };

      mockKrdsService.validateUrl.mockReturnValue(true);
      mockKrdsService.scrapeDocument.mockResolvedValue({
        success: true,
        document: mockKrdsDocument(),
        executionTimeMs: 1000,
      });

      await contentRetrievalTool.handler(params, mockContext);

      expect(mockKrdsService.scrapeDocument).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          includeImages: true,
          includeAttachments: false,
          processKoreanText: true,
        })
      );
    });
  });

  describe('Korean Text Processing Integration', () => {
    const testUrl = 'https://v04.krds.go.kr/policy/korean-doc';

    it('should process Korean text when enabled', async () => {
      const params: ContentRetrievalParams = {
        url: testUrl,
        includeImages: false,
        includeAttachments: false,
        processKoreanText: true,
      };

      const mockDocumentWithKorean = {
        ...mockKrdsDocument(),
        title: '교육부 정책 문서',
        titleKorean: '교육부 정책 문서',
        content: '이 문서는 교육부의 새로운 정책에 관한 내용입니다.',
        contentKorean: '이 문서는 교육부의 새로운 정책에 관한 내용입니다.',
        metadata: {
          ...mockKrdsDocument().metadata,
          keywordsKorean: ['교육부', '정책', '문서'],
          language: 'ko' as const,
        },
      };

      mockKrdsService.validateUrl.mockReturnValue(true);
      mockKrdsService.scrapeDocument.mockResolvedValue({
        success: true,
        document: mockDocumentWithKorean,
        executionTimeMs: 2000,
      });

      const result = await contentRetrievalTool.handler(params, mockContext);

      expect(result.success).toBe(true);
      expect(result.document.titleKorean).toBe('교육부 정책 문서');
      expect(result.document.contentKorean).toContain('교육부');
      expect(result.document.metadata.keywordsKorean).toContain('정책');
      expect(result.document.metadata.language).toBe('ko');
    });

    it('should skip Korean processing when disabled', async () => {
      const params: ContentRetrievalParams = {
        url: testUrl,
        includeImages: false,
        includeAttachments: false,
        processKoreanText: false,
      };

      mockKrdsService.validateUrl.mockReturnValue(true);
      mockKrdsService.scrapeDocument.mockResolvedValue({
        success: true,
        document: mockKrdsDocument(),
        executionTimeMs: 1200,
      });

      const result = await contentRetrievalTool.handler(params, mockContext);

      expect(result.success).toBe(true);
      expect(mockKrdsService.scrapeDocument).toHaveBeenCalledWith(
        testUrl,
        expect.objectContaining({
          processKoreanText: false,
        })
      );
    });
  });

  describe('Image and Attachment Handling', () => {
    const testUrl = 'https://v04.krds.go.kr/report/with-media';

    it('should include images when requested', async () => {
      const params: ContentRetrievalParams = {
        url: testUrl,
        includeImages: true,
        includeAttachments: false,
        processKoreanText: false,
      };

      const mockDocumentWithImages = {
        ...mockKrdsDocument(),
        images: [
          {
            id: 'img-1',
            url: 'https://v04.krds.go.kr/images/chart.png',
            alt: 'Statistics Chart',
            altKorean: '통계 차트',
            format: 'png',
            sizeBytes: 245760,
            width: 800,
            height: 600,
          },
          {
            id: 'img-2',
            url: 'https://v04.krds.go.kr/images/graph.jpg',
            alt: 'Performance Graph',
            altKorean: '성과 그래프',
            format: 'jpg',
            sizeBytes: 156890,
            width: 1024,
            height: 768,
          },
        ],
      };

      mockKrdsService.validateUrl.mockReturnValue(true);
      mockKrdsService.scrapeDocument.mockResolvedValue({
        success: true,
        document: mockDocumentWithImages,
        executionTimeMs: 3000,
      });

      const result = await contentRetrievalTool.handler(params, mockContext);

      expect(result.success).toBe(true);
      expect(result.document.images).toHaveLength(2);
      expect(result.document.images[0]).toMatchObject({
        alt: 'Statistics Chart',
        altKorean: '통계 차트',
        format: 'png',
      });
    });

    it('should include attachments when requested', async () => {
      const params: ContentRetrievalParams = {
        url: testUrl,
        includeImages: false,
        includeAttachments: true,
        processKoreanText: false,
      };

      const mockDocumentWithAttachments = {
        ...mockKrdsDocument(),
        attachments: [
          {
            id: 'att-1',
            filename: '정책보고서.pdf',
            url: 'https://v04.krds.go.kr/files/report.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 2048576,
            description: 'Policy Report Document',
            descriptionKorean: '정책 보고서 문서',
          },
          {
            id: 'att-2',
            filename: '통계데이터.xlsx',
            url: 'https://v04.krds.go.kr/files/statistics.xlsx',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            sizeBytes: 512000,
            description: 'Statistical Data',
            descriptionKorean: '통계 데이터',
          },
        ],
      };

      mockKrdsService.validateUrl.mockReturnValue(true);
      mockKrdsService.scrapeDocument.mockResolvedValue({
        success: true,
        document: mockDocumentWithAttachments,
        executionTimeMs: 2500,
      });

      const result = await contentRetrievalTool.handler(params, mockContext);

      expect(result.success).toBe(true);
      expect(result.document.attachments).toHaveLength(2);
      expect(result.document.attachments[0]).toMatchObject({
        filename: '정책보고서.pdf',
        mimeType: 'application/pdf',
        descriptionKorean: '정책 보고서 문서',
      });
    });

    it('should exclude media when not requested', async () => {
      const params: ContentRetrievalParams = {
        url: testUrl,
        includeImages: false,
        includeAttachments: false,
        processKoreanText: false,
      };

      mockKrdsService.validateUrl.mockReturnValue(true);
      mockKrdsService.scrapeDocument.mockResolvedValue({
        success: true,
        document: {
          ...mockKrdsDocument(),
          images: [],
          attachments: [],
        },
        executionTimeMs: 800,
      });

      const result = await contentRetrievalTool.handler(params, mockContext);

      expect(result.success).toBe(true);
      expect(result.document.images).toHaveLength(0);
      expect(result.document.attachments).toHaveLength(0);
    });
  });

  describe('Cache Integration', () => {
    const testUrl = 'https://v04.krds.go.kr/cached/doc';

    it('should use cached results when available', async () => {
      const params: ContentRetrievalParams = {
        url: testUrl,
        includeImages: false,
        includeAttachments: false,
        processKoreanText: false,
      };

      const cachedDocument = mockKrdsDocument();
      mockKrdsService.validateUrl.mockReturnValue(true);
      
      // Mock scraper to return cached result
      mockKrdsService.scrapeDocument.mockResolvedValue({
        success: true,
        document: cachedDocument,
        executionTimeMs: 50, // Fast response indicates cache hit
        fromCache: true,
      });

      const result = await contentRetrievalTool.handler(params, mockContext);

      expect(result.success).toBe(true);
      expect(result.document).toEqual(cachedDocument);
      expect(result.executionTimeMs).toBe(50);
    });

    it('should handle cache errors gracefully', async () => {
      const params: ContentRetrievalParams = {
        url: testUrl,
        includeImages: false,
        includeAttachments: false,
        processKoreanText: false,
      };

      mockKrdsService.validateUrl.mockReturnValue(true);
      // Cache error shouldn't prevent operation
      mockKrdsService.scrapeDocument.mockResolvedValue({
        success: true,
        document: mockKrdsDocument(),
        executionTimeMs: 2000,
        cacheError: 'Cache backend unavailable',
      });

      const result = await contentRetrievalTool.handler(params, mockContext);

      expect(result.success).toBe(true);
      expect(result.document).toBeDefined();
      // Should log cache warning but continue operation
    });
  });

  describe('Performance and Timeout Handling', () => {
    const testUrl = 'https://v04.krds.go.kr/slow/document';

    it('should handle long-running operations', async () => {
      const params: ContentRetrievalParams = {
        url: testUrl,
        includeImages: true,
        includeAttachments: true,
        processKoreanText: true,
      };

      mockKrdsService.validateUrl.mockReturnValue(true);
      mockKrdsService.scrapeDocument.mockResolvedValue({
        success: true,
        document: mockKrdsDocument(),
        executionTimeMs: 25000, // 25 seconds
      });

      const result = await contentRetrievalTool.handler(params, mockContext);

      expect(result.success).toBe(true);
      expect(result.executionTimeMs).toBe(25000);
    });

    it('should handle timeout errors', async () => {
      const params: ContentRetrievalParams = {
        url: testUrl,
        includeImages: false,
        includeAttachments: false,
        processKoreanText: false,
      };

      mockKrdsService.validateUrl.mockReturnValue(true);
      mockKrdsService.scrapeDocument.mockResolvedValue({
        success: false,
        error: 'Operation timed out after 30 seconds',
        executionTimeMs: 30000,
      });

      const result = await contentRetrievalTool.handler(params, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    });
  });
});