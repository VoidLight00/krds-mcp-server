/**
 * KRDS Content Retrieval MCP Tool
 * 
 * This tool provides comprehensive content retrieval functionality for specific
 * pages or sections from the KRDS website. It supports fetching complete document
 * content, images, and attachments with Korean language processing.
 * 
 * Features:
 * =========
 * 1. Full document content retrieval by URL or document ID
 * 2. Image extraction with metadata and download options
 * 3. Attachment retrieval with file information
 * 4. Korean text processing and normalization
 * 5. Content section parsing and structuring
 * 6. Caching for performance optimization
 * 7. Error handling and retry mechanisms
 * 
 * Usage Examples:
 * ===============
 * - Get document by URL: { "url": "https://krds.go.kr/document/123" }
 * - Get with images: { "documentId": "doc123", "includeImages": true }
 * - Full retrieval: { "url": "...", "includeImages": true, "includeAttachments": true }
 * 
 * @author KRDS MCP Server
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
import type { 
  ToolContext, 
  ContentRetrievalParams, 
  KrdsDocument,
  ScrapeResult 
} from '@/types/index.js';
import { KrdsScraper } from '@/scraping/index.js';
import { ContentParser, ImageExtractor } from '@/parsing/index.js';
import { KrdsError } from '@/types/index.js';

// ============================================================================
// Schema Definitions
// ============================================================================

/**
 * Input schema for the content retrieval tool
 * Validates URL or document ID along with retrieval options
 */
const ContentRetrievalSchema = z.object({
  // Content identification - either URL or document ID required
  url: z.string()
    .url('Invalid URL format')
    .optional()
    .describe('KRDS document URL to retrieve content from'),
    
  documentId: z.string()
    .min(1, 'Document ID cannot be empty')
    .max(100, 'Document ID too long')
    .optional()
    .describe('KRDS document identifier'),
    
  // Content options
  includeImages: z.boolean()
    .default(true)
    .describe('Whether to extract and include image information'),
    
  includeAttachments: z.boolean()
    .default(true)
    .describe('Whether to extract and include attachment information'),
    
  processKoreanText: z.boolean()
    .default(true)
    .describe('Whether to apply Korean text processing and normalization'),
    
  // Content processing options
  maxContentLength: z.number()
    .int()
    .min(0, 'Content length must be non-negative')
    .max(1000000, 'Content length limit exceeded')
    .default(0)
    .describe('Maximum content length (0 = no limit)'),
    
  extractTables: z.boolean()
    .default(true)
    .describe('Whether to extract and structure table data'),
    
  extractMetadata: z.boolean()
    .default(true)
    .describe('Whether to extract document metadata'),
    
  // Image processing options
  downloadImages: z.boolean()
    .default(false)
    .describe('Whether to download images locally (requires storage)'),
    
  imageMaxWidth: z.number()
    .int()
    .min(0)
    .max(4000)
    .optional()
    .describe('Maximum image width for processing'),
    
  imageMaxHeight: z.number()
    .int()
    .min(0)
    .max(4000)
    .optional()
    .describe('Maximum image height for processing'),
    
  // Performance options
  useCache: z.boolean()
    .default(true)
    .describe('Whether to use cached content for performance'),
    
  timeout: z.number()
    .int()
    .min(1000, 'Timeout must be at least 1 second')
    .max(300000, 'Timeout cannot exceed 5 minutes')
    .default(30000)
    .describe('Request timeout in milliseconds'),
}).refine(
  (data) => data.url || data.documentId,
  {
    message: "Either 'url' or 'documentId' must be provided",
    path: ["url", "documentId"],
  }
);

// ============================================================================
// Tool Implementation
// ============================================================================

/**
 * Register the content retrieval tool with the MCP server
 * 
 * @param server - MCP server instance
 * @param context - Tool execution context with services and configuration
 */
