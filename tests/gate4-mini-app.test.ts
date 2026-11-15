import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { createInMemoryTestRuntime, type DbRuntime } from '@/server/db/client';
import { ensureSchema } from '@/server/db/migrate';
import { ensureSeeded, SEED_IDS } from '@/server/db/seed';
import { buildActorContext } from '@/server/modules/identity/service';
import { selectLiffAdapterKind } from '@/lib/liff/select';
import { getMiniNav, miniRoleLabel, type MiniActor } from '@/lib/mini-nav';
import { verifyLineIdToken } from '@/server/modules/line-identity/verifier';
import { listGrowthRecordsForActor } from '@/server/modules/growth/service';

describe('Gate 4: the mock LIFF adapter can never run in production', () => {
  it('never selects the mock in production, whatever the flags say', () => {
    expect(selectLiffAdapterKind({ NODE_ENV: 'production', NEXT_PUBLIC_FAITHMAP_MOCK_LIFF: 'true' })).toBe('unavailable');
    expect(selectLiffAdapterKind({ NODE_ENV: 'production', NEXT_PUBLIC_FAITHMAP_MOCK_LIFF: 'true', NEXT_PUBLIC_LIFF_ID: '1234-abcd' })).toBe('real');
  });

  it('uses the mock only outside production and only when the flag is exactly "true"', () => {
    expect(selectLiffAdapterKind({ NODE_ENV: 'development', NEXT_PUBLIC_FAITHMAP_MOCK_LIFF: 'true' })).toBe('mock');
    expect(selectLiffAdapterKind({ NODE_ENV: 'development', NEXT_PUBLIC_FAITHMAP_MOCK_LIFF: '1' })).toBe('unavailable');
    expect(selectLiffAdapterKind({ NODE_ENV: 'development' })).toBe('unavailable');
    expect(selectLiffAdapterKind({ NODE_ENV: 'development', NEXT_PUBLIC_LIFF_ID: '1234-abcd' })).toBe('real');
    expect(selectLiffAdapterKind({ NODE_ENV: 'test', NEXT_PUBLIC_FAITHMAP_MOCK_LIFF: 'true', NEXT_PUBLIC_LIFF_ID: '1234-abcd' })).toBe('mock');
  });
});

describe('Gate 4: a mock token never reaches LINE and never signs anyone in', () => {
  it('rejects a mock ID token before any network call', async () => {
    let called = false;
    await expect(
      verifyLineIdToken({
        idToken: 'MOCK-NOT-A-REAL-TOKEN',
        expectedNonce: '',
        requireNonce: false,
        channelId: '1234567890',
        fetchImpl: async () => {
          called = true;
          return new Response('{}', { status: 200 });
        },
      })
    ).rejects.toMatchObject({ code: 'LINE_TOKEN_INVALID' });
    expect(called).toBe(false);
  });
});

function actor(partial: Partial<MiniActor> & { systemRole?: string }): MiniActor {
  return {
    user: { systemRole: partial.systemRole ?? 'standard_user' },
    assignments: partial.assignments ?? [],
    bodyLeaderBodyIds: partial.bodyLeaderBodyIds ?? [],
    groupLeaderGroupIds: partial.groupLeaderGroupIds ?? [],
    supervisorGroupIds: partial.supervisorGroupIds ?? [],
  } as MiniActor;
}

