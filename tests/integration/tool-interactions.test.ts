/**
 * MCP Tool Interactions Integration Tests
 * 
 * Integration tests for MCP tool interactions and workflows:
 * - Tool chaining and data flow
 * - Cross-tool data consistency
 * - Tool context sharing
 * - Error propagation between tools
 * 
 * @author KRDS MCP Server
 * @version 1.0.0
 */

import { jest } from '@jest/globals';
import { contentRetrievalTool } from '@/tools/content-retrieval.js';
import { searchTool } from '@/tools/search.js';
import { exportTool } from '@/tools/export.js';
import { koreanTextTool } from '@/tools/korean-text.js';
import { navigationTool } from '@/tools/navigation.js';
import type { ToolContext, KrdsDocument, ExportFormat } from '@/types/index.js';
import { createMockLogger, createMockToolContext } from '../helpers/test-helpers.js';
import { mockKrdsDocument, mockKrdsSearchResult } from '../mock-data/krds-mock-data.js';

describe('MCP Tool Interactions', () => {
  let mockContext: ToolContext;
  let mockKrdsService: any;
  let mockCacheManager: any;
  let mockExportService: any;

  beforeEach(() => {
    mockKrdsService = {
      scrapeDocument: jest.fn(),
      searchDocuments: jest.fn(),
      getNavigationTree: jest.fn(),
      listCategories: jest.fn(),
      browseCategory: jest.fn(),
      validateUrl: jest.fn(),
    };

    mockCacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      has: jest.fn(),
      delete: jest.fn(),
    };

    mockExportService = {
      exportDocuments: jest.fn(),
      getExportStatus: jest.fn(),
      generateDownloadUrl: jest.fn(),
    };

    mockContext = createMockToolContext({
      krdsService: mockKrdsService,
      cacheManager: mockCacheManager,
      exportService: mockExportService,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Search → Content Retrieval → Export Workflow', () => {
    it('should execute complete document processing workflow', async () => {
      // Step 1: Search for documents
      const searchResult = mockKrdsSearchResult();
      mockKrdsService.searchDocuments.mockResolvedValue({
        success: true,
        result: searchResult,
        executionTimeMs: 1200,
      });

      const searchResponse = await searchTool.handler({
        query: '교육정책',
        maxResults: 5,
        useCache: true,
      }, mockContext);

      expect(searchResponse.success).toBe(true);
      expect(searchResponse.documents).toHaveLength(1);

      // Step 2: Retrieve detailed content for the first document
      const document = searchResponse.documents[0];
      const detailedDocument = {
        ...mockKrdsDocument(),
        content: 'Detailed content with Korean text: 상세한 한국어 내용이 포함된 교육정책 문서입니다.',
        images: [
          {
            id: 'img-1',
            url: 'https://v04.krds.go.kr/images/education-chart.png',
            alt: '교육 통계',
            altKorean: '교육 통계',
            format: 'png',
            sizeBytes: 150000,
          },
        ],
      };

      mockKrdsService.validateUrl.mockReturnValue(true);
      mockKrdsService.scrapeDocument.mockResolvedValue({
        success: true,
        document: detailedDocument,
        executionTimeMs: 2500,
      });

      const contentResponse = await contentRetrievalTool.handler({
        url: document.url,
        includeImages: true,
        includeAttachments: true,
        processKoreanText: true,
      }, mockContext);

      expect(contentResponse.success).toBe(true);
      expect(contentResponse.document.content).toContain('상세한 한국어 내용');
      expect(contentResponse.document.images).toHaveLength(1);

      // Step 3: Export the processed document
      mockExportService.exportDocuments.mockResolvedValue({
        success: true,
        format: 'pdf',
        filename: 'education-policy-export.pdf',
        filePath: '/tmp/exports/education-policy-export.pdf',
        sizeBytes: 2048000,
        documentCount: 1,
        processingTimeMs: 3000,
      });

      const exportResponse = await exportTool.handler({
        documents: [contentResponse.document],
        format: 'pdf' as ExportFormat,
        includeImages: true,
        includeAttachments: false,
        filename: 'education-policy-export',
      }, mockContext);

      expect(exportResponse.success).toBe(true);
      expect(exportResponse.filename).toBe('education-policy-export.pdf');
      expect(exportResponse.documentCount).toBe(1);

      // Verify tool call sequence
      expect(mockKrdsService.searchDocuments).toHaveBeenCalledBefore(mockKrdsService.scrapeDocument as any);
      expect(mockKrdsService.scrapeDocument).toHaveBeenCalledBefore(mockExportService.exportDocuments as any);
    });

    it('should handle partial workflow failures gracefully', async () => {
      // Search succeeds
      mockKrdsService.searchDocuments.mockResolvedValue({
        success: true,
        result: mockKrdsSearchResult(),
        executionTimeMs: 800,
      });

      const searchResponse = await searchTool.handler({
        query: '정책',
        maxResults: 3,
      }, mockContext);

      expect(searchResponse.success).toBe(true);

      // Content retrieval fails
      mockKrdsService.validateUrl.mockReturnValue(true);
      mockKrdsService.scrapeDocument.mockResolvedValue({
        success: false,
        error: 'Network timeout',
        executionTimeMs: 30000,
      });

      const contentResponse = await contentRetrievalTool.handler({
        url: searchResponse.documents[0].url,
        includeImages: false,
        includeAttachments: false,
        processKoreanText: false,
      }, mockContext);

      expect(contentResponse.success).toBe(false);
      expect(contentResponse.error).toContain('Network timeout');

      // Export should not be attempted with failed content retrieval
      // This demonstrates proper error handling in tool chains
    });
  });

  describe('Navigation → Search → Korean Text Analysis Workflow', () => {
    it('should navigate categories and analyze Korean content', async () => {
      // Step 1: Get navigation tree
      const navigationTree = {
        categories: [
          {
            id: 'education',
            name: '교육',
            nameKorean: '교육',
            subcategories: [
              { id: 'policy', name: '정책', nameKorean: '정책' },
              { id: 'statistics', name: '통계', nameKorean: '통계' },
            ],
          },
          {
            id: 'health',
            name: '보건',
            nameKorean: '보건',
            subcategories: [],
          },
        ],
      };

      mockKrdsService.getNavigationTree.mockResolvedValue({
        success: true,
        navigationTree,
        executionTimeMs: 500,
      });

      const navigationResponse = await navigationTool.handler({
        action: 'get_navigation_tree',
        depth: 2,
      }, mockContext);

      expect(navigationResponse.success).toBe(true);
      expect(navigationResponse.categories).toHaveLength(2);

      // Step 2: Browse education category
      const categoryDocuments = [
        {
          ...mockKrdsDocument(),
          title: '교육정책 발전방안',
          titleKorean: '교육정책 발전방안',
          category: '교육',
        },
        {
          ...mockKrdsDocument(),
          id: 'doc-2',
          title: '교육통계 연보',
          titleKorean: '교육통계 연보',
          category: '교육',
        },
      ];

      mockKrdsService.browseCategory.mockResolvedValue({
        success: true,
        documents: categoryDocuments,
        totalCount: 2,
        executionTimeMs: 800,
      });

      const browseResponse = await navigationTool.handler({
        action: 'browse_category',
        category: 'education',
      }, mockContext);

      expect(browseResponse.success).toBe(true);
      expect(browseResponse.documents).toHaveLength(2);

      // Step 3: Analyze Korean text from the documents
      const koreanTexts = browseResponse.documents.map(doc => 
        `${doc.titleKorean} ${doc.contentKorean}`
      );

      const koreanAnalysisResponse = await koreanTextTool.handler({
        texts: koreanTexts,
        includeRomanization: true,
        includeSentiment: true,
        extractKeywords: true,
      }, mockContext);

      expect(koreanAnalysisResponse.success).toBe(true);
      expect(koreanAnalysisResponse.analyses).toHaveLength(2);
      
      koreanAnalysisResponse.analyses.forEach(analysis => {
        expect(analysis.keywords).toEqual(expect.arrayContaining(['교육']));
        expect(analysis.romanized).toBeDefined();
        expect(analysis.sentiment).toBeOneOf(['positive', 'negative', 'neutral']);
      });
    });

    it('should handle empty categories gracefully', async () => {
      // Navigation returns empty category
      mockKrdsService.browseCategory.mockResolvedValue({
        success: true,
        documents: [],
        totalCount: 0,
        executionTimeMs: 200,
      });

      const browseResponse = await navigationTool.handler({
        action: 'browse_category',
        category: 'empty-category',
      }, mockContext);

      expect(browseResponse.success).toBe(true);
      expect(browseResponse.documents).toHaveLength(0);

      // Korean text analysis with empty input
      const koreanAnalysisResponse = await koreanTextTool.handler({
        texts: [],
        extractKeywords: true,
      }, mockContext);

      expect(koreanAnalysisResponse.success).toBe(true);
      expect(koreanAnalysisResponse.analyses).toHaveLength(0);
    });
  });

  describe('Cross-Tool Data Consistency', () => {
    it('should maintain document integrity across tool calls', async () => {
      const originalDocument = mockKrdsDocument();
      
      // Content retrieval
      mockKrdsService.validateUrl.mockReturnValue(true);
      mockKrdsService.scrapeDocument.mockResolvedValue({
        success: true,
        document: originalDocument,
        executionTimeMs: 1500,
      });

      const contentResponse = await contentRetrievalTool.handler({
        url: originalDocument.url,
        includeImages: true,
        includeAttachments: true,
        processKoreanText: true,
      }, mockContext);

      // Korean text analysis
      const koreanAnalysisResponse = await koreanTextTool.handler({
        texts: [contentResponse.document.contentKorean],
        extractKeywords: true,
        includeRomanization: true,
      }, mockContext);

      // Export with analyzed data
      const enhancedDocument = {
        ...contentResponse.document,
        metadata: {
          ...contentResponse.document.metadata,
          keywordsKorean: koreanAnalysisResponse.analyses[0].keywords,
          romanizedTitle: koreanAnalysisResponse.analyses[0].romanized,
        },
      };

      mockExportService.exportDocuments.mockResolvedValue({
        success: true,
        format: 'json',
        filename: 'enhanced-document.json',
        documentCount: 1,
        processingTimeMs: 500,
      });

      const exportResponse = await exportTool.handler({
        documents: [enhancedDocument],
        format: 'json' as ExportFormat,
        includeImages: false,
        includeAttachments: false,
      }, mockContext);

      expect(exportResponse.success).toBe(true);
      
      // Verify document ID consistency across all operations
      expect(contentResponse.document.id).toBe(originalDocument.id);
      expect(enhancedDocument.id).toBe(originalDocument.id);
      
      // Verify data enhancement
      expect(enhancedDocument.metadata.keywordsKorean).toEqual(
        koreanAnalysisResponse.analyses[0].keywords
      );
    });

    it('should handle concurrent tool operations safely', async () => {
      const documents = [
        { ...mockKrdsDocument(), id: 'doc-1', url: 'https://v04.krds.go.kr/doc1' },
        { ...mockKrdsDocument(), id: 'doc-2', url: 'https://v04.krds.go.kr/doc2' },
        { ...mockKrdsDocument(), id: 'doc-3', url: 'https://v04.krds.go.kr/doc3' },
      ];

      // Mock service responses
      mockKrdsService.validateUrl.mockReturnValue(true);
      documents.forEach((doc, index) => {
        mockKrdsService.scrapeDocument.mockResolvedValueOnce({
          success: true,
          document: doc,
          executionTimeMs: 1000 + index * 100,
        });
      });

      // Execute concurrent content retrieval
      const contentPromises = documents.map(doc => 
        contentRetrievalTool.handler({
          url: doc.url,
          includeImages: false,
          includeAttachments: false,
          processKoreanText: true,
        }, mockContext)
      );

      const contentResponses = await Promise.all(contentPromises);

      // All operations should succeed
      contentResponses.forEach((response, index) => {
        expect(response.success).toBe(true);
        expect(response.document.id).toBe(documents[index].id);
      });

      // Verify no race conditions or data corruption
      const retrievedIds = contentResponses.map(r => r.document.id);
      const originalIds = documents.map(d => d.id);
      expect(retrievedIds.sort()).toEqual(originalIds.sort());
    });
  });

  describe('Error Propagation and Recovery', () => {
    it('should propagate errors correctly between tools', async () => {
      // Search tool fails
      mockKrdsService.searchDocuments.mockResolvedValue({
        success: false,
        error: 'Search service unavailable',
        executionTimeMs: 5000,
      });

      const searchResponse = await searchTool.handler({
        query: '정책',
        maxResults: 10,
      }, mockContext);

      expect(searchResponse.success).toBe(false);
      expect(searchResponse.error).toContain('Search service unavailable');

      // Subsequent tools should handle the lack of search results
      // This would typically be handled by the MCP client, but we can test the tool's behavior
      
      // Try to export empty results
      mockExportService.exportDocuments.mockResolvedValue({
        success: false,
        error: 'No documents to export',
        processingTimeMs: 100,
      });

      const exportResponse = await exportTool.handler({
        documents: [],
        format: 'pdf' as ExportFormat,
        includeImages: false,
        includeAttachments: false,
      }, mockContext);

      expect(exportResponse.success).toBe(false);
      expect(exportResponse.error).toContain('No documents to export');
    });

    it('should implement circuit breaker pattern for failing services', async () => {
      // Simulate repeated service failures
      const failureResponses = Array(5).fill({
        success: false,
        error: 'Service timeout',
        executionTimeMs: 30000,
      });

      mockKrdsService.searchDocuments
        .mockResolvedValueOnce(failureResponses[0])
        .mockResolvedValueOnce(failureResponses[1])
        .mockResolvedValueOnce(failureResponses[2])
        .mockResolvedValueOnce(failureResponses[3])
        .mockResolvedValueOnce(failureResponses[4]);

      // Multiple failed attempts
      for (let i = 0; i < 5; i++) {
        const response = await searchTool.handler({
          query: 'test',
          maxResults: 1,
        }, mockContext);

        expect(response.success).toBe(false);
        expect(response.error).toContain('Service timeout');
      }

      // The tool should log appropriate warnings about service failures
      expect(mockContext.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('service failure'),
        expect.any(Object)
      );
    });

    it('should recover gracefully from partial failures', async () => {
      // Content retrieval succeeds for some documents, fails for others
      const documents = [
        mockKrdsDocument(),
        { ...mockKrdsDocument(), id: 'doc-2', url: 'https://v04.krds.go.kr/failing-doc' },
        { ...mockKrdsDocument(), id: 'doc-3', url: 'https://v04.krds.go.kr/doc3' },
      ];

      mockKrdsService.validateUrl.mockReturnValue(true);
      mockKrdsService.scrapeDocument
        .mockResolvedValueOnce({
          success: true,
          document: documents[0],
          executionTimeMs: 1000,
        })
        .mockResolvedValueOnce({
          success: false,
          error: 'Document access denied',
          executionTimeMs: 5000,
        })
        .mockResolvedValueOnce({
          success: true,
          document: documents[2],
          executionTimeMs: 1200,
        });

      const contentPromises = documents.map(doc => 
        contentRetrievalTool.handler({
          url: doc.url,
          includeImages: false,
          includeAttachments: false,
          processKoreanText: false,
        }, mockContext)
      );

      const responses = await Promise.all(contentPromises);

      // First and third should succeed, second should fail
      expect(responses[0].success).toBe(true);
      expect(responses[1].success).toBe(false);
      expect(responses[2].success).toBe(true);

      // Export should proceed with successful documents only
      const successfulDocuments = responses
        .filter(r => r.success)
        .map(r => r.document);

      mockExportService.exportDocuments.mockResolvedValue({
        success: true,
        format: 'json',
        filename: 'partial-export.json',
        documentCount: 2, // Only successful documents
        processingTimeMs: 1000,
      });

      const exportResponse = await exportTool.handler({
        documents: successfulDocuments,
        format: 'json' as ExportFormat,
        includeImages: false,
        includeAttachments: false,
      }, mockContext);

      expect(exportResponse.success).toBe(true);
      expect(exportResponse.documentCount).toBe(2);
    });
  });

  describe('Tool Context and State Management', () => {
    it('should share context correctly between tools', async () => {
      // Each tool should receive the same context object
      await contentRetrievalTool.handler({
        url: 'https://v04.krds.go.kr/test',
        includeImages: false,
        includeAttachments: false,
        processKoreanText: false,
      }, mockContext);

      await searchTool.handler({
        query: 'test',
      }, mockContext);

      await navigationTool.handler({
        action: 'list_categories',
      }, mockContext);

      // All tools should have access to the same services
      expect(mockKrdsService.scrapeDocument).toHaveBeenCalled();
      expect(mockKrdsService.searchDocuments).toHaveBeenCalled();
      expect(mockKrdsService.listCategories).toHaveBeenCalled();
    });

    it('should maintain cache consistency across tool operations', async () => {
      const cacheKey = 'test-document-cache';
      const cachedDocument = mockKrdsDocument();

      // First tool caches data
      mockCacheManager.has.mockResolvedValue(false);
      mockCacheManager.set.mockResolvedValue(undefined);
      mockKrdsService.validateUrl.mockReturnValue(true);
      mockKrdsService.scrapeDocument.mockResolvedValue({
        success: true,
        document: cachedDocument,
        executionTimeMs: 2000,
      });

      await contentRetrievalTool.handler({
        url: 'https://v04.krds.go.kr/cached-doc',
        includeImages: false,
        includeAttachments: false,
        processKoreanText: false,
      }, mockContext);

      // Second tool should be able to access cached data
      mockCacheManager.has.mockResolvedValue(true);
      mockCacheManager.get.mockResolvedValue(cachedDocument);

      // Simulate another content retrieval for the same document
      const secondResponse = await contentRetrievalTool.handler({
        url: 'https://v04.krds.go.kr/cached-doc',
        includeImages: false,
        includeAttachments: false,
        processKoreanText: false,
      }, mockContext);

      expect(mockCacheManager.has).toHaveBeenCalledWith(expect.stringContaining('cached-doc'));
      expect(secondResponse.success).toBe(true);
    });
  });
});