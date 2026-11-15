'use client';

import { useState } from 'react';
import { apiRequest } from '@/lib/api-client';
import type { LiffAdapter } from '@/lib/liff/adapter';
import { LineRedirecting, lineRegister, lineSignIn } from '@/lib/liff/line-auth-client';
import { BigButton, Field, Notice, ScreenTitle } from './ui';

type View = 'choose' | 'password' | 'register' | 'pending';

export function MiniAuth({
  adapter,
  onSignedIn,
}: {
  adapter: LiffAdapter | null;
  onSignedIn: () => void | Promise<void>;
}) {
  const [view, setView] = useState<View>('choose');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');

  async function run(task: () => Promise<unknown>, after?: () => void | Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await task();
      await after?.();
    } catch (err) {
      if (err instanceof LineRedirecting) return;
      setError(err instanceof Error ? err.message : 'ทำรายการไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setBusy(false);
    }
  }

  if (view === 'pending') {
    return (
      <section className="space-y-5">
        <ScreenTitle>ส่งคำขอแล้ว</ScreenTitle>
        <Notice tone="info">
          ผู้ดูแลระบบจะตรวจสอบคำขอของคุณ เมื่ออนุมัติแล้ว ให้เปิดแอปนี้อีกครั้งแล้วกด “เข้าสู่ระบบด้วย LINE”
          <br />
          ตอนนี้ยังเข้าใช้งานไม่ได้
        </Notice>
        <BigButton tone="paper" onClick={() => setView('choose')}>
          กลับหน้าแรก
        </BigButton>
      </section>
    );
  }

  if (view === 'register') {
    return (
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!adapter) return;
          void run(() => lineRegister(adapter, name.trim(), note.trim()), () => setView('pending'));
        }}
      >
        <ScreenTitle>ขอใช้งานครั้งแรก</ScreenTitle>
        <p className="text-lg leading-relaxed text-[#27272A]">กรอกชื่อของคุณ ผู้ดูแลระบบจะตรวจสอบก่อนอนุมัติ</p>
        <Field label="ชื่อ-นามสกุล">
          <input className="fm-input min-h-[56px] w-full text-lg" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoComplete="name" />
        </Field>
        <Field label="ข้อความถึงผู้ดูแล (ไม่บังคับ)">
          <textarea className="fm-input min-h-[120px] w-full text-lg" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </Field>
        {error && <Notice tone="error">{error}</Notice>}
        <BigButton type="submit" disabled={busy || name.trim().length === 0}>
          {busy ? 'กำลังส่ง…' : 'ส่งคำขอ'}
        </BigButton>
        <BigButton tone="paper" onClick={() => setView('choose')}>
          ย้อนกลับ
        </BigButton>
      </form>
    );
  }

  if (view === 'password') {
    return (
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () => apiRequest('/api/v1/auth', { method: 'POST', body: { action: 'login_password', username, password } }),
            onSignedIn
          );
        }}
      >
        <ScreenTitle>เข้าสู่ระบบด้วยรหัสผ่าน</ScreenTitle>
        <Field label="ชื่อผู้ใช้">
          <input className="fm-input min-h-[56px] w-full text-lg" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" required />
        </Field>
        <Field label="รหัสผ่าน">
          <input className="fm-input min-h-[56px] w-full text-lg" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </Field>
        {error && <Notice tone="error">{error}</Notice>}
        <BigButton type="submit" disabled={busy}>
          {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
        </BigButton>
        <BigButton tone="paper" onClick={() => setView('choose')}>
          ย้อนกลับ
        </BigButton>
      </form>
    );
  }

  return (
    <section className="space-y-5">
      <ScreenTitle>ยินดีต้อนรับสู่ FaithMap</ScreenTitle>
      <p className="text-lg leading-relaxed text-[#27272A]">ระบบส่งรายงานกลุ่มบ้านประจำสัปดาห์ของคริสตจักร</p>
      {adapter?.kind === 'mock' && (
        <Notice tone="warn">โหมดทดสอบ ไม่ใช่ LINE จริง ปุ่ม LINE จะเข้าสู่ระบบไม่ได้</Notice>
      )}
      {!adapter && (
        <Notice tone="warn">การเข้าสู่ระบบด้วย LINE ยังไม่เปิดใช้งาน กรุณาใช้ชื่อผู้ใช้และรหัสผ่านก่อน</Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <BigButton disabled={busy || !adapter} onClick={() => adapter && void run(() => lineSignIn(adapter), onSignedIn)}>
        {busy ? 'กำลังตรวจสอบ…' : 'เข้าสู่ระบบด้วย LINE'}
      </BigButton>
      <BigButton tone="violet" disabled={!adapter} onClick={() => setView('register')}>
        ขอใช้งานครั้งแรก
      </BigButton>
      <BigButton tone="paper" onClick={() => setView('password')}>
        เข้าสู่ระบบด้วยรหัสผ่าน
      </BigButton>
    </section>
  );
}
