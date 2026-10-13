// The few HTTP conventions every route shares: how a refusal is thrown, how a
// response is shaped, and how a request body is read and bounded.
import { timingSafeEqual } from "node:crypto";

// A manuscript is saved whole, as one record: this has to hold a thesis chapter.
export const MAX_BODY_BYTES = 1_000_000;

// What a route throws to refuse a request: the HTTP layer turns `status` into the
// response and passes `code` on to the browser when it is one it should see.
export function httpError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

export function html(body, headers = {}) {
  return new Response(body, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

export function corsHeaders(origin = "") {
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Private-Network": "true",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store",
    Vary: "Origin",
    "X-Content-Type-Options": "nosniff",
  };
}

export function json(origin, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

export function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function readJson(request) {
  if (
    !String(request.headers.get("content-type") || "")
      .toLowerCase()
      .startsWith("application/json")
  ) {
    throw httpError(415, "Content-Type must be application/json.");
  }
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    throw httpError(413, "Request is too large.");
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw httpError(400, "Request body must be valid JSON.");
  }
}

export function requireText(value, name, max = 10_000) {
  if (typeof value !== "string" || !value.trim()) {
    throw httpError(422, `${name} is required.`);
  }
  if (Buffer.byteLength(value, "utf8") > max) {
    throw httpError(422, `${name} is too long.`);
  }
  return value.trim();
}

export function requireIsoDate(value, name) {
  const date = new Date(value);
  if (typeof value !== "string" || Number.isNaN(date.getTime())) {
    throw httpError(422, `${name} must be a valid ISO date.`);
  }
  return date;
}
