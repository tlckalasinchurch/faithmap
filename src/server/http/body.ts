import type { ZodIssue } from 'zod';
import { AppError } from '@/server/modules/errors';

/** Largest accepted JSON body, in bytes. A route can raise it on purpose (ingestion). */
export const JSON_LIMITS = {
  default: 64 * 1024,
  reports: 256 * 1024,
  ingestion: 8 * 1024 * 1024,
} as const;

export const JSON_MAX_DEPTH = 20;

const tooLarge = () =>
  new AppError(413, 'PAYLOAD_TOO_LARGE', 'ข้อมูลที่ส่งมามีขนาดใหญ่เกินกำหนด กรุณาลดขนาดแล้วลองใหม่');

function depthOf(value: unknown, limit: number): number {
  // Iterative so that hostile nesting cannot overflow the stack here.
  let max = 0;
  const stack: Array<[unknown, number]> = [[value, 1]];
  while (stack.length) {
    const [v, d] = stack.pop()!;
    if (v === null || typeof v !== 'object') continue;
    if (d > max) max = d;
    if (max > limit) return max;
    for (const child of Array.isArray(v) ? v : Object.values(v as Record<string, unknown>)) stack.push([child, d + 1]);
  }
  return max;
}

/**
 * Reads a JSON request body with a hard byte limit, a depth limit and no echo of the content.
 * The limit is enforced while reading, so a missing or false Content-Length does not help an attacker.
 */
export async function readJsonBody(
  req: Request,
  options: { maxBytes?: number; maxDepth?: number } = {}
): Promise<unknown> {
  const maxBytes = options.maxBytes ?? JSON_LIMITS.default;
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge();

  let text = '';
  if (req.body) {
    const reader = req.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw tooLarge();
      }
      chunks.push(value);
    }
    text = new TextDecoder().decode(Buffer.concat(chunks));
  }
  if (!text.trim()) {
    throw new AppError(400, 'INVALID_JSON', 'ข้อมูลที่ส่งมาอ่านไม่ได้ กรุณาลองใหม่อีกครั้ง');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // JSON.parse messages can quote the body. Do not pass them on.
    throw new AppError(400, 'INVALID_JSON', 'ข้อมูลที่ส่งมาอ่านไม่ได้ กรุณาลองใหม่อีกครั้ง');
  }
  if (depthOf(parsed, options.maxDepth ?? JSON_MAX_DEPTH) > (options.maxDepth ?? JSON_MAX_DEPTH)) {
    throw new AppError(400, 'INPUT_TOO_DEEP', 'โครงสร้างข้อมูลซับซ้อนเกินกำหนด');
  }
  return parsed;
}

/** Validation issues for the client: where and which rule. Never the value and never the library text. */
export function safeValidationIssues(issues: ZodIssue[]): Array<{ path: string; code: string }> {
  return issues.slice(0, 20).map((i) => ({ path: i.path.join('.'), code: String(i.code) }));
}
