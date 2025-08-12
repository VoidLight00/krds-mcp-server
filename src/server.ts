#!/usr/bin/env node

/**
 * KRDS MCP Server - Main Entry Point
 * 
 * This is the main entry point for the KRDS (Korean government Records Data Service) 
 * MCP (Model Context Protocol) server. This server provides tools for scraping, 
 * processing, and analyzing content from the Korean government KRDS website.
 * 
 * Architecture Overview:
 * =====================
 * 
 * 1. **MCP Server Framework**: Built on @modelcontextprotocol/sdk for standardized
 *    AI model integration and tool registration.
 * 
 * 2. **Layered Architecture**:
 *    - Tools Layer: MCP tool implementations for external API
 *    - Services Layer: Business logic and orchestration
 *    - Scraping Layer: Web scraping with Puppeteer
 *    - Parsing Layer: Content extraction and processing
 *    - Cache Layer: Performance optimization with caching
 *    - Korean Layer: Korean language-specific processing
 * 
 * 3. **Key Features**:
 *    - Korean text processing with Hangul.js
 *    - Intelligent web scraping with retry mechanisms
 *    - Multi-format content export (JSON, CSV, Excel, PDF)
 *    - Image processing and download capabilities
 *    - Comprehensive caching for performance
 *    - Rate limiting and respectful scraping practices
 * 
 * 4. **Data Flow**:
 *    Client → MCP Tool → Service → Scraper → Parser → Cache → Response
 * 
 * @author Your Name
 * @version 1.0.0
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

// Import configuration and utilities
import { loadConfig } from './utils/config.js';
import { setupLogger } from './utils/logger.js';
import { validateEnvironment } from './utils/environment.js';

// Import MCP tools registry
import { 
  registerAllTools, 
  validateToolDependencies,
  checkToolsHealth,
  TOOLS_CONFIG 
} from './tools/index.js';

// Import services for initialization
import { KrdsService } from './services/krds-service.js';
import { CacheManager } from './cache/cache-manager.js';

// Type definitions
import type { Logger } from 'winston';
import type { ServerConfig } from './types/index.js';

/**
 * Main KRDS MCP Server Class
 * 
 * This class orchestrates the entire MCP server, handling:
 * - Server initialization and configuration
 * - Tool registration and management
 * - Service lifecycle management
 * - Error handling and logging
 * - Graceful shutdown procedures
 */
class KrdsMcpServer {
  private server: Server;
  private logger: Logger;
  private config: ServerConfig;
  private krdsService: KrdsService;
  private cacheManager: CacheManager;

