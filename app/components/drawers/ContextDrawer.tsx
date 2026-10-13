"use client";

import { useLocale, useT } from "../../i18n";
import { shortDate } from "../../lib/format";
import type { BridgeStatus, WorkbenchState } from "../../types";
import { closeWithTransition, DrawerHeader } from "../primitives";

export function ContextDrawer({
  state,
  status,
  onClose,
  ref,
}: {
  state: WorkbenchState;
  status: BridgeStatus | null;
  onClose: () => void;
  ref?: React.Ref<HTMLElement>;
}) {
  const t = useT();
  const { locale } = useLocale();
  const project = state.projects.find((item) => item.active) || state.projects[0];
  const rq =
    state["research-questions"].find((item) => item.status === "Active") ||
    state["research-questions"][0];
  const recentLog = state.journal[0];
  const inbox = state.ideas.filter((item) => (item.status || "Inbox") === "Inbox");
  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(event) => closeWithTransition(onClose, event.currentTarget)}
    >
      <aside
        ref={ref}
        className="action-drawer context-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={t.context.label}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <DrawerHeader
          label={t.context.label}
          mark="◇"
          eyebrow="OBSIDIAN + ZOTERO"
          title={t.context.title}
          onClose={onClose}
        />
        <div className="context-groups">
          <section>
            <div>
              <span>{t.context.frame}</span>
              <b>{t.context.records(state.projects.length + state["research-questions"].length)}</b>
            </div>
            {project ? (
              <p>
                <i className="checked">✓</i>
                <span>
                  <strong>{project.title}</strong>
                  <small>
                    {project.id} · {project.active ? t.context.active : t.context.firstAvailable}
                  </small>
                </span>
              </p>
            ) : (
              <p>
                <i className="warning">!</i>
                <span>
                  <strong>{t.context.noProject}</strong>
                  <small>{t.context.createInProjects}</small>
                </span>
              </p>
            )}
            {rq ? (
              <p>
                <i className="checked">✓</i>
                <span>
                  <strong>{rq.title}</strong>
                  <small>{rq.id}</small>
                </span>
              </p>
            ) : (
              <p>
                <i className="warning">!</i>
                <span>
                  <strong>{t.context.noQuestion}</strong>
                  <small>{t.context.createInProjects}</small>
                </span>
              </p>
            )}
          </section>
          <section>
            <div>
              <span>{t.context.capture}</span>
              <b>{t.context.records(state.journal.length + inbox.length)}</b>
            </div>
            <p>
              <i className={recentLog ? "checked" : "warning"}>{recentLog ? "✓" : "!"}</i>
              <span>
                <strong>{recentLog ? recentLog.title : t.context.noLog}</strong>
                <small>
                  {recentLog
                    ? t.context.logWindow(
                        recentLog.entryDate
                          ? shortDate(recentLog.entryDate, locale)
                          : t.context.undated,
                      )
                    : t.context.writeLog}
                </small>
              </span>
            </p>
            <p>
              <i className="checked">✓</i>
              <span>
                <strong>{t.context.ideas(inbox.length)}</strong>
              </span>
            </p>
          </section>
          <section>
            <div>
              <span>{t.context.sources}</span>
              <b>{t.context.live}</b>
            </div>
            <p>
              <i className={status?.zotero.connected ? "checked" : "warning"}>
                {status?.zotero.connected ? "✓" : "!"}
              </i>
              <span>
                <strong>Zotero</strong>
                <small>
                  {status?.zotero.connected
                    ? t.context.desktop(status.zotero.version || "")
                    : t.context.offline}
                </small>
              </span>
            </p>
            <p>
              <i className={status?.obsidian.connected ? "checked" : "warning"}>
                {status?.obsidian.connected ? "✓" : "!"}
              </i>
              <span>
                <strong>Obsidian · {status?.obsidian.vault || t.connections.vault}</strong>
                <small>
                  {status?.obsidian.connected
                    ? t.context.vaultRecords(Object.values(state).flat().length)
                    : t.context.offline}
                </small>
              </span>
            </p>
          </section>
        </div>
        <div className="drawer-footer">
          <span className="small-note">{t.context.footer}</span>
          <button className="primary-button" onClick={onClose}>
            {t.context.done}
          </button>
        </div>
      </aside>
    </div>
  );
}
