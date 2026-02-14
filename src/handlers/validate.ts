/**
 * Validate Handler - /api/validate endpoint
 * Validates CDL expressions and returns parse info
 */

import type { Context } from 'hono';
import { parseCDL, flatForms } from '../lib/cdl-parser';

interface ValidateRequest {
  cdl: string;
}

interface ValidateResponse {
  valid: boolean;
  error?: string;
  parsed?: {
    system: string;
    pointGroup: string;
    formsCount: number;
    forms: Array<{
      miller: string;
      scale: number;
    }>;
  };
}

export async function validateHandler(c: Context): Promise<Response> {
  try {
    const body = await c.req.json<ValidateRequest>();
    const { cdl } = body;

    if (!cdl || typeof cdl !== 'string') {
      return c.json<ValidateResponse>({
        valid: false,
        error: 'CDL expression is required',
      });
    }

    const result = parseCDL(cdl);

    if (!result.valid || !result.parsed) {
      return c.json<ValidateResponse>({
        valid: false,
        error: result.error,
      });
    }

    // Flatten form tree and format Miller indices for response
    const flat = flatForms(result.parsed.forms);
    const forms = flat.map((form) => {
      const m = form.millerIndex;
      const millerStr =
        m.i !== undefined
          ? `{${m.h}${m.k}${m.i}${m.l}}`
          : `{${m.h}${m.k}${m.l}}`;
      return {
        miller: millerStr,
        scale: form.scale,
      };
    });

    return c.json<ValidateResponse>({
      valid: true,
      parsed: {
        system: result.parsed.system,
        pointGroup: result.parsed.pointGroup,
        formsCount: forms.length,
        forms,
      },
    });
  } catch (error) {
    console.error('Validate error:', error);
    return c.json<ValidateResponse>(
      {
        valid: false,
        error: 'Failed to validate CDL expression',
      },
      500
    );
  }
}