  constructor() {
    // Initialize the MCP server with metadata
    this.server = new Server(
      {
        name: 'krds-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
  }

  /**
   * Initialize the server with all required components
   */
  async initialize(): Promise<void> {
    try {
      // Step 1: Validate environment variables
      await validateEnvironment();
      
      // Step 2: Load configuration
      this.config = await loadConfig();
      
      // Step 3: Setup logging
      this.logger = setupLogger(this.config.logging);
      this.logger.info('Starting KRDS MCP Server initialization...');
      
      // Step 4: Initialize core services
      await this.initializeServices();
      
      // Step 5: Register MCP tools
      await this.registerTools();
      
      // Step 6: Setup server event handlers
      this.setupEventHandlers();
      
      this.logger.info('KRDS MCP Server initialization completed successfully');
    } catch (error) {
      console.error('Failed to initialize KRDS MCP Server:', error);
      throw error;
    }
  }

  /**
   * Initialize core services (cache, KRDS service, etc.)
   */
  private async initializeServices(): Promise<void> {
    this.logger.info('Initializing core services...');
    
    // Initialize cache manager
    this.cacheManager = new CacheManager(this.config.cache);
    await this.cacheManager.initialize();
    
    // Initialize KRDS service
    this.krdsService = new KrdsService({
      config: this.config.krds,
      cacheManager: this.cacheManager,
      logger: this.logger.child({ service: 'krds' }),
    });
    await this.krdsService.initialize();
    
    this.logger.info('Core services initialized successfully');
  }  /**
   * Register all MCP tools with the server
   */
  private async registerTools(): Promise<void> {
    this.logger.info('Registering MCP tools...', {
      totalTools: TOOLS_CONFIG.totalTools,
      version: TOOLS_CONFIG.version,
      categories: TOOLS_CONFIG.categories
    });
    
    const toolContext = {
      krdsService: this.krdsService,
      cacheManager: this.cacheManager,
      logger: this.logger,
      config: this.config,
    };
    
    // Validate tool dependencies before registration
    const dependencyValidation = validateToolDependencies(toolContext);
    const invalidTools = dependencyValidation.filter(v => !v.valid);
    
    if (invalidTools.length > 0) {
      this.logger.warn('Some tools have missing dependencies', {
        invalidTools: invalidTools.map(t => ({
          tool: t.tool,
          missingDependencies: t.missingDependencies
        }))
      });
    }
    
    // Register all tools using centralized registry
    await registerAllTools(this.server, toolContext);
    
    // Perform health check on registered tools
    const healthResults = await checkToolsHealth(toolContext);
    const unhealthyTools = healthResults.filter(h => !h.healthy);
    
    if (unhealthyTools.length > 0) {
      this.logger.warn('Some tools are not healthy after registration', {
        unhealthyTools: unhealthyTools.map(t => ({
          tool: t.tool,
          status: t.status
        }))
      });
    }
    
    this.logger.info('All MCP tools registered successfully', {
      totalTools: TOOLS_CONFIG.totalTools,
      healthyTools: healthResults.filter(h => h.healthy).length,
      unhealthyTools: unhealthyTools.length
    });
  }

  /**
   * Setup server event handlers for request processing
   */
  private setupEventHandlers(): void {
    // Handle tool listing requests
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      this.logger.debug('Received list_tools request');
      // Tools are automatically listed by the registered handlers
      return { tools: [] };
    });

    // Handle tool execution requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      this.logger.debug(`Received call_tool request: ${request.params.name}`);
      
      try {
        // Tools are handled by their individual handlers
        // This is a fallback that should not normally be reached
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${request.params.name}`
        );
      } catch (error) {
        this.logger.error(`Tool execution error: ${error}`);
        throw error;
      }
    });
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    try {
      this.logger.info('Starting KRDS MCP Server...');
      
      // Create stdio transport for MCP communication
      const transport = new StdioServerTransport();
      
      // Connect the server to the transport
      await this.server.connect(transport);
      
      this.logger.info('KRDS MCP Server started successfully and ready for requests');
      
      // Setup graceful shutdown handlers
      this.setupShutdownHandlers();
      
    } catch (error) {
      this.logger.error('Failed to start KRDS MCP Server:', error);
      throw error;
    }
  }

  /**
   * Setup graceful shutdown procedures
   */
  private setupShutdownHandlers(): void {
    const shutdownHandler = async (signal: string) => {
      this.logger.info(`Received ${signal}, initiating graceful shutdown...`);
      
      try {
        // Close services in reverse order of initialization
        if (this.krdsService) {
          await this.krdsService.shutdown();
        }
        
        if (this.cacheManager) {
          await this.cacheManager.shutdown();
        }
        
        // Close server
        await this.server.close();
        
        this.logger.info('KRDS MCP Server shutdown completed');
        process.exit(0);
      } catch (error) {
        this.logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    // Register shutdown handlers for various signals
    process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
    process.on('SIGINT', () => shutdownHandler('SIGINT'));
    process.on('SIGHUP', () => shutdownHandler('SIGHUP'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception:', error);
      shutdownHandler('uncaughtException');
    });
    
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled rejection at:', promise, 'reason:', reason);
      shutdownHandler('unhandledRejection');
    });
  }
}

/**
 * Application entry point
 * 
 * This function initializes and starts the KRDS MCP Server.
 * It handles any startup errors and ensures proper logging.
 */
async function main(): Promise<void> {
  try {
    const server = new KrdsMcpServer();
    await server.initialize();
    await server.start();
  } catch (error) {
    console.error('Failed to start KRDS MCP Server:', error);
    process.exit(1);
  }
}

// Start the server if this module is the main entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { KrdsMcpServer };