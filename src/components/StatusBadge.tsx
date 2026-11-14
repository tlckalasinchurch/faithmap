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
    classes: 'bg-[#C8FF00] text-[#141413] border-[#141413]',
    Icon: CheckCircle2,
  },
  submitted: {
    label: 'ส่งแล้ว · รอตรวจ',
    classes: 'bg-[#DBEAFE] text-[#141413] border-[#141413]',
    Icon: Clock,
  },
  under_review: {
    label: 'ผ่านตรวจทาน · รออนุมัติ',
    classes: 'bg-[#1D4ED8] text-[#FFFFFF] border-[#141413]',
    Icon: Eye,
  },
  needs_revision: {
    label: 'ส่งกลับขอแก้ไข',
    classes: 'bg-[#FFB703] text-[#141413] border-[#141413]',
    Icon: AlertTriangle,
  },
  draft: {
    label: 'ฉบับร่างส่วนตัว',
    classes: 'bg-[#E2E8F0] text-[#141413] border-[#141413]',
    Icon: FileEdit,
  },
  not_submitted: {
    label: 'ยังไม่ส่งรายงาน',
    classes: 'bg-[#FFFFFF] text-[#141413] border-[#141413]',
    Icon: Clock,
  },
  blocked: {
    label: 'ติดปัญหาส่งต่อ (ขาดหัวหน้า)',
    classes: 'bg-[#BE123C] text-[#FFFFFF] border-[#141413]',
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
    classes: 'bg-[#E2E8F0] text-[#141413] border-[#141413]',
    Icon: Clock,
  };
  const Icon = meta.Icon;

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className={`fm-sticker ${meta.classes}`}>
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{meta.label}</span>
      </span>
      {isLate && (
        <span className="fm-sticker border-[#141413] bg-[#FFE4E6] text-[#881337]">
          ส่งหลัง 20:00 น.
        </span>
      )}
    </span>
  );
}
