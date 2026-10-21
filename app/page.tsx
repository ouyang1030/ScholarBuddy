"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bridgeFetch, bridgeHealthFetch, exchangeBridgePairingCode } from "./lib/bridge-client";
import { compareRecords } from "../shared/records.mjs";
import {
  emptyState,
  isOpen,
  navItems,
  quickActions,
  submissionAlertKey,
  submissionAlerts,
} from "./lib/workbench";
import type { SubmissionAlert } from "./lib/workbench";
import type {
  Action,
  BridgeIssue,
  BridgeStatus,
  CollectionKey,
  InvalidRecord,
  ModuleKey,
  RecordItem,
  SubmissionSyncResult,
  WorkbenchState,
} from "./types";
import { PaperCelebration, type PaperMilestone } from "./components/Celebrations";
import { confirmDiscard, SourceDot } from "./components/primitives";
import { LanguageSwitch } from "./components/LanguageSwitch";
import { bridgeFailure, failureText, useT } from "./i18n";
import { useOverlayFocus } from "./components/useOverlayFocus";
import { RecordEditor, type EditorState } from "./components/drawers/RecordEditor";
import { ActionDrawer } from "./components/drawers/ActionDrawer";
import { ReminderDetails, type ReminderLink } from "./components/drawers/ReminderDetails";
import { ConnectionsDrawer } from "./components/drawers/ConnectionsDrawer";
import { ContextDrawer } from "./components/drawers/ContextDrawer";
import { GuideDrawer } from "./components/drawers/GuideDrawer";
import { ProfileModule } from "./components/modules/ProfileModule";
import { FocusProvider } from "./components/panels/FocusPanel";
import { Dashboard } from "./components/modules/Dashboard";
import { LibraryModule } from "./components/modules/LibraryModule";
import { LandingModule } from "./components/modules/LandingModule";
import { ManuscriptModule } from "./components/modules/ManuscriptModule";
import { OperationsModule } from "./components/modules/OperationsModule";
import { ProjectsModule } from "./components/modules/ProjectsModule";
import type { DataProps } from "./lib/workbench";

const READ_SUBMISSION_ALERTS_KEY = "scholarbuddy-read-submission-alerts-v1";

function storedReadSubmissionAlertKeys() {
  if (typeof window === "undefined") return [];
  try {
    const stored = JSON.parse(window.localStorage.getItem(READ_SUBMISSION_ALERTS_KEY) || "[]");
    return Array.isArray(stored)
      ? stored.filter((item): item is string => typeof item === "string").slice(-300)
      : [];
  } catch {
    return [];
  }
}

function storeReadSubmissionAlertKeys(keys: string[]) {
  try {
    window.localStorage.setItem(READ_SUBMISSION_ALERTS_KEY, JSON.stringify(keys));
  } catch {
    // The in-memory read state still gives immediate feedback when storage is unavailable.
  }
}

export default function Home() {
  return (
    <FocusProvider>
      <Workbench />
    </FocusProvider>
  );
}

