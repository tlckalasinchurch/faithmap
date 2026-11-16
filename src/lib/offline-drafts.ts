export interface OfflineDraftRecord {
  key: string;
  periodId: string;
  groupId: string;
  payload: Record<string, unknown>;
  savedAt: string;
  synced: boolean;
}

const DB_NAME = 'faithmap_offline_v1';
const STORE_NAME = 'report_drafts';
const LS_PREFIX = 'faithmap_offline_draft:';

function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function buildDraftKey(periodId: string, groupId: string): string {
  return `${periodId}:${groupId}`;
}

export async function saveOfflineDraft(record: OfflineDraftRecord): Promise<void> {
  try {
    localStorage.setItem(`${LS_PREFIX}${record.key}`, JSON.stringify(record));
  } catch {
    // ignore storage quota
  }
  try {
    const db = await openOfflineDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // IndexedDB unavailable in SSR or restricted mode; localStorage backup remains
  }
}

export async function loadOfflineDraft(
  periodId: string,
  groupId: string
): Promise<OfflineDraftRecord | null> {
  const key = buildDraftKey(periodId, groupId);
  try {
    const db = await openOfflineDb();
    const row = await new Promise<OfflineDraftRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result as OfflineDraftRecord | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (row) return row;
  } catch {
    // fallback to localStorage
  }

  try {
    const raw = localStorage.getItem(`${LS_PREFIX}${key}`);
    return raw ? (JSON.parse(raw) as OfflineDraftRecord) : null;
  } catch {
    return null;
  }
}

export async function clearOfflineDraft(periodId: string, groupId: string): Promise<void> {
  const key = buildDraftKey(periodId, groupId);
  try {
    localStorage.removeItem(`${LS_PREFIX}${key}`);
  } catch {
    // ignore
  }
  try {
    const db = await openOfflineDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
}

export type AttendanceStatusValue = 'present' | 'absent' | 'leave' | 'online';

export interface OfflineDraftContentState {
  teachingTopic: string;
  scriptureRef: string;
  actPrayer: boolean;
  actFellowship: boolean;
  actOther: string;
  locationText: string;
  atmosphereNotes: string;
  followupNeedsText: string;
  nextWeekPlan: string;
  supportNeededText: string;
}

export interface HydratedOfflineDraftState {
  meetingHeld: boolean;
  notHeldReason: string;
  meetingDate: string;
  totalAttendees: number;
  memberAttendees: number;
  newVisitorsCount: number;
  returningVisitorsCount: number;
  childrenCount: number;
  offeringAmountThb: string;
  summaryNotes: string;
  prayerRequests: string;
  careNeedsNotes: string;
  content: OfflineDraftContentState;
  attendanceMap: Record<string, AttendanceStatusValue>;
  expectedVersion?: number;
}

const VALID_ATTENDANCE_STATUSES = new Set<string>(['present', 'absent', 'leave', 'online']);

function toSafeNonNegInt(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value);
  }
  return fallback;
}

/**
 * Acceptance Defect #2: Restores all saved fields of an offline weekly report draft
 * (including attendance marks such as 'online' and 'leave', counters, offering, and FR-07.2 content).
 */
