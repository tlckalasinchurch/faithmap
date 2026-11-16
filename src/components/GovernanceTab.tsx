'use client';

import { useEffect, useState } from 'react';
import {
  ArrowRightLeft,
  Building2,
  ShieldCheck,
  UserCog,
  UserPlus,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import type { AssignmentRole, WorkspacePayload } from '@/lib/types';
import { BodyManagementPanel } from './BodyManagementPanel';
import { LineGovernancePanel } from './LineGovernancePanel';

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
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  // Sync select defaults when the first body, group, or user is added to a clean database
  useEffect(() => {
    const firstBodyId = workspace.bodies[0]?.id ?? '';
    if (!assignBodyId && firstBodyId) setAssignBodyId(firstBodyId);
    if (!newGroupBodyId && firstBodyId) setNewGroupBodyId(firstBodyId);
    if (!transferBodyId && firstBodyId) {
      setTransferBodyId(workspace.bodies[1]?.id ?? firstBodyId);
    }
  }, [workspace.bodies, assignBodyId, newGroupBodyId, transferBodyId]);

  useEffect(() => {
    const firstGroupId = workspace.groups[0]?.id ?? '';
    if (!assignGroupId && firstGroupId) setAssignGroupId(firstGroupId);
    if (!transferGroupId && firstGroupId) setTransferGroupId(firstGroupId);
  }, [workspace.groups, assignGroupId, transferGroupId]);

  useEffect(() => {
    const firstUserId = workspace.governanceUsers.find((u) => u.isUsable)?.id ?? '';
    if (!assignUserId && firstUserId) setAssignUserId(firstUserId);
  }, [workspace.governanceUsers, assignUserId]);

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
      <section className="fm-panel-ink flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl font-extrabold text-[#F0F4F8]">
            จัดการองค์กร (บอดี้ → กลุ่มบ้าน) และสิทธิ์ผู้ดูแล
          </h1>
          <p className="mt-1 text-base font-medium text-[#E2E8F0]">
            อนุมัติคำขอลงทะเบียน LINE มอบหมายบทบาทผู้รับผิดชอบ ย้ายสังกัดบอดี้ และตรวจสอบบันทึกความปลอดภัย
          </p>
        </div>
        <Building2 className="h-8 w-8 shrink-0 text-[#C8FF00]" aria-hidden="true" />
      </section>

      {msg && (
        <div
          role="alert"
          className={`fm-panel p-4 text-base font-extrabold ${
            msg.type === 'ok'
              ? 'bg-[#C8FF00] text-[#141413]'
              : 'bg-[#FFE4E6] text-[#881337]'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* W1 + W2: LINE Registration Approvals & Self LINE Account Linking */}
      <LineGovernancePanel
        workspace={workspace}
        onRefresh={onRefresh}
        onSelectUserForAssignment={(uid) => setAssignUserId(uid)}
      />

      <BodyManagementPanel workspace={workspace} onRefresh={onRefresh} />

      {/* Bodies Health Ledger */}
      {workspace.bodies.length > 0 && (
        <section className="fm-panel grid divide-y-2 divide-[#141413] overflow-hidden md:grid-cols-2 md:divide-x-2 md:divide-y-0">
          {workspace.bodies.map((b) => (
            <div key={b.id} className="min-w-0 bg-white p-6">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-display text-2xl font-extrabold text-[#141413]">
                    {b.nameTh}
                  </h2>
                  <span className="mt-1 inline-block rounded-md border border-[#141413] bg-[#E2E8F0] px-2 py-0.5 font-mono text-base font-bold text-[#141413]">
                    {b.code}
                  </span>
                </div>
                <span
                  className={`fm-sticker ${
                    b.hasEligibleBodyLeader
                      ? 'bg-[#C8FF00] text-[#141413]'
                      : 'bg-[#FFE4E6] text-[#881337]'
                  }`}
                >
                  {b.hasEligibleBodyLeader
                    ? 'พร้อมอนุมัติ (มีหัวหน้าบอดี้)'
                    : 'ขาดหัวหน้าบอดี้ (รายงานจะส่งต่อไม่ได้)'}
                </span>
              </div>

              <div className="mt-4 divide-y-2 divide-[#141413] rounded-xl border-2 border-[#141413] bg-[#F0F4F8]">
                {b.bodyLeaders.map((l) => (
                  <div
                    key={l.assignmentId}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-base font-bold text-[#141413]"
                  >
                    <span>
                      {l.displayName} ({l.accountStatus})
                    </span>
                    {isAdmin && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const key = `revoke:${l.assignmentId}`;
                          if (confirmKey !== key) {
                            setConfirmKey(key);
                            return;
                          }
                          setConfirmKey(null);
                          void runOrgAction(
                            {
                              action: 'revoke_assignment',
                              assignmentId: l.assignmentId,
                              reason: 'ปรับปรุงการมอบหมายระดับบอดี้',
                            },
                            'ถอดถอนตำแหน่งระดับบอดี้เรียบร้อย'
                          );
                        }}
                        className={`fm-btn min-h-[48px] px-3.5 py-1.5 text-base ${
                          confirmKey === `revoke:${l.assignmentId}`
                            ? 'bg-[var(--fm-coral)] text-[var(--fm-paper)]'
                            : 'bg-[#FFE4E6] text-[#881337]'
                        }`}
                      >
                        {confirmKey === `revoke:${l.assignmentId}` ? 'กดซ้ำเพื่อยืนยันถอดถอน' : 'ถอดถอน'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Assign Leadership Role (DEC-09 Enforced) */}
      {canManageAnyGroup && (
        <section id="fm-assign-role-section" className="fm-panel overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b-2 border-[#141413] bg-[#C8FF00] px-6 py-4">
            <h2 className="min-w-0 font-display text-2xl font-extrabold text-[#141413]">
              มอบหมายหน้าที่ผู้นำแบบยืดหยุ่น (Care / Coordinator / Group / Body Leader)
            </h2>
            <UserCog className="h-6 w-6 shrink-0 text-[#141413]" aria-hidden="true" />
          </div>

          <div className="space-y-4 p-6">
            <p className="text-base font-medium text-[#27272A]">
              หัวหน้าบอดี้มอบหมายบทบาทได้เฉพาะกลุ่มในบอดี้ของตนเองเท่านั้น
              และระบบรับเฉพาะบัญชีที่เปิดใช้งานพร้อมล็อกอินแล้ว
            </p>
            {assignScope === 'group' && workspace.groups.length === 0 && (
              <p className="rounded-xl border-2 border-[#141413] bg-[#FEF3C7] p-3 text-base font-bold text-[#78350F]">
                เริ่มต้นใช้งาน: ยังไม่มีกลุ่มพันธกิจบ้านในระบบ กรุณาสร้างบอดี้ด้านบนและตั้งกลุ่มพันธกิจบ้านด้านล่างก่อน จึงจะมอบหมายตำแหน่งระดับกลุ่มได้
              </p>
            )}
            {assignScope === 'body' && workspace.bodies.length === 0 && (
              <p className="rounded-xl border-2 border-[#141413] bg-[#FEF3C7] p-3 text-base font-bold text-[#78350F]">
                เริ่มต้นใช้งาน: ยังไม่มีบอดี้ในระบบ กรุณาสร้างบอดี้อย่างน้อย 1 บอดี้ในหัวข้อ “บอดี้” ด้านบนก่อน
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <select
                aria-label="ระดับการมอบหมาย"
                value={assignScope}
                onChange={(e) => {
                  const v = e.target.value as 'body' | 'group';
                  setAssignScope(v);
                  setAssignRole(v === 'body' ? 'body_leader' : 'care_leader');
                }}
                className="fm-input w-full min-w-0 font-bold"
              >
                <option value="group">ระดับกลุ่มพันธกิจบ้าน</option>
                {isAdmin && <option value="body">ระดับบอดี้ (Body Leader)</option>}
              </select>

              {assignScope === 'body' ? (
                <select
                  aria-label="เลือกบอดี้"
                  value={assignBodyId}
                  onChange={(e) => setAssignBodyId(e.target.value)}
                  className="fm-input w-full min-w-0 font-bold"
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
                  className="fm-input w-full min-w-0 font-bold"
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
                className="fm-input w-full min-w-0 font-bold"
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
                className="fm-input w-full min-w-0 font-bold"
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
              disabled={
                busy ||
                !assignUserId ||
                (assignScope === 'body' ? !assignBodyId : !assignGroupId)
              }
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
              className="fm-btn fm-btn-violet text-base disabled:opacity-60"
            >
              <span>บันทึกการมอบหมาย</span>
            </button>
          </div>
        </section>
      )}

      {/* Create New Group & Transfer Group Body */}
      {canManageAnyGroup && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="fm-panel min-w-0 overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b-2 border-[#141413] bg-[#E2E8F0] px-6 py-4">
              <h2 className="min-w-0 font-display text-xl font-extrabold text-[#141413]">
                ตั้งกลุ่มพันธกิจบ้านใหม่
              </h2>
              <UserPlus className="h-5 w-5 shrink-0 text-[#141413]" aria-hidden="true" />
            </div>

            <div className="space-y-4 p-6">
              {workspace.bodies.length === 0 && (
                <p className="rounded-xl border-2 border-[#141413] bg-[#FEF3C7] p-3 text-base font-bold text-[#78350F]">
                  เริ่มต้นใช้งาน: กรุณาสร้างบอดี้อย่างน้อย 1 บอดี้ในหัวข้อ “บอดี้” ด้านบนก่อน จึงจะตั้งกลุ่มพันธกิจบ้านได้
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  value={newGroupCode}
                  onChange={(e) => setNewGroupCode(e.target.value)}
                  placeholder="รหัสกลุ่ม เช่น GRP-KHAMPHAENG"
                  className="fm-input w-full min-w-0"
                />
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="ชื่อกลุ่มพันธกิจบ้าน"
                  className="fm-input w-full min-w-0"
                />
                <select
                  aria-label="เลือกบอดี้ของกลุ่มใหม่"
                  value={newGroupBodyId}
                  onChange={(e) => setNewGroupBodyId(e.target.value)}
                  className="fm-input w-full min-w-0 font-bold"
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
                  className="fm-input w-full min-w-0"
                />
              </div>
              <button
                type="button"
                disabled={busy || !newGroupCode || !newGroupName || !newGroupBodyId}
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
                className="fm-btn fm-btn-lime text-base disabled:opacity-60"
              >
                <span>+ เพิ่มกลุ่มพันธกิจบ้าน</span>
              </button>
            </div>
          </section>

          {isAdmin && (
            <section className="fm-panel min-w-0 overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b-2 border-[#141413] bg-[#DBEAFE] px-6 py-4">
                <h2 className="min-w-0 font-display text-xl font-extrabold text-[#141413]">
                  ย้ายกลุ่มข้ามบอดี้ (คงประวัติรายงานเดิมไว้ครบ)
                </h2>
                <ArrowRightLeft className="h-5 w-5 shrink-0 text-[#141413]" aria-hidden="true" />
              </div>

              <div className="space-y-4 p-6">
                {workspace.groups.length === 0 && (
                  <p className="rounded-xl border-2 border-[#141413] bg-[#F1F5F9] p-3 text-base font-medium text-[#475569]">
                    จะใช้งานได้เมื่อมีกลุ่มพันธกิจบ้านและบอดี้ปลายทางแล้ว
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <select
                    aria-label="เลือกกลุ่มที่ต้องการย้าย"
                    value={transferGroupId}
                    onChange={(e) => setTransferGroupId(e.target.value)}
                    className="fm-input w-full min-w-0 font-bold"
                  >
                    {workspace.groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.nameTh}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="เลือกบอดี้ปลายทาง"
                    value={transferBodyId}
                    onChange={(e) => setTransferBodyId(e.target.value)}
                    className="fm-input w-full min-w-0 font-bold"
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
                    className="fm-input w-full min-w-0 sm:col-span-2"
                  />
                </div>
                <button
                  type="button"
                  disabled={busy || !transferGroupId || !transferBodyId}
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
                  className="fm-btn fm-btn-paper text-base disabled:opacity-60"
                >
                  <span>ยืนยันย้ายสังกัดบอดี้</span>
                </button>
              </div>
            </section>
          )}
        </div>
      )}

      {/* Users Lifecycle + Security Audit Logs (Admin only) */}
      {isAdmin && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="fm-panel min-w-0 overflow-hidden">
            <div className="border-b-2 border-[#141413] bg-[#E2E8F0] px-6 py-4">
              <h2 className="font-display text-xl font-extrabold text-[#141413]">
                จัดการสถานะบัญชีผู้ใช้
              </h2>
            </div>

            <div className="max-h-[380px] divide-y-2 divide-[#141413] overflow-y-auto">
              {workspace.governanceUsers.map((u) => (
                <div
                  key={u.id}
                  className="flex flex-wrap items-center justify-between gap-3 bg-white px-6 py-3.5"
                >
                  <div className="min-w-0">
                    <div className="text-base font-extrabold text-[#141413]">
                      {u.displayName}
                    </div>
                    <div className="font-mono text-base font-bold text-[#27272A]">
                      @{u.username} · {u.systemRole} · {u.status}
                    </div>
                  </div>
                  {u.id !== actor.user.id && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        const key = `user:${u.id}`;
                        if (confirmKey !== key) {
                          setConfirmKey(key);
                          return;
                        }
                        setConfirmKey(null);
                        void runOrgAction(
                          {
                            action: 'update_user_status',
                            targetUserId: u.id,
                            nextStatus: u.status === 'active' ? 'suspended' : 'active',
                            reason: 'ปรับสถานะโดยผู้ดูแลระบบ',
                          },
                          `อัปเดตสถานะบัญชี ${u.username} แล้ว`
                        );
                      }}
                      className={`fm-btn min-h-[48px] px-3.5 py-1.5 text-base ${
                        confirmKey === `user:${u.id}`
                          ? 'bg-[var(--fm-coral)] text-[var(--fm-paper)]'
                          : u.status === 'active'
                            ? 'bg-[#FFE4E6] text-[#881337]'
                            : 'fm-btn-lime'
                      }`}
                    >
                      {confirmKey === `user:${u.id}`
                        ? 'กดซ้ำเพื่อยืนยัน'
                        : u.status === 'active'
                          ? 'ระงับบัญชี'
                          : 'เปิดใช้งาน'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="fm-panel min-w-0 overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b-2 border-[#141413] bg-[#141413] px-6 py-4 text-[#F0F4F8]">
              <h2 className="font-display text-xl font-extrabold text-[#F0F4F8]">
                บันทึกเหตุการณ์ความปลอดภัย (Append-Only Audit Log)
              </h2>
              <ShieldCheck className="h-5 w-5 shrink-0 text-[#C8FF00]" aria-hidden="true" />
            </div>

            <div className="max-h-[380px] divide-y-2 divide-[#141413] overflow-y-auto font-mono text-base">
              {workspace.securityLogs.map((log) => (
                <div key={log.id} className="bg-white px-6 py-3 text-[#141413]">
                  <div className="font-bold">
                    <span className="rounded bg-[#C8FF00] px-1.5 py-0.5 text-[#141413]">
                      {log.outcome}
                    </span>{' '}
                    {log.action} · {log.targetType}
                  </div>
                  <div className="mt-1 font-medium text-[#27272A]">
                    {new Date(log.createdAt).toLocaleString('th-TH')}{' '}
                    {log.reason ? `| ${log.reason}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
