/**
 * Mock MCP Server for Testing
 * 
 * Provides a mock implementation of the MCP Server for isolated testing
 * of KRDS tools without requiring a full server instance.
 * 
 * @author KRDS MCP Server Test Suite
 * @version 1.0.0
 */

import { EventEmitter } from 'events';
import { jest } from '@jest/globals';
import type { 
  CallToolRequest, 
  CallToolResult, 
  ListToolsRequest, 
  ListToolsResult,
  Tool,
  ErrorCode,
  McpError 
} from '@modelcontextprotocol/sdk/types.js';

export interface MockToolResult {
  success: boolean;
  data?: any;
  error?: string;
  executionTimeMs?: number;
}

export interface MockToolHandler {
  (params: any): Promise<MockToolResult> | MockToolResult;
}

/**
 * Mock MCP Server implementation for testing
 */
export class MockMCPServer extends EventEmitter {
  private tools = new Map<string, Tool>();
  private toolHandlers = new Map<string, MockToolHandler>();
  private requestLog: Array<{ method: string; params: any; timestamp: number }> = [];
  private networkDelay = 0;
  private errorMode = false;
  private rateLimitCount = 0;
  private maxRateLimit = 100;

  constructor() {
    super();
    this.setupDefaultTools();
  }

  /**
   * Register a tool with the mock server
   */
  registerTool(tool: Tool, handler: MockToolHandler): void {
    this.tools.set(tool.name, tool);
    this.toolHandlers.set(tool.name, handler);
  }

  /**
   * Handle tool list request
   */
  async handleListTools(request: ListToolsRequest): Promise<ListToolsResult> {
    this.logRequest('tools/list', request);
    
    if (this.errorMode) {
      throw new McpError(ErrorCode.InternalError, 'Mock server in error mode');
    }

    await this.simulateNetworkDelay();

    return {
      tools: Array.from(this.tools.values()),
    };
  }

