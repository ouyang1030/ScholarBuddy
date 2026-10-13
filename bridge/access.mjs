// Who may talk to the Bridge: allowed origins, per-site credentials, the one-time
// codes that pair a browser, and the short-lived session of the local setup page.
import { randomBytes } from "node:crypto";
import path from "node:path";
import { escapeHtml } from "./setup-page.mjs";
import { createGrantStore } from "./grants.mjs";
import { repoRoot, readConfigValues } from "./config.mjs";
import { safeEqual } from "./http.mjs";

const grantsFile = path.join(repoRoot, "bridge", ".scholarbuddy-grants.json");

const PAIRING_CODE_TTL_MS = 5 * 60_000;

const pairingCodes = new Map();

const setupSessions = new Map();

function validBridgeToken(value) {
  return typeof value === "string" && value.length >= 32 && !/\s/.test(value);
}

export function requireBridgeToken(value) {
  if (!validBridgeToken(value))
    throw new Error(
      "SCHOLARBUDDY_BRIDGE_TOKEN is invalid: use at least 32 characters without spaces, or remove it to pair each site separately.",
    );
  return value;
}

export async function openGrantStore(file = grantsFile) {
  const grants = createGrantStore(file);
  if (!(await grants.load()))
    process.stderr.write(
      "The list of paired browsers could not be read. Every browser has to pair again.\n",
    );
  return grants;
}

// Revokes every paired browser. A fixed SCHOLARBUDDY_BRIDGE_TOKEN is not ours to
// change, and claiming a revocation that did not happen would be worse than
// refusing.
export async function rotateBridgeToken(config, file = grantsFile) {
  config ??= await readConfigValues();
  if (config.SCHOLARBUDDY_BRIDGE_TOKEN !== undefined) {
    throw new Error(
      "SCHOLARBUDDY_BRIDGE_TOKEN overrides the paired-browser list. Change or remove it in .env.local or the Bridge process environment, then restart the Bridge and re-pair every browser. Nothing was revoked.",
    );
  }
  await createGrantStore(file).revokeAll();
  pairingCodes.clear();
}

export function allowedOrigins(config) {
  return (config.SCHOLARBUDDY_ORIGINS || "").split(",").flatMap((item) => {
    const value = item.trim();
    if (!value || value.includes("*")) return [];
    try {
      const url = new URL(value);
      // The bearer token travels with every request, so the only plain-http page
      // trusted with it is one served from this computer.
      return value === url.origin && (url.protocol === "https:" || localSetupOrigin(value))
        ? [url.origin]
        : [];
    } catch {
      return [];
    }
  });
}

export function localSetupOrigin(url) {
  const parsed = new URL(url);
  return parsed.protocol === "http:" && ["127.0.0.1", "localhost"].includes(parsed.hostname)
    ? parsed.origin
    : "";
}

// A pairing code may only travel to an allowlisted origin, and only over https or
// to loopback. Without the loopback case, setting up from a local dev server bounces
// the browser to the hosted site instead of back to the tab it started in.
export function setupReturnOrigin(config, requested = "") {
  const allowed = allowedOrigins(config);
  if (
    allowed.includes(requested) &&
    (requested.startsWith("https://") || localSetupOrigin(requested))
  )
    return requested;
  const hosted = allowed.filter((origin) => origin.startsWith("https://"));
  return (
    hosted.find((origin) => origin === "https://www.scholarbuddy.tech") ||
    hosted[0] ||
    "https://www.scholarbuddy.tech"
  );
}

export function issueSetupSession() {
  const now = Date.now();
  for (const [token, expiresAt] of setupSessions) if (expiresAt <= now) setupSessions.delete(token);
  const token = randomBytes(24).toString("base64url");
  setupSessions.set(token, now + 30 * 60_000);
  return token;
}

export function authorizeSetup(request) {
  const localOrigin = localSetupOrigin(request.url);
  const requestOrigin = request.headers.get("origin") || "";
  const token = request.headers.get("x-scholarbuddy-setup") || "";
  const expiresAt = setupSessions.get(token) || 0;
  if (!localOrigin || (requestOrigin && requestOrigin !== localOrigin) || expiresAt <= Date.now())
    return false;
  setupSessions.set(token, Date.now() + 30 * 60_000);
  return true;
}

export function bearerToken(request) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

export function authorize(request, config) {
  const origin = request.headers.get("origin") || "";
  if (!origin || !allowedOrigins(config).includes(origin))
    return { ok: false, status: 403, origin: "", code: "origin_denied" };
  if (request.method === "OPTIONS") return { ok: true, origin, preflight: true };
  const token = bearerToken(request);
  if (config._grants) {
    const grant = config._grants.verify(origin, token);
    if (!grant) return { ok: false, status: 401, origin, code: "pairing_required" };
    if (grant.access === "read" && !["GET", "HEAD"].includes(request.method))
      return { ok: false, status: 403, origin, code: "read_only", grant };
    return { ok: true, origin, grant };
  }
  if (!validBridgeToken(config._bridgeToken) || !token || !safeEqual(token, config._bridgeToken))
    return { ok: false, status: 401, origin, code: "pairing_required" };
  return { ok: true, origin };
}

// Codes are tied to the credential scheme that issued them, so none survives a
// fixed token being changed under a running Bridge.
export const pairingBinding = (config) => config._bridgeToken || "per-site";

// A code minted for the setup page's return trip names the site it is going to
// and is useless anywhere else. One copied by hand from /pair has no destination
// yet and is redeemed by whichever allowed site the researcher pastes it into.
export function issuePairingCode(binding, origin = "") {
  const now = Date.now();
  for (const [code, entry] of pairingCodes) if (entry.expiresAt <= now) pairingCodes.delete(code);
  const code = randomBytes(9).toString("base64url");
  pairingCodes.set(code, { binding, origin, expiresAt: now + PAIRING_CODE_TTL_MS });
  return code;
}

export function redeemPairingCode(code, binding, origin) {
  const clean = String(code || "").trim();
  const entry = pairingCodes.get(clean);
  pairingCodes.delete(clean);
  return Boolean(
    entry &&
    entry.expiresAt > Date.now() &&
    safeEqual(entry.binding, binding) &&
    (!entry.origin || entry.origin === origin),
  );
}

export function pairingPage(binding) {
  const escaped = escapeHtml(issuePairingCode(binding));
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ScholarBuddy Bridge Pairing</title><style>body{font:18px system-ui;max-width:720px;margin:12vh auto;padding:24px;color:#243229;background:#f6f8f3}main{background:white;border:1px solid #dce4d9;border-radius:16px;padding:30px}code{display:block;overflow-wrap:anywhere;padding:16px;background:#17201d;color:#d8f4b6;border-radius:10px;font-size:16px}button{font:inherit;padding:10px 16px}</style><main><h1>Pair ScholarBuddy with this Mac</h1><p>Copy this one-time code, return to ScholarBuddy → Connections, paste it, and choose Pair bridge. It expires in five minutes.</p><code id="token">${escaped}</code><p><button onclick="navigator.clipboard.writeText(document.getElementById('token').textContent).then(()=>this.textContent='Copied')">Copy code</button></p><small>This page is available only through the loopback bridge on this computer.</small></main>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; frame-ancestors 'none'",
        "Referrer-Policy": "no-referrer",
        "X-Frame-Options": "DENY",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
