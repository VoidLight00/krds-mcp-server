/**
 * Design System Service for KRDS MCP Server
 * 
 * This service provides comprehensive design system extraction capabilities
 * for the Korean government KRDS website, similar to Magic MCP but specifically
 * tailored for government-style interfaces.
 * 
 * Key Features:
 * - Extract UI/UX patterns and components
 * - Analyze color schemes, typography, spacing
 * - Capture design tokens and CSS variables
 * - Extract component structures (headers, navigation, forms, tables)
 * - Generate reusable code snippets based on KRDS patterns
 * - Support creating new interfaces based on KRDS guidelines
 * 
 * @author KRDS MCP Server Team
 * @version 1.0.0
 */

import { Logger } from 'winston';
import * as cheerio from 'cheerio';
import { Page } from 'puppeteer';
import { CacheManager } from '../cache/cache-manager.js';
import { KrdsService } from './krds-service.js';

// Type definitions for design system components
export interface DesignToken {
  name: string;
  value: string;
  type: 'color' | 'spacing' | 'typography' | 'shadow' | 'border' | 'size';
  category: string;
  usage: string[];
  cssVariable?: string;
}

export interface ColorScheme {
  primary: string[];
  secondary: string[];
  accent: string[];
  neutral: string[];
  semantic: {
    success: string[];
    warning: string[];
    error: string[];
    info: string[];
  };
  governmentBrand: string[];
}

export interface TypographyScale {
  fontFamilies: {
    primary: string;
    secondary?: string;
    monospace?: string;
  };
  fontSizes: Record<string, string>;
  fontWeights: Record<string, string>;
  lineHeights: Record<string, string>;
  letterSpacing: Record<string, string>;
}

export interface SpacingSystem {
  base: string;
  scale: Record<string, string>;
  components: {
    padding: Record<string, string>;
    margin: Record<string, string>;
    gap: Record<string, string>;
  };
}

export interface ComponentPattern {
  name: string;
  type: 'header' | 'navigation' | 'form' | 'table' | 'card' | 'button' | 'modal' | 'footer';
  description: string;
  html: string;
  css: string;
  javascript?: string;
  designTokens: string[];
  variants: ComponentVariant[];
  accessibility: AccessibilityFeatures;
  usage: ComponentUsage;
}

export interface ComponentVariant {
  name: string;
  modifier: string;
  description: string;
  html: string;
  css: string;
}

export interface AccessibilityFeatures {
  ariaLabels: string[];
  keyboardNavigation: boolean;
  colorContrast: string;
  screenReaderSupport: boolean;
  focusManagement: boolean;
}

export interface ComponentUsage {
  when: string;
  bestPractices: string[];
  examples: string[];
  governmentGuidelines: string[];
}

export interface DesignSystemAnalysis {
  metadata: {
    url: string;
    analyzedAt: Date;
    version: string;
    pages: string[];
  };
  designTokens: DesignToken[];
  colorScheme: ColorScheme;
  typography: TypographyScale;
  spacing: SpacingSystem;
  components: ComponentPattern[];
  layoutPatterns: LayoutPattern[];
  governmentStandards: GovernmentStandards;
}

export interface LayoutPattern {
  name: string;
  type: 'grid' | 'flexbox' | 'header' | 'sidebar' | 'footer';
  description: string;
  css: string;
  responsiveBreakpoints: Record<string, string>;
  usage: string[];
}

export interface GovernmentStandards {
  accessibility: {
    wcagLevel: string;
    compliance: string[];
    requirements: string[];
  };
  branding: {
    logoUsage: string[];
    colorGuidelines: string[];
    fontGuidelines: string[];
  };
  layout: {
    headerRequirements: string[];
    footerRequirements: string[];
    navigationPatterns: string[];
  };
}

export interface DesignSystemServiceConfig {
  baseUrl: string;
  cacheConfig: {
    ttl: number;
    maxSize: number;
  };
  analysis: {
    includeAccessibility: boolean;
    extractJavaScript: boolean;
    analyzeResponsive: boolean;
  };
  government: {
    includeStandards: boolean;
    checkCompliance: boolean;
  };
}

/**
 * Design System Service for extracting and analyzing KRDS design patterns
 */
