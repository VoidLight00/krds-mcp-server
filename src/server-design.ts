#!/usr/bin/env node
/**
 * KRDS Design System MCP Server - Similar to Magic MCP
 * Extracts UI/UX patterns from KRDS website for reuse
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
    ListToolsRequestSchema, 
    CallToolRequestSchema, 
    McpError, 
    ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';

// Tool schemas
const AnalyzeDesignSchema = z.object({
    url: z.string().optional().default('https://v04.krds.go.kr'),
    depth: z.enum(['basic', 'detailed', 'complete']).optional().default('detailed'),
});

const ExtractComponentSchema = z.object({
    componentType: z.enum(['header', 'navigation', 'form', 'table', 'card', 'button', 'footer']),
    url: z.string().optional().default('https://v04.krds.go.kr'),
});

const GetDesignTokensSchema = z.object({
    category: z.enum(['colors', 'typography', 'spacing', 'all']).optional().default('all'),
});

const GenerateCodeSchema = z.object({
    componentType: z.string(),
    framework: z.enum(['html', 'react', 'vue', 'angular']).optional().default('html'),
    style: z.enum(['inline', 'css', 'styled-components', 'tailwind']).optional().default('css'),
});

class KrdsDesignMcpServer {
    private server: Server;
    private browser: any = null;
    private designCache = new Map<string, any>();
    
    constructor() {
        this.server = new Server(
            {
                name: 'krds-design-mcp',
                version: '1.0.0',
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );
        
        this.setupToolHandlers();
        this.setupErrorHandling();
    }
    
    private setupErrorHandling() {
        this.server.onerror = (error) => {
            console.error('[Design MCP Error]', error);
        };
        
        process.on('SIGINT', async () => {
            await this.cleanup();
            process.exit(0);
        });
    }
    
    private async cleanup() {
        if (this.browser) {
            await this.browser.close();
        }
        await this.server.close();
    }
    
    private async getBrowser() {
        if (!this.browser) {
            this.browser = await puppeteer.launch({
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            });
        }
        return this.browser;
    }
    
    private setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'analyze_design',
                        description: 'Analyze KRDS design system (colors, typography, spacing, components)',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                url: { type: 'string', default: 'https://v04.krds.go.kr' },
                                depth: { type: 'string', enum: ['basic', 'detailed', 'complete'], default: 'detailed' }
                            }
                        },
                    },
                    {
                        name: 'extract_component',
                        description: 'Extract specific UI component structure and styles',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                componentType: { 
                                    type: 'string', 
                                    enum: ['header', 'navigation', 'form', 'table', 'card', 'button', 'footer'] 
                                },
                                url: { type: 'string', default: 'https://v04.krds.go.kr' }
                            },
                            required: ['componentType']
                        },
                    },
                    {
                        name: 'get_design_tokens',
                        description: 'Get design tokens (colors, fonts, spacing) as CSS variables',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                category: { 
                                    type: 'string', 
                                    enum: ['colors', 'typography', 'spacing', 'all'],
                                    default: 'all'
                                }
                            }
                        },
                    },
                    {
                        name: 'generate_code',
                        description: 'Generate component code based on KRDS patterns',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                componentType: { type: 'string', description: 'Type of component to generate' },
                                framework: { 
                                    type: 'string', 
                                    enum: ['html', 'react', 'vue', 'angular'],
                                    default: 'html'
                                },
                                style: {
                                    type: 'string',
                                    enum: ['inline', 'css', 'styled-components', 'tailwind'],
                                    default: 'css'
                                }
                            },
                            required: ['componentType']
                        },
                    },
                ],
            };
        });
        
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            
            try {
                switch (name) {
                    case 'analyze_design':
                        return await this.analyzeDesign(args);
                    case 'extract_component':
                        return await this.extractComponent(args);
                    case 'get_design_tokens':
                        return await this.getDesignTokens(args);
                    case 'generate_code':
                        return await this.generateCode(args);
                    default:
                        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
                }
            } catch (error) {
                throw new McpError(
                    ErrorCode.InternalError,
                    `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        });
    }
    
    private async analyzeDesign(args: any) {
        const { url, depth } = AnalyzeDesignSchema.parse(args);
        
        const cacheKey = `design:${url}:${depth}`;
        if (this.designCache.has(cacheKey)) {
            return { content: [{ type: 'text', text: this.designCache.get(cacheKey) }] };
        }
        
        const browser = await this.getBrowser();
        const page = await browser.newPage();
        
        try {
            await page.goto(url, { waitUntil: 'networkidle2' });
            
            const designSystem = await page.evaluate(() => {
                // Extract colors
                const colors = {
                    primary: [],
                    secondary: [],
                    text: [],
                    background: [],
                    border: [],
                };
                
                // Get computed styles from all elements
                const elements = document.querySelectorAll('*');
                const colorSet = new Set<string>();
                
                elements.forEach(el => {
                    const styles = window.getComputedStyle(el);
                    if (styles.color) colorSet.add(styles.color);
                    if (styles.backgroundColor && styles.backgroundColor !== 'transparent') {
                        colorSet.add(styles.backgroundColor);
                    }
                    if (styles.borderColor) colorSet.add(styles.borderColor);
                });
                
                // Extract typography
                const typography = {
                    fonts: new Set<string>(),
                    sizes: new Set<string>(),
                    weights: new Set<string>(),
                };
                
                elements.forEach(el => {
                    const styles = window.getComputedStyle(el);
                    if (styles.fontFamily) typography.fonts.add(styles.fontFamily);
                    if (styles.fontSize) typography.sizes.add(styles.fontSize);
                    if (styles.fontWeight) typography.weights.add(styles.fontWeight);
                });
                
                // Extract spacing
                const spacing = {
                    margins: new Set<string>(),
                    paddings: new Set<string>(),
                    gaps: new Set<string>(),
                };
                
                elements.forEach(el => {
                    const styles = window.getComputedStyle(el);
                    if (styles.margin && styles.margin !== '0px') spacing.margins.add(styles.margin);
                    if (styles.padding && styles.padding !== '0px') spacing.paddings.add(styles.padding);
                    if (styles.gap) spacing.gaps.add(styles.gap);
                });
                
                // Extract component patterns
                const components = {
                    headers: document.querySelectorAll('header, .header, #header').length,
                    navs: document.querySelectorAll('nav, .nav, .navigation').length,
                    forms: document.querySelectorAll('form').length,
                    tables: document.querySelectorAll('table').length,
                    buttons: document.querySelectorAll('button, .btn, .button').length,
                    cards: document.querySelectorAll('.card, .panel, .box').length,
                };
                
                return {
                    colors: Array.from(colorSet),
                    typography: {
                        fonts: Array.from(typography.fonts),
                        sizes: Array.from(typography.sizes),
                        weights: Array.from(typography.weights),
                    },
                    spacing: {
                        margins: Array.from(spacing.margins).slice(0, 10),
                        paddings: Array.from(spacing.paddings).slice(0, 10),
                        gaps: Array.from(spacing.gaps).slice(0, 5),
                    },
                    components,
                };
            });
            
            const response = `# 🎨 KRDS 디자인 시스템 분석

## 색상 팔레트
${designSystem.colors.slice(0, 20).map(c => `• ${c}`).join('\n')}

## 타이포그래피
### 폰트
${designSystem.typography.fonts.slice(0, 5).map(f => `• ${f}`).join('\n')}

### 크기
${designSystem.typography.sizes.slice(0, 10).map(s => `• ${s}`).join('\n')}

### 굵기
${designSystem.typography.weights.slice(0, 5).map(w => `• ${w}`).join('\n')}

## 여백 시스템
### Margins
${designSystem.spacing.margins.map(m => `• ${m}`).join('\n')}

### Paddings
${designSystem.spacing.paddings.map(p => `• ${p}`).join('\n')}

## 컴포넌트 발견
• Headers: ${designSystem.components.headers}개
• Navigation: ${designSystem.components.navs}개
• Forms: ${designSystem.components.forms}개
• Tables: ${designSystem.components.tables}개
• Buttons: ${designSystem.components.buttons}개
• Cards: ${designSystem.components.cards}개`;
            
            this.designCache.set(cacheKey, response);
            return { content: [{ type: 'text', text: response }] };
            
        } finally {
            await page.close();
        }
    }
    
    private async extractComponent(args: any) {
        const { componentType, url } = ExtractComponentSchema.parse(args);
        
        const browser = await this.getBrowser();
        const page = await browser.newPage();
        
        try {
            await page.goto(url, { waitUntil: 'networkidle2' });
            
            const componentData = await page.evaluate((type) => {
                let selector = '';
                switch(type) {
                    case 'header': selector = 'header, .header, #header'; break;
                    case 'navigation': selector = 'nav, .nav, .navigation, .gnb, .lnb'; break;
                    case 'form': selector = 'form'; break;
                    case 'table': selector = 'table'; break;
                    case 'button': selector = 'button, .btn, .button'; break;
                    case 'card': selector = '.card, .panel, .box, .item'; break;
                    case 'footer': selector = 'footer, .footer, #footer'; break;
                }
                
                const element = document.querySelector(selector);
                if (!element) return null;
                
                const styles = window.getComputedStyle(element);
                const html = element.outerHTML;
                
                // Extract CSS properties
                const cssProps: any = {};
                ['display', 'position', 'width', 'height', 'padding', 'margin', 
                 'backgroundColor', 'color', 'fontSize', 'fontFamily', 'border',
                 'boxShadow', 'borderRadius'].forEach(prop => {
                    const value = styles.getPropertyValue(prop);
                    if (value && value !== 'none' && value !== '0px') {
                        cssProps[prop] = value;
                    }
                });
                
                return { html, css: cssProps };
            }, componentType);
            
            if (!componentData) {
                return { content: [{ type: 'text', text: `❌ ${componentType} 컴포넌트를 찾을 수 없습니다.` }] };
            }
            
            const response = `# 📦 ${componentType.toUpperCase()} 컴포넌트

## HTML 구조
\`\`\`html
${componentData.html}
\`\`\`

## CSS 스타일
\`\`\`css
${Object.entries(componentData.css).map(([k, v]) => `${k}: ${v};`).join('\n')}
\`\`\``;
            
            return { content: [{ type: 'text', text: response }] };
            
        } finally {
            await page.close();
        }
    }
    
    private async getDesignTokens(args: any) {
        const { category } = GetDesignTokensSchema.parse(args);
        
        // KRDS 기반 디자인 토큰
        const tokens = {
            colors: `/* KRDS Color Tokens */