describe('Gate 4: navigation depends on the role, in simple Thai', () => {
  const keys = (a: MiniActor) => getMiniNav(a).map((i) => i.key);

  it('an account with no role sees only home and notifications, plus a waiting message', () => {
    const a = actor({});
    expect(keys(a)).toEqual(['home', 'notifications']);
    expect(miniRoleLabel(a)).toBe('สมาชิก (รอรับหน้าที่)');
  });

  it('a group leader can send reports and see the group and growth records', () => {
    const a = actor({ groupLeaderGroupIds: ['g1'], assignments: [{ roleType: 'group_leader', scopeType: 'group' } as never] });
    expect(keys(a)).toEqual(['home', 'reports', 'group', 'growth', 'notifications']);
    expect(miniRoleLabel(a)).toBe('ผู้รับผิดชอบกลุ่ม');
  });

  it('a care leader or coordinator reviews reports and sees the group', () => {
    const a = actor({ supervisorGroupIds: ['g1'], assignments: [{ roleType: 'care_leader', scopeType: 'group' } as never] });
    expect(keys(a)).toContain('reports');
    expect(keys(a)).toContain('group');
    expect(miniRoleLabel(a)).toBe('ผู้ดูแลแคร์');
  });

  it('a body leader is labelled as such and sees reports, groups and growth', () => {
    const a = actor({ bodyLeaderBodyIds: ['b1'], assignments: [{ roleType: 'body_leader', scopeType: 'body' } as never] });
    expect(keys(a)).toEqual(['home', 'reports', 'group', 'growth', 'notifications']);
    expect(miniRoleLabel(a)).toBe('หัวหน้าบอดี้');
  });

  it('a pastor sees reports and groups but not individual growth records', () => {
    const a = actor({ systemRole: 'mission_leader' });
    expect(keys(a)).toEqual(['home', 'reports', 'group', 'notifications']);
    expect(miniRoleLabel(a)).toBe('ศิษยาภิบาล');
  });

  it('only super_admin gets the approvals page', () => {
    expect(keys(actor({ systemRole: 'super_admin' }))).toContain('approvals');
    expect(keys(actor({ systemRole: 'admin' }))).not.toContain('approvals');
    expect(keys(actor({ bodyLeaderBodyIds: ['b1'] }))).not.toContain('approvals');
  });

  it('every label is Thai and short enough for a large button', () => {
    for (const role of ['super_admin', 'admin', 'mission_leader', 'standard_user']) {
      for (const item of getMiniNav(actor({ systemRole: role }))) {
        expect(item.label).toMatch(/[฀-๿]/);
        expect(item.label.length).toBeLessThanOrEqual(16);
      }
    }
  });
});

describe('Gate 4: growth records are visible only to direct stewards, body leaders and admins (DEC-06)', () => {
  async function withDb<T>(fn: (rt: DbRuntime) => Promise<T>) {
    const rt = await createInMemoryTestRuntime();
    try {
      await ensureSchema(rt);
      await ensureSeeded(rt.db);
      return await fn(rt);
    } finally {
      await rt.close();
    }
  }
  async function actorFor(rt: DbRuntime, id: string) {
    const [u] = await rt.db.select().from(schema.users).where(eq(schema.users.id, id));
    return buildActorContext(rt.db, u!);
  }

  async function seedGrowth(rt: DbRuntime) {
    const [member] = await rt.db
      .insert(schema.members)
      .values({ memberCode: 'M-GR-1', fullName: 'สมหมาย เติบโต', displayName: 'หมาย' })
      .returning();
    await rt.db.insert(schema.groupMemberships).values({ groupId: SEED_IDS.groups.nongkung, memberId: member!.id, membershipRole: 'member', isActive: true });
    await rt.db.insert(schema.memberGrowthRecords).values({
      memberId: member!.id,
      groupId: SEED_IDS.groups.nongkung,
      conversionDateRaw: 'ปี 2565',
      discipleshipGoalRaw: 'อ่านพระคัมภีร์',
      verificationStatus: 'RAW',
    });
    return member!;
  }

  it('shows records for a group the user leads, and nothing for other groups', async () => {
    await withDb(async (rt) => {
      await seedGrowth(rt);
      const own = await listGrowthRecordsForActor(rt.db, await actorFor(rt, SEED_IDS.users.leaderNongkung), {});
      expect(own).toHaveLength(1);
      expect(own[0]).toMatchObject({ memberName: 'สมหมาย เติบโต', discipleshipGoalRaw: 'อ่านพระคัมภีร์', verificationStatus: 'RAW' });

      const other = await listGrowthRecordsForActor(rt.db, await actorFor(rt, SEED_IDS.users.leaderNonthan), {});
      expect(other).toHaveLength(0);
    });
  });

  it('refuses the group filter for a group outside the user scope', async () => {
    await withDb(async (rt) => {
      await seedGrowth(rt);
      await expect(
        listGrowthRecordsForActor(rt.db, await actorFor(rt, SEED_IDS.users.leaderNonthan), { groupId: SEED_IDS.groups.nongkung })
      ).rejects.toMatchObject({ status: 403 });
    });
  });

  it('admin sees all; a pastor and an account with no role are refused', async () => {
    await withDb(async (rt) => {
      await seedGrowth(rt);
      expect((await listGrowthRecordsForActor(rt.db, await actorFor(rt, SEED_IDS.users.admin), {})).length).toBe(1);
      await expect(listGrowthRecordsForActor(rt.db, await actorFor(rt, SEED_IDS.users.pastor), {})).rejects.toMatchObject({ status: 403 });
      const [nobody] = await rt.db
        .insert(schema.users)
        .values({ username: 'line-nobody', displayName: 'ไม่มีหน้าที่', systemRole: 'standard_user', status: 'active' })
        .returning();
      await expect(listGrowthRecordsForActor(rt.db, await buildActorContext(rt.db, nobody!), {})).rejects.toMatchObject({ status: 403 });
    });
  });
});
