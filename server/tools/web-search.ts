// ============================================================================
// Web Search Tool - Search the web using SearXNG or DuckDuckGo
// ============================================================================

import type { ToolDefinition, ToolContext, ToolResult } from '../../lib/types';
import { getConfig } from '../config';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source?: string;
}

interface SearXNGResult {
  title: string;
  url: string;
  content: string;
  engine: string;
}

interface SearXNGResponse {
  results: SearXNGResult[];
  query: string;
  number_of_results: number;
}

interface DuckDuckGoResult {
  FirstURL: string;
  Text: string;
  Result: string;
}

interface DuckDuckGoResponse {
  Abstract: string;
  AbstractURL: string;
  AbstractSource: string;
  RelatedTopics: DuckDuckGoResult[];
}

/**
 * Search using SearXNG (self-hosted meta-search engine)
 */
async function searchSearXNG(query: string, numResults: number): Promise<SearchResult[]> {
  const config = getConfig();
  const baseUrl = config.tools.searxng_url || 'http://localhost:8080';
  
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    categories: 'general',
    language: 'en'
  });
  
  const response = await fetch(`${baseUrl}/search?${params}`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    },
    signal: AbortSignal.timeout(10000)
  });
  
  if (!response.ok) {
    throw new Error(`SearXNG search failed: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json() as SearXNGResponse;
  
  return data.results.slice(0, numResults).map(result => ({
    title: result.title,
    url: result.url,
    snippet: result.content,
    source: result.engine
  }));
}

/**
 * Search using DuckDuckGo Instant Answer API (fallback)
 */
async function searchDuckDuckGo(query: string, numResults: number): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    no_html: '1',
    skip_disambig: '1'
  });
  
  const response = await fetch(`https://api.duckduckgo.com/?${params}`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    },
    signal: AbortSignal.timeout(10000)
  });
  
  if (!response.ok) {
    throw new Error(`DuckDuckGo search failed: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json() as DuckDuckGoResponse;
  const results: SearchResult[] = [];
  
  // Add abstract if available
  if (data.Abstract) {
    results.push({
      title: data.AbstractSource || 'Summary',
      url: data.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
      snippet: data.Abstract,
      source: 'DuckDuckGo Abstract'
    });
  }
  
  // Add related topics
  for (const topic of data.RelatedTopics) {
    if (results.length >= numResults) break;
    
    if (topic.FirstURL && topic.Text) {
      results.push({
        title: topic.Text.split(' - ')[0] || topic.Text.substring(0, 100),
        url: topic.FirstURL,
        snippet: topic.Text,
        source: 'DuckDuckGo'
      });
    }
  }
  
  return results;
}

/**
 * Check if SearXNG is available
 */
async function isSearXNGAvailable(): Promise<boolean> {
  const config = getConfig();
  const baseUrl = config.tools.searxng_url || 'http://localhost:8080';
  
  try {
    const response = await fetch(`${baseUrl}/healthz`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

export const webSearchTool: ToolDefinition = {
  name: 'web_search',
  description: 'Search the web for information. Returns a list of relevant results with titles, URLs, and snippets. Use this to find current information, documentation, or research topics.',
  parameters: [
    {
      name: 'query',
      type: 'string',
      description: 'The search query',
      required: true
    },
    {
      name: 'num_results',
      type: 'number',
      description: 'Maximum number of results to return (default: 5, max: 20)',
      required: false,
      default: 5
    }
  ],
  
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const query = args.query as string;
    const numResults = Math.min(Math.max(1, (args.num_results as number) || 5), 20);
    
    if (!query.trim()) {
      return {
        success: false,
        output: '',
        error: 'Search query cannot be empty'
      };
    }
    
    let results: SearchResult[] = [];
    let source = '';
    
    try {
      // Try SearXNG first
      if (await isSearXNGAvailable()) {
        results = await searchSearXNG(query, numResults);
        source = 'SearXNG';
      } else {
        // Fallback to DuckDuckGo
        results = await searchDuckDuckGo(query, numResults);
        source = 'DuckDuckGo';
      }
    } catch (error) {
      // If primary fails, try fallback
      if (source === 'SearXNG') {
        try {
          results = await searchDuckDuckGo(query, numResults);
          source = 'DuckDuckGo (fallback)';
        } catch (fallbackError) {
          return {
            success: false,
            output: '',
            error: `Search failed: ${error instanceof Error ? error.message : String(error)}`
          };
        }
      } else {
        return {
          success: false,
          output: '',
          error: `Search failed: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
    
    if (results.length === 0) {
      return {
        success: true,
        output: `No results found for: "${query}"`,
        metadata: { query, source, count: 0 }
      };
    }
    
    // Format results
    const formattedResults = results.map((result, i) => {
      return `${i + 1}. ${result.title}
   URL: ${result.url}
   ${result.snippet}`;
    }).join('\n\n');
    
    return {
      success: true,
      output: `Search results for "${query}" (via ${source}):\n\n${formattedResults}`,
      metadata: {
        query,
        source,
        count: results.length,
        results: results.map(r => ({ title: r.title, url: r.url }))
      }
    };
  }
};
