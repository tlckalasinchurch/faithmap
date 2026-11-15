export class AppError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

export function toErrorResponseBody(err: unknown): {
  status: number;
  body: { error: { code: string; message: string; details?: Record<string, unknown> } };
} {
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: {
        error: {
          code: err.code,
          message: err.message,
          ...(err.details ? { details: err.details } : {}),
        },
      },
    };
  }
  // Never return err.message for an unknown error. Database errors carry the full SQL text and the
  // bound values (names, phone numbers). A JSON parse error echoes part of the request body.
  if (err instanceof SyntaxError) {
    return {
      status: 400,
      body: { error: { code: 'INVALID_JSON', message: 'ข้อมูลที่ส่งมาอ่านไม่ได้ กรุณาลองใหม่อีกครั้ง' } },
    };
  }
  return {
    status: 500,
    body: {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่ภายหลัง หากยังไม่หาย ให้แจ้งผู้ดูแลระบบ',
      },
    },
  };
}

/**
 * What the server may write to its log for an unexpected error: the error type and the PostgreSQL
 * code and constraint name only. Never the message (it can hold SQL and values) and never the stack.
 */
export function describeErrorForLog(err: unknown): Record<string, string> {
  const e = err as { name?: string; code?: unknown; constraint?: unknown; cause?: { code?: unknown; constraint?: unknown } } | null;
  const out: Record<string, string> = { type: typeof e?.name === 'string' ? e.name : typeof err };
  const code = e?.code ?? e?.cause?.code;
  const constraint = e?.constraint ?? e?.cause?.constraint;
  if (typeof code === 'string' || typeof code === 'number') out.code = String(code).slice(0, 40);
  if (typeof constraint === 'string') out.constraint = constraint.slice(0, 80);
  return out;
}

/** True for a PostgreSQL unique-key violation (code 23505), also when wrapped by the driver. */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string }; message?: string } | null;
  return e?.code === '23505' || e?.cause?.code === '23505' || /duplicate key|unique constraint/i.test(e?.message ?? '');
}
