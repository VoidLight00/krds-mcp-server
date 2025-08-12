/**
 * Design System MCP Tools for KRDS
 * 
 * This module provides MCP tools for extracting and analyzing design system
 * information from the Korean government KRDS website. It enables developers
 * to create government-style interfaces that follow KRDS design guidelines.
 * 
 * Tools provided:
 * - analyze-design-system: Comprehensive design system analysis
 * - extract-components: Extract specific UI component patterns
 * - get-design-tokens: Retrieve design tokens and CSS variables
 * - generate-code-snippet: Generate reusable code snippets
 * - create-interface: Create new interfaces based on KRDS patterns
 * - analyze-accessibility: Analyze accessibility features
 * - export-design-system: Export design system as JSON/CSS
 * 
 * @author KRDS MCP Server Team
 * @version 1.0.0
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { DesignSystemService, ComponentPattern } from '../services/design-system-service.js';
import type { ToolContext } from '../types/index.js';

// Validation schemas
const AnalyzeDesignSystemSchema = z.object({
  pages: z.array(z.string().url()).optional().describe('Specific pages to analyze (optional)'),
  includeAccessibility: z.boolean().default(true).describe('Include accessibility analysis'),
  includeGovernmentStandards: z.boolean().default(true).describe('Include government standards'),
});

const ExtractComponentsSchema = z.object({
  componentType: z.enum([
    'header', 'navigation', 'form', 'table', 'card', 'button', 'modal', 'footer'
  ]).describe('Type of component to extract'),
  selector: z.string().optional().describe('CSS selector to find specific components'),
  includeVariants: z.boolean().default(true).describe('Include component variants'),
});

const GetDesignTokensSchema = z.object({
  type: z.enum(['color', 'spacing', 'typography', 'shadow', 'border', 'size']).optional()
    .describe('Filter tokens by type'),
  category: z.string().optional().describe('Filter tokens by category'),
  search: z.string().optional().describe('Search tokens by name or value'),
});

const GenerateCodeSnippetSchema = z.object({
  componentType: z.enum([
    'header', 'navigation', 'form', 'table', 'card', 'button', 'modal', 'footer'
  ]).describe('Type of component to generate'),
  variant: z.string().optional().describe('Specific variant of the component'),
  framework: z.enum(['html', 'react', 'vue', 'angular']).default('html')
    .describe('Target framework for code generation'),
  includeAccessibility: z.boolean().default(true).describe('Include accessibility features'),
});

const CreateInterfaceSchema = z.object({
  layout: z.enum(['full-page', 'dashboard', 'form', 'list', 'detail'])
    .describe('Type of interface layout'),
  components: z.array(z.string()).describe('Components to include in the interface'),
  theme: z.enum(['default', 'dark', 'high-contrast']).default('default')
    .describe('Theme variant'),
  accessibility: z.boolean().default(true).describe('Include accessibility features'),
  responsive: z.boolean().default(true).describe('Make interface responsive'),
});

const AnalyzeAccessibilitySchema = z.object({
  url: z.string().url().optional().describe('Specific URL to analyze (optional)'),
  includeWcagChecks: z.boolean().default(true).describe('Include WCAG compliance checks'),
  includeColorContrast: z.boolean().default(true).describe('Include color contrast analysis'),
});

const ExportDesignSystemSchema = z.object({
  format: z.enum(['json', 'css', 'scss', 'figma-tokens']).default('json')
    .describe('Export format'),
  includeDocumentation: z.boolean().default(true).describe('Include documentation'),
  minified: z.boolean().default(false).describe('Minify output'),
});

// Helper function to generate request IDs
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Register all design system tools with the MCP server
 */
