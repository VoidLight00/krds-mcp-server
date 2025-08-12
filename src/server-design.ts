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
    url: z.string().optional().default('https://v04.krds.go.kr/guide/index.html'),
    depth: z.enum(['basic', 'detailed', 'complete']).optional().default('detailed'),
});

const ExtractComponentSchema = z.object({
    componentType: z.enum(['header', 'navigation', 'form', 'table', 'card', 'button', 'footer']),
    url: z.string().optional().default('https://v04.krds.go.kr/guide/index.html'),
});

const GetDesignTokensSchema = z.object({
    category: z.enum(['colors', 'typography', 'spacing', 'all']).optional().default('all'),
    url: z.string().optional().default('https://v04.krds.go.kr/guide/index.html'),
    extractFromCSS: z.boolean().optional().default(true),
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
    private browserLaunchAttempts = 0;
    private maxBrowserAttempts = 3;
    private fallbackMode = false;
    
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
        
        // Handle multiple shutdown signals
        const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
        signals.forEach(signal => {
            process.on(signal, async () => {
                console.error(`Received ${signal}, shutting down gracefully...`);
                await this.cleanup();
                process.exit(0);
            });
        });
        
        // Handle uncaught exceptions
        process.on('uncaughtException', async (error) => {
            console.error('Uncaught Exception:', error);
            await this.cleanup();
            process.exit(1);
        });
        
        // Handle unhandled promise rejections
        process.on('unhandledRejection', async (reason, promise) => {
            console.error('Unhandled Rejection at:', promise, 'reason:', reason);
            await this.cleanup();
            process.exit(1);
        });
    }
    
    private async cleanup() {
        console.error('Cleaning up resources...');
        
        if (this.browser) {
            try {
                const pages = await this.browser.pages();
                await Promise.all(pages.map((page: any) => page.close().catch((err: any) => 
                    console.error('Error closing page:', err)
                )));
                await this.browser.close();
                console.error('Browser closed successfully');
            } catch (error) {
                console.error('Error closing browser:', error);
                // Force kill browser process if normal close fails
                try {
                    if (this.browser.process()) {
                        this.browser.process().kill('SIGKILL');
                    }
                } catch (killError) {
                    console.error('Error force-killing browser:', killError);
                }
            }
            this.browser = null;
        }
        
        try {
            await this.server.close();
            console.error('Server closed successfully');
        } catch (error) {
            console.error('Error closing server:', error);
        }
    }
    
    private async getBrowser() {
        // Check if we're in fallback mode or exceeded max attempts
        if (this.fallbackMode || this.browserLaunchAttempts >= this.maxBrowserAttempts) {
            throw new Error('Browser launch disabled - using fallback mode');
        }

        if (!this.browser) {
            try {
                this.browserLaunchAttempts++;
                console.error(`Attempting to launch browser (attempt ${this.browserLaunchAttempts}/${this.maxBrowserAttempts})...`);
                
                // More compatible browser launch options
                const launchOptions = {
                    headless: true, // Use true instead of 'new' for better compatibility
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-gpu',
                        '--disable-features=VizDisplayCompositor',
                        '--disable-background-timer-throttling',
                        '--disable-backgrounding-occluded-windows',
                        '--disable-renderer-backgrounding',
                        '--disable-ipc-flooding-protection',
                        '--disable-extensions',
                        '--disable-plugins',
                        '--disable-images',
                        '--disable-web-security',
                        '--no-first-run',
                        '--no-zygote',
                        '--single-process', // Help with resource management
                        '--disable-default-apps',
                        '--disable-sync',
                        '--disable-translate',
                        '--hide-scrollbars',
                        '--mute-audio',
                        '--no-default-browser-check',
                        '--no-pings',
                        '--disable-client-side-phishing-detection',
                        '--disable-component-extensions-with-background-pages',
                        '--disable-hang-monitor',
                        '--disable-prompt-on-repost'
                    ],
                    timeout: 60000, // Increased timeout
                    protocolTimeout: 60000,
                    handleSIGINT: false, // Let our handlers manage this
                    handleSIGTERM: false,
                    handleSIGHUP: false,
                    ignoreDefaultArgs: ['--enable-automation'], // Remove automation flag
                };

                this.browser = await puppeteer.launch(launchOptions);
                
                console.error('✅ Browser launched successfully');
                
                // Add comprehensive error handling for browser events
                this.browser.on('disconnected', () => {
                    console.error('🔌 Browser disconnected, will attempt reconnect on next request');
                    this.browser = null;
                });

                this.browser.on('targetcreated', () => {
                    // Optional: log when new pages/targets are created
                });

                this.browser.on('targetdestroyed', () => {
                    // Optional: log when pages/targets are destroyed
                });

                // Reset attempts on successful launch
                this.browserLaunchAttempts = 0;
                
            } catch (error) {
                console.error(`❌ Failed to launch browser (attempt ${this.browserLaunchAttempts}):`, error);
                
                if (this.browserLaunchAttempts >= this.maxBrowserAttempts) {
                    console.error(`🚫 Exceeded maximum browser launch attempts (${this.maxBrowserAttempts}). Enabling fallback mode.`);
                    this.fallbackMode = true;
                    throw new Error(`Browser launch failed after ${this.maxBrowserAttempts} attempts. Fallback mode enabled.`);
                }
                
                throw new Error(`Browser launch failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        
        // Verify browser is still connected
        try {
            if (this.browser && this.browser.isConnected && !this.browser.isConnected()) {
                console.error('Browser connection lost, clearing instance');
                this.browser = null;
                return this.getBrowser(); // Recursive retry
            }
        } catch (error) {
            console.error('Error checking browser connection:', error);
            this.browser = null;
            return this.getBrowser(); // Recursive retry
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
                        description: 'Get design tokens (colors, fonts, spacing) extracted from KRDS website',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                category: { 
                                    type: 'string', 
                                    enum: ['colors', 'typography', 'spacing', 'all'],
                                    default: 'all'
                                },
                                url: { 
                                    type: 'string', 
                                    default: 'https://v04.krds.go.kr/guide/index.html' 
                                },
                                extractFromCSS: { 
                                    type: 'boolean', 
                                    default: true,
                                    description: 'Extract design tokens from actual CSS files'
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
        
        // Try to get browser, fallback to static analysis if it fails
        let browser = null;
        let page = null;
        
        try {
            browser = await this.getBrowser();
            page = await browser.newPage();
        } catch (browserError) {
            console.error('Browser launch failed, using static fallback analysis:', browserError);
            return this.getFallbackDesignAnalysis(url, depth);
        }
        
        try {
            // Set user agent and viewport for better compatibility
            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await page.setViewport({ width: 1200, height: 800 });
            
            console.log(`Navigating to ${url}...`);
            
            // Handle redirects properly - navigate to main page first if needed
            if (url === 'https://v04.krds.go.kr') {
                console.log('  🔄 Detected root URL, following redirect to guide page');
                await page.goto('https://v04.krds.go.kr/guide/index.html', { 
                    waitUntil: 'networkidle2', 
                    timeout: 30000 
                });
            } else {
                await page.goto(url, { 
                    waitUntil: 'networkidle2', 
                    timeout: 30000 
                });
            }
            
            // Wait for page to fully load
            await page.waitForTimeout(2000);
            
            const designSystem = await page.evaluate((analysisDepth) => {
                const colorSet = new Set<string>();
                const fontSet = new Set<string>();
                const sizeSet = new Set<string>();
                const marginSet = new Set<string>();
                const paddingSet = new Set<string>();
                const gapSet = new Set<string>();
                
                // Get all elements but focus on visible ones for better performance
                const elements = Array.from(document.querySelectorAll('*'))
                    .filter(el => {
                        const rect = el.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0; // Only visible elements
                    });
                
                elements.forEach(el => {
                    const styles = window.getComputedStyle(el);
                    
                    // Extract colors (filter out transparent and initial values)
                    if (styles.color && styles.color !== 'rgba(0, 0, 0, 0)' && styles.color !== 'transparent') {
                        colorSet.add(styles.color);
                    }
                    if (styles.backgroundColor && 
                        styles.backgroundColor !== 'rgba(0, 0, 0, 0)' && 
                        styles.backgroundColor !== 'transparent') {
                        colorSet.add(styles.backgroundColor);
                    }
                    if (styles.borderColor && styles.borderColor !== 'rgba(0, 0, 0, 0)') {
                        colorSet.add(styles.borderColor);
                    }
                    
                    // Extract typography
                    if (styles.fontFamily) fontSet.add(styles.fontFamily);
                    if (styles.fontSize) sizeSet.add(styles.fontSize);
                    
                    // Extract spacing (only non-zero values)
                    if (styles.margin && styles.margin !== '0px') marginSet.add(styles.margin);
                    if (styles.padding && styles.padding !== '0px') paddingSet.add(styles.padding);
                    if (styles.gap && styles.gap !== 'normal') gapSet.add(styles.gap);
                });
                
                // Extract component patterns with more specific selectors for KRDS
                const components = {
                    headers: document.querySelectorAll('header, .header, #header, #g-header').length,
                    navs: document.querySelectorAll('nav, .nav, .navigation, .gnb, .lnb').length,
                    forms: document.querySelectorAll('form, .form').length,
                    tables: document.querySelectorAll('table, .table').length,
                    buttons: document.querySelectorAll('button, .btn, .button, input[type="button"], input[type="submit"]').length,
                    cards: document.querySelectorAll('.card, .panel, .box, .item, .guide-item').length,
                    links: document.querySelectorAll('a').length,
                    inputs: document.querySelectorAll('input, textarea, select').length,
                };
                
                // Get page metadata
                const pageInfo = {
                    title: document.title,
                    url: window.location.href,
                    description: (document.querySelector('meta[name="description"]') as HTMLMetaElement)?.content || '',
                };
                
                return {
                    pageInfo,
                    colors: Array.from(colorSet).slice(0, 20), // Get top 20 colors
                    typography: {
                        fonts: Array.from(fontSet).slice(0, 8),
                        sizes: Array.from(sizeSet).slice(0, 15),
                    },
                    spacing: {
                        margins: Array.from(marginSet).slice(0, 12),
                        paddings: Array.from(paddingSet).slice(0, 12),
                        gaps: Array.from(gapSet).slice(0, 8),
                    },
                    components,
                    totalElements: elements.length,
                };
            }, depth);
            
            const response = `# 🎨 KRDS 디자인 시스템 분석

**페이지 정보**
• 제목: ${designSystem.pageInfo.title}
• URL: ${designSystem.pageInfo.url}
• 총 분석 요소: ${designSystem.totalElements}개

## 색상 팔레트 (${designSystem.colors.length}개 발견)
${designSystem.colors.map(c => `• ${c}`).join('\n')}

## 타이포그래피
### 폰트 패밀리 (${designSystem.typography.fonts.length}개)
${designSystem.typography.fonts.map(f => `• ${f}`).join('\n')}

### 폰트 크기 (${designSystem.typography.sizes.length}개)
${designSystem.typography.sizes.map(s => `• ${s}`).join('\n')}

## 여백 시스템
### Margins (${designSystem.spacing.margins.length}개 패턴)
${designSystem.spacing.margins.map(m => `• ${m}`).join('\n')}

### Paddings (${designSystem.spacing.paddings.length}개 패턴)
${designSystem.spacing.paddings.map(p => `• ${p}`).join('\n')}

${designSystem.spacing.gaps.length > 0 ? `### Gaps (${designSystem.spacing.gaps.length}개)
${designSystem.spacing.gaps.map(g => `• ${g}`).join('\n')}` : ''}

## 컴포넌트 발견
• Headers: ${designSystem.components.headers}개
• Navigation: ${designSystem.components.navs}개
• Forms: ${designSystem.components.forms}개
• Tables: ${designSystem.components.tables}개
• Buttons: ${designSystem.components.buttons}개
• Cards: ${designSystem.components.cards}개
• Links: ${designSystem.components.links}개
• Input Elements: ${designSystem.components.inputs}개

## 분석 상세도: ${depth}
${depth === 'detailed' || depth === 'complete' ? '상세 분석이 완료되었습니다. 실제 웹사이트에서 추출된 디자인 토큰을 확인하세요.' : '기본 분석이 완료되었습니다.'}`;
            
            this.designCache.set(cacheKey, response);
            return { content: [{ type: 'text', text: response }] };
            
        } catch (error) {
            console.error(`Error analyzing design from ${url}:`, error);
            
            // Try fallback analysis before showing error
            try {
                console.error('Attempting fallback analysis...');
                return this.getFallbackDesignAnalysis(url, depth);
            } catch (fallbackError) {
                console.error('Fallback analysis also failed:', fallbackError);
                
                const errorResponse = `# ❌ KRDS 디자인 시스템 분석 오류 (브라우저 모드)

**오류 정보**
• URL: ${url}
• 분석 깊이: ${depth}
• 브라우저 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}
• 폴백 모드: ${this.fallbackMode ? '활성화됨' : '비활성화됨'}

## 제공된 기본 분석 (정적 데이터)
KRDS 디자인 시스템의 일반적인 패턴을 기반으로 한 분석입니다.

### 색상 팔레트
• Primary Blue: #003764 (공공기관 메인 컬러)
• Secondary Blue: #00a0e9 (보조 컬러)
• Text Primary: #1d1d1d (본문 텍스트)
• Background: #ffffff (배경색)
• Border Light: #e4e4e4 (테두리)

### 타이포그래피
• 메인 폰트: Pretendard GOV, sans-serif
• 기본 크기: 16px
• 제목 크기: 24px, 20px, 18px
• 폰트 두께: 400 (regular), 500 (medium), 700 (bold)

### 여백 시스템
• 기본 간격: 16px, 24px, 32px
• 컨테이너 패딩: 20px
• 섹션 간격: 40px

## 해결 방법
1. 네트워크 연결 상태를 확인하세요
2. Puppeteer 브라우저 설정을 확인하세요
3. 시스템 리소스 여유를 확인하세요
4. 정적 토큰이 필요한 경우 \`get_design_tokens\` 도구를 사용하세요`;

                return { content: [{ type: 'text', text: errorResponse }] };
            }
        } finally {
            if (page && !page.isClosed()) {
                await page.close().catch(err => console.error('Error closing page:', err));
            }
        }
    }
    
    private async extractComponent(args: any) {
        const { componentType, url } = ExtractComponentSchema.parse(args);
        
        // Try to get browser, fallback if it fails
        let browser = null;
        let page = null;
        
        try {
            browser = await this.getBrowser();
            page = await browser.newPage();
        } catch (browserError) {
            console.error('Browser launch failed, using static component extraction:', browserError);
            return this.getFallbackComponentExtraction(componentType, url);
        }
        
        try {
            // Set user agent and viewport
            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await page.setViewport({ width: 1200, height: 800 });
            
            console.log(`Extracting ${componentType} component from ${url}...`);
            
            // Handle redirects properly
            if (url === 'https://v04.krds.go.kr') {
                console.log('  🔄 Detected root URL, following redirect to guide page');
                await page.goto('https://v04.krds.go.kr/guide/index.html', { 
                    waitUntil: 'networkidle2', 
                    timeout: 30000 
                });
            } else {
                await page.goto(url, { 
                    waitUntil: 'networkidle2', 
                    timeout: 30000 
                });
            }
            
            // Wait for page to fully load
            await page.waitForTimeout(2000);
            
            const componentData = await page.evaluate((type) => {
                // More comprehensive selectors for KRDS
                let selectors: string[] = [];
                
                switch(type) {
                    case 'header': 
                        selectors = ['header', '.header', '#header', '#g-header', '.site-header'];
                        break;
                    case 'navigation': 
                        selectors = ['nav', '.nav', '.navigation', '.gnb', '.lnb', '.menu', '.nav-menu'];
                        break;
                    case 'form': 
                        selectors = ['form', '.form', '.contact-form', '.search-form'];
                        break;
                    case 'table': 
                        selectors = ['table', '.table', '.data-table'];
                        break;
                    case 'button': 
                        selectors = ['button', '.btn', '.button', 'input[type="button"]', 'input[type="submit"]'];
                        break;
                    case 'card': 
                        selectors = ['.card', '.panel', '.box', '.item', '.guide-item', '.content-box'];
                        break;
                    case 'footer': 
                        selectors = ['footer', '.footer', '#footer', '#g-footer', '.site-footer'];
                        break;
                }
                
                let element: Element | null = null;
                let usedSelector = '';
                
                // Try each selector until we find an element
                for (const selector of selectors) {
                    element = document.querySelector(selector);
                    if (element) {
                        usedSelector = selector;
                        break;
                    }
                }
                
                if (!element) {
                    return { 
                        error: true, 
                        message: `${type} 컴포넌트를 찾을 수 없습니다. 시도한 선택자: ${selectors.join(', ')}` 
                    };
                }
                
                const styles = window.getComputedStyle(element);
                let html = element.outerHTML;
                
                // Truncate HTML if too long but keep it readable
                if (html.length > 2000) {
                    html = html.substring(0, 2000) + '\n... (HTML이 길어서 축약됨)';
                }
                
                // Extract comprehensive CSS properties
                const cssProps: Record<string, string> = {};
                const importantProps = [
                    'display', 'position', 'width', 'height', 'maxWidth', 'maxHeight',
                    'padding', 'margin', 'backgroundColor', 'color', 'fontSize', 
                    'fontFamily', 'fontWeight', 'lineHeight', 'textAlign',
                    'border', 'borderRadius', 'boxShadow', 'zIndex',
                    'flexDirection', 'justifyContent', 'alignItems', 'gap'
                ];
                
                importantProps.forEach(prop => {
                    const value = styles.getPropertyValue(prop);
                    if (value && value !== 'none' && value !== 'normal' && value !== 'auto' && value !== '0px' && value !== 'initial') {
                        // Convert camelCase to kebab-case
                        const kebabProp = prop.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
                        cssProps[kebabProp] = value;
                    }
                });
                
                // Get element dimensions and position
                const rect = element.getBoundingClientRect();
                const elementInfo = {
                    tagName: element.tagName.toLowerCase(),
                    className: element.className,
                    id: element.id,
                    width: Math.round(rect.width),
                    height: Math.round(rect.height),
                    childCount: element.children.length,
                };
                
                return { 
                    html, 
                    css: cssProps, 
                    selector: usedSelector,
                    elementInfo,
                    pageTitle: document.title
                };
            }, componentType);
            
            if (componentData.error) {
                return { content: [{ type: 'text', text: `❌ ${componentData.message}` }] };
            }
            
            const response = `# 📦 ${componentType.toUpperCase()} 컴포넌트

**추출 정보**
• 페이지: ${componentData.pageTitle}
• 선택자: \`${componentData.selector}\`
• 태그: \`<${componentData.elementInfo.tagName}>\`
• 클래스: ${componentData.elementInfo.className ? `\`${componentData.elementInfo.className}\`` : '없음'}
• ID: ${componentData.elementInfo.id ? `\`${componentData.elementInfo.id}\`` : '없음'}
• 크기: ${componentData.elementInfo.width}px × ${componentData.elementInfo.height}px
• 자식 요소: ${componentData.elementInfo.childCount}개

## HTML 구조
\`\`\`html
${componentData.html}
\`\`\`

## CSS 스타일 (계산된 값)
\`\`\`css
.${componentType}-component {
${Object.entries(componentData.css).map(([k, v]) => `  ${k}: ${v};`).join('\n')}
}
\`\`\`

## 사용 방법
이 컴포넌트를 재사용하려면 HTML 구조를 복사하고 위의 CSS 스타일을 적용하세요.`;
            
            return { content: [{ type: 'text', text: response }] };
            
        } catch (error) {
            console.error(`Error extracting ${componentType} component:`, error);
            
            // Try fallback component extraction
            try {
                console.error('Attempting fallback component extraction...');
                return this.getFallbackComponentExtraction(componentType, url);
            } catch (fallbackError) {
                console.error('Fallback component extraction also failed:', fallbackError);
                return { 
                    content: [{ 
                        type: 'text', 
                        text: `❌ ${componentType} 컴포넌트 추출 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}

**폴백 모드**: ${this.fallbackMode ? '활성화됨' : '비활성화됨'}

## 기본 컴포넌트 패턴
KRDS ${componentType} 컴포넌트의 일반적인 구조를 확인하려면 \`generate_code\` 도구를 사용해보세요.` 
                    }] 
                };
            }
        } finally {
            if (page && !page.isClosed()) {
                await page.close().catch(err => console.error('Error closing page:', err));
            }
        }
    }
    
    private async getDesignTokens(args: any) {
        const { category, url, extractFromCSS } = GetDesignTokensSchema.parse(args);
        
        const cacheKey = `tokens:${url}:${category}:${extractFromCSS}`;
        if (this.designCache.has(cacheKey)) {
            return { content: [{ type: 'text', text: this.designCache.get(cacheKey) }] };
        }

        if (!extractFromCSS) {
            // Return basic fallback tokens if CSS extraction is disabled
            return this.getFallbackDesignTokens(category);
        }

        // Try to get browser, fallback if it fails
        let browser = null;
        let page = null;
        
        try {
            browser = await this.getBrowser();
            page = await browser.newPage();
        } catch (browserError) {
            console.error('Browser launch failed, using static design tokens:', browserError);
            return this.getFallbackDesignTokens(category);
        }
        
        try {
            // Set user agent and viewport
            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await page.setViewport({ width: 1200, height: 800 });
            
            console.log(`Extracting design tokens from ${url}...`);
            await page.goto(url, { 
                waitUntil: 'networkidle2', 
                timeout: 30000 
            });
            
            // Wait for page to fully load
            await page.waitForTimeout(2000);
            
            // Extract design tokens from the page
            const tokenData = await page.evaluate(() => {
                const colorSet = new Set<string>();
                const fontSet = new Set<string>();
                const fontSizeSet = new Set<string>();
                const spacingSet = new Set<string>();
                const cssVariables = new Map<string, string>();
                
                // Extract CSS custom properties from all stylesheets
                for (let i = 0; i < document.styleSheets.length; i++) {
                    try {
                        const styleSheet = document.styleSheets[i];
                        if (styleSheet.cssRules) {
                            for (let j = 0; j < styleSheet.cssRules.length; j++) {
                                const rule = styleSheet.cssRules[j];
                                if (rule.type === CSSRule.STYLE_RULE) {
                                    const styleRule = rule as CSSStyleRule;
                                    const style = styleRule.style;
                                    
                                    // Extract CSS custom properties (--variables)
                                    for (let k = 0; k < style.length; k++) {
                                        const prop = style.item(k);
                                        if (prop.startsWith('--')) {
                                            cssVariables.set(prop, style.getPropertyValue(prop));
                                        }
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        // Skip stylesheets that can't be accessed (CORS)
                        console.log('Skipping stylesheet due to CORS:', e);
                    }
                }
                
                // Extract computed styles from visible elements
                const elements = Array.from(document.querySelectorAll('*'))
                    .filter(el => {
                        const rect = el.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0;
                    })
                    .slice(0, 100); // Limit for performance
                
                elements.forEach(el => {
                    const styles = window.getComputedStyle(el);
                    
                    // Colors
                    if (styles.color && styles.color !== 'rgba(0, 0, 0, 0)' && styles.color !== 'transparent') {
                        colorSet.add(styles.color);
                    }
                    if (styles.backgroundColor && styles.backgroundColor !== 'rgba(0, 0, 0, 0)' && styles.backgroundColor !== 'transparent') {
                        colorSet.add(styles.backgroundColor);
                    }
                    if (styles.borderColor && styles.borderColor !== 'rgba(0, 0, 0, 0)') {
                        colorSet.add(styles.borderColor);
                    }
                    
                    // Typography
                    if (styles.fontFamily && !styles.fontFamily.includes('inherit')) {
                        fontSet.add(styles.fontFamily);
                    }
                    if (styles.fontSize && styles.fontSize !== '0px') {
                        fontSizeSet.add(styles.fontSize);
                    }
                    
                    // Spacing
                    if (styles.margin && styles.margin !== '0px') spacingSet.add(`margin: ${styles.margin}`);
                    if (styles.padding && styles.padding !== '0px') spacingSet.add(`padding: ${styles.padding}`);
                    if (styles.gap && styles.gap !== 'normal') spacingSet.add(`gap: ${styles.gap}`);
                });
                
                return {
                    pageInfo: {
                        title: document.title,
                        url: window.location.href,
                    },
                    cssVariables: Object.fromEntries(cssVariables),
                    colors: Array.from(colorSet).slice(0, 15),
                    fonts: Array.from(fontSet).slice(0, 8),
                    fontSizes: Array.from(fontSizeSet).slice(0, 12),
                    spacing: Array.from(spacingSet).slice(0, 10),
                    totalElements: elements.length,
                };
            });
            
            // Generate CSS custom properties based on extracted data
            const generatedTokens = this.generateCSSTokens(tokenData, category);
            
            const response = `# 🎨 KRDS 디자인 토큰 (실제 추출됨)

**추출 정보**
• 페이지: ${tokenData.pageInfo.title}
• URL: ${tokenData.pageInfo.url}
• 분석 요소: ${tokenData.totalElements}개
• CSS 변수 발견: ${Object.keys(tokenData.cssVariables).length}개

${category === 'all' ? Object.values(generatedTokens).join('\n\n') : generatedTokens[category] || `❌ 알 수 없는 카테고리: ${category}`}

## 실제 추출된 CSS 변수
${Object.keys(tokenData.cssVariables).length > 0 ? 
`\`\`\`css
${Object.entries(tokenData.cssVariables).slice(0, 10).map(([key, value]) => `  ${key}: ${value};`).join('\n')}
\`\`\`` : '사용자 정의 CSS 변수가 발견되지 않았습니다.'}

## 추출된 원시 데이터
${category === 'all' || category === 'colors' ? `### 색상 (${tokenData.colors.length}개 발견)
${tokenData.colors.slice(0, 8).map(c => `• ${c}`).join('\n')}` : ''}

${category === 'all' || category === 'typography' ? `### 폰트 (${tokenData.fonts.length}개 발견)
${tokenData.fonts.slice(0, 5).map(f => `• ${f}`).join('\n')}

### 폰트 크기 (${tokenData.fontSizes.length}개 발견)
${tokenData.fontSizes.slice(0, 8).map(s => `• ${s}`).join('\n')}` : ''}

${category === 'all' || category === 'spacing' ? `### 여백 (${tokenData.spacing.length}개 패턴)
${tokenData.spacing.slice(0, 6).map(s => `• ${s}`).join('\n')}` : ''}

## 사용 방법
위의 CSS 변수들을 프로젝트에 추가하여 KRDS 디자인 시스템을 적용하세요.`;
            
            this.designCache.set(cacheKey, response);
            return { content: [{ type: 'text', text: response }] };
            
        } catch (error) {
            console.error(`Error extracting design tokens from ${url}:`, error);
            
            // Fallback to static tokens if extraction fails
            console.log('Falling back to static design tokens...');
            return this.getFallbackDesignTokens(category);
            
        } finally {
            if (page && !page.isClosed()) {
                await page.close().catch(err => console.error('Error closing page:', err));
            }
        }
    }

    private getFallbackDesignTokens(category: string) {
        // Simplified fallback design tokens
        const tokens = {
            colors: `/* KRDS Color Tokens (Fallback) */
:root {
  --krds-primary-blue: #1d56bc;
  --krds-text-primary: #1d1d1d;
  --krds-bg-primary: #ffffff;
  --krds-border-light: #e4e4e4;
}`,
            typography: `/* KRDS Typography Tokens (Fallback) */
:root {
  --krds-font-primary: "Pretendard GOV", sans-serif;
  --krds-text-base: 16px;
  --krds-font-regular: 400;
}`,
            spacing: `/* KRDS Spacing Tokens (Fallback) */
:root {
  --krds-space-4: 16px;
  --krds-space-6: 24px;
  --krds-radius-md: 4px;
}`
        };

        const response = category === 'all' 
            ? `# 🎨 KRDS 디자인 토큰 (기본값)\n\n${Object.values(tokens).join('\n\n')}`
            : `# 🎨 KRDS ${category.toUpperCase()} 토큰 (기본값)\n\n${tokens[category] || `❌ 알 수 없는 카테고리: ${category}`}`;

        return { content: [{ type: 'text', text: response }] };
    }

    private getFallbackDesignAnalysis(url: string, depth: string) {
        const response = `# 🎨 KRDS 디자인 시스템 분석 (정적 폴백)

**페이지 정보**
• 제목: KRDS 디자인 시스템 가이드 (정적 분석)
• URL: ${url}
• 분석 모드: 폴백 모드 - 브라우저 연결 실패로 인한 정적 분석
• 총 분석 요소: 정적 데이터 기반

## 색상 팔레트 (표준 KRDS 컬러)
• rgb(0, 55, 100) - Primary Blue (공공기관 메인 컬러)
• rgb(0, 160, 233) - Secondary Blue (보조 컬러)
• rgb(29, 29, 29) - Text Primary (본문 텍스트)
• rgb(255, 255, 255) - Background White (배경색)
• rgb(228, 228, 228) - Border Light (테두리)
• rgb(245, 245, 245) - Background Gray (회색 배경)
• rgb(214, 0, 48) - Error Red (오류/필수 표시)
• rgb(0, 133, 71) - Success Green (성공 표시)

## 타이포그래피
### 폰트 패밀리
• "Pretendard GOV", sans-serif (메인 폰트)
• "Noto Sans KR", sans-serif (한글 폰트)
• system-ui, -apple-system (시스템 폰트 백업)

### 폰트 크기
• 12px (캡션)
• 14px (작은 텍스트)
• 16px (기본 본문)
• 18px (부제목)
• 20px (소제목)
• 24px (제목)
• 32px (대제목)

## 여백 시스템
### Margins (일반적인 패턴)
• 0px (기본값)
• 8px 16px (작은 여백)
• 16px 24px (중간 여백)
• 24px 32px (큰 여백)
• 32px 48px (섹션 여백)

### Paddings (일반적인 패턴)
• 8px 12px (버튼 내부)
• 12px 16px (입력 필드)
• 16px 20px (컨테이너)
• 20px 24px (카드 내부)
• 24px 32px (페이지 패딩)

### Gaps (Flexbox/Grid)
• 8px (작은 간격)
• 16px (기본 간격)
• 24px (큰 간격)

## 컴포넌트 발견 (예상값)
• Headers: 1개 (메인 헤더)
• Navigation: 2개 (GNB, LNB)
• Forms: 3-5개 (검색, 연락처 등)
• Tables: 2-4개 (데이터 표시)
• Buttons: 10-15개 (다양한 버튼)
• Cards: 5-10개 (콘텐츠 카드)
• Links: 20-50개 (다양한 링크)
• Input Elements: 5-10개 (폼 요소)

## 분석 상세도: ${depth}
정적 폴백 모드로 실행됨. 실제 웹사이트 분석을 위해서는 브라우저 연결 문제를 해결해야 합니다.

**주의사항**: 이는 일반적인 KRDS 패턴을 기반으로 한 정적 분석입니다. 실제 웹사이트와 차이가 있을 수 있습니다.`;

        return { content: [{ type: 'text', text: response }] };
    }

    private getFallbackComponentExtraction(componentType: string, url: string) {
        const templates = {
            header: {
                html: `<header class="krds-header">
  <div class="krds-header__container">
    <h1 class="krds-header__logo">
      <a href="/">정부 사이트</a>
    </h1>
    <nav class="krds-header__nav">
      <ul class="krds-nav-list">
        <li><a href="#">메뉴1</a></li>
        <li><a href="#">메뉴2</a></li>
        <li><a href="#">메뉴3</a></li>
      </ul>
    </nav>
  </div>
</header>`,
                css: {
                    'background-color': '#003764',
                    'color': '#ffffff',
                    'padding': '16px 0',
                    'position': 'relative'
                }
            },
            button: {
                html: `<button class="krds-button krds-button--primary">
  <span class="krds-button__text">확인</span>
</button>`,
                css: {
                    'background-color': '#003764',
                    'color': '#ffffff',
                    'padding': '8px 16px',
                    'border': 'none',
                    'border-radius': '4px',
                    'font-weight': '500'
                }
            },
            form: {
                html: `<form class="krds-form">
  <div class="krds-form-group">
    <label class="krds-label">이름</label>
    <input type="text" class="krds-input">
  </div>
  <div class="krds-form-actions">
    <button type="submit" class="krds-button krds-button--primary">제출</button>
  </div>
</form>`,
                css: {
                    'display': 'flex',
                    'flex-direction': 'column',
                    'gap': '16px',
                    'max-width': '400px'
                }
            }
        };

        const template = templates[componentType] || templates.button;
        
        const response = `# 📦 ${componentType.toUpperCase()} 컴포넌트 (정적 폴백)

**추출 정보**
• 페이지: KRDS 가이드 (정적 분석)
• 선택자: 일반적인 KRDS 패턴
• 분석 모드: 폴백 모드 - 브라우저 연결 실패
• 크기: 동적 크기 (실제 측정 불가)

## HTML 구조 (표준 패턴)
\`\`\`html
${template.html}
\`\`\`

## CSS 스타일 (기본 스타일)
\`\`\`css
.${componentType}-component {
${Object.entries(template.css).map(([k, v]) => `  ${k}: ${v};`).join('\n')}
}
\`\`\`

## 사용 방법
이 컴포넌트는 표준 KRDS 패턴을 기반으로 생성되었습니다. 
실제 웹사이트에서 추출하려면 브라우저 연결 문제를 해결해야 합니다.

**주의사항**: 정적 폴백 데이터이므로 실제 사이트와 차이가 있을 수 있습니다.`;

        return { content: [{ type: 'text', text: response }] };
    }

    private generateCSSTokens(data: any, category: string) {
        const tokens = {
            colors: `/* KRDS Color Tokens - 실시간 추출 */
:root {
${data.colors.map((color: string, index: number) => `  --krds-color-${index + 1}: ${color};`).join('\n')}
  
  /* Semantic Color Mapping */
  --krds-primary: var(--krds-color-1);
  --krds-secondary: var(--krds-color-2);
  --krds-accent: var(--krds-color-3);
}`,
            typography: `/* KRDS Typography Tokens - 실시간 추출 */
:root {
${data.fonts.map((font: string, index: number) => `  --krds-font-${index + 1}: ${font};`).join('\n')}
${data.fontSizes.map((size: string, index: number) => `  --krds-text-size-${index + 1}: ${size};`).join('\n')}
  
  /* Semantic Typography Mapping */
  --krds-font-primary: var(--krds-font-1);
  --krds-text-base: var(--krds-text-size-1);
}`,
            spacing: `/* KRDS Spacing Tokens - 실시간 추출 */
:root {
${data.spacing.map((spacing: string, index: number) => `  --krds-spacing-${index + 1}: ${spacing.split(': ')[1]};`).join('\n')}
  
  /* Semantic Spacing Mapping */
  --krds-space-sm: var(--krds-spacing-1);
  --krds-space-md: var(--krds-spacing-2);
  --krds-space-lg: var(--krds-spacing-3);
}`
        };

        return tokens;
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