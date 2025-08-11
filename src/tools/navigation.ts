/**
 * KRDS Navigation MCP Tool
 * 
 * This tool provides comprehensive navigation functionality for exploring the
 * KRDS website structure. It can discover site navigation trees, list categories,
 * and browse hierarchical content organization.
 * 
 * Features:
 * =========
 * 1. Complete site navigation tree discovery
 * 2. Category and subcategory listing
 * 3. Page discovery within categories
 * 4. Hierarchical content structure mapping
 * 5. Korean language navigation support
 * 6. Breadcrumb and path resolution
 * 7. Navigation caching for performance
 * 
 * Usage Examples:
 * ===============
 * - Get navigation tree: { "action": "get_navigation_tree" }
 * - List categories: { "action": "list_categories" }
 * - Browse category: { "action": "browse_category", "category": "환경" }
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
  NavigationParams 
} from '@/types/index.js';
import { NavigationCrawler, type NavigationNode } from '@/scraping/index.js';
import { KrdsError } from '@/types/index.js';

// ============================================================================
// Schema Definitions
// ============================================================================

/**
 * Navigation action types
 */
const NavigationAction = z.enum(['list_categories', 'browse_category', 'get_navigation_tree']);

/**
 * Input schema for the navigation tool
 */
const NavigationSchema = z.object({
  // Action to perform
  action: NavigationAction
    .describe('Navigation action to perform'),
    
  // Category browsing parameters
  category: z.string()
    .min(1, 'Category name cannot be empty')
    .max(100, 'Category name too long')
    .optional()
    .describe('Category name to browse (required for browse_category action)'),
    
  subcategory: z.string()
    .min(1, 'Subcategory name cannot be empty')
    .max(100, 'Subcategory name too long')
    .optional()
    .describe('Subcategory name for detailed browsing'),
    
  // Tree traversal options
  depth: z.number()
    .int()
    .min(1, 'Depth must be at least 1')
    .max(10, 'Maximum depth is 10')
    .default(3)
    .describe('Maximum depth for navigation tree traversal'),
    
  // Result options
  maxResults: z.number()
    .int()
    .min(1, 'At least 1 result required')
    .max(1000, 'Maximum 1000 results allowed')
    .default(100)
    .describe('Maximum number of navigation items to return'),
    
  includeMetadata: z.boolean()
    .default(true)
    .describe('Whether to include metadata for navigation items'),
    
  includeUrls: z.boolean()
    .default(true)
    .describe('Whether to include URLs for navigation items'),
    
  // Language options
  language: z.enum(['ko', 'en', 'both'])
    .default('both')
    .describe('Language preference for navigation items'),
    
  // Performance options
  useCache: z.boolean()
    .default(true)
    .describe('Whether to use cached navigation data'),
    
  refreshCache: z.boolean()
    .default(false)
    .describe('Whether to refresh cached navigation data'),
    
  timeout: z.number()
    .int()
    .min(5000, 'Timeout must be at least 5 seconds')
    .max(300000, 'Timeout cannot exceed 5 minutes')
    .default(60000)
    .describe('Request timeout in milliseconds'),
}).refine(
  (data) => {
    if (data.action === 'browse_category' && !data.category) {
      return false;
    }
    return true;
  },
  {
    message: "Category is required when action is 'browse_category'",
    path: ["category"],
  }
);

// ============================================================================
// Navigation Result Types
// ============================================================================

interface NavigationCategory {
  name: string;
  nameKorean: string;
  url?: string;
  count?: number;
  subcategories?: NavigationCategory[];
  pages?: NavigationPage[];
  description?: string;
  descriptionKorean?: string;
}

interface NavigationPage {
  title: string;
  titleKorean: string;
  url: string;
  category: string;
  subcategory?: string;
  lastModified?: Date;
  documentType?: string;
  agency?: string;
  description?: string;
}

interface NavigationTree {
  root: NavigationNode;
  categories: NavigationCategory[];
  totalPages: number;
  depth: number;
  lastUpdated: Date;
  language: string;
}

// ============================================================================
// Tool Implementation
// ============================================================================

/**
 * Register the navigation tool with the MCP server
 */
