"use client";

import { useState } from "react";
import { bridgeBaseUrl, bridgeSetupUrl, exchangeBridgePairingCode } from "../../lib/bridge-client";
import { aiProviders } from "../../lib/workbench";
import type { BridgeIssue, BridgeStatus } from "../../types";

export function ConnectionsDrawer({
  status,
  issue,
  refresh,
  onClose,
  ref,
}: {
  status: BridgeStatus | null;
  issue: BridgeIssue;
  refresh: () => Promise<BridgeStatus | null>;
  onClose: () => void;
  ref?: React.Ref<HTMLElement>;
}) {
  const [token, setToken] = useState("");
  const [pairingError, setPairingError] = useState("");
  const [pairing, setPairing] = useState(false);
  const connection = (connected?: boolean) => (
    <b className={`connection-state ${connected ? "connected" : "missing"}`}>
      {connected ? "Connected" : "Setup needed"}
    </b>
  );
  const pair = async () => {
    const clean = token.trim();
    if (!clean) {
      setPairingError("Paste the temporary code from the local pairing page.");
      return;
    }
    setPairingError("");
    setPairing(true);
    try {
      await exchangeBridgePairingCode(clean);
      const connected = await refresh();
      if (!connected) {
        window.localStorage.removeItem("workbuddy-bridge-token");
        throw new Error("The bridge returned a token that could not be verified.");
      }
      setToken("");
    } catch (error) {
      setPairingError(error instanceof Error ? error.message : "Pairing failed.");
    } finally {
      setPairing(false);
    }
  };
  const issueCopy =
    issue === "unreachable"
      ? {
          title: "This browser cannot reach the Mac Bridge",
          detail:
            "Open ScholarBuddy in Safari or Chrome on this Mac. Embedded browsers may not expose local Mac services.",
        }
      : issue === "origin"
        ? {
            title: "This site is not allowed by the Bridge",
            detail:
              "The Bridge is running, but its allowed-site list needs this ScholarBuddy address.",
          }
        : issue === "error"
          ? {
              title: "Bridge check failed",
              detail: "The Bridge replied, but the health check could not be completed.",
            }
          : {
              title: "Bridge pairing required",
              detail: "The local service is reachable after this browser is paired.",
            };
  const aiConnections = aiProviders.map((item) => {
    const providerStatus = status?.[item.id];
    return (
      <article key={item.id}>
        <span className={`connection-logo ${item.id}`}>{item.short}</span>
        <div>
          <strong>{item.name} API</strong>
          <small>{providerStatus?.model || item.fallbackModel}</small>
        </div>
        {connection(providerStatus?.configured)}
      </article>
    );
  });
  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside
        ref={ref}
        className="action-drawer connections-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Connections"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <button onClick={onClose}>×</button>
          <span className="label">CONNECTIONS</span>
          <span className="action-mark mint">⌁</span>
        </div>
        <div className="drawer-title">
          <span>LOCAL RESEARCH BRIDGE</span>
          <h2>Real tools, private context.</h2>
          <p>
            A short-lived pairing code prevents other websites from using your local research
            systems.
          </p>
        </div>
        {!status && (
          <div className="pairing-card">
            <b>Pair this browser</b>
            <p>
              Use the guided Mac setup, or open the pairing page and enter its temporary code within
              five minutes.
            </p>
            {issue === "unreachable" && (
              <div className="bridge-help">
                <strong>Mac Bridge is running</strong>
                <span>
                  The current browser cannot access its local address. Use Safari or Chrome on this
                  Mac and allow Local Network access if prompted.
                </span>
              </div>
            )}
            <button onClick={() => window.open(bridgeSetupUrl(), "_blank", "noopener,noreferrer")}>
              Configure this Mac
            </button>
            <button
              onClick={() =>
                window.open(`${bridgeBaseUrl()}/pair`, "_blank", "noopener,noreferrer")
              }
            >
              Open local pairing page
            </button>
            <label>
              <span>Temporary pairing code</span>
              <input
                type="password"
                autoComplete="off"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Paste temporary code"
              />
            </label>
            <button className="primary-button" disabled={pairing} onClick={pair}>
              {pairing ? "Testing…" : "Pair bridge"}
            </button>
            {pairingError && <small className="pairing-error">{pairingError}</small>}
          </div>
        )}
        <div className={`bridge-banner ${status ? "online" : "offline"}`}>
          <span>{status ? "✓" : "!"}</span>
          <div>
            <strong>{status ? "Research bridge is paired" : issueCopy.title}</strong>
            <small>{status ? "Listening only on this Mac" : issueCopy.detail}</small>
          </div>
          <button onClick={() => void refresh()}>Test again</button>
        </div>
        {status && (
          <button
            className="quiet-button"
            onClick={() => window.open(bridgeSetupUrl(), "_blank", "noopener,noreferrer")}
          >
            Manage local connections
          </button>
        )}
        <div className="connection-list">
          {aiConnections}
          <article>
            <span className="connection-logo calendar">C</span>
            <div>
              <strong>macOS Calendar</strong>
              <small>Today · read + write</small>
            </div>
            {connection(status?.calendar.connected)}
          </article>
          <article>
            <span className="connection-logo zotero">Z</span>
            <div>
              <strong>Zotero Desktop</strong>
              <small>{status?.zotero.version || "Local API"}</small>
            </div>
            {connection(status?.zotero.connected)}
          </article>
          <article>
            <span className="connection-logo obsidian">O</span>
            <div>
              <strong>Obsidian · {status?.obsidian.vault || "Vault"}</strong>
              <small>Markdown records</small>
            </div>
            {connection(status?.obsidian.connected)}
          </article>
        </div>
      </aside>
    </div>
  );
}
