'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Link2,
  Unlink,
  UserCheck,
  UserX,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { createLiffAdapter, type LiffAdapter } from '@/lib/liff/adapter';
import { LineRedirecting, lineLink } from '@/lib/liff/line-auth-client';
import type { WorkspacePayload } from '@/lib/types';

export interface LineRegistrationRow {
  id: string;
  requestedName: string;
  lineDisplayName: string | null;
  note: string | null;
  status: string;
  createdAt: string;
}

export function LineGovernancePanel({
  workspace,
  onRefresh,
  onSelectUserForAssignment,
}: {
  workspace: WorkspacePayload;
  onRefresh: () => Promise<void>;
  onSelectUserForAssignment?: (userId: string) => void;
}) {
  const actor = workspace.actor;
  const isSuperAdmin = actor.user.systemRole === 'super_admin';

  const [requests, setRequests] = useState<LineRegistrationRow[]>([]);
  const [loadingReqs, setLoadingReqs] = useState(isSuperAdmin);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDecision, setConfirmDecision] = useState<{
    id: string;
    decision: 'approve' | 'reject';
  } | null>(null);
  const [lastApprovedUser, setLastApprovedUser] = useState<{
    userId: string;
    name: string;
  } | null>(null);

  const [adapter, setAdapter] = useState<LiffAdapter | null>(null);
  const [lineReady, setLineReady] = useState<'checking' | 'ready' | 'unavailable'>('checking');
  const [linkBusy, setLinkBusy] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [panelMsg, setPanelMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadRequests = useCallback(async () => {
    if (!isSuperAdmin) return;
    setLoadingReqs(true);
    try {
      const res = await apiRequest<{ requests: LineRegistrationRow[] }>(
        '/api/v1/line?status=pending'
      );
      setRequests(res.requests);
    } catch (err) {
      setPanelMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'โหลดรายการคำขอลงทะเบียน LINE ไม่สำเร็จ',
      });
    } finally {
      setLoadingReqs(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  useEffect(() => {
    let mounted = true;
    async function initLiff() {
      let a: LiffAdapter | null = null;
      try {
        a = await createLiffAdapter();
        if (a) await a.init();
      } catch {
        a = null;
      }
      if (!mounted) return;
      setAdapter(a);
      setLineReady(a ? 'ready' : 'unavailable');
    }
    void initLiff();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleReview(row: LineRegistrationRow, decision: 'approve' | 'reject') {
    setBusyId(row.id);
    setPanelMsg(null);
    setConfirmDecision(null);
    try {
      const res = await apiRequest<{
        id: string;
        status: string;
        createdUserId: string | null;
      }>('/api/v1/line', {
        method: 'POST',
        body: { action: 'review', requestId: row.id, decision },
      });

      await loadRequests();
      await onRefresh();

      if (decision === 'approve' && res.createdUserId) {
        setLastApprovedUser({ userId: res.createdUserId, name: row.requestedName });
        onSelectUserForAssignment?.(res.createdUserId);
        setPanelMsg({
          type: 'ok',
          text: `อนุมัติบัญชีของ "${row.requestedName}" เรียบร้อยแล้ว กรุณากำหนดกลุ่มบ้านหรือตำแหน่งในฟอร์มมอบหมายหน้าที่ด้านล่าง`,
        });
      } else {
        setPanelMsg({
          type: 'ok',
          text: `ปฏิเสธคำขอของ "${row.requestedName}" เรียบร้อยแล้ว`,
        });
      }
    } catch (err) {
      setPanelMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'ดำเนินการคำขอไม่สำเร็จ',
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleLinkLine() {
    if (!adapter) {
      setPanelMsg({
        type: 'err',
        text: 'ระบบเชื่อมบัญชี LINE ยังไม่พร้อมใช้งาน (ต้องตั้งค่า NEXT_PUBLIC_LIFF_ID)',
      });
      return;
    }
    setLinkBusy(true);
    setPanelMsg(null);
    try {
      await lineLink(adapter);
      setPanelMsg({
        type: 'ok',
        text: 'เชื่อมบัญชี LINE เข้ากับบัญชีของคุณเรียบร้อยแล้ว ครั้งต่อไปสามารถกด “เข้าสู่ระบบด้วย LINE” ได้ทันที',
      });
      await onRefresh();
    } catch (err) {
      if (err instanceof LineRedirecting) return;
      setPanelMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'เชื่อมบัญชี LINE ไม่สำเร็จ',
      });
    } finally {
      setLinkBusy(false);
    }
  }

  async function handleUnlinkLine() {
    setLinkBusy(true);
    setPanelMsg(null);
    setConfirmUnlink(false);
    try {
      await apiRequest('/api/v1/line', {
        method: 'POST',
        body: { action: 'unlink' },
      });
      setPanelMsg({
        type: 'ok',
        text: 'ยกเลิกการเชื่อมบัญชี LINE เรียบร้อยแล้ว',
      });
      await onRefresh();
    } catch (err) {
      setPanelMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'ยกเลิกการเชื่อมบัญชี LINE ไม่สำเร็จ',
      });
    } finally {
      setLinkBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {panelMsg && (
        <div
          role="alert"
          className={`fm-panel flex items-start gap-2 p-4 text-base font-bold ${
            panelMsg.type === 'ok'
              ? 'bg-[#DCFCE7] text-[#14532D]'
              : 'bg-[#FFE4E6] text-[#881337]'
          }`}
        >
          {panelMsg.type === 'ok' && (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#16A34A]" aria-hidden="true" />
          )}
          <span>{panelMsg.text}</span>
        </div>
      )}

      {/* W2: Link my own LINE account */}
      <section className="fm-panel overflow-hidden bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#141413] bg-[#E2E8F0] px-6 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-extrabold text-[#141413]">
              เชื่อมโยงบัญชี LINE ของคุณ ({actor.user.displayName})
            </h2>
            <p className="text-sm font-medium text-[#27272A]">
              ผูกบัญชี LINE ของคุณไว้เพื่อกดปุ่มสีเขียว “เข้าสู่ระบบด้วย LINE” ในครั้งต่อไปโดยไม่ต้องใช้รหัสผ่าน
            </p>
          </div>
          <Link2 className="h-6 w-6 shrink-0 text-[#06C755]" aria-hidden="true" />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div className="space-y-1">
            <p className="text-base font-bold text-[#141413]">
              สถานะปัจจุบัน:{' '}
              {actor.user.lineUserId ? (
                <span className="rounded-md border border-[#141413] bg-[#C8FF00] px-2 py-0.5 text-sm font-extrabold">
                  เชื่อมบัญชี LINE แล้ว
                </span>
              ) : (
                <span className="rounded-md border border-[#141413] bg-[#F1F5F9] px-2 py-0.5 text-sm font-bold text-[#475569]">
                  สามารถกดปุ่มด้านขวาเพื่อเชื่อมบัญชี LINE หรือยกเลิกการเชื่อมได้
                </span>
              )}
            </p>
            {lineReady === 'unavailable' && (
              <p className="text-sm font-medium text-[#78350F]">
                หมายเหตุ: การกดเชื่อม LINE ต้องเปิดใช้งานผ่านโดเมนที่ตั้งค่า NEXT_PUBLIC_LIFF_ID แล้ว
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={linkBusy || lineReady !== 'ready'}
              onClick={() => void handleLinkLine()}
              className="fm-btn min-h-[48px] bg-[#06C755] px-4 text-base font-bold text-white hover:bg-[#05b04c] disabled:opacity-60"
            >
              <Link2 className="h-5 w-5" aria-hidden="true" />
              <span>{linkBusy ? 'กำลังดำเนินการ…' : 'เชื่อมบัญชี LINE ของฉัน'}</span>
            </button>

            {!confirmUnlink ? (
              <button
                type="button"
                disabled={linkBusy}
                onClick={() => setConfirmUnlink(true)}
                className="fm-btn fm-btn-paper min-h-[48px] px-4 text-base font-bold"
              >
                <Unlink className="h-4 w-4" aria-hidden="true" />
                <span>ยกเลิกการเชื่อม LINE</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={linkBusy}
                onClick={() => void handleUnlinkLine()}
                className="fm-btn min-h-[48px] bg-[#FFE4E6] px-4 text-base font-bold text-[#881337]"
              >
                ยืนยันยกเลิกการเชื่อม LINE
              </button>
            )}
          </div>
        </div>
      </section>

      {/* W1: Pending LINE Registration Requests (Super Admin only) */}
      {isSuperAdmin && (
        <section className="fm-panel overflow-hidden bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#141413] bg-[#C8FF00] px-6 py-4">
            <div className="min-w-0">
              <h2 className="font-display text-2xl font-extrabold text-[#141413]">
                คำขอลงทะเบียนผ่าน LINE ที่รออนุมัติ ({requests.length})
              </h2>
              <p className="text-sm font-bold text-[#141413]">
                เมื่ออนุมัติแล้ว ระบบจะสร้างบัญชีผู้ใช้และเลือกชื่อลงในฟอร์ม “มอบหมายหน้าที่ผู้นำ” ด้านล่างให้อัตโนมัติ
              </p>
            </div>
            <UserCheck className="h-6 w-6 shrink-0 text-[#141413]" aria-hidden="true" />
          </div>

          <div className="p-6">
            {lastApprovedUser && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-[#141413] bg-[#DCFCE7] p-4">
                <p className="text-base font-bold text-[#14532D]">
                  อนุมัติบัญชีของ “{lastApprovedUser.name}” แล้ว — ขั้นตอนถัดไป: เลือกกลุ่มบ้านและตำแหน่งในหัวข้อ “มอบหมายหน้าที่ผู้นำ” ด้านล่าง
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onSelectUserForAssignment?.(lastApprovedUser.userId);
                    document
                      .getElementById('fm-assign-role-section')
                      ?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="fm-btn fm-btn-lime min-h-[44px] px-4 text-sm font-extrabold"
                >
                  เลื่อนไปกำหนดกลุ่มบ้านให้ {lastApprovedUser.name}
                </button>
              </div>
            )}

            {loadingReqs ? (
              <p className="text-base font-bold text-[#475569]">กำลังโหลดรายการคำขอลงทะเบียน…</p>
            ) : requests.length === 0 ? (
              <p className="text-base font-medium text-[#475569]">
                ยังไม่มีคำขอลงทะเบียนผ่าน LINE ที่รออนุมัติในขณะนี้
              </p>
            ) : (
              <div className="divide-y-2 divide-[#141413] rounded-xl border-2 border-[#141413]">
                {requests.map((r) => {
                  const isConfirmApprove =
                    confirmDecision?.id === r.id && confirmDecision.decision === 'approve';
                  const isConfirmReject =
                    confirmDecision?.id === r.id && confirmDecision.decision === 'reject';

                  return (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-4 bg-white p-4"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="text-lg font-extrabold text-[#141413]">
                          {r.requestedName}
                        </div>
                        {r.lineDisplayName && (
                          <div className="text-sm font-bold text-[#27272A]">
                            ชื่อโปรไฟล์ LINE: {r.lineDisplayName}
                          </div>
                        )}
                        {r.note && (
                          <div className="text-sm font-medium text-[#475569]">
                            ข้อความ/กลุ่มบ้านที่แจ้ง: {r.note}
                          </div>
                        )}
                        <div className="text-xs text-[#64748B]">
                          ส่งคำขอเมื่อ: {new Date(r.createdAt).toLocaleString('th-TH')}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5">
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => {
                            if (!isConfirmApprove) {
                              setConfirmDecision({ id: r.id, decision: 'approve' });
                              return;
                            }
                            void handleReview(r, 'approve');
                          }}
                          className="fm-btn min-h-[48px] bg-[#06C755] px-4 text-base font-bold text-white hover:bg-[#05b04c]"
                        >
                          <UserCheck className="h-5 w-5" aria-hidden="true" />
                          <span>{isConfirmApprove ? 'กดซ้ำเพื่อยืนยันอนุมัติ' : 'อนุมัติ'}</span>
                        </button>

                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => {
                            if (!isConfirmReject) {
                              setConfirmDecision({ id: r.id, decision: 'reject' });
                              return;
                            }
                            void handleReview(r, 'reject');
                          }}
                          className="fm-btn min-h-[48px] bg-[#FFE4E6] px-4 text-base font-bold text-[#881337]"
                        >
                          <UserX className="h-5 w-5" aria-hidden="true" />
                          <span>{isConfirmReject ? 'กดซ้ำเพื่อยืนยันปฏิเสธ' : 'ไม่อนุมัติ'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
