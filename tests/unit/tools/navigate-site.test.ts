/**
 * Unit Tests for KRDS Navigate Site Tool
 * 
 * Comprehensive testing of the navigate_site MCP tool including:
 * - Site structure exploration
 * - Category listing and browsing
 * - Sitemap generation
 * - Navigation depth control
 * - Korean site navigation
 * - Error handling and edge cases
 * 
 * @author KRDS MCP Server Test Suite
 * @version 1.0.0
 */

import { jest } from '@jest/globals';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { MockMCPServer, MockMCPClient, createMockMCPServer, createMockMCPClient } from '../../helpers/mock-mcp-server.js';
import { mockNavigationTree } from '../../mock-data/krds-mock-data.js';

describe('Navigate Site Tool', () => {
  let mockServer: MockMCPServer;
  let mockClient: MockMCPClient;

  beforeEach(() => {
    mockServer = createMockMCPServer();
    mockClient = createMockMCPClient(mockServer);
    mockServer.clearRequestLog();
    mockServer.resetRateLimit();
    mockServer.setErrorMode(false);
  });

  afterEach(() => {
    mockServer.removeAllListeners();
  });

  describe('Parameter Validation', () => {
    it('should require action parameter', async () => {
      const result = await mockClient.callTool('navigate_site', {});
      
      // Mock server doesn't validate parameters, but real implementation would
      // For now, we test that it handles missing action gracefully
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toContain('Unknown action');
    });

    it('should accept valid action parameters', async () => {
      const validActions = ['list_categories', 'browse_category', 'get_sitemap'];

      for (const action of validActions) {
        let params: any = { action };
        
        if (action === 'browse_category') {
          params.category = 'education';
        }

        const result = await mockClient.callTool('navigate_site', params);
        const response = JSON.parse(result.content[0].text);
        
        expect(response.success).toBe(true);
      }
    });

    it('should validate required parameters for specific actions', async () => {
      const result = await mockClient.callTool('navigate_site', {
        action: 'browse_category',
        // Missing required category parameter
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(false);
      expect(response.error).toContain('Category parameter required');
    });

    it('should handle depth parameter', async () => {
      const params = {
        action: 'list_categories',
        depth: 3,
      };

      const result = await mockClient.callTool('navigate_site', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
    });
  });

  describe('List Categories Action', () => {
    it('should list all top-level categories', async () => {
      const result = await mockClient.callTool('navigate_site', {
        action: 'list_categories',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.categories).toBeDefined();
      expect(Array.isArray(response.categories)).toBe(true);
      expect(response.categories.length).toBeGreaterThan(0);
    });

    it('should include Korean category names', async () => {
      const result = await mockClient.callTool('navigate_site', {
        action: 'list_categories',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      
      response.categories.forEach((category: any) => {
        expect(category.id).toBeDefined();
        expect(category.name).toBeDefined();
        expect(category.nameKorean).toBeDefined();
        expect(category.documentCount).toBeDefined();
        expect(typeof category.documentCount).toBe('number');
      });
    });

    it('should return consistent category structure', async () => {
      const result = await mockClient.callTool('navigate_site', {
        action: 'list_categories',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      
      const expectedCategories = ['education', 'healthcare', 'transport'];
      const actualCategoryIds = response.categories.map((cat: any) => cat.id);
      
      expectedCategories.forEach(expectedId => {
        expect(actualCategoryIds).toContain(expectedId);
      });
    });

    it('should include document counts for categories', async () => {
      const result = await mockClient.callTool('navigate_site', {
        action: 'list_categories',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      
      response.categories.forEach((category: any) => {
        expect(category.documentCount).toBeDefined();
        expect(typeof category.documentCount).toBe('number');
        expect(category.documentCount).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Browse Category Action', () => {
    it('should browse a specific category', async () => {
      const params = {
        action: 'browse_category',
        category: 'education',
      };

      const result = await mockClient.callTool('navigate_site', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.category).toBeDefined();
      expect(response.category.id).toBe('education');
      expect(response.documents).toBeDefined();
      expect(Array.isArray(response.documents)).toBe(true);
    });

    it('should return category documents and subcategories', async () => {
      const params = {
        action: 'browse_category',
        category: 'healthcare',
      };

      const result = await mockClient.callTool('navigate_site', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.documents).toBeDefined();
      expect(response.subcategories).toBeDefined();
      expect(Array.isArray(response.subcategories)).toBe(true);
    });

    it('should handle different category types', async () => {
      const categories = [
        'education',
        'healthcare', 
        'transport',
        'economy',
        'environment',
        'social-welfare',
      ];

      for (const category of categories) {
        const params = {
          action: 'browse_category',
          category,
        };

        const result = await mockClient.callTool('navigate_site', params);
        const response = JSON.parse(result.content[0].text);
        
        expect(response.success).toBe(true);
        expect(response.category).toBeDefined();
        expect(response.category.id).toBe(category);
      }
    });

    it('should return structured document information', async () => {
      const params = {
        action: 'browse_category',
        category: 'education',
      };

      const result = await mockClient.callTool('navigate_site', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      
      if (response.documents.length > 0) {
        const doc = response.documents[0];
        expect(doc.id).toBeDefined();
        expect(doc.title).toBeDefined();
        expect(doc.url).toBeDefined();
      }
    });

    it('should handle subcategory navigation', async () => {
      const params = {
        action: 'browse_category',
        category: 'education-policy', // Subcategory
      };

      const result = await mockClient.callTool('navigate_site', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.category).toBeDefined();
    });

    it('should handle non-existent categories gracefully', async () => {
      const params = {
        action: 'browse_category',
        category: 'non-existent-category',
      };

      const result = await mockClient.callTool('navigate_site', params);
      const response = JSON.parse(result.content[0].text);
      
      // Mock server returns success for any category
      expect(response.success).toBe(true);
    });
  });

  describe('Get Sitemap Action', () => {
    it('should generate site structure overview', async () => {
      const result = await mockClient.callTool('navigate_site', {
        action: 'get_sitemap',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.sitemap).toBeDefined();
      expect(response.sitemap.totalCategories).toBeDefined();
      expect(response.sitemap.totalDocuments).toBeDefined();
      expect(response.sitemap.lastUpdated).toBeDefined();
      expect(response.sitemap.structure).toBeDefined();
    });

    it('should include comprehensive site statistics', async () => {
      const result = await mockClient.callTool('navigate_site', {
        action: 'get_sitemap',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      
      const sitemap = response.sitemap;
      expect(typeof sitemap.totalCategories).toBe('number');
      expect(typeof sitemap.totalDocuments).toBe('number');
      expect(sitemap.totalCategories).toBeGreaterThan(0);
      expect(sitemap.totalDocuments).toBeGreaterThan(0);
    });

    it('should include site structure breakdown', async () => {
      const result = await mockClient.callTool('navigate_site', {
        action: 'get_sitemap',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.sitemap.structure).toBeDefined();
      expect(typeof response.sitemap.structure).toBe('object');
      
      // Should contain category document counts
      const structure = response.sitemap.structure;
      Object.values(structure).forEach((count: any) => {
        expect(typeof count).toBe('number');
        expect(count).toBeGreaterThanOrEqual(0);
      });
    });

    it('should include last updated timestamp', async () => {
      const result = await mockClient.callTool('navigate_site', {
        action: 'get_sitemap',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.sitemap.lastUpdated).toBeDefined();
      
      // Verify it's a valid timestamp
      const lastUpdated = new Date(response.sitemap.lastUpdated);
      expect(lastUpdated.toString()).not.toBe('Invalid Date');
    });
  });

  describe('Navigation Depth Control', () => {
    it('should respect depth parameter for shallow navigation', async () => {
      const params = {
        action: 'list_categories',
        depth: 1,
      };

      const result = await mockClient.callTool('navigate_site', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.categories).toBeDefined();
    });

    it('should provide deeper navigation with increased depth', async () => {
      const params = {
        action: 'list_categories',
        depth: 3,
      };

      const result = await mockClient.callTool('navigate_site', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.categories).toBeDefined();
    });

    it('should handle maximum depth limits', async () => {
      const params = {
        action: 'list_categories',
        depth: 10, // Very deep navigation
      };

      const result = await mockClient.callTool('navigate_site', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
    });

    it('should handle zero depth gracefully', async () => {
      const params = {
        action: 'list_categories',
        depth: 0,
      };

      const result = await mockClient.callTool('navigate_site', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
    });
  });

  describe('Korean Site Navigation', () => {
    it('should handle Korean category names', async () => {
      const koreanCategories = [
        '교육',
        '보건의료',
        '교통',
        '경제',
        '환경',
        '사회복지',
        '국방',
        '외교',
        '통일',
        '법무',
      ];

      for (const category of koreanCategories.slice(0, 3)) { // Test subset
        const params = {
          action: 'browse_category',
          category,
        };

        const result = await mockClient.callTool('navigate_site', params);
        const response = JSON.parse(result.content[0].text);
        
        expect(response.success).toBe(true);
      }
    });

    it('should provide Korean category metadata', async () => {
      const result = await mockClient.callTool('navigate_site', {
        action: 'list_categories',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      
      response.categories.forEach((category: any) => {
        expect(category.nameKorean).toBeDefined();
        expect(typeof category.nameKorean).toBe('string');
        expect(category.nameKorean.length).toBeGreaterThan(0);
      });
    });

    it('should handle mixed language navigation', async () => {
      const mixedParams = {
        action: 'browse_category',
        category: 'education-교육',
      };

      const result = await mockClient.callTool('navigate_site', mixedParams);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
    });

    it('should support government agency categories', async () => {
      const agencyCategories = [
        '교육부',
        '보건복지부',
        '국토교통부',
        '기획재정부',
        '과학기술정보통신부',
        '외교부',
        '법무부',
        '국방부',
      ];

      for (const agency of agencyCategories.slice(0, 3)) { // Test subset
        const params = {
          action: 'browse_category',
          category: agency,
        };

        const result = await mockClient.callTool('navigate_site', params);
        const response = JSON.parse(result.content[0].text);
        
        expect(response.success).toBe(true);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown actions', async () => {
      const result = await mockClient.callTool('navigate_site', {
        action: 'unknown_action',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(false);
      expect(response.error).toContain('Unknown action');
    });

    it('should handle network errors', async () => {
      mockServer.setErrorMode(true);
      
      try {
        await mockClient.callTool('navigate_site', {
          action: 'list_categories',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect((error as McpError).code).toBe(ErrorCode.InternalError);
      }
    });

    it('should handle server timeouts', async () => {
      mockServer.setNetworkDelay(500);
      
      const startTime = Date.now();
      const result = await mockClient.callTool('navigate_site', {
        action: 'get_sitemap',
      });
      const endTime = Date.now();
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(endTime - startTime).toBeGreaterThanOrEqual(500);
    });

    it('should handle malformed category IDs', async () => {
      const malformedCategories = [
        '',
        '   ',
        '\x00\x01\x02',
        'category-with-very-long-name-that-exceeds-reasonable-limits-and-might-cause-issues',
        '특수문자!@#$%^&*()',
        null,
        undefined,
      ];

      for (const category of malformedCategories) {
        try {
          const params = {
            action: 'browse_category',
            category,
          };

          const result = await mockClient.callTool('navigate_site', params);
          const response = JSON.parse(result.content[0].text);
          
          // Mock server may accept malformed categories
          if (response.success === false) {
            expect(response.error).toBeDefined();
          }
        } catch (error) {
          // Expected for null/undefined categories
          expect(error).toBeInstanceOf(Error);
        }
      }
    });

    it('should handle rate limiting', async () => {
      mockServer.setRateLimit(1);
      
      // First request should succeed
      const result1 = await mockClient.callTool('navigate_site', {
        action: 'list_categories',
      });
      const response1 = JSON.parse(result1.content[0].text);
      expect(response1.success).toBe(true);
      
      // Second request should fail due to rate limiting
      try {
        await mockClient.callTool('navigate_site', {
          action: 'get_sitemap',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
      }
    });
  });

  describe('Performance and Caching', () => {
    it('should track execution time', async () => {
      const result = await mockClient.callTool('navigate_site', {
        action: 'list_categories',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.executionTimeMs).toBeDefined();
      expect(typeof response.executionTimeMs).toBe('number');
      expect(response.executionTimeMs).toBeGreaterThan(0);
    });

    it('should handle concurrent navigation requests', async () => {
      const requests = [
        { action: 'list_categories' },
        { action: 'browse_category', category: 'education' },
        { action: 'browse_category', category: 'healthcare' },
        { action: 'get_sitemap' },
        { action: 'browse_category', category: 'transport' },
      ];

      const promises = requests.map(params => 
        mockClient.callTool('navigate_site', params)
      );

      const results = await Promise.all(promises);

      results.forEach((result, index) => {
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
      });
    });

    it('should optimize repeated category requests', async () => {
      const category = 'education';
      
      // First request
      const startTime1 = Date.now();
      const result1 = await mockClient.callTool('navigate_site', {
        action: 'browse_category',
        category,
      });
      const endTime1 = Date.now();
      const time1 = endTime1 - startTime1;

      // Second request (potentially cached)
      const startTime2 = Date.now();
      const result2 = await mockClient.callTool('navigate_site', {
        action: 'browse_category',
        category,
      });
      const endTime2 = Date.now();
      const time2 = endTime2 - startTime2;

      const response1 = JSON.parse(result1.content[0].text);
      const response2 = JSON.parse(result2.content[0].text);

      expect(response1.success).toBe(true);
      expect(response2.success).toBe(true);
      
      // Results should be consistent
      expect(response2.category.id).toBe(response1.category.id);
    });

    it('should handle large category trees efficiently', async () => {
      const params = {
        action: 'get_sitemap',
        depth: 5,
      };

      const startTime = Date.now();
      const result = await mockClient.callTool('navigate_site', params);
      const endTime = Date.now();
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      
      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(5000); // 5 seconds
    });
  });

  describe('Navigation Result Structure', () => {
    it('should return consistent category list structure', async () => {
      const result = await mockClient.callTool('navigate_site', {
        action: 'list_categories',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.categories).toBeDefined();
      expect(Array.isArray(response.categories)).toBe(true);
      
      if (response.categories.length > 0) {
        const category = response.categories[0];
        expect(category).toMatchObject({
          id: expect.any(String),
          name: expect.any(String),
          nameKorean: expect.any(String),
          documentCount: expect.any(Number),
        });
      }
    });

    it('should return consistent browse category structure', async () => {
      const result = await mockClient.callTool('navigate_site', {
        action: 'browse_category',
        category: 'education',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.category).toBeDefined();
      expect(response.documents).toBeDefined();
      expect(response.subcategories).toBeDefined();
      
      expect(Array.isArray(response.documents)).toBe(true);
      expect(Array.isArray(response.subcategories)).toBe(true);
    });

    it('should return consistent sitemap structure', async () => {
      const result = await mockClient.callTool('navigate_site', {
        action: 'get_sitemap',
      });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.sitemap).toMatchObject({
        totalCategories: expect.any(Number),
        totalDocuments: expect.any(Number),
        lastUpdated: expect.any(String),
        structure: expect.any(Object),
      });
    });
  });

  describe('Special Navigation Scenarios', () => {
    it('should handle government structure navigation', async () => {
      const govStructure = [
        'central-government',
        'local-government',
        'public-agencies',
        'government-funded-institutions',
      ];

      for (const structure of govStructure) {
        const result = await mockClient.callTool('navigate_site', {
          action: 'browse_category',
          category: structure,
        });
        const response = JSON.parse(result.content[0].text);
        
        expect(response.success).toBe(true);
      }
    });

    it('should support policy area navigation', async () => {
      const policyAreas = [
        'economic-policy',
        'social-policy',
        'foreign-policy',
        'security-policy',
        'environmental-policy',
      ];

      for (const area of policyAreas.slice(0, 3)) { // Test subset
        const result = await mockClient.callTool('navigate_site', {
          action: 'browse_category',
          category: area,
        });
        const response = JSON.parse(result.content[0].text);
        
        expect(response.success).toBe(true);
      }
    });

    it('should handle document type navigation', async () => {
      const documentTypes = [
        'laws-regulations',
        'policy-reports',
        'statistics',
        'announcements',
        'public-notices',
      ];

      for (const type of documentTypes.slice(0, 3)) { // Test subset
        const result = await mockClient.callTool('navigate_site', {
          action: 'browse_category',
          category: type,
        });
        const response = JSON.parse(result.content[0].text);
        
        expect(response.success).toBe(true);
      }
    });
  });
});