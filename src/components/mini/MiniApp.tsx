'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api-client';
import type { WorkspacePayload } from '@/lib/types';
import type { MiniNavKey } from '@/lib/mini-nav';
import { createLiffAdapter, type LiffAdapter } from '@/lib/liff/adapter';
import { MiniAuth } from './MiniAuth';
import { Approvals, Groups, Growth, Home, LinkLine, Notifications } from './MiniScreens';
import { MiniReports } from './MiniReport';
import { BigButton, Loading, Notice } from './ui';

type View = MiniNavKey | 'link';

export function MiniApp() {
  const [phase, setPhase] = useState<'loading' | 'auth' | 'app'>('loading');
  const [adapter, setAdapter] = useState<LiffAdapter | null>(null);
  const [data, setData] = useState<WorkspacePayload | null>(null);
  const [view, setView] = useState<View>('home');
  const [error, setError] = useState<string | null>(null);

  const loadWorkspace = useCallback(async () => {
    const ws = await apiRequest<WorkspacePayload>('/api/v1/workspace');
    setData(ws);
    setPhase('app');
  }, []);

  const boot = useCallback(async () => {
    try {
      const a = await createLiffAdapter();
      await a?.init();
      setAdapter(a);
    } catch {
      setAdapter(null); // LINE could not start. Password sign-in still works.
    }
    try {
      const me = await apiRequest<{ authenticated: boolean }>('/api/v1/auth');
      if (me.authenticated) await loadWorkspace();
      else setPhase('auth');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เปิดแอปไม่สำเร็จ');
      setPhase('auth');
    }
  }, [loadWorkspace]);

  useEffect(() => {
    void boot();
  }, [boot]);

  async function signOut() {
    try {
      await apiRequest('/api/v1/auth', { method: 'POST', body: { action: 'logout' } });
    } finally {
      setData(null);
      setView('home');
      setPhase('auth');
    }
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-md px-4 pb-10 pt-4 text-[18px] leading-relaxed text-[#141413]">
      <header className="mb-5 flex items-center justify-between gap-3 border-b-2 border-[#141413] pb-3">
        <h1 className="font-display text-2xl font-extrabold">FaithMap</h1>
        {phase === 'app' && (
          <button type="button" onClick={() => void signOut()} className="fm-btn fm-btn-paper min-h-[48px] px-4 text-lg font-bold">
            ออกจากระบบ
          </button>
        )}
      </header>

      <main>
        {error && phase !== 'app' && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
        {phase === 'loading' && <Loading text="กำลังเปิดแอป…" />}
        {phase === 'auth' && <MiniAuth adapter={adapter} onSignedIn={loadWorkspace} />}
        {phase === 'app' && data && (
          <div className="space-y-5">
            {view !== 'home' && (
              <BigButton tone="paper" onClick={() => setView('home')}>
                ← กลับหน้าแรก
              </BigButton>
            )}
            {view === 'home' && <Home data={data} adapter={adapter} go={setView} />}
            {view === 'reports' && <MiniReports data={data} reload={loadWorkspace} />}
            {view === 'group' && <Groups data={data} />}
            {view === 'growth' && <Growth />}
            {view === 'notifications' && <Notifications data={data} reload={loadWorkspace} />}
            {view === 'approvals' && <Approvals />}
            {view === 'link' && <LinkLine adapter={adapter} />}
          </div>
        )}
      </main>
    </div>
  );
}
