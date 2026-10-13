"use client";

import { useState } from "react";
import {
  bridgePairUrl,
  bridgeSetupUrl,
  disconnectBridge,
  exchangeBridgePairingCode,
} from "../../lib/bridge-client";
import { failureText, useT } from "../../i18n";
import { aiProviders } from "../../lib/workbench";
import type { BridgeIssue, BridgeStatus } from "../../types";
import { BrandLogo } from "../BrandLogo";
import { closeWithTransition, DrawerHeader, SaveFeedback } from "../primitives";
import { FocusCalendarSetting } from "./FocusCalendarSetting";
import { ReminderSettings } from "./ReminderSettings";

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
  const t = useT();
  const [token, setToken] = useState("");
  const [pairingError, setPairingError] = useState("");
  const [pairing, setPairing] = useState(false);
  const [checking, setChecking] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const connection = (connected?: boolean) => (
    <b className={`connection-state ${connected ? "connected" : "missing"}`}>
      {connected ? t.connections.connected : t.connections.setupNeeded}
    </b>
  );
  const pair = async () => {
    const clean = token.trim();
    if (!clean) {
      setPairingError(t.connections.pasteCode);
      return;
    }
    setPairingError("");
    setPairing(true);
    try {
      await exchangeBridgePairingCode(clean);
      const connected = await refresh();
      if (!connected) {
        await disconnectBridge();
        throw new Error(t.connections.unverified);
      }
      setToken("");
    } catch (error) {
      setPairingError(
        error instanceof TypeError
          ? t.errors.unreachable
          : failureText(t, error, t.connections.pairFailed),
      );
    } finally {
      setPairing(false);
    }
  };
  const checkConnection = async () => {
    setChecking("saving");
    const result = await refresh();
    setChecking(result ? "saved" : "error");
    window.setTimeout(() => setChecking("idle"), 1800);
  };
  const issueCopy =
    issue === "unreachable"
      ? { title: t.connections.unreachableTitle, detail: t.connections.unreachableDetail }
      : issue === "origin"
        ? { title: t.connections.originTitle, detail: t.connections.originDetail }
        : issue === "error"
          ? { title: t.connections.errorTitle, detail: t.connections.errorDetail }
          : { title: t.connections.pairTitle, detail: t.connections.pairDetail };
  const aiConnections = aiProviders.map((item) => {
    const providerStatus = status?.[item.id];
    return (
      <article key={item.id}>
        <BrandLogo brand={item.id} className="connection-logo" />
        <div>
          <strong>{item.name} API</strong>
          <small>{providerStatus?.model || item.fallbackModel}</small>
        </div>
        {connection(providerStatus?.configured)}
      </article>
    );
  });
  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(event) => closeWithTransition(onClose, event.currentTarget)}
    >
      <aside
        ref={ref}
        className="action-drawer connections-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={t.connections.label}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <DrawerHeader
          label={t.connections.label}
          mark="⌁"
          eyebrow={t.connections.eyebrow}
          title={t.connections.title}
          onClose={onClose}
        />
        {!status && (
          <div className="pairing-card">
            <b>{t.connections.pairBrowser}</b>
            <p>{t.connections.pairHint}</p>
            <button onClick={() => window.open(bridgeSetupUrl(), "_blank", "noopener,noreferrer")}>
              {t.connections.configure}
            </button>
            <button onClick={() => window.open(bridgePairUrl(), "_blank", "noopener,noreferrer")}>
              {t.connections.openPairing}
            </button>
            <label>
              <span>{t.connections.code}</span>
              <input
                type="password"
                autoComplete="off"
                value={token}
                onChange={(event) => setToken(event.target.value)}
              />
            </label>
            <button className="primary-button" disabled={pairing} onClick={pair}>
              {pairing ? t.connections.testing : t.connections.pair}
            </button>
            {pairingError && <small className="pairing-error">{pairingError}</small>}
          </div>
        )}
        <div className={`bridge-banner ${status ? "online" : "offline"}`}>
          <span className="bridge-status-icon">{status ? "✓" : "!"}</span>
          <div>
            <strong>{status ? t.connections.paired : issueCopy.title}</strong>
            <small>{status ? t.connections.localOnly : issueCopy.detail}</small>
          </div>
          <div className="connection-check">
            <SaveFeedback
              state={checking}
              labels={{
                saving: t.connections.testing,
                saved: t.connections.connected,
                error: t.connections.noResponse,
              }}
            />
            <button
              type="button"
              disabled={checking === "saving"}
              onClick={() => void checkConnection()}
            >
              {t.connections.testAgain}
            </button>
          </div>
        </div>
        {status && (
          <>
            <div className="connection-actions">
              <button
                className="quiet-button"
                onClick={() => window.open(bridgeSetupUrl(), "_blank", "noopener,noreferrer")}
              >
                {t.connections.manage}
              </button>
              <button
                className="quiet-button"
                onClick={() => {
                  // Reloading is what clears the records this page already holds.
                  void disconnectBridge().then(() => window.location.reload());
                }}
              >
                {t.connections.disconnect}
              </button>
            </div>
            <small className="connection-note">{t.connections.disconnectNote}</small>
          </>
        )}
        <div className="connection-list">
          {aiConnections}
          <article>
            <BrandLogo brand="calendar" className="connection-logo" />
            <div>
              <strong>{t.connections.calendar}</strong>
              <small>{t.connections.calendarScope}</small>
            </div>
            {connection(status?.calendar.connected)}
          </article>
          <article>
            <BrandLogo brand="zotero" className="connection-logo" />
            <div>
              <strong>Zotero Desktop</strong>
              <small>{status?.zotero.version || t.connections.localApi}</small>
            </div>
            {connection(status?.zotero.connected)}
          </article>
          <article>
            <BrandLogo brand="obsidian" className="connection-logo" />
            <div>
              <strong>Obsidian · {status?.obsidian.vault || t.connections.vault}</strong>
              <small>{t.connections.records}</small>
            </div>
            {connection(status?.obsidian.connected)}
          </article>
        </div>
        <FocusCalendarSetting paired={Boolean(status)} />
        <ReminderSettings paired={Boolean(status)} />
      </aside>
    </div>
  );
}
