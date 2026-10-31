"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BridgeFailure, failureText, useT, valueLabel } from "../../i18n";
import { type DataProps } from "../../lib/workbench";
import {
  operationQuadrant,
  operationFinished,
  sortOperations,
} from "../../../shared/operations.mjs";
import type { RecordItem } from "../../types";
import { useFocusElsewhere } from "../panels/FocusPanel";
import { EmptyState, ModuleTabs, PageHeader } from "../primitives";
import { RecordModule } from "./RecordModule";
import { OperationCard } from "./OperationCard";
import { OperationsMatrix, type Quadrant } from "./OperationsMatrix";

const VIEW_KEY = "scholarbuddy-operations-view-v1";
type View = "list" | "matrix";
type OperationsProps = Pick<DataProps, "state" | "openEditor" | "saveRecord"> & {
  paper?: RecordItem;
  openFocus: () => void;
  writable: boolean;
  readOnly: boolean;
  reloadRecords: () => Promise<boolean>;
};

// Moves in flight outlive the board: switching to the journal tab and back must
// not forget them, or a card could be moved again with the version being replaced.
let pendingMoves: Record<string, Quadrant> = {};
const noPendingMoves: Record<string, Quadrant> = {};
const pendingListeners = new Set<() => void>();
function setPendingMove(id: string, quadrant?: Quadrant) {
  const next = { ...pendingMoves };
  if (quadrant === undefined) delete next[id];
  else next[id] = quadrant;
  pendingMoves = next;
  pendingListeners.forEach((listener) => listener());
}
function subscribePendingMoves(listener: () => void) {
  pendingListeners.add(listener);
  return () => {
    pendingListeners.delete(listener);
  };
}

const CONFLICT_CODES = [
  "version_conflict",
  "content_conflict",
  "version_required",
  "content_hash_required",
];

function storedView(): View {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "matrix" ? "matrix" : "list";
  } catch {
    return "list";
  }
}

