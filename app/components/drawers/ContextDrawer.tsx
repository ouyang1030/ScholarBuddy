"use client";

import type { BridgeStatus, WorkbenchState } from "../../types";

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
  const project = state.projects.find((item) => item.active) || state.projects[0];
  const rq =
    state["research-questions"].find((item) => item.status === "Active") ||
    state["research-questions"][0];
  const recentLog = state.journal[0];
  const inbox = state.ideas.filter((item) => (item.status || "Inbox") === "Inbox");
  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside
        ref={ref}
        className="action-drawer context-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Real context"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <button onClick={onClose}>×</button>
          <span className="label">REAL CONTEXT</span>
          <span className="action-mark mint">◇</span>
        </div>
        <div className="drawer-title">
          <span>OBSIDIAN + ZOTERO</span>
          <h2>
            What ScholarBuddy
            <br />
            can use now
          </h2>
        </div>
        <div className="context-groups">
          <section>
            <div>
              <span>PROJECT FRAME</span>
              <b>{state.projects.length + state["research-questions"].length} records</b>
            </div>
            {project ? (
              <p>
                <i className="checked">✓</i>
                <span>
                  <strong>{project.title}</strong>
                  <small>
                    {project.id} · {project.active ? "active" : "first available"}
                  </small>
                </span>
              </p>
            ) : (
              <p>
                <i className="warning">!</i>
                <span>
                  <strong>No project</strong>
                  <small>Create one in Projects</small>
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
                  <strong>No research question</strong>
                  <small>Create one in Research Map</small>
                </span>
              </p>
            )}
          </section>
          <section>
            <div>
              <span>DAILY CAPTURE</span>
              <b>{state.journal.length + inbox.length} records</b>
            </div>
            <p>
              <i className={recentLog ? "checked" : "warning"}>{recentLog ? "✓" : "!"}</i>
              <span>
                <strong>{recentLog ? recentLog.title : "No research log entry"}</strong>
                <small>
                  {recentLog
                    ? `${recentLog.entryDate || "Undated"} · last three days travel with the AI context`
                    : "Write one on Today so the AI knows what already moved"}
                </small>
              </span>
            </p>
            <p>
              <i className="checked">✓</i>
              <span>
                <strong>
                  {inbox.length} idea{inbox.length === 1 ? "" : "s"} waiting
                </strong>
                <small>Captured ideas stay out of the AI context once promoted or dropped</small>
              </span>
            </p>
          </section>
          <section>
            <div>
              <span>CONNECTED SOURCES</span>
              <b>Live status</b>
            </div>
            <p>
              <i className={status?.zotero.connected ? "checked" : "warning"}>
                {status?.zotero.connected ? "✓" : "!"}
              </i>
              <span>
                <strong>Zotero</strong>
                <small>
                  {status?.zotero.connected ? `Desktop ${status.zotero.version}` : "Offline"}
                </small>
              </span>
            </p>
            <p>
              <i className={status?.obsidian.connected ? "checked" : "warning"}>
                {status?.obsidian.connected ? "✓" : "!"}
              </i>
              <span>
                <strong>Obsidian · {status?.obsidian.vault || "Vault"}</strong>
                <small>
                  {status?.obsidian.connected
                    ? `${Object.values(state).flat().length} ScholarBuddy records`
                    : "Offline"}
                </small>
              </span>
            </p>
          </section>
        </div>
        <div className="drawer-footer">
          <span className="small-note">Context is assembled at workflow run time</span>
          <button className="primary-button" onClick={onClose}>
            Done
          </button>
        </div>
      </aside>
    </div>
  );
}
