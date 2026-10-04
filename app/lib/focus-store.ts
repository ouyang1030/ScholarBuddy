import { bridgeFetch } from "./bridge-client";

export type FocusSegment = {
  segmentId: string;
  revision: number;
  startedAt: string;
  endedAt: string;
  status: "running" | "saved" | "gap" | "confirmed" | "dismissed";
  limitAt?: number;
  bridgeId: string;
  syncedRevision?: number;
  rejectedRevision?: number;
};
const DB = "workbuddy-focus-history-v1";
let dbPromise: Promise<IDBDatabase> | undefined;
let syncing: Promise<void> | undefined;
let boundBridge = "";
let storageError = "";
export function focusStorageError() {
  return storageError;
}
export function focusBridgeId() {
  return boundBridge;
}
function notify() {
  window.dispatchEvent(new Event("workbuddy-focus-ledger"));
}
function database() {
  if (!dbPromise)
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("segments", { keyPath: "segmentId" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  return dbPromise;
}
export async function readFocusSegments(): Promise<FocusSegment[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction("segments").objectStore("segments").getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function saveFocusSegment(segment: FocusSegment, sync = true) {
  try {
    const db = await database();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("segments", "readwrite");
      const store = transaction.objectStore("segments");
      const request = store.get(segment.segmentId);
      request.onsuccess = () => {
        const old = request.result as FocusSegment | undefined;
        if (!old || old.revision <= segment.revision) store.put({ ...old, ...segment });
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    storageError = "";
    notify();
    if (sync) void syncFocus();
  } catch {
    storageError =
      "Focus history could not be saved in this browser. Keep this page open and retry.";
    notify();
  }
}
export async function syncFocus(bindLocal = false) {
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      const response = await bridgeFetch("/profile/identity");
      if (!response.ok) return;
      const profile = await response.json();
      boundBridge = profile.bridgeId;
      window.localStorage.setItem("workbuddy-focus-bridge-id", boundBridge);
      const segments = await readFocusSegments();
      const pending = segments.filter(
        (s) =>
          (s.bridgeId === boundBridge || (!s.bridgeId && bindLocal)) &&
          s.syncedRevision !== s.revision &&
          s.rejectedRevision !== s.revision,
      );
      for (let i = 0; i < pending.length; i += 200) {
        const events = pending.slice(i, i + 200).map((s) => ({ ...s, bridgeId: boundBridge }));
        const result = await bridgeFetch("/profile/focus/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bridgeId: boundBridge, events }),
        });
        if (!result.ok) return;
        const confirmation = (await result.json()) as {
          accepted?: { segmentId: string; revision: number }[];
          rejected?: { segmentId: string; revision: number }[];
        };
        const listed = (list: typeof confirmation.accepted, segment: FocusSegment) =>
          list?.some(
            (item) => item.segmentId === segment.segmentId && item.revision === segment.revision,
          );
        for (const segment of events) {
          if (listed(confirmation.accepted, segment))
            await saveFocusSegment({ ...segment, syncedRevision: segment.revision }, false);
          // A record the Bridge refuses stays local instead of blocking the outbox.
          else if (listed(confirmation.rejected, segment))
            await saveFocusSegment({ ...segment, rejectedRevision: segment.revision }, false);
        }
      }
      if (pending.length) window.dispatchEvent(new Event("workbuddy-profile-refresh"));
    } catch {
      /* The durable outbox remains available while the Bridge is offline. */
    }
  })().finally(() => {
    syncing = undefined;
  });
  return syncing;
}
export function initializeFocusSync() {
  boundBridge = window.localStorage.getItem("workbuddy-focus-bridge-id") || "";
  void syncFocus();
  const retry = () => {
    void syncFocus();
  };
  window.addEventListener("online", retry);
  window.addEventListener("focus", retry);
  const timer = window.setInterval(retry, 30000);
  return () => {
    clearInterval(timer);
    window.removeEventListener("online", retry);
    window.removeEventListener("focus", retry);
  };
}

// Missing time is durable too, but is excluded until the user confirms it.
export async function saveFocusGap(segment: FocusSegment, until = Date.now()) {
  let start = Date.parse(segment.endedAt);
  const end = Math.min(until, segment.limitAt ?? Infinity);
  let index = 0;
  while (end - start > 1000) {
    const boundary = Math.min(end, start + 7 * 86400000);
    await saveFocusSegment({
      segmentId: `${segment.segmentId}-gap-${index++}`,
      revision: 1,
      startedAt: new Date(start).toISOString(),
      endedAt: new Date(boundary).toISOString(),
      status: "gap",
      bridgeId: segment.bridgeId,
    });
    start = boundary;
  }
}
