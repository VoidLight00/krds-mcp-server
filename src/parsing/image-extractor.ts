/**
 * Image Extractor for KRDS Documents
 * 
 * Specialized extractor for images and visual content with metadata extraction,
 * including alt text, captions, and Korean descriptions. Handles various image
 * formats and provides detailed metadata for accessibility and content analysis.
 * 
 * Features:
 * - Image URL extraction and normalization
 * - Alt text and caption processing
 * - Korean text extraction from images
 * - Image dimension and format detection
 * - Accessibility metadata extraction
 * - Base64 embedded image handling
 * 
 * @author KRDS MCP Server
 * @version 1.0.0
 */

import * as cheerio from 'cheerio';
import type { CheerioAPI, Element } from 'cheerio';
import { Logger } from 'winston';
import { KrdsImage, KrdsError } from '../types/index.js';
import { URL } from 'url';

/**
 * Image extraction options
 */
export interface ImageExtractionOptions {
  /** Extract inline/base64 images */
  extractInlineImages: boolean;
  /** Process Korean text in alt/caption */
  processKoreanText: boolean;
  /** Generate download URLs */
  generateDownloadUrls: boolean;
  /** Extract image dimensions if available */
  extractDimensions: boolean;
  /** Maximum number of images to process */
  maxImages: number;
  /** Minimum image size to include (pixels) */
  minImageSize: number;
  /** Extract images from CSS background-image */
  extractBackgroundImages: boolean;
  /** Include decorative images (no alt text) */
  includeDecorativeImages: boolean;
}

/**
 * Default image extraction options
 */
export const DEFAULT_IMAGE_OPTIONS: ImageExtractionOptions = {
  extractInlineImages: true,
  processKoreanText: true,
  generateDownloadUrls: true,
  extractDimensions: true,
  maxImages: 100,
  minImageSize: 0,
  extractBackgroundImages: false,
  includeDecorativeImages: true,
};

/**
 * Image context information
 */
export interface ImageContext {
  /** Parent element tag name */
  parentTag: string;
  /** Surrounding text context */
  context: string;
  /** CSS classes */
  cssClasses: string[];
  /** Role/purpose indicators */
  role: 'content' | 'decorative' | 'logo' | 'diagram' | 'photo' | 'icon' | 'chart';
  /** Position in document */
  position: number;
}

/**
 * Image extractor class
 */
export class ImageExtractor {
  private imageCounter = 0;

  constructor(private logger: Logger) {}

