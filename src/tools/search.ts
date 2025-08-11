/**
 * KRDS Search MCP Tool
 * 
 * This tool provides comprehensive search functionality for the KRDS website.
 * It supports Korean text search with various filters and options.
 * 
 * Features:
 * =========
 * 1. Full-text search with Korean language support
 * 2. Category and date-based filtering
 * 3. Agency and document type filtering
 * 4. Relevance and date-based sorting
 * 5. Pagination and result limiting
 * 6. Caching for performance optimization
 * 7. Korean text normalization and processing
 * 
 * Usage Examples:
 * ===============
 * - Basic search: { "query": "환경정책" }
 * - Filtered search: { "query": "정부정책", "category": "환경", "agency": "환경부" }
 * - Date range search: { "query": "규제개선", "dateFrom": "2023-01-01", "dateTo": "2023-12-31" }
 * 
 * @author Your Name
 * @version 1.0.0
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// Internal imports
import type { ToolContext, SearchParams, KrdsSearchResult } from '@/types/index.js';
import { validateSearchParams } from '@/utils/validation.js';
import { normalizeKoreanText } from '@/korean/text-processor.js';

// ============================================================================
// Schema Definitions
// ============================================================================

/**
 * Input schema for the search tool
 * Validates and type-checks all search parameters
 */
const SearchToolSchema = z.object({
  // Core search parameters
  query: z.string()
    .min(1, 'Search query cannot be empty')
    .max(500, 'Search query too long')
    .describe('Search query in Korean or English'),
    
  queryKorean: z.string()
    .max(500, 'Korean query too long')
    .optional()
    .describe('Additional Korean search terms'),
    
  // Filtering parameters
  category: z.string()
    .max(100, 'Category name too long')
    .optional()
    .describe('Filter by document category (e.g., "환경", "경제", "사회")'),
    
  agency: z.string()
    .max(100, 'Agency name too long') 
    .optional()
    .describe('Filter by government agency (e.g., "환경부", "기획재정부")'),
    
  documentType: z.string()
    .max(50, 'Document type too long')
    .optional()
    .describe('Filter by document type (e.g., "보고서", "법령", "공지사항")'),
    
  // Date filtering
  dateFrom: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format, use YYYY-MM-DD')
    .optional()
    .describe('Search from date (YYYY-MM-DD format)'),
    
  dateTo: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format, use YYYY-MM-DD')
    .optional()
    .describe('Search to date (YYYY-MM-DD format)'),
    
  // Result configuration
  maxResults: z.number()
    .int()
    .min(1, 'At least 1 result required')
    .max(100, 'Maximum 100 results allowed')
    .default(20)
    .describe('Maximum number of results to return'),
    
  sortBy: z.enum(['relevance', 'date', 'title'])
    .default('relevance')
    .describe('Sort results by relevance, date, or title'),
    
  sortOrder: z.enum(['asc', 'desc'])
    .default('desc')
    .describe('Sort order: ascending or descending'),
    
  // Performance options
  useCache: z.boolean()
    .default(true)
    .describe('Whether to use cached results for performance'),
    
  processKoreanText: z.boolean()
    .default(true)
    .describe('Whether to apply Korean text processing (stemming, normalization)'),
});

// ============================================================================
// Tool Implementation
// ============================================================================

/**
 * Register the search tool with the MCP server
 * 
 * @param server - MCP server instance
 * @param context - Tool execution context with services and configuration
 */
export async function registerSearchTool(
  server: Server,
  context: ToolContext
): Promise<void> {
  const { logger, krdsService, cacheManager, config } = context;
  
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== 'krds_search') {
      return;
    }
    
    const toolLogger = logger.child({ tool: 'search', requestId: generateRequestId() });
    toolLogger.info('Processing KRDS search request');
    
    try {
      // Step 1: Validate and parse input parameters
      const params = SearchToolSchema.parse(request.params.arguments);
      toolLogger.debug('Search parameters validated', { params });
      
      // Step 2: Additional business logic validation
      const validationResult = validateSearchParams(params);
      if (!validationResult.valid) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid search parameters: ${validationResult.errors.join(', ')}`
        );
      }
      
      // Step 3: Process Korean text if enabled
      let processedQuery = params.query;
      if (params.processKoreanText && config.korean.enabled) {
        processedQuery = await normalizeKoreanText(params.query, {
          stemming: config.korean.features.stemming,
          romanization: config.korean.features.romanization,
        });
        toolLogger.debug('Korean text processed', { 
          original: params.query, 
          processed: processedQuery 
        });
      }
      
      // Step 4: Check cache for existing results
      const cacheKey = generateCacheKey(params);
      let searchResult: KrdsSearchResult | null = null;
      
      if (params.useCache && cacheManager) {
        searchResult = await cacheManager.get<KrdsSearchResult>(cacheKey);
        if (searchResult) {
          toolLogger.info('Returning cached search results', {
            cacheKey,
            resultCount: searchResult.documents.length
          });
          
          return {
            content: [
              {
                type: 'text',
                text: formatSearchResults(searchResult, true),
              },
            ],
          };
        }
      }
      
      // Step 5: Execute search through KRDS service
      const searchStartTime = Date.now();
      
      searchResult = await krdsService.search({
        ...params,
        query: processedQuery,
        page: 1,
        limit: params.maxResults,
      });
      
      const executionTime = Date.now() - searchStartTime;
      toolLogger.info('Search completed', {
        resultCount: searchResult.documents.length,
        totalCount: searchResult.totalCount,
        executionTimeMs: executionTime,
      });
      
      // Step 6: Cache results for future requests
      if (params.useCache && cacheManager && searchResult.documents.length > 0) {
        await cacheManager.set(cacheKey, searchResult, config.cache.ttl);
        toolLogger.debug('Search results cached', { cacheKey });
      }
      
      // Step 7: Format and return results
      return {
        content: [
          {
            type: 'text',
            text: formatSearchResults(searchResult, false),
          },
        ],
      };
      
    } catch (error) {
      toolLogger.error('Search tool error', { error });
      
      if (error instanceof McpError) {
        throw error;
      }
      
      throw new McpError(
        ErrorCode.InternalError,
        `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  });
  
  // Tool metadata is handled by the centralized registry
}// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique request ID for logging and tracing
 */
