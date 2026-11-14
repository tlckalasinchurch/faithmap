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
