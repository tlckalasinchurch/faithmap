'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileCheck2,
  MapPin,
  RotateCcw,
  Upload,
  XCircle,
} from 'lucide-react';
import type { WorkspacePayload } from '@/lib/types';

interface ImportBatchRow {
  id: string;
  batchCode: string;
  sourceArchiveName: string;
  fileSha256: string;
  status: string;
  summaryJson: Record<string, unknown>;
  createdAt: string;
}

interface DataQualityIssueRow {
  id: string;
  batchId: string | null;
  targetType: string;
  targetId: string;
  issueCode: string;
  severity: string;
  status: string;
  summarySafeText: string;
  resolutionNote: string | null;
}

interface CandidateLocationRow {
  id: string;
  groupId: string | null;
  stagingGroupId: string | null;
  candidateNo: number;
  candidateName: string;
  latitude: number;
  longitude: number;
  matchStatus: string;
}

interface UnlocatedGroupRow {
  id: string;
  groupCode: string;
  nameTh: string;
  district: string;
  subdistrict: string | null;
  village: string | null;
  addressSummary: string | null;
  assignmentStatus: string;
  careCodeRaw: string | null;
}

interface UnassignedBodyGroupRow {
  id: string;
  groupCode: string;
  nameTh: string;
  district: string;
  careCodeRaw: string | null;
}

interface BodyOption {
  id: string;
  code: string;
  nameTh: string;
}

interface DistrictMappingRow {
  id: string;
  districtRaw: string;
  districtCanonical: string;
}

interface CareMappingRow {
  id: string;
  careCodeRaw: string;
  bodyId: string;
}

interface UnlinkedStewardRow {
  id: string;
  roleType: string;
  stewardDisplayName: string | null;
  bodyId: string | null;
  groupId: string | null;
  linkStatus: string;
}

interface LinkableUserOption {
  id: string;
  displayName: string;
  username: string;
}

interface IngestionOverview {
  batches: ImportBatchRow[];
  issues: DataQualityIssueRow[];
  candidateLocations: CandidateLocationRow[];
  unlocatedGroups: UnlocatedGroupRow[];
  unassignedBodyGroups: UnassignedBodyGroupRow[];
  districtMappings: DistrictMappingRow[];
  careMappings: CareMappingRow[];
  bodies: BodyOption[];
  unlinkedStewards: UnlinkedStewardRow[];
  linkableUsers: LinkableUserOption[];
}

interface PreviewSummary {
  fileSha256: string;
  sourceArchiveName: string;
  totalGroups: number;
  totalMemberRows: number;
  missingCoordinatesGroups: number;
  pendingBodyGroups: number;
  missingFullNameCount: number;
  missingBothNamesCount: number;
  countMismatchGroups: number;
  nonNumericTotalGroups: number;
  missingCoordinatorGroups: number;
  unnumberedCareGroups: number;
  crossGroupDuplicateKeys: number;
  distinctDistrictLabels: string[];
}

const ISSUE_STATUS_LABEL: Record<string, string> = {
  open: 'รอตรวจสอบ',
  approved_fix: 'อนุมัติแล้ว',
  rejected: 'ปฏิเสธ',
  resolved: 'แก้ไขแล้ว',
  deferred: 'พักไว้ก่อน',
};

const BATCH_STATUS_LABEL: Record<string, string> = {
  uploaded: 'อัปโหลดแล้ว',
  validated: 'ตรวจโครงสร้างแล้ว',
  staged: 'รอตรวจและอนุมัติ',
  review_in_progress: 'กำลังตรวจสอบ',
  partially_promoted: 'นำเข้าบางส่วนแล้ว',
  promoted: 'นำเข้าทะเบียนจริงแล้ว',
  rolled_back: 'ยกเลิกแล้ว',
  failed: 'นำเข้าไม่สำเร็จ',
};

const LINK_STATUS_LABEL: Record<string, string> = {
  unlinked_pending_account: 'รอผูกบัญชีผู้ใช้',
  linked_user: 'ผูกบัญชีแล้ว',
};

const ISSUE_CODE_LABEL: Record<string, string> = {
  count_mismatch: 'ยอดทะเบียนไม่ตรงแถว',
  non_numeric_registered_total: 'ยอดทะเบียนไม่ใช่ตัวเลข',
  missing_member_name: 'สมาชิกไม่มีชื่อจริง/ชื่อเล่น',
  district_ambiguity: 'อำเภอสะกดต่างกัน',
  naming_conflict: 'ชื่อชีต/ฟอร์มขัดแย้ง',
  missing_location: 'ยังไม่มีพิกัด GPS',
  unassigned_body: 'รอจัดสรรบอดี้',
  duplicate_candidate: 'รายชื่ออาจซ้ำข้ามกลุ่ม',
};

