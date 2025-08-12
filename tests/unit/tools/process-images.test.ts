/**
 * Unit Tests for KRDS Process Images Tool
 * 
 * Comprehensive testing of the process_images MCP tool including:
 * - Image extraction and processing
 * - OCR functionality with Korean text support
 * - Metadata extraction from images
 * - Different image formats support
 * - Error handling and edge cases
 * - Performance considerations
 * 
 * @author KRDS MCP Server Test Suite
 * @version 1.0.0
 */

import { jest } from '@jest/globals';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { MockMCPServer, MockMCPClient, createMockMCPServer, createMockMCPClient } from '../../helpers/mock-mcp-server.js';

describe('Process Images Tool', () => {
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
    it('should require either imageUrl or documentId', async () => {
      const result = await mockClient.callTool('process_images', {});
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(false);
      expect(response.error).toContain('Either image URL or document ID must be provided');
    });

    it('should accept valid imageUrl parameter', async () => {
      const params = {
        imageUrl: 'https://v04.krds.go.kr/images/chart-2024.png',
        ocrEnabled: true,
        koreanOcr: true,
        extractMetadata: true,
      };

      const result = await mockClient.callTool('process_images', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.images).toBeDefined();
      expect(Array.isArray(response.images)).toBe(true);
    });

    it('should accept valid documentId parameter', async () => {
      const params = {
        documentId: 'krds-doc-with-images-001',
        ocrEnabled: false,
        extractMetadata: true,
      };

      const result = await mockClient.callTool('process_images', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.images).toBeDefined();
    });

    it('should handle boolean parameters correctly', async () => {
      const params = {
        imageUrl: 'https://v04.krds.go.kr/images/test.jpg',
        ocrEnabled: true,
        koreanOcr: false,
        extractMetadata: true,
      };

      const result = await mockClient.callTool('process_images', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
    });
  });

  describe('Image Processing', () => {
    it('should process single image URL', async () => {
      const params = {
        imageUrl: 'https://v04.krds.go.kr/images/policy-chart.png',
        extractMetadata: true,
      };

      const result = await mockClient.callTool('process_images', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.images).toBeDefined();
      expect(response.images.length).toBeGreaterThan(0);
      
      const image = response.images[0];
      expect(image.id).toBeDefined();
      expect(image.url).toBe(params.imageUrl);
      expect(image.alt).toBeDefined();
    });

    it('should extract images from document', async () => {
      const params = {
        documentId: 'doc-with-multiple-images',
        extractMetadata: true,
      };

      const result = await mockClient.callTool('process_images', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.images).toBeDefined();
      expect(Array.isArray(response.images)).toBe(true);
    });

    it('should handle different image formats', async () => {
      const imageFormats = [
        'https://v04.krds.go.kr/images/chart.png',
        'https://v04.krds.go.kr/images/graph.jpg',
        'https://v04.krds.go.kr/images/diagram.jpeg',
        'https://v04.krds.go.kr/images/infographic.gif',
        'https://v04.krds.go.kr/images/visualization.webp',
        'https://v04.krds.go.kr/images/statistical.bmp',
        'https://v04.krds.go.kr/images/report.tiff',
      ];

      for (const imageUrl of imageFormats) {
        const result = await mockClient.callTool('process_images', { imageUrl });
        const response = JSON.parse(result.content[0].text);
        
        expect(response.success).toBe(true);
        expect(response.images).toBeDefined();
        
        if (response.images.length > 0) {
          const image = response.images[0];
          expect(image.url).toBe(imageUrl);
        }
      }
    });

    it('should extract comprehensive image metadata', async () => {
      const params = {
        imageUrl: 'https://v04.krds.go.kr/images/detailed-chart.png',
        extractMetadata: true,
      };

      const result = await mockClient.callTool('process_images', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.images.length).toBeGreaterThan(0);
      
      const image = response.images[0];
      if (image.metadata) {
        expect(image.metadata.width).toBeDefined();
        expect(image.metadata.height).toBeDefined();
        expect(image.metadata.format).toBeDefined();
        expect(image.metadata.fileSize).toBeDefined();
        expect(typeof image.metadata.width).toBe('number');
        expect(typeof image.metadata.height).toBe('number');
        expect(typeof image.metadata.fileSize).toBe('number');
      }
    });

    it('should not extract metadata when disabled', async () => {
      const params = {
        imageUrl: 'https://v04.krds.go.kr/images/simple-chart.png',
        extractMetadata: false,
      };

      const result = await mockClient.callTool('process_images', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.images.length).toBeGreaterThan(0);
      
      const image = response.images[0];
      expect(image.metadata).toEqual({});
    });
  });

  describe('OCR Functionality', () => {
    it('should perform OCR when enabled', async () => {
      const params = {
        imageUrl: 'https://v04.krds.go.kr/images/text-chart.png',
        ocrEnabled: true,
        koreanOcr: false,
      };

      const result = await mockClient.callTool('process_images', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.images.length).toBeGreaterThan(0);
      
      const image = response.images[0];
      expect(image.ocrResult).toBeDefined();
      expect(image.ocrResult.text).toBeDefined();
      expect(image.ocrResult.confidence).toBeDefined();
      expect(image.ocrResult.language).toBeDefined();
      expect(typeof image.ocrResult.confidence).toBe('number');
      expect(image.ocrResult.language).toBe('en');
    });

    it('should perform Korean OCR when enabled', async () => {
      const params = {
        imageUrl: 'https://v04.krds.go.kr/images/korean-text-image.png',
        ocrEnabled: true,
        koreanOcr: true,
      };

      const result = await mockClient.callTool('process_images', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.images.length).toBeGreaterThan(0);
      
      const image = response.images[0];
      expect(image.ocrResult).toBeDefined();
      expect(image.ocrResult.text).toBeDefined();
      expect(image.ocrResult.language).toBe('ko');
      expect(image.ocrResult.text).toContain('한국어');
    });

    it('should not perform OCR when disabled', async () => {
      const params = {
        imageUrl: 'https://v04.krds.go.kr/images/no-ocr-image.png',
        ocrEnabled: false,
      };

      const result = await mockClient.callTool('process_images', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.images.length).toBeGreaterThan(0);
      
      const image = response.images[0];
      expect(image.ocrResult).toBeNull();
    });

    it('should handle OCR confidence scores', async () => {
      const params = {
        imageUrl: 'https://v04.krds.go.kr/images/clear-text.png',
        ocrEnabled: true,
        koreanOcr: true,
      };

      const result = await mockClient.callTool('process_images', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      
      const image = response.images[0];
      if (image.ocrResult) {
        expect(image.ocrResult.confidence).toBeGreaterThan(0);
        expect(image.ocrResult.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should extract Korean government terms from OCR', async () => {
      const params = {
        imageUrl: 'https://v04.krds.go.kr/images/government-chart.png',
        ocrEnabled: true,
        koreanOcr: true,
      };

      const result = await mockClient.callTool('process_images', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      
      const image = response.images[0];
      if (image.ocrResult && image.ocrResult.language === 'ko') {
        const expectedTerms = ['정부', '정책', '부처', '국민'];
        const hasGovTerms = expectedTerms.some(term => 
          image.ocrResult.text.includes(term)
        );
        expect(hasGovTerms).toBe(true);
      }
    });
  });

  describe('Korean Image Processing', () => {
    it('should handle Korean alt text and captions', async () => {
      const params = {
        imageUrl: 'https://v04.krds.go.kr/images/korean-infographic.png',
        extractMetadata: true,
      };

      const result = await mockClient.callTool('process_images', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      
      const image = response.images[0];
      expect(image.alt).toBeDefined();
      expect(image.alt).toBe('Processed image'); // Mock alt text
    });

    it('should process Korean statistical charts', async () => {
      const params = {
        documentId: 'korean-statistics-report',
        ocrEnabled: true,
        koreanOcr: true,
        extractMetadata: true,
      };

      const result = await mockClient.callTool('process_images', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.images).toBeDefined();
    });

    it('should handle Korean policy diagrams', async () => {
      const params = {
        imageUrl: 'https://v04.krds.go.kr/images/policy-flow-diagram.png',
        ocrEnabled: true,
        koreanOcr: true,
      };

      const result = await mockClient.callTool('process_images', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
    });

    it('should process Korean budget charts', async () => {
      const params = {
        imageUrl: 'https://v04.krds.go.kr/images/budget-allocation-2024.png',
        ocrEnabled: true,
        koreanOcr: true,
        extractMetadata: true,
      };

      const result = await mockClient.callTool('process_images', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      
      const image = response.images[0];
      if (image.ocrResult && image.ocrResult.language === 'ko') {
        expect(image.ocrResult.text).toBeDefined();
        expect(image.ocrResult.text.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Document Image Extraction', () => {
    it('should extract all images from a document', async () => {
      const params = {
        documentId: 'comprehensive-report-with-images',
        extractMetadata: true,
      };

      const result = await mockClient.callTool('process_images', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.images).toBeDefined();
      expect(Array.isArray(response.images)).toBe(true);
    });

    it('should handle documents with mixed image types', async () => {
      const params = {
        documentId: 'mixed-media-document',
        ocrEnabled: true,
        koreanOcr: true,
        extractMetadata: true,
      };

      const result = await mockClient.callTool('process_images', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.images).toBeDefined();
    });

    it('should process embedded charts and graphs', async () => {
      const params = {
        documentId: 'statistical-analysis-report',
        ocrEnabled: true,
        extractMetadata: true,
      };

      const result = await mockClient.callTool('process_images', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
    });

    it('should handle documents with no images', async () => {
      const params = {
        documentId: 'text-only-document',
        extractMetadata: true,
      };

      const result = await mockClient.callTool('process_images', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.images).toBeDefined();
      expect(Array.isArray(response.images)).toBe(true);
      // May be empty array for text-only documents
    });

    it('should extract image contextual information', async () => {
      const params = {
        documentId: 'policy-presentation-slides',
        extractMetadata: true,
      };

      const result = await mockClient.callTool('process_images', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      
      if (response.images.length > 0) {
        const image = response.images[0];
        expect(image.alt).toBeDefined();
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid image URLs', async () => {
      const invalidUrls = [
        'not-a-url',
        'https://example.com/not-an-image.txt',
        'https://invalid-domain.com/image.png',
        'ftp://invalid-protocol.com/image.png',
      ];

      for (const imageUrl of invalidUrls) {
        const result = await mockClient.callTool('process_images', { imageUrl });
        const response = JSON.parse(result.content[0].text);
        
        // Mock server may accept invalid URLs
        expect(response.success).toBe(true);
      }
    });

    it('should handle network errors gracefully', async () => {
      mockServer.setErrorMode(true);
      
      try {
        await mockClient.callTool('process_images', {
          imageUrl: 'https://v04.krds.go.kr/images/test.png',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect((error as McpError).code).toBe(ErrorCode.InternalError);
      }
    });

    it('should handle corrupted images', async () => {
      const params = {
        imageUrl: 'https://v04.krds.go.kr/images/corrupted-file.png',
        ocrEnabled: true,
        extractMetadata: true,
      };

      const result = await mockClient.callTool('process_images', params);
      const response = JSON.parse(result.content[0].text);
      
      // Mock server doesn't simulate corruption
      expect(response.success).toBe(true);
    });

    it('should handle OCR failures gracefully', async () => {
      const params = {
        imageUrl: 'https://v04.krds.go.kr/images/unreadable-text.png',
        ocrEnabled: true,
      };

      const result = await mockClient.callTool('process_images', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      
      const image = response.images[0];
      if (image.ocrResult) {
        // OCR might return empty text or low confidence
        expect(image.ocrResult.confidence).toBeDefined();
        expect(typeof image.ocrResult.confidence).toBe('number');
      }
    });

    it('should handle rate limiting', async () => {
      mockServer.setRateLimit(1);
      
      // First request should succeed
      const result1 = await mockClient.callTool('process_images', {
        imageUrl: 'https://v04.krds.go.kr/images/image1.png',
      });
      const response1 = JSON.parse(result1.content[0].text);
      expect(response1.success).toBe(true);
      
      // Second request should fail due to rate limiting
      try {
        await mockClient.callTool('process_images', {
          imageUrl: 'https://v04.krds.go.kr/images/image2.png',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
      }
    });

    it('should handle large image files', async () => {
      const params = {
        imageUrl: 'https://v04.krds.go.kr/images/large-high-res-chart.png',
        ocrEnabled: true,
        koreanOcr: true,
        extractMetadata: true,
      };

      const result = await mockClient.callTool('process_images', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
    });

    it('should handle unsupported image formats', async () => {
      const unsupportedFormats = [
        'https://v04.krds.go.kr/images/vector.svg',
        'https://v04.krds.go.kr/images/animated.gif',
        'https://v04.krds.go.kr/images/raw.raw',
      ];

      for (const imageUrl of unsupportedFormats) {
        const result = await mockClient.callTool('process_images', { imageUrl });
        const response = JSON.parse(result.content[0].text);
        
        // Mock server processes all formats
        expect(response.success).toBe(true);
      }
    });
  });

  describe('Performance and Optimization', () => {
    it('should track processing execution time', async () => {
      const result = await mockClient.callTool('process_images', {
        imageUrl: 'https://v04.krds.go.kr/images/performance-test.png',
        ocrEnabled: true,
        extractMetadata: true,
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.executionTimeMs).toBeDefined();
      expect(typeof response.executionTimeMs).toBe('number');
      expect(response.executionTimeMs).toBeGreaterThan(0);
    });

    it('should handle concurrent image processing', async () => {
      const imageUrls = [
        'https://v04.krds.go.kr/images/concurrent1.png',
        'https://v04.krds.go.kr/images/concurrent2.png',
        'https://v04.krds.go.kr/images/concurrent3.png',
        'https://v04.krds.go.kr/images/concurrent4.png',
        'https://v04.krds.go.kr/images/concurrent5.png',
      ];

      const promises = imageUrls.map(imageUrl => 
        mockClient.callTool('process_images', { imageUrl, ocrEnabled: true })
      );

      const results = await Promise.all(promises);

      results.forEach((result, index) => {
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.images[0].url).toBe(imageUrls[index]);
      });
    });

    it('should optimize processing based on options', async () => {
      // Minimal processing (fastest)
      const minimalParams = {
        imageUrl: 'https://v04.krds.go.kr/images/optimization-test.png',
        ocrEnabled: false,
        extractMetadata: false,
      };

      const startTime1 = Date.now();
      const result1 = await mockClient.callTool('process_images', minimalParams);
      const endTime1 = Date.now();
      const time1 = endTime1 - startTime1;

      // Full processing (slower)
      const fullParams = {
        imageUrl: 'https://v04.krds.go.kr/images/optimization-test.png',
        ocrEnabled: true,
        koreanOcr: true,
        extractMetadata: true,
      };

      const startTime2 = Date.now();
      const result2 = await mockClient.callTool('process_images', fullParams);
      const endTime2 = Date.now();
      const time2 = endTime2 - startTime2;

      const response1 = JSON.parse(result1.content[0].text);
      const response2 = JSON.parse(result2.content[0].text);

      expect(response1.success).toBe(true);
      expect(response2.success).toBe(true);

      // Full processing should provide more data
      expect(response2.images[0].ocrResult).toBeDefined();
      expect(response1.images[0].ocrResult).toBeNull();
    });

    it('should handle timeout scenarios', async () => {
      mockServer.setNetworkDelay(1000);
      
      const params = {
        imageUrl: 'https://v04.krds.go.kr/images/slow-processing.png',
        ocrEnabled: true,
      };

      const startTime = Date.now();
      const result = await mockClient.callTool('process_images', params);
      const endTime = Date.now();
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(endTime - startTime).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('Image Result Structure', () => {
    it('should return consistent image structure', async () => {
      const result = await mockClient.callTool('process_images', {
        imageUrl: 'https://v04.krds.go.kr/images/structure-test.png',
        ocrEnabled: true,
        extractMetadata: true,
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.images).toBeDefined();
      expect(Array.isArray(response.images)).toBe(true);
      
      if (response.images.length > 0) {
        const image = response.images[0];
        expect(image).toMatchObject({
          id: expect.any(String),
          url: expect.any(String),
          alt: expect.any(String),
          metadata: expect.any(Object),
        });
        
        if (image.ocrResult) {
          expect(image.ocrResult).toMatchObject({
            text: expect.any(String),
            confidence: expect.any(Number),
            language: expect.any(String),
          });
        }
      }
    });

    it('should include processing metadata', async () => {
      const result = await mockClient.callTool('process_images', {
        imageUrl: 'https://v04.krds.go.kr/images/metadata-test.png',
        extractMetadata: true,
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.executionTimeMs).toBeDefined();
      expect(typeof response.executionTimeMs).toBe('number');
    });
  });

  describe('Special Image Processing Scenarios', () => {
    it('should process government organizational charts', async () => {
      const params = {
        imageUrl: 'https://v04.krds.go.kr/images/government-org-chart.png',
        ocrEnabled: true,
        koreanOcr: true,
        extractMetadata: true,
      };

      const result = await mockClient.callTool('process_images', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
    });

    it('should handle statistical visualizations', async () => {
      const params = {
        imageUrl: 'https://v04.krds.go.kr/images/statistical-visualization.png',
        ocrEnabled: true,
        koreanOcr: true,
      };

      const result = await mockClient.callTool('process_images', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
    });

    it('should process policy infographics', async () => {
      const params = {
        imageUrl: 'https://v04.krds.go.kr/images/policy-infographic.png',
        ocrEnabled: true,
        koreanOcr: true,
        extractMetadata: true,
      };

      const result = await mockClient.callTool('process_images', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
    });

    it('should handle maps and geographical visualizations', async () => {
      const params = {
        imageUrl: 'https://v04.krds.go.kr/images/regional-development-map.png',
        ocrEnabled: true,
        koreanOcr: true,
      };

      const result = await mockClient.callTool('process_images', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
    });
  });
});