function OperationsBoard({
  state,
  openEditor,
  saveRecord,
  paper,
  openFocus,
  writable,
  readOnly,
  reloadRecords,
}: OperationsProps) {
  const t = useT();
  const [view, setView] = useState<View>(storedView);
  const [typeFilter, setTypeFilter] = useState("");
  const pending = useSyncExternalStore(
    subscribePendingMoves,
    () => pendingMoves,
    () => noPendingMoves,
  );
  const restoreFocusId = useRef<string | null>(null);
  const [undo, setUndo] = useState<{ saved: RecordItem; previous: string } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [denied, setDenied] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [timerReady, setTimerReady] = useState(false);
  const [focusingId, setFocusingId] = useState("");
  useEffect(() => {
    const id = restoreFocusId.current;
    if (!id || Object.hasOwn(pending, id)) return;
    restoreFocusId.current = null;
    // Moving between regions remounts the handle. Restore keyboard focus only
    // if the user has not already moved on to another control while saving.
    if (document.activeElement === document.body)
      document
        .querySelector<HTMLButtonElement>(
          `[data-operation-id="${CSS.escape(id)}"] .operation-drag-handle`,
        )
        ?.focus({ preventScroll: true });
  }, [pending]);
  const elsewhere = useFocusElsewhere();
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const listen = (event: Event) => {
      const detail = (event as CustomEvent<{ running?: boolean; operationId?: string }>).detail;
      setTimerReady(true);
      setFocusingId(detail?.running ? detail.operationId || "" : "");
    };
    window.addEventListener("scholarbuddy-focus-state", listen);
    window.dispatchEvent(new Event("scholarbuddy-request-focus-state"));
    return () => window.removeEventListener("scholarbuddy-focus-state", listen);
  }, []);
  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), 10_000);
    return () => window.clearTimeout(timer);
  }, [undo]);

  const canClassify = writable && !readOnly && !denied;
  const types = [
    ...new Set(state.operations.map((item) => item.type).filter(Boolean)),
  ].sort() as string[];
  const active = typeFilter && types.includes(typeFilter) ? typeFilter : "";
  const operations = sortOperations(
    state.operations
      .filter((item) => !active || item.type === active)
      .map((item) =>
        Object.hasOwn(pending, item.id) ? { ...item, eisenhowerQuadrant: pending[item.id] } : item,
      ),
  );
  const chooseView = (next: View) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* memory preference still works */
    }
  };
  const create = (quadrant?: Quadrant) =>
    openEditor("operations", {
      ...(paper
        ? {
            manuscriptId: paper.id,
            manuscriptTitle: paper.title,
            projectId: paper.projectId || "",
            projectTitle: paper.projectTitle || "",
          }
        : {}),
      ...(quadrant !== undefined ? { eisenhowerQuadrant: quadrant } : {}),
    });
  const startFocus = (item: RecordItem) => {
    const accepted = window.dispatchEvent(
      new CustomEvent("scholarbuddy-start-focus", {
        cancelable: true,
        detail: {
          target: item.title || item.id,
          operationId: item.id,
          operationType: item.type || "",
        },
      }),
    );
    if (accepted) openFocus();
  };
  // A failed load is reported by the page's own banner; this one stays until
  // the records really are fresh.
  const reload = async () => {
    setReloading(true);
    const loaded = await reloadRecords();
    if (!mounted.current) return;
    setReloading(false);
    if (!loaded) return;
    setError("");
    setDenied(false);
  };
  const move = async (item: RecordItem, quadrant: string, undoing = false, keyboard = false) => {
    if (!canClassify || Object.hasOwn(pendingMoves, item.id) || operationFinished(item)) return;
    const from = operationQuadrant(item.eisenhowerQuadrant);
    // An unrecognized value is shown as Unclassified, so a drop back there
    // changes nothing and must not overwrite what the note holds.
    if (!undoing && from === quadrant) return;
    setPendingMove(item.id, operationQuadrant(quadrant));
    setUndo(null);
    setError("");
    setNotice("");
    try {
      const saved = await saveRecord(
        "operations",
        {
          id: item.id,
          version: item.version,
          contentHash: item.contentHash,
          eisenhowerQuadrant: quadrant,
        },
        { quiet: true },
      );
      if (!mounted.current) return;
      // Undo is a new conditional write using exactly the version just saved.
      // Unknown hand-edited values cannot be reintroduced through strict writes.
      if (!undoing && (from || !item.eisenhowerQuadrant))
        setUndo({ saved, previous: item.eisenhowerQuadrant || "" });
      const key = operationQuadrant(quadrant);
      setNotice(
        undoing
          ? t.operations.undone
          : t.operations.moved(key ? t.operations.quadrants[key] : t.operations.unclassified),
      );
    } catch (cause) {
      // Without the Bridge's answer (a timeout, a dropped connection) the write
      // may still have landed, so the vault decides where the card really is.
      const answered = cause instanceof BridgeFailure;
      if (!answered || CONFLICT_CODES.includes(cause.code || "")) void reloadRecords();
      if (!mounted.current) return;
      setError(
        answered
          ? `${t.operations.saveClassificationFailed} ${failureText(t, cause, "")}`
          : t.operations.saveClassificationUnconfirmed,
      );
      if (answered && cause.code === "read_only") setDenied(true);
    } finally {
      if (keyboard && mounted.current) restoreFocusId.current = item.id;
      setPendingMove(item.id);
    }
  };
  const renderCard = (item: RecordItem) => (
    <OperationCard
      key={item.id}
      item={item}
      matrix={view === "matrix"}
      writable={canClassify}
      saving={Object.hasOwn(pending, item.id)}
      timerReady={timerReady}
      focusing={focusingId === item.id}
      elsewhere={elsewhere}
      onFocus={() => (focusingId === item.id ? openFocus() : startFocus(item))}
      onEdit={() => openEditor("operations", item)}
    />
  );

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="operations-view-switch" role="group" aria-label={t.operations.views}>
            <button type="button" aria-pressed={view === "list"} onClick={() => chooseView("list")}>
              {t.operations.listView}
            </button>
            <button
              type="button"
              aria-pressed={view === "matrix"}
              onClick={() => chooseView("matrix")}
            >
              {t.operations.matrixView}
            </button>
          </span>
        }
        title={t.nav.operations}
        hideTitle
        compact
        actions={
          <button className="primary-button" onClick={() => create()}>
            {t.operations.new} <b>+</b>
          </button>
        }
      />
      {types.length > 1 && (
        <div className="record-filters" aria-label={t.operations.filter}>
          <button className={active ? "" : "active"} onClick={() => setTypeFilter("")}>
            {t.operations.all}
          </button>
          {types.map((type) => (
            <button
              key={type}
              className={active === type ? "active" : ""}
              onClick={() => setTypeFilter(type)}
            >
              {valueLabel(t.values.operationType, type)}
            </button>
          ))}
        </div>
      )}
      {view === "matrix" && (
        <p className="operations-drag-hint">
          {canClassify
            ? t.operations.dragHint
            : readOnly || denied
              ? t.operations.readOnly
              : t.operations.connectToClassify}
        </p>
      )}
      {error && (
        <div className="operations-move-error" role="alert">
          <span>{error}</span>
          <button
            className="quiet-button"
            disabled={reloading || Object.keys(pending).length > 0}
            onClick={() => void reload()}
          >
            {t.operations.reload}
          </button>
        </div>
      )}
      <div className="operations-move-feedback" role="status" aria-live="polite">
        {notice}
        {undo && (
          <button
            className="quiet-button"
            disabled={!canClassify}
            onClick={() => void move(undo.saved, undo.previous, true, true)}
          >
            {t.operations.undoMove}
          </button>
        )}
      </div>
      {view === "matrix" ? (
        <OperationsMatrix
          operations={operations}
          writable={canClassify}
          onMove={(id, quadrant, keyboard) => {
            const item = state.operations.find((record) => record.id === id);
            if (item) void move(item, quadrant, false, keyboard);
          }}
          onCreate={create}
          renderCard={renderCard}
        />
      ) : (
        <section className="record-board operations-board">
          {operations.length ? (
            operations.map(renderCard)
          ) : (
            <EmptyState title={t.operations.none} />
          )}
        </section>
      )}
    </>
  );
}

export function OperationsModule(props: OperationsProps) {
  const t = useT();
  const [tab, setTab] = useState<"operations" | "journal">("operations");
  return (
    <>
      <ModuleTabs
        label={t.operations.views}
        active={tab}
        onSelect={setTab}
        tabs={[
          { key: "operations", label: t.operations.tabOperations },
          { key: "journal", label: t.operations.tabLog },
        ]}
      />
      <div role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "operations" ? (
          <OperationsBoard {...props} />
        ) : (
          <RecordModule
            collection="journal"
            title={
              <>
                {t.operations.logLead}
                <em>{t.operations.logEm}</em>
              </>
            }
            eyebrow={t.operations.logEyebrow}
            state={props.state}
            openEditor={props.openEditor}
            showProgress={false}
          />
        )}
      </div>
    </>
  );
}
