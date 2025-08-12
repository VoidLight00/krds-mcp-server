/**
 * KRDS MCP Tools - Central Export Module
 * 
 * This module provides a centralized export point for all MCP tools in the
 * KRDS server. It includes comprehensive tools for searching, content retrieval,
 * navigation, image processing, export functionality, and Korean text processing.
 * 
 * Available Tools:
 * ================
 * 1. Search Tool - Comprehensive search with Korean language support
 * 2. Content Retrieval Tool - Get complete document content with metadata
 * 3. Navigation Tool - Explore site structure and discover content
 * 4. Image Tools - Process and analyze images from KRDS documents
 * 5. Export Tool - Export documents in various formats (PDF, JSON, etc.)
 * 6. Korean Text Tool - Advanced Korean text processing and analysis
 * 
 * @author KRDS MCP Server
 * @version 1.0.0
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { ToolContext } from '../types/index.js';

// Import all tool registration functions
import { registerSearchTool } from './search.js';
import { registerContentRetrievalTool } from './content-retrieval.js';
import { registerNavigationTool } from './navigation.js';
import { registerImageToolsTool } from './image-tools.js';
import { registerExportTool } from './export.js';
import { registerKoreanTextTool } from './korean-text.js';

// Export individual tool schemas for type checking
export { SearchToolSchema } from './search.js';
export { ContentRetrievalSchema } from './content-retrieval.js';
export { NavigationSchema } from './navigation.js';
export { ImageToolsSchema } from './image-tools.js';
export { ExportSchema } from './export.js';
export { KoreanTextSchema } from './korean-text.js';

// Export types for external use
export type { SearchParams } from './search.js';
export type { ContentRetrievalParams } from './content-retrieval.js';
export type { NavigationParams } from './navigation.js';
export type { ImageToolParams } from './image-tools.js';
export type { ExportParams } from './export.js';

// Tool registration information
export interface ToolRegistration {
  name: string;
  description: string;
  version: string;
  categories: string[];
  dependencies: string[];
  registerFunction: (server: Server, context: ToolContext) => Promise<void>;
}

/**
 * Registry of all available MCP tools
 */
export const TOOL_REGISTRY: ToolRegistration[] = [
  {
    name: 'krds_search',
    description: 'Search KRDS website for Korean government records and documents',
    version: '1.0.0',
    categories: ['search', 'content-discovery'],
    dependencies: ['krdsService', 'cacheManager'],
    registerFunction: registerSearchTool,
  },
  {
    name: 'krds_content_retrieval',
    description: 'Retrieve complete content from specific KRDS documents including images and attachments',
    version: '1.0.0',
    categories: ['content', 'document-processing'],
    dependencies: ['krdsService', 'scraper', 'parser'],
    registerFunction: registerContentRetrievalTool,
  },
  {
    name: 'krds_navigation',
    description: 'Navigate and explore KRDS website structure, categories, and content organization',
    version: '1.0.0',
    categories: ['navigation', 'site-structure'],
    dependencies: ['navigationCrawler'],
    registerFunction: registerNavigationTool,
  },
  {
    name: 'krds_image_tools',
    description: 'Extract, process, and analyze images from KRDS documents with Korean text support',
    version: '1.0.0',
    categories: ['image-processing', 'ocr', 'media'],
    dependencies: ['imageExtractor', 'koreanTextProcessor'],
    registerFunction: registerImageToolsTool,
  },
  {
    name: 'krds_export',
    description: 'Export KRDS documents in various formats (PDF, JSON, CSV, Excel, Markdown, HTML)',
    version: '1.0.0',
    categories: ['export', 'data-transformation'],
    dependencies: ['krdsService'],
    registerFunction: registerExportTool,
  },
  {
    name: 'krds_korean_text',
    description: 'Process and analyze Korean text with specialized support for government documents',
    version: '1.0.0',
    categories: ['text-processing', 'korean-language', 'nlp'],
    dependencies: ['koreanTextProcessor'],
    registerFunction: registerKoreanTextTool,
  },
];

/**
 * Register all MCP tools with the server
 * 
 * @param server - MCP server instance
 * @param context - Tool execution context
 * @returns Promise that resolves when all tools are registered
 */