function generateRequestId(): string {
  return `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a cache key for search parameters
 * This ensures consistent caching across similar searches
 */
function generateCacheKey(params: SearchParams): string {
  const keyComponents = [
    'krds_search',
    params.query,
    params.queryKorean || '',
    params.category || '',
    params.agency || '',
    params.documentType || '',
    params.dateFrom || '',
    params.dateTo || '',
    params.maxResults || 20,
    params.sortBy || 'relevance',
    params.sortOrder || 'desc',
  ];
  
  return keyComponents.join('|');
}

/**
 * Format search results for display
 * Creates a human-readable summary of the search results
 */
function formatSearchResults(result: KrdsSearchResult, fromCache: boolean): string {
  const { documents, totalCount, currentPage, totalPages, executionTimeMs } = result;
  
  let output = `# KRDS Search Results ${fromCache ? '(Cached)' : ''}\n\n`;
  
  // Summary information
  output += `**Search Summary:**\n`;
  output += `- Found ${totalCount} total documents\n`;
  output += `- Showing ${documents.length} results\n`;
  output += `- Page ${currentPage} of ${totalPages}\n`;
  output += `- Search completed in ${executionTimeMs}ms\n\n`;
  
  // Individual results
  if (documents.length > 0) {
    output += `**Results:**\n\n`;
    
    documents.forEach((doc, index) => {
      output += `## ${index + 1}. ${doc.title}\n`;
      
      if (doc.titleKorean && doc.titleKorean !== doc.title) {
        output += `**Korean Title:** ${doc.titleKorean}\n`;
      }
      
      output += `**URL:** ${doc.url}\n`;
      output += `**Category:** ${doc.category}\n`;
      output += `**Agency:** ${doc.metadata.agency}`;
      
      if (doc.metadata.agencyKorean && doc.metadata.agencyKorean !== doc.metadata.agency) {
        output += ` (${doc.metadata.agencyKorean})`;
      }
      output += `\n`;
      
      if (doc.metadata.publicationDate) {
        output += `**Publication Date:** ${doc.metadata.publicationDate.toISOString().split('T')[0]}\n`;
      }
      
      if (doc.metadata.keywords.length > 0) {
        output += `**Keywords:** ${doc.metadata.keywords.join(', ')}\n`;
      }
      
      // Content preview (first 200 characters)
      if (doc.content) {
        const preview = doc.content.length > 200 
          ? doc.content.substring(0, 200) + '...'
          : doc.content;
        output += `**Preview:** ${preview}\n`;
      }
      
      if (doc.images.length > 0) {
        output += `**Images:** ${doc.images.length} image(s) available\n`;
      }
      
      if (doc.attachments.length > 0) {
        output += `**Attachments:** ${doc.attachments.length} file(s) available\n`;
      }
      
      output += `**Last Updated:** ${doc.updatedAt.toISOString().split('T')[0]}\n\n`;
      output += `---\n\n`;
    });
  } else {
    output += `**No results found.**\n\n`;
    output += `**Suggestions:**\n`;
    output += `- Try different search terms\n`;
    output += `- Remove some filters to broaden the search\n`;
    output += `- Check spelling of Korean terms\n`;
    output += `- Use more general keywords\n\n`;
  }
  
  // Query information for reference
  output += `**Search Query Details:**\n`;
  output += `- Query: "${result.searchQuery.query}"\n`;
  if (result.searchQuery.queryKorean) {
    output += `- Korean Query: "${result.searchQuery.queryKorean}"\n`;
  }
  if (result.searchQuery.category) {
    output += `- Category: ${result.searchQuery.category}\n`;
  }
  if (result.searchQuery.agency) {
    output += `- Agency: ${result.searchQuery.agency}\n`;
  }
  if (result.searchQuery.dateFrom || result.searchQuery.dateTo) {
    output += `- Date Range: ${result.searchQuery.dateFrom || 'Beginning'} to ${result.searchQuery.dateTo || 'Present'}\n`;
  }
  output += `- Sort: ${result.searchQuery.sortBy} (${result.searchQuery.sortOrder})\n`;
  
  return output;
}

// ============================================================================
// Exports
// ============================================================================

export { SearchToolSchema };
export type { SearchParams };