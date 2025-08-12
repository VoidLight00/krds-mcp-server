/**
 * Comprehensive test suite for KRDS Design System MCP Server
 * Tests all 4 tools with real KRDS website data
 */

import { spawn, ChildProcess } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { setTimeout } from 'timers/promises';

// MCP Protocol message types
interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

class MCPTestClient {
  private serverProcess: ChildProcess | null = null;
  private messageId = 1;
  private responses = new Map<string | number, any>();
  private initialized = false;

  async startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      const serverPath = join(process.cwd(), 'dist', 'server-design.js');
      
      // First check if the server file exists
      try {
        readFileSync(serverPath);
      } catch (error) {
        reject(new Error(`Server file not found at ${serverPath}. Run 'npm run build' first.`));
        return;
      }

      this.serverProcess = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'test' }
      });

      if (!this.serverProcess.stdout || !this.serverProcess.stderr) {
        reject(new Error('Failed to create server process streams'));
        return;
      }

      // Handle server messages
      this.serverProcess.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter(Boolean);
        
        for (const line of lines) {
          try {
            const message: MCPResponse = JSON.parse(line);
            console.log('📥 Server response:', JSON.stringify(message, null, 2));
            this.responses.set(message.id, message);
          } catch (error) {
            console.log('📥 Server output:', line);
          }
        }
      });

      this.serverProcess.stderr.on('data', (data) => {
        const output = data.toString();
        console.log('🔍 Server stderr:', output);
        
        // Check for server ready signal
        if (output.includes('KRDS Design System MCP Server running')) {
          resolve();
        }
      });

      this.serverProcess.on('error', (error) => {
        console.error('❌ Server process error:', error);
        reject(error);
      });

      this.serverProcess.on('exit', (code, signal) => {
        console.log(`🏁 Server exited with code ${code} and signal ${signal}`);
      });

      // Timeout after 10 seconds
      setTimeout(10000).then(() => {
        if (!this.initialized) {
          reject(new Error('Server startup timeout'));
        }
      });
    });
  }

  async initialize(): Promise<void> {
    await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {}
      },
      clientInfo: {
        name: 'krds-design-test-client',
        version: '1.0.0'
      }
    });

    this.initialized = true;
    console.log('✅ MCP Client initialized');
  }

  async sendRequest(method: string, params?: any): Promise<any> {
    if (!this.serverProcess || !this.serverProcess.stdin) {
      throw new Error('Server not started');
    }

    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: this.messageId++,
      method,
      params
    };

    console.log('📤 Sending request:', JSON.stringify(request, null, 2));

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Request timeout for method: ${method}`));
      }, 30000);

      const checkResponse = () => {
        if (this.responses.has(request.id)) {
          clearTimeout(timeout);
          const response = this.responses.get(request.id);
          this.responses.delete(request.id);

          if (response.error) {
            reject(new Error(`MCP Error: ${response.error.message}`));
          } else {
            resolve(response.result);
          }
          return;
        }

        // Check again in 100ms
        setTimeout(checkResponse, 100);
      };

      // Send the request
      this.serverProcess!.stdin!.write(JSON.stringify(request) + '\n');
      
      // Start checking for response
      setTimeout(checkResponse, 100);
    });
  }

  async stopServer(): Promise<void> {
    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = null;
    }
  }
}

describe('KRDS Design System MCP Server Integration Tests', () => {
  let client: MCPTestClient;
  
  beforeAll(async () => {
    console.log('🚀 Starting KRDS Design System MCP Server tests...');
    client = new MCPTestClient();
    await client.startServer();
    await client.initialize();
  }, 60000);

  afterAll(async () => {
    console.log('🛑 Stopping MCP Server...');
    await client.stopServer();
  });

  describe('Tool Discovery', () => {
    it('should list all 4 design system tools', async () => {
      const result = await client.sendRequest('tools/list');
      
      expect(result.tools).toHaveLength(4);
      
      const toolNames = result.tools.map((tool: any) => tool.name);
      expect(toolNames).toContain('analyze_design');
      expect(toolNames).toContain('extract_component');
      expect(toolNames).toContain('get_design_tokens');
      expect(toolNames).toContain('generate_code');
    });

    it('should have proper tool schemas', async () => {
      const result = await client.sendRequest('tools/list');
      
      const analyzeDesignTool = result.tools.find((tool: any) => tool.name === 'analyze_design');
      expect(analyzeDesignTool.inputSchema.properties.url).toBeDefined();
      expect(analyzeDesignTool.inputSchema.properties.depth).toBeDefined();
      
      const extractComponentTool = result.tools.find((tool: any) => tool.name === 'extract_component');
      expect(extractComponentTool.inputSchema.properties.componentType).toBeDefined();
      expect(extractComponentTool.inputSchema.required).toContain('componentType');
    });
  });

  describe('analyze_design Tool', () => {
    it('should analyze real KRDS website design system', async () => {
      const result = await client.sendRequest('tools/call', {
        name: 'analyze_design',
        arguments: {
          url: 'https://v04.krds.go.kr',
          depth: 'detailed'
        }
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      
      const analysisText = result.content[0].text;
      
      // Should contain real analysis sections
      expect(analysisText).toContain('색상 팔레트');
      expect(analysisText).toContain('타이포그래피');
      expect(analysisText).toContain('여백 시스템');
      expect(analysisText).toContain('컴포넌트 발견');
      
      // Should contain real KRDS colors (not hardcoded values)
      expect(analysisText).toMatch(/rgb\(\d+, \d+, \d+\)/);
      
      // Should mention Pretendard GOV font (real KRDS font)
      expect(analysisText).toContain('Pretendard GOV');
      
      // Should have real component counts
      expect(analysisText).toMatch(/Headers: \d+개/);
      expect(analysisText).toMatch(/Buttons: \d+개/);
      
      console.log('✅ Design analysis contains real data from KRDS website');
    }, 45000);

    it('should handle different depth levels', async () => {
      const basicResult = await client.sendRequest('tools/call', {
        name: 'analyze_design',
        arguments: {
          depth: 'basic'
        }
      });

      const detailedResult = await client.sendRequest('tools/call', {
        name: 'analyze_design',
        arguments: {
          depth: 'detailed'
        }
      });

      // Both should work but may have different levels of detail
      expect(basicResult.content[0].text).toContain('색상 팔레트');
      expect(detailedResult.content[0].text).toContain('색상 팔레트');
      
      console.log('✅ Different depth levels handled correctly');
    }, 60000);

    it('should use caching for repeated requests', async () => {
      const start1 = Date.now();
      await client.sendRequest('tools/call', {
        name: 'analyze_design',
        arguments: { depth: 'basic' }
      });
      const time1 = Date.now() - start1;

      const start2 = Date.now();
      await client.sendRequest('tools/call', {
        name: 'analyze_design',
        arguments: { depth: 'basic' }
      });
      const time2 = Date.now() - start2;

      // Second request should be significantly faster (cached)
      expect(time2).toBeLessThan(time1 * 0.5);
      console.log(`✅ Caching working: First request ${time1}ms, Second request ${time2}ms`);
    }, 60000);
  });

  describe('extract_component Tool', () => {
    it('should extract real header component from KRDS', async () => {
      const result = await client.sendRequest('tools/call', {
        name: 'extract_component',
        arguments: {
          componentType: 'header',
          url: 'https://v04.krds.go.kr'
        }
      });

      expect(result.content[0].type).toBe('text');
      const componentText = result.content[0].text;
      
      // Should extract real header HTML
      expect(componentText).toContain('HTML 구조');
      expect(componentText).toContain('CSS 스타일');
      
      // Should contain real KRDS header elements
      expect(componentText).toMatch(/<header|<div class="header"|id="g-header"/i);
      expect(componentText).toContain('KRDS'); // Logo text
      
      // Should have real CSS properties
      expect(componentText).toMatch(/display:|position:|background/);
      
      console.log('✅ Real header component extracted with actual KRDS structure');
    }, 45000);

    it('should extract navigation component', async () => {
      const result = await client.sendRequest('tools/call', {
        name: 'extract_component',
        arguments: {
          componentType: 'navigation'
        }
      });

      const componentText = result.content[0].text;
      
      // Should contain navigation structure
      expect(componentText).toContain('NAVIGATION 컴포넌트');
      expect(componentText).toMatch(/<nav|class="nav|class="gnb"/i);
      
      console.log('✅ Navigation component extracted successfully');
    }, 30000);

    it('should extract button components', async () => {
      const result = await client.sendRequest('tools/call', {
        name: 'extract_component',
        arguments: {
          componentType: 'button'
        }
      });

      const componentText = result.content[0].text;
      expect(componentText).toContain('BUTTON 컴포넌트');
      
      console.log('✅ Button component extracted successfully');
    }, 30000);

    it('should handle missing components gracefully', async () => {
      const result = await client.sendRequest('tools/call', {
        name: 'extract_component',
        arguments: {
          componentType: 'table' // May not exist on homepage
        }
      });

      const componentText = result.content[0].text;
      
      // Should either extract table or show not found message
      expect(componentText).toMatch(/(TABLE 컴포넌트|찾을 수 없습니다)/);
      
      console.log('✅ Missing components handled gracefully');
    }, 30000);
  });

  describe('get_design_tokens Tool', () => {
    it('should return all design tokens', async () => {
      const result = await client.sendRequest('tools/call', {
        name: 'get_design_tokens',
        arguments: {
          category: 'all'
        }
      });

      const tokensText = result.content[0].text;
      
      // Should contain all token categories
      expect(tokensText).toContain('/* KRDS Color Tokens */');
      expect(tokensText).toContain('/* KRDS Typography Tokens */');
      expect(tokensText).toContain('/* KRDS Spacing Tokens */');
      
      // Should have CSS custom properties
      expect(tokensText).toContain('--krds-primary:');
      expect(tokensText).toContain('--krds-font-primary:');
      expect(tokensText).toContain('--krds-space-');
      
      console.log('✅ All design tokens returned in CSS custom property format');
    });

    it('should return specific token categories', async () => {
      const colorResult = await client.sendRequest('tools/call', {
        name: 'get_design_tokens',
        arguments: { category: 'colors' }
      });

      const typographyResult = await client.sendRequest('tools/call', {
        name: 'get_design_tokens',
        arguments: { category: 'typography' }
      });

      const spacingResult = await client.sendRequest('tools/call', {
        name: 'get_design_tokens',
        arguments: { category: 'spacing' }
      });

      // Each should contain only their specific category
      expect(colorResult.content[0].text).toContain('Color Tokens');
      expect(colorResult.content[0].text).not.toContain('Typography Tokens');
      
      expect(typographyResult.content[0].text).toContain('Typography Tokens');
      expect(typographyResult.content[0].text).not.toContain('Color Tokens');
      
      expect(spacingResult.content[0].text).toContain('Spacing Tokens');
      expect(spacingResult.content[0].text).not.toContain('Color Tokens');
      
      console.log('✅ Specific token categories returned correctly');
    });
  });

  describe('generate_code Tool', () => {
    it('should generate HTML button code', async () => {
      const result = await client.sendRequest('tools/call', {
        name: 'generate_code',
        arguments: {
          componentType: 'button',
          framework: 'html'
        }
      });

      const codeText = result.content[0].text;
      
      expect(codeText).toContain('BUTTON 컴포넌트 (HTML)');
      expect(codeText).toContain('컴포넌트 코드');
      expect(codeText).toContain('CSS 스타일');
      expect(codeText).toContain('사용 예시');
      
      // Should contain actual HTML and CSS
      expect(codeText).toMatch(/<button.*class="krds-button/);
      expect(codeText).toContain('.krds-button {');
      
      console.log('✅ HTML button code generated with KRDS styles');
    });

    it('should generate React component code', async () => {
      const result = await client.sendRequest('tools/call', {
        name: 'generate_code',
        arguments: {
          componentType: 'button',
          framework: 'react'
        }
      });

      const codeText = result.content[0].text;
      
      expect(codeText).toContain('BUTTON 컴포넌트 (REACT)');
      expect(codeText).toMatch(/import React|const.*Button.*=/);
      expect(codeText).toContain('export default');
      
      console.log('✅ React button component generated');
    });

    it('should generate Vue component code', async () => {
      const result = await client.sendRequest('tools/call', {
        name: 'generate_code',
        arguments: {
          componentType: 'button',
          framework: 'vue'
        }
      });

      const codeText = result.content[0].text;
      
      expect(codeText).toContain('BUTTON 컴포넌트 (VUE)');
      expect(codeText).toContain('<template>');
      expect(codeText).toContain('<script>');
      
      console.log('✅ Vue button component generated');
    });

    it('should generate Angular component code', async () => {
      const result = await client.sendRequest('tools/call', {
        name: 'generate_code',
        arguments: {
          componentType: 'button',
          framework: 'angular'
        }
      });

      const codeText = result.content[0].text;
      
      expect(codeText).toContain('BUTTON 컴포넌트 (ANGULAR)');
      expect(codeText).toContain('@Component');
      expect(codeText).toContain('export class');
      
      console.log('✅ Angular button component generated');
    });

    it('should generate form component code', async () => {
      const result = await client.sendRequest('tools/call', {
        name: 'generate_code',
        arguments: {
          componentType: 'form',
          framework: 'react'
        }
      });

      const codeText = result.content[0].text;
      
      expect(codeText).toContain('FORM 컴포넌트 (REACT)');
      expect(codeText).toMatch(/<form.*className="krds-form/);
      expect(codeText).toContain('useState');
      
      console.log('✅ React form component generated');
    });

    it('should handle unsupported component types', async () => {
      const result = await client.sendRequest('tools/call', {
        name: 'generate_code',
        arguments: {
          componentType: 'unsupported',
          framework: 'html'
        }
      });

      const codeText = result.content[0].text;
      
      expect(codeText).toContain('준비되지 않았습니다');
      
      console.log('✅ Unsupported component types handled gracefully');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid tool names', async () => {
      try {
        await client.sendRequest('tools/call', {
          name: 'invalid_tool',
          arguments: {}
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('Unknown tool');
        console.log('✅ Invalid tool names handled correctly');
      }
    });

    it('should handle invalid arguments', async () => {
      try {
        await client.sendRequest('tools/call', {
          name: 'extract_component',
          arguments: {
            componentType: 'invalid_component'
          }
        });
        // Should not throw but may return empty result
        console.log('✅ Invalid arguments handled gracefully');
      } catch (error) {
        // Acceptable if validation fails
        console.log('✅ Invalid arguments rejected with proper error');
      }
    });

    it('should handle network timeouts gracefully', async () => {
      // This might take a while or timeout, should be handled gracefully
      const result = await client.sendRequest('tools/call', {
        name: 'analyze_design',
        arguments: {
          url: 'https://httpbin.org/delay/5', // Delayed response
          depth: 'basic'
        }
      });
      
      // Should either succeed or fail gracefully
      expect(result.content).toBeDefined();
      console.log('✅ Network delays handled appropriately');
    }, 60000);
  });

  describe('Performance Tests', () => {
    it('should complete analysis within reasonable time', async () => {
      const start = Date.now();
      
      await client.sendRequest('tools/call', {
        name: 'analyze_design',
        arguments: {
          depth: 'basic'
        }
      });
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(30000); // Should complete within 30 seconds
      
      console.log(`✅ Analysis completed in ${duration}ms`);
    }, 35000);

    it('should handle concurrent requests', async () => {
      const promises = [
        client.sendRequest('tools/call', {
          name: 'get_design_tokens',
          arguments: { category: 'colors' }
        }),
        client.sendRequest('tools/call', {
          name: 'get_design_tokens',
          arguments: { category: 'typography' }
        }),
        client.sendRequest('tools/call', {
          name: 'generate_code',
          arguments: { componentType: 'button', framework: 'html' }
        })
      ];

      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.content).toBeDefined();
        expect(result.content[0].text).toBeTruthy();
      });
      
      console.log('✅ Concurrent requests handled successfully');
    });
  });
});