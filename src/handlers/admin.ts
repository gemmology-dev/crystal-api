/**
 * Admin Handlers - /api/admin/* endpoints
 * Manage invite codes and access requests
 */

import type { Context } from 'hono';

// Types for KV stored data
interface InviteCode {
  created: number;
  uses: number;
  maxUses: number | null;
  label: string;
}

interface AccessRequest {
  email: string;
  reason: string;
  submitted: number;
  status: 'pending' | 'approved' | 'rejected';
}

interface Env {
  INVITE_CODES: KVNamespace;
  CODE_REQUESTS: KVNamespace;
}

// Response types
interface RequestWithId extends AccessRequest {
  id: string;
}

interface CodeWithId extends InviteCode {
  code: string;
}

/**
 * Generate a random invite code
 * Format: GEMSTONE-XXXX-XXXX (where X is alphanumeric)
 */
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars: I, O, 0, 1
  const segment = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `GEMSTONE-${segment()}-${segment()}`;
}

/**
 * List all pending access requests
 * GET /api/admin/requests
 */
export async function listRequestsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const requests: RequestWithId[] = [];
    const list = await c.env.CODE_REQUESTS.list({ prefix: 'request:' });

    for (const key of list.keys) {
      const request = (await c.env.CODE_REQUESTS.get(key.name, 'json')) as AccessRequest | null;
      if (request) {
        const id = key.name.replace('request:', '');
        requests.push({ id, ...request });
      }
    }

    // Sort by submitted date (newest first)
    requests.sort((a, b) => b.submitted - a.submitted);

    return c.json({ requests });
  } catch (error) {
    console.error('List requests error:', error);
    return c.json({ error: 'Failed to list requests' }, 500);
  }
}

/**
 * Approve an access request and generate an invite code
 * POST /api/admin/requests/:id/approve
 */
export async function approveRequestHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const id = c.req.param('id');
    const requestKey = `request:${id}`;

    // Get the request
    const request = (await c.env.CODE_REQUESTS.get(requestKey, 'json')) as AccessRequest | null;
    if (!request) {
      return c.json({ error: 'Request not found' }, 404);
    }

    if (request.status !== 'pending') {
      return c.json({ error: `Request already ${request.status}` }, 400);
    }

    // Generate invite code
    const code = generateInviteCode();
    const codeData: InviteCode = {
      created: Date.now(),
      uses: 0,
      maxUses: 1, // Single use for requested codes
      label: `Approved for ${request.email}`,
    };

    // Save code
    await c.env.INVITE_CODES.put(`code:${code}`, JSON.stringify(codeData));

    // Update request status
    const updatedRequest: AccessRequest = {
      ...request,
      status: 'approved',
    };
    await c.env.CODE_REQUESTS.put(requestKey, JSON.stringify(updatedRequest));

    return c.json({
      approved: true,
      code,
      email: request.email,
      message: `Code generated for ${request.email}. Send them this code: ${code}`,
    });
  } catch (error) {
    console.error('Approve request error:', error);
    return c.json({ error: 'Failed to approve request' }, 500);
  }
}

/**
 * Reject an access request
 * POST /api/admin/requests/:id/reject
 */
export async function rejectRequestHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const id = c.req.param('id');
    const requestKey = `request:${id}`;

    // Get the request
    const request = (await c.env.CODE_REQUESTS.get(requestKey, 'json')) as AccessRequest | null;
    if (!request) {
      return c.json({ error: 'Request not found' }, 404);
    }

    if (request.status !== 'pending') {
      return c.json({ error: `Request already ${request.status}` }, 400);
    }

    // Update request status
    const updatedRequest: AccessRequest = {
      ...request,
      status: 'rejected',
    };
    await c.env.CODE_REQUESTS.put(requestKey, JSON.stringify(updatedRequest));

    return c.json({
      rejected: true,
      email: request.email,
    });
  } catch (error) {
    console.error('Reject request error:', error);
    return c.json({ error: 'Failed to reject request' }, 500);
  }
}

/**
 * List all invite codes
 * GET /api/admin/codes
 */
export async function listCodesHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const codes: CodeWithId[] = [];
    const list = await c.env.INVITE_CODES.list({ prefix: 'code:' });

    for (const key of list.keys) {
      const codeData = (await c.env.INVITE_CODES.get(key.name, 'json')) as InviteCode | null;
      if (codeData) {
        const code = key.name.replace('code:', '');
        codes.push({ code, ...codeData });
      }
    }

    // Sort by created date (newest first)
    codes.sort((a, b) => b.created - a.created);

    return c.json({ codes });
  } catch (error) {
    console.error('List codes error:', error);
    return c.json({ error: 'Failed to list codes' }, 500);
  }
}

/**
 * Generate a new invite code manually
 * POST /api/admin/codes
 */
export async function generateCodeHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json<{ label?: string; maxUses?: number | null }>();
    const label = body.label || 'Manual code';
    const maxUses = body.maxUses !== undefined ? body.maxUses : null;

    // Generate code
    const code = generateInviteCode();
    const codeData: InviteCode = {
      created: Date.now(),
      uses: 0,
      maxUses,
      label,
    };

    // Save code
    await c.env.INVITE_CODES.put(`code:${code}`, JSON.stringify(codeData));

    return c.json({
      created: true,
      code,
      label,
      maxUses,
    });
  } catch (error) {
    console.error('Generate code error:', error);
    return c.json({ error: 'Failed to generate code' }, 500);
  }
}

/**
 * Revoke (delete) an invite code
 * DELETE /api/admin/codes/:code
 */
export async function revokeCodeHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const code = c.req.param('code');
    const codeKey = `code:${code}`;

    // Check if code exists
    const codeData = await c.env.INVITE_CODES.get(codeKey);
    if (!codeData) {
      return c.json({ error: 'Code not found' }, 404);
    }

    // Delete the code
    await c.env.INVITE_CODES.delete(codeKey);

    return c.json({
      revoked: true,
      code,
    });
  } catch (error) {
    console.error('Revoke code error:', error);
    return c.json({ error: 'Failed to revoke code' }, 500);
  }
}
