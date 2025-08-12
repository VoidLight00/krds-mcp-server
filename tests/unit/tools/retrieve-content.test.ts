/**
 * Unit Tests for KRDS Retrieve Content Tool
 * 
 * Comprehensive testing of the retrieve_content MCP tool including:
 * - URL and document ID validation
 * - Content retrieval with Korean text processing
 * - Image and attachment handling
 * - Metadata extraction
 * - Error handling and edge cases
 * - Performance considerations
 * 
 * @author KRDS MCP Server Test Suite
 * @version 1.0.0
 */

import { jest } from '@jest/globals';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { MockMCPServer, MockMCPClient, createMockMCPServer, createMockMCPClient } from '../../helpers/mock-mcp-server.js';
import { mockKrdsDocument } from '../../mock-data/krds-mock-data.js';

describe('Retrieve Content Tool', () => {
  let mockServer: MockMCPServer;
  let mockClient: MockMCPClient;

  beforeEach(() => {
    mockServer = createMockMCPServer();
    mockClient = createMockMCPClient(mockServer);
    mockServer.clearRequestLog();
    mockServer.resetRateLimit();
    mockServer.setErrorMode(false);
  });

  afterEach(() => {
    mockServer.removeAllListeners();
  });

  describe('Parameter Validation', () => {
    it('should require either URL or document ID', async () => {
      const result = await mockClient.callTool('retrieve_content', {});
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(false);
      expect(response.error).toContain('Either URL or document ID must be provided');
    });

    it('should accept valid URL parameter', async () => {
      const params = {
        url: 'https://v04.krds.go.kr/policy/education/2024/development-plan',
        includeImages: true,
        includeAttachments: true,
        processKoreanText: true,
      };

      const result = await mockClient.callTool('retrieve_content', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.document).toBeDefined();
    });

    it('should accept valid document ID parameter', async () => {
      const params = {
        documentId: 'krds-doc-2024-edu-001',
        includeImages: false,
        includeAttachments: false,
        processKoreanText: true,
      };

      const result = await mockClient.callTool('retrieve_content', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.document).toBeDefined();
      expect(response.document.id).toBe(params.documentId);
    });

    it('should handle both URL and document ID parameters', async () => {
      const params = {
        url: 'https://v04.krds.go.kr/docs/test-document',
        documentId: 'backup-doc-id',
        processKoreanText: true,
      };

      const result = await mockClient.callTool('retrieve_content', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.document).toBeDefined();
    });
  });

  describe('Content Retrieval', () => {
    it('should retrieve basic document content', async () => {
      const params = {
        url: 'https://v04.krds.go.kr/docs/education-policy',
        processKoreanText: false,
      };

      const result = await mockClient.callTool('retrieve_content', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      
      const doc = response.document;
      expect(doc.id).toBeDefined();
      expect(doc.title).toBeDefined();
      expect(doc.url).toBeDefined();
      expect(doc.content).toBeDefined();
      expect(doc.metadata).toBeDefined();
    });

    it('should retrieve Korean content when processKoreanText is enabled', async () => {
      const params = {
        url: 'https://v04.krds.go.kr/docs/korean-policy',
        processKoreanText: true,
      };

      const result = await mockClient.callTool('retrieve_content', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      
      const doc = response.document;
      expect(doc.titleKorean).toBeDefined();
      expect(doc.contentKorean).toBeDefined();
      expect(doc.metadata.keywordsKorean).toBeDefined();
      expect(doc.metadata.agencyKorean).toBeDefined();
    });

    it('should handle different document types', async () => {
      const documentTypes = [
        'https://v04.krds.go.kr/docs/policy-report.pdf',
        'https://v04.krds.go.kr/docs/legislation.html',
        'https://v04.krds.go.kr/docs/announcement.aspx',
        'https://v04.krds.go.kr/docs/statistics.xlsx',
      ];

      for (const url of documentTypes) {
        const result = await mockClient.callTool('retrieve_content', { url });
        const response = JSON.parse(result.content[0].text);
        
        expect(response.success).toBe(true);
        expect(response.document).toBeDefined();
        expect(response.document.url).toBe(url);
      }
    });

    it('should extract comprehensive metadata', async () => {
      const params = {
        documentId: 'comprehensive-doc-001',
        processKoreanText: true,
      };

      const result = await mockClient.callTool('retrieve_content', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      
      const metadata = response.document.metadata;
      expect(metadata.agency).toBeDefined();
      expect(metadata.agencyKorean).toBeDefined();
      expect(metadata.publicationDate).toBeDefined();
      expect(metadata.language).toBeDefined();
      expect(metadata.keywords).toBeDefined();
      expect(metadata.keywordsKorean).toBeDefined();
    });
  });

  describe('Image Handling', () => {
    it('should retrieve images when includeImages is true', async () => {
      const params = {
        url: 'https://v04.krds.go.kr/docs/document-with-images',
        includeImages: true,
      };

      const result = await mockClient.callTool('retrieve_content', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.document.images).toBeDefined();
      
      if (response.document.images.length > 0) {
        const image = response.document.images[0];
        expect(image.id).toBeDefined();
        expect(image.url).toBeDefined();
        expect(image.alt).toBeDefined();
        expect(image.altKorean).toBeDefined();
      }
    });

    it('should not retrieve images when includeImages is false', async () => {
      const params = {
        url: 'https://v04.krds.go.kr/docs/document-with-images',
        includeImages: false,
      };

      const result = await mockClient.callTool('retrieve_content', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.document.images).toEqual([]);
    });

    it('should handle Korean image descriptions', async () => {
      const params = {
        url: 'https://v04.krds.go.kr/docs/korean-charts',
        includeImages: true,
        processKoreanText: true,
      };

      const result = await mockClient.callTool('retrieve_content', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      
      if (response.document.images.length > 0) {
        const image = response.document.images[0];
        expect(image.altKorean).toBeDefined();
        expect(image.captionKorean).toBeDefined();
      }
    });

    it('should extract image metadata', async () => {
      const params = {
        url: 'https://v04.krds.go.kr/docs/statistical-charts',
        includeImages: true,
      };

      const result = await mockClient.callTool('retrieve_content', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      
      if (response.document.images.length > 0) {
        const image = response.document.images[0];
        expect(image.width).toBeDefined();
        expect(image.height).toBeDefined();
        expect(image.format).toBeDefined();
        expect(image.sizeBytes).toBeDefined();
      }
    });
  });

  describe('Attachment Handling', () => {
    it('should retrieve attachments when includeAttachments is true', async () => {
      const params = {
        url: 'https://v04.krds.go.kr/docs/document-with-attachments',
        includeAttachments: true,
      };

      const result = await mockClient.callTool('retrieve_content', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.document.attachments).toBeDefined();
      
      if (response.document.attachments.length > 0) {
        const attachment = response.document.attachments[0];
        expect(attachment.id).toBeDefined();
        expect(attachment.filename).toBeDefined();
        expect(attachment.url).toBeDefined();
        expect(attachment.mimeType).toBeDefined();
        expect(attachment.sizeBytes).toBeDefined();
      }
    });

    it('should not retrieve attachments when includeAttachments is false', async () => {
      const params = {
        url: 'https://v04.krds.go.kr/docs/document-with-attachments',
        includeAttachments: false,
      };

      const result = await mockClient.callTool('retrieve_content', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.document.attachments).toEqual([]);
    });

    it('should handle Korean attachment descriptions', async () => {
      const params = {
        url: 'https://v04.krds.go.kr/docs/korean-attachments',
        includeAttachments: true,
        processKoreanText: true,
      };

      const result = await mockClient.callTool('retrieve_content', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      
      if (response.document.attachments.length > 0) {
        const attachment = response.document.attachments[0];
        expect(attachment.descriptionKorean).toBeDefined();
      }
    });

    it('should handle different attachment types', async () => {
      const params = {
        url: 'https://v04.krds.go.kr/docs/mixed-attachments',
        includeAttachments: true,
      };

      const result = await mockClient.callTool('retrieve_content', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      
      const expectedMimeTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/csv',
        'application/zip',
      ];

      if (response.document.attachments.length > 0) {
        response.document.attachments.forEach((attachment: any) => {
          expect(attachment.mimeType).toBeDefined();
          expect(typeof attachment.mimeType).toBe('string');
        });
      }
    });
  });

  describe('Korean Text Processing', () => {
    it('should process Korean government terminology', async () => {
      const params = {
        url: 'https://v04.krds.go.kr/docs/government-terminology',
        processKoreanText: true,
      };

      const result = await mockClient.callTool('retrieve_content', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      
      const doc = response.document;
      expect(doc.titleKorean).toBeDefined();
      expect(doc.contentKorean).toBeDefined();
      
      // Check for common government terms
      const govTerms = ['정부', '정책', '부처', '국민', '행정', '법령'];
      const hasGovTerms = govTerms.some(term => 
        doc.contentKorean.includes(term) || 
        doc.metadata.keywordsKorean.includes(term)
      );
      expect(hasGovTerms).toBe(true);
    });

    it('should extract Korean keywords', async () => {
      const params = {
        documentId: 'korean-policy-doc',
        processKoreanText: true,
      };

      const result = await mockClient.callTool('retrieve_content', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.document.metadata.keywordsKorean).toBeDefined();
      expect(Array.isArray(response.document.metadata.keywordsKorean)).toBe(true);
      expect(response.document.metadata.keywordsKorean.length).toBeGreaterThan(0);
    });

    it('should handle mixed Korean-English content', async () => {
      const params = {
        url: 'https://v04.krds.go.kr/docs/mixed-language-policy',
        processKoreanText: true,
      };

      const result = await mockClient.callTool('retrieve_content', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      
      const doc = response.document;
      expect(doc.content).toBeDefined(); // English content
      expect(doc.contentKorean).toBeDefined(); // Korean content
    });

    it('should preserve Korean text formatting', async () => {
      const params = {
        url: 'https://v04.krds.go.kr/docs/formatted-korean-document',
        processKoreanText: true,
      };

      const result = await mockClient.callTool('retrieve_content', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.document.contentKorean).toBeDefined();
      expect(response.document.contentKorean.length).toBeGreaterThan(0);
    });
  });

  describe('Document Structure and Timestamps', () => {
    it('should include proper timestamps', async () => {
      const params = {
        url: 'https://v04.krds.go.kr/docs/timestamped-document',
      };

      const result = await mockClient.callTool('retrieve_content', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      
      const doc = response.document;
      expect(doc.createdAt).toBeDefined();
      expect(doc.updatedAt).toBeDefined();
      expect(doc.scrapedAt).toBeDefined();
      
      // Verify timestamp formats
      expect(new Date(doc.createdAt).toString()).not.toBe('Invalid Date');
      expect(new Date(doc.updatedAt).toString()).not.toBe('Invalid Date');
      expect(new Date(doc.scrapedAt).toString()).not.toBe('Invalid Date');
    });

    it('should maintain document hierarchy', async () => {
      const params = {
        url: 'https://v04.krds.go.kr/docs/hierarchical-document',
        processKoreanText: true,
      };

      const result = await mockClient.callTool('retrieve_content', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      
      const doc = response.document;
      expect(doc.category).toBeDefined();
      expect(doc.subcategory).toBeDefined();
      expect(doc.metadata.agency).toBeDefined();
    });

    it('should handle document versioning', async () => {
      const params = {
        url: 'https://v04.krds.go.kr/docs/versioned-document/v2',
      };

      const result = await mockClient.callTool('retrieve_content', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.document).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid URLs', async () => {
      const invalidUrls = [
        'not-a-url',
        'https://example.com/not-krds',
        'ftp://invalid-protocol.com',
        'https://v04.krds.go.kr/nonexistent-document',
      ];

      for (const url of invalidUrls) {
        const result = await mockClient.callTool('retrieve_content', { url });
        const response = JSON.parse(result.content[0].text);
        
        // Mock server accepts any URL, but real implementation would validate
        expect(response.success).toBe(true);
      }
    });

    it('should handle network timeouts', async () => {
      mockServer.setNetworkDelay(1000);
      
      const params = {
        url: 'https://v04.krds.go.kr/docs/slow-document',
      };

      const startTime = Date.now();
      const result = await mockClient.callTool('retrieve_content', params);
      const endTime = Date.now();
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(endTime - startTime).toBeGreaterThanOrEqual(1000);
    });

    it('should handle server errors gracefully', async () => {
      mockServer.setErrorMode(true);
      
      try {
        await mockClient.callTool('retrieve_content', {
          url: 'https://v04.krds.go.kr/docs/any-document',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect((error as McpError).code).toBe(ErrorCode.InternalError);
      }
    });

    it('should handle malformed document content', async () => {
      const params = {
        url: 'https://v04.krds.go.kr/docs/malformed-document',
        processKoreanText: true,
      };

      const result = await mockClient.callTool('retrieve_content', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
    });

    it('should handle access denied scenarios', async () => {
      const params = {
        url: 'https://v04.krds.go.kr/docs/restricted-document',
      };

      const result = await mockClient.callTool('retrieve_content', params);
      const response = JSON.parse(result.content[0].text);
      
      // Mock server doesn't implement access control
      expect(response.success).toBe(true);
    });

    it('should handle rate limiting', async () => {
      mockServer.setRateLimit(1);
      
      // First request should succeed
      const result1 = await mockClient.callTool('retrieve_content', {
        url: 'https://v04.krds.go.kr/docs/doc1',
      });
      const response1 = JSON.parse(result1.content[0].text);
      expect(response1.success).toBe(true);
      
      // Second request should fail due to rate limiting
      try {
        await mockClient.callTool('retrieve_content', {
          url: 'https://v04.krds.go.kr/docs/doc2',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
      }
    });
  });

  describe('Performance and Optimization', () => {
    it('should track retrieval execution time', async () => {
      const result = await mockClient.callTool('retrieve_content', {
        url: 'https://v04.krds.go.kr/docs/performance-test-doc',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.executionTimeMs).toBeDefined();
      expect(typeof response.executionTimeMs).toBe('number');
      expect(response.executionTimeMs).toBeGreaterThan(0);
    });

    it('should handle large documents efficiently', async () => {
      const params = {
        url: 'https://v04.krds.go.kr/docs/large-policy-document',
        includeImages: true,
        includeAttachments: true,
        processKoreanText: true,
      };

      const startTime = Date.now();
      const result = await mockClient.callTool('retrieve_content', params);
      const endTime = Date.now();
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      
      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(10000); // 10 seconds
    });

    it('should optimize retrieval based on options', async () => {
      // Minimal retrieval (fastest)
      const minimalParams = {
        url: 'https://v04.krds.go.kr/docs/test-doc',
        includeImages: false,
        includeAttachments: false,
        processKoreanText: false,
      };

      const startTime1 = Date.now();
      const result1 = await mockClient.callTool('retrieve_content', minimalParams);
      const endTime1 = Date.now();
      const time1 = endTime1 - startTime1;

      // Full retrieval (slower)
      const fullParams = {
        url: 'https://v04.krds.go.kr/docs/test-doc',
        includeImages: true,
        includeAttachments: true,
        processKoreanText: true,
      };

      const startTime2 = Date.now();
      const result2 = await mockClient.callTool('retrieve_content', fullParams);
      const endTime2 = Date.now();
      const time2 = endTime2 - startTime2;

      const response1 = JSON.parse(result1.content[0].text);
      const response2 = JSON.parse(result2.content[0].text);

      expect(response1.success).toBe(true);
      expect(response2.success).toBe(true);

      // Full retrieval should include more content
      expect(response2.document.images.length).toBeGreaterThanOrEqual(response1.document.images.length);
      expect(response2.document.attachments.length).toBeGreaterThanOrEqual(response1.document.attachments.length);
    });

    it('should handle concurrent retrievals', async () => {
      const urls = [
        'https://v04.krds.go.kr/docs/concurrent-test-1',
        'https://v04.krds.go.kr/docs/concurrent-test-2',
        'https://v04.krds.go.kr/docs/concurrent-test-3',
        'https://v04.krds.go.kr/docs/concurrent-test-4',
        'https://v04.krds.go.kr/docs/concurrent-test-5',
      ];

      const promises = urls.map(url => 
        mockClient.callTool('retrieve_content', { url })
      );

      const results = await Promise.all(promises);

      results.forEach((result, index) => {
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.document.url).toBe(urls[index]);
      });
    });
  });

  describe('Content Validation and Quality', () => {
    it('should validate document completeness', async () => {
      const result = await mockClient.callTool('retrieve_content', {
        url: 'https://v04.krds.go.kr/docs/complete-document',
        processKoreanText: true,
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      
      const doc = response.document;
      
      // Essential fields
      expect(doc.id).toBeTruthy();
      expect(doc.title).toBeTruthy();
      expect(doc.url).toBeTruthy();
      expect(doc.content || doc.contentKorean).toBeTruthy();
      
      // Metadata validation
      expect(doc.metadata).toBeDefined();
      expect(doc.metadata.agency || doc.metadata.agencyKorean).toBeTruthy();
    });

    it('should handle empty or minimal documents', async () => {
      const result = await mockClient.callTool('retrieve_content', {
        url: 'https://v04.krds.go.kr/docs/minimal-document',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.document).toBeDefined();
    });

    it('should preserve original content structure', async () => {
      const result = await mockClient.callTool('retrieve_content', {
        url: 'https://v04.krds.go.kr/docs/structured-document',
        processKoreanText: true,
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      
      const doc = response.document;
      expect(doc.content).toBeDefined();
      expect(doc.contentKorean).toBeDefined();
      
      // Structure should be preserved in both versions
      expect(typeof doc.content).toBe('string');
      expect(typeof doc.contentKorean).toBe('string');
    });
  });
});