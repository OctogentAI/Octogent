// ============================================================================
// Webhook Channel - HTTP endpoint for external task submission
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:18789';

interface WebhookPayload {
  task: string;
  session_id?: string;
  webhook_url?: string;
  secret?: string;
  metadata?: Record<string, unknown>;
}

interface TaskResponse {
  task_id: string;
  session_id: string;
  status: string;
  created_at: number;
}

/**
 * POST /api/webhook
 * Submit a task via webhook
 */
export async function POST(request: NextRequest) {
  try {
    // Verify webhook secret if configured
    const webhookSecret = process.env.WEBHOOK_SECRET;
    if (webhookSecret) {
      const authHeader = request.headers.get('authorization');
      const providedSecret = authHeader?.replace('Bearer ', '');
      
      if (providedSecret !== webhookSecret) {
        return NextResponse.json(
          { error: 'Unauthorized', message: 'Invalid webhook secret' },
          { status: 401 }
        );
      }
    }

    // Parse payload
    const payload: WebhookPayload = await request.json();

    if (!payload.task || typeof payload.task !== 'string') {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Missing or invalid "task" field' },
        { status: 400 }
      );
    }

    // Generate IDs
    const taskId = `webhook-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const sessionId = payload.session_id || `webhook-session-${Date.now()}`;

    // Submit to gateway
    const gatewayResponse = await fetch(`${GATEWAY_URL}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        task: payload.task,
        session_id: sessionId,
        task_id: taskId,
        metadata: {
          ...payload.metadata,
          source: 'webhook',
          webhook_url: payload.webhook_url
        }
      })
    });

    if (!gatewayResponse.ok) {
      const error = await gatewayResponse.text();
      return NextResponse.json(
        { error: 'Gateway Error', message: error },
        { status: 502 }
      );
    }

    const result = await gatewayResponse.json();

    const response: TaskResponse = {
      task_id: result.task_id || taskId,
      session_id: sessionId,
      status: 'pending',
      created_at: Date.now()
    };

    // If callback URL provided, store it for later
    if (payload.webhook_url) {
      // In production, store this in Redis/DB for callback
      console.log(`[webhook] Callback URL registered: ${payload.webhook_url}`);
    }

    return NextResponse.json(response, { status: 202 });

  } catch (error) {
    console.error('[webhook] Error processing request:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal Server Error', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/webhook
 * Health check and documentation
 */
export async function GET() {
  return NextResponse.json({
    name: 'Octogent Webhook API',
    version: '1.0.0',
    endpoints: {
      'POST /api/webhook': {
        description: 'Submit a task via webhook',
        body: {
          task: 'string (required) - The task to execute',
          session_id: 'string (optional) - Session ID for grouping tasks',
          webhook_url: 'string (optional) - URL to call when task completes',
          secret: 'string (optional) - Additional authentication',
          metadata: 'object (optional) - Custom metadata'
        },
        headers: {
          'Authorization': 'Bearer <WEBHOOK_SECRET> (if configured)'
        },
        response: {
          task_id: 'string - Unique task identifier',
          session_id: 'string - Session identifier',
          status: 'string - Task status',
          created_at: 'number - Unix timestamp'
        }
      }
    },
    example: {
      curl: `curl -X POST ${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/webhook \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_SECRET" \\
  -d '{"task": "Write a hello world script in Python"}'`
    }
  });
}
