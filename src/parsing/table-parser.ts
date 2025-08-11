/**
 * Table Parser for KRDS Documents
 * 
 * Specialized parser for extracting and structuring HTML table data with
 * particular focus on Korean headers and content. Handles complex table
 * structures including merged cells, nested tables, and semantic markup.
 * 
 * Features:
 * - Korean header detection and processing
 * - Rowspan/colspan handling
 * - Table metadata extraction
 * - Data type inference
 * - CSV-like data structure generation
 * - Nested table support
 * 
 * @author KRDS MCP Server
 * @version 1.0.0
 */

import * as cheerio from 'cheerio';
import type { CheerioAPI, Element } from 'cheerio';
import { Logger } from 'winston';
import { KrdsError } from '../types/index.js';

/**
 * Table cell data structure
 */
export interface TableCell {
  content: string;
  contentKorean?: string;
  rowspan: number;
  colspan: number;
  isHeader: boolean;
  dataType: 'text' | 'number' | 'date' | 'currency' | 'percentage' | 'url' | 'email';
  rawHtml?: string;
}

/**
 * Table row structure
 */
export interface TableRow {
  cells: TableCell[];
  isHeader: boolean;
  metadata?: Record<string, any>;
}

/**
 * Complete table data structure
 */
export interface TableData {
  id: string;
  caption?: string;
  captionKorean?: string;
  headers: string[];
  headersKorean: string[];
  rows: TableRow[];
  summary?: string;
  summaryKorean?: string;
  metadata: {
    totalRows: number;
    totalColumns: number;
    hasHeaders: boolean;
    hasRowspan: boolean;
    hasColspan: boolean;
    isDataTable: boolean;
    complexity: 'simple' | 'moderate' | 'complex';
  };
  csvData?: string[][];
  processingTimeMs: number;
}

/**
 * Table parsing options
 */
export interface TableParsingOptions {
  /** Process Korean text in tables */
  processKoreanText: boolean;
  /** Include raw HTML for cells */
  includeRawHtml: boolean;
  /** Generate CSV-like data structure */
  generateCsvData: boolean;
  /** Maximum table size to process */
  maxTableSize: number;
  /** Detect and infer data types */
  inferDataTypes: boolean;
  /** Process nested tables */
  processNestedTables: boolean;
}

/**
 * Default table parsing options
 */
export const DEFAULT_TABLE_OPTIONS: TableParsingOptions = {
  processKoreanText: true,
  includeRawHtml: false,
  generateCsvData: true,
  maxTableSize: 10000,
  inferDataTypes: true,
  processNestedTables: false,
};

/**
 * Table parser class
 */
export class TableParser {
  constructor(private logger: Logger) {}

