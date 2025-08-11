/**
 * Usage Examples for KRDS Content Parsing Modules
 * 
 * This file demonstrates how to use the content parsing modules both
 * standalone and integrated with the scraping system.
 * 
 * @author KRDS MCP Server
 * @version 1.0.0
 */

import { Logger } from 'winston';
import * as cheerio from 'cheerio';
import {
  ContentParser,
  TableParser,
  ImageExtractor,
  MetadataExtractor,
  KoreanTextProcessor,
  createParsingPipeline,
  KRDS_PARSING_CONFIG,
} from './index.js';
import { ContentIntegrator } from '../scraping/content-integration.js';

/**
 * Example: Parse HTML content with all modules
 */
export async function parseCompleteDocument(
  html: string,
  url: string,
  logger: Logger
) {
  // Create content parser
  const contentParser = new ContentParser(logger);

  // Parse with comprehensive options
  const result = await contentParser.parseContent(html, url, {
    extractTables: true,
    extractImages: true,
    extractMetadata: true,
    processKoreanText: true,
    extractAttachments: true,
    preserveHtml: false,
    maxContentLength: 0,
    includeStyles: false,
  });

  console.log('Parsing Results:');
  console.log('================');
  console.log(`Title: ${result.title}`);
  console.log(`Content Length: ${result.content.length} characters`);
  console.log(`Sections: ${result.sections.length}`);
  console.log(`Tables: ${result.tables?.length || 0}`);
  console.log(`Images: ${result.images?.length || 0}`);
  console.log(`Processing Time: ${result.processingTimeMs}ms`);

  return result;
}

/**
 * Example: Parse only tables from HTML
 */
export async function parseTablesOnly(
  html: string,
  url: string,
  logger: Logger
) {
  const $ = cheerio.load(html);
  const tableParser = new TableParser(logger);

  const tables = await tableParser.extractTables($, url, {
    processKoreanText: true,
    includeRawHtml: false,
    generateCsvData: true,
    maxTableSize: 5000,
    inferDataTypes: true,
    processNestedTables: false,
  });

  console.log('Table Parsing Results:');
  console.log('======================');
  tables.forEach((table, index) => {
    console.log(`Table ${index + 1}:`);
    console.log(`  - Caption: ${table.caption || 'No caption'}`);
    console.log(`  - Rows: ${table.metadata.totalRows}`);
    console.log(`  - Columns: ${table.metadata.totalColumns}`);
    console.log(`  - Complexity: ${table.metadata.complexity}`);
    console.log(`  - Processing Time: ${table.processingTimeMs}ms`);
  });

  return tables;
}

/**
 * Example: Extract images with metadata
 */
export async function extractImagesWithMetadata(
  html: string,
  url: string,
  logger: Logger
) {
  const $ = cheerio.load(html);
  const imageExtractor = new ImageExtractor(logger);

  const images = await imageExtractor.extractImages($, url, {
    extractInlineImages: true,
    processKoreanText: true,
    generateDownloadUrls: true,
    extractDimensions: true,
    maxImages: 50,
    minImageSize: 32,
    extractBackgroundImages: false,
    includeDecorativeImages: false,
  });

  console.log('Image Extraction Results:');
  console.log('=========================');
  images.forEach((image, index) => {
    console.log(`Image ${index + 1}:`);
    console.log(`  - URL: ${image.url}`);
    console.log(`  - Alt: ${image.alt}`);
    console.log(`  - Dimensions: ${image.width}x${image.height}`);
    console.log(`  - Format: ${image.format}`);
  });

  return images;
}

/**
 * Example: Process Korean text
 */
export async function processKoreanText(
  text: string,
  logger: Logger
) {
  const processor = new KoreanTextProcessor(logger);

  const analysis = await processor.processText(text, {
    normalizeHangul: true,
    generateRomanization: true,
    extractKeywords: true,
    analyzeSentiment: true,
    calculateReadability: true,
    convertHanja: true,
    maxKeywords: 10,
    minKeywordLength: 2,
  });

  console.log('Korean Text Processing Results:');
  console.log('===============================');
  console.log(`Original Text: ${analysis.originalText.substring(0, 100)}...`);
  console.log(`Romanized: ${analysis.romanized}`);
  console.log(`Word Count: ${analysis.wordCount}`);
  console.log(`Character Count: ${analysis.characterCount}`);
  console.log(`Keywords: ${analysis.keywords.join(', ')}`);
  console.log(`Sentiment: ${analysis.sentiment || 'not analyzed'}`);
  console.log(`Readability Score: ${analysis.readabilityScore || 'not calculated'}`);

  return analysis;
}

/**
 * Example: Use parsing pipeline
 */
