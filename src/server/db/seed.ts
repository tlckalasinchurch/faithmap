import { count } from 'drizzle-orm';
import type { FaithMapDb } from './client';
import {
  organizationSettings,
  members,
  users,
  externalIdentities,
  bodies,
  houseMissionGroups,
  assignments,
  groupMemberships,
  reportingPeriods,
  periodGroupSnapshots,
  weeklyReports,
  attendanceRecords,
  visitors,
  visitorVisits,
  followUpItems,
  reportAuditEvents,
  meetingBriefs,
  notifications,
  lineDispatches,
  securityAuditLogs,
} from './schema';
import { hashPassword } from '../modules/identity/crypto';
import { addDaysIsoDate, getMondaySundayPeriodBounds } from '../modules/time/bangkok';

function suuid(ns: number, id: number): string {
  return `${String(ns).padStart(8, '0')}-0000-4000-8000-${String(id).padStart(12, '0')}`;
}

export const SEED_IDS = {
  orgSettings: suuid(1, 1),
  bodies: {
    north: suuid(2, 1),
    south: suuid(2, 2),
  },
  groups: {
    nonthan: suuid(3, 1),
    nongkung: suuid(3, 2),
    huaisithon: suuid(3, 3),
    buengwichai: suuid(3, 4),
    yangtalat: suuid(3, 5),
  },
  users: {
    superAdmin: suuid(4, 1),
    admin: suuid(4, 2),
    pastor: suuid(4, 3),
    bodyLeaderNorth: suuid(4, 4),
    careLeaderNonthan: suuid(4, 5),
    coordinatorHuaisithon: suuid(4, 6),
    leaderNonthan: suuid(4, 7),
    leaderNongkung: suuid(4, 8),
    leaderHuaisithon: suuid(4, 9),
    leaderYangtalat: suuid(4, 10),
    suspendedBodyLeaderSouth: suuid(4, 11),
    standbyLeaderSouth: suuid(4, 12),
  },
};

/**
 * Demo data is created on its own only for a local PGlite database outside production,
 * or when demo mode is explicitly on. A remote PostgreSQL database is never seeded implicitly.
 */
export function shouldAutoSeed(
  driver: 'pglite' | 'postgres',
  env: Record<string, string | undefined> = process.env
): boolean {
  if (env.NODE_ENV === 'production') return false;
  return driver === 'pglite' || env.FAITHMAP_DEMO_MODE === 'true';
}

/** Explicit seed commands against a remote database need FAITHMAP_ALLOW_REMOTE_SEED=true. */
export function isExplicitSeedAllowed(
  driver: 'pglite' | 'postgres',
  env: Record<string, string | undefined> = process.env
): boolean {
  return driver === 'pglite' || env.FAITHMAP_ALLOW_REMOTE_SEED === 'true';
}

