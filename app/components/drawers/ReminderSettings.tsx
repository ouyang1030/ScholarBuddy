"use client";

import { useCallback, useEffect, useState } from "react";
import { bridgeFailure, failureText, useT } from "../../i18n";
import { bridgeFetch } from "../../lib/bridge-client";
import { SaveFeedback, SettingRow } from "../primitives";

type Settings = { enabled: boolean; calendar: boolean; operations: boolean };
type ReminderStatus = {
  settings: Settings;
  permission: string;
  calendarPermission: string;
  error?: string;
  sourceErrors?: Record<string, string>;
};

/**
 * Reminder preferences live inside Connections: they are delivered by the local
 * bridge and gated on macOS notification permission, so they belong with the
 * other per-Mac system settings rather than in their own sidebar entry.
 */
export function ReminderSettings({ paired }: { paired: boolean }) {
  const t = useT();
  const [loadedStatus, setLoadedStatus] = useState<ReminderStatus | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [savingKey, setSavingKey] = useState<keyof Settings | null>(null);
  const [savedKey, setSavedKey] = useState<keyof Settings | null>(null);
  const [failedKey, setFailedKey] = useState<keyof Settings | null>(null);
  const refresh = useCallback(async () => {
    const response = await bridgeFetch("/reminders");
    const body = await response.json();
    if (!response.ok) throw bridgeFailure(body, "");
    setLoadedStatus(body);
    setLoadError("");
  }, []);
  useEffect(() => {
    if (busy) return;
    // Polling an unpaired bridge only yields 401s, and each one raises the
    // "sources are offline" toast — over this very drawer, where pairing is
    // done. Wait for the pairing this drawer is here to establish.
    if (!paired) return;
    const load = () =>
      void refresh().catch((error) => setLoadError(failureText(t, error, t.reminders.loadFailed)));
    const start = window.setTimeout(load, 0);
    const timer = window.setInterval(load, 30_000);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(timer);
    };
  }, [busy, paired, refresh, t]);
  const update = async (patch: Partial<Settings>) => {
    const key = Object.keys(patch)[0] as keyof Settings;
    setBusy(true);
    setSavingKey(key);
    setSavedKey(null);
    setFailedKey(null);
    setLoadError("");
    setMessage("");
    try {
      const response = await bridgeFetch("/reminders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
        signal: AbortSignal.timeout(240_000),
      });
      const body = await response.json();
      if (!response.ok) throw bridgeFailure(body, "");
      setLoadedStatus((current) => (current ? { ...current, settings: body.settings } : current));
      await refresh();
      setSavedKey(key);
      window.setTimeout(() => setSavedKey((current) => (current === key ? null : current)), 1800);
    } catch (error) {
      setFailedKey(key);
      setLoadError(failureText(t, error, t.errors.saveFailed));
    } finally {
      setBusy(false);
      setSavingKey(null);
    }
  };
  const test = async () => {
    setBusy(true);
    setLoadError("");
    setMessage("");
    try {
      const response = await bridgeFetch("/reminders/test", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw bridgeFailure(body, "");
      setMessage(t.reminders.testSent);
    } catch (error) {
      setLoadError(failureText(t, error, t.reminders.testFailed));
    } finally {
      setBusy(false);
    }
  };
  // Unpaired, there is nothing to load: the section explains itself from props
  // rather than from a request that could only come back 401.
  const status = paired ? loadedStatus : null;
  const error = paired ? loadError : t.reminders.pairFirst;
  const settings = status?.settings;
  const enabled = Boolean(settings?.enabled);
  const permissionIssue = enabled && status?.permission !== "granted";
  return (
    <section className="reminder-settings" aria-labelledby="reminder-settings-title">
      <div className="drawer-section-title">
        <strong id="reminder-settings-title">{t.reminders.title}</strong>
      </div>
      {!status && !error && <p role="status">{t.reminders.loading}</p>}
      <div className="reminder-switches" aria-busy={busy}>
        {(
          [
            ["enabled", t.reminders.enable, undefined],
            ["calendar", t.reminders.calendar, t.reminders.calendarWhen],
            ["operations", t.reminders.operations, t.reminders.operationsWhen],
          ] as const
        ).map(([key, label, detail]) => (
          <SettingRow
            key={key}
            featured={key === "enabled"}
            label={label}
            detail={detail}
            checked={Boolean(settings?.[key])}
            disabled={!status || busy || (key !== "enabled" && !enabled)}
            feedback={
              <SaveFeedback
                state={
                  savingKey === key
                    ? "saving"
                    : savedKey === key
                      ? "saved"
                      : failedKey === key
                        ? "error"
                        : "idle"
                }
              />
            }
            onChange={(checked) => void update({ [key]: checked })}
          />
        ))}
      </div>
      <div className="reminder-status" aria-live="polite">
        {busy && <p>{t.reminders.applying}</p>}
        {error && <p role="alert">{error}</p>}
        {permissionIssue && (
          <p>
            {status?.permission === "unsupported" ? t.reminders.macOnly : t.reminders.notifications}
          </p>
        )}
        {enabled && settings?.calendar && status?.calendarPermission !== "granted" && (
          <p>{t.reminders.calendarPermission}</p>
        )}
        {enabled && status?.error && <p>{status.error}</p>}
        {enabled &&
          Object.values(status?.sourceErrors || {}).map((text) => <p key={text}>{text}</p>)}
        {enabled && !permissionIssue && <p>{t.reminders.on}</p>}
        {!enabled && status && <p>{t.reminders.off}</p>}
        {message && <p>{message}</p>}
      </div>
      <div className="reminder-actions">
        <button
          className="primary-button"
          disabled={busy || !enabled || status?.permission !== "granted"}
          onClick={() => void test()}
        >
          {t.reminders.test}
        </button>
      </div>
    </section>
  );
}
