"use client";

import { useCallback, useEffect, useState } from "react";
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
    if (!response.ok) throw new Error(body.error || "Reminders could not be loaded.");
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
      void refresh().catch((error) =>
        setLoadError(error instanceof Error ? error.message : "Connect your Mac to use reminders."),
      );
    const start = window.setTimeout(load, 0);
    const timer = window.setInterval(load, 10_000);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(timer);
    };
  }, [busy, paired, refresh]);
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
      if (!response.ok) throw new Error(body.error);
      setLoadedStatus((current) => (current ? { ...current, settings: body.settings } : current));
      await refresh();
      setSavedKey(key);
      window.setTimeout(() => setSavedKey((current) => (current === key ? null : current)), 1800);
    } catch (error) {
      setFailedKey(key);
      setLoadError(error instanceof Error ? error.message : "Settings could not be saved.");
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
      if (!response.ok) throw new Error(body.error);
      setMessage("Test sent. Check macOS Notification Center if no banner appears.");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Test could not be sent.");
    } finally {
      setBusy(false);
    }
  };
  // Unpaired, there is nothing to load: the section explains itself from props
  // rather than from a request that could only come back 401.
  const status = paired ? loadedStatus : null;
  const error = paired ? loadError : "Pair this browser with the local bridge to use reminders.";
  const settings = status?.settings;
  const enabled = Boolean(settings?.enabled);
  const permissionIssue = enabled && status?.permission !== "granted";
  return (
    <section className="reminder-settings" aria-labelledby="reminder-settings-title">
      <div className="drawer-section-title">
        <strong id="reminder-settings-title">Reminders</strong>
      </div>
      {!status && !error && <p role="status">Loading settings…</p>}
      <div className="reminder-switches" aria-busy={busy}>
        {(
          [
            ["enabled", "Enable reminders", "Save your choices on this Mac."],
            [
              "calendar",
              "Calendar events",
              "24 hours before. All-day events: 09:00 the day before.",
            ],
            [
              "operations",
              "PhD Operations deadlines",
              "1 month, 1 week and 1 day before, at 09:00.",
            ],
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
        {busy && (
          <p>
            Applying… If macOS asks, allow ScholarBuddy Reminders to send notifications and read
            your calendar.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        {permissionIssue && (
          <p>
            {status?.permission === "unsupported"
              ? "System reminders require macOS."
              : "Notifications are not ready. Allow ScholarBuddy Reminders in System Settings → Notifications. If setup is incomplete, turn reminders off and on to retry."}
          </p>
        )}
        {enabled && settings?.calendar && status?.calendarPermission !== "granted" && (
          <p>
            Allow ScholarBuddy Reminders in System Settings → Privacy & Security → Calendars.
            Calendar access is read-only in this feature.
          </p>
        )}
        {enabled && status?.error && <p>{status.error}</p>}
        {enabled &&
          Object.values(status?.sourceErrors || {}).map((text) => <p key={text}>{text}</p>)}
        {enabled && !permissionIssue && (
          <p>
            Reminders are on. Times use this Mac’s time zone. Your Mac must be awake and its local
            connection running; Focus settings may silence banners.
          </p>
        )}
        {!enabled && status && <p>Reminders are off. Your category choices are kept.</p>}
        {message && <p>{message}</p>}
      </div>
      <div className="reminder-actions">
        <button
          className="primary-button"
          disabled={busy || !enabled || status?.permission !== "granted"}
          onClick={() => void test()}
        >
          Send test reminder
        </button>
      </div>
      <p className="reminder-footnote">
        Completed items stop automatically. Missed reminders for upcoming items are combined into
        one notification.
      </p>
    </section>
  );
}
