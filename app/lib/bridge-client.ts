const configuredPort = Number(process.env.NEXT_PUBLIC_WORKBUDDY_BRIDGE_PORT || 32145);
const port = Number.isInteger(configuredPort) && configuredPort >= 1024 && configuredPort <= 65535 ? configuredPort : 32145;
const bridgeUrls = [`http://localhost:${port}`, `http://127.0.0.1:${port}`];

function bridgeToken() {
  return typeof window === "undefined" ? "" : window.localStorage.getItem("workbuddy-bridge-token") || "";
}

export function bridgeBaseUrl() {
  if (typeof window === "undefined") return bridgeUrls[0];
  const saved = window.localStorage.getItem("workbuddy-bridge-url");
  return saved && bridgeUrls.includes(saved) ? saved : bridgeUrls[0];
}

function authorizedHeaders(init?: HeadersInit) {
  const headers = new Headers(init);
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
  if (response.status === 401) window.dispatchEvent(new Event("workbuddy-pairing-required"));
  return response;
}

export async function bridgeHealthFetch() {
  const preferred = bridgeBaseUrl();
  const candidates = [preferred, ...bridgeUrls.filter((url) => url !== preferred)];
  let lastError: unknown;
  for (const base of candidates) {
    try {
      const response = await fetch(`${base}/health`, { headers: authorizedHeaders(), signal: AbortSignal.timeout(5_000) });
      window.localStorage.setItem("workbuddy-bridge-url", base);
      if (response.status === 401) window.dispatchEvent(new Event("workbuddy-pairing-required"));
      return response;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Local bridge is unreachable.");
}
