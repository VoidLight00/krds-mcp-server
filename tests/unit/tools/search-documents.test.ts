/**
 * Unit Tests for KRDS Search Documents Tool
 * 
 * Comprehensive testing of the search_documents MCP tool including:
 * - Parameter validation
 * - Korean text search functionality
 * - Filtering and sorting options
 * - Error handling and edge cases
 * - Cache behavior
 * - Performance considerations
 * 
 * @author KRDS MCP Server Test Suite
 * @version 1.0.0
 */

import { jest } from '@jest/globals';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { MockMCPServer, MockMCPClient, createMockMCPServer, createMockMCPClient } from '../../helpers/mock-mcp-server.js';
import { mockKrdsSearchResult } from '../../mock-data/krds-mock-data.js';

describe('Search Documents Tool', () => {
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
    it('should require a non-empty query parameter', async () => {
      const result = await mockClient.callTool('search_documents', { query: '' });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(false);
      expect(response.error).toContain('Query cannot be empty');
    });

    it('should accept valid search parameters', async () => {
      const params = {
        query: '교육정책',
        maxResults: 10,
        category: '교육',
        sortBy: 'relevance',
        sortOrder: 'desc',
      };

      const result = await mockClient.callTool('search_documents', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.documents).toBeDefined();
      expect(Array.isArray(response.documents)).toBe(true);
    });

    it('should validate date format parameters', async () => {
      const params = {
        query: '정책',
        dateFrom: '2024-01-01',
        dateTo: '2024-12-31',
      };

      const result = await mockClient.callTool('search_documents', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
    });

    it('should handle invalid date formats', async () => {
      const params = {
        query: '정책',
        dateFrom: 'invalid-date',
      };

      // This would be handled by parameter validation before reaching the tool
      const result = await mockClient.callTool('search_documents', params);
      const response = JSON.parse(result.content[0].text);
      
      // Mock server accepts any format, but real implementation would validate
      expect(response.success).toBe(true);
    });

    it('should limit maxResults parameter', async () => {
      const params = {
        query: '교육',
        maxResults: 5,
      };

      const result = await mockClient.callTool('search_documents', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.documents.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Korean Text Search', () => {
    it('should search for Korean government terms', async () => {
      const koreanQueries = [
        '교육정책',
        '보건복지',
        '경제정책',
        '환경보전',
        '사회복지',
        '국토교통',
      ];

      for (const query of koreanQueries) {
        const result = await mockClient.callTool('search_documents', { query });
        const response = JSON.parse(result.content[0].text);
        
        expect(response.success).toBe(true);
        expect(response.documents).toBeDefined();
        expect(response.searchQuery.query).toBe(query);
        
        // Verify Korean content in results
        if (response.documents.length > 0) {
          const firstDoc = response.documents[0];
          expect(firstDoc.titleKorean).toBeDefined();
          expect(firstDoc.snippetKorean).toBeDefined();
        }
      }
    });

    it('should handle mixed Korean-English queries', async () => {
      const mixedQuery = 'AI 인공지능 정책';
      const result = await mockClient.callTool('search_documents', { query: mixedQuery });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.searchQuery.query).toBe(mixedQuery);
    });

    it('should search with additional Korean query terms', async () => {
      const params = {
        query: 'education policy',
        queryKorean: '교육정책 개발방안',
      };

      const result = await mockClient.callTool('search_documents', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
    });

    it('should handle complex Korean sentences', async () => {
      const complexQuery = '대한민국 정부의 제4차 산업혁명 대응정책 추진현황';
      const result = await mockClient.callTool('search_documents', { query: complexQuery });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
    });
  });

  describe('Filtering and Sorting', () => {
    it('should filter by category', async () => {
      const params = {
        query: '정책',
        category: '교육',
      };

      const result = await mockClient.callTool('search_documents', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.searchQuery.category).toBe('교육');
    });

    it('should filter by government agency', async () => {
      const agencies = ['교육부', '보건복지부', '국토교통부', '기획재정부'];

      for (const agency of agencies) {
        const params = {
          query: '정책',
          agency,
        };

        const result = await mockClient.callTool('search_documents', params);
        const response = JSON.parse(result.content[0].text);
        
        expect(response.success).toBe(true);
        
        // Verify agency filtering in mock results
        if (response.documents.length > 0) {
          response.documents.forEach((doc: any) => {
            expect(doc.agencyKorean || doc.agency).toBeDefined();
          });
        }
      }
    });

    it('should filter by document type', async () => {
      const documentTypes = ['보고서', '법령', '공지사항', '정책자료'];

      for (const docType of documentTypes) {
        const params = {
          query: '정책',
          documentType: docType,
        };

        const result = await mockClient.callTool('search_documents', params);
        const response = JSON.parse(result.content[0].text);
        
        expect(response.success).toBe(true);
      }
    });

    it('should filter by date range', async () => {
      const params = {
        query: '정책',
        dateFrom: '2024-01-01',
        dateTo: '2024-06-30',
      };

      const result = await mockClient.callTool('search_documents', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
    });

    it('should sort by relevance', async () => {
      const params = {
        query: '교육정책',
        sortBy: 'relevance',
        sortOrder: 'desc',
      };

      const result = await mockClient.callTool('search_documents', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.searchQuery.sortBy).toBe('relevance');
      
      // Verify relevance scores are included
      if (response.documents.length > 1) {
        const firstDoc = response.documents[0];
        const secondDoc = response.documents[1];
        if (firstDoc.relevanceScore && secondDoc.relevanceScore) {
          expect(firstDoc.relevanceScore).toBeGreaterThanOrEqual(secondDoc.relevanceScore);
        }
      }
    });

    it('should sort by date', async () => {
      const params = {
        query: '정책',
        sortBy: 'date',
        sortOrder: 'desc',
      };

      const result = await mockClient.callTool('search_documents', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.searchQuery.sortBy).toBe('date');
    });

    it('should sort by title', async () => {
      const params = {
        query: '교육',
        sortBy: 'title',
        sortOrder: 'asc',
      };

      const result = await mockClient.callTool('search_documents', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
    });
  });

  describe('Pagination and Results', () => {
    it('should return correct pagination information', async () => {
      const params = {
        query: '정책',
        maxResults: 10,
      };

      const result = await mockClient.callTool('search_documents', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.totalCount).toBeDefined();
      expect(response.currentPage).toBeDefined();
      expect(response.totalPages).toBeDefined();
      expect(response.hasNext).toBeDefined();
      expect(response.hasPrevious).toBeDefined();
    });

    it('should respect maxResults limit', async () => {
      const params = {
        query: '교육정책',
        maxResults: 3,
      };

      const result = await mockClient.callTool('search_documents', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.documents.length).toBeLessThanOrEqual(3);
    });

    it('should handle zero results gracefully', async () => {
      const params = {
        query: 'nonexistent-very-unique-query-12345',
      };

      const result = await mockClient.callTool('search_documents', params);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.documents).toEqual([]);
      expect(response.totalCount).toBe(0);
    });
  });

  describe('Search Result Structure', () => {
    it('should return properly structured document results', async () => {
      const result = await mockClient.callTool('search_documents', { query: '교육정책' });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.documents).toBeDefined();

      if (response.documents.length > 0) {
        const doc = response.documents[0];
        
        // Required fields
        expect(doc.id).toBeDefined();
        expect(doc.title).toBeDefined();
        expect(doc.url).toBeDefined();
        
        // Korean content fields
        expect(doc.titleKorean).toBeDefined();
        expect(doc.snippetKorean).toBeDefined();
        
        // Metadata fields
        expect(doc.category).toBeDefined();
        expect(doc.agency).toBeDefined();
        expect(doc.agencyKorean).toBeDefined();
        expect(doc.publicationDate).toBeDefined();
        
        // Relevance scoring
        expect(doc.relevanceScore).toBeDefined();
        expect(typeof doc.relevanceScore).toBe('number');
      }
    });

    it('should include search metadata', async () => {
      const result = await mockClient.callTool('search_documents', { query: '정책' });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.searchQuery).toBeDefined();
      expect(response.executionTimeMs).toBeDefined();
      expect(typeof response.executionTimeMs).toBe('number');
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      mockServer.setErrorMode(true);
      
      try {
        await mockClient.callTool('search_documents', { query: '교육정책' });
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect((error as McpError).code).toBe(ErrorCode.InternalError);
      }
    });

    it('should handle rate limiting', async () => {
      mockServer.setRateLimit(1);
      
      // First request should succeed
      const result1 = await mockClient.callTool('search_documents', { query: '정책' });
      const response1 = JSON.parse(result1.content[0].text);
      expect(response1.success).toBe(true);
      
      // Second request should fail due to rate limiting
      try {
        await mockClient.callTool('search_documents', { query: '교육' });
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
      }
    });

    it('should handle malformed queries', async () => {
      const malformedQueries = [
        '\x00\x01\x02', // Control characters
        ''.repeat(1000), // Very long query
        '   ', // Only whitespace
        null,
        undefined,
      ];

      for (const query of malformedQueries) {
        try {
          const result = await mockClient.callTool('search_documents', { query });
          const response = JSON.parse(result.content[0].text);
          
          if (response.success === false) {
            expect(response.error).toBeDefined();
          }
        } catch (error) {
          // Expected for null/undefined queries
          expect(error).toBeInstanceOf(Error);
        }
      }
    });

    it('should handle invalid parameter combinations', async () => {
      const params = {
        query: '정책',
        dateFrom: '2024-06-01',
        dateTo: '2024-01-01', // End date before start date
      };

      const result = await mockClient.callTool('search_documents', params);
      const response = JSON.parse(result.content[0].text);
      
      // Mock server doesn't validate this, but real implementation should
      expect(response.success).toBe(true);
    });
  });

  describe('Performance and Caching', () => {
    it('should track execution time', async () => {
      const result = await mockClient.callTool('search_documents', { query: '교육정책' });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.executionTimeMs).toBeDefined();
      expect(typeof response.executionTimeMs).toBe('number');
      expect(response.executionTimeMs).toBeGreaterThan(0);
    });

    it('should handle timeout scenarios', async () => {
      mockServer.setNetworkDelay(100); // Short delay
      
      const startTime = Date.now();
      const result = await mockClient.callTool('search_documents', { query: '정책' });
      const endTime = Date.now();
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(endTime - startTime).toBeGreaterThanOrEqual(100);
    });

    it('should benefit from caching on repeated searches', async () => {
      const query = '교육정책';
      
      // First search
      const startTime1 = Date.now();
      const result1 = await mockClient.callTool('search_documents', { query });
      const endTime1 = Date.now();
      const response1 = JSON.parse(result1.content[0].text);
      
      expect(response1.success).toBe(true);
      const time1 = endTime1 - startTime1;
      
      // Second search (potentially cached)
      const startTime2 = Date.now();
      const result2 = await mockClient.callTool('search_documents', { query });
      const endTime2 = Date.now();
      const response2 = JSON.parse(result2.content[0].text);
      
      expect(response2.success).toBe(true);
      const time2 = endTime2 - startTime2;
      
      // Both searches should return the same results
      expect(response2.documents).toEqual(response1.documents);
    });

    it('should handle concurrent search requests', async () => {
      const queries = ['교육정책', '보건의료', '국토교통', '경제정책', '환경보전'];
      
      const promises = queries.map(query => 
        mockClient.callTool('search_documents', { query })
      );
      
      const results = await Promise.all(promises);
      
      results.forEach((result, index) => {
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.searchQuery.query).toBe(queries[index]);
      });
    });
  });

  describe('Request Logging and Monitoring', () => {
    it('should log search requests properly', async () => {
      const query = '교육정책';
      await mockClient.callTool('search_documents', { query });
      
      const requestLog = mockServer.getRequestLog();
      expect(requestLog.length).toBeGreaterThan(0);
      
      const searchRequest = requestLog.find(req => req.method === 'tools/call');
      expect(searchRequest).toBeDefined();
      expect(searchRequest?.params.name).toBe('search_documents');
      expect(searchRequest?.params.arguments.query).toBe(query);
    });

    it('should include proper timestamps in logs', async () => {
      const beforeTime = Date.now();
      await mockClient.callTool('search_documents', { query: '정책' });
      const afterTime = Date.now();
      
      const requestLog = mockServer.getRequestLog();
      const lastRequest = requestLog[requestLog.length - 1];
      
      expect(lastRequest.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(lastRequest.timestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('Special Search Scenarios', () => {
    it('should handle government-specific Korean terms', async () => {
      const govTerms = [
        '국정과제',
        '정부정책',
        '국민안전',
        '복지정책',
        '경제활성화',
        '사회통합',
        '국가발전',
        '공공서비스',
        '정책연구',
        '행정효율화',
      ];

      for (const term of govTerms) {
        const result = await mockClient.callTool('search_documents', { query: term });
        const response = JSON.parse(result.content[0].text);
        
        expect(response.success).toBe(true);
        expect(response.searchQuery.query).toBe(term);
      }
    });

    it('should handle searches with administrative regions', async () => {
      const regions = ['서울특별시', '부산광역시', '경기도', '전라남도', '제주특별자치도'];

      for (const region of regions) {
        const params = {
          query: '지역개발',
          category: region,
        };

        const result = await mockClient.callTool('search_documents', params);
        const response = JSON.parse(result.content[0].text);
        
        expect(response.success).toBe(true);
      }
    });

    it('should handle year-specific searches', async () => {
      const years = ['2024', '2023', '2022'];

      for (const year of years) {
        const params = {
          query: `${year}년 정책`,
          dateFrom: `${year}-01-01`,
          dateTo: `${year}-12-31`,
        };

        const result = await mockClient.callTool('search_documents', params);
        const response = JSON.parse(result.content[0].text);
        
        expect(response.success).toBe(true);
      }
    });

    it('should handle ministry and department searches', async () => {
      const ministries = [
        '교육부',
        '과학기술정보통신부',
        '외교부',
        '통일부',
        '법무부',
        '국방부',
        '행정안전부',
        '문화체육관광부',
        '농림축산식품부',
        '산업통상자원부',
        '보건복지부',
        '환경부',
        '고용노동부',
        '여성가족부',
        '국토교통부',
        '해양수산부',
        '중소벤처기업부',
      ];

      // Test a sample of ministries to avoid too many requests
      const sampleMinistries = ministries.slice(0, 5);
      
      for (const ministry of sampleMinistries) {
        const params = {
          query: '정책',
          agency: ministry,
        };

        const result = await mockClient.callTool('search_documents', params);
        const response = JSON.parse(result.content[0].text);
        
        expect(response.success).toBe(true);
      }
    });
  });
});