:root {
  /* Primary Colors */
  --krds-primary: #003764;
  --krds-primary-light: #0056a6;
  --krds-primary-dark: #002442;
  
  /* Secondary Colors */
  --krds-secondary: #00a0e9;
  --krds-secondary-light: #33b5ee;
  --krds-secondary-dark: #0086c3;
  
  /* Semantic Colors */
  --krds-success: #00a651;
  --krds-warning: #ff9500;
  --krds-error: #d60030;
  --krds-info: #0078d4;
  
  /* Neutral Colors */
  --krds-text-primary: #212529;
  --krds-text-secondary: #6c757d;
  --krds-border: #dee2e6;
  --krds-background: #f8f9fa;
  --krds-white: #ffffff;
}`,
            typography: `/* KRDS Typography Tokens */
:root {
  /* Font Families */
  --krds-font-primary: 'Noto Sans KR', -apple-system, sans-serif;
  --krds-font-mono: 'Noto Sans Mono', monospace;
  
  /* Font Sizes */
  --krds-text-xs: 0.75rem;
  --krds-text-sm: 0.875rem;
  --krds-text-base: 1rem;
  --krds-text-lg: 1.125rem;
  --krds-text-xl: 1.25rem;
  --krds-text-2xl: 1.5rem;
  --krds-text-3xl: 1.875rem;
  
  /* Font Weights */
  --krds-font-light: 300;
  --krds-font-regular: 400;
  --krds-font-medium: 500;
  --krds-font-bold: 700;
  
  /* Line Heights */
  --krds-leading-tight: 1.25;
  --krds-leading-normal: 1.5;
  --krds-leading-relaxed: 1.75;
}`,
            spacing: `/* KRDS Spacing Tokens */