  /**
   * Extract all tables from the document
   */
  public async extractTables(
    $: CheerioAPI,
    baseUrl: string,
    options: Partial<TableParsingOptions> = {}
  ): Promise<TableData[]> {
    const opts = { ...DEFAULT_TABLE_OPTIONS, ...options };
    const tables: TableData[] = [];

    try {
      this.logger.debug('Starting table extraction', { baseUrl, options: opts });

      $('table').each((index, element) => {
        try {
          const tableData = this.parseTable($, $(element), `table_${index}`, opts);
          if (tableData && this.isValidTable(tableData, opts)) {
            tables.push(tableData);
          }
        } catch (error) {
          this.logger.warn('Failed to parse table', {
            index,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      });

      this.logger.info('Table extraction completed', {
        baseUrl,
        tablesFound: tables.length,
      });

      return tables;

    } catch (error) {
      this.logger.error('Table extraction failed', {
        baseUrl,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new KrdsError(
        'PARSING_ERROR',
        `Failed to extract tables from ${baseUrl}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
        { baseUrl }
      );
    }
  }

  /**
   * Parse a single table element
   */
  private parseTable(
    $: CheerioAPI,
    table: cheerio.Cheerio<Element>,
    tableId: string,
    options: TableParsingOptions
  ): TableData | null {
    const startTime = Date.now();

    try {
      // Extract table metadata
      const caption = table.find('caption').first().text().trim();
      const summary = table.attr('summary') || '';

      // Process table structure
      const rows = this.extractTableRows($, table, options);
      if (rows.length === 0) return null;

      // Determine headers
      const { headers, headersKorean } = this.extractHeaders(rows);

      // Calculate metadata
      const metadata = this.calculateTableMetadata(rows);

      // Generate CSV data if requested
      let csvData: string[][] | undefined;
      if (options.generateCsvData) {
        csvData = this.generateCsvData(rows, headers);
      }

      const tableData: TableData = {
        id: tableId,
        caption: caption || undefined,
        captionKorean: options.processKoreanText ? caption : undefined,
        headers,
        headersKorean,
        rows,
        summary: summary || undefined,
        summaryKorean: options.processKoreanText ? summary : undefined,
        metadata,
        csvData,
        processingTimeMs: Date.now() - startTime,
      };

      return tableData;

    } catch (error) {
      this.logger.warn('Failed to parse individual table', {
        tableId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Extract all rows from a table
   */
  private extractTableRows(
    $: CheerioAPI,
    table: cheerio.Cheerio<Element>,
    options: TableParsingOptions
  ): TableRow[] {
    const rows: TableRow[] = [];

    // Process thead, tbody, tfoot sections
    const sections = ['thead', 'tbody', 'tfoot'];
    const hasStructuredSections = sections.some(section => table.find(section).length > 0);

    if (hasStructuredSections) {
      sections.forEach(section => {
        table.find(`${section} tr`).each((_, rowElement) => {
          const row = this.parseTableRow($, $(rowElement), section === 'thead', options);
          if (row) rows.push(row);
        });
      });
    } else {
      // Direct tr elements
      table.find('tr').each((_, rowElement) => {
        const row = this.parseTableRow($, $(rowElement), false, options);
        if (row) rows.push(row);
      });
    }

    // Post-process to detect header rows if not explicitly marked
    this.detectHeaderRows(rows);

    return rows;
  }

  /**
   * Parse a single table row
   */
  private parseTableRow(
    $: CheerioAPI,
    row: cheerio.Cheerio<Element>,
    isHeaderSection: boolean,
    options: TableParsingOptions
  ): TableRow | null {
    const cells: TableCell[] = [];

    row.find('td, th').each((_, cellElement) => {
      const cell = this.parseTableCell($, $(cellElement), options);
      if (cell) {
        cells.push(cell);
      }
    });

    if (cells.length === 0) return null;

    // Determine if this is a header row
    const isHeader = isHeaderSection || this.isHeaderRow(cells);

    return {
      cells,
      isHeader,
    };
  }

  /**
   * Parse a single table cell
   */
  private parseTableCell(
    $: CheerioAPI,
    cell: cheerio.Cheerio<Element>,
    options: TableParsingOptions
  ): TableCell | null {
    const content = cell.text().trim();
    const tagName = cell.prop('tagName')?.toLowerCase();
    const isHeader = tagName === 'th' || cell.hasClass('header') || cell.attr('scope');

    // Get span attributes
    const rowspan = parseInt(cell.attr('rowspan') || '1');
    const colspan = parseInt(cell.attr('colspan') || '1');

    // Infer data type
    const dataType = options.inferDataTypes ? this.inferDataType(content) : 'text';

    const tableCell: TableCell = {
      content,
      contentKorean: options.processKoreanText ? content : undefined,
      rowspan,
      colspan,
      isHeader,
      dataType,
      rawHtml: options.includeRawHtml ? cell.html() || undefined : undefined,
    };

    return tableCell;
  }

  /**
   * Extract table headers from rows
   */
  private extractHeaders(rows: TableRow[]): { headers: string[]; headersKorean: string[] } {
    const headers: string[] = [];
    const headersKorean: string[] = [];

    // Find the first header row
    const headerRow = rows.find(row => row.isHeader);
    if (headerRow) {
      headerRow.cells.forEach(cell => {
        headers.push(cell.content);
        headersKorean.push(cell.contentKorean || cell.content);
      });
    } else if (rows.length > 0) {
      // Use first row as headers if no explicit headers
      rows[0].cells.forEach((cell, index) => {
        headers.push(cell.content || `Column ${index + 1}`);
        headersKorean.push(cell.contentKorean || cell.content || `컬럼 ${index + 1}`);
      });
    }

    return { headers, headersKorean };
  }

  /**
   * Detect header rows based on content patterns
   */
  private detectHeaderRows(rows: TableRow[]): void {
    if (rows.length === 0) return;

    // Mark first row as header if it contains typical header patterns
    const firstRow = rows[0];
    if (this.isHeaderRow(firstRow.cells)) {
      firstRow.isHeader = true;
      firstRow.cells.forEach(cell => {
        cell.isHeader = true;
      });
    }

    // Look for other potential header rows (e.g., group headers)
    rows.forEach((row, index) => {
      if (index === 0) return; // Skip first row, already checked

      // Check for merged cells spanning multiple columns (often group headers)
      const hasMergedCells = row.cells.some(cell => cell.colspan > 1);
      const hasHeaderLikeContent = this.isHeaderRow(row.cells);

      if (hasMergedCells && hasHeaderLikeContent) {
        row.isHeader = true;
        row.cells.forEach(cell => {
          cell.isHeader = true;
        });
      }
    });
  }

  /**
   * Determine if a row should be treated as a header row
   */
  private isHeaderRow(cells: TableCell[]): boolean {
    // Check if any cell is explicitly marked as header
    if (cells.some(cell => cell.isHeader)) return true;

    // Check content patterns
    const headerPatterns = [
      /^(번호|순서|no\.?|number)$/i,
      /^(제목|명칭|이름|name|title)$/i,
      /^(날짜|일자|date|time)$/i,
      /^(분류|종류|category|type)$/i,
      /^(상태|status|state)$/i,
      /^(내용|설명|description|content)$/i,
    ];

    const headerKeywords = ['항목', '구분', '기준', '내역', '현황'];

    return cells.some(cell => {
      const content = cell.content.toLowerCase().trim();
      return (
        headerPatterns.some(pattern => pattern.test(content)) ||
        headerKeywords.some(keyword => content.includes(keyword))
      );
    });
  }

  /**
   * Infer data type from cell content
   */
  private inferDataType(content: string): TableCell['dataType'] {
    if (!content.trim()) return 'text';

    // Number patterns
    if (/^[\d,.-]+$/.test(content.replace(/[^\d,.-]/g, ''))) {
      return 'number';
    }

    // Currency patterns (Korean Won, USD, etc.)
    if (/^[₩$¥€£]\s*[\d,.-]+|[\d,.-]+\s*원$/.test(content)) {
      return 'currency';
    }

    // Percentage patterns
    if (/\d+(\.\d+)?%$/.test(content)) {
      return 'percentage';
    }

    // Date patterns (Korean and international formats)
    const datePatterns = [
      /^\d{4}[-./]\d{1,2}[-./]\d{1,2}$/,
      /^\d{4}년\s*\d{1,2}월\s*\d{1,2}일$/,
      /^\d{1,2}[-./]\d{1,2}[-./]\d{4}$/,
    ];
    if (datePatterns.some(pattern => pattern.test(content))) {
      return 'date';
    }

    // URL patterns
    if (/^https?:\/\//.test(content)) {
      return 'url';
    }

    // Email patterns
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(content)) {
      return 'email';
    }

    return 'text';
  }

  /**
   * Calculate table metadata
   */
  private calculateTableMetadata(rows: TableRow[]): TableData['metadata'] {
    const totalRows = rows.length;
    const totalColumns = Math.max(...rows.map(row => row.cells.length));
    const hasHeaders = rows.some(row => row.isHeader);
    const hasRowspan = rows.some(row => row.cells.some(cell => cell.rowspan > 1));
    const hasColspan = rows.some(row => row.cells.some(cell => cell.colspan > 1));

    // Determine if this is a data table vs layout table
    const isDataTable = hasHeaders || totalRows > 2 || this.hasStructuredData(rows);

    // Determine complexity
    let complexity: 'simple' | 'moderate' | 'complex' = 'simple';
    if (hasRowspan || hasColspan) complexity = 'moderate';
    if ((hasRowspan && hasColspan) || totalRows > 20 || totalColumns > 10) {
      complexity = 'complex';
    }

    return {
      totalRows,
      totalColumns,
      hasHeaders,
      hasRowspan,
      hasColspan,
      isDataTable,
      complexity,
    };
  }

  /**
   * Check if table contains structured data
   */
  private hasStructuredData(rows: TableRow[]): boolean {
    if (rows.length < 2) return false;

    // Check if cells in the same column have similar data types
    const columnTypes: Set<string>[] = [];
    
    rows.forEach(row => {
      row.cells.forEach((cell, colIndex) => {
        if (!columnTypes[colIndex]) {
          columnTypes[colIndex] = new Set();
        }
        columnTypes[colIndex].add(cell.dataType);
      });
    });

    // If most columns have consistent data types, it's likely a data table
    const consistentColumns = columnTypes.filter(types => types.size <= 2).length;
    return consistentColumns > columnTypes.length * 0.6;
  }

  /**
   * Generate CSV-like data structure
   */
  private generateCsvData(rows: TableRow[], headers: string[]): string[][] {
    const csvData: string[][] = [];

    // Add headers if available
    if (headers.length > 0) {
      csvData.push(headers);
    }

    // Add data rows
    rows.forEach(row => {
      if (!row.isHeader || csvData.length === 0) {
        const rowData = row.cells.map(cell => cell.content);
        csvData.push(rowData);
      }
    });

    return csvData;
  }

  /**
   * Validate if a table should be included in results
   */
  private isValidTable(table: TableData, options: TableParsingOptions): boolean {
    // Skip empty tables
    if (table.rows.length === 0) return false;

    // Skip layout tables (tables used for positioning)
    if (!table.metadata.isDataTable) return false;

    // Skip tables that are too large
    const totalCells = table.metadata.totalRows * table.metadata.totalColumns;
    if (totalCells > options.maxTableSize) {
      this.logger.warn('Skipping large table', {
        tableId: table.id,
        totalCells,
        maxSize: options.maxTableSize,
      });
      return false;
    }

    // Skip tables with only one cell
    if (totalCells <= 1) return false;

    return true;
  }
}