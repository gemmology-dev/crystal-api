/**
 * Auth Handlers - /api/auth/* endpoints
 * Handles invite code verification and access requests
 */

import type { Context } from 'hono';
import { sign } from 'hono/jwt';

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

// Environment bindings
interface Env {
  INVITE_CODES: KVNamespace;
  CODE_REQUESTS: KVNamespace;
  JWT_SECRET: string;
}

// Request/Response types
interface VerifyRequest {
  code: string;
}

interface VerifyResponse {
  valid: boolean;
  token?: string;
  error?: string;
}

interface RequestAccessRequest {
  email: string;
  reason: string;
}

interface RequestAccessResponse {
  submitted: boolean;
  message?: string;
  error?: string;
}

/**
 * Verify an invite code and return a session token
 * POST /api/auth/verify
 */
export async function verifyCodeHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json<VerifyRequest>();
    const { code } = body;

    if (!code || typeof code !== 'string') {
      return c.json<VerifyResponse>({
        valid: false,
        error: 'Invite code is required',
      }, 400);
    }

    // Normalize code (trim whitespace, uppercase)
    const normalizedCode = code.trim().toUpperCase();

    // Look up code in KV
    const codeKey = `code:${normalizedCode}`;
    const codeData = await c.env.INVITE_CODES.get(codeKey, 'json') as InviteCode | null;

    if (!codeData) {
      return c.json<VerifyResponse>({
        valid: false,
        error: 'Invalid invite code',
      }, 401);
    }

    // Check if code has reached max uses
    if (codeData.maxUses !== null && codeData.uses >= codeData.maxUses) {
      return c.json<VerifyResponse>({
        valid: false,
        error: 'This invite code has reached its maximum uses',
      }, 401);
    }

    // Increment use count
    const updatedCodeData: InviteCode = {
      ...codeData,
      uses: codeData.uses + 1,
    };
    await c.env.INVITE_CODES.put(codeKey, JSON.stringify(updatedCodeData));

    // Generate JWT token (expires in 30 days)
    const payload = {
      sub: normalizedCode,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days
    };

    const token = await sign(payload, c.env.JWT_SECRET);

    return c.json<VerifyResponse>({
      valid: true,
      token,
    });
  } catch (error) {
    console.error('Verify code error:', error);
    return c.json<VerifyResponse>({
      valid: false,
      error: 'Failed to verify invite code',
    }, 500);
  }
}

/**
 * Submit a request for access
 * POST /api/auth/request
 */
export async function requestAccessHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json<RequestAccessRequest>();
    const { email, reason } = body;

    // Validate email
    if (!email || typeof email !== 'string') {
      return c.json<RequestAccessResponse>({
        submitted: false,
        error: 'Email is required',
      }, 400);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return c.json<RequestAccessResponse>({
        submitted: false,
        error: 'Invalid email address',
      }, 400);
    }

    // Validate reason
    if (!reason || typeof reason !== 'string') {
      return c.json<RequestAccessResponse>({
        submitted: false,
        error: 'Reason is required',
      }, 400);
    }

    if (reason.trim().length < 10) {
      return c.json<RequestAccessResponse>({
        submitted: false,
        error: 'Please provide a more detailed reason (at least 10 characters)',
      }, 400);
    }

    // Check for existing pending request with same email
    const existingRequests = await c.env.CODE_REQUESTS.list({ prefix: 'request:' });
    for (const key of existingRequests.keys) {
      const request = await c.env.CODE_REQUESTS.get(key.name, 'json') as AccessRequest | null;
      if (request && request.email.toLowerCase() === email.toLowerCase() && request.status === 'pending') {
        return c.json<RequestAccessResponse>({
          submitted: false,
          error: 'A request with this email is already pending',
        }, 409);
      }
    }

    // Generate unique request ID
    const requestId = crypto.randomUUID();

    // Store request
    const accessRequest: AccessRequest = {
      email: email.trim().toLowerCase(),
      reason: reason.trim(),
      submitted: Date.now(),
      status: 'pending',
    };

    await c.env.CODE_REQUESTS.put(`request:${requestId}`, JSON.stringify(accessRequest));

    return c.json<RequestAccessResponse>({
      submitted: true,
      message: 'Request submitted. You\'ll receive an email when approved.',
    });
  } catch (error) {
    console.error('Request access error:', error);
    return c.json<RequestAccessResponse>({
      submitted: false,
      error: 'Failed to submit request',
    }, 500);
  }
}
