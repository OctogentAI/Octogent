// ============================================================================
// Web Fetch Tool - Fetch and parse web page content
// ============================================================================

import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import type { ToolDefinition, ToolContext, ToolResult } from '../../lib/types';

// Maximum content length to return
const MAX_CONTENT_LENGTH = 50000;

interface FetchedPage {
  title: string;
  content: string;
  url: string;
  byline?: string;
  excerpt?: string;
}

/**
 * Fetch and parse a web page using Readability
 */
async function fetchAndParse(url: string): Promise<FetchedPage> {
  // Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  
  // Only allow http/https
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error(`Invalid protocol: ${parsedUrl.protocol}. Only HTTP and HTTPS are allowed.`);
  }
  
  // Fetch the page
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; OpenClaw/1.0; +https://github.com/openclaw)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5'
    },
    signal: AbortSignal.timeout(30000)
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  const contentType = response.headers.get('content-type') || '';
  
  // Handle non-HTML content
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
    const text = await response.text();
    return {
      title: parsedUrl.hostname,
      content: text.substring(0, MAX_CONTENT_LENGTH),
      url
    };
  }
  
  const html = await response.text();
  
  // Parse with JSDOM and Readability
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  
  if (!article) {
    // Fallback: extract text from body
    const body = dom.window.document.body;
    const text = body?.textContent || '';
    return {
      title: dom.window.document.title || parsedUrl.hostname,
      content: cleanText(text).substring(0, MAX_CONTENT_LENGTH),
      url
    };
  }
  
  return {
    title: article.title || dom.window.document.title || parsedUrl.hostname,
    content: cleanText(article.textContent || '').substring(0, MAX_CONTENT_LENGTH),
    url,
    byline: article.byline || undefined,
    excerpt: article.excerpt || undefined
  };
}

/**
 * Clean extracted text
 */
function cleanText(text: string): string {
  return text
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Remove excessive newlines
    .replace(/\n{3,}/g, '\n\n')
    // Trim
    .trim();
}

export const webFetchTool: ToolDefinition = {
  name: 'web_fetch',
  description: 'Fetch and extract the main content from a web page URL. Uses Readability to extract article content, removing navigation, ads, and other clutter. Best for reading articles, documentation, and blog posts.',
  parameters: [
    {
      name: 'url',
      type: 'string',
      description: 'The URL of the web page to fetch',
      required: true
    },
    {
      name: 'include_metadata',
      type: 'boolean',
      description: 'If true, include title, byline, and excerpt in output (default: true)',
      required: false,
      default: true
    }
  ],
  
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const url = args.url as string;
    const includeMetadata = args.include_metadata as boolean ?? true;
    
    if (!url.trim()) {
      return {
        success: false,
        output: '',
        error: 'URL cannot be empty'
      };
    }
    
    try {
      const page = await fetchAndParse(url);
      
      let output = '';
      
      if (includeMetadata) {
        output += `# ${page.title}\n`;
        if (page.byline) output += `By: ${page.byline}\n`;
        if (page.excerpt) output += `\n> ${page.excerpt}\n`;
        output += '\n---\n\n';
      }
      
      output += page.content;
      
      // Truncate if too long
      if (output.length > MAX_CONTENT_LENGTH) {
        output = output.substring(0, MAX_CONTENT_LENGTH) + '\n\n[Content truncated...]';
      }
      
      return {
        success: true,
        output,
        metadata: {
          url: page.url,
          title: page.title,
          byline: page.byline,
          contentLength: page.content.length
        }
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Failed to fetch URL: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
};
