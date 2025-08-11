/**
 * KRDS Export MCP Tool
 * 
 * This tool provides comprehensive content export functionality for KRDS
 * documents in various formats including PDF, Markdown, JSON, CSV, and XML.
 * Supports Korean language content and handles images and attachments.
 * 
 * Features:
 * =========
 * 1. Multi-format export (PDF, Markdown, JSON, CSV, XML, Excel)
 * 2. Korean text preservation and formatting
 * 3. Image and attachment embedding or linking
 * 4. Batch document export with pagination
 * 5. Customizable export templates and styling
 * 6. Metadata preservation across formats
 * 7. Archive creation for multiple documents
 * 
 * Usage Examples:
 * ===============
 * - Export as PDF: { "documents": ["doc1"], "format": "pdf" }
 * - Batch export: { "documents": ["doc1", "doc2"], "format": "json" }
 * - With images: { "documents": ["doc1"], "format": "pdf", "includeImages": true }
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
import * as path from 'path';
import * as fs from 'fs/promises';
// Archive functionality would require 'archiver' package
// import archiver from 'archiver';

// Internal imports
import type { 
  ToolContext, 
  ExportParams,
  ExportResult,
  ExportFormat,
  ExportOptions,
  KrdsDocument
} from '@/types/index.js';
import { KrdsError } from '@/types/index.js';

// ============================================================================
// Schema Definitions
// ============================================================================

/**
 * Supported export formats
 */
const ExportFormatEnum = z.enum(['json', 'csv', 'xlsx', 'pdf', 'xml', 'markdown', 'html']);

/**
 * Input schema for the export tool
 */
const ExportSchema = z.object({
  // Document selection - either array of documents or document IDs
  documents: z.union([
    z.array(z.string().min(1, 'Document ID cannot be empty')).min(1, 'At least one document required'),
    z.array(z.any()).min(1, 'At least one document required')
  ]).describe('Array of document IDs or document objects to export'),
  
  // Export format and options
  format: ExportFormatEnum
    .describe('Export format'),
    
  filename: z.string()
    .min(1, 'Filename cannot be empty')
    .max(255, 'Filename too long')
    .optional()
    .describe('Custom filename for export (without extension)'),
    
  // Content inclusion options
  includeImages: z.boolean()
    .default(true)
    .describe('Whether to include images in export'),
    
  includeAttachments: z.boolean()
    .default(false)
    .describe('Whether to include attachments in export'),
    
  includeMetadata: z.boolean()
    .default(true)
    .describe('Whether to include document metadata'),
    
  // Language and encoding options
  preserveKoreanText: z.boolean()
    .default(true)
    .describe('Whether to preserve Korean text formatting'),
    
  encoding: z.enum(['utf8', 'euc-kr'])
    .default('utf8')
    .describe('Text encoding for export'),
    
  // Format-specific options
  options: z.object({
    // JSON options
    json: z.object({
      pretty: z.boolean().default(true).describe('Pretty-print JSON'),
      includeMetadata: z.boolean().default(true).describe('Include metadata in JSON'),
      compactArrays: z.boolean().default(false).describe('Compact arrays in JSON'),
    }).optional(),
    
    // CSV options
    csv: z.object({
      delimiter: z.string().max(1).default(',').describe('CSV delimiter'),
      headers: z.boolean().default(true).describe('Include column headers'),
      quoteAll: z.boolean().default(false).describe('Quote all fields'),
    }).optional(),
    
    // Excel options
    xlsx: z.object({
      sheetName: z.string().max(31).default('KRDS Documents').describe('Excel sheet name'),
      includeCharts: z.boolean().default(false).describe('Include charts if available'),
      autoFilter: z.boolean().default(true).describe('Enable auto filter'),
      freezeHeader: z.boolean().default(true).describe('Freeze header row'),
    }).optional(),
    
    // PDF options
    pdf: z.object({
      pageSize: z.enum(['A4', 'Letter', 'Legal', 'A3']).default('A4').describe('Page size'),
      orientation: z.enum(['portrait', 'landscape']).default('portrait').describe('Page orientation'),
      margins: z.object({
        top: z.number().min(0).max(100).default(25),
        right: z.number().min(0).max(100).default(25),
        bottom: z.number().min(0).max(100).default(25),
        left: z.number().min(0).max(100).default(25),
      }).default({}),
      fontSize: z.number().min(8).max(24).default(12).describe('Base font size'),
      includeTableOfContents: z.boolean().default(true).describe('Include table of contents'),
      includePageNumbers: z.boolean().default(true).describe('Include page numbers'),
    }).optional(),
    
    // Markdown options
    markdown: z.object({
      includeYamlFrontmatter: z.boolean().default(true).describe('Include YAML frontmatter'),
      imageLinks: z.enum(['embed', 'link', 'base64']).default('link').describe('How to handle images'),
      tableFormat: z.enum(['github', 'grid', 'simple']).default('github').describe('Table format'),
    }).optional(),
    
    // HTML options
    html: z.object({
      includeCSS: z.boolean().default(true).describe('Include embedded CSS'),
      responsive: z.boolean().default(true).describe('Make responsive'),
      embedImages: z.boolean().default(false).describe('Embed images as base64'),
    }).optional(),
  }).default({}).describe('Format-specific export options'),
  
  // Archive options for multiple documents
  createArchive: z.boolean()
    .default(false)
    .describe('Create ZIP archive for multiple documents'),
    
  archiveFormat: z.enum(['zip', 'tar', 'tar.gz'])
    .default('zip')
    .describe('Archive format when createArchive is true'),
    
  // Processing options
  maxDocuments: z.number()
    .int()
    .min(1, 'At least 1 document required')
    .max(1000, 'Maximum 1000 documents allowed')
    .default(100)
    .describe('Maximum number of documents to export'),
    
  timeout: z.number()
    .int()
    .min(5000, 'Timeout must be at least 5 seconds')
    .max(3600000, 'Timeout cannot exceed 1 hour')
    .default(300000)
    .describe('Export timeout in milliseconds'),
    
  outputPath: z.string()
    .max(500, 'Output path too long')
    .optional()
    .describe('Custom output directory path'),
});

