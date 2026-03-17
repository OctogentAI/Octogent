// ============================================================================
// Memory Tools - Save and retrieve information across sessions
// ============================================================================

import type { ToolDefinition, ToolContext, ToolResult } from '../../lib/types';
import { saveMemory, getMemory, listMemory, searchMemory, deleteMemory } from '../db/memory';

export const memorySaveTool: ToolDefinition = {
  name: 'memory_save',
  description: 'Save information to persistent memory. Use this to remember important facts, findings, or data that should be accessible later. Memory can be session-specific or global.',
  parameters: [
    {
      name: 'key',
      type: 'string',
      description: 'A unique key to identify this memory (e.g., "project_requirements", "api_endpoints")',
      required: true
    },
    {
      name: 'value',
      type: 'string',
      description: 'The content to store',
      required: true
    },
    {
      name: 'global',
      type: 'boolean',
      description: 'If true, memory is global (accessible across sessions). If false, memory is session-specific. (default: false)',
      required: false,
      default: false
    }
  ],
  
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const key = args.key as string;
    const value = args.value as string;
    const global = args.global as boolean ?? false;
    
    if (!key.trim()) {
      return {
        success: false,
        output: '',
        error: 'Memory key cannot be empty'
      };
    }
    
    if (!value.trim()) {
      return {
        success: false,
        output: '',
        error: 'Memory value cannot be empty'
      };
    }
    
    // Validate key format (alphanumeric, underscores, hyphens, dots)
    if (!/^[\w\-\.]+$/.test(key)) {
      return {
        success: false,
        output: '',
        error: 'Memory key can only contain letters, numbers, underscores, hyphens, and dots'
      };
    }
    
    try {
      const entry = saveMemory({
        key,
        value,
        sessionId: global ? null : context.sessionId,
        metadata: {
          savedBy: 'agent',
          taskId: context.taskId
        }
      });
      
      const scope = global ? 'global' : 'session';
      
      return {
        success: true,
        output: `Saved to ${scope} memory: "${key}" (${value.length} characters)`,
        metadata: {
          id: entry.id,
          key: entry.key,
          scope,
          size: value.length
        }
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Failed to save memory: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
};

export const memoryReadTool: ToolDefinition = {
  name: 'memory_read',
  description: 'Read information from persistent memory. Use this to recall previously saved facts or data. Can retrieve by exact key, list keys with a prefix, or search content.',
  parameters: [
    {
      name: 'key',
      type: 'string',
      description: 'The key of the memory to retrieve (optional if using list or search)',
      required: false
    },
    {
      name: 'list_prefix',
      type: 'string',
      description: 'List all memories with keys starting with this prefix (optional)',
      required: false
    },
    {
      name: 'search',
      type: 'string',
      description: 'Search memory content for this text (optional)',
      required: false
    },
    {
      name: 'global',
      type: 'boolean',
      description: 'If true, read from global memory. If false, read from session memory. (default: false)',
      required: false,
      default: false
    },
    {
      name: 'include_global',
      type: 'boolean',
      description: 'If true (and global is false), also include global memories in results (default: true)',
      required: false,
      default: true
    }
  ],
  
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const key = args.key as string | undefined;
    const listPrefix = args.list_prefix as string | undefined;
    const searchQuery = args.search as string | undefined;
    const global = args.global as boolean ?? false;
    const includeGlobal = args.include_global as boolean ?? true;
    
    // Must provide at least one of key, list_prefix, or search
    if (!key && !listPrefix && !searchQuery) {
      return {
        success: false,
        output: '',
        error: 'Must provide either key, list_prefix, or search parameter'
      };
    }
    
    const sessionId = global ? null : context.sessionId;
    
    try {
      // Exact key lookup
      if (key) {
        const entry = getMemory(key, sessionId);
        
        // If session-specific not found, try global
        if (!entry && !global && includeGlobal) {
          const globalEntry = getMemory(key, null);
          if (globalEntry) {
            return {
              success: true,
              output: `[Global Memory: ${key}]\n\n${globalEntry.value}`,
              metadata: {
                id: globalEntry.id,
                key: globalEntry.key,
                scope: 'global',
                updatedAt: globalEntry.updated_at
              }
            };
          }
        }
        
        if (!entry) {
          return {
            success: true,
            output: `Memory not found: "${key}"`,
            metadata: { found: false }
          };
        }
        
        return {
          success: true,
          output: `[Memory: ${key}]\n\n${entry.value}`,
          metadata: {
            id: entry.id,
            key: entry.key,
            scope: entry.session_id ? 'session' : 'global',
            updatedAt: entry.updated_at
          }
        };
      }
      
      // List by prefix
      if (listPrefix) {
        const { entries } = listMemory({ sessionId, prefix: listPrefix, limit: 50 });
        
        // Also get global entries if requested
        let globalEntries: typeof entries = [];
        if (!global && includeGlobal) {
          const globalResult = listMemory({ sessionId: null, prefix: listPrefix, limit: 50 });
          globalEntries = globalResult.entries;
        }
        
        const allEntries = [...entries, ...globalEntries];
        
        if (allEntries.length === 0) {
          return {
            success: true,
            output: `No memories found with prefix: "${listPrefix}"`,
            metadata: { count: 0 }
          };
        }
        
        const formatted = allEntries.map(e => {
          const scope = e.session_id ? 'session' : 'global';
          const preview = e.value.substring(0, 100) + (e.value.length > 100 ? '...' : '');
          return `- ${e.key} [${scope}]: ${preview}`;
        }).join('\n');
        
        return {
          success: true,
          output: `Memories with prefix "${listPrefix}":\n\n${formatted}`,
          metadata: {
            count: allEntries.length,
            keys: allEntries.map(e => e.key)
          }
        };
      }
      
      // Search
      if (searchQuery) {
        const entries = searchMemory({ query: searchQuery, sessionId, limit: 20 });
        
        // Also search global if requested
        let globalEntries: typeof entries = [];
        if (!global && includeGlobal) {
          globalEntries = searchMemory({ query: searchQuery, sessionId: null, limit: 20 });
        }
        
        const allEntries = [...entries, ...globalEntries];
        
        // Deduplicate by ID
        const uniqueEntries = allEntries.filter((e, i, arr) => 
          arr.findIndex(x => x.id === e.id) === i
        );
        
        if (uniqueEntries.length === 0) {
          return {
            success: true,
            output: `No memories found matching: "${searchQuery}"`,
            metadata: { count: 0 }
          };
        }
        
        const formatted = uniqueEntries.map(e => {
          const scope = e.session_id ? 'session' : 'global';
          const preview = e.value.substring(0, 200) + (e.value.length > 200 ? '...' : '');
          return `## ${e.key} [${scope}]\n${preview}\n`;
        }).join('\n');
        
        return {
          success: true,
          output: `Search results for "${searchQuery}":\n\n${formatted}`,
          metadata: {
            count: uniqueEntries.length,
            keys: uniqueEntries.map(e => e.key)
          }
        };
      }
      
      return {
        success: false,
        output: '',
        error: 'Invalid operation'
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Failed to read memory: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
};
