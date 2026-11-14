import { eq } from 'drizzle-orm';
import type { FaithMapDb } from '@/server/db/client';
import { users } from '@/server/db/schema';
import { AppError } from '../errors';
import { recordSecurityAudit } from '../audit/service';
import { hashPassword } from './crypto';

/**
 * Creates the first super_admin. Refuses to run if any super_admin already exists.
 * Used once by the owner from a local terminal. No password is stored in source or logs.
 */
export async function createFirstSuperAdmin(
  db: FaithMapDb,
  input: { username: string; displayName: string; password: string }
): Promise<{ id: string; username: string }> {
  const username = input.username.trim().toLowerCase();
  const displayName = input.displayName.trim();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'ชื่อผู้ใช้ต้องเป็นตัวอักษรอังกฤษ ตัวเลข . _ - ยาว 3-40 ตัว');
  }
  if (displayName.length < 1 || displayName.length > 80) {
    throw new AppError(400, 'VALIDATION_ERROR', 'กรุณากรอกชื่อที่แสดง');
  }
  if (input.password.length < 12) {
    throw new AppError(400, 'VALIDATION_ERROR', 'รหัสผ่านต้องยาวอย่างน้อย 12 ตัวอักษร');
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.systemRole, 'super_admin'))
    .limit(1);
  if (existing) {
    throw new AppError(409, 'SUPER_ADMIN_EXISTS', 'มีผู้ดูแลระบบสูงสุดอยู่แล้ว ไม่สามารถสร้างซ้ำได้');
  }

  const [created] = await db
    .insert(users)
    .values({
      username,
      displayName,
      systemRole: 'super_admin',
      status: 'active',
      passwordHash: hashPassword(input.password),
    })
    .returning({ id: users.id, username: users.username });

  await recordSecurityAudit(db, {
    actorUserId: created!.id,
    action: 'bootstrap_super_admin_created',
    targetType: 'user',
    targetId: created!.id,
    outcome: 'success',
  });
  return created!;
}
