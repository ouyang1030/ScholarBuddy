"use client";

import { useEffect, useState } from "react";

const stamp = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/**
 * Owns its own one-second tick so the surrounding dashboard — schedule,
 * literature, submission alerts — is not re-rendered once per second.
 */
export function LiveTimestamp() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <p className="eyebrow" suppressHydrationWarning>
      <span className="live-time-dot" />
      {stamp.format(now)}
    </p>
  );
}