  /**
   * Handle tool call request
   */
  async handleCallTool(request: CallToolRequest): Promise<CallToolResult> {
    this.logRequest('tools/call', request);
    
    if (this.errorMode) {
      throw new McpError(ErrorCode.InternalError, 'Mock server in error mode');
    }

    if (this.rateLimitCount >= this.maxRateLimit) {
      throw new McpError(ErrorCode.InternalError, 'Rate limit exceeded');
    }

    this.rateLimitCount++;

    const { name, arguments: params } = request.params;
    const handler = this.toolHandlers.get(name);

    if (!handler) {
      throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
    }

    await this.simulateNetworkDelay();

    try {
      const startTime = Date.now();
      const result = await handler(params);
      const executionTime = Date.now() - startTime;

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: result.error || 'Tool execution failed',
                executionTimeMs: result.executionTimeMs || executionTime,
              }, null, 2),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              ...result.data,
              executionTimeMs: result.executionTimeMs || executionTime,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError, 
        `Tool execution error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Set network delay for testing
   */
  setNetworkDelay(delayMs: number): void {
    this.networkDelay = delayMs;
  }

  /**
   * Enable/disable error mode for testing error handling
   */
  setErrorMode(enabled: boolean): void {
    this.errorMode = enabled;
  }

  /**
   * Set rate limit for testing
   */
  setRateLimit(limit: number): void {
    this.maxRateLimit = limit;
  }

  /**
   * Reset rate limit counter
   */
  resetRateLimit(): void {
    this.rateLimitCount = 0;
  }

  /**
   * Get request log for verification
   */
  getRequestLog(): Array<{ method: string; params: any; timestamp: number }> {
    return [...this.requestLog];
  }

  /**
   * Clear request log
   */
  clearRequestLog(): void {
    this.requestLog.length = 0;
  }

  /**
   * Get registered tools
   */
  getRegisteredTools(): string[] {
    return Array.from(this.tools.keys());
  }

  private setupDefaultTools(): void {
    // Search Documents Tool
    this.registerTool({
      name: 'search_documents',
      description: 'Search KRDS website for Korean government records and documents',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          maxResults: { type: 'number', description: 'Maximum number of results' },
          category: { type: 'string', description: 'Document category filter' },
          dateFrom: { type: 'string', description: 'Start date filter' },
          dateTo: { type: 'string', description: 'End date filter' },
          sortBy: { type: 'string', enum: ['relevance', 'date', 'title'] },
        },
        required: ['query'],
      },
    }, this.mockSearchDocuments.bind(this));

    // Retrieve Content Tool
    this.registerTool({
      name: 'retrieve_content',
      description: 'Retrieve complete content from specific KRDS documents',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Document URL' },
          documentId: { type: 'string', description: 'Document ID' },
          includeImages: { type: 'boolean', description: 'Include images' },
          includeAttachments: { type: 'boolean', description: 'Include attachments' },
          processKoreanText: { type: 'boolean', description: 'Process Korean text' },
        },
        required: [],
      },
    }, this.mockRetrieveContent.bind(this));

    // Navigate Site Tool
    this.registerTool({
      name: 'navigate_site',
      description: 'Navigate and explore KRDS website structure',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list_categories', 'browse_category', 'get_sitemap'] },
          category: { type: 'string', description: 'Category ID for browsing' },
          depth: { type: 'number', description: 'Navigation depth' },
        },
        required: ['action'],
      },
    }, this.mockNavigateSite.bind(this));

    // Process Images Tool
    this.registerTool({
      name: 'process_images',
      description: 'Extract, process, and analyze images from KRDS documents',
      inputSchema: {
        type: 'object',
        properties: {
          imageUrl: { type: 'string', description: 'Image URL' },
          documentId: { type: 'string', description: 'Document ID containing images' },
          ocrEnabled: { type: 'boolean', description: 'Enable OCR processing' },
          koreanOcr: { type: 'boolean', description: 'Enable Korean OCR' },
          extractMetadata: { type: 'boolean', description: 'Extract image metadata' },
        },
        required: [],
      },
    }, this.mockProcessImages.bind(this));

    // Export Documents Tool
    this.registerTool({
      name: 'export_documents',
      description: 'Export KRDS documents in various formats',
      inputSchema: {
        type: 'object',
        properties: {
          documents: { type: 'array', description: 'Documents to export' },
          format: { type: 'string', enum: ['json', 'csv', 'xlsx', 'pdf', 'xml', 'markdown', 'html'] },
          filename: { type: 'string', description: 'Output filename' },
          includeImages: { type: 'boolean', description: 'Include images' },
          includeAttachments: { type: 'boolean', description: 'Include attachments' },
        },
        required: ['documents', 'format'],
      },
    }, this.mockExportDocuments.bind(this));

    // Analyze Korean Text Tool
    this.registerTool({
      name: 'analyze_korean_text',
      description: 'Process and analyze Korean text with specialized support',
      inputSchema: {
        type: 'object',
        properties: {
          texts: { type: 'array', items: { type: 'string' }, description: 'Korean texts to analyze' },
          includeRomanization: { type: 'boolean', description: 'Include romanization' },
          includeSentiment: { type: 'boolean', description: 'Include sentiment analysis' },
          extractKeywords: { type: 'boolean', description: 'Extract keywords' },
          analyzeStemming: { type: 'boolean', description: 'Analyze word stemming' },
        },
        required: ['texts'],
      },
    }, this.mockAnalyzeKoreanText.bind(this));
  }

  private logRequest(method: string, params: any): void {
    this.requestLog.push({
      method,
      params,
      timestamp: Date.now(),
    });
  }

  private async simulateNetworkDelay(): Promise<void> {
    if (this.networkDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.networkDelay));
    }
  }

  // Mock tool implementations
  private async mockSearchDocuments(params: any): Promise<MockToolResult> {
    const { query, maxResults = 20, category, dateFrom, dateTo, sortBy = 'relevance' } = params;

    if (!query || query.trim() === '') {
      return { success: false, error: 'Query cannot be empty' };
    }

    // Simulate search results based on query
    const mockResults = [
      {
        id: `result-1-${query}`,
        title: `Educational Policy for ${query}`,
        titleKorean: `${query}에 대한 교육정책`,
        url: `https://v04.krds.go.kr/docs/${query}-policy`,
        snippet: `This document discusses policies related to ${query}...`,
        snippetKorean: `이 문서는 ${query}과 관련된 정책에 대해 논의합니다...`,
        category: category || 'Education',
        agency: 'Ministry of Education',
        agencyKorean: '교육부',
        publicationDate: '2024-01-15',
        relevanceScore: 0.95,
      },
      {
        id: `result-2-${query}`,
        title: `Implementation Guide for ${query}`,
        titleKorean: `${query} 시행 가이드`,
        url: `https://v04.krds.go.kr/docs/${query}-implementation`,
        snippet: `Implementation guidelines for ${query} policies...`,
        snippetKorean: `${query} 정책의 시행 가이드라인입니다...`,
        category: category || 'Policy',
        agency: 'Government Policy Coordination Office',
        agencyKorean: '국무조정실',
        publicationDate: '2024-01-12',
        relevanceScore: 0.87,
      },
    ];

    return {
      success: true,
      data: {
        documents: mockResults.slice(0, maxResults),
        totalCount: mockResults.length,
        currentPage: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
        searchQuery: { query, category, sortBy },
      },
    };
  }

  private async mockRetrieveContent(params: any): Promise<MockToolResult> {
    const { url, documentId, includeImages = false, includeAttachments = false, processKoreanText = true } = params;

    if (!url && !documentId) {
      return { success: false, error: 'Either URL or document ID must be provided' };
    }

    const mockDocument = {
      id: documentId || 'mock-doc-123',
      title: 'Mock KRDS Document',
      titleKorean: '모의 KRDS 문서',
      url: url || 'https://v04.krds.go.kr/docs/mock-document',
      content: 'This is a mock document content for testing purposes.',
      contentKorean: '이것은 테스트 목적을 위한 모의 문서 내용입니다.',
      metadata: {
        agency: 'Test Agency',
        agencyKorean: '테스트 기관',
        publicationDate: '2024-01-15',
        language: 'ko',
        keywords: ['test', 'mock', 'document'],
        keywordsKorean: ['테스트', '모의', '문서'],
      },
      images: includeImages ? [{
        id: 'img-1',
        url: 'https://v04.krds.go.kr/images/test.png',
        alt: 'Test image',
        altKorean: '테스트 이미지',
      }] : [],
      attachments: includeAttachments ? [{
        id: 'att-1',
        filename: 'test.pdf',
        url: 'https://v04.krds.go.kr/files/test.pdf',
        mimeType: 'application/pdf',
      }] : [],
    };

    return { success: true, data: { document: mockDocument } };
  }

  private async mockNavigateSite(params: any): Promise<MockToolResult> {
    const { action, category, depth = 2 } = params;

    switch (action) {
      case 'list_categories':
        return {
          success: true,
          data: {
            categories: [
              { id: 'education', name: 'Education', nameKorean: '교육', documentCount: 142 },
              { id: 'healthcare', name: 'Healthcare', nameKorean: '보건의료', documentCount: 198 },
              { id: 'transport', name: 'Transportation', nameKorean: '교통', documentCount: 87 },
            ],
          },
        };

      case 'browse_category':
        if (!category) {
          return { success: false, error: 'Category parameter required for browsing' };
        }
        return {
          success: true,
          data: {
            category: { id: category, name: category },
            documents: [
              {
                id: `${category}-doc-1`,
                title: `${category} Policy Document`,
                url: `https://v04.krds.go.kr/category/${category}/doc-1`,
              },
            ],
            subcategories: [
              { id: `${category}-sub-1`, name: `${category} Subcategory 1` },
            ],
          },
        };

      case 'get_sitemap':
        return {
          success: true,
          data: {
            sitemap: {
              totalCategories: 15,
              totalDocuments: 1250,
              lastUpdated: '2024-01-15T10:00:00Z',
              structure: { education: 142, healthcare: 198, transport: 87 },
            },
          },
        };

      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  }

  private async mockProcessImages(params: any): Promise<MockToolResult> {
    const { imageUrl, documentId, ocrEnabled = false, koreanOcr = false, extractMetadata = false } = params;

    if (!imageUrl && !documentId) {
      return { success: false, error: 'Either image URL or document ID must be provided' };
    }

    const mockResult = {
      images: [{
        id: 'img-processed-1',
        url: imageUrl || 'https://v04.krds.go.kr/images/default.png',
        alt: 'Processed image',
        metadata: extractMetadata ? {
          width: 800,
          height: 600,
          format: 'PNG',
          fileSize: 125440,
          colorSpace: 'sRGB',
        } : {},
        ocrResult: ocrEnabled ? {
          text: koreanOcr ? '한국어 텍스트 인식 결과' : 'English OCR text result',
          confidence: 0.92,
          language: koreanOcr ? 'ko' : 'en',
        } : null,
      }],
    };

    return { success: true, data: mockResult };
  }

  private async mockExportDocuments(params: any): Promise<MockToolResult> {
    const { documents, format, filename = 'export', includeImages = false, includeAttachments = false } = params;

    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return { success: false, error: 'Documents array is required and cannot be empty' };
    }

    const supportedFormats = ['json', 'csv', 'xlsx', 'pdf', 'xml', 'markdown', 'html'];
    if (!supportedFormats.includes(format)) {
      return { success: false, error: `Unsupported format: ${format}` };
    }

    const mockExport = {
      filename: `${filename}.${format}`,
      format,
      documentCount: documents.length,
      fileSize: 1024 * documents.length, // Mock file size
      downloadUrl: `https://v04.krds.go.kr/exports/${filename}.${format}`,
      generatedAt: new Date().toISOString(),
      includeImages,
      includeAttachments,
    };

    return { success: true, data: mockExport };
  }

  private async mockAnalyzeKoreanText(params: any): Promise<MockToolResult> {
    const { texts, includeRomanization = false, includeSentiment = false, extractKeywords = false, analyzeStemming = false } = params;

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return { success: false, error: 'Texts array is required and cannot be empty' };
    }

    const analyses = texts.map((text: string, index: number) => ({
      originalText: text,
      romanized: includeRomanization ? this.mockRomanize(text) : undefined,
      keywords: extractKeywords ? this.mockExtractKeywords(text) : undefined,
      stemmed: analyzeStemming ? this.mockStemWords(text) : undefined,
      sentiment: includeSentiment ? this.mockAnalyzeSentiment(text) : undefined,
      wordCount: text.split(/\s+/).length,
      characterCount: text.length,
      readabilityScore: Math.random() * 10, // Mock readability score
      analysisId: `analysis-${index + 1}`,
    }));

    return { success: true, data: { analyses } };
  }

  private mockRomanize(text: string): string {
    // Simplified mock romanization
    const koreanToRoman: Record<string, string> = {
      '한국': 'hangug',
      '정부': 'jeongbu',
      '교육': 'gyoyug',
      '정책': 'jeongchaeg',
      '발표': 'balpyo',
      '의료': 'uiryo',
      '시스템': 'siseutem',
      '혁신': 'hyeogsin',
      '디지털': 'dijiteol',
      '전환': 'jeonhwan',
    };

    let romanized = text;
    for (const [korean, roman] of Object.entries(koreanToRoman)) {
      romanized = romanized.replace(new RegExp(korean, 'g'), roman);
    }
    
    return romanized;
  }

  private mockExtractKeywords(text: string): string[] {
    const commonKeywords = ['정부', '정책', '교육', '의료', '혁신', '디지털', '국민', '발표', '시스템', '전환'];
    return commonKeywords.filter(keyword => text.includes(keyword));
  }

  private mockStemWords(text: string): string[] {
    return text.split(/\s+/).map(word => word.replace(/[을를이가에서의로부터]$/, ''));
  }

  private mockAnalyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
    const positiveWords = ['발표', '혁신', '향상', '발전', '성공', '효율'];
    const negativeWords = ['문제', '위기', '실패', '감소', '악화'];
    
    const positiveCount = positiveWords.filter(word => text.includes(word)).length;
    const negativeCount = negativeWords.filter(word => text.includes(word)).length;
    
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }
}

/**
 * Create a mock MCP server instance for testing
 */
export function createMockMCPServer(): MockMCPServer {
  return new MockMCPServer();
}

/**
 * Mock MCP client for testing tool interactions
 */
export class MockMCPClient extends EventEmitter {
  private server: MockMCPServer;

  constructor(server: MockMCPServer) {
    super();
    this.server = server;
  }

  async listTools(): Promise<ListToolsResult> {
    return await this.server.handleListTools({ method: 'tools/list', params: {} });
  }

  async callTool(name: string, args: any): Promise<CallToolResult> {
    return await this.server.handleCallTool({
      method: 'tools/call',
      params: { name, arguments: args },
    });
  }

  getServer(): MockMCPServer {
    return this.server;
  }
}

/**
 * Create a mock MCP client connected to a server
 */
export function createMockMCPClient(server?: MockMCPServer): MockMCPClient {
  return new MockMCPClient(server || createMockMCPServer());
}