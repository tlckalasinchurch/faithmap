import { describe, expect, it } from 'vitest';
import { ApiClientError } from '@/lib/api-client';
import {
  createOnceGuard,
  isLineUnlinkedError,
  LINE_IDENTITY_UNLINKED,
  needsRoleAssignment,
} from '@/lib/liff/login-flow';
import { selectLiffAdapterKind } from '@/lib/liff/select';

describe('LINE login flow guards (audit remediation B1–B4, J5)', () => {
  it('B1: createOnceGuard runs the sign-in task at most once even if re-invoked on re-renders', async () => {
    const guard = createOnceGuard();
    let count = 0;

    const first = guard.run(async () => {
      count += 1;
      return 'first';
    });
    const second = guard.run(async () => {
      count += 1;
      return 'second';
    });

    expect(guard.started).toBe(true);
    expect(await first).toBe('first');
    expect(second).toBeNull();
    expect(count).toBe(1);
  });

  it('B2: isLineUnlinkedError checks the canonical server error code, regardless of message text', () => {
    const unlinkedErr = new ApiClientError(
      401,
      LINE_IDENTITY_UNLINKED,
      'ข้อความเปลี่ยนไปก็ไม่กระทบการตรวจสอบ'
    );
    const otherApiErr = new ApiClientError(401, 'INVALID_CREDENTIALS', 'ยังไม่ได้เชื่อม');
    const plainErr = new Error('บัญชี LINE นี้ยังไม่ได้เชื่อมกับบัญชีผู้ใช้งาน');

    expect(isLineUnlinkedError(unlinkedErr)).toBe(true);
    expect(isLineUnlinkedError(otherApiErr)).toBe(false);
    expect(isLineUnlinkedError(plainErr)).toBe(false);
    expect(isLineUnlinkedError(null)).toBe(false);
  });

  it('B3: selectLiffAdapterKind returns unavailable when NEXT_PUBLIC_LIFF_ID is unset (no hardcoded developing fallback)', () => {
    expect(selectLiffAdapterKind({ NODE_ENV: 'production', NEXT_PUBLIC_LIFF_ID: '' })).toBe('unavailable');
    expect(selectLiffAdapterKind({ NODE_ENV: 'production' })).toBe('unavailable');
    expect(selectLiffAdapterKind({ NODE_ENV: 'development' })).toBe('unavailable');
  });

  it('J5: needsRoleAssignment identifies approved standard_user with 0 assignments vs roles with access', () => {
    const baseUser = {
      id: '00000000-0000-0000-0000-000000000001',
      username: 'line_new',
      displayName: 'สมาชิกใหม่',
      email: null,
      phoneE164: null,
      status: 'active',
      lineUserId: 'U123456',
    };

    expect(
      needsRoleAssignment({
        user: { ...baseUser, systemRole: 'standard_user' },
        assignments: [],
      })
    ).toBe(true);

    expect(
      needsRoleAssignment({
        user: { ...baseUser, systemRole: 'super_admin' },
        assignments: [],
      })
    ).toBe(false);

    expect(
      needsRoleAssignment({
        user: { ...baseUser, systemRole: 'standard_user' },
        assignments: [
          {
            id: '00000000-0000-0000-0000-000000000002',
            scopeType: 'group',
            bodyId: null,
            groupId: '00000000-0000-0000-0000-000000000003',
            bodyName: null,
            groupName: 'กลุ่มบ้าน 1',
            roleType: 'group_leader',
            isPrimary: true,
          },
        ],
      })
    ).toBe(false);

    expect(needsRoleAssignment(null)).toBe(false);
  });
});
