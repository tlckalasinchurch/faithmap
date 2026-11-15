import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { createInMemoryTestRuntime } from '@/server/db/client';
import { ensureSchema } from '@/server/db/migrate';
import { AppError, describeErrorForLog, toErrorResponseBody } from '@/server/modules/errors';

const SECRET_NAME = 'สมชาย ลับมากที่สุด';
const SECRET_PHONE = '0899998888';

describe('Error responses never leak SQL, values or internals', () => {
  it('a database error returns a generic Thai message with no SQL, no table names and no values', async () => {
    const rt = await createInMemoryTestRuntime();
    try {
      await ensureSchema(rt);
      let caught: unknown;
      try {
        await rt.db.insert(schema.members).values({
          memberCode: 'LEAK-1', fullName: SECRET_NAME, displayName: 'x', phoneE164: SECRET_PHONE, membershipStatus: 'NOT_A_STATUS',
        } as never);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeDefined();
      const { status, body } = toErrorResponseBody(caught);
      const text = JSON.stringify(body);
      expect(status).toBe(500);
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(text).not.toContain(SECRET_NAME);
      expect(text).not.toContain(SECRET_PHONE);
      expect(text).not.toMatch(/insert into|members|membership_status|Failed query|params/i);
      expect(body.error.message).toMatch(/[฀-๿]/); // Thai guidance
    } finally {
      await rt.close();
    }
  });

  it('a malformed JSON body is a 400 that does not echo the body', () => {
    let caught: unknown;
    try {
      JSON.parse(`{"fullName":"${SECRET_NAME}", oops`);
    } catch (e) {
      caught = e;
    }
    const { status, body } = toErrorResponseBody(caught);
    expect(status).toBe(400);
    expect(body.error.code).toBe('INVALID_JSON');
    expect(JSON.stringify(body)).not.toMatch(/position|column|token|oops/i);
  });

  it('a plain Error with a secret in its message returns a generic body', () => {
    const { body } = toErrorResponseBody(new Error('connect failed postgres://user:hunter2@db.example.com/prod'));
    expect(JSON.stringify(body)).not.toMatch(/hunter2|postgres:|db\.example/);
  });

  it('an AppError keeps its own Thai message and code (business errors stay useful)', () => {
    const { status, body } = toErrorResponseBody(new AppError(409, 'VERSION_CONFLICT', 'มีผู้อื่นแก้ไขแล้ว'));
    expect(status).toBe(409);
    expect(body.error).toMatchObject({ code: 'VERSION_CONFLICT', message: 'มีผู้อื่นแก้ไขแล้ว' });
  });

  it('the server log line has the error type and code only: no message, no stack, no values', () => {
    const err = Object.assign(new Error(`Failed query: insert ... params: ${SECRET_NAME},${SECRET_PHONE}`), { code: '23505', constraint: 'members_member_code_unique' });
    const line = JSON.stringify(describeErrorForLog(err));
    expect(line).toContain('23505');
    expect(line).toContain('members_member_code_unique');
    expect(line).not.toContain(SECRET_NAME);
    expect(line).not.toContain(SECRET_PHONE);
    expect(line).not.toMatch(/Failed query|at .*\.ts/);
  });
});

import { ensureSeeded } from '@/server/db/seed';
import { loginWithPassword } from '@/server/modules/identity/service';

describe('The audit trail does not store what people type into the username field', () => {
  it('a password typed as the username never reaches the audit log, and the rate limit still works', async () => {
    const rt = await createInMemoryTestRuntime();
    try {
      await ensureSchema(rt);
      await ensureSeeded(rt.db);
      const typedByMistake = 'MyReal-Passw0rd-2026!';
      for (let i = 0; i < 5; i++) {
        await expect(loginWithPassword(rt.db, typedByMistake, 'wrong')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
      }
      // The rows exist (audit trail kept) ...
      const rows = await rt.db.select().from(schema.securityAuditLogs).where(eq(schema.securityAuditLogs.action, 'auth_login_password_failed'));
      expect(rows).toHaveLength(5);
      // ... but no column of any audit row holds the typed text.
      const all = await rt.db.select().from(schema.securityAuditLogs);
      expect(JSON.stringify(all)).not.toContain(typedByMistake);
      expect(JSON.stringify(all).toLowerCase()).not.toContain(typedByMistake.toLowerCase());
      // ... and the per-username limit still blocks the 6th try.
      await expect(loginWithPassword(rt.db, typedByMistake, 'wrong')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
      // Same name in other case counts as the same target.
      await expect(loginWithPassword(rt.db, typedByMistake.toUpperCase(), 'wrong')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    } finally {
      await rt.close();
    }
  });
});

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? sourceFiles(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

describe('Logging guard (static): new log lines need review', () => {
  const ALLOWED = new Set([
    'src/server/db/run-migrate.ts',
    'src/server/db/run-seed.ts',
    'src/server/db/run-bootstrap-admin.ts',
    'src/server/http/session.ts',
  ]);
  const files = sourceFiles('src').map((f) => f.split(path.sep).join('/'));

  it('console.* appears only in the operator scripts and the route error handler', () => {
    const offenders = files.filter((f) => !ALLOWED.has(f) && /\bconsole\.(log|error|warn|info|debug)\b/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('no log call prints a raw error object, a token, a password, a connection string or a LINE id', () => {
    const bad = /console\.\w+\([^)]*(\berr\b(?!\s*instanceof)|token|password|secret|DATABASE_URL|lineUserId|idToken)[^)]*\)/i;
    const offenders: string[] = [];
    for (const f of files) {
      for (const [i, line] of readFileSync(f, 'utf8').split('\n').entries()) {
        if (!/console\./.test(line)) continue;
        // Approved: describeErrorForLog(err), and err.message of an AppError (our own Thai text).
        if (bad.test(line.replace(/describeErrorForLog\(err\)/g, '').replace(/isAppError\(err\) \? err\.message :/g, ''))) offenders.push(`${f}:${i + 1}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
