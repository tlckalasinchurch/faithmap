'use client';

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  FileEdit,
  ShieldAlert,
} from 'lucide-react';

const STATUS_META: Record<
  string,
  { label: string; classes: string; Icon: typeof CheckCircle2 }
> = {
  approved: {
    label: 'อนุมัติแล้ว',
    classes: 'bg-emerald-50 text-emerald-900 border-emerald-200',
    Icon: CheckCircle2,
  },
  submitted: {
    label: 'ส่งแล้ว · รอตรวจ',
    classes: 'bg-sky-50 text-sky-900 border-sky-200',
    Icon: Clock,
  },
  under_review: {
    label: 'ผ่านการตรวจทาน · รออนุมัติ',
    classes: 'bg-indigo-50 text-indigo-900 border-indigo-200',
    Icon: Eye,
  },
  needs_revision: {
    label: 'ส่งกลับขอแก้ไข',
    classes: 'bg-amber-50 text-amber-900 border-amber-300',
    Icon: AlertTriangle,
  },
  draft: {
    label: 'ฉบับร่างส่วนตัว',
    classes: 'bg-slate-100 text-slate-700 border-slate-300',
    Icon: FileEdit,
  },
  not_submitted: {
    label: 'ยังไม่ส่งรายงาน',
    classes: 'bg-slate-100 text-slate-700 border-slate-300',
    Icon: Clock,
  },
  blocked: {
    label: 'ติดขัด (Blocked)',
    classes: 'bg-rose-50 text-rose-900 border-rose-300',
    Icon: ShieldAlert,
  },
};

export function StatusBadge({
  status,
  isBlocked = false,
  isLate = false,
}: {
  status: string;
  isBlocked?: boolean;
  isLate?: boolean;
}) {
  const key = isBlocked ? 'blocked' : status;
  const meta = STATUS_META[key] ?? {
    label: status,
    classes: 'bg-slate-100 text-slate-700 border-slate-300',
    Icon: Clock,
  };
  const Icon = meta.Icon;

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold ${meta.classes}`}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{meta.label}</span>
      </span>
      {isLate && (
        <span className="inline-flex items-center rounded-full border border-orange-300 bg-orange-50 px-2.5 py-0.5 text-xs font-semibold text-orange-900">
          ส่งหลัง 20:00 น.
        </span>
      )}
    </span>
  );
}