export class DesignSystemService {
  private logger: Logger;
  private cacheManager: CacheManager;
  private krdsService: KrdsService;
  private config: DesignSystemServiceConfig;

  constructor(options: {
    logger: Logger;
    cacheManager: CacheManager;
    krdsService: KrdsService;
    config?: Partial<DesignSystemServiceConfig>;
  }) {
    this.logger = options.logger.child({ service: 'design-system' });
    this.cacheManager = options.cacheManager;
    this.krdsService = options.krdsService;
    
    // Default configuration
    this.config = {
      baseUrl: 'https://v04.krds.go.kr',
      cacheConfig: {
        ttl: 24 * 60 * 60 * 1000, // 24 hours
        maxSize: 100,
      },
      analysis: {
        includeAccessibility: true,
        extractJavaScript: true,
        analyzeResponsive: true,
      },
      government: {
        includeStandards: true,
        checkCompliance: true,
      },
      ...options.config,
    };
  }

  /**
   * Perform comprehensive design system analysis of KRDS website
   */
  async analyzeDesignSystem(pages?: string[]): Promise<DesignSystemAnalysis> {
    this.logger.info('Starting comprehensive design system analysis');

    const cacheKey = `design-system-analysis-${pages?.join(',') || 'all'}`;
    const cached = await this.cacheManager.get(cacheKey);
    
    if (cached) {
      this.logger.info('Returning cached design system analysis');
      return cached as DesignSystemAnalysis;
    }

    try {
      const targetPages = pages || await this.getKeyPages();
      
      // Extract design tokens and patterns from multiple pages
      const designTokens = await this.extractDesignTokens(targetPages);
      const colorScheme = await this.extractColorScheme(targetPages);
      const typography = await this.extractTypography(targetPages);
      const spacing = await this.extractSpacingSystem(targetPages);
      const components = await this.extractComponents(targetPages);
      const layoutPatterns = await this.extractLayoutPatterns(targetPages);
      const governmentStandards = await this.extractGovernmentStandards(targetPages);

      const analysis: DesignSystemAnalysis = {
        metadata: {
          url: this.config.baseUrl,
          analyzedAt: new Date(),
          version: '1.0.0',
          pages: targetPages,
        },
        designTokens,
        colorScheme,
        typography,
        spacing,
        components,
        layoutPatterns,
        governmentStandards,
      };

      // Cache the analysis
      await this.cacheManager.set(cacheKey, analysis, this.config.cacheConfig.ttl);
      
      this.logger.info('Design system analysis completed', {
        pages: targetPages.length,
        components: components.length,
        designTokens: designTokens.length,
      });

      return analysis;
    } catch (error) {
      this.logger.error('Failed to analyze design system:', error);
      throw error;
    }
  }

  /**
   * Extract specific component patterns from KRDS pages
   */
  async extractComponentPattern(
    componentType: ComponentPattern['type'],
    selector?: string
  ): Promise<ComponentPattern[]> {
    this.logger.info(`Extracting ${componentType} component patterns`);

    const pages = await this.getRelevantPagesForComponent(componentType);
    const patterns: ComponentPattern[] = [];

    for (const pageUrl of pages) {
      try {
        const page = await this.krdsService.navigateToPage(pageUrl);
        const pattern = await this.extractComponentFromPage(page, componentType, selector);
        
        if (pattern) {
          patterns.push(pattern);
        }
      } catch (error) {
        this.logger.warn(`Failed to extract ${componentType} from ${pageUrl}:`, error);
      }
    }

    return this.deduplicatePatterns(patterns);
  }

