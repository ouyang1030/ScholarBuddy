import { bridgeFailure } from "../i18n";

const configuredPort = Number(process.env.NEXT_PUBLIC_SCHOLARBUDDY_BRIDGE_PORT || 32145);
const port =
  Number.isInteger(configuredPort) && configuredPort >= 1024 && configuredPort <= 65535
    ? configuredPort
    : 32145;
const bridgeUrls = [`http://localhost:${port}`, `http://127.0.0.1:${port}`];

function bridgeToken() {
  return typeof window === "undefined"
    ? ""
    : window.localStorage.getItem("scholarbuddy-bridge-token") || "";
}

function forgetBridgePairing() {
  window.localStorage.removeItem("scholarbuddy-bridge-token");
}

export function bridgeBaseUrl() {
  if (typeof window === "undefined") return bridgeUrls[0];
  const saved = window.localStorage.getItem("scholarbuddy-bridge-url");
  return saved && bridgeUrls.includes(saved) ? saved : bridgeUrls[0];
}

// The Bridge answers in the interface language, which the page keeps on <html lang>.
// Accept-Language needs no CORS permission, so a Bridge that predates this still
// accepts the request and simply answers in English.
function interfaceLanguage() {
  return typeof document !== "undefined" && document.documentElement.lang.startsWith("zh")
    ? "zh"
    : "en";
}

export function bridgeSetupUrl() {
  if (typeof window === "undefined") return `${bridgeUrls[0]}/setup`;
  return `${bridgeBaseUrl()}/setup?lang=${interfaceLanguage()}&return=${encodeURIComponent(window.location.origin)}`;
}

export function bridgePairUrl() {
  return `${bridgeBaseUrl()}/pair?lang=${interfaceLanguage()}`;
}

function authorizedHeaders(init?: HeadersInit) {
  const headers = new Headers(init);
  headers.set("Accept-Language", interfaceLanguage() === "zh" ? "zh-CN" : "en");
  const token = bridgeToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

export async function bridgeFetch(pathname: string, init: RequestInit = {}) {
  const response = await fetch(`${bridgeBaseUrl()}${pathname}`, {
    ...init,
    headers: authorizedHeaders(init.headers),
    signal: init.signal ?? AbortSignal.timeout(20_000),
  });
  if (response.status === 401) window.dispatchEvent(new Event("scholarbuddy-pairing-required"));
  return response;
}

export async function bridgeHealthFetch() {
  const preferred = bridgeBaseUrl();
  const candidates = [preferred, ...bridgeUrls.filter((url) => url !== preferred)];
  let lastError: unknown;
  for (const base of candidates) {
    try {
      const response = await fetch(`${base}/health`, {
        headers: authorizedHeaders(),
        signal: AbortSignal.timeout(5_000),
      });
      window.localStorage.setItem("scholarbuddy-bridge-url", base);
      if (response.status === 401) window.dispatchEvent(new Event("scholarbuddy-pairing-required"));
      return response;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Local bridge is unreachable.");
}

// Hands this site's credential back before forgetting it, so it stops working
// even for a copy held somewhere else. A Bridge that cannot be reached still
// loses this browser: the credential is forgotten here either way.
export async function disconnectBridge() {
  try {
    await bridgeFetch("/pair/revoke", { method: "POST", signal: AbortSignal.timeout(5_000) });
  } catch {
    /* offline: forgetting it locally is all that can be done */
  }
  forgetBridgePairing();
}

export async function exchangeBridgePairingCode(code: string) {
  const clean = code.trim();
  if (!clean) throw new Error("A pairing code is required.");
  const preferred = bridgeBaseUrl();
  const candidates = [preferred, ...bridgeUrls.filter((url) => url !== preferred)];
  let lastError: unknown;
  for (const base of candidates) {
    try {
      const response = await fetch(`${base}/pair/exchange`, {
        method: "POST",
        // A browser pairing again hands in the credential it holds, so the Bridge
        // replaces it instead of keeping both alive.
        headers: authorizedHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ code: clean }),
        signal: AbortSignal.timeout(5_000),
      });
      const body = (await response.json()) as { token?: string; error?: string; code?: string };
      if (!response.ok || !body.token)
        throw bridgeFailure(body, "That pairing code is invalid or expired.");
      window.localStorage.setItem("scholarbuddy-bridge-url", base);
      window.localStorage.setItem("scholarbuddy-bridge-token", body.token);
      return body.token;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("The local Bridge could not be paired.");
}