  /**
   * Extract all images from the document
   */
  public async extractImages(
    $: CheerioAPI,
    baseUrl: string,
    options: Partial<ImageExtractionOptions> = {}
  ): Promise<KrdsImage[]> {
    const opts = { ...DEFAULT_IMAGE_OPTIONS, ...options };
    const images: KrdsImage[] = [];
    this.imageCounter = 0;

    try {
      this.logger.debug('Starting image extraction', { baseUrl, options: opts });

      // Extract regular img tags
      $('img').each((index, element) => {
        if (images.length >= opts.maxImages) return false;
        
        const image = this.processImageElement($, $(element), baseUrl, opts, index);
        if (image && this.isValidImage(image, opts)) {
          images.push(image);
        }
      });

      // Extract background images if enabled
      if (opts.extractBackgroundImages) {
        this.extractBackgroundImages($, baseUrl, opts, images);
      }

      // Extract SVG images
      $('svg').each((index, element) => {
        if (images.length >= opts.maxImages) return false;
        
        const image = this.processSvgElement($, $(element), baseUrl, opts);
        if (image && this.isValidImage(image, opts)) {
          images.push(image);
        }
      });

      // Sort images by position in document
      images.sort((a, b) => (a as any).position - (b as any).position);

      this.logger.info('Image extraction completed', {
        baseUrl,
        imagesFound: images.length,
        maxImages: opts.maxImages,
      });

      return images;

    } catch (error) {
      this.logger.error('Image extraction failed', {
        baseUrl,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new KrdsError(
        'PARSING_ERROR',
        `Failed to extract images from ${baseUrl}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
        { baseUrl }
      );
    }
  }

  /**
   * Process a single img element
   */
  private processImageElement(
    $: CheerioAPI,
    img: cheerio.Cheerio<Element>,
    baseUrl: string,
    options: ImageExtractionOptions,
    position: number
  ): KrdsImage | null {
    try {
      const src = img.attr('src');
      if (!src) return null;

      // Skip if it's a tracking pixel or very small image
      const width = this.parseNumber(img.attr('width'));
      const height = this.parseNumber(img.attr('height'));
      
      if (width && height && (width < options.minImageSize || height < options.minImageSize)) {
        return null;
      }

      // Extract basic attributes
      const alt = img.attr('alt') || '';
      const title = img.attr('title') || '';
      
      // Generate URLs
      const imageUrl = this.resolveUrl(src, baseUrl);
      const downloadUrl = options.generateDownloadUrls ? imageUrl : undefined;

      // Extract context information
      const context = this.extractImageContext($, img, position);
      
      // Find associated caption
      const caption = this.findCaption($, img);

      // Determine image format
      const format = this.extractImageFormat(src, img);

      // Generate unique ID
      const id = this.generateImageId(imageUrl, position);

      const image: KrdsImage = {
        id,
        url: imageUrl,
        alt,
        altKorean: options.processKoreanText ? this.processKoreanText(alt) : alt,
        caption: caption || title || undefined,
        captionKorean: options.processKoreanText ? this.processKoreanText(caption || title || '') : undefined,
        width,
        height,
        format,
        sizeBytes: 0, // Would need HTTP request to determine
        downloadUrl,
        localPath: undefined,
      };

      // Add context as metadata
      (image as any).context = context;
      (image as any).position = position;

      return image;

    } catch (error) {
      this.logger.warn('Failed to process image element', {
        error: error instanceof Error ? error.message : 'Unknown error',
        position,
      });
      return null;
    }
  }

  /**
   * Process SVG elements
   */
  private processSvgElement(
    $: CheerioAPI,
    svg: cheerio.Cheerio<Element>,
    baseUrl: string,
    options: ImageExtractionOptions
  ): KrdsImage | null {
    try {
      // Extract SVG attributes
      const title = svg.find('title').first().text().trim();
      const desc = svg.find('desc').first().text().trim();
      const alt = title || desc || 'SVG Image';

      const width = this.parseNumber(svg.attr('width'));
      const height = this.parseNumber(svg.attr('height'));

      // Create data URL for SVG
      const svgHtml = svg.html() || '';
      const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(svgHtml).toString('base64')}`;

      const id = this.generateImageId(svgDataUrl, this.imageCounter++);

      return {
        id,
        url: svgDataUrl,
        alt,
        altKorean: options.processKoreanText ? this.processKoreanText(alt) : alt,
        caption: desc || undefined,
        captionKorean: options.processKoreanText ? this.processKoreanText(desc) : undefined,
        width,
        height,
        format: 'svg',
        sizeBytes: Buffer.from(svgHtml).length,
        downloadUrl: undefined,
        localPath: undefined,
      };

    } catch (error) {
      this.logger.warn('Failed to process SVG element', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Extract background images from CSS
   */
  private extractBackgroundImages(
    $: CheerioAPI,
    baseUrl: string,
    options: ImageExtractionOptions,
    images: KrdsImage[]
  ): void {
    $('[style*="background-image"]').each((index, element) => {
      if (images.length >= options.maxImages) return false;

      const style = $(element).attr('style') || '';
      const matches = style.match(/background-image:\s*url\(['"]?([^'")]+)['"]?\)/);
      
      if (matches && matches[1]) {
        const imageUrl = this.resolveUrl(matches[1], baseUrl);
        const format = this.extractImageFormat(matches[1]);
        
        if (format !== 'unknown') {
          const id = this.generateImageId(imageUrl, this.imageCounter++);
          
          images.push({
            id,
            url: imageUrl,
            alt: 'Background Image',
            altKorean: '배경 이미지',
            width: undefined,
            height: undefined,
            format,
            sizeBytes: 0,
            downloadUrl: options.generateDownloadUrls ? imageUrl : undefined,
            localPath: undefined,
          });
        }
      }
    });
  }

  /**
   * Extract context information around an image
   */
  private extractImageContext(
    $: CheerioAPI,
    img: cheerio.Cheerio<Element>,
    position: number
  ): ImageContext {
    const parent = img.parent();
    const parentTag = parent.prop('tagName')?.toLowerCase() || 'unknown';
    
    // Get surrounding text context (previous and next text nodes)
    const contextElements = img.parent().contents().filter((_, el) => 
      el.type === 'text' || (el.type === 'tag' && ['p', 'span', 'div'].includes(el.tagName?.toLowerCase()))
    );
    
    let context = '';
    contextElements.each((_, el) => {
      const text = $(el).text().trim();
      if (text && context.length < 200) {
        context += text + ' ';
      }
    });

    // Extract CSS classes
    const cssClasses = (img.attr('class') || '').split(/\s+/).filter(cls => cls.length > 0);
    
    // Determine role
    const role = this.determineImageRole(img, cssClasses, context);

    return {
      parentTag,
      context: context.trim(),
      cssClasses,
      role,
      position,
    };
  }

  /**
   * Find caption associated with an image
   */
  private findCaption($: CheerioAPI, img: cheerio.Cheerio<Element>): string {
    // Look for figcaption in parent figure
    const figure = img.closest('figure');
    if (figure.length > 0) {
      const figcaption = figure.find('figcaption');
      if (figcaption.length > 0) {
        return figcaption.text().trim();
      }
    }

    // Look for caption in parent with caption class
    const captionParent = img.closest('.caption, .image-caption, .img-caption');
    if (captionParent.length > 0) {
      return captionParent.text().trim();
    }

    // Look for next sibling with caption-like content
    let nextSibling = img.next();
    while (nextSibling.length > 0) {
      const tagName = nextSibling.prop('tagName')?.toLowerCase();
      const className = nextSibling.attr('class') || '';
      
      if (tagName === 'p' || className.includes('caption')) {
        const text = nextSibling.text().trim();
        if (text.length > 0 && text.length < 200) {
          return text;
        }
      }
      
      if (tagName && !['br', 'span'].includes(tagName)) break;
      nextSibling = nextSibling.next();
    }

    return '';
  }

  /**
   * Determine the role/purpose of an image
   */
  private determineImageRole(
    img: cheerio.Cheerio<Element>,
    cssClasses: string[],
    context: string
  ): ImageContext['role'] {
    const alt = img.attr('alt') || '';
    const src = img.attr('src') || '';

    // Check CSS classes for role indicators
    if (cssClasses.some(cls => cls.includes('logo'))) return 'logo';
    if (cssClasses.some(cls => cls.includes('icon'))) return 'icon';
    if (cssClasses.some(cls => cls.includes('chart') || cls.includes('graph'))) return 'chart';
    if (cssClasses.some(cls => cls.includes('diagram'))) return 'diagram';
    if (cssClasses.some(cls => cls.includes('photo') || cls.includes('picture'))) return 'photo';

    // Check filename for indicators
    if (/\b(logo|icon|bullet|arrow|spacer|pixel)\b/i.test(src)) return 'decorative';
    if (/\b(chart|graph|diagram|figure)\b/i.test(src)) return 'chart';

    // Check alt text for indicators
    if (/\b(logo|아이콘|로고)\b/i.test(alt)) return 'logo';
    if (/\b(chart|graph|도표|차트|그래프)\b/i.test(alt)) return 'chart';
    if (/\b(diagram|도식|다이어그램)\b/i.test(alt)) return 'diagram';

    // Empty alt suggests decorative
    if (!alt.trim()) return 'decorative';

    // Default to content image
    return 'content';
  }

  /**
   * Extract image format from URL or element
   */
  private extractImageFormat(src: string, img?: cheerio.Cheerio<Element>): string {
    // Check data URLs
    if (src.startsWith('data:image/')) {
      const match = src.match(/^data:image\/([^;]+)/);
      return match ? match[1] : 'unknown';
    }

    // Check file extension
    const match = src.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
    if (match) {
      const ext = match[1].toLowerCase();
      const validFormats = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff'];
      return validFormats.includes(ext) ? ext : 'unknown';
    }

    // Check MIME type if available (rare in HTML)
    if (img) {
      const type = img.attr('type');
      if (type && type.startsWith('image/')) {
        return type.substring(6);
      }
    }

    return 'unknown';
  }

  /**
   * Resolve relative URLs to absolute
   */
  private resolveUrl(url: string, baseUrl: string): string {
    try {
      // Already absolute URL
      if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
        return url;
      }

      // Resolve relative URL
      return new URL(url, baseUrl).toString();
    } catch (error) {
      this.logger.warn('Failed to resolve image URL', { url, baseUrl, error });
      return url;
    }
  }

  /**
   * Parse numeric value from string
   */
  private parseNumber(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const num = parseInt(value, 10);
    return isNaN(num) ? undefined : num;
  }

  /**
   * Process Korean text (placeholder for actual Korean text processing)
   */
  private processKoreanText(text: string): string {
    // This would integrate with the Korean text processor
    // For now, just return the original text
    return text.trim();
  }

  /**
   * Generate unique image ID
   */
  private generateImageId(url: string, position: number): string {
    const hash = Buffer.from(`${url}_${position}`).toString('base64').substring(0, 12);
    return `img_${hash}`;
  }

  /**
   * Validate if an image should be included in results
   */
  private isValidImage(image: KrdsImage, options: ImageExtractionOptions): boolean {
    // Skip decorative images if not wanted
    if (!options.includeDecorativeImages && (image as any).context?.role === 'decorative') {
      return false;
    }

    // Skip very small images (likely tracking pixels)
    if (image.width && image.height) {
      if (image.width < options.minImageSize || image.height < options.minImageSize) {
        return false;
      }
    }

    // Skip invalid URLs
    if (!image.url || image.url === 'about:blank') {
      return false;
    }

    // Skip images with no meaningful content
    if (!image.alt && !image.caption && (image as any).context?.role === 'decorative') {
      return false;
    }

    return true;
  }
}