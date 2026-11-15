'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  Building2,
  CheckCheck,
  ClipboardCheck,
  FileEdit,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  MapPin,
  ScrollText,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import type {
  ActorPayload,
  DemoAccountOption,
  WorkspacePayload,
} from '@/lib/types';
import { LoginView } from './LoginView';
import { DashboardTab } from './DashboardTab';
import { WeeklyReportTab } from './WeeklyReportTab';
import { ApprovalQueueTab } from './ApprovalQueueTab';
import { MeetingBriefTab } from './MeetingBriefTab';
import { KalasinMapTab } from './KalasinMapTab';
import { PastoralCareTab } from './PastoralCareTab';
import { GovernanceTab } from './GovernanceTab';
import { DataIngestionTab } from './DataIngestionTab';
import { TeamFieldPointsTab } from './TeamFieldPointsTab';

interface AuthState {
  authenticated: boolean;
  actor: ActorPayload | null;
  demoEnabled: boolean;
  demoAccounts: DemoAccountOption[];
}

export function FaithMapApp() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [reportTargetGroupId, setReportTargetGroupId] = useState<string | null>(null);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [manualLoginScreen, setManualLoginScreen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage.getItem('fm_manual_login') === '1';
  });

  const navigateTab = useCallback((tab: string) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      window.history.pushState({ tab }, '', url.toString());
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const initialTab = params.get('tab');
    if (initialTab) setActiveTab(initialTab);

    const handlePopState = () => {
      const nextTab = new URLSearchParams(window.location.search).get('tab') || 'dashboard';
      setActiveTab(nextTab);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!inboxOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInboxOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inboxOpen]);

  const loadApp = useCallback(
    async (overridePeriodId?: string, skipAutoDemo?: boolean) => {
      setErrorMsg(null);
      try {
        let authRes = await apiRequest<AuthState>('/api/v1/auth');

        if (
          !authRes.authenticated &&
          authRes.demoEnabled &&
          authRes.demoAccounts.length > 0 &&
          !skipAutoDemo &&
          !manualLoginScreen
        ) {
          const preferred =
            authRes.demoAccounts.find((a) => a.username === 'admin_kanok') ??
            authRes.demoAccounts[0];
          if (preferred) {
            await apiRequest('/api/v1/auth', {
              method: 'POST',
              body: { action: 'demo_switch', userId: preferred.id },
            });
            authRes = await apiRequest<AuthState>('/api/v1/auth');
          }
        }

        setAuth(authRes);

        if (!authRes.authenticated) {
          setWorkspace(null);
          setLoading(false);
          return;
        }

        const pQuery = overridePeriodId || selectedPeriodId;
        const ws = await apiRequest<WorkspacePayload>(
          `/api/v1/workspace${pQuery ? `?periodId=${encodeURIComponent(pQuery)}` : ''}`
        );
        setWorkspace(ws);
        setSelectedPeriodId(ws.overview.selectedPeriod.id);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลได้');
      } finally {
        setLoading(false);
      }
    },
    [selectedPeriodId, manualLoginScreen]
  );

  useEffect(() => {
    void loadApp();
  }, [loadApp]);

  async function handleDemoSwitch(userId: string) {
    if (!userId) return;
    setLoading(true);
    setManualLoginScreen(false);
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem('fm_manual_login');
    }
    try {
      await apiRequest('/api/v1/auth', {
        method: 'POST',
        body: { action: 'demo_switch', userId },
      });
      await loadApp(undefined, true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'สลับบัญชีไม่สำเร็จ');
      setLoading(false);
    }
  }

  async function handleLogout() {
    setManualLoginScreen(true);
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('fm_manual_login', '1');
    }
    await apiRequest('/api/v1/auth', {
      method: 'POST',
      body: { action: 'logout' },
    });
    setWorkspace(null);
    await loadApp(undefined, true);
  }

  async function handleMarkAllRead() {
    await apiRequest('/api/v1/insights', {
      method: 'POST',
      body: { action: 'mark_all_notifications_read' },
    });
    await loadApp();
  }

  if (loading && !auth) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="fm-panel bg-[#C8FF00] px-6 py-4 text-lg font-extrabold text-[#141413]">
          กำลังเปิดระบบ FaithMap จังหวัดกาฬสินธุ์…
        </div>
      </div>
    );
  }

  if (!auth || !auth.authenticated || !workspace) {
    return (
      <LoginView
        demoEnabled={auth?.demoEnabled ?? true}
        demoAccounts={auth?.demoAccounts ?? []}
        onAuthenticated={async () => {
          setManualLoginScreen(false);
          setLoading(true);
          await loadApp(undefined, true);
        }}
      />
    );
  }

  const unreadCount = workspace.notifications.filter((n) => !n.readAt).length;
  const blockedCount = workspace.overview.metrics.blockedReports;

  const navItems = [
    { id: 'dashboard', label: 'ภาพรวม', Icon: LayoutDashboard },
    { id: 'report', label: 'ส่งรายงาน 3 ขั้น', Icon: FileEdit },
    {
      id: 'approvals',
      label: blockedCount > 0 ? `ตรวจ/อนุมัติ (${blockedCount})` : 'ตรวจ/อนุมัติ',
      Icon: ClipboardCheck,
    },
    { id: 'brief', label: 'สรุปประชุม 20:30', Icon: ScrollText },
    { id: 'map', label: 'แผนที่กาฬสินธุ์', Icon: MapIcon },
    { id: 'pastoral', label: 'สมาชิก & ผู้เยี่ยม', Icon: Users },
    { id: 'governance', label: 'องค์กร & สิทธิ์', Icon: Building2 },
    ...(workspace.actor.user.systemRole === 'super_admin' ||
    workspace.actor.user.systemRole === 'admin' ||
    workspace.actor.bodyLeaderBodyIds.length > 0
      ? [{ id: 'ingestion', label: 'นำเข้า & ตรวจข้อมูล', Icon: ClipboardCheck }]
      : []),
    ...(workspace.actor.user.systemRole === 'super_admin' || workspace.actor.user.systemRole === 'admin'
      ? [{ id: 'field-points', label: 'จุดลงพื้นที่', Icon: MapPin }]
      : []),
  ];

  return (
    <div className="min-h-screen overflow-x-hidden text-[#141413]">
      {/* Carbon-Ink Studio Command Header */}
      <header className="sticky top-0 z-30 border-b-2 border-[#141413] bg-[#141413] text-[#F0F4F8]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-display inline-flex items-center gap-2 rounded-xl border-2 border-[#141413] bg-[#C8FF00] px-3.5 py-1 text-xl font-extrabold tracking-tight text-[#141413]">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
              <span>FaithMap</span>
            </span>
            <span className="hidden rounded-full border border-[#F0F4F8]/30 bg-[#27272A] px-3 py-1 text-base font-bold text-[#F0F4F8] sm:inline-block">
              พันธกิจบ้าน จ.กาฬสินธุ์ ({workspace.overview.selectedPeriod.periodKey})
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {auth.demoEnabled && (
              <select
                aria-label="สลับบทบาทผู้ใช้งานทดสอบ"
                value={workspace.actor.user.id}
                onChange={(e) => handleDemoSwitch(e.target.value)}
                className="min-h-[48px] max-w-[260px] rounded-xl border-2 border-[#C8FF00] bg-[#27272A] px-3 text-base font-bold text-[#F0F4F8]"
              >
                {auth.demoAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id} className="bg-[#141413] text-[#F0F4F8]">
                    {acc.displayName}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={() => setInboxOpen(true)}
              aria-label="เปิดกล่องแจ้งเตือน"
              className="relative inline-flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl border-2 border-[#F0F4F8] bg-[#27272A] px-3 font-bold text-[#F0F4F8] transition hover:bg-[#1D4ED8]"
            >
              <Bell className="h-5 w-5" aria-hidden="true" />
              {unreadCount > 0 && (
                <span className="ml-1.5 rounded-full border border-[#141413] bg-[#C8FF00] px-2 py-0.5 text-base font-extrabold text-[#141413]">
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex min-h-[48px] items-center gap-1.5 rounded-xl border-2 border-[#F0F4F8] bg-[#27272A] px-3.5 text-base font-bold text-[#F0F4F8] transition hover:bg-[#BE123C]"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">ออก</span>
            </button>
          </div>
        </div>

        {/* Kinetic 7-Mode Navigation Dock */}
        <div className="border-t border-[#27272A] bg-[#18181B]">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5">
            <nav
              aria-label="เมนูหลัก FaithMap"
              className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible md:pb-0"
            >
              {navItems.map((item) => {
                const Icon = item.Icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigateTab(item.id)}
                    className={`flex min-h-[48px] shrink-0 items-center gap-2 rounded-xl border-2 px-3 py-2 text-base font-extrabold transition ${
                      isActive
                        ? 'border-[#141413] bg-[#C8FF00] text-[#141413] shadow-[3px_3px_0px_#1D4ED8]'
                        : 'border-[#27272A] bg-[#27272A] text-[#F0F4F8] hover:border-[#C8FF00]'
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span className="whitespace-nowrap">{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="hidden items-center gap-2 xl:flex">
              <span className="rounded-lg border border-[#F0F4F8]/30 bg-[#27272A] px-3 py-1.5 text-base font-bold text-[#F0F4F8]">
                {workspace.actor.user.displayName}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Studio Canvas */}
      <main className="mx-auto w-full min-w-0 max-w-7xl overflow-x-hidden px-4 pb-24 pt-6 md:pb-8">
        {errorMsg && (
          <div
            role="alert"
            className="fm-panel mb-5 bg-[#FFE4E6] p-4 text-base font-bold text-[#881337]"
          >
            {errorMsg}
          </div>
        )}

        {activeTab === 'dashboard' && (
          <DashboardTab
            workspace={workspace}
            selectedPeriodId={selectedPeriodId}
            onSelectPeriod={async (pid) => {
              setSelectedPeriodId(pid);
              await loadApp(pid);
            }}
            onNavigateTab={navigateTab}
            onOpenGroupReport={(gid) => {
              setReportTargetGroupId(gid);
              navigateTab('report');
            }}
          />
        )}

        {activeTab === 'report' && (
          <WeeklyReportTab
            workspace={workspace}
            preselectedGroupId={reportTargetGroupId}
            onRefresh={() => loadApp()}
          />
        )}

        {activeTab === 'approvals' && (
          <ApprovalQueueTab
            workspace={workspace}
            onRefresh={() => loadApp()}
            onOpenReportForGroup={(gid) => {
              setReportTargetGroupId(gid);
              navigateTab('report');
            }}
          />
        )}

        {activeTab === 'brief' && (
          <MeetingBriefTab workspace={workspace} onRefresh={() => loadApp()} />
        )}

        {activeTab === 'map' && (
          <KalasinMapTab
            workspace={workspace}
            onSelectGroupReport={(gid) => {
              setReportTargetGroupId(gid);
              navigateTab('report');
            }}
          />
        )}

        {activeTab === 'pastoral' && (
          <PastoralCareTab workspace={workspace} onRefresh={() => loadApp()} />
        )}

        {activeTab === 'governance' && (
          <GovernanceTab workspace={workspace} onRefresh={() => loadApp()} />
        )}

        {activeTab === 'field-points' && <TeamFieldPointsTab workspace={workspace} />}

        {activeTab === 'ingestion' && (
          <DataIngestionTab workspace={workspace} onRefreshWorkspace={() => loadApp()} />
        )}
      </main>

      {/* Mobile / LINE LIFF Bottom Navigation Bar (5 primary tabs + safe-area) */}
      <nav
        aria-label="เมนูลัดมือถือ"
        className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-[var(--fm-ink)] bg-[#18181B] pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <div className="grid grid-cols-5">
          {navItems.slice(0, 5).map((item) => {
            const Icon = item.Icon;
            const isActive = activeTab === item.id;
            const shortNames: Record<string, string> = {
              dashboard: 'ภาพรวม',
              report: 'ส่งรายงาน',
              approvals: 'อนุมัติ',
              brief: 'สรุป 20:30',
              map: 'แผนที่',
            };
            return (
              <button
                key={`bottom-${item.id}`}
                type="button"
                onClick={() => navigateTab(item.id)}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-base font-extrabold ${
                  isActive
                    ? 'bg-[var(--fm-lime)] text-[var(--fm-ink)]'
                    : 'text-[var(--fm-paper)]'
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="whitespace-nowrap">{shortNames[item.id] ?? item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* In-App Notification Inbox Drawer (DEC-07: In-App + LINE OA only, zero Web Push) */}
      {inboxOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="กล่องแจ้งเตือนภายในแอป"
          onClick={(e) => {
            if (e.target === e.currentTarget) setInboxOpen(false);
          }}
          className="fixed inset-0 z-50 flex justify-end bg-[#141413]/70"
        >
          <div className="flex h-full w-full max-w-md flex-col border-l-4 border-[#141413] bg-[#F0F4F8]">
            <div className="flex items-center justify-between border-b-2 border-[#141413] bg-[#C8FF00] p-4">
              <div>
                <h2 className="font-display text-xl font-extrabold text-[#141413]">
                  กล่องแจ้งเตือน
                </h2>
                <p className="text-base font-bold text-[#141413]">
                  แจ้งเตือนในระบบและ LINE OA
                </p>
              </div>
              <button
                type="button"
                aria-label="ปิดกล่องแจ้งเตือน"
                onClick={() => setInboxOpen(false)}
                className="fm-btn fm-btn-paper min-h-[48px] min-w-[48px] p-2"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {unreadCount > 0 && (
              <div className="border-b-2 border-[#141413] bg-[#E2E8F0] p-3">
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="fm-btn fm-btn-violet w-full text-base"
                >
                  <CheckCheck className="h-4 w-4" />
                  <span>ทำเครื่องหมายว่าอ่านแล้วทั้งหมด ({unreadCount})</span>
                </button>
              </div>
            )}

            <div className="divide-y-2 divide-[#141413] overflow-y-auto">
              {workspace.notifications.length === 0 ? (
                <p className="p-8 text-center text-base font-bold text-[#27272A]">
                  ยังไม่มีรายการแจ้งเตือนในรอบนี้
                </p>
              ) : (
                workspace.notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`p-4 ${
                      n.readAt
                        ? 'bg-white text-[#27272A]'
                        : 'bg-[#DBEAFE] text-[#141413]'
                    }`}
                  >
                    <div className="text-base font-extrabold">{n.title}</div>
                    <p className="mt-1 text-base font-medium">{n.body}</p>
                    <p className="mt-1.5 font-mono text-base font-bold text-[#27272A]">
                      {new Date(n.createdAt).toLocaleString('th-TH')}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