:root {
  /* Spacing Scale */
  --krds-space-1: 0.25rem;
  --krds-space-2: 0.5rem;
  --krds-space-3: 0.75rem;
  --krds-space-4: 1rem;
  --krds-space-5: 1.25rem;
  --krds-space-6: 1.5rem;
  --krds-space-8: 2rem;
  --krds-space-10: 2.5rem;
  --krds-space-12: 3rem;
  --krds-space-16: 4rem;
  
  /* Container */
  --krds-container-max: 1200px;
  --krds-container-padding: 1rem;
  
  /* Border Radius */
  --krds-radius-sm: 0.125rem;
  --krds-radius-md: 0.25rem;
  --krds-radius-lg: 0.5rem;
  --krds-radius-full: 9999px;
}`
        };
        
        let response = '';
        if (category === 'all') {
            response = Object.values(tokens).join('\n\n');
        } else {
            response = tokens[category] || '';
        }
        
        return { content: [{ type: 'text', text: response }] };
    }
    
    private async generateCode(args: any) {
        const { componentType, framework, style } = GenerateCodeSchema.parse(args);
        
        const templates: any = {
            button: {
                html: `<button class="krds-button krds-button--primary">
  <span class="krds-button__text">확인</span>
</button>`,
                react: `import React from 'react';

