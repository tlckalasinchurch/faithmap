export interface MiniActor {
  user: { systemRole: string };
  assignments: Array<{ roleType: string; scopeType: string }>;
  bodyLeaderBodyIds: string[];
  groupLeaderGroupIds: string[];
  supervisorGroupIds: string[];
}

export type MiniNavKey = 'home' | 'reports' | 'group' | 'growth' | 'approvals' | 'notifications';

export interface MiniNavItem {
  key: MiniNavKey;
  label: string;
}

const LABELS: Record<MiniNavKey, string> = {
  home: 'หน้าแรก',
  reports: 'รายงาน',
  group: 'กลุ่มของฉัน',
  growth: 'การเติบโต',
  approvals: 'อนุมัติสมาชิก',
  notifications: 'แจ้งเตือน',
};

/** The menu only decides what to show. The server still checks every request. */
export function getMiniNav(actor: MiniActor): MiniNavItem[] {
  const role = actor.user.systemRole;
  const isAdmin = role === 'admin' || role === 'super_admin';
  const isPastor = role === 'mission_leader';
  const isBodyLeader = actor.bodyLeaderBodyIds.length > 0;
  const hasGroupScope =
    actor.groupLeaderGroupIds.length > 0 ||
    actor.supervisorGroupIds.length > 0 ||
    actor.assignments.some((a) => a.scopeType === 'group' || a.scopeType === 'care');

  const keys: MiniNavKey[] = ['home'];
  if (hasGroupScope || isBodyLeader || isAdmin || isPastor) keys.push('reports', 'group');
  if (hasGroupScope || isBodyLeader || isAdmin) keys.push('growth');
  if (role === 'super_admin') keys.push('approvals');
  keys.push('notifications');
  return keys.map((key) => ({ key, label: LABELS[key] }));
}

export function miniRoleLabel(actor: MiniActor): string {
  const role = actor.user.systemRole;
  if (role === 'super_admin') return 'ผู้ดูแลระบบสูงสุด';
  if (role === 'admin') return 'ผู้ดูแลระบบ';
  if (actor.bodyLeaderBodyIds.length > 0) return 'หัวหน้าบอดี้';
  if (role === 'mission_leader') return 'ศิษยาภิบาล';
  if (actor.groupLeaderGroupIds.length > 0) return 'ผู้รับผิดชอบกลุ่ม';
  if (actor.assignments.some((a) => a.roleType === 'care_leader')) return 'ผู้ดูแลแคร์';
  if (actor.assignments.some((a) => a.roleType === 'coordinator')) return 'ผู้ประสานงาน';
  return 'สมาชิก (รอรับหน้าที่)';
}
