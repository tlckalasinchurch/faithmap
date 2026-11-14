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
  ScrollText,
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

  const loadApp = useCallback(
    async (overridePeriodId?: string) => {
      setErrorMsg(null);
      try {
        const authRes = await apiRequest<AuthState>('/api/v1/auth');
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
    [selectedPeriodId]
  );

  useEffect(() => {
    void loadApp();
  }, [loadApp]);

  async function handleDemoSwitch(userId: string) {
    if (!userId) return;
    setLoading(true);
    try {
      await apiRequest('/api/v1/auth', {
        method: 'POST',
        body: { action: 'demo_switch', userId },
      });
      await loadApp();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'สลับบัญชีไม่สำเร็จ');
      setLoading(false);
    }
  }

  async function handleLogout() {
    await apiRequest('/api/v1/auth', {
      method: 'POST',
      body: { action: 'logout' },
    });
    setWorkspace(null);
    await loadApp();
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
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-lg font-semibold text-slate-700">
        กำลังเชื่อมต่อระบบ FaithMap จังหวัดกาฬสินธุ์...
      </div>
    );
  }

  if (!auth || !auth.authenticated || !workspace) {
    return (
      <LoginView
        demoEnabled={auth?.demoEnabled ?? true}
        demoAccounts={auth?.demoAccounts ?? []}
        onAuthenticated={async () => {
          setLoading(true);
          await loadApp();
        }}
      />
    );
  }

  const unreadCount = workspace.notifications.filter((n) => !n.readAt).length;
  const blockedCount = workspace.overview.metrics.blockedReports;

  const navItems = [
    { id: 'dashboard', label: 'ภาพรวม', Icon: LayoutDashboard },
    { id: 'report', label: 'ส่งรายงาน', Icon: FileEdit },
    {
      id: 'approvals',
      label: blockedCount > 0 ? `ตรวจ/อนุมัติ (${blockedCount})` : 'ตรวจ/อนุมัติ',
      Icon: ClipboardCheck,
    },
    { id: 'brief', label: 'สรุปประชุม 20:30', Icon: ScrollText },
    { id: 'map', label: 'แผนที่กาฬสินธุ์', Icon: MapIcon },
    { id: 'pastoral', label: 'สมาชิก & ผู้เยี่ยม', Icon: Users },
    { id: 'governance', label: 'องค์กร & ผู้ดูแล', Icon: Building2 },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-extrabold tracking-tight text-teal-800">
              FaithMap
            </span>
            <span className="hidden rounded-full border border-teal-200 bg-teal-50 px-3 py-0.5 text-xs font-bold text-teal-900 sm:inline-block">
              นำร่อง จ.กาฬสินธุ์
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {auth.demoEnabled && (
              <select
                aria-label="สลับบทบาทผู้ใช้งานทดสอบ"
                value={workspace.actor.user.id}
                onChange={(e) => handleDemoSwitch(e.target.value)}
                className="min-h-[44px] max-w-[260px] rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-semibold text-slate-900"
              >
                {auth.demoAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.displayName}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={() => setInboxOpen(true)}
              aria-label="เปิดกล่องแจ้งเตือน"
              className="relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-slate-800 hover:bg-slate-50"
            >
              <Bell className="h-5 w-5" aria-hidden="true" />
              {unreadCount > 0 && (
                <span className="ml-1.5 rounded-full bg-rose-600 px-2 py-0.5 text-xs font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">ออก</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 lg:flex-row">
        {/* Desktop Sidebar + Mobile Scroll Tabs */}
        <nav aria-label="เมนูหลัก FaithMap" className="shrink-0 lg:w-64">
          <div className="mb-3 hidden rounded-2xl border border-slate-200 bg-white p-4 lg:block">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              ผู้ใช้งานปัจจุบัน
            </p>
            <p className="mt-1 text-base font-bold text-slate-900">
              {workspace.actor.user.displayName}
            </p>
            <p className="mt-0.5 text-sm text-teal-800">{workspace.actor.user.systemRole}</p>
            {workspace.actor.assignments.length > 0 && (
              <div className="mt-2 space-y-1">
                {workspace.actor.assignments.map((a) => (
                  <div
                    key={a.id}
                    className="rounded-lg bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700"
                  >
                    {a.roleType}: {a.groupName || a.bodyName}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
            {navItems.map((item) => {
              const Icon = item.Icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex min-h-[48px] shrink-0 items-center gap-3 rounded-xl border px-4 py-2.5 text-base font-bold transition ${
                    isActive
                      ? 'border-teal-700 bg-teal-700 text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span className="whitespace-nowrap">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        <main className="min-w-0 flex-1">
          {errorMsg && (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-rose-300 bg-rose-50 p-4 text-base font-semibold text-rose-950"
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
              onNavigateTab={setActiveTab}
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
                setActiveTab('report');
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
                setActiveTab('report');
              }}
            />
          )}

          {activeTab === 'pastoral' && (
            <PastoralCareTab workspace={workspace} onRefresh={() => loadApp()} />
          )}

          {activeTab === 'governance' && (
            <GovernanceTab workspace={workspace} onRefresh={() => loadApp()} />
          )}
        </main>
      </div>

      {/* In-App Notification Inbox Drawer (DEC-07: In-App + LINE OA only, zero Web Push) */}
      {inboxOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="กล่องแจ้งเตือนภายในแอป"
          className="fixed inset-0 z-50 flex justify-end bg-slate-900/40"
        >
          <div className="flex h-full w-full max-w-md flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">กล่องแจ้งเตือน (DEC-07)</h2>
                <p className="text-xs text-slate-600">
                  แจ้งเตือนในระบบและ LINE OA (ไม่ใช้ Web Push)
                </p>
              </div>
              <button
                type="button"
                aria-label="ปิดกล่องแจ้งเตือน"
                onClick={() => setInboxOpen(false)}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {unreadCount > 0 && (
              <div className="border-b border-slate-100 p-3">
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-teal-700 px-3 text-sm font-bold text-teal-800"
                >
                  <CheckCheck className="h-4 w-4" />
                  <span>ทำเครื่องหมายว่าอ่านแล้วทั้งหมด</span>
                </button>
              </div>
            )}

            <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
              {workspace.notifications.length === 0 ? (
                <p className="text-center text-base text-slate-500">ไม่มีรายการแจ้งเตือน</p>
              ) : (
                workspace.notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`rounded-xl border p-3.5 ${
                      n.readAt
                        ? 'border-slate-200 bg-white text-slate-700'
                        : 'border-teal-300 bg-teal-50 text-slate-900'
                    }`}
                  >
                    <div className="text-base font-bold">{n.title}</div>
                    <p className="mt-1 text-sm">{n.body}</p>
                    <p className="mt-1.5 text-xs text-slate-500">
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
