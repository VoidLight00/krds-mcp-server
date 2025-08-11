/**
 * KRDS Image Tools MCP Tool
 * 
 * This tool provides comprehensive image retrieval and processing functionality
 * for KRDS documents. It supports extracting images with metadata, processing
 * Korean text in images, and downloading images with various format options.
 * 
 * Features:
 * =========
 * 1. Image extraction from documents with complete metadata
 * 2. Korean text extraction from images (OCR)
 * 3. Image format conversion and optimization
 * 4. Image download and local storage
 * 5. Bulk image processing for documents
 * 6. Image dimension and quality analysis
 * 7. Alt text and caption processing in Korean
 * 
 * Usage Examples:
 * ===============
 * - Get document images: { "documentId": "doc123" }
 * - Download images: { "url": "...", "downloadImages": true }
 * - Process with OCR: { "documentId": "doc123", "processImages": true }
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

// Internal imports
import type { 
  ToolContext, 
  ImageToolParams,
  KrdsDocument,
  KrdsImage 
} from '@/types/index.js';
import { ImageExtractor } from '@/parsing/index.js';
import { KoreanTextProcessor } from '@/parsing/index.js';
import { KrdsError } from '@/types/index.js';

// ============================================================================
// Schema Definitions
// ============================================================================

/**
 * Supported image formats for conversion
 */
const ImageFormat = z.enum(['original', 'webp', 'jpeg', 'png', 'avif']);

/**
 * Input schema for the image tools
 */
const ImageToolsSchema = z.object({
  // Content identification - either URL, document ID, or image URL
  documentId: z.string()
    .min(1, 'Document ID cannot be empty')
    .max(100, 'Document ID too long')
    .optional()
    .describe('KRDS document identifier to extract images from'),
    
  url: z.string()
    .url('Invalid URL format')
    .optional()
    .describe('Document URL to extract images from'),
    
  imageUrl: z.string()
    .url('Invalid image URL format')
    .optional()
    .describe('Specific image URL to process'),
    
  // Image processing options
  downloadImages: z.boolean()
    .default(false)
    .describe('Whether to download images locally'),
    
  processImages: z.boolean()
    .default(true)
    .describe('Whether to process images for metadata and OCR'),
    
  extractText: z.boolean()
    .default(false)
    .describe('Whether to extract text from images using OCR'),
    
  processKoreanText: z.boolean()
    .default(true)
    .describe('Whether to process Korean text in image metadata and OCR'),
    
  // Image processing parameters
  maxWidth: z.number()
    .int()
    .min(50, 'Minimum width is 50 pixels')
    .max(4000, 'Maximum width is 4000 pixels')
    .optional()
    .describe('Maximum image width for processing'),
    
  maxHeight: z.number()
    .int()
    .min(50, 'Minimum height is 50 pixels')
    .max(4000, 'Maximum height is 4000 pixels')
    .optional()
    .describe('Maximum image height for processing'),
    
  format: ImageFormat
    .default('original')
    .describe('Output image format for downloaded images'),
    
  quality: z.number()
    .int()
    .min(1, 'Quality must be at least 1')
    .max(100, 'Quality cannot exceed 100')
    .default(85)
    .describe('Image quality for JPEG compression (1-100)'),
    
  // Filtering options
  minSize: z.number()
    .int()
    .min(0, 'Minimum size must be non-negative')
    .default(1024)
    .describe('Minimum image size in bytes'),
    
  maxImages: z.number()
    .int()
    .min(1, 'At least 1 image required')
    .max(200, 'Maximum 200 images allowed')
    .default(50)
    .describe('Maximum number of images to process'),
    
  includeDecorativeImages: z.boolean()
    .default(false)
    .describe('Whether to include decorative images (icons, borders, etc.)'),
    
  // OCR options
  ocrLanguage: z.enum(['ko', 'en', 'ko+en'])
    .default('ko')
    .describe('Language for OCR text extraction'),
    
  ocrConfidenceThreshold: z.number()
    .min(0, 'Confidence must be at least 0')
    .max(1, 'Confidence cannot exceed 1')
    .default(0.6)
    .describe('Minimum confidence threshold for OCR text'),
    
  // Storage options
  downloadPath: z.string()
    .max(500, 'Download path too long')
    .optional()
    .describe('Local directory path for downloaded images'),
    
  generateThumbnails: z.boolean()
    .default(false)
    .describe('Whether to generate thumbnail versions'),
    
  thumbnailSize: z.number()
    .int()
    .min(50, 'Minimum thumbnail size is 50')
    .max(500, 'Maximum thumbnail size is 500')
    .default(200)
    .describe('Thumbnail size in pixels'),
    
  // Performance options
  useCache: z.boolean()
    .default(true)
    .describe('Whether to use cached image processing results'),
    
  timeout: z.number()
    .int()
    .min(5000, 'Timeout must be at least 5 seconds')
    .max(300000, 'Timeout cannot exceed 5 minutes')
    .default(60000)
    .describe('Processing timeout in milliseconds'),
}).refine(
  (data) => data.documentId || data.url || data.imageUrl,
  {
    message: "Either 'documentId', 'url', or 'imageUrl' must be provided",
    path: ["documentId", "url", "imageUrl"],
  }
);

