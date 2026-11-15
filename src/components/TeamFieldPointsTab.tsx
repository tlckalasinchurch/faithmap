'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapPin } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import type { WorkspacePayload } from '@/lib/types';

interface PointRow {
  id: string;
  teamCode: string;
  pointNo: number;
  pointName: string;
  coordinatorName: string | null;
  phone: string | null;
  bodyId: string | null;
  coordinatorUserId: string | null;
  bodyName: string | null;
  coordinatorAccountName: string | null;
  coordinatorAccountStatus: string | null;
  coordinatorEligible: boolean | null;
}

interface Mapping {
  total: number;
  unmapped: number;
  complete: boolean;
}

interface Draft {
  bodyId: string;
  coordinatorUserId: string;
}

const ERROR_TEXT: Record<string, string> = {
  BODY_INVALID: 'บอดี้นี้ไม่ได้ใช้งานอยู่ กรุณาเลือกบอดี้อื่น',
  COORDINATOR_INVALID: 'บัญชีนี้ยังไม่ใช้งาน กรุณาเลือกบัญชีอื่น',
  COORDINATOR_NEEDS_BODY: 'ต้องเลือกบอดี้ก่อนเลือกผู้ประสานงาน',
  COORDINATOR_OUT_OF_SCOPE: 'ผู้ประสานงานคนนี้ไม่มีหน้าที่ในบอดี้ที่เลือก กรุณาเลือกคนอื่นหรือให้หน้าที่ก่อน',
};

/**
 * Admin screen for DEC-17. An admin links each team field point to a Body and, when known, to a coordinator account.
 * Other people read points only after every point has a Body. The server checks every rule; this screen only helps.
 */