export async function registerDesignSystemTools(
  server: Server,
  context: ToolContext
): Promise<void> {
  const { logger, cacheManager, krdsService } = context;
  
  // Initialize design system service
  const designSystemService = new DesignSystemService({
    logger: logger.child({ module: 'design-system-tools' }),
    cacheManager,
    krdsService,
  });

  // Register tool handler for all design system tools
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    // Check if this request is for one of our design system tools
    const toolName = request.params.name;
    const designSystemTools = [
      'analyze-design-system',
      'extract-components',
      'get-design-tokens',
      'generate-code-snippet',
      'create-interface',
      'analyze-accessibility',
      'export-design-system'
    ];
    
    if (!designSystemTools.includes(toolName)) {
      return; // Not our tool, let other handlers deal with it
    }

    const toolLogger = logger.child({ 
      tool: toolName, 
      requestId: generateRequestId() 
    });
    
    toolLogger.info(`Processing ${toolName} request`);

    try {
      switch (toolName) {
        case 'analyze-design-system': {
          const params = AnalyzeDesignSystemSchema.parse(request.params.arguments);
          const { pages, includeAccessibility, includeGovernmentStandards } = params;
          
          toolLogger.info('Analyzing KRDS design system', {
            pages: pages?.length || 0,
            includeAccessibility,
            includeGovernmentStandards,
          });

          const analysis = await designSystemService.analyzeDesignSystem(pages);

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                data: {
                  metadata: analysis.metadata,
                  summary: {
                    designTokens: analysis.designTokens.length,
                    components: analysis.components.length,
                    layoutPatterns: analysis.layoutPatterns.length,
                  },
                  designTokens: analysis.designTokens,
                  colorScheme: analysis.colorScheme,
                  typography: analysis.typography,
                  spacing: analysis.spacing,
                  components: analysis.components.map(c => ({
                    name: c.name,
                    type: c.type,
                    description: c.description,
                    variants: c.variants.length,
                    hasAccessibility: Object.keys(c.accessibility).length > 0,
                  })),
                  layoutPatterns: analysis.layoutPatterns,
                  governmentStandards: includeGovernmentStandards ? analysis.governmentStandards : undefined,
                },
                message: `Successfully analyzed KRDS design system with ${analysis.components.length} components and ${analysis.designTokens.length} design tokens`,
              }, null, 2)
            }]
          };
        }

        case 'extract-components': {
          const params = ExtractComponentsSchema.parse(request.params.arguments);
          const { componentType, selector, includeVariants } = params;

          toolLogger.info('Extracting KRDS components', {
            componentType,
            selector,
            includeVariants,
          });

          const patterns = await designSystemService.extractComponentPattern(componentType, selector);

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                data: {
                  componentType,
                  patterns: patterns.map(pattern => ({
                    name: pattern.name,
                    description: pattern.description,
                    html: pattern.html,
                    css: pattern.css,
                    javascript: pattern.javascript,
                    variants: includeVariants ? pattern.variants : [],
                    accessibility: pattern.accessibility,
                    usage: pattern.usage,
                    designTokens: pattern.designTokens,
                  })),
                  total: patterns.length,
                },
                message: `Extracted ${patterns.length} ${componentType} patterns from KRDS website`,
              }, null, 2)
            }]
          };
        }

        case 'get-design-tokens': {
          const params = GetDesignTokensSchema.parse(request.params.arguments);
          const { type, category, search } = params;

          toolLogger.info('Retrieving KRDS design tokens', { type, category, search });

          const tokens = await designSystemService.getDesignTokens({ type, category, search });

          const groupedTokens = tokens.reduce((acc, token) => {
            if (!acc[token.type]) acc[token.type] = [];
            acc[token.type].push(token);
            return acc;
          }, {} as Record<string, typeof tokens>);

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                data: {
                  tokens,
                  groupedTokens,
                  summary: {
                    total: tokens.length,
                    byType: Object.fromEntries(
                      Object.entries(groupedTokens).map(([type, tokens]) => [type, tokens.length])
                    ),
                  },
                },
                message: `Retrieved ${tokens.length} design tokens from KRDS website`,
              }, null, 2)
            }]
          };
        }

        case 'generate-code-snippet': {
          const params = GenerateCodeSnippetSchema.parse(request.params.arguments);
          const { componentType, variant, framework, includeAccessibility } = params;

          toolLogger.info('Generating KRDS code snippet', {
            componentType,
            variant,
            framework,
            includeAccessibility,
          });

          const codeSnippet = await designSystemService.generateCodeSnippet(
            componentType,
            variant,
            framework
          );

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                data: {
                  componentType,
                  variant,
                  framework,
                  code: codeSnippet,
                  usage: {
                    description: `${componentType} component based on KRDS design patterns`,
                    installation: framework === 'html' ? 
                      'Include the CSS and HTML in your project' : 
                      `Install dependencies for ${framework} framework`,
                    examples: [
                      'Use in government websites',
                      'Follow KRDS accessibility guidelines',
                      'Maintain consistent branding',
                    ],
                  },
                },
                message: `Generated ${framework} code snippet for KRDS ${componentType} component`,
              }, null, 2)
            }]
          };
        }

        case 'create-interface': {
          const params = CreateInterfaceSchema.parse(request.params.arguments);
          const { layout, components, theme, accessibility, responsive } = params;

          toolLogger.info('Creating KRDS-based interface', {
            layout,
            components: components.length,
            theme,
            accessibility,
            responsive,
          });

          const interfaceCode = await designSystemService.createInterface({
            layout,
            components,
            theme,
            accessibility,
          });

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                data: {
                  layout,
                  theme,
                  components,
                  code: interfaceCode,
                  guidelines: {
                    accessibility: accessibility ? [
                      'Follows WCAG 2.1 AA standards',
                      'Includes proper ARIA labels',
                      'Supports keyboard navigation',
                      'Maintains color contrast ratios',
                    ] : [],
                    government: [
                      'Adheres to Korean government web standards',
                      'Uses official KRDS design tokens',
                      'Follows government branding guidelines',
                      'Implements required accessibility features',
                    ],
                    responsive: responsive ? [
                      'Mobile-first design approach',
                      'Flexible grid system',
                      'Scalable typography',
                      'Touch-friendly interactions',
                    ] : [],
                  },
                },
                message: `Created ${layout} interface with ${components.length} KRDS components`,
              }, null, 2)
            }]
          };
        }

        case 'analyze-accessibility': {
          const params = AnalyzeAccessibilitySchema.parse(request.params.arguments);
          const { url, includeWcagChecks, includeColorContrast } = params;

          toolLogger.info('Analyzing KRDS accessibility', {
            url,
            includeWcagChecks,
            includeColorContrast,
          });

          // For now, return analysis from the main design system
          const analysis = await designSystemService.analyzeDesignSystem();
          const accessibilityReport = analysis.governmentStandards.accessibility;

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                data: {
                  wcagCompliance: {
                    level: accessibilityReport.wcagLevel,
                    compliance: accessibilityReport.compliance,
                    requirements: accessibilityReport.requirements,
                  },
                  componentAccessibility: analysis.components.map(c => ({
                    name: c.name,
                    type: c.type,
                    accessibility: c.accessibility,
                  })),
                  recommendations: [
                    'Ensure all interactive elements have focus indicators',
                    'Provide alternative text for images',
                    'Maintain proper heading hierarchy',
                    'Use sufficient color contrast ratios',
                    'Implement keyboard navigation',
                  ],
                },
                message: `Analyzed accessibility compliance for KRDS design system`,
              }, null, 2)
            }]
          };
        }

        case 'export-design-system': {
          const params = ExportDesignSystemSchema.parse(request.params.arguments);
          const { format, includeDocumentation, minified } = params;

          toolLogger.info('Exporting KRDS design system', {
            format,
            includeDocumentation,
            minified,
          });

          const analysis = await designSystemService.analyzeDesignSystem();
          let exportedContent: string;
          let contentType: string;

          switch (format) {
            case 'json':
              exportedContent = JSON.stringify(analysis, null, minified ? 0 : 2);
              contentType = 'application/json';
              break;
            
            case 'css':
              exportedContent = generateCSSExport(analysis, minified);
              contentType = 'text/css';
              break;
            
            case 'scss':
              exportedContent = generateSCSSExport(analysis, minified);
              contentType = 'text/scss';
              break;
            
            case 'figma-tokens':
              exportedContent = generateFigmaTokensExport(analysis);
              contentType = 'application/json';
              break;
            
            default:
              exportedContent = JSON.stringify(analysis, null, 2);
              contentType = 'application/json';
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                data: {
                  format,
                  contentType,
                  content: exportedContent,
                  size: exportedContent.length,
                  summary: {
                    designTokens: analysis.designTokens.length,
                    components: analysis.components.length,
                    pages: analysis.metadata.pages.length,
                  },
                  usage: {
                    description: `KRDS design system exported in ${format} format`,
                    installation: getInstallationInstructions(format),
                    documentation: includeDocumentation ? generateDocumentation(analysis) : undefined,
                  },
                },
                message: `Exported KRDS design system in ${format} format (${exportedContent.length} characters)`,
              }, null, 2)
            }]
          };
        }

        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown design system tool: ${toolName}`
          );
      }
    } catch (error) {
      toolLogger.error(`Error in ${toolName}:`, error);
      
      if (error instanceof z.ZodError) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
        );
      }
      
      throw new McpError(
        ErrorCode.InternalError,
        `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  });

  logger.info('Design system tools registered successfully', {
    tools: [
      'analyze-design-system',
      'extract-components', 
      'get-design-tokens',
      'generate-code-snippet',
      'create-interface',
      'analyze-accessibility',
      'export-design-system'
    ]
  });
}