export async function registerAllTools(
  server: Server,
  context: ToolContext
): Promise<void> {
  const { logger } = context;
  
  logger.info('Registering MCP tools', {
    toolCount: TOOL_REGISTRY.length,
    tools: TOOL_REGISTRY.map(tool => tool.name)
  });
  
  const registrationPromises = TOOL_REGISTRY.map(async (tool) => {
    try {
      logger.debug('Registering tool', {
        name: tool.name,
        version: tool.version,
        categories: tool.categories
      });
      
      await tool.registerFunction(server, context);
      
      logger.info('Tool registered successfully', {
        name: tool.name,
        description: tool.description
      });
      
      return { tool: tool.name, success: true };
    } catch (error) {
      logger.error('Tool registration failed', {
        tool: tool.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return { tool: tool.name, success: false, error };
    }
  });
  
  const results = await Promise.all(registrationPromises);
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  logger.info('Tool registration completed', {
    total: TOOL_REGISTRY.length,
    successful: successful.length,
    failed: failed.length,
    successfulTools: successful.map(r => r.tool),
    failedTools: failed.map(r => r.tool)
  });
  
  if (failed.length > 0) {
    logger.warn('Some tools failed to register', {
      failedCount: failed.length,
      failedTools: failed.map(r => ({ tool: r.tool, error: r.error }))
    });
  }
}

/**
 * Get information about available tools
 * 
 * @returns Array of tool information
 */
export function getAvailableTools(): Array<{
  name: string;
  description: string;
  version: string;
  categories: string[];
}> {
  return TOOL_REGISTRY.map(tool => ({
    name: tool.name,
    description: tool.description,
    version: tool.version,
    categories: tool.categories,
  }));
}

/**
 * Get tools by category
 * 
 * @param category - Category to filter by
 * @returns Array of tools in the specified category
 */
export function getToolsByCategory(category: string): ToolRegistration[] {
  return TOOL_REGISTRY.filter(tool => 
    tool.categories.includes(category)
  );
}

/**
 * Get tool by name
 * 
 * @param name - Tool name to find
 * @returns Tool registration or undefined if not found
 */
export function getToolByName(name: string): ToolRegistration | undefined {
  return TOOL_REGISTRY.find(tool => tool.name === name);
}

/**
 * Validate tool dependencies
 * 
 * @param context - Tool execution context
 * @returns Validation results for each tool
 */
export function validateToolDependencies(context: ToolContext): Array<{
  tool: string;
  valid: boolean;
  missingDependencies: string[];
}> {
  return TOOL_REGISTRY.map(tool => {
    const missingDependencies: string[] = [];
    
    tool.dependencies.forEach(dep => {
      // Check if dependency exists in context
      if (dep === 'krdsService' && !context.krdsService) {
        missingDependencies.push(dep);
      } else if (dep === 'cacheManager' && !context.cacheManager) {
        missingDependencies.push(dep);
      } else if (dep === 'logger' && !context.logger) {
        missingDependencies.push(dep);
      } else if (dep === 'config' && !context.config) {
        missingDependencies.push(dep);
      }
      // Add more dependency checks as needed
    });
    
    return {
      tool: tool.name,
      valid: missingDependencies.length === 0,
      missingDependencies,
    };
  });
}

/**
 * Tool configuration and metadata
 */
export const TOOLS_CONFIG = {
  version: '1.0.0',
  totalTools: TOOL_REGISTRY.length,
  categories: [
    'search',
    'content-discovery',
    'content',
    'document-processing',
    'navigation',
    'site-structure',
    'image-processing',
    'ocr',
    'media',
    'export',
    'data-transformation',
    'text-processing',
    'korean-language',
    'nlp',
  ],
  supportedLanguages: ['ko', 'en'],
  supportedFormats: ['json', 'csv', 'xlsx', 'pdf', 'xml', 'markdown', 'html'],
  features: [
    'Korean text processing',
    'Government document analysis',
    'Multi-format export',
    'Image OCR and processing',
    'Site navigation discovery',
    'Content caching',
    'Semantic search',
    'Metadata extraction',
  ],
} as const;

/**
 * Health check for all registered tools
 * 
 * @param context - Tool execution context
 * @returns Health status for each tool
 */
export async function checkToolsHealth(context: ToolContext): Promise<Array<{
  tool: string;
  healthy: boolean;
  dependencies: string[];
  status: string;
}>> {
  const { logger } = context;
  
  logger.debug('Performing tools health check');
  
  const healthChecks = TOOL_REGISTRY.map(async (tool) => {
    try {
      // Validate dependencies
      const dependencyValidation = validateToolDependencies(context);
      const toolValidation = dependencyValidation.find(v => v.tool === tool.name);
      
      if (!toolValidation?.valid) {
        return {
          tool: tool.name,
          healthy: false,
          dependencies: tool.dependencies,
          status: `Missing dependencies: ${toolValidation?.missingDependencies.join(', ')}`,
        };
      }
      
      // Tool is healthy if dependencies are satisfied
      return {
        tool: tool.name,
        healthy: true,
        dependencies: tool.dependencies,
        status: 'Ready',
      };
      
    } catch (error) {
      return {
        tool: tool.name,
        healthy: false,
        dependencies: tool.dependencies,
        status: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  });
  
  const results = await Promise.all(healthChecks);
  
  logger.info('Tools health check completed', {
    total: results.length,
    healthy: results.filter(r => r.healthy).length,
    unhealthy: results.filter(r => !r.healthy).length,
  });
  
  return results;
}

/**
 * Generate tool usage statistics
 * 
 * @param context - Tool execution context
 * @returns Usage statistics for tools
 */
export function generateToolsStats(): {
  totalTools: number;
  categories: Record<string, number>;
  dependencies: Record<string, number>;
  versions: Record<string, number>;
} {
  const categories: Record<string, number> = {};
  const dependencies: Record<string, number> = {};
  const versions: Record<string, number> = {};
  
  TOOL_REGISTRY.forEach(tool => {
    // Count categories
    tool.categories.forEach(category => {
      categories[category] = (categories[category] || 0) + 1;
    });
    
    // Count dependencies
    tool.dependencies.forEach(dep => {
      dependencies[dep] = (dependencies[dep] || 0) + 1;
    });
    
    // Count versions
    versions[tool.version] = (versions[tool.version] || 0) + 1;
  });
  
  return {
    totalTools: TOOL_REGISTRY.length,
    categories,
    dependencies,
    versions,
  };
}