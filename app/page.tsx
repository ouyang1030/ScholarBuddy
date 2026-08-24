"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { bridgeFetch, bridgeHealthFetch, exchangeBridgePairingCode } from "./lib/bridge-client";
import {
  collectionLabels,
  emptyState,
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
  ModuleKey,
  RecordItem,
  SubmissionSyncResult,
  WorkbenchState,
} from "./types";
import { PaperCelebration, type PaperMilestone } from "./components/Celebrations";
import { SourceDot } from "./components/primitives";
import { useOverlayFocus } from "./components/useOverlayFocus";
import { RecordEditor, type EditorState } from "./components/drawers/RecordEditor";
import { ActionDrawer } from "./components/drawers/ActionDrawer";
import { ConnectionsDrawer } from "./components/drawers/ConnectionsDrawer";
import { ContextDrawer } from "./components/drawers/ContextDrawer";
import { GuideDrawer } from "./components/drawers/GuideDrawer";
import { Dashboard } from "./components/modules/Dashboard";
import { LibraryModule } from "./components/modules/LibraryModule";
import { ManuscriptModule } from "./components/modules/ManuscriptModule";
import { OperationsModule } from "./components/modules/OperationsModule";
import { ProjectsModule } from "./components/modules/ProjectsModule";
import type { DataProps } from "./lib/workbench";

