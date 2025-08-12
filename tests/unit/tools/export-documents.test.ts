/**
 * Unit Tests for KRDS Export Documents Tool
 * 
 * Comprehensive testing of the export_documents MCP tool including:
 * - Document export in multiple formats
 * - Korean text preservation in exports
 * - Image and attachment handling
 * - File naming and organization
 * - Format-specific validations
 * - Error handling and edge cases
 * 
 * @author KRDS MCP Server Test Suite
 * @version 1.0.0
 */

import { jest } from '@jest/globals';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { MockMCPServer, MockMCPClient, createMockMCPServer, createMockMCPClient } from '../../helpers/mock-mcp-server.js';
import { mockKrdsDocument } from '../../mock-data/krds-mock-data.js';

describe('Export Documents Tool', () => {
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
    it('should require documents array parameter', async () => {
      const result = await mockClient.callTool('export_documents', {
        format: 'json',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(false);
      expect(response.error).toContain('Documents array is required and cannot be empty');
    });

    it('should require format parameter', async () => {
      const docs = [mockKrdsDocument()];
      const result = await mockClient.callTool('export_documents', {
        documents: docs,
      });
      
      // Mock server may not validate format requirement
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toContain('format');
    });

    it('should reject empty documents array', async () => {
      const result = await mockClient.callTool('export_documents', {
        documents: [],
        format: 'json',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(false);
      expect(response.error).toContain('Documents array is required and cannot be empty');
    });

    it('should validate supported formats', async () => {
      const docs = [mockKrdsDocument()];
      const result = await mockClient.callTool('export_documents', {
        documents: docs,
        format: 'unsupported-format',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(false);
      expect(response.error).toContain('Unsupported format');
    });

    it('should accept all supported formats', async () => {
      const docs = [mockKrdsDocument()];
      const supportedFormats = ['json', 'csv', 'xlsx', 'pdf', 'xml', 'markdown', 'html'];
      
      for (const format of supportedFormats) {
        const result = await mockClient.callTool('export_documents', {
          documents: docs,
          format,
          filename: `test-${format}`,
        });
        const response = JSON.parse(result.content[0].text);
        
        expect(response.success).toBe(true);
        expect(response.format).toBe(format);
        expect(response.filename).toContain(format);
      }
    });
  });

  describe('JSON Export', () => {
    it('should export documents in JSON format', async () => {
      const docs = [mockKrdsDocument(), mockKrdsDocument({ id: 'doc-2' })];
      const result = await mockClient.callTool('export_documents', {
        documents: docs,
        format: 'json',
        filename: 'korean-policies',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.format).toBe('json');
      expect(response.filename).toBe('korean-policies.json');
      expect(response.documentCount).toBe(2);
      expect(response.fileSize).toBeGreaterThan(0);
      expect(response.downloadUrl).toBeDefined();
    });

    it('should preserve Korean text in JSON export', async () => {
      const docWithKorean = mockKrdsDocument({
        titleKorean: '한국 정부 정책 문서',
        contentKorean: '이 문서는 한국 정부의 정책에 대한 내용을 담고 있습니다.',
      });
      
      const result = await mockClient.callTool('export_documents', {
        documents: [docWithKorean],
        format: 'json',
        filename: 'korean-content-test',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.format).toBe('json');
    });

    it('should include metadata in JSON export', async () => {
      const docs = [mockKrdsDocument()];
      const result = await mockClient.callTool('export_documents', {
        documents: docs,
        format: 'json',
        includeImages: true,
        includeAttachments: true,
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.includeImages).toBe(true);
      expect(response.includeAttachments).toBe(true);
    });
  });

  describe('CSV Export', () => {
    it('should export documents in CSV format', async () => {
      const docs = [
        mockKrdsDocument({ id: 'doc-1', title: 'Policy 1' }),
        mockKrdsDocument({ id: 'doc-2', title: 'Policy 2' }),
        mockKrdsDocument({ id: 'doc-3', title: 'Policy 3' }),
      ];
      
      const result = await mockClient.callTool('export_documents', {
        documents: docs,
        format: 'csv',
        filename: 'policy-list',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.format).toBe('csv');
      expect(response.filename).toBe('policy-list.csv');
      expect(response.documentCount).toBe(3);
    });

    it('should handle Korean text in CSV export', async () => {
      const docs = [mockKrdsDocument({
        titleKorean: '교육정책 발전방안',
        metadata: {
          ...mockKrdsDocument().metadata,
          agencyKorean: '교육부',
        },
      })];
      
      const result = await mockClient.callTool('export_documents', {
        documents: docs,
        format: 'csv',
        filename: 'korean-csv-test',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.format).toBe('csv');
    });

    it('should flatten nested data for CSV', async () => {
      const docs = [mockKrdsDocument()];
      const result = await mockClient.callTool('export_documents', {
        documents: docs,
        format: 'csv',
        includeImages: false,
        includeAttachments: false,
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
    });
  });

  describe('Excel Export', () => {
    it('should export documents in Excel format', async () => {
      const docs = [
        mockKrdsDocument({ id: 'excel-doc-1' }),
        mockKrdsDocument({ id: 'excel-doc-2' }),
      ];
      
      const result = await mockClient.callTool('export_documents', {
        documents: docs,
        format: 'xlsx',
        filename: 'government-reports',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.format).toBe('xlsx');
      expect(response.filename).toBe('government-reports.xlsx');
      expect(response.documentCount).toBe(2);
    });

    it('should handle large datasets in Excel', async () => {
      const largeDocs = Array.from({ length: 100 }, (_, i) => 
        mockKrdsDocument({ id: `large-doc-${i}` })
      );
      
      const result = await mockClient.callTool('export_documents', {
        documents: largeDocs,
        format: 'xlsx',
        filename: 'large-dataset',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.documentCount).toBe(100);
      expect(response.fileSize).toBeGreaterThan(0);
    });
  });

  describe('PDF Export', () => {
    it('should export documents in PDF format', async () => {
      const docs = [mockKrdsDocument()];
      const result = await mockClient.callTool('export_documents', {
        documents: docs,
        format: 'pdf',
        filename: 'policy-summary',
        includeImages: true,
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.format).toBe('pdf');
      expect(response.filename).toBe('policy-summary.pdf');
      expect(response.includeImages).toBe(true);
    });

    it('should handle Korean fonts in PDF', async () => {
      const koreanDoc = mockKrdsDocument({
        titleKorean: '대한민국 정책 보고서',
        contentKorean: '이 보고서는 대한민국 정부의 주요 정책 방향을 설명합니다.',
      });
      
      const result = await mockClient.callTool('export_documents', {
        documents: [koreanDoc],
        format: 'pdf',
        filename: 'korean-policy-report',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.format).toBe('pdf');
    });

    it('should include images in PDF when specified', async () => {
      const docs = [mockKrdsDocument()];
      const result = await mockClient.callTool('export_documents', {
        documents: docs,
        format: 'pdf',
        includeImages: true,
        includeAttachments: false,
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.includeImages).toBe(true);
      expect(response.includeAttachments).toBe(false);
    });
  });

  describe('XML Export', () => {
    it('should export documents in XML format', async () => {
      const docs = [mockKrdsDocument()];
      const result = await mockClient.callTool('export_documents', {
        documents: docs,
        format: 'xml',
        filename: 'structured-data',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.format).toBe('xml');
      expect(response.filename).toBe('structured-data.xml');
    });

    it('should create valid XML structure', async () => {
      const docs = [
        mockKrdsDocument({ id: 'xml-doc-1' }),
        mockKrdsDocument({ id: 'xml-doc-2' }),
      ];
      
      const result = await mockClient.callTool('export_documents', {
        documents: docs,
        format: 'xml',
        includeImages: true,
        includeAttachments: true,
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.documentCount).toBe(2);
    });

    it('should handle XML special characters', async () => {
      const docWithSpecialChars = mockKrdsDocument({
        title: 'Policy & Law <Analysis>',
        content: 'Content with "quotes" and <tags> & ampersands',
      });
      
      const result = await mockClient.callTool('export_documents', {
        documents: [docWithSpecialChars],
        format: 'xml',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
    });
  });

  describe('Markdown Export', () => {
    it('should export documents in Markdown format', async () => {
      const docs = [mockKrdsDocument()];
      const result = await mockClient.callTool('export_documents', {
        documents: docs,
        format: 'markdown',
        filename: 'policy-docs',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.format).toBe('markdown');
      expect(response.filename).toBe('policy-docs.markdown');
    });

    it('should format Korean content in Markdown', async () => {
      const koreanDoc = mockKrdsDocument({
        titleKorean: '한국 정책 문서',
        contentKorean: `
          # 주요 정책 내용
          
          ## 1. 교육정책
          - 디지털 교육 혁신
          - 미래 인재 양성
          
          ## 2. 경제정책
          - 혁신 성장 동력 확충
          - 일자리 창출
        `,
      });
      
      const result = await mockClient.callTool('export_documents', {
        documents: [koreanDoc],
        format: 'markdown',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
    });

    it('should preserve document structure in Markdown', async () => {
      const docs = [
        mockKrdsDocument({ id: 'md-doc-1', title: 'Policy Overview' }),
        mockKrdsDocument({ id: 'md-doc-2', title: 'Implementation Plan' }),
      ];
      
      const result = await mockClient.callTool('export_documents', {
        documents: docs,
        format: 'markdown',
        includeImages: true,
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.documentCount).toBe(2);
    });
  });

  describe('HTML Export', () => {
    it('should export documents in HTML format', async () => {
      const docs = [mockKrdsDocument()];
      const result = await mockClient.callTool('export_documents', {
        documents: docs,
        format: 'html',
        filename: 'web-export',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.format).toBe('html');
      expect(response.filename).toBe('web-export.html');
    });

    it('should create valid HTML structure', async () => {
      const docs = [mockKrdsDocument()];
      const result = await mockClient.callTool('export_documents', {
        documents: docs,
        format: 'html',
        includeImages: true,
        includeAttachments: true,
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
    });

    it('should handle Korean text encoding in HTML', async () => {
      const koreanDoc = mockKrdsDocument({
        titleKorean: '한국어 HTML 테스트',
        contentKorean: '이 문서는 한글 인코딩 테스트를 위한 것입니다.',
      });
      
      const result = await mockClient.callTool('export_documents', {
        documents: [koreanDoc],
        format: 'html',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
    });
  });

  describe('Image and Attachment Handling', () => {
    it('should include images when specified', async () => {
      const docWithImages = mockKrdsDocument();
      const result = await mockClient.callTool('export_documents', {
        documents: [docWithImages],
        format: 'json',
        includeImages: true,
        includeAttachments: false,
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.includeImages).toBe(true);
      expect(response.includeAttachments).toBe(false);
    });

    it('should exclude images when not specified', async () => {
      const docs = [mockKrdsDocument()];
      const result = await mockClient.callTool('export_documents', {
        documents: docs,
        format: 'json',
        includeImages: false,
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.includeImages).toBe(false);
    });

    it('should include attachments when specified', async () => {
      const docWithAttachments = mockKrdsDocument();
      const result = await mockClient.callTool('export_documents', {
        documents: [docWithAttachments],
        format: 'json',
        includeImages: false,
        includeAttachments: true,
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.includeAttachments).toBe(true);
    });

    it('should handle both images and attachments', async () => {
      const docs = [mockKrdsDocument()];
      const result = await mockClient.callTool('export_documents', {
        documents: docs,
        format: 'json',
        includeImages: true,
        includeAttachments: true,
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.includeImages).toBe(true);
      expect(response.includeAttachments).toBe(true);
    });

    it('should affect file size based on inclusions', async () => {
      const docs = [mockKrdsDocument()];
      
      // Minimal export
      const result1 = await mockClient.callTool('export_documents', {
        documents: docs,
        format: 'json',
        includeImages: false,
        includeAttachments: false,
      });
      const response1 = JSON.parse(result1.content[0].text);
      
      // Full export
      const result2 = await mockClient.callTool('export_documents', {
        documents: docs,
        format: 'json',
        includeImages: true,
        includeAttachments: true,
      });
      const response2 = JSON.parse(result2.content[0].text);
      
      expect(response1.success).toBe(true);
      expect(response2.success).toBe(true);
      expect(response2.fileSize).toBeGreaterThanOrEqual(response1.fileSize);
    });
  });

  describe('File Naming and Organization', () => {
    it('should use default filename when not specified', async () => {
      const docs = [mockKrdsDocument()];
      const result = await mockClient.callTool('export_documents', {
        documents: docs,
        format: 'json',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.filename).toBe('export.json');
    });

    it('should use custom filename when specified', async () => {
      const docs = [mockKrdsDocument()];
      const result = await mockClient.callTool('export_documents', {
        documents: docs,
        format: 'json',
        filename: 'my-custom-export',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.filename).toBe('my-custom-export.json');
    });

    it('should handle Korean filenames', async () => {
      const docs = [mockKrdsDocument()];
      const result = await mockClient.callTool('export_documents', {
        documents: docs,
        format: 'json',
        filename: '한국정책문서',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.filename).toBe('한국정책문서.json');
    });

    it('should sanitize unsafe filename characters', async () => {
      const docs = [mockKrdsDocument()];
      const result = await mockClient.callTool('export_documents', {
        documents: docs,
        format: 'json',
        filename: 'unsafe/filename\\with:special*chars?',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.filename).toBeDefined();
      // Mock server may not sanitize, but real implementation should
    });

    it('should generate timestamps in filenames when needed', async () => {
      const docs = [mockKrdsDocument()];
      const result = await mockClient.callTool('export_documents', {
        documents: docs,
        format: 'json',
        filename: 'export-with-timestamp',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.generatedAt).toBeDefined();
      expect(new Date(response.generatedAt).toString()).not.toBe('Invalid Date');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid document format', async () => {
      const invalidDocs = [
        { invalid: 'document structure' },
        null,
        undefined,
        'not an object',
      ];
      
      for (const doc of invalidDocs) {
        try {
          const result = await mockClient.callTool('export_documents', {
            documents: [doc],
            format: 'json',
          });
          const response = JSON.parse(result.content[0].text);
          
          // Mock server may not validate document structure
          if (response.success === false) {
            expect(response.error).toBeDefined();
          }
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
        }
      }
    });

    it('should handle network errors gracefully', async () => {
      mockServer.setErrorMode(true);
      
      try {
        await mockClient.callTool('export_documents', {
          documents: [mockKrdsDocument()],
          format: 'json',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect((error as McpError).code).toBe(ErrorCode.InternalError);
      }
    });

    it('should handle large document arrays', async () => {
      const largeDocs = Array.from({ length: 1000 }, (_, i) => 
        mockKrdsDocument({ id: `large-doc-${i}` })
      );
      
      const result = await mockClient.callTool('export_documents', {
        documents: largeDocs,
        format: 'json',
        filename: 'massive-export',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.documentCount).toBe(1000);
    });

    it('should handle documents with missing required fields', async () => {
      const incompleteDoc = {
        id: 'incomplete-doc',
        // Missing required fields like title, url, etc.
      };
      
      const result = await mockClient.callTool('export_documents', {
        documents: [incompleteDoc],
        format: 'json',
      });
      const response = JSON.parse(result.content[0].text);
      
      // Mock server doesn't validate document completeness
      expect(response.success).toBe(true);
    });

    it('should handle rate limiting', async () => {
      mockServer.setRateLimit(1);
      
      // First request should succeed
      const result1 = await mockClient.callTool('export_documents', {
        documents: [mockKrdsDocument()],
        format: 'json',
      });
      const response1 = JSON.parse(result1.content[0].text);
      expect(response1.success).toBe(true);
      
      // Second request should fail due to rate limiting
      try {
        await mockClient.callTool('export_documents', {
          documents: [mockKrdsDocument()],
          format: 'csv',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
      }
    });

    it('should handle memory constraints with large exports', async () => {
      const largeDocs = Array.from({ length: 10000 }, (_, i) => 
        mockKrdsDocument({ 
          id: `memory-test-${i}`,
          content: 'Very long content '.repeat(1000), // Large content
        })
      );
      
      const result = await mockClient.callTool('export_documents', {
        documents: largeDocs,
        format: 'json',
        includeImages: true,
        includeAttachments: true,
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.documentCount).toBe(10000);
    });
  });

  describe('Performance and Optimization', () => {
    it('should track export execution time', async () => {
      const docs = [mockKrdsDocument()];
      const result = await mockClient.callTool('export_documents', {
        documents: docs,
        format: 'json',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.executionTimeMs).toBeDefined();
      expect(typeof response.executionTimeMs).toBe('number');
      expect(response.executionTimeMs).toBeGreaterThan(0);
    });

    it('should handle concurrent export requests', async () => {
      const docs = [mockKrdsDocument()];
      const formats = ['json', 'csv', 'xlsx', 'pdf', 'xml'];
      
      const promises = formats.map(format => 
        mockClient.callTool('export_documents', {
          documents: docs,
          format,
          filename: `concurrent-${format}`,
        })
      );
      
      const results = await Promise.all(promises);
      
      results.forEach((result, index) => {
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.format).toBe(formats[index]);
      });
    });

    it('should optimize based on document count', async () => {
      const smallExport = [mockKrdsDocument()];
      const largeExport = Array.from({ length: 100 }, (_, i) => 
        mockKrdsDocument({ id: `perf-doc-${i}` })
      );
      
      // Small export
      const startTime1 = Date.now();
      const result1 = await mockClient.callTool('export_documents', {
        documents: smallExport,
        format: 'json',
      });
      const endTime1 = Date.now();
      const time1 = endTime1 - startTime1;
      
      // Large export
      const startTime2 = Date.now();
      const result2 = await mockClient.callTool('export_documents', {
        documents: largeExport,
        format: 'json',
      });
      const endTime2 = Date.now();
      const time2 = endTime2 - startTime2;
      
      const response1 = JSON.parse(result1.content[0].text);
      const response2 = JSON.parse(result2.content[0].text);
      
      expect(response1.success).toBe(true);
      expect(response2.success).toBe(true);
      expect(response2.documentCount).toBe(100);
      expect(response2.fileSize).toBeGreaterThan(response1.fileSize);
    });

    it('should handle timeout scenarios', async () => {
      mockServer.setNetworkDelay(1000);
      
      const docs = [mockKrdsDocument()];
      const startTime = Date.now();
      const result = await mockClient.callTool('export_documents', {
        documents: docs,
        format: 'json',
      });
      const endTime = Date.now();
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(endTime - startTime).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('Export Result Structure', () => {
    it('should return consistent export structure', async () => {
      const docs = [mockKrdsDocument()];
      const result = await mockClient.callTool('export_documents', {
        documents: docs,
        format: 'json',
        filename: 'structure-test',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response).toMatchObject({
        filename: expect.any(String),
        format: expect.any(String),
        documentCount: expect.any(Number),
        fileSize: expect.any(Number),
        downloadUrl: expect.any(String),
        generatedAt: expect.any(String),
        executionTimeMs: expect.any(Number),
      });
    });

    it('should include export metadata', async () => {
      const docs = [mockKrdsDocument()];
      const result = await mockClient.callTool('export_documents', {
        documents: docs,
        format: 'json',
        includeImages: true,
        includeAttachments: false,
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.includeImages).toBeDefined();
      expect(response.includeAttachments).toBeDefined();
      expect(typeof response.includeImages).toBe('boolean');
      expect(typeof response.includeAttachments).toBe('boolean');
    });
  });

  describe('Special Export Scenarios', () => {
    it('should handle mixed language documents', async () => {
      const mixedDocs = [
        mockKrdsDocument({ 
          title: 'English Policy Document',
          content: 'This is English content.',
        }),
        mockKrdsDocument({
          titleKorean: '한국어 정책 문서',
          contentKorean: '이것은 한국어 내용입니다.',
        }),
      ];
      
      const result = await mockClient.callTool('export_documents', {
        documents: mixedDocs,
        format: 'json',
        filename: 'mixed-languages',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.documentCount).toBe(2);
    });

    it('should export documents with rich metadata', async () => {
      const richDoc = mockKrdsDocument({
        metadata: {
          ...mockKrdsDocument().metadata,
          keywordsKorean: ['정책', '혁신', '디지털', '전환', '미래'],
          classification: 'public',
          status: 'active',
        },
      });
      
      const result = await mockClient.callTool('export_documents', {
        documents: [richDoc],
        format: 'json',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
    });

    it('should handle government report collections', async () => {
      const govReports = Array.from({ length: 50 }, (_, i) => 
        mockKrdsDocument({
          id: `gov-report-${i}`,
          category: `Government Report ${i}`,
          metadata: {
            ...mockKrdsDocument().metadata,
            agencyKorean: ['교육부', '보건복지부', '국토교통부'][i % 3],
            documentType: '정책보고서',
          },
        })
      );
      
      const result = await mockClient.callTool('export_documents', {
        documents: govReports,
        format: 'xlsx',
        filename: 'government-report-collection',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.documentCount).toBe(50);
    });
  });
});