export async function registerContentRetrievalTool(
  server: Server,
  context: ToolContext
): Promise<void> {
  const { logger, krdsService, cacheManager, config } = context;
  
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== 'krds_content_retrieval') {
      return;
    }
    
    const toolLogger = logger.child({ 
      tool: 'content_retrieval', 
      requestId: generateRequestId() 
    });
    toolLogger.info('Processing KRDS content retrieval request');
    
    try {
      // Step 1: Validate and parse input parameters
      const params = ContentRetrievalSchema.parse(request.params.arguments);
      toolLogger.debug('Content retrieval parameters validated', { params });
      
      // Step 2: Resolve URL if document ID is provided
      const targetUrl = params.url || await resolveDocumentUrl(params.documentId!, krdsService);
      if (!targetUrl) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Unable to resolve URL for document ID: ${params.documentId}`
        );
      }
      
      toolLogger.debug('Target URL resolved', { url: targetUrl });
      
      // Step 3: Check cache for existing content
      const cacheKey = generateContentCacheKey(targetUrl, params);
      let document: KrdsDocument | null = null;
      
      if (params.useCache && cacheManager) {
        document = await cacheManager.get<KrdsDocument>(cacheKey);
        if (document) {
          toolLogger.info('Returning cached document content', {
            cacheKey,
            documentId: document.id,
            contentLength: document.content.length
          });
          
          return {
            content: [
              {
                type: 'text',
                text: formatDocumentContent(document, true),
              },
            ],
          };
        }
      }
      
      // Step 4: Initialize scraper and parsers
      const scraper = new KrdsScraper(config.scraping, toolLogger);
      const contentParser = new ContentParser(toolLogger);
      const imageExtractor = new ImageExtractor(toolLogger);
      
      // Step 5: Scrape the document
      const scrapeStartTime = Date.now();
      
      const scrapeResult: ScrapeResult = await scraper.scrapeDocument(targetUrl, {
        extractImages: params.includeImages,
        extractAttachments: params.includeAttachments,
        extractTables: params.extractTables,
        processKoreanText: params.processKoreanText,
        timeout: params.timeout,
      });
      
      if (!scrapeResult.success || !scrapeResult.document) {
        throw new KrdsError(
          'SCRAPING_ERROR',
          `Failed to retrieve document content: ${scrapeResult.error}`,
          undefined,
          { url: targetUrl, retryCount: scrapeResult.retryCount }
        );
      }
      
      document = scrapeResult.document;
      const executionTime = Date.now() - scrapeStartTime;
      
      toolLogger.info('Document content retrieved', {
        documentId: document.id,
        contentLength: document.content.length,
        imageCount: document.images.length,
        attachmentCount: document.attachments.length,
        executionTimeMs: executionTime,
      });
      
      // Step 6: Process additional content if requested
      if (params.maxContentLength > 0 && document.content.length > params.maxContentLength) {
        document.content = document.content.substring(0, params.maxContentLength) + '...';
        toolLogger.debug('Content truncated', { 
          maxLength: params.maxContentLength,
          actualLength: document.content.length
        });
      }
      
      // Step 7: Process images if needed
      if (params.includeImages && params.downloadImages) {
        try {
          for (const image of document.images) {
            const processedImage = await imageExtractor.processImage(image.url, {
              maxWidth: params.imageMaxWidth,
              maxHeight: params.imageMaxHeight,
              downloadLocally: true,
            });
            
            if (processedImage) {
              image.localPath = processedImage.localPath;
              image.width = processedImage.width;
              image.height = processedImage.height;
            }
          }
          
          toolLogger.debug('Images processed', { 
            imageCount: document.images.length,
            downloadedCount: document.images.filter(img => img.localPath).length
          });
        } catch (error) {
          toolLogger.warn('Image processing failed', { error });
          // Continue without failing the entire operation
        }
      }
      
      // Step 8: Cache the retrieved document
      if (params.useCache && cacheManager) {
        await cacheManager.set(cacheKey, document, config.cache.ttl);
        toolLogger.debug('Document content cached', { cacheKey });
      }
      
      // Step 9: Format and return results
      return {
        content: [
          {
            type: 'text',
            text: formatDocumentContent(document, false),
          },
        ],
      };
      
    } catch (error) {
      toolLogger.error('Content retrieval tool error', { error });
      
      if (error instanceof McpError) {
        throw error;
      }
      
      if (error instanceof KrdsError) {
        throw new McpError(
          ErrorCode.InternalError,
          `KRDS error: ${error.message}`,
        );
      }
      
      throw new McpError(
        ErrorCode.InternalError,
        `Content retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  });
  
  // Tool metadata is handled by the centralized registry
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique request ID for logging and tracing
 */