export function extractOfflineDraftState(
  payload: Record<string, unknown>,
  currentMemberIds: string[],
  fallbackStartDate: string,
  baseAttendanceMap?: Record<string, AttendanceStatusValue>
): HydratedOfflineDraftState {
  const meetingHeld = typeof payload.meetingHeld === 'boolean' ? payload.meetingHeld : true;
  const notHeldReason = typeof payload.notHeldReason === 'string' ? payload.notHeldReason : '';
  const meetingDate =
    typeof payload.meetingDate === 'string' && payload.meetingDate.trim()
      ? payload.meetingDate
      : fallbackStartDate;

  const newVisitorsCount = meetingHeld ? toSafeNonNegInt(payload.newVisitorsCount, 0) : 0;
  const returningVisitorsCount = meetingHeld ? toSafeNonNegInt(payload.returningVisitorsCount, 0) : 0;
  const childrenCount = meetingHeld ? toSafeNonNegInt(payload.childrenCount, 0) : 0;

  let offeringAmountThb = '0';
  if (meetingHeld) {
    if (typeof payload.offeringAmountThb === 'number' && Number.isFinite(payload.offeringAmountThb)) {
      offeringAmountThb = String(payload.offeringAmountThb);
    } else if (typeof payload.offeringAmountThb === 'string') {
      offeringAmountThb = payload.offeringAmountThb;
    }
  }

  const activitiesObj =
    payload.activities && typeof payload.activities === 'object'
      ? (payload.activities as Record<string, unknown>)
      : {};

  const content: OfflineDraftContentState = {
    teachingTopic: typeof payload.teachingTopic === 'string' ? payload.teachingTopic : '',
    scriptureRef: typeof payload.scriptureRef === 'string' ? payload.scriptureRef : '',
    actPrayer: Boolean(activitiesObj.prayer),
    actFellowship: Boolean(activitiesObj.fellowship),
    actOther: typeof activitiesObj.other === 'string' ? activitiesObj.other : '',
    locationText: typeof payload.locationText === 'string' ? payload.locationText : '',
    atmosphereNotes: typeof payload.atmosphereNotes === 'string' ? payload.atmosphereNotes : '',
    followupNeedsText:
      typeof payload.followupNeedsText === 'string' ? payload.followupNeedsText : '',
    nextWeekPlan: typeof payload.nextWeekPlan === 'string' ? payload.nextWeekPlan : '',
    supportNeededText:
      typeof payload.supportNeededText === 'string' ? payload.supportNeededText : '',
  };

  const activeIds = new Set(currentMemberIds);
  const attendanceMap: Record<string, AttendanceStatusValue> = {};
  for (const id of currentMemberIds) {
    attendanceMap[id] = baseAttendanceMap?.[id] ?? 'present';
  }

  if (Array.isArray(payload.attendance)) {
    for (const item of payload.attendance) {
      if (!item || typeof item !== 'object') continue;
      const entry = item as Record<string, unknown>;
      const memberId = entry.memberId;
      const status = entry.attendanceStatus;
      if (
        typeof memberId === 'string' &&
        activeIds.has(memberId) &&
        typeof status === 'string' &&
        VALID_ATTENDANCE_STATUSES.has(status)
      ) {
        attendanceMap[memberId] = status as AttendanceStatusValue;
      }
    }
  }

  const memberAttendees = !meetingHeld
    ? 0
    : currentMemberIds.length > 0
      ? Object.values(attendanceMap).filter((s) => s === 'present' || s === 'online').length
      : toSafeNonNegInt(payload.memberAttendees, 0);

  const totalAttendees = !meetingHeld
    ? 0
    : typeof payload.totalAttendees === 'number' &&
        Number.isFinite(payload.totalAttendees) &&
        payload.totalAttendees >= 0
      ? Math.trunc(payload.totalAttendees)
      : memberAttendees + newVisitorsCount + returningVisitorsCount;

  const expectedVersion =
    typeof payload.expectedVersion === 'number' && Number.isInteger(payload.expectedVersion)
      ? payload.expectedVersion
      : undefined;

  return {
    meetingHeld,
    notHeldReason,
    meetingDate,
    totalAttendees,
    memberAttendees,
    newVisitorsCount,
    returningVisitorsCount,
    childrenCount,
    offeringAmountThb,
    summaryNotes: typeof payload.summaryNotes === 'string' ? payload.summaryNotes : '',
    prayerRequests: typeof payload.prayerRequests === 'string' ? payload.prayerRequests : '',
    careNeedsNotes: typeof payload.careNeedsNotes === 'string' ? payload.careNeedsNotes : '',
    content,
    attendanceMap,
    expectedVersion,
  };
}