export async function usePipelineExample(logger: Logger) {
  // Create complete parsing pipeline
  const pipeline = createParsingPipeline(logger);

  console.log('Parsing Pipeline Created:');
  console.log('========================');
  console.log('Available parsers:');
  console.log('- Content Parser');
  console.log('- Table Parser');
  console.log('- Image Extractor');
  console.log('- Metadata Extractor');
  console.log('- Korean Text Processor');

  return pipeline;
}

/**
 * Example: Integration with scraper
 */
export async function integratedScrapingExample(
  page: any, // Puppeteer Page
  url: string,
  logger: Logger
) {
  const integrator = new ContentIntegrator(logger);

  // Check if we should use enhanced parsing
  const shouldUseEnhanced = await integrator.shouldUseEnhancedParsing(page);
  console.log(`Using enhanced parsing: ${shouldUseEnhanced}`);

  if (shouldUseEnhanced) {
    // Extract content with enhanced parsing
    const document = await integrator.extractEnhancedContent(page, url, {
      useEnhancedParsing: true,
      includeTables: true,
      includeImages: true,
      includeMetadata: true,
      processKoreanText: true,
      includeAttachments: true,
      maxContentLength: 0,
    });

    console.log('Enhanced Extraction Results:');
    console.log('============================');
    console.log(`Document ID: ${document.id}`);
    console.log(`Title: ${document.title}`);
    console.log(`Category: ${document.category}`);
    console.log(`Content Length: ${document.content.length}`);
    console.log(`Images: ${document.images.length}`);
    console.log(`Attachments: ${document.attachments.length}`);

    return document;
  }

  return null;
}

/**
 * Example: Custom parsing configuration
 */
export function customParsingConfigExample() {
  // Use the default KRDS configuration as a base
  const customConfig = {
    ...KRDS_PARSING_CONFIG,
    // Customize for specific use case
    content: {
      ...KRDS_PARSING_CONFIG.content,
      maxContentLength: 100000, // Limit content length
      preserveHtml: true,        // Keep HTML structure
    },
    tables: {
      ...KRDS_PARSING_CONFIG.tables,
      maxTableSize: 50000,       // Allow larger tables
      includeRawHtml: true,      // Include raw HTML for complex tables
    },
    korean: {
      ...KRDS_PARSING_CONFIG.korean,
      analyzeSentiment: true,    // Enable sentiment analysis
      maxKeywords: 25,           // Extract more keywords
    },
  };

  console.log('Custom Parsing Configuration:');
  console.log('=============================');
  console.log(JSON.stringify(customConfig, null, 2));

  return customConfig;
}

/**
 * Example: Error handling in parsing
 */
export async function errorHandlingExample(
  html: string,
  url: string,
  logger: Logger
) {
  try {
    const contentParser = new ContentParser(logger);
    
    // This might fail with malformed HTML
    const result = await contentParser.parseContent(html, url);
    
    return result;
    
  } catch (error) {
    logger.error('Parsing failed, implementing fallback strategy', {
      url,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    // Fallback to basic parsing
    const $ = cheerio.load(html, { xmlMode: false, decodeEntities: false });
    
    const basicResult = {
      title: $('title').first().text() || 'Untitled',
      content: $('body').text().trim(),
      processingTimeMs: 0,
      sections: [],
      wordCount: 0,
      characterCount: 0,
      language: 'ko' as const,
    };

    logger.info('Fallback parsing completed', { url });
    return basicResult;
  }
}

/**
 * Run all examples (for testing purposes)
 */
export async function runAllExamples(logger: Logger) {
  const sampleHtml = `
    <html>
      <head>
        <title>샘플 KRDS 문서</title>
        <meta name="description" content="한국 정부 데이터 서비스 샘플 문서">
        <meta name="keywords" content="정부,데이터,서비스,한국">
      </head>
      <body>
        <h1>정책 발표</h1>
        <p>이것은 샘플 한국어 문서입니다.</p>
        <table>
          <tr><th>항목</th><th>내용</th></tr>
          <tr><td>제목</td><td>정책 발표</td></tr>
        </table>
        <img src="/sample.jpg" alt="샘플 이미지">
      </body>
    </html>
  `;

  const sampleUrl = 'https://v04.krds.go.kr/sample-document';

  console.log('Running All Parsing Examples');
  console.log('============================\n');

  // Run examples
  await parseCompleteDocument(sampleHtml, sampleUrl, logger);
  console.log('\n');
  
  await parseTablesOnly(sampleHtml, sampleUrl, logger);
  console.log('\n');
  
  await extractImagesWithMetadata(sampleHtml, sampleUrl, logger);
  console.log('\n');
  
  await processKoreanText('이것은 샘플 한국어 텍스트입니다. 정부 정책에 대한 내용입니다.', logger);
  console.log('\n');
  
  usePipelineExample(logger);
  console.log('\n');
  
  customParsingConfigExample();
  console.log('\n');
  
  await errorHandlingExample(sampleHtml, sampleUrl, logger);
  
  console.log('\nAll examples completed successfully!');
}