export function TeamFieldPointsTab({ workspace }: { workspace: WorkspacePayload }) {
  const isAdmin = workspace.actor.user.systemRole === 'super_admin' || workspace.actor.user.systemRole === 'admin';
  const [points, setPoints] = useState<PointRow[]>([]);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [q, setQ] = useState('');
  const [onlyUnmapped, setOnlyUnmapped] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const activeBodies = useMemo(() => workspace.bodies.filter((b) => b.status === 'active'), [workspace.bodies]);
  const activeUsers = useMemo(
    () => (workspace.governanceUsers ?? []).filter((u) => u.status === 'active'),
    [workspace.governanceUsers]
  );

  const load = useCallback(async () => {
    try {
      const res = await apiRequest<{ points: PointRow[]; mapping?: Mapping }>('/api/v1/team-field-points');
      setPoints(res.points);
      setMapping(res.mapping ?? null);
      setDrafts({});
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'โหลดข้อมูลจุดลงพื้นที่ไม่สำเร็จ' });
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  if (!isAdmin) {
    return (
      <div className="fm-panel p-6 text-lg font-bold text-[#27272A]">
        หน้านี้สำหรับผู้ดูแลระบบเท่านั้น
      </div>
    );
  }

  function draftOf(p: PointRow): Draft {
    return drafts[p.id] ?? { bodyId: p.bodyId ?? '', coordinatorUserId: p.coordinatorUserId ?? '' };
  }

  function setDraft(p: PointRow, patch: Partial<Draft>) {
    const next = { ...draftOf(p), ...patch };
    // Clearing the Body also clears the coordinator, because the server needs a Body for a coordinator.
    if (patch.bodyId === '') next.coordinatorUserId = '';
    setDrafts((d) => ({ ...d, [p.id]: next }));
  }

  async function save(p: PointRow) {
    const d = draftOf(p);
    setBusyId(p.id);
    setMsg(null);
    try {
      await apiRequest('/api/v1/team-field-points', {
        method: 'POST',
        body: {
          action: 'assign_point',
          pointId: p.id,
          bodyId: d.bodyId || null,
          coordinatorUserId: d.coordinatorUserId || null,
        },
      });
      setMsg({ type: 'ok', text: `บันทึกจุด ${p.pointNo} ${p.pointName} เรียบร้อย` });
      await load();
    } catch (err) {
      const code = (err as { code?: string } | null)?.code ?? '';
      setMsg({
        type: 'err',
        text: ERROR_TEXT[code] ?? (err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ'),
      });
    } finally {
      setBusyId(null);
    }
  }

  async function sync() {
    setBusyId('sync');
    setMsg(null);
    try {
      await apiRequest('/api/v1/team-field-points', { method: 'POST', body: { action: 'sync_team_g' } });
      setMsg({ type: 'ok', text: 'ซิงค์รายการจุดทีม G เรียบร้อย การกำหนดบอดี้เดิมยังอยู่' });
      await load();
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'ซิงค์ไม่สำเร็จ' });
    } finally {
      setBusyId(null);
    }
  }

  const shown = points.filter((p) => {
    if (onlyUnmapped && p.bodyId) return false;
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return `${p.pointName} ${p.coordinatorName ?? ''} ${p.pointNo}`.toLowerCase().includes(needle);
  });

  return (
    <div className="space-y-6">
      <section className="fm-panel-ink flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-[#F0F4F8]">กำหนดบอดี้และผู้ประสานงานของจุดลงพื้นที่</h1>
          <p className="mt-1 text-base font-medium text-[#E2E8F0]">
            คนอื่นนอกจากผู้ดูแลระบบจะเห็นจุดลงพื้นที่ได้ก็ต่อเมื่อทุกจุดมีบอดี้แล้ว หัวหน้าบอดี้เห็นเฉพาะจุดในบอดี้ตน ผู้ประสานงานเห็นเฉพาะจุดของตน
          </p>
        </div>
        <MapPin className="h-8 w-8 text-[#C8FF00]" aria-hidden="true" />
      </section>

      {msg && (
        <div role="alert" className={`fm-panel p-4 text-base font-extrabold ${msg.type === 'ok' ? 'bg-[#C8FF00] text-[#141413]' : 'bg-[#FFE4E6] text-[#881337]'}`}>
          {msg.text}
        </div>
      )}

      <section className="fm-panel flex flex-wrap items-center justify-between gap-3 bg-white p-5">
        <p className="text-lg font-extrabold text-[#141413]" aria-live="polite">
          {mapping
            ? mapping.total === 0
              ? 'ยังไม่มีจุดลงพื้นที่ กดซิงค์เพื่อนำเข้ารายการ'
              : mapping.complete
                ? `กำหนดบอดี้ครบทุกจุดแล้ว (${mapping.total} จุด) หัวหน้าบอดี้และผู้ประสานงานที่ได้รับมอบหมายเปิดดูได้แล้ว`
                : `กำหนดบอดี้แล้ว ${mapping.total - mapping.unmapped} จาก ${mapping.total} จุด ยังไม่เปิดให้ผู้อื่นดู`
            : 'กำลังโหลด…'}
        </p>
        <button type="button" className="fm-btn min-h-[48px] px-4" disabled={busyId !== null} onClick={sync}>
          {busyId === 'sync' ? 'กำลังซิงค์…' : 'ซิงค์รายการจุดทีม G'}
        </button>
      </section>

      <section className="fm-panel flex flex-wrap items-center gap-3 bg-white p-5">
        <label className="flex flex-1 flex-col gap-1 text-lg font-bold text-[#141413]" style={{ minWidth: 220 }}>
          ค้นหาชื่อจุดหรือผู้ประสานงาน
          <input className="fm-input w-full min-w-0 min-h-[48px] text-lg" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="flex min-h-[48px] items-center gap-2 text-lg font-bold text-[#141413]">
          <input
            type="checkbox"
            className="h-6 w-6"
            checked={onlyUnmapped}
            onChange={(e) => setOnlyUnmapped(e.target.checked)}
          />
          แสดงเฉพาะจุดที่ยังไม่มีบอดี้
        </label>
      </section>

      <ul className="space-y-4">
        {shown.map((p) => {
          const d = draftOf(p);
          const changed = d.bodyId !== (p.bodyId ?? '') || d.coordinatorUserId !== (p.coordinatorUserId ?? '');
          return (
            <li key={p.id} className="fm-panel bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="font-display text-xl font-extrabold text-[#141413]">
                  จุดที่ {p.pointNo} · {p.pointName}
                </h2>
                <span className={`fm-sticker ${p.bodyId ? 'bg-[#C8FF00]' : 'bg-[#FFE4E6]'} text-[#141413]`}>
                  {p.bodyId ? `บอดี้: ${p.bodyName ?? 'ไม่พบชื่อ'}` : 'ยังไม่กำหนดบอดี้'}
                </span>
              </div>
              <p className="mt-1 text-base font-medium text-[#27272A]">
                ผู้ประสานงานในรายการต้นทาง: {p.coordinatorName ?? '-'} · โทร {p.phone ?? '-'}
              </p>
              {p.coordinatorUserId && p.coordinatorEligible === false && (
                <p className="mt-2 text-base font-extrabold text-[#881337]" role="status">
                  บัญชีผู้ประสานงาน ({p.coordinatorAccountName ?? 'ไม่พบบัญชี'}) ใช้งานไม่ได้หรือไม่มีหน้าที่ในบอดี้นี้แล้ว จึงยังเปิดดูจุดนี้ไม่ได้
                </p>
              )}
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-lg font-bold text-[#141413]">
                  บอดี้
                  <select
                    className="fm-input w-full min-w-0 min-h-[48px] text-lg"
                    value={d.bodyId}
                    onChange={(e) => setDraft(p, { bodyId: e.target.value })}
                  >
                    <option value="">— ยังไม่กำหนด —</option>
                    {activeBodies.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.nameTh}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-lg font-bold text-[#141413]">
                  บัญชีผู้ประสานงาน (ถ้ามี)
                  <select
                    className="fm-input w-full min-w-0 min-h-[48px] text-lg"
                    value={d.coordinatorUserId}
                    disabled={!d.bodyId}
                    onChange={(e) => setDraft(p, { coordinatorUserId: e.target.value })}
                  >
                    <option value="">— ไม่ระบุ —</option>
                    {activeUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.displayName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  className="fm-btn fm-btn-lime min-h-[48px] px-5 text-lg"
                  disabled={!changed || busyId !== null}
                  onClick={() => save(p)}
                >
                  {busyId === p.id ? 'กำลังบันทึก…' : 'บันทึกจุดนี้'}
                </button>
              </div>
            </li>
          );
        })}
        {shown.length === 0 && (
          <li className="fm-panel p-6 text-lg font-bold text-[#27272A]">ไม่พบจุดลงพื้นที่ตามเงื่อนไขที่เลือก</li>
        )}
      </ul>
    </div>
  );
}