export async function registerNavigationTool(
  server: Server,
  context: ToolContext
): Promise<void> {
  const { logger, krdsService, cacheManager, config } = context;
  
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== 'krds_navigation') {
      return;
    }
    
    const toolLogger = logger.child({ 
      tool: 'navigation', 
      requestId: generateRequestId() 
    });
    toolLogger.info('Processing KRDS navigation request');
    
    try {
      // Step 1: Validate and parse input parameters
      const params = NavigationSchema.parse(request.params.arguments);
      toolLogger.debug('Navigation parameters validated', { params });
      
      // Step 2: Check cache if enabled
      const cacheKey = generateNavigationCacheKey(params);
      let result: any = null;
      
      if (params.useCache && !params.refreshCache && cacheManager) {
        result = await cacheManager.get(cacheKey);
        if (result) {
          toolLogger.info('Returning cached navigation data', {
            cacheKey,
            action: params.action
          });
          
          return {
            content: [
              {
                type: 'text',
                text: formatNavigationResult(result, params.action, true),
              },
            ],
          };
        }
      }
      
      // Step 3: Initialize navigation crawler
      const crawler = new NavigationCrawler(config.scraping, toolLogger);
      const executionStartTime = Date.now();
      
      // Step 4: Execute navigation action
      switch (params.action) {
        case 'get_navigation_tree':
          result = await getNavigationTree(crawler, params, toolLogger);
          break;
          
        case 'list_categories':
          result = await listCategories(crawler, params, toolLogger);
          break;
          
        case 'browse_category':
          result = await browseCategory(crawler, params, toolLogger);
          break;
          
        default:
          throw new McpError(
            ErrorCode.InvalidParams,
            `Unsupported navigation action: ${params.action}`
          );
      }
      
      const executionTime = Date.now() - executionStartTime;
      toolLogger.info('Navigation action completed', {
        action: params.action,
        executionTimeMs: executionTime,
        resultSize: JSON.stringify(result).length
      });
      
      // Step 5: Cache the result
      if (params.useCache && cacheManager) {
        await cacheManager.set(cacheKey, result, config.cache.ttl);
        toolLogger.debug('Navigation result cached', { cacheKey });
      }
      
      // Step 6: Format and return results
      return {
        content: [
          {
            type: 'text',
            text: formatNavigationResult(result, params.action, false),
          },
        ],
      };
      
    } catch (error) {
      toolLogger.error('Navigation tool error', { error });
      
      if (error instanceof McpError) {
        throw error;
      }
      
      if (error instanceof KrdsError) {
        throw new McpError(
          ErrorCode.InternalError,
          `KRDS navigation error: ${error.message}`,
        );
      }
      
      throw new McpError(
        ErrorCode.InternalError,
        `Navigation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  });
  
  // Tool metadata is handled by the centralized registry
}

// ============================================================================
// Navigation Action Implementations
// ============================================================================

/**
 * Get complete navigation tree
 */
async function getNavigationTree(
  crawler: NavigationCrawler,
  params: z.infer<typeof NavigationSchema>,
  logger: any
): Promise<NavigationTree> {
  logger.debug('Building navigation tree', { maxDepth: params.depth });
  
  try {
    const navigationData = await crawler.buildNavigationTree(
      'https://krds.go.kr', // Default KRDS base URL
      {
        maxDepth: params.depth,
        includeMetadata: params.includeMetadata,
        timeout: params.timeout,
      }
    );
    
    const categories = await extractCategories(navigationData);
    
    return {
      root: navigationData,
      categories,
      totalPages: countTotalPages(navigationData),
      depth: params.depth,
      lastUpdated: new Date(),
      language: params.language,
    };
  } catch (error) {
    throw new KrdsError(
      'NAVIGATION_ERROR',
      'Failed to build navigation tree',
      error as Error,
      { maxDepth: params.depth }
    );
  }
}

/**
 * List all available categories
 */
async function listCategories(
  crawler: NavigationCrawler,
  params: z.infer<typeof NavigationSchema>,
  logger: any
): Promise<NavigationCategory[]> {
  logger.debug('Listing categories');
  
  try {
    const categories = await crawler.discoverCategories({
      includeSubcategories: true,
      includePageCounts: true,
      maxResults: params.maxResults,
      timeout: params.timeout,
    });
    
    return categories.map(mapToNavigationCategory);
  } catch (error) {
    throw new KrdsError(
      'NAVIGATION_ERROR',
      'Failed to list categories',
      error as Error
    );
  }
}

/**
 * Browse specific category content
 */
async function browseCategory(
  crawler: NavigationCrawler,
  params: z.infer<typeof NavigationSchema>,
  logger: any
): Promise<{
  category: NavigationCategory;
  pages: NavigationPage[];
  subcategories: NavigationCategory[];
}> {
  logger.debug('Browsing category', { category: params.category });
  
  try {
    const categoryData = await crawler.browseCategoryContent(params.category!, {
      includeSubcategories: true,
      includePages: true,
      maxPages: params.maxResults,
      subcategory: params.subcategory,
      timeout: params.timeout,
    });
    
    const pages = categoryData.pages?.map(mapToNavigationPage) || [];
    const subcategories = categoryData.subcategories?.map(mapToNavigationCategory) || [];
    
    return {
      category: mapToNavigationCategory(categoryData),
      pages,
      subcategories,
    };
  } catch (error) {
    throw new KrdsError(
      'NAVIGATION_ERROR',
      `Failed to browse category: ${params.category}`,
      error as Error,
      { category: params.category, subcategory: params.subcategory }
    );
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique request ID for logging and tracing
 */
function generateRequestId(): string {
  return `nav_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a cache key for navigation parameters
 */
function generateNavigationCacheKey(params: z.infer<typeof NavigationSchema>): string {
  const keyComponents = [
    'krds_navigation',
    params.action,
    params.category || '',
    params.subcategory || '',
    params.depth || 3,
    params.maxResults || 100,
    params.language || 'both',
  ];
  
  return keyComponents.join('|');
}

/**
 * Extract categories from navigation data
 */
function extractCategories(navigationNode: NavigationNode): NavigationCategory[] {
  const categories: NavigationCategory[] = [];
  
  function traverse(node: NavigationNode) {
    if (node.type === 'category') {
      categories.push(mapToNavigationCategory(node));
    }
    
    if (node.children) {
      node.children.forEach(traverse);
    }
  }
  
  traverse(navigationNode);
  return categories;
}

/**
 * Count total pages in navigation tree
 */
function countTotalPages(navigationNode: NavigationNode): number {
  let count = 0;
  
  function traverse(node: NavigationNode) {
    if (node.type === 'page') {
      count++;
    }
    
    if (node.children) {
      node.children.forEach(traverse);
    }
  }
  
  traverse(navigationNode);
  return count;
}

/**
 * Map navigation node to category
 */
function mapToNavigationCategory(node: any): NavigationCategory {
  return {
    name: node.name || node.title,
    nameKorean: node.nameKorean || node.titleKorean,
    url: node.url,
    count: node.pageCount,
    description: node.description,
    descriptionKorean: node.descriptionKorean,
    subcategories: node.subcategories?.map(mapToNavigationCategory),
    pages: node.pages?.map(mapToNavigationPage),
  };
}

/**
 * Map navigation node to page
 */
function mapToNavigationPage(node: any): NavigationPage {
  return {
    title: node.title,
    titleKorean: node.titleKorean,
    url: node.url,
    category: node.category,
    subcategory: node.subcategory,
    lastModified: node.lastModified ? new Date(node.lastModified) : undefined,
    documentType: node.documentType,
    agency: node.agency,
    description: node.description,
  };
}

/**
 * Format navigation result for display
 */
function formatNavigationResult(
  result: any, 
  action: string, 
  fromCache: boolean
): string {
  let output = `# KRDS Navigation Result ${fromCache ? '(Cached)' : ''}\n\n`;
  output += `**Action:** ${action}\n\n`;
  
  switch (action) {
    case 'get_navigation_tree':
      output += formatNavigationTree(result);
      break;
      
    case 'list_categories':
      output += formatCategoriesList(result);
      break;
      
    case 'browse_category':
      output += formatCategoryBrowse(result);
      break;
      
    default:
      output += `**Error:** Unsupported action type\n`;
  }
  
  output += `\n---\n\n`;
  output += `*Generated on ${new Date().toISOString().split('T')[0]}*\n`;
  
  return output;
}

/**
 * Format navigation tree for display
 */
function formatNavigationTree(tree: NavigationTree): string {
  let output = `## Navigation Tree\n\n`;
  output += `**Summary:**\n`;
  output += `- Total Categories: ${tree.categories.length}\n`;
  output += `- Total Pages: ${tree.totalPages}\n`;
  output += `- Tree Depth: ${tree.depth}\n`;
  output += `- Language: ${tree.language}\n`;
  output += `- Last Updated: ${tree.lastUpdated.toISOString().split('T')[0]}\n\n`;
  
  output += `**Categories:**\n\n`;
  
  tree.categories.forEach((category, index) => {
    output += `### ${index + 1}. ${category.name}`;
    if (category.nameKorean && category.nameKorean !== category.name) {
      output += ` (${category.nameKorean})`;
    }
    output += `\n`;
    
    if (category.url) {
      output += `- **URL:** ${category.url}\n`;
    }
    
    if (category.count !== undefined) {
      output += `- **Page Count:** ${category.count}\n`;
    }
    
    if (category.description) {
      output += `- **Description:** ${category.description}\n`;
    }
    
    if (category.subcategories && category.subcategories.length > 0) {
      output += `- **Subcategories:** ${category.subcategories.length}\n`;
      category.subcategories.forEach((sub, subIndex) => {
        output += `  ${subIndex + 1}. ${sub.name}`;
        if (sub.nameKorean && sub.nameKorean !== sub.name) {
          output += ` (${sub.nameKorean})`;
        }
        if (sub.count) {
          output += ` - ${sub.count} pages`;
        }
        output += `\n`;
      });
    }
    
    output += `\n`;
  });
  
  return output;
}

/**
 * Format categories list for display
 */
function formatCategoriesList(categories: NavigationCategory[]): string {
  let output = `## Categories (${categories.length})\n\n`;
  
  categories.forEach((category, index) => {
    output += `### ${index + 1}. ${category.name}`;
    if (category.nameKorean && category.nameKorean !== category.name) {
      output += ` (${category.nameKorean})`;
    }
    output += `\n`;
    
    if (category.url) {
      output += `- **URL:** ${category.url}\n`;
    }
    
    if (category.count !== undefined) {
      output += `- **Documents:** ${category.count}\n`;
    }
    
    if (category.description) {
      output += `- **Description:** ${category.description}\n`;
    }
    
    if (category.subcategories && category.subcategories.length > 0) {
      output += `- **Subcategories (${category.subcategories.length}):**\n`;
      category.subcategories.forEach((sub, subIndex) => {
        output += `  - ${sub.name}`;
        if (sub.nameKorean && sub.nameKorean !== sub.name) {
          output += ` (${sub.nameKorean})`;
        }
        if (sub.count) {
          output += ` - ${sub.count} docs`;
        }
        output += `\n`;
      });
    }
    
    output += `\n`;
  });
  
  return output;
}

/**
 * Format category browse result for display
 */
function formatCategoryBrowse(browseResult: any): string {
  const { category, pages, subcategories } = browseResult;
  
  let output = `## Category: ${category.name}`;
  if (category.nameKorean && category.nameKorean !== category.name) {
    output += ` (${category.nameKorean})`;
  }
  output += `\n\n`;
  
  if (category.description) {
    output += `**Description:** ${category.description}\n\n`;
  }
  
  if (category.url) {
    output += `**URL:** ${category.url}\n\n`;
  }
  
  // Subcategories
  if (subcategories && subcategories.length > 0) {
    output += `### Subcategories (${subcategories.length})\n\n`;
    subcategories.forEach((sub: NavigationCategory, index: number) => {
      output += `${index + 1}. **${sub.name}**`;
      if (sub.nameKorean && sub.nameKorean !== sub.name) {
        output += ` (${sub.nameKorean})`;
      }
      if (sub.count) {
        output += ` - ${sub.count} documents`;
      }
      output += `\n`;
      
      if (sub.url) {
        output += `   - URL: ${sub.url}\n`;
      }
      
      if (sub.description) {
        output += `   - Description: ${sub.description}\n`;
      }
      
      output += `\n`;
    });
  }
  
  // Pages
  if (pages && pages.length > 0) {
    output += `### Documents (${pages.length})\n\n`;
    pages.forEach((page: NavigationPage, index: number) => {
      output += `${index + 1}. **${page.title}**`;
      if (page.titleKorean && page.titleKorean !== page.title) {
        output += ` (${page.titleKorean})`;
      }
      output += `\n`;
      
      output += `   - **URL:** ${page.url}\n`;
      
      if (page.agency) {
        output += `   - **Agency:** ${page.agency}\n`;
      }
      
      if (page.documentType) {
        output += `   - **Type:** ${page.documentType}\n`;
      }
      
      if (page.lastModified) {
        output += `   - **Last Modified:** ${page.lastModified.toISOString().split('T')[0]}\n`;
      }
      
      if (page.description) {
        output += `   - **Description:** ${page.description}\n`;
      }
      
      output += `\n`;
    });
  }
  
  return output;
}

// ============================================================================
// Exports
// ============================================================================

export { NavigationSchema };
export type { NavigationParams, NavigationCategory, NavigationPage, NavigationTree };