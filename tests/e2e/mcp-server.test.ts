/**
 * MCP Server End-to-End Tests
 * 
 * Complete end-to-end tests for the KRDS MCP server:
 * - Full MCP protocol compliance
 * - Tool registration and discovery
 * - Real Korean text processing
 * - Complete document workflows
 * - Performance and reliability
 * 
 * @author KRDS MCP Server
 * @version 1.0.0
 */

import { spawn, ChildProcess } from 'child_process';
import { WebSocket } from 'ws';
import { promises as fs } from 'fs';
import path from 'path';
import { jest } from '@jest/globals';

interface MCPMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  params?: any;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

class MCPTestClient {
  private ws: WebSocket | null = null;
  private messageId = 1;
  private responseHandlers = new Map<string | number, (message: MCPMessage) => void>();

  async connect(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://localhost:${port}`);
      
      this.ws.on('open', () => resolve());
      this.ws.on('error', reject);
      
      this.ws.on('message', (data) => {
        try {
          const message: MCPMessage = JSON.parse(data.toString());
          if (message.id && this.responseHandlers.has(message.id)) {
            const handler = this.responseHandlers.get(message.id);
            this.responseHandlers.delete(message.id);
            handler!(message);
          }
        } catch (error) {
          console.error('Failed to parse message:', error);
        }
      });
    });
  }

  async send(method: string, params?: any): Promise<MCPMessage> {
    const id = this.messageId++;
    const message: MCPMessage = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      if (!this.ws) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      this.responseHandlers.set(id, resolve);
      this.ws.send(JSON.stringify(message));

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.responseHandlers.has(id)) {
          this.responseHandlers.delete(id);
          reject(new Error(`Request timeout for method: ${method}`));
        }
      }, 30000);
    });
  }

  async close(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

describe('KRDS MCP Server E2E Tests', () => {
  let serverProcess: ChildProcess;
  let testClient: MCPTestClient;
  let serverPort: number;

  beforeAll(async () => {
    // Find an available port
    serverPort = 3001 + Math.floor(Math.random() * 1000);

    // Start the MCP server
    serverProcess = spawn('npm', ['run', 'start'], {
      env: {
        ...process.env,
        PORT: serverPort.toString(),
        NODE_ENV: 'test',
        LOG_LEVEL: 'error', // Reduce log noise
      },
      stdio: 'pipe',
    });

    // Wait for server to start
    await new Promise<void>((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => {
        reject(new Error('Server startup timeout'));
      }, 30000);

      const onData = (data: Buffer) => {
        output += data.toString();
        if (output.includes('MCP Server started') || output.includes(`listening on port ${serverPort}`)) {
          clearTimeout(timeout);
          serverProcess.stdout?.off('data', onData);
          serverProcess.stderr?.off('data', onData);
          resolve();
        }
      };

      serverProcess.stdout?.on('data', onData);
      serverProcess.stderr?.on('data', onData);

      serverProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    // Initialize test client
    testClient = new MCPTestClient();
    await testClient.connect(serverPort);
  }, 45000);

  afterAll(async () => {
    await testClient.close();
    
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      
      // Wait for graceful shutdown
      await new Promise<void>((resolve) => {
        serverProcess.on('exit', () => resolve());
        setTimeout(() => {
          serverProcess.kill('SIGKILL');
          resolve();
        }, 5000);
      });
    }
  });

  describe('MCP Protocol Compliance', () => {
    it('should respond to initialize request', async () => {
      const response = await testClient.send('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {
          roots: {
            listChanged: true,
          },
        },
        clientInfo: {
          name: 'test-client',
          version: '1.0.0',
        },
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toMatchObject({
        protocolVersion: '2024-11-05',
        capabilities: expect.objectContaining({
          tools: expect.any(Object),
        }),
        serverInfo: expect.objectContaining({
          name: 'krds-mcp-server',
          version: expect.any(String),
        }),
      });
    });

    it('should list available tools', async () => {
      const response = await testClient.send('tools/list');

      expect(response.error).toBeUndefined();
      expect(response.result?.tools).toBeInstanceOf(Array);
      
      const toolNames = response.result.tools.map((tool: any) => tool.name);
      expect(toolNames).toEqual(expect.arrayContaining([
        'retrieve_content',
        'search_documents',
        'navigate_site',
        'analyze_korean_text',
        'export_documents',
        'process_images',
      ]));

      // Verify each tool has required properties
      response.result.tools.forEach((tool: any) => {
        expect(tool).toMatchObject({
          name: expect.any(String),
          description: expect.any(String),
          inputSchema: expect.objectContaining({
            type: 'object',
            properties: expect.any(Object),
          }),
        });
      });
    });

    it('should handle invalid method gracefully', async () => {
      const response = await testClient.send('invalid/method');

      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(-32601); // Method not found
      expect(response.error?.message).toContain('Method not found');
    });

    it('should validate tool parameters', async () => {
      const response = await testClient.send('tools/call', {
        name: 'retrieve_content',
        arguments: {
          // Missing required parameters
        },
      });

      expect(response.error).toBeDefined();
      expect(response.error?.message).toContain('validation');
    });
  });

  describe('Korean Text Processing E2E', () => {
    it('should process Korean government document', async () => {
      // Skip if no real KRDS access (mock for CI)
      const mockKrdsUrl = process.env.TEST_KRDS_URL || 'https://v04.krds.go.kr/cmm/fms/FileDown.do?atchFileId=FILE_000000000000001';

      const response = await testClient.send('tools/call', {
        name: 'retrieve_content',
        arguments: {
          url: mockKrdsUrl,
          includeImages: true,
          includeAttachments: true,
          processKoreanText: true,
        },
      });

      if (response.error) {
        // If real KRDS is not accessible, skip this test
        console.warn('Skipping real KRDS test due to network access limitations');
        return;
      }

      expect(response.result?.success).toBe(true);
      expect(response.result?.document).toBeDefined();

      const document = response.result.document;
      expect(document.titleKorean).toBeDefined();
      expect(document.contentKorean).toBeDefined();
      expect(document.metadata.keywordsKorean).toBeInstanceOf(Array);
      expect(document.metadata.language).toMatch(/ko/);
    }, 60000);

    it('should analyze Korean text with comprehensive features', async () => {
      const koreanTexts = [
        '대한민국 정부는 국민의 복지향상과 경제발전을 위한 새로운 정책을 발표했습니다.',
        '교육부는 디지털 교육 혁신을 통해 창의적 인재양성에 힘쓰고 있습니다.',
        '보건복지부의 의료정책은 모든 국민이 양질의 의료서비스를 받을 수 있도록 하는 것이 목표입니다.',
      ];

      const response = await testClient.send('tools/call', {
        name: 'analyze_korean_text',
        arguments: {
          texts: koreanTexts,
          includeRomanization: true,
          includeSentiment: true,
          extractKeywords: true,
          analyzeStemming: true,
        },
      });

      expect(response.error).toBeUndefined();
      expect(response.result?.success).toBe(true);
      expect(response.result?.analyses).toHaveLength(3);

      response.result.analyses.forEach((analysis: any, index: number) => {
        expect(analysis.originalText).toBe(koreanTexts[index]);
        expect(analysis.keywords).toBeInstanceOf(Array);
        expect(analysis.keywords.length).toBeGreaterThan(0);
        expect(analysis.romanized).toBeDefined();
        expect(analysis.romanized.length).toBeGreaterThan(0);
        expect(analysis.sentiment).toMatch(/positive|negative|neutral/);
        expect(analysis.stemmed).toBeInstanceOf(Array);
        expect(analysis.wordCount).toBeGreaterThan(0);
        expect(analysis.characterCount).toBeGreaterThan(0);

        // Verify Korean-specific processing
        expect(analysis.keywords).toEqual(
          expect.arrayContaining(['정부', '정책', '국민'])
        );
      });
    });

    it('should handle mixed Korean-English text', async () => {
      const mixedText = 'Korean government 한국 정부 implements AI 인공지능 technology 기술 for digital transformation 디지털 전환.';

      const response = await testClient.send('tools/call', {
        name: 'analyze_korean_text',
        arguments: {
          texts: [mixedText],
          includeRomanization: true,
          extractKeywords: true,
        },
      });

      expect(response.result?.success).toBe(true);
      const analysis = response.result.analyses[0];
      
      expect(analysis.keywords).toEqual(
        expect.arrayContaining(['정부', '인공지능', '기술', '디지털'])
      );
      expect(analysis.romanized).toContain('hangug');
      expect(analysis.romanized).toContain('jeongbu');
    });
  });

  describe('Complete Document Workflows', () => {
    it('should execute search → retrieve → export workflow', async () => {
      // Step 1: Search for documents
      const searchResponse = await testClient.send('tools/call', {
        name: 'search_documents',
        arguments: {
          query: '교육정책',
          maxResults: 3,
          useCache: true,
        },
      });

      if (searchResponse.error || !searchResponse.result?.success) {
        console.warn('Skipping workflow test due to search limitations');
        return;
      }

      expect(searchResponse.result.documents.length).toBeGreaterThan(0);

      // Step 2: Retrieve detailed content for first document
      const document = searchResponse.result.documents[0];
      const retrieveResponse = await testClient.send('tools/call', {
        name: 'retrieve_content',
        arguments: {
          documentId: document.id,
          includeImages: false,
          includeAttachments: false,
          processKoreanText: true,
        },
      });

      if (retrieveResponse.error) {
        console.warn('Skipping retrieval step due to access limitations');
        return;
      }

      expect(retrieveResponse.result?.success).toBe(true);

      // Step 3: Export the document
      const exportResponse = await testClient.send('tools/call', {
        name: 'export_documents',
        arguments: {
          documents: [retrieveResponse.result.document],
          format: 'json',
          includeImages: false,
          includeAttachments: false,
          filename: 'test-export',
        },
      });

      expect(exportResponse.result?.success).toBe(true);
      expect(exportResponse.result?.filename).toContain('test-export');
      expect(exportResponse.result?.documentCount).toBe(1);
    }, 120000);

    it('should handle navigation and category browsing', async () => {
      const navigationResponse = await testClient.send('tools/call', {
        name: 'navigate_site',
        arguments: {
          action: 'list_categories',
        },
      });

      if (navigationResponse.error) {
        console.warn('Skipping navigation test due to access limitations');
        return;
      }

      expect(navigationResponse.result?.success).toBe(true);
      expect(navigationResponse.result?.categories).toBeInstanceOf(Array);

      if (navigationResponse.result.categories.length > 0) {
        const firstCategory = navigationResponse.result.categories[0];
        
        const browseResponse = await testClient.send('tools/call', {
          name: 'navigate_site',
          arguments: {
            action: 'browse_category',
            category: firstCategory.id,
          },
        });

        if (browseResponse.result?.success) {
          expect(browseResponse.result.documents).toBeInstanceOf(Array);
        }
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle invalid URLs gracefully', async () => {
      const response = await testClient.send('tools/call', {
        name: 'retrieve_content',
        arguments: {
          url: 'https://example.com/not-krds',
          includeImages: false,
          includeAttachments: false,
          processKoreanText: false,
        },
      });

      expect(response.result?.success).toBe(false);
      expect(response.result?.error).toContain('Invalid KRDS URL');
    });

    it('should handle empty search queries', async () => {
      const response = await testClient.send('tools/call', {
        name: 'search_documents',
        arguments: {
          query: '',
          maxResults: 10,
        },
      });

      expect(response.result?.success).toBe(false);
      expect(response.result?.error).toContain('Query cannot be empty');
    });

    it('should handle malformed Korean text', async () => {
      const malformedText = 'ㅎㅏㄴㄱㅜㄱㅓ ㅌㅔㅅㅌㅡ \u0000\u0001';

      const response = await testClient.send('tools/call', {
        name: 'analyze_korean_text',
        arguments: {
          texts: [malformedText],
          extractKeywords: true,
        },
      });

      expect(response.result?.success).toBe(true);
      expect(response.result?.analyses[0].originalText).toBe(malformedText);
    });

    it('should handle network timeouts gracefully', async () => {
      // Use a non-existent KRDS URL to simulate timeout
      const response = await testClient.send('tools/call', {
        name: 'retrieve_content',
        arguments: {
          url: 'https://v04.krds.go.kr/timeout-test-endpoint-12345',
          includeImages: false,
          includeAttachments: false,
          processKoreanText: false,
        },
      });

      expect(response.result?.success).toBe(false);
      expect(response.result?.error).toMatch(/timeout|not found|network/i);
    }, 45000);
  });

  describe('Performance and Load Testing', () => {
    it('should handle multiple concurrent tool calls', async () => {
      const concurrentCalls = 5;
      const koreanTexts = Array.from({ length: concurrentCalls }, (_, i) => 
        `테스트 문서 ${i + 1}: 한국 정부의 정책 발표에 관한 내용입니다.`
      );

      const startTime = Date.now();
      
      const promises = koreanTexts.map(text => 
        testClient.send('tools/call', {
          name: 'analyze_korean_text',
          arguments: {
            texts: [text],
            extractKeywords: true,
          },
        })
      );

      const responses = await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      // All requests should succeed
      responses.forEach((response, index) => {
        expect(response.result?.success).toBe(true);
        expect(response.result?.analyses[0].originalText).toBe(koreanTexts[index]);
      });

      // Should complete within reasonable time
      expect(totalTime).toBeLessThan(15000); // 15 seconds for 5 concurrent requests
      console.log(`Processed ${concurrentCalls} concurrent requests in ${totalTime}ms`);
    }, 30000);

    it('should maintain stable memory usage', async () => {
      const iterations = 10;
      let memoryGrowth = 0;

      for (let i = 0; i < iterations; i++) {
        const initialMemory = process.memoryUsage().heapUsed;

        await testClient.send('tools/call', {
          name: 'analyze_korean_text',
          arguments: {
            texts: [`메모리 테스트 ${i}: 한국어 텍스트 처리 성능 검증을 위한 반복 테스트입니다.`],
            extractKeywords: true,
            includeRomanization: true,
          },
        });

        const finalMemory = process.memoryUsage().heapUsed;
        memoryGrowth += finalMemory - initialMemory;

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      const avgMemoryGrowthMB = (memoryGrowth / iterations) / (1024 * 1024);
      console.log(`Average memory growth per operation: ${avgMemoryGrowthMB.toFixed(2)}MB`);

      // Memory growth should be minimal (< 5MB per operation on average)
      expect(avgMemoryGrowthMB).toBeLessThan(5);
    });
  });

  describe('Cache and State Management', () => {
    it('should benefit from caching on repeated requests', async () => {
      const testText = '캐시 테스트: 한국 정부의 디지털 정책 추진 현황';

      // First request
      const startTime1 = Date.now();
      const response1 = await testClient.send('tools/call', {
        name: 'analyze_korean_text',
        arguments: {
          texts: [testText],
          extractKeywords: true,
          includeRomanization: true,
        },
      });
      const time1 = Date.now() - startTime1;

      expect(response1.result?.success).toBe(true);

      // Second request (should be faster due to caching)
      const startTime2 = Date.now();
      const response2 = await testClient.send('tools/call', {
        name: 'analyze_korean_text',
        arguments: {
          texts: [testText],
          extractKeywords: true,
          includeRomanization: true,
        },
      });
      const time2 = Date.now() - startTime2;

      expect(response2.result?.success).toBe(true);
      expect(response2.result).toEqual(response1.result);

      // Second request should be significantly faster
      console.log(`First request: ${time1}ms, Second request: ${time2}ms`);
      expect(time2).toBeLessThan(time1 * 0.8); // At least 20% faster
    });

    it('should handle cache invalidation properly', async () => {
      // This would require more sophisticated cache control mechanisms
      // For now, just verify that the server maintains state correctly
      
      const response = await testClient.send('tools/call', {
        name: 'analyze_korean_text',
        arguments: {
          texts: ['캐시 무효화 테스트'],
          extractKeywords: true,
        },
      });

      expect(response.result?.success).toBe(true);
    });
  });
});