// ============================================================================
// Image Processing Result Types
// ============================================================================

interface ProcessedImage extends KrdsImage {
  // OCR results
  extractedText?: string;
  extractedTextKorean?: string;
  ocrConfidence?: number;
  
  // Processing metadata
  originalSize?: number;
  processedSize?: number;
  thumbnailPath?: string;
  processingTime?: number;
  
  // Analysis results
  dominantColors?: string[];
  hasText?: boolean;
  isDecorative?: boolean;
  qualityScore?: number;
}

interface ImageProcessingResult {
  images: ProcessedImage[];
  totalImages: number;
  processedImages: number;
  downloadedImages: number;
  totalSize: number;
  processingTimeMs: number;
  errors: string[];
}

// ============================================================================
// Tool Implementation
// ============================================================================

/**
 * Register the image tools with the MCP server
 */
export async function registerImageToolsTool(
  server: Server,
  context: ToolContext
): Promise<void> {
  const { logger, krdsService, cacheManager, config } = context;
  
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== 'krds_image_tools') {
      return;
    }
    
    const toolLogger = logger.child({ 
      tool: 'image_tools', 
      requestId: generateRequestId() 
    });
    toolLogger.info('Processing KRDS image tools request');
    
    try {
      // Step 1: Validate and parse input parameters
      const params = ImageToolsSchema.parse(request.params.arguments);
      toolLogger.debug('Image tools parameters validated', { params });
      
      // Step 2: Check cache for existing results
      const cacheKey = generateImageCacheKey(params);
      let result: ImageProcessingResult | null = null;
      
      if (params.useCache && cacheManager) {
        result = await cacheManager.get<ImageProcessingResult>(cacheKey);
        if (result) {
          toolLogger.info('Returning cached image processing results', {
            cacheKey,
            imageCount: result.images.length
          });
          
          return {
            content: [
              {
                type: 'text',
                text: formatImageResults(result, true),
              },
            ],
          };
        }
      }
      
      // Step 3: Initialize image processor
      const imageExtractor = new ImageExtractor(toolLogger);
      const koreanProcessor = params.processKoreanText ? 
        new KoreanTextProcessor(toolLogger) : null;
      
      const processingStartTime = Date.now();
      
      // Step 4: Process images based on input type
      if (params.imageUrl) {
        result = await processSingleImage(params.imageUrl, params, imageExtractor, koreanProcessor, toolLogger);
      } else {
        result = await processDocumentImages(params, imageExtractor, koreanProcessor, krdsService, toolLogger);
      }
      
      const processingTime = Date.now() - processingStartTime;
      result.processingTimeMs = processingTime;
      
      toolLogger.info('Image processing completed', {
        totalImages: result.totalImages,
        processedImages: result.processedImages,
        downloadedImages: result.downloadedImages,
        processingTimeMs: processingTime,
        errors: result.errors.length
      });
      
      // Step 5: Cache the results
      if (params.useCache && cacheManager && result.images.length > 0) {
        await cacheManager.set(cacheKey, result, config.cache.ttl);
        toolLogger.debug('Image processing results cached', { cacheKey });
      }
      
      // Step 6: Format and return results
      return {
        content: [
          {
            type: 'text',
            text: formatImageResults(result, false),
          },
        ],
      };
      
    } catch (error) {
      toolLogger.error('Image tools error', { error });
      
      if (error instanceof McpError) {
        throw error;
      }
      
      if (error instanceof KrdsError) {
        throw new McpError(
          ErrorCode.InternalError,
          `KRDS image processing error: ${error.message}`,
        );
      }
      
      throw new McpError(
        ErrorCode.InternalError,
        `Image processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  });
  
  // Tool metadata is handled by the centralized registry
}

// ============================================================================
// Image Processing Functions
// ============================================================================

/**
 * Process a single image URL
 */
async function processSingleImage(
  imageUrl: string,
  params: z.infer<typeof ImageToolsSchema>,
  extractor: ImageExtractor,
  koreanProcessor: KoreanTextProcessor | null,
  logger: any
): Promise<ImageProcessingResult> {
  logger.debug('Processing single image', { imageUrl });
  
  const result: ImageProcessingResult = {
    images: [],
    totalImages: 1,
    processedImages: 0,
    downloadedImages: 0,
    totalSize: 0,
    processingTimeMs: 0,
    errors: []
  };
  
  try {
    const processedImage = await processImageUrl(
      imageUrl, 
      params, 
      extractor, 
      koreanProcessor, 
      logger
    );
    
    if (processedImage) {
      result.images.push(processedImage);
      result.processedImages = 1;
      result.totalSize = processedImage.sizeBytes;
      
      if (processedImage.localPath) {
        result.downloadedImages = 1;
      }
    }
  } catch (error) {
    result.errors.push(`Failed to process image ${imageUrl}: ${error}`);
    logger.warn('Single image processing failed', { imageUrl, error });
  }
  
  return result;
}

/**
 * Process images from a document
 */
async function processDocumentImages(
  params: z.infer<typeof ImageToolsSchema>,
  extractor: ImageExtractor,
  koreanProcessor: KoreanTextProcessor | null,
  krdsService: any,
  logger: any
): Promise<ImageProcessingResult> {
  logger.debug('Processing document images', { 
    documentId: params.documentId,
    url: params.url 
  });
  
  const result: ImageProcessingResult = {
    images: [],
    totalImages: 0,
    processedImages: 0,
    downloadedImages: 0,
    totalSize: 0,
    processingTimeMs: 0,
    errors: []
  };
  
  try {
    // Get document or extract images from URL
    let document: KrdsDocument | null = null;
    
    if (params.documentId) {
      document = await krdsService.getDocument(params.documentId);
    } else if (params.url) {
      // This would use the scraper to extract images
      const scrapeResult = await krdsService.scrapeDocument(params.url, {
        extractImages: true,
        extractAttachments: false,
        processKoreanText: params.processKoreanText
      });
      document = scrapeResult.document;
    }
    
    if (!document) {
      throw new KrdsError(
        'NOT_FOUND',
        'Document not found or could not be processed'
      );
    }
    
    result.totalImages = document.images.length;
    
    // Filter images based on criteria
    let filteredImages = document.images.filter(image => {
      if (image.sizeBytes < params.minSize) return false;
      if (!params.includeDecorativeImages && isDecorativeImage(image)) return false;
      return true;
    });
    
    // Limit number of images
    filteredImages = filteredImages.slice(0, params.maxImages);
    
    // Process each image
    for (const image of filteredImages) {
      try {
        const processedImage = await processImageUrl(
          image.url,
          params,
          extractor,
          koreanProcessor,
          logger,
          image
        );
        
        if (processedImage) {
          result.images.push(processedImage);
          result.processedImages++;
          result.totalSize += processedImage.sizeBytes;
          
          if (processedImage.localPath) {
            result.downloadedImages++;
          }
        }
      } catch (error) {
        result.errors.push(`Failed to process image ${image.url}: ${error}`);
        logger.warn('Image processing failed', { imageUrl: image.url, error });
      }
    }
    
  } catch (error) {
    throw new KrdsError(
      'PROCESSING_ERROR',
      'Failed to process document images',
      error as Error,
      { documentId: params.documentId, url: params.url }
    );
  }
  
  return result;
}

/**
 * Process individual image URL
 */
async function processImageUrl(
  imageUrl: string,
  params: z.infer<typeof ImageToolsSchema>,
  extractor: ImageExtractor,
  koreanProcessor: KoreanTextProcessor | null,
  logger: any,
  baseImage?: KrdsImage
): Promise<ProcessedImage | null> {
  const startTime = Date.now();
  
  try {
    // Extract image with options
    const extractedImage = await extractor.extractImage(imageUrl, {
      extractDimensions: true,
      processKoreanText: params.processKoreanText,
      maxWidth: params.maxWidth,
      maxHeight: params.maxHeight,
      downloadLocally: params.downloadImages,
      format: params.format,
      quality: params.quality,
      generateThumbnails: params.generateThumbnails,
      thumbnailSize: params.thumbnailSize,
      downloadPath: params.downloadPath,
      timeout: params.timeout,
    });
    
    if (!extractedImage) {
      return null;
    }
    
    // Create processed image object
    const processedImage: ProcessedImage = {
      ...baseImage,
      ...extractedImage,
      processingTime: Date.now() - startTime,
    };
    
    // OCR text extraction if requested
    if (params.extractText && extractedImage.localPath) {
      try {
        const ocrResult = await extractTextFromImage(
          extractedImage.localPath,
          params.ocrLanguage,
          params.ocrConfidenceThreshold,
          logger
        );
        
        if (ocrResult) {
          processedImage.extractedText = ocrResult.text;
          processedImage.ocrConfidence = ocrResult.confidence;
          processedImage.hasText = ocrResult.text.length > 0;
          
          // Process Korean text if available
          if (koreanProcessor && ocrResult.text && params.processKoreanText) {
            const koreanAnalysis = await koreanProcessor.processText(ocrResult.text);
            processedImage.extractedTextKorean = koreanAnalysis.normalizedText;
          }
        }
      } catch (error) {
        logger.warn('OCR processing failed', { imageUrl, error });
        processedImage.hasText = false;
      }
    }
    
    // Analyze image properties
    if (params.processImages) {
      processedImage.isDecorative = isDecorativeImage(processedImage);
      processedImage.qualityScore = assessImageQuality(processedImage);
      
      // Extract dominant colors (placeholder - would need image analysis library)
      processedImage.dominantColors = ['#PLACEHOLDER'];
    }
    
    return processedImage;
    
  } catch (error) {
    throw new KrdsError(
      'IMAGE_PROCESSING_ERROR',
      `Failed to process image: ${imageUrl}`,
      error as Error,
      { imageUrl, params }
    );
  }
}

/**
 * Extract text from image using OCR (placeholder implementation)
 */
async function extractTextFromImage(
  imagePath: string,
  language: string,
  confidenceThreshold: number,
  logger: any
): Promise<{ text: string; confidence: number } | null> {
  // This is a placeholder implementation
  // In a real implementation, you would use libraries like:
  // - tesseract.js for web-based OCR
  // - node-tesseract-ocr for Node.js
  // - Google Cloud Vision API
  // - AWS Textract
  
  logger.debug('OCR text extraction (placeholder)', { 
    imagePath, 
    language, 
    confidenceThreshold 
  });
  
  // Simulate OCR processing
  await new Promise(resolve => setTimeout(resolve, 100));
  
  return {
    text: 'OCR text extraction placeholder - implement with real OCR library',
    confidence: 0.8
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique request ID for logging and tracing
 */
function generateRequestId(): string {
  return `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a cache key for image processing parameters
 */
function generateImageCacheKey(params: z.infer<typeof ImageToolsSchema>): string {
  const keyComponents = [
    'krds_images',
    params.documentId || '',
    params.url || '',
    params.imageUrl || '',
    params.downloadImages ? '1' : '0',
    params.processImages ? '1' : '0',
    params.extractText ? '1' : '0',
    params.format,
    params.maxImages || 50,
  ];
  
  return keyComponents.join('|');
}

/**
 * Determine if an image is decorative
 */
function isDecorativeImage(image: KrdsImage | ProcessedImage): boolean {
  // Simple heuristics for decorative images
  if (image.sizeBytes < 1024) return true; // Very small images are likely decorative
  if (image.width && image.height && (image.width < 32 || image.height < 32)) return true;
  if (image.alt?.includes('icon') || image.alt?.includes('bullet')) return true;
  if (image.url.includes('icon') || image.url.includes('bullet')) return true;
  
  return false;
}

/**
 * Assess image quality score
 */
function assessImageQuality(image: ProcessedImage): number {
  let score = 0.5; // Base score
  
  // Size factors
  if (image.sizeBytes > 50000) score += 0.2;
  if (image.sizeBytes > 100000) score += 0.1;
  
  // Dimension factors
  if (image.width && image.height) {
    const pixels = image.width * image.height;
    if (pixels > 100000) score += 0.2;
    if (pixels > 500000) score += 0.1;
  }
  
  // Text content
  if (image.hasText) score += 0.1;
  
  // Alt text quality
  if (image.alt && image.alt.length > 10) score += 0.1;
  
  return Math.min(1.0, Math.max(0.0, score));
}

/**
 * Format image processing results for display
 */
function formatImageResults(
  result: ImageProcessingResult, 
  fromCache: boolean
): string {
  let output = `# KRDS Image Processing Results ${fromCache ? '(Cached)' : ''}\n\n`;
  
  // Summary information
  output += `**Processing Summary:**\n`;
  output += `- Total Images Found: ${result.totalImages}\n`;
  output += `- Images Processed: ${result.processedImages}\n`;
  output += `- Images Downloaded: ${result.downloadedImages}\n`;
  output += `- Total Size: ${Math.round(result.totalSize / 1024)} KB\n`;
  output += `- Processing Time: ${result.processingTimeMs}ms\n`;
  
  if (result.errors.length > 0) {
    output += `- Errors: ${result.errors.length}\n`;
  }
  
  output += `\n`;
  
  // Individual image results
  if (result.images.length > 0) {
    output += `**Images (${result.images.length}):**\n\n`;
    
    result.images.forEach((image, index) => {
      output += `## ${index + 1}. ${image.alt || 'Untitled Image'}\n`;
      
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
      
      if (image.thumbnailPath) {
        output += `- **Thumbnail:** ${image.thumbnailPath}\n`;
      }
      
      if (image.extractedText) {
        output += `- **Extracted Text:** ${image.extractedText.substring(0, 100)}${image.extractedText.length > 100 ? '...' : ''}\n`;
      }
      
      if (image.ocrConfidence !== undefined) {
        output += `- **OCR Confidence:** ${(image.ocrConfidence * 100).toFixed(1)}%\n`;
      }
      
      if (image.qualityScore !== undefined) {
        output += `- **Quality Score:** ${(image.qualityScore * 100).toFixed(1)}%\n`;
      }
      
      if (image.isDecorative !== undefined) {
        output += `- **Type:** ${image.isDecorative ? 'Decorative' : 'Content'}\n`;
      }
      
      if (image.processingTime) {
        output += `- **Processing Time:** ${image.processingTime}ms\n`;
      }
      
      output += `\n`;
    });
  }
  
  // Error details
  if (result.errors.length > 0) {
    output += `## Processing Errors (${result.errors.length})\n\n`;
    result.errors.forEach((error, index) => {
      output += `${index + 1}. ${error}\n`;
    });
    output += `\n`;
  }
  
  output += `---\n\n`;
  output += `*Processed on ${new Date().toISOString().split('T')[0]}*\n`;
  
  return output;
}

// ============================================================================
// Exports
// ============================================================================

export { ImageToolsSchema };
export type { ImageToolParams, ProcessedImage, ImageProcessingResult };