export function DataIngestionTab({
  workspace,
  onRefreshWorkspace,
}: {
  workspace: WorkspacePayload;
  onRefreshWorkspace: () => Promise<void> | void;
}) {
  const isAdmin =
    workspace.actor.user.systemRole === 'super_admin' ||
    workspace.actor.user.systemRole === 'admin';
  const [overview, setOverview] = useState<IngestionOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'queue' | 'locations' | 'mappings' | 'import'>('queue');
  const [issueFilter, setIssueFilter] = useState<'open' | 'all'>('open');
  const [rawJsonText, setRawJsonText] = useState('');
  const [preview, setPreview] = useState<PreviewSummary | null>(null);
  const [districtRawInput, setDistrictRawInput] = useState('');
  const [districtCanonInput, setDistrictCanonInput] = useState('');
  const [careCodeInput, setCareCodeInput] = useState('');
  const [careBodyIdInput, setCareBodyIdInput] = useState('');
  const [groupBodySelection, setGroupBodySelection] = useState<Record<string, string>>({});
  const [stewardUserSelection, setStewardUserSelection] = useState<Record<string, string>>({});

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/v1/ingestion', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'โหลดข้อมูลตรวจสอบไม่สำเร็จ');
      setOverview({
        batches: data.batches ?? [],
        issues: data.issues ?? [],
        candidateLocations: data.candidateLocations ?? [],
        unlocatedGroups: data.unlocatedGroups ?? [],
        unassignedBodyGroups: data.unassignedBodyGroups ?? [],
        districtMappings: data.districtMappings ?? [],
        careMappings: data.careMappings ?? [],
        bodies: data.bodies ?? [],
        unlinkedStewards: data.unlinkedStewards ?? [],
        linkableUsers: data.linkableUsers ?? [],
      });
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const filteredIssues = useMemo(() => {
    const list = overview?.issues ?? [];
    if (issueFilter === 'open') return list.filter((i) => i.status === 'open');
    return list;
  }, [overview, issueFilter]);

  const openIssueCount = useMemo(
    () => (overview?.issues ?? []).filter((i) => i.status === 'open').length,
    [overview]
  );

  const pendingLocationMatches = useMemo(
    () => (overview?.candidateLocations ?? []).filter((c) => c.matchStatus === 'pending'),
    [overview]
  );

  async function postIngestion(body: Record<string, unknown>, label: string) {
    setBusyAction(label);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/v1/ingestion', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'ดำเนินการไม่สำเร็จ');
      return data;
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด');
      return null;
    } finally {
      setBusyAction(null);
    }
  }

  async function handlePreview() {
    try {
      const parsed = JSON.parse(rawJsonText);
      const res = await postIngestion({ action: 'preview', payload: parsed }, 'preview');
      if (res?.preview) {
        setPreview(res.preview);
        setStatusMsg('ตรวจสอบข้อมูลเบื้องต้นสำเร็จ (ยังไม่บันทึกลงฐานข้อมูล)');
      }
    } catch {
      setErrorMsg('รูปแบบ JSON ไม่ถูกต้อง กรุณาตรวจสอบโครงสร้างไฟล์นำเข้า');
    }
  }

  async function handleStage() {
    try {
      const parsed = JSON.parse(rawJsonText);
      const res = await postIngestion({ action: 'stage', payload: parsed }, 'stage');
      if (res?.batch) {
        setStatusMsg(
          res.idempotentHit
            ? `พบ Batch เดิมในระบบแล้ว (${res.batch.batchCode}) — ไม่นำเข้าซ้ำ`
            : `นำเข้าสู่พื้นที่พักข้อมูล (Staging) สำเร็จ: ${res.batch.batchCode}`
        );
        await loadOverview();
      }
    } catch {
      setErrorMsg('รูปแบบ JSON ไม่ถูกต้อง กรุณาตรวจสอบโครงสร้างไฟล์นำเข้า');
    }
  }

  async function handleResolveIssue(
    issueId: string,
    decision: 'approved_fix' | 'rejected' | 'deferred'
  ) {
    const note =
      decision === 'approved_fix'
        ? 'ยืนยันการแก้ไขโดยผู้ตรวจสอบ'
        : decision === 'rejected'
          ? 'ปฏิเสธรายการแก้ไขตามต้นฉบับ'
          : 'พักรายการไว้ตรวจสอบภายหลัง';
    const res = await postIngestion(
      { action: 'resolve_issue', issueId, decision, resolutionNote: note },
      issueId
    );
    if (res?.issue) {
      setStatusMsg('อัปเดตสถานะรายการตรวจสอบเรียบร้อย');
      await loadOverview();
    }
  }

  async function handleReviewLocation(matchId: string, decision: 'confirmed' | 'rejected') {
    const res = await postIngestion(
      { action: 'review_location_match', matchId, decision },
      matchId
    );
    if (res?.match) {
      setStatusMsg(
        decision === 'confirmed'
          ? 'ยืนยันพิกัด GPS ให้กลุ่มเรียบร้อย'
          : 'ปฏิเสธพิกัดอ้างอิงนี้แล้ว'
      );
      await loadOverview();
      await onRefreshWorkspace();
    }
  }

  async function handlePromote(batchId: string) {
    const res = await postIngestion({ action: 'promote', batchId }, `promote-${batchId}`);
    if (res?.batch) {
      setStatusMsg(
        `นำเข้าสู่ทะเบียนจริงสำเร็จ ${res.promotedGroupsCount} กลุ่ม / ${res.promotedMembersCount} สมาชิก`
      );
      await loadOverview();
      await onRefreshWorkspace();
    }
  }

  async function handleRollback(batchId: string) {
    const res = await postIngestion(
      { action: 'rollback', batchId, reason: 'Rollback จากหน้าตรวจสอบข้อมูล' },
      `rollback-${batchId}`
    );
    if (res?.batch) {
      setStatusMsg(
        res.archivedInsteadOfDeleted
          ? 'เก็บถาวร (Archive) กลุ่มที่มีรายงานแล้วแทนการลบ เพื่อรักษารายงานย้อนหลัง'
          : 'ยกเลิก Batch (Rollback) เรียบร้อยแล้ว'
      );
      await loadOverview();
      await onRefreshWorkspace();
    }
  }

  return (
    <div className="min-w-0 max-w-full space-y-6">
      <header className="fm-panel min-w-0 p-4 sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="font-display text-2xl font-extrabold text-[var(--fm-ink)] sm:text-3xl">
              ศูนย์นำเข้าและตรวจสอบคุณภาพข้อมูล
            </h1>
            <p className="mt-1 text-base text-[var(--fm-ink-secondary)]">
              พักข้อมูลตรวจสอบก่อนขึ้นทะเบียนจริง พร้อมคิวยืนยันพิกัดและป้องกันชื่อซ้ำ
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveSection('queue')}
              className={`fm-btn text-sm ${
                activeSection === 'queue' ? 'fm-btn-lime' : 'fm-btn-paper'
              }`}
            >
              คิวตรวจสอบ ({openIssueCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('locations')}
              className={`fm-btn text-sm ${
                activeSection === 'locations' ? 'fm-btn-lime' : 'fm-btn-paper'
              }`}
            >
              รอปักหมุด ({(overview?.unlocatedGroups.length ?? 0) + pendingLocationMatches.length})
            </button>
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => setActiveSection('mappings')}
                  className={`fm-btn text-sm ${
                    activeSection === 'mappings' ? 'fm-btn-lime' : 'fm-btn-paper'
                  }`}
                >
                  จัดสรรบอดี้ &amp; อำเภอ ({overview?.unassignedBodyGroups.length ?? 0})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSection('import')}
                  className={`fm-btn text-sm ${
                    activeSection === 'import' ? 'fm-btn-lime' : 'fm-btn-paper'
                  }`}
                >
                  นำเข้าชุดข้อมูล
                </button>
              </>
            )}
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 border-t-2 border-[var(--fm-ink)] pt-4 sm:grid-cols-4">
          <div className="rounded-xl border-2 border-[var(--fm-ink)] bg-[var(--fm-canvas)] p-3">
            <dt className="text-sm font-bold text-[var(--fm-ink-muted)]">รายการรอตรวจสอบ</dt>
            <dd className="tabular-nums font-display mt-1 text-2xl font-extrabold text-[var(--fm-coral)]">
              {openIssueCount}
            </dd>
          </div>
          <div className="rounded-xl border-2 border-[var(--fm-ink)] bg-[var(--fm-canvas)] p-3">
            <dt className="text-sm font-bold text-[var(--fm-ink-muted)]">กลุ่มรอปักหมุด GPS</dt>
            <dd className="tabular-nums font-display mt-1 text-2xl font-extrabold text-[var(--fm-ink)]">
              {overview?.unlocatedGroups.length ?? 0}
            </dd>
          </div>
          <div className="rounded-xl border-2 border-[var(--fm-ink)] bg-[var(--fm-canvas)] p-3">
            <dt className="text-sm font-bold text-[var(--fm-ink-muted)]">พิกัดรอยืนยัน</dt>
            <dd className="tabular-nums font-display mt-1 text-2xl font-extrabold text-[var(--fm-violet)]">
              {pendingLocationMatches.length}
            </dd>
          </div>
          <div className="rounded-xl border-2 border-[var(--fm-ink)] bg-[var(--fm-canvas)] p-3">
            <dt className="text-sm font-bold text-[var(--fm-ink-muted)]">ชุดข้อมูลรอตรวจ</dt>
            <dd className="tabular-nums font-display mt-1 text-2xl font-extrabold text-[var(--fm-emerald)]">
              {overview?.batches.length ?? 0}
            </dd>
          </div>
        </dl>
      </header>

      {errorMsg && (
        <div
          role="alert"
          className="rounded-xl border-2 border-[var(--fm-ink)] bg-[var(--fm-coral-soft)] p-4 text-base font-bold text-[var(--fm-coral)]"
        >
          {errorMsg}
        </div>
      )}

      {statusMsg && (
        <div
          role="status"
          className="rounded-xl border-2 border-[var(--fm-ink)] bg-[var(--fm-emerald-soft)] p-4 text-base font-bold text-[var(--fm-emerald)]"
        >
          {statusMsg}
        </div>
      )}

      {loading ? (
        <div className="fm-panel p-6 text-base font-bold text-[var(--fm-ink-muted)]">
          กำลังโหลดคิวตรวจสอบข้อมูล…
        </div>
      ) : activeSection === 'queue' ? (
        <section className="fm-panel p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[var(--fm-ink)] pb-3">
            <h2 className="font-display text-xl font-extrabold text-[var(--fm-ink)]">
              รายการตรวจสอบคุณภาพข้อมูล
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIssueFilter('open')}
                className={`min-h-[44px] rounded-lg border-2 border-[var(--fm-ink)] px-3 text-sm font-bold ${
                  issueFilter === 'open'
                    ? 'bg-[var(--fm-ink)] text-[var(--fm-paper)]'
                    : 'bg-[var(--fm-paper)] text-[var(--fm-ink)]'
                }`}
              >
                เฉพาะที่รอตรวจ
              </button>
              <button
                type="button"
                onClick={() => setIssueFilter('all')}
                className={`min-h-[44px] rounded-lg border-2 border-[var(--fm-ink)] px-3 text-sm font-bold ${
                  issueFilter === 'all'
                    ? 'bg-[var(--fm-ink)] text-[var(--fm-paper)]'
                    : 'bg-[var(--fm-paper)] text-[var(--fm-ink)]'
                }`}
              >
                ทั้งหมด
              </button>
            </div>
          </div>

          {filteredIssues.length === 0 ? (
            <p className="py-8 text-center text-base font-bold text-[var(--fm-ink-muted)]">
              ไม่มีรายการค้างตรวจสอบในหมวดนี้
            </p>
          ) : (
            <div className="mt-4 divide-y-2 divide-[var(--fm-ink)]/15">
              {filteredIssues.map((issue) => (
                <div
                  key={issue.id}
                  className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-[var(--fm-ink)] bg-[var(--fm-amber-soft)] px-2.5 py-0.5 text-xs font-extrabold text-[var(--fm-ink)]">
                        {ISSUE_CODE_LABEL[issue.issueCode] ?? issue.issueCode}
                      </span>
                      <span className="text-xs font-bold text-[var(--fm-ink-muted)]">
                        สถานะ: {ISSUE_STATUS_LABEL[issue.status] ?? issue.status}
                      </span>
                    </div>
                    <p className="mt-1.5 break-words text-base font-bold text-[var(--fm-ink)]">
                      {issue.summarySafeText}
                    </p>
                    {issue.resolutionNote && (
                      <p className="mt-1 text-sm text-[var(--fm-ink-muted)]">
                        บันทึก: {issue.resolutionNote}
                      </p>
                    )}
                  </div>
                  {issue.status === 'open' && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busyAction === issue.id}
                        onClick={() => handleResolveIssue(issue.id, 'approved_fix')}
                        className="inline-flex min-h-[48px] items-center gap-1.5 rounded-xl border-2 border-[var(--fm-ink)] bg-[var(--fm-lime)] px-3.5 text-sm font-extrabold text-[var(--fm-ink)]"
                      >
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        <span>อนุมัติ</span>
                      </button>
                      <button
                        type="button"
                        disabled={busyAction === issue.id}
                        onClick={() => handleResolveIssue(issue.id, 'deferred')}
                        className="inline-flex min-h-[48px] items-center gap-1.5 rounded-xl border-2 border-[var(--fm-ink)] bg-[var(--fm-paper)] px-3.5 text-sm font-bold text-[var(--fm-ink)]"
                      >
                        <span>พักไว้ก่อน</span>
                      </button>
                      <button
                        type="button"
                        disabled={busyAction === issue.id}
                        onClick={() => handleResolveIssue(issue.id, 'rejected')}
                        className="inline-flex min-h-[48px] items-center gap-1.5 rounded-xl border-2 border-[var(--fm-ink)] bg-[var(--fm-coral-soft)] px-3.5 text-sm font-extrabold text-[var(--fm-coral)]"
                      >
                        <XCircle className="h-4 w-4" aria-hidden="true" />
                        <span>ปฏิเสธ</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      ) : activeSection === 'locations' ? (
        <section className="space-y-6">
          <div className="fm-panel p-6">
            <h2 className="font-display text-xl font-extrabold text-[var(--fm-ink)]">
              พิกัดอ้างอิงรอยืนยัน (จากจุดพันธกิจทีม G)
            </h2>
            <p className="mt-1 text-sm text-[var(--fm-ink-muted)]">
              ระบบจับคู่ชื่อเบื้องต้นให้เท่านั้น ต้องให้ผู้รับผิดชอบกดยืนยันก่อนนำไปปักหมุดจริง
            </p>
            {pendingLocationMatches.length === 0 ? (
              <p className="py-6 text-base font-bold text-[var(--fm-ink-muted)]">
                ไม่มีพิกัดอ้างอิงที่รอยืนยัน
              </p>
            ) : (
              <div className="mt-4 divide-y-2 divide-[var(--fm-ink)]/15">
                {pendingLocationMatches.map((m) => (
                  <div
                    key={m.id}
                    className="flex flex-col justify-between gap-3 py-3.5 sm:flex-row sm:items-center"
                  >
                    <div>
                      <div className="flex items-center gap-2 font-bold text-[var(--fm-ink)]">
                        <MapPin className="h-4 w-4 text-[var(--fm-violet)]" aria-hidden="true" />
                        <span>
                          จุดอ้างอิง G#{m.candidateNo}: {m.candidateName}
                        </span>
                      </div>
                      <p className="mt-0.5 font-mono text-sm text-[var(--fm-ink-muted)]">
                        {m.latitude.toFixed(6)}, {m.longitude.toFixed(6)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busyAction === m.id}
                        onClick={() => handleReviewLocation(m.id, 'confirmed')}
                        className="min-h-[48px] rounded-xl border-2 border-[var(--fm-ink)] bg-[var(--fm-lime)] px-4 text-sm font-extrabold text-[var(--fm-ink)]"
                      >
                        ยืนยันพิกัดนี้
                      </button>
                      <button
                        type="button"
                        disabled={busyAction === m.id}
                        onClick={() => handleReviewLocation(m.id, 'rejected')}
                        className="min-h-[48px] rounded-xl border-2 border-[var(--fm-ink)] bg-[var(--fm-paper)] px-4 text-sm font-bold text-[var(--fm-coral)]"
                      >
                        ไม่ใช่จุดนี้
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="fm-panel p-6">
            <h2 className="font-display text-xl font-extrabold text-[var(--fm-ink)]">
              กลุ่มที่ยังไม่มีพิกัด GPS ({overview?.unlocatedGroups.length ?? 0})
            </h2>
            {(overview?.unlocatedGroups.length ?? 0) === 0 ? (
              <p className="py-6 text-base font-bold text-[var(--fm-ink-muted)]">
                ทุกกลุ่มที่มองเห็นมีพิกัดครบแล้ว
              </p>
            ) : (
              <div className="mt-4 divide-y-2 divide-[var(--fm-ink)]/15">
                {overview!.unlocatedGroups.map((g) => (
                  <div
                    key={g.id}
                    className="flex flex-col justify-between gap-2 py-3 sm:flex-row sm:items-center"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-sm font-extrabold">
                        <span className="font-mono text-[var(--fm-violet)]">{g.groupCode}</span>
                        <span className="text-[var(--fm-ink)]">{g.nameTh}</span>
                        <span className="text-[var(--fm-ink-muted)]">อ.{g.district}</span>
                      </div>
                      <p className="mt-0.5 text-sm text-[var(--fm-ink-secondary)]">
                        {g.addressSummary || 'ยังไม่ระบุสถานที่นัดหมาย'}
                      </p>
                    </div>
                    <span className="fm-sticker w-fit bg-[var(--fm-amber-soft)] text-[var(--fm-ink)]">
                      รอพิกัด GPS
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : activeSection === 'mappings' ? (
        <section className="space-y-6">
          <div className="fm-panel p-6">
            <h2 className="font-display text-xl font-extrabold text-[var(--fm-ink)]">
              กลุ่มรอจัดสรรบอดี้ ({overview?.unassignedBodyGroups.length ?? 0})
            </h2>
            {(overview?.unassignedBodyGroups.length ?? 0) === 0 ? (
              <p className="py-4 text-base font-bold text-[var(--fm-ink-muted)]">
                ไม่มีกลุ่มที่รอจัดสรรบอดี้
              </p>
            ) : (
              <div className="mt-4 divide-y-2 divide-[var(--fm-ink)]/15">
                {overview!.unassignedBodyGroups.map((g) => (
                  <div
                    key={g.id}
                    className="flex flex-col justify-between gap-3 py-3 sm:flex-row sm:items-center"
                  >
                    <div>
                      <span className="font-mono text-xs font-extrabold text-[var(--fm-violet)]">
                        {g.groupCode} {g.careCodeRaw ? `(${g.careCodeRaw})` : ''}
                      </span>
                      <p className="font-display text-lg font-extrabold text-[var(--fm-ink)]">
                        {g.nameTh} (อ.{g.district})
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        aria-label={`เลือกบอดี้สำหรับ ${g.nameTh}`}
                        value={groupBodySelection[g.id] ?? ''}
                        onChange={(e) =>
                          setGroupBodySelection((prev) => ({ ...prev, [g.id]: e.target.value }))
                        }
                        className="min-h-[48px] w-full min-w-0 max-w-full rounded-xl border-2 border-[var(--fm-ink)] bg-[var(--fm-canvas)] px-3 text-sm font-bold text-[var(--fm-ink)] sm:w-auto"
                      >
                        <option value="">-- เลือกบอดี้ --</option>
                        {(overview?.bodies ?? []).map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.nameTh} ({b.code})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!groupBodySelection[g.id] || busyAction === `assign-${g.id}`}
                        onClick={async () => {
                          const bodyId = groupBodySelection[g.id];
                          if (!bodyId) return;
                          const res = await postIngestion(
                            { action: 'assign_group_body', groupId: g.id, bodyId },
                            `assign-${g.id}`
                          );
                          if (res?.group) {
                            setStatusMsg(`จัดสรรบอดี้ให้กลุ่ม ${g.nameTh} เรียบร้อย`);
                            await loadOverview();
                            await onRefreshWorkspace();
                          }
                        }}
                        className="min-h-[48px] rounded-xl border-2 border-[var(--fm-ink)] bg-[var(--fm-lime)] px-4 text-sm font-extrabold text-[var(--fm-ink)]"
                      >
                        บันทึกบอดี้
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="fm-panel min-w-0 overflow-hidden p-6">
              <h2 className="font-display text-xl font-extrabold text-[var(--fm-ink)]">
                จับคู่ชื่ออำเภอมาตรฐาน
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  type="text"
                  value={districtRawInput}
                  onChange={(e) => setDistrictRawInput(e.target.value)}
                  placeholder="ชื่อดิบ เช่น สหสขันธุ์"
                  className="min-h-[48px] w-full min-w-0 max-w-full flex-1 rounded-xl border-2 border-[var(--fm-ink)] bg-[var(--fm-canvas)] px-3 text-sm font-bold sm:w-auto"
                />
                <input
                  type="text"
                  value={districtCanonInput}
                  onChange={(e) => setDistrictCanonInput(e.target.value)}
                  placeholder="ชื่อมาตรฐาน เช่น สหัสขันธ์"
                  className="min-h-[48px] w-full min-w-0 max-w-full flex-1 rounded-xl border-2 border-[var(--fm-ink)] bg-[var(--fm-canvas)] px-3 text-sm font-bold sm:w-auto"
                />
                <button
                  type="button"
                  disabled={!districtRawInput.trim() || !districtCanonInput.trim()}
                  onClick={async () => {
                    const res = await postIngestion(
                      {
                        action: 'save_district_mapping',
                        districtRaw: districtRawInput,
                        districtCanonical: districtCanonInput,
                      },
                      'save-dist'
                    );
                    if (res?.mapping) {
                      setDistrictRawInput('');
                      setDistrictCanonInput('');
                      setStatusMsg('บันทึก Mapping อำเภอเรียบร้อย');
                      await loadOverview();
                    }
                  }}
                  className="min-h-[48px] rounded-xl border-2 border-[var(--fm-ink)] bg-[var(--fm-lime)] px-4 text-sm font-extrabold"
                >
                  บันทึก
                </button>
              </div>
              <ul className="mt-4 space-y-1.5 text-sm font-bold text-[var(--fm-ink)]">
                {(overview?.districtMappings ?? []).map((m) => (
                  <li key={m.id}>
                    {m.districtRaw} = {m.districtCanonical}
                  </li>
                ))}
              </ul>
            </div>

            <div className="fm-panel p-6">
              <h2 className="font-display text-xl font-extrabold text-[var(--fm-ink)]">
                จับคู่รหัสแคร์ (G*) เข้าบอดี้
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  type="text"
                  value={careCodeInput}
                  onChange={(e) => setCareCodeInput(e.target.value)}
                  placeholder="รหัสแคร์ เช่น G2"
                  className="min-h-[48px] w-32 rounded-xl border-2 border-[var(--fm-ink)] bg-[var(--fm-canvas)] px-3 text-sm font-bold"
                />
                <select
                  aria-label="เลือกบอดี้สำหรับรหัสแคร์"
                  value={careBodyIdInput}
                  onChange={(e) => setCareBodyIdInput(e.target.value)}
                  className="min-h-[48px] w-full min-w-0 max-w-full flex-1 rounded-xl border-2 border-[var(--fm-ink)] bg-[var(--fm-canvas)] px-3 text-sm font-bold sm:w-auto"
                >
                  <option value="">-- เลือกบอดี้ --</option>
                  {(overview?.bodies ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nameTh} ({b.code})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!careCodeInput.trim() || !careBodyIdInput}
                  onClick={async () => {
                    const res = await postIngestion(
                      {
                        action: 'save_care_body_mapping',
                        careCodeRaw: careCodeInput,
                        bodyId: careBodyIdInput,
                      },
                      'save-care'
                    );
                    if (res?.mapping) {
                      setCareCodeInput('');
                      setCareBodyIdInput('');
                      setStatusMsg('บันทึก Mapping รหัสแคร์เรียบร้อย');
                      await loadOverview();
                    }
                  }}
                  className="min-h-[48px] rounded-xl border-2 border-[var(--fm-ink)] bg-[var(--fm-lime)] px-4 text-sm font-extrabold"
                >
                  บันทึก
                </button>
              </div>
              <ul className="mt-4 space-y-1.5 text-sm font-bold text-[var(--fm-ink)]">
                {(overview?.careMappings ?? []).map((m) => (
                  <li key={m.id}>
                    {m.careCodeRaw} เข้าบอดี้{' '}
                    {overview?.bodies.find((b) => b.id === m.bodyId)?.nameTh ?? m.bodyId}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="fm-panel p-6">
            <h2 className="font-display text-xl font-extrabold text-[var(--fm-ink)]">
              ผูกบัญชีผู้ดูแลที่ยังไม่มี User ({overview?.unlinkedStewards.length ?? 0})
            </h2>
            <p className="mt-1 text-sm text-[var(--fm-ink-muted)]">
              ผู้ดูแลที่นำเข้าจากรายชื่อจริงสามารถมีบทบาทได้ก่อนมีบัญชีผู้ใช้ และผูกกับ User เมื่อพร้อมเข้าสู่ระบบ
            </p>
            {(overview?.unlinkedStewards.length ?? 0) === 0 ? (
              <p className="py-6 text-base font-bold text-[var(--fm-ink-muted)]">
                ผู้ดูแลทั้งหมดถูกผูกบัญชีผู้ใช้เรียบร้อยแล้ว
              </p>
            ) : (
              <div className="mt-4 divide-y-2 divide-[var(--fm-ink)]/15">
                {overview!.unlinkedStewards.map((st) => (
                  <div
                    key={st.id}
                    className="flex flex-col justify-between gap-3 py-3 sm:flex-row sm:items-center"
                  >
                    <div>
                      <p className="font-bold text-[var(--fm-ink)]">
                        {st.stewardDisplayName ?? 'ไม่ระบุชื่อผู้ดูแล'}
                      </p>
                      <p className="text-sm font-bold text-[var(--fm-ink-muted)]">
                        บทบาท: {st.roleType} — สถานะ: {LINK_STATUS_LABEL[st.linkStatus] ?? st.linkStatus}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        aria-label={`เลือกผู้ใช้สำหรับ ${st.stewardDisplayName ?? st.id}`}
                        value={stewardUserSelection[st.id] ?? ''}
                        onChange={(e) =>
                          setStewardUserSelection((prev) => ({
                            ...prev,
                            [st.id]: e.target.value,
                          }))
                        }
                        className="min-h-[48px] w-full min-w-0 max-w-full rounded-xl border-2 border-[var(--fm-ink)] bg-[var(--fm-canvas)] px-3 text-sm font-bold text-[var(--fm-ink)] sm:w-auto"
                      >
                        <option value="">-- เลือกบัญชีผู้ใช้ --</option>
                        {(overview?.linkableUsers ?? []).map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.displayName} (@{u.username})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!stewardUserSelection[st.id] || busyAction === `link-${st.id}`}
                        onClick={async () => {
                          const userId = stewardUserSelection[st.id];
                          if (!userId) return;
                          const res = await postIngestion(
                            { action: 'link_steward_user', assignmentId: st.id, userId },
                            `link-${st.id}`
                          );
                          if (res?.assignment) {
                            setStatusMsg('ผูกบัญชีผู้ดูแลเรียบร้อย');
                            await loadOverview();
                            await onRefreshWorkspace();
                          }
                        }}
                        className="min-h-[48px] rounded-xl border-2 border-[var(--fm-ink)] bg-[var(--fm-lime)] px-4 text-sm font-extrabold text-[var(--fm-ink)]"
                      >
                        ผูกบัญชี
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="space-y-6">
          <div className="fm-panel min-w-0 overflow-hidden p-6">
            <h2 className="font-display text-xl font-extrabold text-[var(--fm-ink)]">
              นำเข้าข้อมูลกลุ่มและสมาชิก
            </h2>
            <p className="mt-1 text-sm text-[var(--fm-ink-muted)]">
              วางข้อมูลชุดนำเข้า (JSON) เพื่อตรวจความถูกต้องก่อนบันทึกเข้าคิวตรวจสอบ
            </p>
            <textarea
              rows={6}
              value={rawJsonText}
              onChange={(e) => setRawJsonText(e.target.value)}
              placeholder='{"sourceArchiveName": "kalasin-pack.json", "groups": [...], "members": [...]}'
              className="mt-3 w-full max-w-full min-w-0 rounded-xl border-2 border-[var(--fm-ink)] bg-[var(--fm-canvas)] p-3 font-mono text-sm text-[var(--fm-ink)]"
            />
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={!rawJsonText.trim() || busyAction === 'preview'}
                onClick={handlePreview}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border-2 border-[var(--fm-ink)] bg-[var(--fm-paper)] px-4 text-base font-extrabold text-[var(--fm-ink)]"
              >
                <FileCheck2 className="h-5 w-5" aria-hidden="true" />
                <span>ตรวจข้อมูลเบื้องต้น</span>
              </button>
              <button
                type="button"
                disabled={!rawJsonText.trim() || busyAction === 'stage'}
                onClick={handleStage}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border-2 border-[var(--fm-ink)] bg-[var(--fm-lime)] px-4 text-base font-extrabold text-[var(--fm-ink)]"
              >
                <Upload className="h-5 w-5" aria-hidden="true" />
                <span>ส่งเข้าคิวตรวจสอบ</span>
              </button>
            </div>

            {preview && (
              <div className="mt-4 rounded-xl border-2 border-[var(--fm-ink)] bg-[var(--fm-amber-soft)] p-4">
                <div className="flex items-center gap-2 font-display text-lg font-extrabold text-[var(--fm-ink)]">
                  <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                  <span>ผลตรวจสอบตัวอย่าง: {preview.sourceArchiveName}</span>
                </div>
                <ul className="mt-2 grid gap-1.5 text-sm font-bold text-[var(--fm-ink)] sm:grid-cols-2">
                  <li>กลุ่มทั้งหมด: {preview.totalGroups}</li>
                  <li>แถวสมาชิก: {preview.totalMemberRows}</li>
                  <li>สมาชิกไม่มีชื่อจริง: {preview.missingFullNameCount}</li>
                  <li>ยอดทะเบียนไม่ตรงแถว: {preview.countMismatchGroups}</li>
                  <li>ยอดทะเบียนไม่ใช่ตัวเลข: {preview.nonNumericTotalGroups}</li>
                  <li>รายชื่ออาจซ้ำข้ามกลุ่ม: {preview.crossGroupDuplicateKeys} คีย์</li>
                </ul>
              </div>
            )}
          </div>

          <div className="fm-panel min-w-0 overflow-hidden p-6">
            <h2 className="font-display text-xl font-extrabold text-[var(--fm-ink)]">
              ประวัติชุดข้อมูลนำเข้า ({overview?.batches.length ?? 0})
            </h2>
            {(overview?.batches.length ?? 0) === 0 ? (
              <p className="py-6 text-base font-bold text-[var(--fm-ink-muted)]">
                ยังไม่มีชุดข้อมูลนำเข้าในระบบ
              </p>
            ) : (
              <div className="mt-4 divide-y-2 divide-[var(--fm-ink)]/15">
                {overview!.batches.map((b) => (
                  <div
                    key={b.id}
                    className="flex flex-col justify-between gap-3 py-3.5 sm:flex-row sm:items-center"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <Database className="h-4 w-4 text-[var(--fm-violet)]" aria-hidden="true" />
                        <span className="font-mono text-sm font-extrabold text-[var(--fm-ink)]">
                          {b.batchCode}
                        </span>
                        <span className="rounded-md border border-[var(--fm-ink)] bg-[var(--fm-canvas)] px-2 py-0.5 text-xs font-bold">
                          {BATCH_STATUS_LABEL[b.status] ?? b.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-[var(--fm-ink-secondary)]">
                        {b.sourceArchiveName}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(b.status === 'staged' || b.status === 'review_in_progress') && (
                        <button
                          type="button"
                          disabled={busyAction === `promote-${b.id}`}
                          onClick={() => handlePromote(b.id)}
                          className="min-h-[48px] rounded-xl border-2 border-[var(--fm-ink)] bg-[var(--fm-lime)] px-4 text-sm font-extrabold text-[var(--fm-ink)]"
                        >
                          อนุมัติเข้าทะเบียนจริง
                        </button>
                      )}
                      {b.status !== 'rolled_back' && (
                        <button
                          type="button"
                          disabled={busyAction === `rollback-${b.id}`}
                          onClick={() => handleRollback(b.id)}
                          className="inline-flex min-h-[48px] items-center gap-1.5 rounded-xl border-2 border-[var(--fm-ink)] bg-[var(--fm-paper)] px-3.5 text-sm font-bold text-[var(--fm-coral)]"
                        >
                          <RotateCcw className="h-4 w-4" aria-hidden="true" />
                          <span>ยกเลิกชุดข้อมูลนี้</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