// Helper functions

function generateCSSExport(analysis: any, minified: boolean): string {
  const indent = minified ? '' : '  ';
  const newline = minified ? '' : '\n';
  
  let css = `:root {${newline}`;
  
  for (const token of analysis.designTokens) {
    if (token.cssVariable) {
      css += `${indent}${token.cssVariable}: ${token.value};${newline}`;
    }
  }
  
  css += `}${newline}`;
  
  // Add component styles
  for (const component of analysis.components) {
    css += `${newline}/* ${component.name} Component */${newline}`;
    css += component.css + newline;
  }
  
  return css;
}

function generateSCSSExport(analysis: any, minified: boolean): string {
  const indent = minified ? '' : '  ';
  const newline = minified ? '' : '\n';
  
  let scss = `// KRDS Design System - SCSS Export${newline}${newline}`;
  
  // SCSS variables
  scss += `// Design Tokens${newline}`;
  for (const token of analysis.designTokens) {
    const scssVar = `$krds-${token.name.replace(/[^a-zA-Z0-9]/g, '-')}`;
    scss += `${scssVar}: ${token.value};${newline}`;
  }
  
  scss += `${newline}// CSS Custom Properties${newline}`;
  scss += `:root {${newline}`;
  
  for (const token of analysis.designTokens) {
    if (token.cssVariable) {
      const scssVar = `$krds-${token.name.replace(/[^a-zA-Z0-9]/g, '-')}`;
      scss += `${indent}${token.cssVariable}: #{${scssVar}};${newline}`;
    }
  }
  
  scss += `}${newline}`;
  
  return scss;
}