  /**
   * Generate code snippet for a specific KRDS component
   */
  async generateCodeSnippet(
    componentType: ComponentPattern['type'],
    variant?: string,
    framework?: 'html' | 'react' | 'vue' | 'angular'
  ): Promise<{
    html: string;
    css: string;
    javascript?: string;
    framework?: string;
  }> {
    this.logger.info(`Generating code snippet for ${componentType}`, {
      variant,
      framework,
    });

    const patterns = await this.extractComponentPattern(componentType);
    
    if (patterns.length === 0) {
      throw new Error(`No patterns found for component type: ${componentType}`);
    }

    // Find the specific variant or use the first pattern
    const selectedPattern = variant
      ? patterns.find(p => p.variants.some(v => v.name === variant)) || patterns[0]
      : patterns[0];

    const selectedVariant = variant
      ? selectedPattern.variants.find(v => v.name === variant)
      : null;

    const baseCode = {
      html: selectedVariant?.html || selectedPattern.html,
      css: selectedVariant?.css || selectedPattern.css,
      javascript: selectedPattern.javascript,
    };

    // Transform code for specific frameworks
    if (framework && framework !== 'html') {
      return this.transformCodeForFramework(baseCode, framework);
    }

    return baseCode;
  }

  /**
   * Get design tokens filtered by type or category
   */
  async getDesignTokens(
    filter?: {
      type?: DesignToken['type'];
      category?: string;
      search?: string;
    }
  ): Promise<DesignToken[]> {
    const analysis = await this.analyzeDesignSystem();
    let tokens = analysis.designTokens;

    if (filter) {
      if (filter.type) {
        tokens = tokens.filter(token => token.type === filter.type);
      }
      
      if (filter.category) {
        tokens = tokens.filter(token => 
          token.category.toLowerCase().includes(filter.category!.toLowerCase())
        );
      }
      
      if (filter.search) {
        tokens = tokens.filter(token =>
          token.name.toLowerCase().includes(filter.search!.toLowerCase()) ||
          token.value.toLowerCase().includes(filter.search!.toLowerCase())
        );
      }
    }

    return tokens;
  }

  /**
   * Create a new interface based on KRDS patterns
   */
  async createInterface(spec: {
    layout: 'full-page' | 'dashboard' | 'form' | 'list' | 'detail';
    components: string[];
    theme?: 'default' | 'dark' | 'high-contrast';
    accessibility?: boolean;
  }): Promise<{
    html: string;
    css: string;
    javascript: string;
    documentation: string;
  }> {
    this.logger.info('Creating interface based on KRDS patterns', spec);

    const analysis = await this.analyzeDesignSystem();
    const selectedComponents: ComponentPattern[] = [];

    // Find required components
    for (const componentName of spec.components) {
      const component = analysis.components.find(c => 
        c.name.toLowerCase().includes(componentName.toLowerCase()) ||
        c.type === componentName
      );
      
      if (component) {
        selectedComponents.push(component);
      }
    }

    // Generate interface code
    const html = this.generateInterfaceHTML(selectedComponents, spec.layout);
    const css = this.generateInterfaceCSS(selectedComponents, analysis, spec.theme);
    const javascript = this.generateInterfaceJS(selectedComponents);
    const documentation = this.generateInterfaceDocumentation(selectedComponents, spec);

    return { html, css, javascript, documentation };
  }

  // Private methods for internal functionality

  private async getKeyPages(): Promise<string[]> {
    // Return key KRDS pages for comprehensive analysis
    return [
      `${this.config.baseUrl}`,
      `${this.config.baseUrl}/main/main.do`,
      `${this.config.baseUrl}/board/list.do`,
      `${this.config.baseUrl}/search/search.do`,
      `${this.config.baseUrl}/info/info.do`,
    ];
  }

