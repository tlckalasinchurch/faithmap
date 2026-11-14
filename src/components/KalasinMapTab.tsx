'use client';

import { useState } from 'react';
import { MapPin, Navigation } from 'lucide-react';
import type { GroupWithContext, WorkspacePayload } from '@/lib/types';
import { StatusBadge } from './StatusBadge';

export function KalasinMapTab({
  workspace,
  onSelectGroupReport,
}: {
  workspace: WorkspacePayload;
  onSelectGroupReport: (groupId: string) => void;
}) {
  const [selected, setSelected] = useState<GroupWithContext | null>(
    workspace.groups[0] ?? null
  );

  // Kalasin Pilot Bounding Box: Lat 16.38..16.49, Lng 103.34..103.57
  const minLat = 16.385;
  const maxLat = 16.485;
  const minLng = 103.345;
  const maxLng = 103.565;

  function project(lat: number, lng: number) {
    const xPct = Math.min(92, Math.max(8, ((lng - minLng) / (maxLng - minLng)) * 100));
    const yPct = Math.min(90, Math.max(10, ((maxLat - lat) / (maxLat - minLat)) * 100));
    return { xPct, yPct };
  }

  function pinFill(g: GroupWithContext) {
    if (g.currentReport.isBlocked) return 'bg-rose-600 ring-rose-200';
    if (g.currentReport.status === 'approved') return 'bg-emerald-600 ring-emerald-200';
    if (g.currentReport.status === 'needs_revision') return 'bg-amber-600 ring-amber-200';
    if (g.currentReport.status === 'submitted' || g.currentReport.status === 'under_review')
      return 'bg-sky-600 ring-sky-200';
    return 'bg-slate-600 ring-slate-200';
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-teal-800">
          <Navigation className="h-4 w-4" aria-hidden="true" />
          <span>แผนที่กลุ่มพันธกิจบ้าน จังหวัดกาฬสินธุ์</span>
        </div>
        <h2 className="mt-1 text-2xl font-bold text-slate-900">
          พิกัดกลุ่มนำร่องและสถานะรายงานประจำสัปดาห์
        </h2>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="relative min-h-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-teal-50 via-slate-50 to-sky-50 p-4 lg:col-span-2">
          {/* Geographic Reference Grid */}
          <svg
            viewBox="0 0 800 500"
            className="pointer-events-none absolute inset-0 h-full w-full opacity-40"
            aria-hidden="true"
          >
            <path
              d="M 40 340 Q 250 260 440 290 T 760 220"
              fill="none"
              stroke="#0F766E"
              strokeWidth="4"
              strokeDasharray="8 6"
            />
            <line x1="200" y1="0" x2="200" y2="500" stroke="#CBD5E1" strokeWidth="1" />
            <line x1="400" y1="0" x2="400" y2="500" stroke="#CBD5E1" strokeWidth="1" />
            <line x1="600" y1="0" x2="600" y2="500" stroke="#CBD5E1" strokeWidth="1" />
            <line x1="0" y1="165" x2="800" y2="165" stroke="#CBD5E1" strokeWidth="1" />
            <line x1="0" y1="330" x2="800" y2="330" stroke="#CBD5E1" strokeWidth="1" />
            <text x="60" y="45" fill="#334155" fontSize="16" fontWeight="600">
              อ.ยางตลาด (บอดี้ใต้)
            </text>
            <text x="510" y="45" fill="#334155" fontSize="16" fontWeight="600">
              อ.เมืองกาฬสินธุ์ (บอดี้เหนือ)
            </text>
          </svg>

          {workspace.groups.map((g) => {
            const { xPct, yPct } = project(g.latitude, g.longitude);
            const isSelected = selected?.id === g.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setSelected(g)}
                style={{ left: `${xPct}%`, top: `${yPct}%` }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-white px-3 py-2 text-left shadow-md transition hover:scale-105 ${
                  isSelected
                    ? 'z-20 border-teal-700 ring-4 ring-teal-200'
                    : 'z-10 border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-white ring-4 ${pinFill(
                      g
                    )}`}
                  >
                    <MapPin className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <div className="whitespace-nowrap text-sm font-bold text-slate-900">
                      {g.nameTh}
                    </div>
                    <div className="text-xs text-slate-600">{g.district}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {selected ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-teal-800">{selected.groupCode}</p>
                <h3 className="text-xl font-bold text-slate-900">{selected.nameTh}</h3>
                <p className="mt-1 text-sm text-slate-600">{selected.bodyName}</p>
              </div>

              <StatusBadge
                status={selected.currentReport.status}
                isBlocked={selected.currentReport.isBlocked}
                isLate={selected.currentReport.isLate}
              />

              <dl className="space-y-2 border-t border-slate-100 pt-3 text-base text-slate-700">
                <div>
                  <dt className="text-xs font-semibold text-slate-500">ที่ตั้ง</dt>
                  <dd>{selected.addressSummary}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-slate-500">พิกัด GPS</dt>
                  <dd className="tabular-nums font-mono text-sm">
                    {selected.latitude.toFixed(4)}, {selected.longitude.toFixed(4)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-slate-500">ผู้รับผิดชอบกลุ่ม</dt>
                  <dd className="mt-1 space-y-1 text-sm">
                    {selected.assignments.map((a) => (
                      <div key={a.id} className="rounded-lg bg-slate-50 px-2.5 py-1">
                        <strong>{a.roleType}</strong>: {a.displayName}
                      </div>
                    ))}
                  </dd>
                </div>
              </dl>

              <button
                type="button"
                onClick={() => onSelectGroupReport(selected.id)}
                className="min-h-[48px] w-full rounded-xl bg-teal-700 px-4 py-2 text-base font-bold text-white hover:bg-teal-800"
              >
                เปิดหน้ารายงานกลุ่มนี้
              </button>
            </div>
          ) : (
            <p className="text-base text-slate-600">คลิกที่จุดบนแผนที่เพื่อดูรายละเอียดกลุ่ม</p>
          )}
        </div>
      </div>
    </div>
  );
}