const READ_SUBMISSION_ALERTS_KEY = "workbuddy-read-submission-alerts-v1";

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
  const [active, setActive] = useState<ModuleKey>("dashboard");
  const [state, setState] = useState<WorkbenchState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const bridgeIssueRef = useRef<BridgeIssue>(null);
  const offlineTicksRef = useRef(0);
  const [editor, setEditor] = useState<EditorState>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [bridgeIssue, setBridgeIssue] = useState<BridgeIssue>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
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
  const loadState = async () => {
    if (recordMutationsRef.current > 0) return;
    stateRequestRef.current?.abort();
    const controller = new AbortController();
    stateRequestRef.current = controller;
    setLoading(true);
    setDataError("");
    try {
      const response = await bridgeFetch(`/workbench/state`, { signal: controller.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      const nextState = { ...emptyState, ...body } as WorkbenchState;
      const activeAlertKeys = new Set(
        submissionAlerts(nextState).map((alert) => submissionAlertKey(alert)),
      );
      setState(nextState);
      setReadSubmissionAlertKeys((current) => {
        const next = current.filter((key) => activeAlertKeys.has(key));
        if (next.length === current.length) return current;
        storeReadSubmissionAlertKeys(next);
        return next;
      });
    } catch (e) {
      if (controller.signal.aborted) return;
      setDataError(e instanceof Error ? e.message : "Obsidian data could not be loaded.");
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
        if (!connected) throw new Error("Pairing could not be verified.");
        await loadState();
        setConnectionsOpen(false);
        setToast("This browser is connected to your Mac Bridge");
      })
      .catch(() => {
        setConnectionsOpen(true);
        setToast("Automatic pairing failed — open Connections to try again");
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
  // A thought that has to wait for navigation is a thought that gets lost, so
  // capture is reachable from every module: switch to Today, then let the panel
  // take focus once React has committed the module change.
  const openCapture = (target: "journal" | "idea") => {
    setActive("dashboard");
    setCommandOpen(false);
    setMobileNav(false);
    window.setTimeout(
      () =>
        window.dispatchEvent(new CustomEvent("workbuddy-capture-focus", { detail: { target } })),
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
        setCommandOpen(false);
        setEditor(null);
        setAction(null);
        setContextOpen(false);
        setConnectionsOpen(false);
        setGuideOpen(false);
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
    const requirePairing = () =>
      setToast("Local research sources are offline — Today remains available.");
    window.addEventListener("workbuddy-pairing-required", requirePairing);
    return () => window.removeEventListener("workbuddy-pairing-required", requirePairing);
  }, []);
  // Overlays may stack (the AI drawer opens Connections without closing itself),
  // so the topmost one is chosen by stacking order and gets the ref.
  const overlayRef = useRef<HTMLElement | null>(null);
  const topOverlay = paperCelebration
    ? "celebration"
    : commandOpen
      ? "command"
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
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const showPaperCelebration = (
    paper: { id?: string; title?: string; journal?: string },
    milestone: "Accepted" | "Published",
  ) => {
    const id = String(paper.id || "").trim();
    const title = String(paper.title || "Untitled manuscript").trim();
    const journal = String(paper.journal || "").trim();
    if (!id) return;
    let celebrated: string[] = [];
    try {
      const stored = JSON.parse(
        window.localStorage.getItem("workbuddy-paper-celebrations-v1") || "[]",
      );
      if (Array.isArray(stored))
        celebrated = stored.filter((item): item is string => typeof item === "string");
    } catch {
      /* replace malformed local celebration history */
    }
    const key = `${id}:${milestone.toLowerCase()}`;
    if (celebrated.includes(key)) return;
    window.localStorage.setItem(
      "workbuddy-paper-celebrations-v1",
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
      if (!response.ok) throw new Error(body.error || "Record could not be saved.");
      const saved = body.record as RecordItem;
      setState((current) => {
        const records = current[collection].some((item) => item.id === saved.id)
          ? current[collection].map((item) => (item.id === saved.id ? saved : item))
          : [saved, ...current[collection]];
        return {
          ...current,
          [collection]:
            collection === "projects" && saved.active
              ? records.map((item) => ({ ...item, active: item.id === saved.id }))
              : records,
        };
      });
      setToast(`${collectionLabels[collection]} saved to Obsidian`);
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
    record: Pick<RecordItem, "id" | "version">,
  ) => {
    recordMutationsRef.current += 1;
    stateRequestRef.current?.abort();
    try {
      const response = await bridgeFetch(`/workbench/record`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection, id: record.id, version: record.version }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Record could not be deleted.");
      setState((current) => ({
        ...current,
        [collection]: current[collection].filter((item) => item.id !== record.id),
      }));
      setToast(`${collectionLabels[collection]} permanently deleted`);
    } finally {
      recordMutationsRef.current -= 1;
    }
  };
  const addSubmissionEvent = async (record: Partial<RecordItem>) => {
    recordMutationsRef.current += 1;
    stateRequestRef.current?.abort();
    let event: RecordItem;
    try {
      const response = await bridgeFetch(`/submissions/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Submission event could not be saved.");
      event = body.event as RecordItem;
    } finally {
      recordMutationsRef.current -= 1;
    }
    await loadState();
    setToast("Submission timeline updated");
    if (event.status === "Accepted" || event.status === "Published") {
      const manuscript = state.manuscripts.find((item) => item.id === event.manuscriptId);
      showPaperCelebration(
        manuscript || {
          id: event.manuscriptId || record.manuscriptId,
          title: record.manuscriptTitle || "Paper milestone",
        },
        event.status,
      );
    }
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
      if (!response.ok) throw new Error(body.error || "Mail could not be checked.");
      result = body as SubmissionSyncResult;
    } finally {
      recordMutationsRef.current -= 1;
    }
    await loadState();
    for (const event of result.updated || []) {
      if (event.status !== "Accepted" && event.status !== "Published") continue;
      const manuscript = state.manuscripts.find((item) => item.id === event.manuscriptId);
      showPaperCelebration(
        manuscript || { id: event.manuscriptId, title: event.manuscriptTitle || "Paper milestone" },
        event.status,
      );
    }
    return result;
  };
  const openEditor = (collection: CollectionKey, record?: Partial<RecordItem>) =>
    setEditor({ collection, record });
  const activeLabel = navItems.find((item) => item.key === active)?.label || "Today";
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
    state.reviews.filter((item) => item.status !== "Resolved").length +
    state["research-debt"].filter((item) => item.status !== "Resolved").length;
  const badges: Partial<Record<ModuleKey, number>> = {
    manuscript: manuscriptAttention || state.manuscripts.length,
    operations: state.operations.filter(
      (item) => !["Resolved", "Completed", "Archived"].includes(item.status || ""),
    ).length,
    projects: state.projects.length,
    library: state["reading-queue"].length,
  };
  const commands = useMemo(
    () =>
      quickActions.filter((item) =>
        `${item.label} ${item.meta} ${item.command}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [query],
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
          <span className="nav-label">RESEARCH WORKBENCH</span>
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
              <span>{item.label}</span>
              {Boolean(badges[item.key]) && <b>{badges[item.key]}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            onClick={() => {
              setGuideOpen(true);
              setMobileNav(false);
            }}
          >
            <span className="nav-icon">?</span>
            <span>User Guide</span>
          </button>
          <button onClick={() => setConnectionsOpen(true)}>
            <span className="nav-icon">⚙</span>
            <span>Connections</span>
          </button>
          <div className={`sync-status ${status ? "" : "offline"}`}>
            <span className="sync-orbit">
              <i />
              <b />
            </span>
            <span>
              <strong>Research systems</strong>
              <small>
                <SourceDot tone={status ? "green" : "orange"} />
                {status
                  ? "Local bridge connected"
                  : bridgeIssue === "unreachable"
                    ? "Bridge unreachable · open in a Mac browser"
                    : bridgeIssue === "pairing"
                      ? "Bridge pairing required"
                      : bridgeIssue === "origin"
                        ? "Bridge origin blocked"
                        : "Bridge offline · Today still works"}
              </small>
            </span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button className="mobile-menu" onClick={() => setMobileNav(true)}>
              ☰
            </button>
            <span>Research Workbench</span>
            <b>/</b>
            <strong>{activeLabel}</strong>
          </div>
          <button className="command-trigger" onClick={() => setCommandOpen(true)}>
            <span>⌕</span>
            <span>Search or run an AI assist…</span>
            <kbd>⌘ K</kbd>
          </button>
          <div className="top-actions">
            <button
              className="icon-button"
              onClick={() => {
                void loadStatus(true).then(() => loadState());
                setToast("Refreshing real data");
              }}
            >
              ↻
            </button>
            <button className="context-button" onClick={() => setContextOpen(true)}>
              <span className="context-diamond">◇</span>
              <span>
                <small>CONTEXT</small>
                <strong>{Object.values(state).flat().length} real records</strong>
              </span>
            </button>
            <button className="profile-button" onClick={() => setConnectionsOpen(true)}>
              DR
            </button>
          </div>
        </header>
        <main className="content">
          {dataError && (
            <div className="data-banner compact-banner">
              <span>!</span>
              <p>{dataError} Today’s local focus tools remain available.</p>
              <button onClick={loadState}>Retry</button>
            </div>
          )}
          {loading && !Object.values(state).flat().length && (
            <div className="loading-bar">
              <i />
              Loading Obsidian records…
            </div>
          )}
          {active === "dashboard" && (
            <Dashboard
              {...props}
              openContext={() => setContextOpen(true)}
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
            <OperationsModule state={state} openEditor={openEditor} paper={activePaper} />
          )}
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
      {commandOpen && (
        <div className="command-backdrop" onMouseDown={() => setCommandOpen(false)}>
          <div
            ref={topOverlay === "command" ? (overlayRef as React.Ref<HTMLDivElement>) : undefined}
            className="command-palette"
            role="dialog"
            aria-modal="true"
            aria-label="Contextual AI assists"
            tabIndex={-1}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="command-search">
              <span>⌕</span>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search AI assists…"
              />
              <kbd>ESC</kbd>
            </div>
            <div className="command-results">
              <span className="label">CONTEXTUAL AI ASSISTS</span>
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
                    <strong>{item.label}</strong>
                    <small>{item.command}</small>
                  </span>
                  <b>{item.meta}</b>
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
