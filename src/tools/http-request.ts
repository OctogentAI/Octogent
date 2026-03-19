// ============================================================================
// Tool: http_request — make arbitrary HTTP requests (API calls, webhooks, etc.)
// ============================================================================

import type { ToolDefinition, ToolContext, ToolResult } from '../types.js';

export interface HttpRequestArgs {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  follow_redirects?: boolean;
}

async function executeHttpRequest(
  args: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolResult> {
  const {
    url,
    method = 'GET',
    headers = {},
    body,
    timeout = 30,
    follow_redirects = true,
  } = args as HttpRequestArgs;

  if (!url || typeof url !== 'string') {
    return { success: false, output: '', error: 'url is required' };
  }

  // Block private network IPs for safety
  if (/^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url)) {
    return {
      success: false,
      output: '',
      error: 'Requests to private/loopback addresses are not allowed.',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout * 1000);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'User-Agent': 'Octogent-Agent/1.0',
        ...headers,
      },
      body: body ? body : undefined,
      redirect: follow_redirects ? 'follow' : 'manual',
      signal: controller.signal,
    });

    clearTimeout(timer);

    const responseText = await response.text();

    // Try to pretty-print JSON responses
    let formattedBody = responseText;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        formattedBody = JSON.stringify(JSON.parse(responseText), null, 2);
      } catch { /* leave as-is */ }
    }

    const headerEntries = Array.from(response.headers.entries())
      .map(([k, v]) => `  ${k}: ${v}`)
      .join('\n');

    const output = [
      `HTTP ${response.status} ${response.statusText}`,
      `URL: ${response.url}`,
      'Headers:',
      headerEntries,
      '',
      formattedBody.length > 8000
        ? formattedBody.slice(0, 8000) + '\n[... response truncated ...]'
        : formattedBody,
    ].join('\n');

    return {
      success: response.ok,
      output,
      metadata: {
        status: response.status,
        statusText: response.statusText,
        contentType,
        byteLength: responseText.length,
      },
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    const e = err as Error;
    if (e.name === 'AbortError') {
      return { success: false, output: '', error: `Request timed out after ${timeout}s` };
    }
    return { success: false, output: '', error: `Request failed: ${e.message}` };
  }
}

export const httpRequestTool: ToolDefinition = {
  name: 'http_request',
  description:
    'Make an HTTP request to any public URL. Supports GET, POST, PUT, PATCH, DELETE. ' +
    'Useful for calling external APIs, webhooks, or fetching raw data.',
  parameters: [
    {
      name: 'url',
      type: 'string',
      description: 'The URL to request.',
      required: true,
    },
    {
      name: 'method',
      type: 'string',
      description: 'HTTP method: GET | POST | PUT | PATCH | DELETE | HEAD. Default: GET.',
      required: false,
      default: 'GET',
    },
    {
      name: 'headers',
      type: 'object',
      description: 'Optional request headers as key-value pairs.',
      required: false,
    },
    {
      name: 'body',
      type: 'string',
      description: 'Optional request body (string). Use JSON.stringify for JSON.',
      required: false,
    },
    {
      name: 'timeout',
      type: 'number',
      description: 'Request timeout in seconds. Default: 30.',
      required: false,
      default: 30,
    },
    {
      name: 'follow_redirects',
      type: 'boolean',
      description: 'Whether to follow redirects. Default: true.',
      required: false,
      default: true,
    },
  ],
  execute: executeHttpRequest,
};