function Workbench() {
  const [active, setActive] = useState<ModuleKey>("dashboard");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("view") === "profile") {
      const timer = window.setTimeout(() => setActive("profile"), 0);
      return () => window.clearTimeout(timer);
    }
  }, []);
  const [state, setState] = useState<WorkbenchState>(emptyState);
  const [invalidRecords, setInvalidRecords] = useState<InvalidRecord[]>([]);
  const [loading, setLoading] = useState(true);
  // Whether the vault's records have been read at least once; until then an empty
  // collection means "not known yet", not "none".
  const [stateLoaded, setStateLoaded] = useState(false);
  const t = useT();
  // For the few handlers registered once at mount: they must speak the language
  // the page is in when they fire, not the one it was in when they were set up.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const [dataError, setDataError] = useState<unknown>(null);
  const bridgeIssueRef = useRef<BridgeIssue>(null);
  const offlineTicksRef = useRef(0);
  const [editor, setEditor] = useState<EditorState>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [bridgeIssue, setBridgeIssue] = useState<BridgeIssue>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [reminderLinks, setReminderLinks] = useState<ReminderLink[]>([]);
  const [guideOpen, setGuideOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const [paperContextId, setPaperContextId] = useState("");
  const [manuscriptInitialView, setManuscriptInitialView] = useState<"develop" | "submission">(
    "develop",
  );
  const [readSubmissionAlertKeys, setReadSubmissionAlertKeys] = useState<string[]>(
    storedReadSubmissionAlertKeys,
  );
  const [paperCelebration, setPaperCelebration] = useState<PaperMilestone | null>(null);
  const paperCelebrationTimerRef = useRef<number | null>(null);
  const stateRequestRef = useRef<AbortController | null>(null);
  const recordMutationsRef = useRef(0);
  // Esc is handled here for every overlay at once, so the two drawers that can
  // hold unsaved work report it and the handler knows which one Esc was aimed at.
  const unsavedRef = useRef({ editor: false, action: false });
  const topOverlayRef = useRef("");
  const reportEditorUnsaved = useCallback((unsaved: boolean) => {
    unsavedRef.current.editor = unsaved;
  }, []);
  const reportActionUnsaved = useCallback((unsaved: boolean) => {
    unsavedRef.current.action = unsaved;
  }, []);
  const loadState = async () => {
    if (recordMutationsRef.current > 0) return;
    stateRequestRef.current?.abort();
    const controller = new AbortController();
    stateRequestRef.current = controller;
    setLoading(true);
    setDataError(null);
    try {
      const response = await bridgeFetch(`/workbench/state`, { signal: controller.signal });
      const body = await response.json();
      if (!response.ok) throw bridgeFailure(body, "");
      // Notes the Bridge could not load travel beside the collections, not in them.
      const { invalid, ...collections } = body as Partial<WorkbenchState> & {
        invalid?: InvalidRecord[];
      };
      const nextState = { ...emptyState, ...collections } as WorkbenchState;
      const activeAlertKeys = new Set(
        submissionAlerts(nextState).map((alert) => submissionAlertKey(alert)),
      );
      setState(nextState);
      setStateLoaded(true);
      setInvalidRecords(Array.isArray(invalid) ? invalid : []);
      setReadSubmissionAlertKeys((current) => {
        const next = current.filter((key) => activeAlertKeys.has(key));
        if (next.length === current.length) return current;
        storeReadSubmissionAlertKeys(next);
        return next;
      });
    } catch (e) {
      if (controller.signal.aborted) return;
      setDataError(e);
    } finally {
      if (stateRequestRef.current === controller) {
        stateRequestRef.current = null;
        setLoading(false);
      }
    }
  };
  const loadStatus = async (fresh = false): Promise<BridgeStatus | null> => {
    try {
      const health = await bridgeHealthFetch();
      if (!health.ok) {
        setStatus(null);
        bridgeIssueRef.current =
          health.status === 401 ? "pairing" : health.status === 403 ? "origin" : "error";
        setBridgeIssue(bridgeIssueRef.current);
        return null;
      }
      bridgeIssueRef.current = null;
      setBridgeIssue(null);
    } catch {
      setStatus(null);
      bridgeIssueRef.current = "unreachable";
      setBridgeIssue("unreachable");
      return null;
    }
    try {
      const response = await bridgeFetch(`/status${fresh ? "?fresh=1" : ""}`, {
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) {
        setStatus(null);
        setBridgeIssue("error");
        return null;
      }
      const body = (await response.json()) as BridgeStatus;
      setStatus(body);
      return body;
    } catch {
      setStatus(null);
      setBridgeIssue("error");
      return null;
    }
  };
  useEffect(() => {
    const syncReadAlerts = (event: StorageEvent) => {
      if (event.key === READ_SUBMISSION_ALERTS_KEY) {
        setReadSubmissionAlertKeys(storedReadSubmissionAlertKeys());
      }
    };
    window.addEventListener("storage", syncReadAlerts);
    return () => window.removeEventListener("storage", syncReadAlerts);
  }, []);
  useEffect(() => {
    const parameters = new URLSearchParams(window.location.hash.slice(1));
    const code = parameters.get("bridge-pair");
    if (!code) return;
    parameters.delete("bridge-pair");
    const remaining = parameters.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}${remaining ? `#${remaining}` : ""}`,
    );
    void exchangeBridgePairingCode(code)
      .then(async () => {
        const connected = await loadStatus();
        if (!connected) throw new Error("unverified");
        await loadState();
        setConnectionsOpen(false);
        setToast(tRef.current.shell.paired);
      })
      .catch(() => {
        setConnectionsOpen(true);
        setToast(tRef.current.shell.pairingFailed);
      });
  }, []);
  // Records change with every save, but /status probes each provider and spawns
  // osascript, so it polls far less often. While the Bridge is unreachable both
  // back off instead of firing 20-second timeouts every minute.
  useEffect(() => {
    const start = window.setTimeout(() => {
      void loadStatus();
      void loadState();
    }, 0);
    const stateTimer = window.setInterval(() => {
      if (bridgeIssueRef.current === "unreachable" && offlineTicksRef.current++ % 5 !== 0) return;
      void loadState();
    }, 60_000);
    const statusTimer = window.setInterval(() => {
      void loadStatus();
    }, 300_000);
    return () => {
      stateRequestRef.current?.abort();
      window.clearTimeout(start);
      window.clearInterval(stateTimer);
      window.clearInterval(statusTimer);
    };
  }, []);
  // The timer lives on Today, so starting focus from anywhere else goes there.
  const openFocus = () => {
    setActive("dashboard");
    window.setTimeout(
      () =>
        document
          .querySelector(".focus-session")
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      0,
    );
  };
  // A thought that has to wait for navigation is a thought that gets lost, so
  // capture is reachable from every module: switch to Today, then let the panel
  // take focus once React has committed the module change.
  const openCapture = (target: "journal" | "idea") => {
    setActive("dashboard");
    setCommandOpen(false);
    setMobileNav(false);
    window.setTimeout(
      () =>
        window.dispatchEvent(new CustomEvent("scholarbuddy-capture-focus", { detail: { target } })),
      0,
    );
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "j") {
        event.preventDefault();
        openCapture("journal");
      }
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "i") {
        event.preventDefault();
        openCapture("idea");
      }
      if (event.key === "Escape") {
        // Aimed at a drawer holding unsaved work, Esc asks first; aimed at
        // something stacked above one, it leaves that work where it is.
        const top = topOverlayRef.current;
        const unsaved = unsavedRef.current;
        if (top === "editor" && unsaved.editor && !confirmDiscard(tRef.current, "record")) return;
        if (top === "action" && unsaved.action && !confirmDiscard(tRef.current, "answer")) return;
        setCommandOpen(false);
        if (top === "editor" || !unsaved.editor) setEditor(null);
        if (top === "action" || !unsaved.action) setAction(null);
        setContextOpen(false);
        setConnectionsOpen(false);
        setGuideOpen(false);
        setReminderLinks([]);
        setPaperCelebration(null);
        if (paperCelebrationTimerRef.current) window.clearTimeout(paperCelebrationTimerRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(
    () => () => {
      if (paperCelebrationTimerRef.current) window.clearTimeout(paperCelebrationTimerRef.current);
    },
    [],
  );
  useEffect(() => {
    const requirePairing = () => setToast(t.shell.offline);
    window.addEventListener("scholarbuddy-pairing-required", requirePairing);
    return () => window.removeEventListener("scholarbuddy-pairing-required", requirePairing);
  }, [t]);
  // Overlays may stack (the AI drawer opens Connections without closing itself),
  // so the topmost one is chosen by stacking order and gets the ref.
  const overlayRef = useRef<HTMLElement | null>(null);
  const topOverlay = paperCelebration
    ? "celebration"
    : commandOpen
      ? "command"
      : reminderLinks.length
        ? "reminderDetails"
        : guideOpen
          ? "guide"
          : connectionsOpen
            ? "connections"
            : contextOpen
              ? "context"
              : action
                ? "action"
                : editor
                  ? "editor"
                  : "";
  useOverlayFocus(overlayRef, topOverlay);
  useEffect(() => {
    topOverlayRef.current = topOverlay;
  }, [topOverlay]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const kind = params.get("reminder");
    if (!kind) return;
    const timer = window.setTimeout(() => {
      try {
        const raw =
          kind === "summary"
            ? JSON.parse(params.get("items") || "[]")
            : [{ category: kind, id: params.get("id"), date: params.get("date") }];
        if (Array.isArray(raw))
          setReminderLinks(
            raw
              .filter(
                (item) =>
                  item &&
                  ["operations", "calendar"].includes(item.category) &&
                  typeof item.id === "string" &&
                  item.id.length < 500 &&
                  (item.category !== "calendar" || /^\d{4}-\d{2}-\d{2}$/.test(item.date || "")),
              )
              .slice(0, 100),
          );
      } catch {
        /* Ignore malformed navigation data. */
      }
      const url = new URL(window.location.href);
      url.hash = "";
      window.history.replaceState(null, "", url);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const link = reminderLinks.length === 1 ? reminderLinks[0] : null;
    if (loading || link?.category !== "operations") return;
    const record = state.operations.find((item) => item.id === link.id);
    if (!record) return;
    const timer = window.setTimeout(() => {
      setActive("operations");
      setEditor({ collection: "operations", record });
      setReminderLinks([]);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loading, reminderLinks, state.operations]);
  const showPaperCelebration = (
    paper: { id?: string; title?: string; journal?: string },
    milestone: "Accepted" | "Published",
  ) => {
    const id = String(paper.id || "").trim();
    const title = String(paper.title || t.shell.untitledPaper).trim();
    const journal = String(paper.journal || "").trim();
    if (!id) return;
    let celebrated: string[] = [];
    try {
      const stored = JSON.parse(
        window.localStorage.getItem("scholarbuddy-paper-celebrations-v1") || "[]",
      );
      if (Array.isArray(stored))
        celebrated = stored.filter((item): item is string => typeof item === "string");
    } catch {
      /* replace malformed local celebration history */
    }
    const key = `${id}:${milestone.toLowerCase()}`;
    if (celebrated.includes(key)) return;
    window.localStorage.setItem(
      "scholarbuddy-paper-celebrations-v1",
      JSON.stringify([...new Set([...celebrated, key])].slice(-300)),
    );
    if (paperCelebrationTimerRef.current) window.clearTimeout(paperCelebrationTimerRef.current);
    setPaperCelebration({ id, title, milestone, journal: journal || undefined });
    paperCelebrationTimerRef.current = window.setTimeout(() => setPaperCelebration(null), 10000);
  };
  const saveRecord = async (collection: CollectionKey, record: Partial<RecordItem>) => {
    recordMutationsRef.current += 1;
    stateRequestRef.current?.abort();
    const previous = record.id
      ? state[collection].find((item) => item.id === record.id)
      : undefined;
    try {
      const response = await bridgeFetch(`/workbench/record`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection, record }),
      });
      const body = await response.json();
      if (!response.ok) throw bridgeFailure(body, t.errors.saveFailed);
      const saved = body.record as RecordItem;
      setState((current) => {
        // Sorted the way the Bridge sorts it, so a saved record takes its place
        // now rather than jumping there on the next reload.
        const records = (
          current[collection].some((item) => item.id === saved.id)
            ? current[collection].map((item) => (item.id === saved.id ? saved : item))
            : [saved, ...current[collection]]
        ).sort((a, b) => compareRecords(collection, a, b));
        return {
          ...current,
          [collection]:
            collection === "projects" && saved.active
              ? records.map((item) => ({ ...item, active: item.id === saved.id }))
              : records,
        };
      });
      setToast(t.shell.savedRecord(t.collections[collection]));
      if (
        collection === "manuscripts" &&
        (saved.stage === "Accepted" || saved.stage === "Published") &&
        previous?.stage !== saved.stage
      )
        showPaperCelebration(saved, saved.stage);
      if (
        collection === "submission-attempts" &&
        (saved.status === "Accepted" || saved.status === "Published") &&
        previous?.status !== saved.status
      ) {
        const manuscript = state.manuscripts.find((item) => item.id === saved.manuscriptId);
        showPaperCelebration(
          {
            id: saved.manuscriptId || saved.id,
            title: saved.manuscriptTitle || manuscript?.title || saved.title,
            journal: saved.journal || manuscript?.journal,
          },
          saved.status,
        );
      }
      return saved;
    } finally {
      recordMutationsRef.current -= 1;
    }
  };
  const deleteRecord = async (
    collection: CollectionKey,
    record: Pick<RecordItem, "id" | "version" | "contentHash">,
  ) => {
    recordMutationsRef.current += 1;
    stateRequestRef.current?.abort();
    try {
      const response = await bridgeFetch(`/workbench/record`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collection,
          id: record.id,
          version: record.version,
          contentHash: record.contentHash,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw bridgeFailure(body, t.errors.deleteFailed);
      setState((current) => ({
        ...current,
        [collection]: current[collection].filter((item) => item.id !== record.id),
      }));
      setToast(t.shell.deletedRecord(t.collections[collection]));
    } finally {
      recordMutationsRef.current -= 1;
    }
  };
  const addSubmissionEvent = async (record: Partial<RecordItem>) => {
    recordMutationsRef.current += 1;
    stateRequestRef.current?.abort();
    let event: RecordItem & { verificationOnly?: boolean };
    try {
      const response = await bridgeFetch(`/submissions/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      });
      const body = await response.json();
      if (!response.ok) throw bridgeFailure(body, t.errors.saveFailed);
      event = body.event as RecordItem & { verificationOnly?: boolean };
    } finally {
      recordMutationsRef.current -= 1;
    }
    await loadState();
    setToast(event.verificationOnly ? t.shell.checkSaved : t.shell.timelineUpdated);
    if (!event.verificationOnly && (event.status === "Accepted" || event.status === "Published")) {
      const manuscript = state.manuscripts.find((item) => item.id === event.manuscriptId);
      showPaperCelebration(
        manuscript || {
          id: event.manuscriptId || record.manuscriptId,
          title: record.manuscriptTitle || t.shell.milestone,
        },
        event.status,
      );
    }
  };
  const verifySubmissionAttempt = async (attemptId: string) => {
    recordMutationsRef.current += 1;
    stateRequestRef.current?.abort();
    try {
      const response = await bridgeFetch(`/submissions/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId }),
      });
      const body = await response.json();
      if (!response.ok) throw bridgeFailure(body, t.errors.saveFailed);
    } finally {
      recordMutationsRef.current -= 1;
    }
    await loadState();
    setToast(t.shell.checkSaved);
  };
  const syncSubmissionEmail = async () => {
    recordMutationsRef.current += 1;
    stateRequestRef.current?.abort();
    let result: SubmissionSyncResult;
    try {
      const response = await bridgeFetch(`/submissions/email-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(40000),
      });
      const body = await response.json();
      if (!response.ok) throw bridgeFailure(body, t.manuscript.mailFailed);
      result = body as SubmissionSyncResult;
    } finally {
      recordMutationsRef.current -= 1;
    }
    await loadState();
    for (const event of result.updated || []) {
      if (event.status !== "Accepted" && event.status !== "Published") continue;
      const manuscript = state.manuscripts.find((item) => item.id === event.manuscriptId);
      showPaperCelebration(
        manuscript || { id: event.manuscriptId, title: event.manuscriptTitle || t.shell.milestone },
        event.status,
      );
    }
    return result;
  };
  const openEditor = (collection: CollectionKey, record?: Partial<RecordItem>) =>
    setEditor({ collection, record });
  const activeLabel = t.nav[active];
  const activePaper =
    state.manuscripts.find((item) => item.id === paperContextId) || state.manuscripts[0];
  const openPaper = (
    id = activePaper?.id || "",
    initialView: "develop" | "submission" = "develop",
  ) => {
    if (id) setPaperContextId(id);
    setManuscriptInitialView(initialView);
    setActive("manuscript");
  };
  const allSubmissionAlerts = submissionAlerts(state);
  const visibleSubmissionAlerts = allSubmissionAlerts.filter(
    (alert) => !readSubmissionAlertKeys.includes(submissionAlertKey(alert)),
  );
  const openSubmissionAlert = (alert: SubmissionAlert) => {
    const key = submissionAlertKey(alert);
    setReadSubmissionAlertKeys((current) => {
      if (current.includes(key)) return current;
      const next = [...current, key].slice(-300);
      storeReadSubmissionAlertKeys(next);
      return next;
    });
    openPaper(alert.attempt.manuscriptId || "", "submission");
  };
  const manuscriptAttention =
    visibleSubmissionAlerts.length +
    state.reviews.filter(isOpen).length +
    state["research-debt"].filter(isOpen).length;
  const badges: Partial<Record<ModuleKey, number>> = {
    manuscript: manuscriptAttention || state.manuscripts.length,
    operations: state.operations.filter(isOpen).length,
    projects: state.projects.length,
    library: state["reading-queue"].length,
  };
  const commands = useMemo(
    () =>
      quickActions.filter((item) =>
        `${t.actions[item.command as keyof typeof t.actions].label} ${t.actions[item.command as keyof typeof t.actions].meta} ${item.command}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [query, t],
  );
  const props: DataProps = { state, openEditor, saveRecord, runAction: setAction };
  return (
    <div className="app-shell">
      {paperCelebration && (
        <PaperCelebration
          ref={topOverlay === "celebration" ? overlayRef : undefined}
          paper={paperCelebration}
          onClose={() => {
            setPaperCelebration(null);
            if (paperCelebrationTimerRef.current)
              window.clearTimeout(paperCelebrationTimerRef.current);
          }}
        />
      )}
      <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
        <div className="brand">
          <span className="brand-mark">
            <i />
            <b />
          </span>
          <span>
            <strong>SCHOLARBUDDY</strong>
            <small>SPORTS RESEARCH OS</small>
          </span>
          <button className="mobile-close" onClick={() => setMobileNav(false)}>
            ×
          </button>
        </div>
        <nav>
          {navItems.map((item) => (
            <button
              key={item.key}
              className={active === item.key ? "active" : ""}
              onClick={() => {
                if (item.key === "manuscript") setManuscriptInitialView("develop");
                setActive(item.key);
                setMobileNav(false);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{t.nav[item.key]}</span>
              {Boolean(badges[item.key]) && <b>{badges[item.key]}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={active === "about" ? "active" : ""}
            onClick={() => {
              setActive("about");
              setMobileNav(false);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            <span className="nav-icon">◇</span>
            <span>{t.nav.about}</span>
          </button>
          <button onClick={() => setConnectionsOpen(true)}>
            <span className="nav-icon">⚙</span>
            <span>{t.nav.connections}</span>
          </button>
          <button
            className={`sync-status ${status ? "" : "offline"} ${active === "profile" ? "active" : ""}`}
            onClick={() => {
              setActive("profile");
              setMobileNav(false);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            <span className="sync-orbit">
              <i />
              <b />
            </span>
            <span>
              <strong>{t.nav.profile}</strong>
              <small>
                <SourceDot tone={status ? "green" : "orange"} />
                {status
                  ? t.shell.bridgeConnected
                  : bridgeIssue === "unreachable"
                    ? t.shell.bridgeUnreachable
                    : bridgeIssue === "pairing"
                      ? t.shell.bridgePairing
                      : bridgeIssue === "origin"
                        ? t.shell.bridgeOrigin
                        : t.shell.bridgeOffline}
              </small>
            </span>
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button className="mobile-menu" onClick={() => setMobileNav(true)}>
              ☰
            </button>
            <span>{t.shell.workbench}</span>
            <b>/</b>
            <strong>{activeLabel}</strong>
          </div>
          <button className="command-trigger" onClick={() => setCommandOpen(true)}>
            <span>⌕</span>
            <span>{t.shell.search}</span>
            <kbd>⌘ K</kbd>
          </button>
          <div className="top-actions">
            <button
              className="icon-button"
              aria-label={t.shell.refreshData}
              onClick={() => {
                void loadStatus(true).then(() => loadState());
                setToast(t.shell.refreshing);
              }}
            >
              ↻
            </button>
            <button className="context-button" onClick={() => setContextOpen(true)}>
              <span className="context-diamond">◇</span>
              <span>
                <small>{t.shell.context}</small>
                <strong>{t.shell.records(Object.values(state).flat().length)}</strong>
              </span>
            </button>
            <LanguageSwitch />
          </div>
        </header>
        <main className="content">
          <div className="module-view" key={active}>
            {active !== "profile" && Boolean(dataError) && (
              <div className="data-banner compact-banner">
                <span>!</span>
                <p>{failureText(t, dataError, t.shell.loadFailed)}</p>
                <button onClick={loadState}>{t.common.retry}</button>
              </div>
            )}
            {active !== "profile" && invalidRecords.length > 0 && (
              <details className="data-banner compact-banner invalid-records">
                <summary>{t.shell.invalidNotes(invalidRecords.length)}</summary>
                <ul>
                  {invalidRecords.map((item) => (
                    <li key={`${item.collection}/${item.file}`}>
                      <code>
                        ScholarBuddy/{item.collection}/{item.file}
                      </code>{" "}
                      — {item.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {active !== "profile" && loading && !Object.values(state).flat().length && (
              <div className="loading-bar">
                <i />
                {t.shell.loading}
              </div>
            )}
            {active === "profile" && (
              <ProfileModule
                openConnections={() => setConnectionsOpen(true)}
                startFocus={openFocus}
                operations={stateLoaded ? state.operations : null}
                openOperation={(record) => {
                  setActive("operations");
                  if (record) openEditor("operations", record);
                }}
              />
            )}
            {active === "dashboard" && (
              <Dashboard
                {...props}
                openManuscripts={() => openPaper()}
                submissionAlerts={visibleSubmissionAlerts}
                openSubmissionAlert={openSubmissionAlert}
                paper={activePaper}
              />
            )}
            {active === "projects" && <ProjectsModule state={state} openEditor={openEditor} />}
            {active === "manuscript" && (
              <ManuscriptModule
                state={state}
                openEditor={openEditor}
                addEvent={addSubmissionEvent}
                verifyAttempt={verifySubmissionAttempt}
                syncEmail={syncSubmissionEmail}
                selectedId={activePaper?.id || ""}
                onSelect={setPaperContextId}
                initialView={manuscriptInitialView}
              />
            )}
            {active === "library" && (
              <LibraryModule
                state={state}
                saveRecord={saveRecord}
                openEditor={openEditor}
                paper={activePaper}
              />
            )}
            {active === "operations" && (
              <OperationsModule
                state={state}
                openEditor={openEditor}
                paper={activePaper}
                openFocus={openFocus}
              />
            )}
            {active === "about" && (
              <LandingModule
                enterWorkbench={() => setActive("dashboard")}
                openModule={setActive}
                openConnections={() => setConnectionsOpen(true)}
                openGuide={() => setGuideOpen(true)}
              />
            )}
          </div>
        </main>
      </div>
      {editor && (
        <RecordEditor
          ref={topOverlay === "editor" ? overlayRef : undefined}
          key={`${editor.collection}-${editor.record?.id || "new"}`}
          editor={editor}
          state={state}
          onClose={() => setEditor(null)}
          onSave={saveRecord}
          onDelete={deleteRecord}
          onUnsavedChange={reportEditorUnsaved}
        />
      )}
      {action && (
        <ActionDrawer
          ref={topOverlay === "action" ? overlayRef : undefined}
          action={action}
          state={state}
          paper={activePaper}
          saveRecord={saveRecord}
          onClose={() => setAction(null)}
          openConnections={() => setConnectionsOpen(true)}
          onUnsavedChange={reportActionUnsaved}
        />
      )}
      {contextOpen && (
        <ContextDrawer
          ref={topOverlay === "context" ? overlayRef : undefined}
          state={state}
          status={status}
          onClose={() => setContextOpen(false)}
        />
      )}
      {connectionsOpen && (
        <ConnectionsDrawer
          ref={topOverlay === "connections" ? overlayRef : undefined}
          status={status}
          issue={bridgeIssue}
          refresh={() => loadStatus(true)}
          onClose={() => setConnectionsOpen(false)}
        />
      )}
      {guideOpen && (
        <GuideDrawer
          ref={topOverlay === "guide" ? overlayRef : undefined}
          onClose={() => setGuideOpen(false)}
          openConnections={() => setConnectionsOpen(true)}
        />
      )}
      {reminderLinks.length > 0 && (
        <ReminderDetails
          ref={topOverlay === "reminderDetails" ? overlayRef : undefined}
          items={reminderLinks}
          operations={state.operations}
          onClose={() => setReminderLinks([])}
          onOpenOperation={(record) => {
            setReminderLinks([]);
            setActive("operations");
            openEditor("operations", record);
          }}
        />
      )}
      {commandOpen && (
        <div className="command-backdrop" onMouseDown={() => setCommandOpen(false)}>
          <div
            ref={topOverlay === "command" ? (overlayRef as React.Ref<HTMLDivElement>) : undefined}
            className="command-palette"
            role="dialog"
            aria-modal="true"
            aria-label={t.shell.assists}
            tabIndex={-1}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="command-search">
              <span>⌕</span>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.shell.search}
              />
              <kbd>ESC</kbd>
            </div>
            <div className="command-results">
              <span className="label">{t.shell.assists}</span>
              {commands.map((item) => (
                <button
                  key={item.command}
                  onClick={() => {
                    setAction(item);
                    setCommandOpen(false);
                    setQuery("");
                  }}
                >
                  <span className={`action-mark ${item.tone}`}>✦</span>
                  <span>
                    <strong>{t.actions[item.command as keyof typeof t.actions].label}</strong>
                    <small>{item.command}</small>
                  </span>
                  <b>{t.actions[item.command as keyof typeof t.actions].meta}</b>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className="toast">
          <span>✓</span>
          {toast}
        </div>
      )}
    </div>
  );
}
