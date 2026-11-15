'use client';

import type { ReactNode } from 'react';

/** Shared large-type building blocks. Every tap target is at least 56px high. */
export function BigButton({
  children,
  onClick,
  tone = 'lime',
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: 'lime' | 'paper' | 'coral' | 'violet';
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`fm-btn fm-btn-${tone} min-h-[56px] w-full text-lg font-bold`}
    >
      {children}
    </button>
  );
}

export function Notice({ tone, children }: { tone: 'error' | 'info' | 'warn'; children: ReactNode }) {
  const style =
    tone === 'error'
      ? 'bg-[#FFE4E6] border-[#BE123C]'
      : tone === 'warn'
        ? 'bg-[#FEF3C7] border-[#B45309]'
        : 'bg-[#DBEAFE] border-[#1D4ED8]';
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`border-2 p-4 text-lg leading-relaxed text-[#141413] ${style}`}>
      {children}
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="block text-xl font-bold text-[#141413]">{label}</span>
      {children}
    </label>
  );
}

export function ScreenTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-2xl font-extrabold leading-snug text-[#141413]">{children}</h2>;
}

export function Loading({ text = 'กำลังโหลด…' }: { text?: string }) {
  return (
    <p role="status" className="py-8 text-center text-xl text-[#27272A]">
      {text}
    </p>
  );
}
