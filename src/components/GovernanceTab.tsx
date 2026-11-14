'use client';

import { useState } from 'react';
import {
  ArrowRightLeft,
  Building2,
  ShieldCheck,
  UserCog,
  UserPlus,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import type { AssignmentRole, WorkspacePayload } from '@/lib/types';

export function GovernanceTab({
  workspace,
  onRefresh,
}: {
  workspace: WorkspacePayload;
  onRefresh: () => Promise<void>;
}) {
  const actor = workspace.actor;
  const isAdmin =
    actor.user.systemRole === 'admin' || actor.user.systemRole === 'super_admin';
  const canManageAnyGroup = isAdmin || actor.bodyLeaderBodyIds.length > 0;

  const [assignScope, setAssignScope] = useState<'body' | 'group'>('group');
  const [assignBodyId, setAssignBodyId] = useState(workspace.bodies[0]?.id ?? '');
  const [assignGroupId, setAssignGroupId] = useState(workspace.groups[0]?.id ?? '');
  const [assignUserId, setAssignUserId] = useState(
    workspace.governanceUsers.find((u) => u.isUsable)?.id ?? ''
  );
  const [assignRole, setAssignRole] = useState<AssignmentRole>('care_leader');

  const [newGroupCode, setNewGroupCode] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupBodyId, setNewGroupBodyId] = useState(workspace.bodies[0]?.id ?? '');
  const [newGroupDistrict, setNewGroupDistrict] = useState('เมืองกาฬสินธุ์');

  const [transferGroupId, setTransferGroupId] = useState(workspace.groups[0]?.id ?? '');
  const [transferBodyId, setTransferBodyId] = useState(
    workspace.bodies[1]?.id ?? workspace.bodies[0]?.id ?? ''
  );
  const [transferReason, setTransferReason] = useState('ปรับขอบเขตการดูแลระดับบอดี้');

  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function runOrgAction(body: Record<string, unknown>, okText: string) {
    setBusy(true);
    setMsg(null);
    try {
      await apiRequest('/api/v1/organization', { method: 'POST', body });
      setMsg({ type: 'ok', text: okText });
      await onRefresh();
    } catch (err) {
      setMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'ดำเนินการไม่สำเร็จ',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-teal-800">
          <Building2 className="h-4 w-4" aria-hidden="true" />
          <span>โครงสร้างองค์กรแบบ 2 ระดับ (Body → House Mission Group) และผู้ดูแล</span>
        </div>
        <h2 className="mt-1 text-2xl font-bold text-slate-900">
          จัดการกลุ่มพันธกิจ การมอบหมายผู้นำ และบันทึกความปลอดภัย
        </h2>
      </div>

      {msg && (
        <div
          role="alert"
          className={`rounded-xl border p-4 text-base font-semibold ${
            msg.type === 'ok'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
              : 'border-rose-300 bg-rose-50 text-rose-950'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Bodies Health Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {workspace.bodies.map((b) => (
          <div
            key={b.id}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-slate-500">{b.code}</span>
                <h3 className="text-xl font-bold text-slate-900">{b.nameTh}</h3>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  b.hasEligibleBodyLeader
                    ? 'bg-emerald-50 text-emerald-900'
                    : 'bg-rose-100 text-rose-900'
                }`}
              >
                {b.hasEligibleBodyLeader
                  ? 'พร้อมอนุมัติ (มี Body Leader)'
                  : 'ขาด Body Leader (เสี่ยง Blocked CD-07)'}
              </span>
            </div>

            <div className="mt-3 space-y-1.5 text-sm text-slate-700">
              {b.bodyLeaders.map((l) => (
                <div
                  key={l.assignmentId}
                  className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
                >
                  <span>
                    {l.displayName} ({l.accountStatus})
                  </span>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() =>
                        runOrgAction(
                          {
                            action: 'revoke_assignment',
                            assignmentId: l.assignmentId,
                            reason: 'ปรับปรุงการมอบหมายระดับบอดี้',
                          },
                          'ถอดถอนตำแหน่งระดับบอดี้เรียบร้อย'
                        )
                      }
                      className="text-xs font-bold text-rose-700 hover:underline"
                    >
                      ถอดถอน
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Assign Leadership Role (DEC-09 Enforced) */}
      {canManageAnyGroup && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <UserCog className="h-5 w-5 text-teal-700" aria-hidden="true" />
            <h3 className="text-xl font-bold text-slate-900">
              มอบหมายหน้าที่ผู้นำแบบยืดหยุ่น (Care / Coordinator / Group Leader / Body Leader)
            </h3>
          </div>
          <p className="mb-4 text-sm text-slate-600">
            หัวหน้าบอดี้มอบหมายบทบาทได้เฉพาะกลุ่มในบอดี้ของตนเองเท่านั้น (DEC-09) และระบบรับเฉพาะบัญชีที่เปิดใช้งานพร้อมล็อกอินแล้ว
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <select
              aria-label="ระดับการมอบหมาย"
              value={assignScope}
              onChange={(e) => {
                const v = e.target.value as 'body' | 'group';
                setAssignScope(v);
                setAssignRole(v === 'body' ? 'body_leader' : 'care_leader');
              }}
              className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-3 text-base"
            >
              <option value="group">ระดับกลุ่มพันธกิจบ้าน</option>
              {isAdmin && <option value="body">ระดับบอดี้ (Body Leader)</option>}
            </select>

            {assignScope === 'body' ? (
              <select
                aria-label="เลือกบอดี้"
                value={assignBodyId}
                onChange={(e) => setAssignBodyId(e.target.value)}
                className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-3 text-base"
              >
                {workspace.bodies.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nameTh}
                  </option>
                ))}
              </select>
            ) : (
              <select
                aria-label="เลือกกลุ่มพันธกิจ"
                value={assignGroupId}
                onChange={(e) => setAssignGroupId(e.target.value)}
                className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-3 text-base"
              >
                {workspace.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nameTh} ({g.bodyName})
                  </option>
                ))}
              </select>
            )}

            <select
              aria-label="เลือกบทบาท"
              value={assignRole}
              onChange={(e) => setAssignRole(e.target.value as AssignmentRole)}
              className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-3 text-base"
            >
              {assignScope === 'body' ? (
                <option value="body_leader">หัวหน้าบอดี้ (body_leader)</option>
              ) : (
                <>
                  <option value="care_leader">หัวหน้าแคร์ (care_leader)</option>
                  <option value="coordinator">ผู้ประสานงาน (coordinator)</option>
                  <option value="group_leader">ผู้นำกลุ่ม (group_leader)</option>
                </>
              )}
            </select>

            <select
              aria-label="เลือกผู้ใช้งาน"
              value={assignUserId}
              onChange={(e) => setAssignUserId(e.target.value)}
              className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-3 text-base"
            >
              {workspace.governanceUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName} [{u.isUsable ? 'พร้อมใช้งาน' : u.status}]
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            disabled={busy || !assignUserId}
            onClick={() =>
              runOrgAction(
                {
                  action: 'assign_role',
                  userId: assignUserId,
                  scopeType: assignScope,
                  bodyId: assignScope === 'body' ? assignBodyId : null,
                  groupId: assignScope === 'group' ? assignGroupId : null,
                  roleType: assignRole,
                  isPrimary: true,
                },
                'บันทึกการมอบหมายหน้าที่เรียบร้อยแล้ว'
              )
            }
            className="mt-4 min-h-[48px] rounded-xl bg-teal-700 px-5 py-2 text-base font-bold text-white hover:bg-teal-800 disabled:opacity-50"
          >
            บันทึกการมอบหมาย
          </button>
        </div>
      )}

      {/* Create New Group & Transfer Group Body */}
      {canManageAnyGroup && (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-teal-700" aria-hidden="true" />
              <h3 className="text-lg font-bold text-slate-900">ตั้งกลุ่มพันธกิจบ้านใหม่</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="text"
                value={newGroupCode}
                onChange={(e) => setNewGroupCode(e.target.value)}
                placeholder="รหัสกลุ่ม เช่น GRP-KHAMPHAENG"
                className="min-h-[48px] rounded-xl border border-slate-300 px-3 text-base"
              />
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="ชื่อกลุ่มพันธกิจบ้าน"
                className="min-h-[48px] rounded-xl border border-slate-300 px-3 text-base"
              />
              <select
                value={newGroupBodyId}
                onChange={(e) => setNewGroupBodyId(e.target.value)}
                className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-3 text-base"
              >
                {workspace.bodies.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nameTh}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={newGroupDistrict}
                onChange={(e) => setNewGroupDistrict(e.target.value)}
                placeholder="อำเภอ"
                className="min-h-[48px] rounded-xl border border-slate-300 px-3 text-base"
              />
            </div>
            <button
              type="button"
              disabled={busy || !newGroupCode || !newGroupName}
              onClick={() =>
                runOrgAction(
                  {
                    action: 'create_group',
                    groupCode: newGroupCode,
                    bodyId: newGroupBodyId,
                    nameTh: newGroupName,
                    district: newGroupDistrict,
                    addressSummary: `เขต${newGroupDistrict} จ.กาฬสินธุ์`,
                    latitude: 16.435,
                    longitude: 103.505,
                  },
                  'สร้างกลุ่มพันธกิจบ้านใหม่เรียบร้อย'
                )
              }
              className="min-h-[48px] rounded-xl border border-teal-700 bg-teal-50 px-4 text-base font-bold text-teal-900 hover:bg-teal-100"
            >
              เพิ่มกลุ่มพันธกิจบ้าน
            </button>
          </div>

          {isAdmin && (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5 text-teal-700" aria-hidden="true" />
                <h3 className="text-lg font-bold text-slate-900">
                  ย้ายกลุ่มข้ามบอดี้ (คงประวัติ Snapshot เดิม DEC-08)
                </h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  value={transferGroupId}
                  onChange={(e) => setTransferGroupId(e.target.value)}
                  className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-3 text-base"
                >
                  {workspace.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nameTh}
                    </option>
                  ))}
                </select>
                <select
                  value={transferBodyId}
                  onChange={(e) => setTransferBodyId(e.target.value)}
                  className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-3 text-base"
                >
                  {workspace.bodies.map((b) => (
                    <option key={b.id} value={b.id}>
                      → {b.nameTh}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  placeholder="เหตุผลในการย้ายบอดี้"
                  className="min-h-[48px] rounded-xl border border-slate-300 px-3 text-base sm:col-span-2"
                />
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  runOrgAction(
                    {
                      action: 'transfer_group',
                      groupId: transferGroupId,
                      toBodyId: transferBodyId,
                      reason: transferReason,
                    },
                    'ย้ายกลุ่มไปยังบอดี้ใหม่เรียบร้อย (Snapshot รอบเดิมคงอยู่)'
                  )
                }
                className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-4 text-base font-bold text-slate-800 hover:bg-slate-50"
              >
                ย้ายสังกัดบอดี้
              </button>
            </div>
          )}
        </div>
      )}

      {/* Users Lifecycle + Security Audit Logs (Admin only) */}
      {isAdmin && (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-xl font-bold text-slate-900">
              จัดการสถานะบัญชีผู้ใช้ (isUsableAccount)
            </h3>
            <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
              {workspace.governanceUsers.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 p-3"
                >
                  <div>
                    <div className="text-base font-bold text-slate-900">{u.displayName}</div>
                    <div className="text-xs text-slate-600">
                      {u.username} · {u.systemRole} · สถานะ: {u.status}
                    </div>
                  </div>
                  {u.id !== actor.user.id && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        runOrgAction(
                          {
                            action: 'update_user_status',
                            targetUserId: u.id,
                            nextStatus: u.status === 'active' ? 'suspended' : 'active',
                            reason: 'ปรับสถานะโดยผู้ดูแลระบบ',
                          },
                          `อัปเดตสถานะบัญชี ${u.username} แล้ว`
                        )
                      }
                      className={`min-h-[40px] rounded-lg px-3 text-sm font-bold ${
                        u.status === 'active'
                          ? 'border border-rose-300 bg-rose-50 text-rose-800'
                          : 'bg-emerald-700 text-white'
                      }`}
                    >
                      {u.status === 'active' ? 'ระงับบัญชี' : 'เปิดใช้งาน'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-teal-700" aria-hidden="true" />
              <h3 className="text-xl font-bold text-slate-900">
                บันทึกเหตุการณ์ความปลอดภัย (Append-Only Audit Log)
              </h3>
            </div>
            <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1 font-mono text-xs">
              {workspace.securityLogs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-slate-800"
                >
                  <div className="font-bold">
                    [{log.outcome}] {log.action} · {log.targetType}
                  </div>
                  <div className="text-slate-600">
                    {new Date(log.createdAt).toLocaleString('th-TH')}{' '}
                    {log.reason ? `| ${log.reason}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