const KrdsButton = ({ children, variant = 'primary', onClick }) => {
  return (
    <button 
      className={\`krds-button krds-button--\${variant}\`}
      onClick={onClick}
    >
      <span className="krds-button__text">{children}</span>
    </button>
  );
};

export default KrdsButton;`,
                vue: `<template>
  <button 
    :class="['krds-button', \`krds-button--\${variant}\`]"
    @click="$emit('click')"
  >
    <span class="krds-button__text">
      <slot>확인</slot>
    </span>
  </button>
</template>

<script>
export default {
  name: 'KrdsButton',
  props: {
    variant: {
      type: String,
      default: 'primary'
    }
  }
}
</script>`,
                angular: `import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'krds-button',
  template: \`
    <button 
      [class]="'krds-button krds-button--' + variant"
      (click)="onClick.emit()"
    >
      <span class="krds-button__text">
        <ng-content>확인</ng-content>
      </span>
    </button>
  \`
})
export class KrdsButtonComponent {
  @Input() variant: string = 'primary';
  @Output() onClick = new EventEmitter();
}`
            },
            form: {
                html: `<form class="krds-form">
  <div class="krds-form-group">
    <label for="name" class="krds-label">이름 <span class="required">*</span></label>
    <input type="text" id="name" class="krds-input" required>
  </div>
  
  <div class="krds-form-group">
    <label for="email" class="krds-label">이메일</label>
    <input type="email" id="email" class="krds-input">
  </div>
  
  <div class="krds-form-actions">
    <button type="submit" class="krds-button krds-button--primary">제출</button>
    <button type="button" class="krds-button krds-button--secondary">취소</button>
  </div>
</form>`,
                react: `import React, { useState } from 'react';

const KrdsForm = ({ onSubmit }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form className="krds-form" onSubmit={handleSubmit}>
      <div className="krds-form-group">
        <label htmlFor="name" className="krds-label">
          이름 <span className="required">*</span>
        </label>
        <input 
          type="text" 
          id="name" 
          className="krds-input"
          value={formData.name}
          onChange={(e) => setFormData({...formData, name: e.target.value})}
          required 
        />
      </div>
      
      <div className="krds-form-group">
        <label htmlFor="email" className="krds-label">이메일</label>
        <input 
          type="email" 
          id="email" 
          className="krds-input"
          value={formData.email}
          onChange={(e) => setFormData({...formData, email: e.target.value})}
        />
      </div>
      
      <div className="krds-form-actions">
        <button type="submit" className="krds-button krds-button--primary">제출</button>
        <button type="button" className="krds-button krds-button--secondary">취소</button>
      </div>
    </form>
  );
};

export default KrdsForm;`
            }
        };
        
        const template = templates[componentType]?.[framework];
        
        if (!template) {
            return { 
                content: [{ 
                    type: 'text', 
                    text: `❌ ${componentType} 컴포넌트의 ${framework} 템플릿이 아직 준비되지 않았습니다.` 
                }] 
            };
        }
        
        const cssStyles = `/* KRDS Component Styles */
.krds-button {
  display: inline-flex;
  align-items: center;
  padding: 0.5rem 1rem;
  font-size: 1rem;
  font-weight: 500;
  border: 1px solid transparent;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: all 0.2s;
}

.krds-button--primary {
  background-color: var(--krds-primary, #003764);
  color: white;
}

.krds-button--secondary {
  background-color: var(--krds-secondary, #00a0e9);
  color: white;
}

.krds-form-group {
  margin-bottom: 1rem;
}

.krds-label {
  display: block;
  margin-bottom: 0.25rem;
  font-weight: 500;
}

.krds-input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--krds-border, #dee2e6);
  border-radius: 0.25rem;
}

.required {
  color: var(--krds-error, #d60030);
}`;
        
        const response = `# 🚀 ${componentType.toUpperCase()} 컴포넌트 (${framework.toUpperCase()})

## 컴포넌트 코드
\`\`\`${framework === 'html' ? 'html' : framework === 'vue' ? 'vue' : framework === 'angular' ? 'typescript' : 'jsx'}
${template}
\`\`\`

## CSS 스타일
\`\`\`css
${cssStyles}
\`\`\`

## 사용 예시
${framework === 'react' ? `\`\`\`jsx
<KrdsButton variant="primary" onClick={handleClick}>
  확인
</KrdsButton>
\`\`\`` : framework === 'vue' ? `\`\`\`vue
<krds-button variant="primary" @click="handleClick">
  확인
</krds-button>
\`\`\`` : framework === 'angular' ? `\`\`\`html
<krds-button [variant]="'primary'" (onClick)="handleClick()">
  확인
</krds-button>
\`\`\`` : `\`\`\`html
${template}
\`\`\``}`;
        
        return { content: [{ type: 'text', text: response }] };
    }
    
    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('KRDS Design System MCP Server running (Magic MCP style)');
    }
}

// Start the server
if (import.meta.url === `file://${process.argv[1]}`) {
    const server = new KrdsDesignMcpServer();
    server.run().catch((error) => {
        console.error('Failed to start server:', error);
        process.exit(1);
    });
}

export { KrdsDesignMcpServer };