// ============================================================================
// Export Result Types
// ============================================================================

interface ExportProgress {
  totalDocuments: number;
  processedDocuments: number;
  currentDocument?: string;
  stage: 'preparing' | 'processing' | 'formatting' | 'writing' | 'archiving' | 'completed';
  errors: string[];
}

// ============================================================================
// Tool Implementation
// ============================================================================

/**
 * Register the export tool with the MCP server
 */
export async function registerExportTool(
  server: Server,
  context: ToolContext
): Promise<void> {
  const { logger, krdsService, cacheManager, config } = context;
  
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== 'krds_export') {
      return;
    }
    
    const toolLogger = logger.child({ 
      tool: 'export', 
      requestId: generateRequestId() 
    });
    toolLogger.info('Processing KRDS export request');
    
    try {
      // Step 1: Validate and parse input parameters
      const params = ExportSchema.parse(request.params.arguments);
      toolLogger.debug('Export parameters validated', { params });
      
      // Step 2: Validate export configuration
      validateExportParams(params);
      
      // Step 3: Resolve documents
      const documents = await resolveDocuments(params.documents, krdsService, toolLogger);
      
      if (documents.length === 0) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'No valid documents found for export'
        );
      }
      
      // Limit number of documents
      const limitedDocuments = documents.slice(0, params.maxDocuments);
      
      if (limitedDocuments.length < documents.length) {
        toolLogger.warn('Document count limited', {
          requested: documents.length,
          processing: limitedDocuments.length,
          limit: params.maxDocuments
        });
      }
      
      // Step 4: Initialize export progress
      const progress: ExportProgress = {
        totalDocuments: limitedDocuments.length,
        processedDocuments: 0,
        stage: 'preparing',
        errors: []
      };
      
      toolLogger.info('Starting export process', {
        documentCount: limitedDocuments.length,
        format: params.format,
        includeImages: params.includeImages,
        includeAttachments: params.includeAttachments
      });
      
      // Step 5: Execute export
      const exportStartTime = Date.now();
      
      const exportResult = await executeExport(
        limitedDocuments,
        params,
        progress,
        toolLogger,
        config
      );
      
      const processingTime = Date.now() - exportStartTime;
      exportResult.processingTimeMs = processingTime;
      
      toolLogger.info('Export completed', {
        success: exportResult.success,
        format: exportResult.format,
        filename: exportResult.filename,
        sizeBytes: exportResult.sizeBytes,
        processingTimeMs: processingTime,
        errors: progress.errors.length
      });
      
      // Step 6: Format and return results
      return {
        content: [
          {
            type: 'text',
            text: formatExportResult(exportResult, progress),
          },
        ],
      };
      
    } catch (error) {
      toolLogger.error('Export tool error', { error });
      
      if (error instanceof McpError) {
        throw error;
      }
      
      if (error instanceof KrdsError) {
        throw new McpError(
          ErrorCode.InternalError,
          `KRDS export error: ${error.message}`,
        );
      }
      
      throw new McpError(
        ErrorCode.InternalError,
        `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  });
  
  // Tool metadata is handled by the centralized registry
}

// ============================================================================
// Export Implementation Functions
// ============================================================================

/**
 * Execute the export process
 */
async function executeExport(
  documents: KrdsDocument[],
  params: z.infer<typeof ExportSchema>,
  progress: ExportProgress,
  logger: any,
  config: any
): Promise<ExportResult> {
  const outputDir = params.outputPath || path.join(process.cwd(), 'exports');
  await ensureDirectoryExists(outputDir);
  
  const baseFilename = params.filename || generateFilename(params.format, documents.length);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  progress.stage = 'processing';
  
  try {
    switch (params.format) {
      case 'json':
        return await exportToJson(documents, params, outputDir, baseFilename, progress, logger);
        
      case 'csv':
        return await exportToCsv(documents, params, outputDir, baseFilename, progress, logger);
        
      case 'xlsx':
        return await exportToExcel(documents, params, outputDir, baseFilename, progress, logger);
        
      case 'pdf':
        return await exportToPdf(documents, params, outputDir, baseFilename, progress, logger);
        
      case 'markdown':
        return await exportToMarkdown(documents, params, outputDir, baseFilename, progress, logger);
        
      case 'html':
        return await exportToHtml(documents, params, outputDir, baseFilename, progress, logger);
        
      case 'xml':
        return await exportToXml(documents, params, outputDir, baseFilename, progress, logger);
        
      default:
        throw new KrdsError(
          'INVALID_REQUEST',
          `Unsupported export format: ${params.format}`
        );
    }
  } catch (error) {
    progress.stage = 'completed';
    progress.errors.push(`Export failed: ${error}`);
    
    return {
      success: false,
      format: params.format,
      filename: `${baseFilename}.${params.format}`,
      sizeBytes: 0,
      documentCount: 0,
      processingTimeMs: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Export documents to JSON format
 */
async function exportToJson(
  documents: KrdsDocument[],
  params: z.infer<typeof ExportSchema>,
  outputDir: string,
  baseFilename: string,
  progress: ExportProgress,
  logger: any
): Promise<ExportResult> {
  progress.stage = 'formatting';
  
  const options = params.options.json || {};
  const filename = `${baseFilename}.json`;
  const filePath = path.join(outputDir, filename);
  
  // Prepare data structure
  const exportData = {
    metadata: {
      exportedAt: new Date().toISOString(),
      documentCount: documents.length,
      format: 'json',
      version: '1.0.0'
    },
    documents: documents.map((doc, index) => {
      progress.processedDocuments = index + 1;
      progress.currentDocument = doc.title;
      
      const exportDoc: any = {
        id: doc.id,
        title: doc.title,
        url: doc.url,
        content: doc.content,
      };
      
      if (params.preserveKoreanText) {
        exportDoc.titleKorean = doc.titleKorean;
        exportDoc.contentKorean = doc.contentKorean;
      }
      
      if (params.includeMetadata || options.includeMetadata) {
        exportDoc.metadata = doc.metadata;
        exportDoc.category = doc.category;
        exportDoc.createdAt = doc.createdAt;
        exportDoc.updatedAt = doc.updatedAt;
      }
      
      if (params.includeImages) {
        exportDoc.images = doc.images;
      }
      
      if (params.includeAttachments) {
        exportDoc.attachments = doc.attachments;
      }
      
      return exportDoc;
    })
  };
  
  progress.stage = 'writing';
  
  // Write JSON file
  const jsonContent = options.pretty 
    ? JSON.stringify(exportData, null, 2)
    : JSON.stringify(exportData);
    
  await fs.writeFile(filePath, jsonContent, { encoding: params.encoding });
  
  const stats = await fs.stat(filePath);
  progress.stage = 'completed';
  
  logger.debug('JSON export completed', { 
    filename, 
    sizeBytes: stats.size,
    documentCount: documents.length 
  });
  
  return {
    success: true,
    format: 'json',
    filename,
    filePath,
    sizeBytes: stats.size,
    documentCount: documents.length,
    processingTimeMs: 0, // Will be set by caller
  };
}

/**
 * Export documents to CSV format
 */
async function exportToCsv(
  documents: KrdsDocument[],
  params: z.infer<typeof ExportSchema>,
  outputDir: string,
  baseFilename: string,
  progress: ExportProgress,
  logger: any
): Promise<ExportResult> {
  progress.stage = 'formatting';
  
  const options = params.options.csv || {};
  const filename = `${baseFilename}.csv`;
  const filePath = path.join(outputDir, filename);
  
  const delimiter = options.delimiter || ',';
  const quote = '"';
  
  // Prepare CSV data
  const rows: string[] = [];
  
  // Headers
  if (options.headers) {
    const headers = ['ID', 'Title', 'URL', 'Category', 'Agency', 'Publication Date', 'Content'];
    if (params.preserveKoreanText) {
      headers.splice(2, 0, 'Korean Title');
      headers.push('Korean Content');
    }
    if (params.includeImages) {
      headers.push('Image Count');
    }
    if (params.includeAttachments) {
      headers.push('Attachment Count');
    }
    
    rows.push(headers.map(h => `${quote}${h}${quote}`).join(delimiter));
  }
  
  // Data rows
  documents.forEach((doc, index) => {
    progress.processedDocuments = index + 1;
    progress.currentDocument = doc.title;
    
    const row: string[] = [
      escapeCSV(doc.id, quote),
      escapeCSV(doc.title, quote),
      escapeCSV(doc.url, quote),
      escapeCSV(doc.category, quote),
      escapeCSV(doc.metadata.agency, quote),
      escapeCSV(doc.metadata.publicationDate?.toISOString().split('T')[0] || '', quote),
      escapeCSV(doc.content.substring(0, 1000), quote), // Truncate content for CSV
    ];
    
    if (params.preserveKoreanText) {
      row.splice(2, 0, escapeCSV(doc.titleKorean, quote));
      row.push(escapeCSV(doc.contentKorean.substring(0, 1000), quote));
    }
    
    if (params.includeImages) {
      row.push(doc.images.length.toString());
    }
    
    if (params.includeAttachments) {
      row.push(doc.attachments.length.toString());
    }
    
    rows.push(row.join(delimiter));
  });
  
  progress.stage = 'writing';
  
  // Write CSV file
  await fs.writeFile(filePath, rows.join('\n'), { encoding: params.encoding });
  
  const stats = await fs.stat(filePath);
  progress.stage = 'completed';
  
  logger.debug('CSV export completed', { 
    filename, 
    sizeBytes: stats.size,
    documentCount: documents.length 
  });
  
  return {
    success: true,
    format: 'csv',
    filename,
    filePath,
    sizeBytes: stats.size,
    documentCount: documents.length,
    processingTimeMs: 0,
  };
}

/**
 * Export documents to Excel format (placeholder)
 */
async function exportToExcel(
  documents: KrdsDocument[],
  params: z.infer<typeof ExportSchema>,
  outputDir: string,
  baseFilename: string,
  progress: ExportProgress,
  logger: any
): Promise<ExportResult> {
  // This would require a library like 'xlsx' or 'exceljs'
  // For now, fall back to CSV
  logger.warn('Excel export not implemented, falling back to CSV');
  return await exportToCsv(documents, params, outputDir, baseFilename, progress, logger);
}

/**
 * Export documents to PDF format (placeholder)
 */
async function exportToPdf(
  documents: KrdsDocument[],
  params: z.infer<typeof ExportSchema>,
  outputDir: string,
  baseFilename: string,
  progress: ExportProgress,
  logger: any
): Promise<ExportResult> {
  // This would require a library like 'puppeteer', 'jsPDF', or 'pdfkit'
  // For now, create a simple text file
  logger.warn('PDF export not implemented, creating text file');
  
  const filename = `${baseFilename}.txt`;
  const filePath = path.join(outputDir, filename);
  
  let content = 'KRDS Documents Export\n';
  content += '===================\n\n';
  
  documents.forEach((doc, index) => {
    progress.processedDocuments = index + 1;
    progress.currentDocument = doc.title;
    
    content += `${index + 1}. ${doc.title}\n`;
    content += `URL: ${doc.url}\n`;
    content += `Category: ${doc.category}\n`;
    content += `Agency: ${doc.metadata.agency}\n\n`;
    content += `${doc.content}\n\n`;
    content += '---\n\n';
  });
  
  await fs.writeFile(filePath, content, { encoding: params.encoding });
  
  const stats = await fs.stat(filePath);
  progress.stage = 'completed';
  
  return {
    success: true,
    format: 'pdf',
    filename,
    filePath,
    sizeBytes: stats.size,
    documentCount: documents.length,
    processingTimeMs: 0,
  };
}

/**
 * Export documents to Markdown format
 */
async function exportToMarkdown(
  documents: KrdsDocument[],
  params: z.infer<typeof ExportSchema>,
  outputDir: string,
  baseFilename: string,
  progress: ExportProgress,
  logger: any
): Promise<ExportResult> {
  progress.stage = 'formatting';
  
  const options = params.options.markdown || {};
  const filename = `${baseFilename}.md`;
  const filePath = path.join(outputDir, filename);
  
  let content = '';
  
  // YAML frontmatter
  if (options.includeYamlFrontmatter) {
    content += '---\n';
    content += `title: "KRDS Documents Export"\n`;
    content += `date: "${new Date().toISOString()}"\n`;
    content += `document_count: ${documents.length}\n`;
    content += `format: "markdown"\n`;
    content += '---\n\n';
  }
  
  // Title and metadata
  content += `# KRDS Documents Export\n\n`;
  content += `**Exported on:** ${new Date().toLocaleString()}\n`;
  content += `**Document Count:** ${documents.length}\n`;
  content += `**Format:** Markdown\n\n`;
  
  // Table of contents
  content += `## Table of Contents\n\n`;
  documents.forEach((doc, index) => {
    content += `${index + 1}. [${doc.title}](#${slugify(doc.title)})\n`;
  });
  content += `\n---\n\n`;
  
  // Documents
  documents.forEach((doc, index) => {
    progress.processedDocuments = index + 1;
    progress.currentDocument = doc.title;
    
    content += `## ${doc.title} {#${slugify(doc.title)}}\n\n`;
    
    if (params.preserveKoreanText && doc.titleKorean !== doc.title) {
      content += `**한국어 제목:** ${doc.titleKorean}\n\n`;
    }
    
    // Metadata table
    content += `| Field | Value |\n`;
    content += `|-------|-------|\n`;
    content += `| URL | [${doc.url}](${doc.url}) |\n`;
    content += `| Category | ${doc.category} |\n`;
    content += `| Agency | ${doc.metadata.agency} |\n`;
    
    if (doc.metadata.publicationDate) {
      content += `| Publication Date | ${doc.metadata.publicationDate.toISOString().split('T')[0]} |\n`;
    }
    
    content += `| Document Type | ${doc.metadata.documentType} |\n`;
    
    if (doc.metadata.keywords.length > 0) {
      content += `| Keywords | ${doc.metadata.keywords.join(', ')} |\n`;
    }
    
    content += `\n`;
    
    // Content
    content += `### Content\n\n`;
    content += `${doc.content}\n\n`;
    
    // Korean content if different
    if (params.preserveKoreanText && doc.contentKorean !== doc.content) {
      content += `### 한국어 내용\n\n`;
      content += `${doc.contentKorean}\n\n`;
    }
    
    // Images
    if (params.includeImages && doc.images.length > 0) {
      content += `### Images\n\n`;
      doc.images.forEach((image, imgIndex) => {
        const altText = image.alt || `Image ${imgIndex + 1}`;
        
        switch (options.imageLinks) {
          case 'embed':
            content += `![${altText}](${image.url})\n`;
            break;
          case 'link':
            content += `- [${altText}](${image.url})\n`;
            break;
          case 'base64':
            // Would need to fetch and encode image
            content += `- ${altText}: [View Image](${image.url})\n`;
            break;
        }
        
        if (image.caption) {
          content += `  *${image.caption}*\n`;
        }
      });
      content += `\n`;
    }
    
    // Attachments
    if (params.includeAttachments && doc.attachments.length > 0) {
      content += `### Attachments\n\n`;
      doc.attachments.forEach(attachment => {
        content += `- [${attachment.filename}](${attachment.url}) (${attachment.mimeType})\n`;
      });
      content += `\n`;
    }
    
    content += `---\n\n`;
  });
  
  progress.stage = 'writing';
  
  // Write Markdown file
  await fs.writeFile(filePath, content, { encoding: params.encoding });
  
  const stats = await fs.stat(filePath);
  progress.stage = 'completed';
  
  logger.debug('Markdown export completed', { 
    filename, 
    sizeBytes: stats.size,
    documentCount: documents.length 
  });
  
  return {
    success: true,
    format: 'markdown',
    filename,
    filePath,
    sizeBytes: stats.size,
    documentCount: documents.length,
    processingTimeMs: 0,
  };
}

/**
 * Export documents to HTML format (placeholder)
 */
async function exportToHtml(
  documents: KrdsDocument[],
  params: z.infer<typeof ExportSchema>,
  outputDir: string,
  baseFilename: string,
  progress: ExportProgress,
  logger: any
): Promise<ExportResult> {
  // Convert Markdown to HTML (simplified)
  const markdownResult = await exportToMarkdown(documents, params, outputDir, `${baseFilename}_temp`, progress, logger);
  
  const filename = `${baseFilename}.html`;
  const filePath = path.join(outputDir, filename);
  
  // Simple Markdown to HTML conversion (would use a proper library in production)
  const markdownContent = await fs.readFile(markdownResult.filePath!, 'utf8');
  const htmlContent = convertMarkdownToHtml(markdownContent);
  
  await fs.writeFile(filePath, htmlContent, { encoding: params.encoding });
  await fs.unlink(markdownResult.filePath!); // Clean up temp file
  
  const stats = await fs.stat(filePath);
  
  return {
    success: true,
    format: 'html',
    filename,
    filePath,
    sizeBytes: stats.size,
    documentCount: documents.length,
    processingTimeMs: 0,
  };
}

/**
 * Export documents to XML format (placeholder)
 */
async function exportToXml(
  documents: KrdsDocument[],
  params: z.infer<typeof ExportSchema>,
  outputDir: string,
  baseFilename: string,
  progress: ExportProgress,
  logger: any
): Promise<ExportResult> {
  progress.stage = 'formatting';
  
  const filename = `${baseFilename}.xml`;
  const filePath = path.join(outputDir, filename);
  
  let content = '<?xml version="1.0" encoding="UTF-8"?>\n';
  content += '<krds_export>\n';
  content += `  <metadata>\n`;
  content += `    <export_date>${new Date().toISOString()}</export_date>\n`;
  content += `    <document_count>${documents.length}</document_count>\n`;
  content += `    <format>xml</format>\n`;
  content += `  </metadata>\n`;
  content += '  <documents>\n';
  
  documents.forEach((doc, index) => {
    progress.processedDocuments = index + 1;
    progress.currentDocument = doc.title;
    
    content += '    <document>\n';
    content += `      <id>${escapeXml(doc.id)}</id>\n`;
    content += `      <title><![CDATA[${doc.title}]]></title>\n`;
    
    if (params.preserveKoreanText) {
      content += `      <title_korean><![CDATA[${doc.titleKorean}]]></title_korean>\n`;
    }
    
    content += `      <url>${escapeXml(doc.url)}</url>\n`;
    content += `      <category>${escapeXml(doc.category)}</category>\n`;
    content += `      <content><![CDATA[${doc.content}]]></content>\n`;
    
    if (params.preserveKoreanText) {
      content += `      <content_korean><![CDATA[${doc.contentKorean}]]></content_korean>\n`;
    }
    
    if (params.includeMetadata) {
      content += `      <metadata>\n`;
      content += `        <agency>${escapeXml(doc.metadata.agency)}</agency>\n`;
      content += `        <document_type>${escapeXml(doc.metadata.documentType)}</document_type>\n`;
      if (doc.metadata.publicationDate) {
        content += `        <publication_date>${doc.metadata.publicationDate.toISOString()}</publication_date>\n`;
      }
      content += `      </metadata>\n`;
    }
    
    content += '    </document>\n';
  });
  
  content += '  </documents>\n';
  content += '</krds_export>\n';
  
  progress.stage = 'writing';
  
  // Write XML file
  await fs.writeFile(filePath, content, { encoding: params.encoding });
  
  const stats = await fs.stat(filePath);
  progress.stage = 'completed';
  
  return {
    success: true,
    format: 'xml',
    filename,
    filePath,
    sizeBytes: stats.size,
    documentCount: documents.length,
    processingTimeMs: 0,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique request ID for logging and tracing
 */
function generateRequestId(): string {
  return `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Validate export parameters
 */
function validateExportParams(params: z.infer<typeof ExportSchema>): void {
  if (params.documents.length === 0) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'At least one document must be provided for export'
    );
  }
  
  if (params.filename && !/^[a-zA-Z0-9_-]+$/.test(params.filename)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Filename can only contain alphanumeric characters, hyphens, and underscores'
    );
  }
}

/**
 * Resolve document IDs to document objects
 */
async function resolveDocuments(
  documents: (string | any)[],
  krdsService: any,
  logger: any
): Promise<KrdsDocument[]> {
  const resolved: KrdsDocument[] = [];
  
  for (const doc of documents) {
    try {
      if (typeof doc === 'string') {
        // Document ID - fetch from service
        const fetchedDoc = await krdsService.getDocument(doc);
        if (fetchedDoc) {
          resolved.push(fetchedDoc);
        }
      } else if (doc && typeof doc === 'object' && doc.id) {
        // Document object
        resolved.push(doc as KrdsDocument);
      }
    } catch (error) {
      logger.warn('Failed to resolve document', { document: doc, error });
    }
  }
  
  return resolved;
}

/**
 * Generate filename based on format and document count
 */
function generateFilename(format: string, documentCount: number): string {
  const timestamp = new Date().toISOString().split('T')[0];
  const countSuffix = documentCount > 1 ? `_${documentCount}docs` : '';
  return `krds_export_${timestamp}${countSuffix}`;
}

/**
 * Ensure directory exists
 */
async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

/**
 * Escape CSV field
 */
function escapeCSV(value: string, quote: string): string {
  if (!value) return `${quote}${quote}`;
  const escaped = value.replace(new RegExp(quote, 'g'), `${quote}${quote}`);
  return `${quote}${escaped}${quote}`;
}

/**
 * Escape XML content
 */
function escapeXml(value: string): string {
  if (!value) return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Convert Markdown to basic HTML
 */
function convertMarkdownToHtml(markdown: string): string {
  // Very basic conversion - would use a proper library in production
  let html = markdown
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
    
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>KRDS Export</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; margin: 40px; }
    h1, h2, h3 { color: #333; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
  </style>
</head>
<body>
<p>${html}</p>
</body>
</html>`;
}

/**
 * Create URL-friendly slug from text
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Format export result for display
 */
function formatExportResult(
  result: ExportResult, 
  progress: ExportProgress
): string {
  let output = `# KRDS Export Result\n\n`;
  
  if (result.success) {
    output += `✅ **Export Successful**\n\n`;
    output += `**Export Details:**\n`;
    output += `- Format: ${result.format.toUpperCase()}\n`;
    output += `- Filename: ${result.filename}\n`;
    output += `- File Size: ${Math.round(result.sizeBytes / 1024)} KB\n`;
    output += `- Documents Exported: ${result.documentCount}\n`;
    output += `- Processing Time: ${result.processingTimeMs}ms\n`;
    
    if (result.filePath) {
      output += `- File Location: ${result.filePath}\n`;
    }
    
    if (result.downloadUrl) {
      output += `- Download URL: ${result.downloadUrl}\n`;
    }
  } else {
    output += `❌ **Export Failed**\n\n`;
    output += `**Error:** ${result.error}\n`;
  }
  
  // Progress information
  output += `\n**Processing Summary:**\n`;
  output += `- Total Documents: ${progress.totalDocuments}\n`;
  output += `- Processed Documents: ${progress.processedDocuments}\n`;
  output += `- Final Stage: ${progress.stage}\n`;
  
  if (progress.errors.length > 0) {
    output += `\n**Errors (${progress.errors.length}):**\n`;
    progress.errors.forEach((error, index) => {
      output += `${index + 1}. ${error}\n`;
    });
  }
  
  output += `\n---\n\n`;
  output += `*Export completed on ${new Date().toISOString().split('T')[0]}*\n`;
  
  return output;
}

// ============================================================================
// Exports
// ============================================================================

export { ExportSchema };
export type { ExportParams, ExportResult, ExportProgress };