export async function ensureSeeded(db: FaithMapDb): Promise<boolean> {
  // Demo accounts use a published password. Never create them in production.
  if (process.env.NODE_ENV === 'production') return false;

  const existing = await db.select({ total: count() }).from(organizationSettings);
  if ((existing[0]?.total ?? 0) > 0) {
    return false;
  }

  const demoPass = hashPassword('FaithMap2026!');
  const now = new Date();
  const currentWindow = getMondaySundayPeriodBounds(now, '20:00', '20:30');
  const prevRef = new Date(now.getTime() - 7 * 86_400_000);
  const prevWindow = getMondaySundayPeriodBounds(prevRef, '20:00', '20:30');

  await db.insert(organizationSettings).values({
    id: SEED_IDS.orgSettings,
    organizationName: 'คริสตจักรนำร่องจังหวัดกาฬสินธุ์ (FaithMap)',
    pilotProvince: 'กาฬสินธุ์',
    timezone: 'Asia/Bangkok',
    periodStartDay: 'monday',
    deadlineWeekday: 'sunday',
    deadlineTimeLocal: '20:00',
    briefWeekday: 'sunday',
    briefTimeLocal: '20:30',
    retentionMonths: 36,
  });

  // 1. Seed Members (PII source)
  const memberRows = [
    {
      id: suuid(5, 1),
      memberCode: 'MEM-KSN-001',
      fullName: 'นายสมชาย วงศ์กาฬสินธุ์',
      displayName: 'สมชาย (หัวหน้าบอดี้เหนือ)',
      phoneE164: '+66819010001',
      lineUserId: 'UlineSomchai001',
      email: 'somchai@faithmap.local',
      consentRecordedAt: now,
    },
    {
      id: suuid(5, 2),
      memberCode: 'MEM-KSN-002',
      fullName: 'นางประภาศรี รักพันธกิจ',
      displayName: 'ประภาศรี (หัวหน้าแคร์โนนทัน)',
      phoneE164: '+66819010002',
      lineUserId: 'UlinePrapasri002',
      email: 'prapasri@faithmap.local',
      consentRecordedAt: now,
    },
    {
      id: suuid(5, 3),
      memberCode: 'MEM-KSN-003',
      fullName: 'นายวิชัย ใจดี',
      displayName: 'วิชัย (ผู้นำกลุ่มโนนทัน)',
      phoneE164: '+66819010003',
      lineUserId: 'UlineWichai003',
      email: 'wichai@faithmap.local',
      consentRecordedAt: now,
    },
    {
      id: suuid(5, 4),
      memberCode: 'MEM-KSN-004',
      fullName: 'นางอรุณี ศรีหนองกุง',
      displayName: 'อรุณี (ผู้นำกลุ่มหนองกุง)',
      phoneE164: '+66819010004',
      lineUserId: 'UlineArunee004',
      email: 'arunee@faithmap.local',
      consentRecordedAt: now,
    },
    {
      id: suuid(5, 5),
      memberCode: 'MEM-KSN-005',
      fullName: 'นางมาลี แสงห้วยสีทน',
      displayName: 'มาลี (ผู้นำกลุ่มห้วยสีทน)',
      phoneE164: '+66819010005',
      lineUserId: 'UlineMalee005',
      email: 'malee@faithmap.local',
      consentRecordedAt: now,
    },
    {
      id: suuid(5, 6),
      memberCode: 'MEM-KSN-006',
      fullName: 'นายณรงค์ อุปถัมภ์',
      displayName: 'ณรงค์ (ผู้ประสานงานห้วยสีทน)',
      phoneE164: '+66819010006',
      lineUserId: 'UlineNarong006',
      email: 'narong@faithmap.local',
      consentRecordedAt: now,
    },
    {
      id: suuid(5, 7),
      memberCode: 'MEM-KSN-007',
      fullName: 'นายบุญมี เพชรยางตลาด',
      displayName: 'บุญมี (ผู้นำกลุ่มยางตลาด)',
      phoneE164: '+66819010007',
      lineUserId: 'UlineBoonmee007',
      email: 'boonmee@faithmap.local',
      consentRecordedAt: now,
    },
    {
      id: suuid(5, 8),
      memberCode: 'MEM-KSN-008',
      fullName: 'นางสายใจ มั่นคง',
      displayName: 'ป้าสายใจ',
      phoneE164: '+66819010008',
      consentRecordedAt: now,
    },
    {
      id: suuid(5, 9),
      memberCode: 'MEM-KSN-009',
      fullName: 'นายประสิทธิ์ สว่างจิต',
      displayName: 'ลุงประสิทธิ์',
      phoneE164: '+66819010009',
      consentRecordedAt: now,
    },
    {
      id: suuid(5, 10),
      memberCode: 'MEM-KSN-010',
      fullName: 'นางสาวกัลยา สุขสำราญ',
      displayName: 'น้องกัลยา',
      phoneE164: '+66819010010',
      consentRecordedAt: now,
    },
    {
      id: suuid(5, 11),
      memberCode: 'MEM-KSN-011',
      fullName: 'นางเตือนใจ พลศรี',
      displayName: 'ป้าเตือนใจ',
      phoneE164: '+66819010011',
      consentRecordedAt: now,
    },
    {
      id: suuid(5, 12),
      memberCode: 'MEM-KSN-012',
      fullName: 'นายอุดม ภูมิลำเนา',
      displayName: 'พี่อุดม',
      phoneE164: '+66819010012',
      consentRecordedAt: now,
    },
  ];
  await db.insert(members).values(memberRows);

  // 2. Seed Users
  const userRows = [
    {
      id: SEED_IDS.users.superAdmin,
      username: 'superadmin',
      displayName: 'อภิวัฒน์ (Super Admin)',
      email: 'superadmin@faithmap.local',
      phoneE164: '+66819000001',
      systemRole: 'super_admin',
      status: 'active',
      passwordHash: demoPass,
      lineUserId: 'UlineSuperAdmin',
    },
    {
      id: SEED_IDS.users.admin,
      username: 'admin_kanok',
      displayName: 'กนกพร ผู้ดูแลระบบ (Admin)',
      email: 'admin@faithmap.local',
      phoneE164: '+66819000002',
      systemRole: 'admin',
      status: 'active',
      passwordHash: demoPass,
      lineUserId: 'UlineAdminKanok',
    },
    {
      id: SEED_IDS.users.pastor,
      username: 'pastor_suda',
      displayName: 'ศจ.สุดาพร พันธกิจ (Pastor)',
      email: 'pastor@faithmap.local',
      phoneE164: '+66819000003',
      systemRole: 'mission_leader',
      status: 'active',
      passwordHash: demoPass,
      lineUserId: 'UlinePastorSuda',
    },
    {
      id: SEED_IDS.users.bodyLeaderNorth,
      memberId: suuid(5, 1),
      username: 'somchai_body_n',
      displayName: 'สมชาย วงศ์กาฬสินธุ์ (Body Leader เหนือ)',
      email: 'somchai@faithmap.local',
      phoneE164: '+66819010001',
      systemRole: 'standard_user',
      status: 'active',
      passwordHash: demoPass,
      lineUserId: 'UlineSomchai001',
    },
    {
      id: SEED_IDS.users.careLeaderNonthan,
      memberId: suuid(5, 2),
      username: 'prapasri_care',
      displayName: 'ประภาศรี รักพันธกิจ (Care Leader)',
      email: 'prapasri@faithmap.local',
      phoneE164: '+66819010002',
      systemRole: 'standard_user',
      status: 'active',
      passwordHash: demoPass,
      lineUserId: 'UlinePrapasri002',
    },
    {
      id: SEED_IDS.users.coordinatorHuaisithon,
      memberId: suuid(5, 6),
      username: 'narong_coord',
      displayName: 'ณรงค์ อุปถัมภ์ (Coordinator)',
      email: 'narong@faithmap.local',
      phoneE164: '+66819010006',
      systemRole: 'standard_user',
      status: 'active',
      passwordHash: demoPass,
      lineUserId: 'UlineNarong006',
    },
    {
      id: SEED_IDS.users.leaderNonthan,
      memberId: suuid(5, 3),
      username: 'wichai_nonthan',
      displayName: 'วิชัย ใจดี (ผู้นำกลุ่มโนนทัน)',
      email: 'wichai@faithmap.local',
      phoneE164: '+66819010003',
      systemRole: 'standard_user',
      status: 'active',
      passwordHash: demoPass,
      lineUserId: 'UlineWichai003',
    },
    {
      id: SEED_IDS.users.leaderNongkung,
      memberId: suuid(5, 4),
      username: 'arunee_nongkung',
      displayName: 'อรุณี ศรีหนองกุง (ผู้นำกลุ่มหนองกุง)',
      email: 'arunee@faithmap.local',
      phoneE164: '+66819010004',
      systemRole: 'standard_user',
      status: 'active',
      passwordHash: demoPass,
      lineUserId: 'UlineArunee004',
    },
    {
      id: SEED_IDS.users.leaderHuaisithon,
      memberId: suuid(5, 5),
      username: 'malee_huaisithon',
      displayName: 'มาลี แสงห้วยสีทน (ผู้นำกลุ่มห้วยสีทน)',
      email: 'malee@faithmap.local',
      phoneE164: '+66819010005',
      systemRole: 'standard_user',
      status: 'active',
      passwordHash: demoPass,
      lineUserId: 'UlineMalee005',
    },
    {
      id: SEED_IDS.users.leaderYangtalat,
      memberId: suuid(5, 7),
      username: 'boonmee_yangtalat',
      displayName: 'บุญมี เพชรยางตลาด (ผู้นำกลุ่มยางตลาด)',
      email: 'boonmee@faithmap.local',
      phoneE164: '+66819010007',
      systemRole: 'standard_user',
      status: 'active',
      passwordHash: demoPass,
      lineUserId: 'UlineBoonmee007',
    },
    {
      id: SEED_IDS.users.suspendedBodyLeaderSouth,
      username: 'wichian_suspended',
      displayName: 'วิเชียร (ระงับบัญชีชั่วคราว)',
      email: 'wichian@faithmap.local',
      phoneE164: '+66819010099',
      systemRole: 'standard_user',
      status: 'suspended',
      passwordHash: demoPass,
    },
    {
      id: SEED_IDS.users.standbyLeaderSouth,
      username: 'kanya_standby',
      displayName: 'กัญญา ริมปาว (พร้อมรับตำแหน่งบอดี้ใต้)',
      email: 'kanya@faithmap.local',
      phoneE164: '+66819010098',
      systemRole: 'standard_user',
      status: 'active',
      passwordHash: demoPass,
      lineUserId: 'UlineKanya098',
    },
  ];
  await db.insert(users).values(userRows);

  await db.insert(externalIdentities).values([
    {
      id: suuid(6, 1),
      userId: SEED_IDS.users.leaderNonthan,
      provider: 'line',
      providerSubject: 'UlineWichai003',
      displayName: 'วิชัย LINE',
    },
    {
      id: suuid(6, 2),
      userId: SEED_IDS.users.bodyLeaderNorth,
      provider: 'line',
      providerSubject: 'UlineSomchai001',
      displayName: 'สมชาย LINE',
    },
  ]);

  // 3. Seed Bodies
  await db.insert(bodies).values([
    {
      id: SEED_IDS.bodies.north,
      code: 'BODY-KSN-N',
      nameTh: 'บอดี้อำเภอเมืองกาฬสินธุ์เหนือ',
      nameEn: 'Kalasin North Body',
      region: 'ภาคตะวันออกเฉียงเหนือ',
      province: 'กาฬสินธุ์',
      status: 'active',
      sortOrder: 1,
    },
    {
      id: SEED_IDS.bodies.south,
      code: 'BODY-KSN-S',
      nameTh: 'บอดี้อำเภอยางตลาด-กาฬสินธุ์ใต้',
      nameEn: 'Kalasin South Body',
      region: 'ภาคตะวันออกเฉียงเหนือ',
      province: 'กาฬสินธุ์',
      status: 'active',
      sortOrder: 2,
    },
  ]);

  // 4. Seed 5 Kalasin Pilot House Mission Groups
  await db.insert(houseMissionGroups).values([
    {
      id: SEED_IDS.groups.nonthan,
      groupCode: 'GRP-NONTHAN',
      bodyId: SEED_IDS.bodies.north,
      nameTh: 'กลุ่มพันธกิจบ้านโนนทัน',
      district: 'เมืองกาฬสินธุ์',
      subdistrict: 'โพนทอง',
      province: 'กาฬสินธุ์',
      addressSummary: 'บ้านเลขที่ 48 หมู่ 4 ต.โพนทอง อ.เมืองกาฬสินธุ์',
      latitude: 16.4328,
      longitude: 103.5061,
      meetingDayOfWeek: 5,
      meetingTimeLocal: '19:00',
      status: 'active',
      targetAttendance: 12,
      notes: 'กลุ่มปกติ: มีหัวหน้าแคร์ตรวจสอบก่อนหัวหน้าบอดี้อนุมัติ (DEC-04)',
    },
    {
      id: SEED_IDS.groups.nongkung,
      groupCode: 'GRP-NONGKUNG',
      bodyId: SEED_IDS.bodies.north,
      nameTh: 'กลุ่มพันธกิจบ้านหนองกุง',
      district: 'เมืองกาฬสินธุ์',
      subdistrict: 'เหนือ',
      province: 'กาฬสินธุ์',
      addressSummary: 'บ้านเลขที่ 112 หมู่ 7 ต.เหนือ อ.เมืองกาฬสินธุ์',
      latitude: 16.4455,
      longitude: 103.521,
      meetingDayOfWeek: 3,
      meetingTimeLocal: '18:30',
      status: 'active',
      targetAttendance: 10,
      notes: 'ไม่มีผู้ตรวจทานระดับแคร์ — ส่งตรงถึงหัวหน้าบอดี้ (CD-03)',
    },
    {
      id: SEED_IDS.groups.huaisithon,
      groupCode: 'GRP-HUAISITHON',
      bodyId: SEED_IDS.bodies.north,
      nameTh: 'กลุ่มพันธกิจบ้านห้วยสีทน',
      district: 'เมืองกาฬสินธุ์',
      subdistrict: 'ห้วยสีทน',
      province: 'กาฬสินธุ์',
      addressSummary: 'บ้านเลขที่ 25 หมู่ 2 ต.ห้วยสีทน อ.เมืองกาฬสินธุ์',
      latitude: 16.418,
      longitude: 103.4892,
      meetingDayOfWeek: 6,
      meetingTimeLocal: '19:00',
      status: 'active',
      targetAttendance: 14,
      notes: 'มีผู้ประสานงานตรวจทาน และส่งกลับขอแก้ไข (needs_revision)',
    },
    {
      id: SEED_IDS.groups.buengwichai,
      groupCode: 'GRP-BUENGWICHAI',
      bodyId: SEED_IDS.bodies.north,
      nameTh: 'กลุ่มพันธกิจบ้านบึงวิชัย',
      district: 'เมืองกาฬสินธุ์',
      subdistrict: 'บึงวิชัย',
      province: 'กาฬสินธุ์',
      addressSummary: 'บ้านเลขที่ 89 หมู่ 3 ต.บึงวิชัย อ.เมืองกาฬสินธุ์',
      latitude: 16.462,
      longitude: 103.5415,
      meetingDayOfWeek: 4,
      meetingTimeLocal: '19:00',
      status: 'active',
      targetAttendance: 10,
      notes: 'ทดสอบกฎ Draft Privacy + Non-Self-Approval (DEC-05)',
    },
    {
      id: SEED_IDS.groups.yangtalat,
      groupCode: 'GRP-YANGTALAT',
      bodyId: SEED_IDS.bodies.south,
      nameTh: 'กลุ่มพันธกิจบ้านยางตลาด',
      district: 'ยางตลาด',
      subdistrict: 'ยางตลาด',
      province: 'กาฬสินธุ์',
      addressSummary: 'บ้านเลขที่ 19 หมู่ 1 ต.ยางตลาด อ.ยางตลาด',
      latitude: 16.4012,
      longitude: 103.3724,
      meetingDayOfWeek: 5,
      meetingTimeLocal: '19:00',
      status: 'active',
      targetAttendance: 12,
      notes: 'ทดสอบ Blocked Workflow (CD-07) เมื่อบอดี้ใต้ยังไม่มี Body Leader ที่ใช้งานได้',
    },
  ]);

  // 5. Seed Assignments (Body & Group scopes)
  await db.insert(assignments).values([
    {
      id: suuid(7, 1),
      userId: SEED_IDS.users.bodyLeaderNorth,
      scopeType: 'body',
      bodyId: SEED_IDS.bodies.north,
      roleType: 'body_leader',
      isPrimary: true,
      assignedByUserId: SEED_IDS.users.admin,
    },
    {
      // Body South currently has only a SUSPENDED body leader -> triggers CD-07 blocked!
      id: suuid(7, 2),
      userId: SEED_IDS.users.suspendedBodyLeaderSouth,
      scopeType: 'body',
      bodyId: SEED_IDS.bodies.south,
      roleType: 'body_leader',
      isPrimary: true,
      assignedByUserId: SEED_IDS.users.admin,
    },
    {
      id: suuid(7, 3),
      userId: SEED_IDS.users.careLeaderNonthan,
      scopeType: 'group',
      groupId: SEED_IDS.groups.nonthan,
      roleType: 'care_leader',
      isPrimary: true,
      assignedByUserId: SEED_IDS.users.bodyLeaderNorth,
    },
    {
      id: suuid(7, 4),
      userId: SEED_IDS.users.leaderNonthan,
      scopeType: 'group',
      groupId: SEED_IDS.groups.nonthan,
      roleType: 'group_leader',
      isPrimary: true,
      assignedByUserId: SEED_IDS.users.bodyLeaderNorth,
    },
    {
      id: suuid(7, 5),
      userId: SEED_IDS.users.leaderNongkung,
      scopeType: 'group',
      groupId: SEED_IDS.groups.nongkung,
      roleType: 'group_leader',
      isPrimary: true,
      assignedByUserId: SEED_IDS.users.bodyLeaderNorth,
    },
    {
      id: suuid(7, 6),
      userId: SEED_IDS.users.coordinatorHuaisithon,
      scopeType: 'group',
      groupId: SEED_IDS.groups.huaisithon,
      roleType: 'coordinator',
      isPrimary: true,
      assignedByUserId: SEED_IDS.users.bodyLeaderNorth,
    },
    {
      id: suuid(7, 7),
      userId: SEED_IDS.users.leaderHuaisithon,
      scopeType: 'group',
      groupId: SEED_IDS.groups.huaisithon,
      roleType: 'group_leader',
      isPrimary: true,
      assignedByUserId: SEED_IDS.users.bodyLeaderNorth,
    },
    {
      id: suuid(7, 8),
      userId: SEED_IDS.users.bodyLeaderNorth,
      scopeType: 'group',
      groupId: SEED_IDS.groups.buengwichai,
      roleType: 'group_leader',
      isPrimary: true,
      assignedByUserId: SEED_IDS.users.admin,
    },
    {
      id: suuid(7, 9),
      userId: SEED_IDS.users.leaderYangtalat,
      scopeType: 'group',
      groupId: SEED_IDS.groups.yangtalat,
      roleType: 'group_leader',
      isPrimary: true,
      assignedByUserId: SEED_IDS.users.admin,
    },
  ]);

  // 6. Seed Group Memberships
  await db.insert(groupMemberships).values([
    { id: suuid(8, 1), groupId: SEED_IDS.groups.nonthan, memberId: suuid(5, 3), membershipRole: 'leader' },
    { id: suuid(8, 2), groupId: SEED_IDS.groups.nonthan, memberId: suuid(5, 8), membershipRole: 'member' },
    { id: suuid(8, 3), groupId: SEED_IDS.groups.nonthan, memberId: suuid(5, 9), membershipRole: 'member' },
    { id: suuid(8, 4), groupId: SEED_IDS.groups.nongkung, memberId: suuid(5, 4), membershipRole: 'leader' },
    { id: suuid(8, 5), groupId: SEED_IDS.groups.nongkung, memberId: suuid(5, 10), membershipRole: 'member' },
    { id: suuid(8, 6), groupId: SEED_IDS.groups.huaisithon, memberId: suuid(5, 5), membershipRole: 'leader' },
    { id: suuid(8, 7), groupId: SEED_IDS.groups.huaisithon, memberId: suuid(5, 11), membershipRole: 'member' },
    { id: suuid(8, 8), groupId: SEED_IDS.groups.buengwichai, memberId: suuid(5, 1), membershipRole: 'leader' },
    { id: suuid(8, 9), groupId: SEED_IDS.groups.yangtalat, memberId: suuid(5, 7), membershipRole: 'leader' },
    { id: suuid(8, 10), groupId: SEED_IDS.groups.yangtalat, memberId: suuid(5, 12), membershipRole: 'member' },
  ]);

  // 7. Seed Reporting Periods (Previous brief_published + Current open)
  const prevPeriodId = suuid(9, 1);
  const currentPeriodId = suuid(9, 2);

  await db.insert(reportingPeriods).values([
    {
      id: prevPeriodId,
      periodKey: prevWindow.periodKey,
      startDate: prevWindow.startDate,
      endDate: prevWindow.endDate,
      deadlineAt: prevWindow.deadlineAt,
      briefScheduledAt: prevWindow.briefScheduledAt,
      status: 'brief_published',
    },
    {
      id: currentPeriodId,
      periodKey: currentWindow.periodKey,
      startDate: currentWindow.startDate,
      endDate: currentWindow.endDate,
      deadlineAt: currentWindow.deadlineAt,
      briefScheduledAt: currentWindow.briefScheduledAt,
      status: 'open',
    },
  ]);

  // 8. Seed Period Group Snapshots for both periods (DEC-08)
  const snapshotMeta = [
    {
      groupId: SEED_IDS.groups.nonthan,
      bodyId: SEED_IDS.bodies.north,
      groupNameSnapshot: 'กลุ่มพันธกิจบ้านโนนทัน',
      bodyNameSnapshot: 'บอดี้อำเภอเมืองกาฬสินธุ์เหนือ',
      districtSnapshot: 'เมืองกาฬสินธุ์',
      targetAttendanceSnapshot: 12,
      primaryGroupLeaderUserId: SEED_IDS.users.leaderNonthan,
      supervisorUserIdsJson: [SEED_IDS.users.careLeaderNonthan],
    },
    {
      groupId: SEED_IDS.groups.nongkung,
      bodyId: SEED_IDS.bodies.north,
      groupNameSnapshot: 'กลุ่มพันธกิจบ้านหนองกุง',
      bodyNameSnapshot: 'บอดี้อำเภอเมืองกาฬสินธุ์เหนือ',
      districtSnapshot: 'เมืองกาฬสินธุ์',
      targetAttendanceSnapshot: 10,
      primaryGroupLeaderUserId: SEED_IDS.users.leaderNongkung,
      supervisorUserIdsJson: [],
    },
    {
      groupId: SEED_IDS.groups.huaisithon,
      bodyId: SEED_IDS.bodies.north,
      groupNameSnapshot: 'กลุ่มพันธกิจบ้านห้วยสีทน',
      bodyNameSnapshot: 'บอดี้อำเภอเมืองกาฬสินธุ์เหนือ',
      districtSnapshot: 'เมืองกาฬสินธุ์',
      targetAttendanceSnapshot: 14,
      primaryGroupLeaderUserId: SEED_IDS.users.leaderHuaisithon,
      supervisorUserIdsJson: [SEED_IDS.users.coordinatorHuaisithon],
    },
    {
      groupId: SEED_IDS.groups.buengwichai,
      bodyId: SEED_IDS.bodies.north,
      groupNameSnapshot: 'กลุ่มพันธกิจบ้านบึงวิชัย',
      bodyNameSnapshot: 'บอดี้อำเภอเมืองกาฬสินธุ์เหนือ',
      districtSnapshot: 'เมืองกาฬสินธุ์',
      targetAttendanceSnapshot: 10,
      primaryGroupLeaderUserId: SEED_IDS.users.bodyLeaderNorth,
      supervisorUserIdsJson: [],
    },
    {
      groupId: SEED_IDS.groups.yangtalat,
      bodyId: SEED_IDS.bodies.south,
      groupNameSnapshot: 'กลุ่มพันธกิจบ้านยางตลาด',
      bodyNameSnapshot: 'บอดี้อำเภอยางตลาด-กาฬสินธุ์ใต้',
      districtSnapshot: 'ยางตลาด',
      targetAttendanceSnapshot: 12,
      primaryGroupLeaderUserId: SEED_IDS.users.leaderYangtalat,
      supervisorUserIdsJson: [],
    },
  ];

  await db.insert(periodGroupSnapshots).values([
    ...snapshotMeta.map((s, idx) => ({
      id: suuid(10, idx + 1),
      periodId: prevPeriodId,
      groupId: s.groupId,
      bodyId: s.bodyId,
      groupNameSnapshot: s.groupNameSnapshot,
      bodyNameSnapshot: s.bodyNameSnapshot,
      districtSnapshot: s.districtSnapshot,
      groupStatusSnapshot: 'active',
      targetAttendanceSnapshot: s.targetAttendanceSnapshot,
      expectedReport: true,
      primaryGroupLeaderUserId: s.primaryGroupLeaderUserId,
      supervisorUserIdsJson: s.supervisorUserIdsJson,
    })),
    ...snapshotMeta.map((s, idx) => ({
      id: suuid(10, 10 + idx + 1),
      periodId: currentPeriodId,
      groupId: s.groupId,
      bodyId: s.bodyId,
      groupNameSnapshot: s.groupNameSnapshot,
      bodyNameSnapshot: s.bodyNameSnapshot,
      districtSnapshot: s.districtSnapshot,
      groupStatusSnapshot: 'active',
      targetAttendanceSnapshot: s.targetAttendanceSnapshot,
      expectedReport: true,
      primaryGroupLeaderUserId: s.primaryGroupLeaderUserId,
      supervisorUserIdsJson: s.supervisorUserIdsJson,
    })),
  ]);

  // 9. Seed Current Period Reports reflecting 5 distinct Kalasin workflow states
  const rNonthanId = suuid(11, 1);
  const rNongkungId = suuid(11, 2);
  const rHuaisithonId = suuid(11, 3);
  const rBuengwichaiId = suuid(11, 4);
  const rYangtalatId = suuid(11, 5);
  const submittedTime = new Date(now.getTime() - 2 * 3_600_000);
  const reviewedTime = new Date(now.getTime() - 3_600_000);

  await db.insert(weeklyReports).values([
    {
      id: rNonthanId,
      periodId: currentPeriodId,
      snapshotId: suuid(10, 11),
      groupId: SEED_IDS.groups.nonthan,
      bodyId: SEED_IDS.bodies.north,
      status: 'submitted',
      meetingHeld: true,
      meetingDate: addDaysIsoDate(currentWindow.startDate, 4),
      totalAttendees: 11,
      memberAttendees: 9,
      newVisitorsCount: 1,
      returningVisitorsCount: 1,
      childrenCount: 0,
      offeringAmountThb: '850.00',
      summaryNotes: 'นมัสการและแบ่งปันพระวจนะเรื่องการให้อภัย มีเพื่อนบ้านใหม่มาร่วม 1 ท่าน',
      prayerRequests: 'อธิษฐานเผื่อสุขภาพป้าสายใจที่จะผ่าตัดตาเดือนหน้า',
      careNeedsNotes: 'ขอทีมเยี่ยมเยียนแวะเยี่ยมป้าสายใจวันอังคารหน้า',
      requiresSupervisorReview: true,
      submittedByUserId: SEED_IDS.users.leaderNonthan,
      submittedAt: submittedTime,
      version: 2,
    },
    {
      id: rNongkungId,
      periodId: currentPeriodId,
      snapshotId: suuid(10, 12),
      groupId: SEED_IDS.groups.nongkung,
      bodyId: SEED_IDS.bodies.north,
      status: 'approved',
      meetingHeld: true,
      meetingDate: addDaysIsoDate(currentWindow.startDate, 2),
      totalAttendees: 13,
      memberAttendees: 10,
      newVisitorsCount: 2,
      returningVisitorsCount: 1,
      childrenCount: 2,
      offeringAmountThb: '1240.00',
      summaryNotes: 'บรรยากาศอบอุ่น พี่น้องหนุนใจกันอย่างดี และร่วมอธิษฐานเผื่อครอบครัวใหม่',
      prayerRequests: 'อธิษฐานเผื่อผู้เยี่ยมใหม่ 2 ท่านให้เข้าใจข่าวประเสริฐชัดเจน',
      careNeedsNotes: 'ส่งต่อข้อมูลผู้เยี่ยมใหม่เพื่อติดตามภายในสัปดาห์นี้',
      requiresSupervisorReview: false,
      submittedByUserId: SEED_IDS.users.leaderNongkung,
      submittedAt: submittedTime,
      approvedByUserId: SEED_IDS.users.bodyLeaderNorth,
      approvedAt: reviewedTime,
      version: 3,
    },
    {
      id: rHuaisithonId,
      periodId: currentPeriodId,
      snapshotId: suuid(10, 13),
      groupId: SEED_IDS.groups.huaisithon,
      bodyId: SEED_IDS.bodies.north,
      status: 'needs_revision',
      meetingHeld: true,
      meetingDate: addDaysIsoDate(currentWindow.startDate, 5),
      totalAttendees: 9,
      memberAttendees: 8,
      newVisitorsCount: 1,
      returningVisitorsCount: 0,
      childrenCount: 0,
      offeringAmountThb: '500.00',
      summaryNotes: 'ประชุมกลุ่มประจำสัปดาห์ มีผู้เยี่ยมใหม่ 1 ท่าน',
      prayerRequests: 'ขอทรงนำการเก็บเกี่ยวข้าวของครอบครัวสมาชิก',
      requiresSupervisorReview: true,
      submittedByUserId: SEED_IDS.users.leaderHuaisithon,
      submittedAt: submittedTime,
      revisionRequestedByUserId: SEED_IDS.users.coordinatorHuaisithon,
      revisionRequestedAt: reviewedTime,
      revisionReason: 'กรุณาบันทึกรายชื่อผู้เยี่ยมใหม่และสถานะการยินยอม PDPA ก่อนส่งอนุมัติอีกครั้ง',
      version: 2,
    },
    {
      // Draft report: MUST remain completely hidden from non-Group Leaders (FR-07.5)
      id: rBuengwichaiId,
      periodId: currentPeriodId,
      snapshotId: suuid(10, 14),
      groupId: SEED_IDS.groups.buengwichai,
      bodyId: SEED_IDS.bodies.north,
      status: 'draft',
      meetingHeld: true,
      meetingDate: addDaysIsoDate(currentWindow.startDate, 3),
      totalAttendees: 7,
      memberAttendees: 7,
      summaryNotes: '[ฉบับร่างส่วนตัว] กำลังตรวจสอบยอดผู้เข้าร่วมก่อนกดส่งจริง',
      requiresSupervisorReview: false,
      submittedByUserId: SEED_IDS.users.bodyLeaderNorth,
      version: 1,
    },
    {
      // Blocked report (Body South has no usable Body Leader -> CD-07)
      id: rYangtalatId,
      periodId: currentPeriodId,
      snapshotId: suuid(10, 15),
      groupId: SEED_IDS.groups.yangtalat,
      bodyId: SEED_IDS.bodies.south,
      status: 'submitted',
      meetingHeld: true,
      meetingDate: addDaysIsoDate(currentWindow.startDate, 4),
      totalAttendees: 10,
      memberAttendees: 9,
      newVisitorsCount: 1,
      returningVisitorsCount: 0,
      childrenCount: 1,
      offeringAmountThb: '720.00',
      summaryNotes: 'ประชุมกลุ่มปกติ พี่น้องร่วมอธิษฐานเผื่อชุมชนยางตลาด',
      prayerRequests: 'อธิษฐานเผื่อผู้นำบอดี้ใหม่ของบอดี้ใต้',
      isBlocked: true,
      blockedReason: 'NO_ELIGIBLE_BODY_LEADER',
      blockedAt: submittedTime,
      requiresSupervisorReview: false,
      submittedByUserId: SEED_IDS.users.leaderYangtalat,
      submittedAt: submittedTime,
      version: 2,
    },
  ]);

  // Attendance records for seeded reports
  await db.insert(attendanceRecords).values([
    {
      id: suuid(12, 1),
      weeklyReportId: rNonthanId,
      memberId: suuid(5, 3),
      attendanceStatus: 'present',
    },
    {
      id: suuid(12, 2),
      weeklyReportId: rNonthanId,
      memberId: suuid(5, 8),
      attendanceStatus: 'absent',
      notes: 'เตรียมผ่าตัดตา',
    },
    {
      id: suuid(12, 3),
      weeklyReportId: rNonthanId,
      memberId: suuid(5, 9),
      attendanceStatus: 'present',
    },
    {
      id: suuid(12, 4),
      weeklyReportId: rNongkungId,
      memberId: suuid(5, 4),
      attendanceStatus: 'present',
    },
    {
      id: suuid(12, 5),
      weeklyReportId: rNongkungId,
      memberId: suuid(5, 10),
      attendanceStatus: 'present',
    },
  ]);

  // 10. Seed Visitors (PDPA Consent DEC-10) & Visits & Open Follow-Ups
  const v1Id = suuid(13, 1);
  const v2Id = suuid(13, 2);
  await db.insert(visitors).values([
    {
      id: v1Id,
      fullName: 'นางสาวณัฐธิดา คำภู',
      nickname: 'น้องมิ้นท์',
      phoneE164: '+66894123456',
      consentForContact: true,
      consentRecordedAt: reviewedTime,
      consentCapturedByUserId: SEED_IDS.users.leaderNongkung,
      firstOriginGroupId: SEED_IDS.groups.nongkung,
      visitCount: 1,
    },
    {
      id: v2Id,
      fullName: 'นายสมศักดิ์ ชาวบ้านโนน',
      nickname: 'พี่ศักดิ์',
      phoneE164: null,
      consentForContact: false, // Walk-in without phone consent: valid per DEC-10!
      firstOriginGroupId: SEED_IDS.groups.nonthan,
      visitCount: 2,
    },
  ]);

  await db.insert(visitorVisits).values([
    {
      id: suuid(14, 1),
      visitorId: v1Id,
      groupId: SEED_IDS.groups.nongkung,
      weeklyReportId: rNongkungId,
      periodId: currentPeriodId,
      visitType: 'new_visitor',
      visitedOn: addDaysIsoDate(currentWindow.startDate, 2),
      recordedByUserId: SEED_IDS.users.leaderNongkung,
      notes: 'เพื่อนชวนมาร่วมครั้งแรก สนใจเรียนพระคัมภีร์พื้นฐาน',
    },
    {
      id: suuid(14, 2),
      visitorId: v2Id,
      groupId: SEED_IDS.groups.nonthan,
      weeklyReportId: rNonthanId,
      periodId: currentPeriodId,
      visitType: 'returning_visitor',
      visitedOn: addDaysIsoDate(currentWindow.startDate, 4),
      recordedByUserId: SEED_IDS.users.leaderNonthan,
      notes: 'กลับมาเยี่ยมครั้งที่ 2 (ยังไม่ขอให้เบอร์ติดต่อ)',
    },
  ]);

  await db.insert(followUpItems).values([
    {
      id: suuid(15, 1),
      groupId: SEED_IDS.groups.nongkung,
      visitorId: v1Id,
      sourceReportId: rNongkungId,
      assignedToUserId: SEED_IDS.users.leaderNongkung,
      title: 'นัดเยี่ยมน้องมิ้นท์และแนะนำบทเรียนแรก',
      notes: 'ผู้เยี่ยมใหม่ให้ความยินยอมติดต่อทางโทรศัพท์แล้ว',
      status: 'open',
      dueDate: addDaysIsoDate(currentWindow.endDate, 4),
      createdByUserId: SEED_IDS.users.leaderNongkung,
    },
    {
      id: suuid(15, 2),
      groupId: SEED_IDS.groups.nonthan,
      memberId: suuid(5, 8),
      sourceReportId: rNonthanId,
      assignedToUserId: SEED_IDS.users.careLeaderNonthan,
      title: 'เยี่ยมให้กำลังใจป้าสายใจก่อนผ่าตัดตา',
      notes: 'ประสานหัวหน้าแคร์นำของเยี่ยมวันอังคาร',
      status: 'open',
      dueDate: addDaysIsoDate(currentWindow.endDate, 2),
      createdByUserId: SEED_IDS.users.leaderNonthan,
    },
  ]);

  // 11. Seed Previous Week Historical Reports & Published Immutable Brief
  const prevApprovedReportId = suuid(11, 20);
  await db.insert(weeklyReports).values({
    id: prevApprovedReportId,
    periodId: prevPeriodId,
    snapshotId: suuid(10, 1),
    groupId: SEED_IDS.groups.nonthan,
    bodyId: SEED_IDS.bodies.north,
    status: 'approved',
    meetingHeld: true,
    meetingDate: addDaysIsoDate(prevWindow.startDate, 4),
    totalAttendees: 12,
    memberAttendees: 10,
    newVisitorsCount: 1,
    returningVisitorsCount: 1,
    childrenCount: 1,
    offeringAmountThb: '900.00',
    summaryNotes: 'สัปดาห์ที่ผ่านมาเรียนเรื่องบ้านแห่งความหวังครบทุกคน',
    requiresSupervisorReview: true,
    submittedByUserId: SEED_IDS.users.leaderNonthan,
    submittedAt: prevWindow.deadlineAt,
    supervisorReviewedByUserId: SEED_IDS.users.careLeaderNonthan,
    supervisorReviewedAt: prevWindow.deadlineAt,
    approvedByUserId: SEED_IDS.users.bodyLeaderNorth,
    approvedAt: prevWindow.briefScheduledAt,
    version: 3,
  });

  await db.insert(meetingBriefs).values({
    id: suuid(16, 1),
    periodId: prevPeriodId,
    generatedAt: prevWindow.briefScheduledAt,
    generatedByJob: true,
    isImmutable: true,
    sectionsJson: {
      section1Overview: `สรุปภาพรวมพันธกิจบ้านสัปดาห์ ${prevWindow.periodKey} (${prevWindow.startDate} ถึง ${prevWindow.endDate})`,
      section2SubmissionHealth: { expected: 5, submitted: 1, approved: 1, missing: 4 },
      section3AttendanceTrend: { periodAttendance: 12, newVisitors: 1, returningVisitors: 1 },
      section4BodyBreakdown: [
        { bodyName: 'บอดี้อำเภอเมืองกาฬสินธุ์เหนือ', activeGroups: 4, approved: 1, attendance: 12 },
        { bodyName: 'บอดี้อำเภอยางตลาด-กาฬสินธุ์ใต้', activeGroups: 1, approved: 0, attendance: 0 },
      ],
      section5LateAndMissingGroups: ['กลุ่มบ้านหนองกุง', 'กลุ่มบ้านห้วยสีทน', 'กลุ่มบ้านบึงวิชัย', 'กลุ่มบ้านยางตลาด'],
      section6BlockedAndEscalations: [],
      section7NewVisitorsSummary: { totalNewVisitors: 1, consentedFollowUp: 1 },
      section8OpenFollowUps: ['มีงานติดตามที่เปิดอยู่ 1 รายการ (ชื่อรายการเป็นข้อมูลจำกัด)'],
      section9GroupsWithPrayerRequests: 1,
      section9PrayerAndCareThemes: ['มี 1 กลุ่มแจ้งหัวข้ออธิษฐานในสัปดาห์นี้ (ข้อความเป็นข้อมูลจำกัด ดูได้เฉพาะผู้ดูแลกลุ่ม หัวหน้าบอดี้ และผู้ดูแลระบบ)'],
      section10ActionDecisions: ['แต่งตั้ง Body Leader บอดี้ใต้และเตรียมความพร้อมกลุ่มนำร่องกาฬสินธุ์'],
    },
    metricsJson: {
      activeBodies: 2,
      activeGroups: 5,
      expectedReports: 5,
      submittedReports: 1,
      missingReports: 4,
      heldMeetings: 1,
      confirmedNotHeld: 0,
      lateReports: 0,
      blockedReports: 0,
      periodAttendance: 12,
      newVisitors: 1,
      returningVisitors: 1,
      openFollowUps: 1,
    },
  });

  // 12. Seed Report Audit Events, Notifications, LINE Dispatches, Security Logs
  await db.insert(reportAuditEvents).values([
    {
      id: suuid(17, 1),
      weeklyReportId: rNonthanId,
      periodId: currentPeriodId,
      groupId: SEED_IDS.groups.nonthan,
      eventType: 'report_submitted',
      fromStatus: 'draft',
      toStatus: 'submitted',
      actorUserId: SEED_IDS.users.leaderNonthan,
      actorRole: 'group_leader',
      metadata: { requiresSupervisorReview: true },
    },
    {
      id: suuid(17, 2),
      weeklyReportId: rNongkungId,
      periodId: currentPeriodId,
      groupId: SEED_IDS.groups.nongkung,
      eventType: 'report_approved',
      fromStatus: 'submitted',
      toStatus: 'approved',
      actorUserId: SEED_IDS.users.bodyLeaderNorth,
      actorRole: 'body_leader',
      metadata: { fastTrackNoSupervisor: true },
    },
    {
      id: suuid(17, 3),
      weeklyReportId: rHuaisithonId,
      periodId: currentPeriodId,
      groupId: SEED_IDS.groups.huaisithon,
      eventType: 'revision_requested',
      fromStatus: 'submitted',
      toStatus: 'needs_revision',
      actorUserId: SEED_IDS.users.coordinatorHuaisithon,
      actorRole: 'coordinator',
      reason: 'กรุณาบันทึกรายชื่อผู้เยี่ยมใหม่และสถานะการยินยอม PDPA ก่อนส่งอนุมัติอีกครั้ง',
    },
    {
      id: suuid(17, 4),
      weeklyReportId: rYangtalatId,
      periodId: currentPeriodId,
      groupId: SEED_IDS.groups.yangtalat,
      eventType: 'workflow_blocked',
      fromStatus: 'draft',
      toStatus: 'submitted',
      actorUserId: SEED_IDS.users.leaderYangtalat,
      actorRole: 'group_leader',
      reason: 'NO_ELIGIBLE_BODY_LEADER',
    },
  ]);

  await db.insert(notifications).values([
    {
      id: suuid(18, 1),
      userId: SEED_IDS.users.careLeaderNonthan,
      channel: 'in_app',
      category: 'review_pending',
      title: 'รายงานใหม่รอการตรวจทาน: กลุ่มพันธกิจบ้านโนนทัน',
      body: 'ผู้นำกลุ่มวิชัยส่งรายงานประจำสัปดาห์แล้ว กรุณาตรวจทานเพื่อให้หัวหน้าบอดี้อนุมัติ',
      relatedEntityType: 'weekly_report',
      relatedEntityId: rNonthanId,
      dedupeKey: `seed:review:${rNonthanId}`,
    },
    {
      id: suuid(18, 2),
      userId: SEED_IDS.users.leaderHuaisithon,
      channel: 'in_app',
      category: 'needs_revision',
      title: 'รายงานถูกส่งกลับขอแก้ไข: กลุ่มพันธกิจบ้านห้วยสีทน',
      body: 'ผู้ประสานงานณรงค์: กรุณาบันทึกรายชื่อผู้เยี่ยมใหม่และสถานะการยินยอม PDPA ก่อนส่งอนุมัติอีกครั้ง',
      relatedEntityType: 'weekly_report',
      relatedEntityId: rHuaisithonId,
      dedupeKey: `seed:revision:${rHuaisithonId}`,
    },
    {
      id: suuid(18, 3),
      userId: SEED_IDS.users.admin,
      channel: 'in_app',
      category: 'workflow_blocked',
      title: 'รายงานติดขัด (Blocked): กลุ่มพันธกิจบ้านยางตลาด',
      body: 'บอดี้อำเภอยางตลาด-กาฬสินธุ์ใต้ยังไม่มีหัวหน้าบอดี้ที่ใช้งานได้ (CD-07) กรุณามอบหมายผู้นำและปลดล็อก',
      relatedEntityType: 'weekly_report',
      relatedEntityId: rYangtalatId,
      dedupeKey: `seed:blocked:${rYangtalatId}`,
    },
  ]);

  await db.insert(lineDispatches).values([
    {
      id: suuid(19, 1),
      userId: SEED_IDS.users.admin,
      lineUserId: 'UlineAdminKanok',
      category: 'workflow_blocked',
      messageText:
        '[FaithMap] แจ้งเตือนด่วน: กลุ่มพันธกิจบ้านยางตลาดส่งรายงานแล้ว แต่บอดี้ใต้ไม่มี Body Leader ที่ใช้งานได้ (CD-07)',
      dedupeKey: `line:blocked:${rYangtalatId}`,
      status: 'simulated_sent',
      dispatchedAt: submittedTime,
    },
  ]);

  await db.insert(securityAuditLogs).values([
    {
      id: suuid(20, 1),
      actorUserId: SEED_IDS.users.admin,
      action: 'pilot_database_seeded',
      targetType: 'organization_settings',
      targetId: SEED_IDS.orgSettings,
      outcome: 'success',
      metadata: { pilotProvince: 'กาฬสินธุ์', groups: 5, bodies: 2 },
    },
  ]);

  return true;
}