function generateRequestId(): string {
  return `content_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a cache key for content retrieval parameters
 */
function generateContentCacheKey(url: string, params: ContentRetrievalParams): string {
  const keyComponents = [
    'krds_content',
    url,
    params.includeImages ? '1' : '0',
    params.includeAttachments ? '1' : '0',
    params.processKoreanText ? '1' : '0',
    params.maxContentLength || '0',
    params.extractTables ? '1' : '0',
  ];
  
  return keyComponents.join('|');
}

/**
 * Resolve document ID to URL using the KRDS service
 */
async function resolveDocumentUrl(documentId: string, krdsService: any): Promise<string | null> {
  try {
    // Implementation depends on the KRDS service interface
    // This is a placeholder that should be implemented based on actual service
    return await krdsService.getDocumentUrl(documentId);
  } catch (error) {
    return null;
  }
}

/**
 * Format document content for display
 */
function formatDocumentContent(document: KrdsDocument, fromCache: boolean): string {
  let output = `# KRDS Document Content ${fromCache ? '(Cached)' : ''}\n\n`;
  
  // Document header information
  output += `**Document Information:**\n`;
  output += `- **ID:** ${document.id}\n`;
  output += `- **Title:** ${document.title}\n`;
  
  if (document.titleKorean && document.titleKorean !== document.title) {
    output += `- **Korean Title:** ${document.titleKorean}\n`;
  }
  
  output += `- **URL:** ${document.url}\n`;
  output += `- **Category:** ${document.category}\n`;
  
  if (document.subcategory) {
    output += `- **Subcategory:** ${document.subcategory}\n`;
  }
  
  output += `- **Agency:** ${document.metadata.agency}`;
  if (document.metadata.agencyKorean && document.metadata.agencyKorean !== document.metadata.agency) {
    output += ` (${document.metadata.agencyKorean})`;
  }
  output += `\n`;
  
  if (document.metadata.publicationDate) {
    output += `- **Publication Date:** ${document.metadata.publicationDate.toISOString().split('T')[0]}\n`;
  }
  
  output += `- **Document Type:** ${document.metadata.documentType}\n`;
  output += `- **Language:** ${document.metadata.language}\n`;
  output += `- **Status:** ${document.metadata.status}\n`;
  
  if (document.metadata.keywords.length > 0) {
    output += `- **Keywords:** ${document.metadata.keywords.join(', ')}\n`;
  }
  
  if (document.metadata.keywordsKorean.length > 0) {
    output += `- **Korean Keywords:** ${document.metadata.keywordsKorean.join(', ')}\n`;
  }
  
  output += `- **Content Length:** ${document.content.length} characters\n`;
  output += `- **Images:** ${document.images.length}\n`;
  output += `- **Attachments:** ${document.attachments.length}\n`;
  output += `- **Last Updated:** ${document.updatedAt.toISOString().split('T')[0]}\n\n`;
  
  // Main content
  output += `## Document Content\n\n`;
  output += `${document.content}\n\n`;
  
  // Korean content if different
  if (document.contentKorean && document.contentKorean !== document.content) {
    output += `## Korean Content\n\n`;
    output += `${document.contentKorean}\n\n`;
  }
  
  // Images section
  if (document.images.length > 0) {
    output += `## Images (${document.images.length})\n\n`;
    
    document.images.forEach((image, index) => {
      output += `### ${index + 1}. ${image.alt || 'Untitled Image'}\n`;
      output += `- **URL:** ${image.url}\n`;
      
      if (image.altKorean && image.altKorean !== image.alt) {
        output += `- **Korean Alt:** ${image.altKorean}\n`;
      }
      
      if (image.caption) {
        output += `- **Caption:** ${image.caption}\n`;
      }
      
      if (image.captionKorean && image.captionKorean !== image.caption) {
        output += `- **Korean Caption:** ${image.captionKorean}\n`;
      }
      
      if (image.width && image.height) {
        output += `- **Dimensions:** ${image.width} × ${image.height} pixels\n`;
      }
      
      output += `- **Format:** ${image.format}\n`;
      output += `- **Size:** ${Math.round(image.sizeBytes / 1024)} KB\n`;
      
      if (image.localPath) {
        output += `- **Local Path:** ${image.localPath}\n`;
      }
      
      if (image.downloadUrl) {
        output += `- **Download URL:** ${image.downloadUrl}\n`;
      }
      
      output += `\n`;
    });
  }
  
  // Attachments section
  if (document.attachments.length > 0) {
    output += `## Attachments (${document.attachments.length})\n\n`;
    
    document.attachments.forEach((attachment, index) => {
      output += `### ${index + 1}. ${attachment.filename}\n`;
      output += `- **URL:** ${attachment.url}\n`;
      output += `- **Type:** ${attachment.mimeType}\n`;
      output += `- **Size:** ${Math.round(attachment.sizeBytes / 1024)} KB\n`;
      
      if (attachment.description) {
        output += `- **Description:** ${attachment.description}\n`;
      }
      
      if (attachment.descriptionKorean && attachment.descriptionKorean !== attachment.description) {
        output += `- **Korean Description:** ${attachment.descriptionKorean}\n`;
      }
      
      output += `\n`;
    });
  }
  
  output += `---\n\n`;
  output += `*Retrieved from KRDS on ${new Date().toISOString().split('T')[0]}*\n`;
  
  return output;
}

// ============================================================================
// Exports
// ============================================================================

export { ContentRetrievalSchema };
export type { ContentRetrievalParams };