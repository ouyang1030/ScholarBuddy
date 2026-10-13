"use client";

import { useState } from "react";
import {
  bridgeHealthFetch,
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

// One paste into Terminal. macOS ships curl and tar and the Bridge uses no npm
// packages, so neither git nor `npm install` is needed. Running it again updates
// the code and keeps the local settings, which are not part of the archive.
const installCommand =
  "mkdir -p ~/ScholarBuddy && curl -fsSL https://github.com/ouyang1030/ScholarBuddy/archive/refs/heads/main.tar.gz | tar -xz -C ~/ScholarBuddy --strip-components 1 && node ~/ScholarBuddy/scripts/setup.mjs";

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
  const [opening, setOpening] = useState<"setup" | "pair" | null>(null);
  const [bridgeMissing, setBridgeMissing] = useState(false);
  const [blockedPage, setBlockedPage] = useState("");
  const [commandCopied, setCommandCopied] = useState(false);
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
  // The setup and pairing pages are served by the Bridge on this computer, so
  // without a running Bridge the new tab would only show a browser error page.
  const openBridgePage = async (page: "setup" | "pair") => {
    setOpening(page);
    setBlockedPage("");
    try {
      await bridgeHealthFetch();
    } catch {
      setBridgeMissing(true);
      void refresh();
      return;
    } finally {
      setOpening(null);
    }
    setBridgeMissing(false);
    // Built after the check, which may have switched between localhost and 127.0.0.1.
    const url = page === "setup" ? bridgeSetupUrl() : bridgePairUrl();
    // Some browsers stop treating the click as permission to open a tab once the
    // check has been awaited; a null handle means it was blocked, so offer a link.
    const opened = window.open(url, "_blank");
    if (opened) opened.opener = null;
    else setBlockedPage(url);
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
            <button disabled={opening !== null} onClick={() => void openBridgePage("setup")}>
              {opening === "setup" ? t.connections.testing : t.connections.configure}
            </button>
            <button disabled={opening !== null} onClick={() => void openBridgePage("pair")}>
              {opening === "pair" ? t.connections.testing : t.connections.openPairing}
            </button>
            {blockedPage && (
              <small>
                {t.connections.popupBlocked}{" "}
                <a href={blockedPage} target="_blank" rel="noopener noreferrer">
                  {t.connections.openDirectly}
                </a>
              </small>
            )}
            {bridgeMissing && (
              <div className="bridge-install" role="status">
                <strong>{t.connections.unreachableDetail}</strong>
                <ol>
                  <li>
                    {t.connections.installNode}{" "}
                    <a href="https://nodejs.org/" target="_blank" rel="noopener noreferrer">
                      nodejs.org
                    </a>
                  </li>
                  <li>
                    {t.connections.installRun}
                    <pre>
                      <code>{installCommand}</code>
                    </pre>
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(installCommand);
                        setCommandCopied(true);
                        window.setTimeout(() => setCommandCopied(false), 1600);
                      }}
                    >
                      {commandCopied ? t.connections.commandCopied : t.connections.copyCommand}
                    </button>
                  </li>
                </ol>
                <small>{t.connections.installNote}</small>
              </div>
            )}
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