function generateFigmaTokensExport(analysis: any): string {
  const figmaTokens = {
    color: {},
    spacing: {},
    typography: {},
    dimension: {},
  };
  
  for (const token of analysis.designTokens) {
    const category = figmaTokens[token.type as keyof typeof figmaTokens];
    if (category) {
      category[token.name] = {
        value: token.value,
        type: token.type,
        description: token.usage.join(', '),
      };
    }
  }
  
  return JSON.stringify(figmaTokens, null, 2);
}

function getInstallationInstructions(format: string): string[] {
  switch (format) {
    case 'css':
      return [
        'Include the CSS file in your HTML: <link rel="stylesheet" href="krds-design-system.css">',
        'Or import in your CSS: @import "krds-design-system.css";',
      ];
    case 'scss':
      return [
        'Import the SCSS file: @import "krds-design-system.scss";',
        'Compile using your SCSS build process',
      ];
    case 'figma-tokens':
      return [
        'Import into Figma using the Design Tokens plugin',
        'Apply tokens to your Figma design system',
      ];
    default:
      return [
        'Use the JSON data in your project',
        'Parse and apply design tokens programmatically',
      ];
  }
}

function generateDocumentation(analysis: any): string {
  return `# KRDS Design System Documentation

This design system was extracted from the Korean government KRDS website and includes government-approved patterns and components.

## Design Tokens
- ${analysis.designTokens.length} design tokens
- Colors, typography, spacing, and more
- CSS custom properties for easy implementation

## Components
- ${analysis.components.length} component patterns
- Government-approved UI patterns
- Accessibility-compliant implementations

## Usage
Follow Korean government web standards and accessibility guidelines when using these patterns.

Generated on: ${analysis.metadata.analyzedAt}
Version: ${analysis.metadata.version}
`;
}

// Export the registration function and schemas
export {
  AnalyzeDesignSystemSchema,
  ExtractComponentsSchema,
  GetDesignTokensSchema,
  GenerateCodeSnippetSchema,
  CreateInterfaceSchema,
  AnalyzeAccessibilitySchema,
  ExportDesignSystemSchema,
};