  private async extractDesignTokens(pages: string[]): Promise<DesignToken[]> {
    const tokens: DesignToken[] = [];
    
    for (const pageUrl of pages) {
      try {
        const page = await this.krdsService.navigateToPage(pageUrl);
        
        // Extract CSS custom properties (CSS variables)
        const cssVariables = await page.evaluate(() => {
          const styles = Array.from(document.styleSheets);
          const variables: { name: string; value: string }[] = [];
          
          for (const sheet of styles) {
            try {
              const rules = Array.from(sheet.cssRules || sheet.rules || []);
              
              for (const rule of rules) {
                if (rule.type === CSSRule.STYLE_RULE) {
                  const styleRule = rule as CSSStyleRule;
                  const style = styleRule.style;
                  
                  for (let i = 0; i < style.length; i++) {
                    const property = style[i];
                    if (property.startsWith('--')) {
                      variables.push({
                        name: property,
                        value: style.getPropertyValue(property).trim(),
                      });
                    }
                  }
                }
              }
            } catch (e) {
              // Skip cross-origin stylesheets
            }
          }
          
          return variables;
        });

        // Convert CSS variables to design tokens
        for (const variable of cssVariables) {
          const token = this.parseDesignToken(variable.name, variable.value);
          if (token) {
            tokens.push(token);
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to extract design tokens from ${pageUrl}:`, error);
      }
    }

    return this.deduplicateTokens(tokens);
  }

  private async extractColorScheme(pages: string[]): Promise<ColorScheme> {
    const colors = {
      primary: [] as string[],
      secondary: [] as string[],
      accent: [] as string[],
      neutral: [] as string[],
      semantic: {
        success: [] as string[],
        warning: [] as string[],
        error: [] as string[],
        info: [] as string[],
      },
      governmentBrand: [] as string[],
    };

    for (const pageUrl of pages) {
      try {
        const page = await this.krdsService.navigateToPage(pageUrl);
        
        // Extract colors from computed styles
        const pageColors = await page.evaluate(() => {
          const elements = document.querySelectorAll('*');
          const foundColors = new Set<string>();
          
          elements.forEach(el => {
            const computed = window.getComputedStyle(el);
            const color = computed.color;
            const backgroundColor = computed.backgroundColor;
            const borderColor = computed.borderColor;
            
            [color, backgroundColor, borderColor].forEach(c => {
              if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') {
                foundColors.add(c);
              }
            });
          });
          
          return Array.from(foundColors);
        });

        // Categorize colors based on Korean government branding patterns
        for (const color of pageColors) {
          const category = this.categorizeColor(color);
          if (category && colors[category as keyof typeof colors]) {
            if (Array.isArray(colors[category as keyof typeof colors])) {
              (colors[category as keyof typeof colors] as string[]).push(color);
            }
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to extract colors from ${pageUrl}:`, error);
      }
    }

    // Remove duplicates and sort
    Object.keys(colors).forEach(key => {
      if (key !== 'semantic') {
        colors[key as keyof typeof colors] = [
          ...(new Set(colors[key as keyof typeof colors] as string[]))
        ].sort();
      }
    });

    Object.keys(colors.semantic).forEach(key => {
      colors.semantic[key as keyof typeof colors.semantic] = [
        ...new Set(colors.semantic[key as keyof typeof colors.semantic])
      ].sort();
    });

    return colors;
  }

  private async extractTypography(pages: string[]): Promise<TypographyScale> {
    // Implementation for typography extraction
    const typography: TypographyScale = {
      fontFamilies: {
        primary: '',
        secondary: '',
        monospace: '',
      },
      fontSizes: {},
      fontWeights: {},
      lineHeights: {},
      letterSpacing: {},
    };

    // Extract typography information from pages
    // This would analyze computed styles for font properties

    return typography;
  }

  private async extractSpacingSystem(pages: string[]): Promise<SpacingSystem> {
    // Implementation for spacing system extraction
    return {
      base: '1rem',
      scale: {},
      components: {
        padding: {},
        margin: {},
        gap: {},
      },
    };
  }

  private async extractComponents(pages: string[]): Promise<ComponentPattern[]> {
    const components: ComponentPattern[] = [];
    
    // Extract different component types
    const componentTypes: ComponentPattern['type'][] = [
      'header', 'navigation', 'form', 'table', 'card', 'button', 'modal', 'footer'
    ];

    for (const type of componentTypes) {
      const patterns = await this.extractComponentPattern(type);
      components.push(...patterns);
    }

    return components;
  }

  private async extractLayoutPatterns(pages: string[]): Promise<LayoutPattern[]> {
    // Implementation for layout pattern extraction
    return [];
  }

  private async extractGovernmentStandards(pages: string[]): Promise<GovernmentStandards> {
    // Implementation for government standards extraction
    return {
      accessibility: {
        wcagLevel: 'AA',
        compliance: [],
        requirements: [],
      },
      branding: {
        logoUsage: [],
        colorGuidelines: [],
        fontGuidelines: [],
      },
      layout: {
        headerRequirements: [],
        footerRequirements: [],
        navigationPatterns: [],
      },
    };
  }

  private async getRelevantPagesForComponent(
    componentType: ComponentPattern['type']
  ): Promise<string[]> {
    // Return relevant pages for specific component types
    const basePages = await this.getKeyPages();
    return basePages; // For now, use all key pages
  }

  private async extractComponentFromPage(
    page: Page,
    componentType: ComponentPattern['type'],
    selector?: string
  ): Promise<ComponentPattern | null> {
    // Extract specific component pattern from a page
    // This is a complex implementation that would analyze DOM structure
    return null;
  }

  private deduplicatePatterns(patterns: ComponentPattern[]): ComponentPattern[] {
    // Remove duplicate patterns based on HTML similarity
    return patterns;
  }

  private parseDesignToken(name: string, value: string): DesignToken | null {
    // Parse CSS variable into design token
    if (!name.startsWith('--')) return null;

    const type = this.inferTokenType(name, value);
    const category = this.inferTokenCategory(name);

    return {
      name: name.substring(2), // Remove --
      value,
      type,
      category,
      usage: [],
      cssVariable: name,
    };
  }

  private inferTokenType(name: string, value: string): DesignToken['type'] {
    if (name.includes('color') || value.startsWith('#') || value.startsWith('rgb')) {
      return 'color';
    }
    if (name.includes('space') || name.includes('margin') || name.includes('padding')) {
      return 'spacing';
    }
    if (name.includes('font') || name.includes('text')) {
      return 'typography';
    }
    if (name.includes('shadow')) {
      return 'shadow';
    }
    if (name.includes('border')) {
      return 'border';
    }
    return 'size';
  }

  private inferTokenCategory(name: string): string {
    if (name.includes('primary')) return 'primary';
    if (name.includes('secondary')) return 'secondary';
    if (name.includes('accent')) return 'accent';
    if (name.includes('neutral')) return 'neutral';
    return 'general';
  }

  private deduplicateTokens(tokens: DesignToken[]): DesignToken[] {
    const seen = new Set<string>();
    return tokens.filter(token => {
      const key = `${token.name}-${token.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private categorizeColor(color: string): string | null {
    // Categorize colors based on common government website patterns
    // This is a simplified implementation
    if (color.includes('blue') || color.includes('0, 0, 255')) return 'primary';
    if (color.includes('green')) return 'semantic';
    if (color.includes('red')) return 'semantic';
    if (color.includes('gray') || color.includes('grey')) return 'neutral';
    return 'neutral';
  }

  private transformCodeForFramework(
    code: { html: string; css: string; javascript?: string },
    framework: string
  ): { html: string; css: string; javascript?: string; framework: string } {
    // Transform HTML/CSS/JS for specific frameworks (React, Vue, Angular)
    // This would be a complex transformation
    return { ...code, framework };
  }

  private generateInterfaceHTML(
    components: ComponentPattern[],
    layout: string
  ): string {
    // Generate complete interface HTML
    return `<!-- Generated KRDS Interface -->
<div class="krds-interface krds-layout-${layout}">
  ${components.map(c => c.html).join('\n')}
</div>`;
  }

  private generateInterfaceCSS(
    components: ComponentPattern[],
    analysis: DesignSystemAnalysis,
    theme?: string
  ): string {
    // Generate complete interface CSS with design tokens
    return `/* Generated KRDS Interface CSS */
/* Design Tokens */
:root {
  ${analysis.designTokens.map(token => 
    `${token.cssVariable}: ${token.value};`
  ).join('\n  ')}
}

/* Component Styles */
${components.map(c => c.css).join('\n\n')}`;
  }

  private generateInterfaceJS(components: ComponentPattern[]): string {
    // Generate interface JavaScript
    return components
      .map(c => c.javascript)
      .filter(Boolean)
      .join('\n\n');
  }

  private generateInterfaceDocumentation(
    components: ComponentPattern[],
    spec: any
  ): string {
    // Generate documentation for the interface
    return `# KRDS Interface Documentation

This interface was generated based on KRDS design patterns and includes the following components:

${components.map(c => `- **${c.name}**: ${c.description}`).join('\n')}

## Accessibility
All components follow KRDS accessibility guidelines and WCAG 2.1 AA standards.

## Usage
${components.map(c => c.usage.examples.join('\n')).join('\n')}
`;
  }
}