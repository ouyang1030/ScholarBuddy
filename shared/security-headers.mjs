// One list for both deployments: next.config.ts applies it on the Next.js host,
// and the Cloudflare Worker applies it to every response it serves.
export const SECURITY_HEADERS = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

// A paired page holds a credential for the researcher's own computer, so a script
// someone managed to inject must not run. Inline scripts are therefore allowed by
// a nonce minted per request in proxy.ts, never by 'unsafe-inline'; without a
// nonce the policy allows no inline script at all. Styles keep 'unsafe-inline'
// because the interface sets style attributes, which cannot carry a nonce.
export function contentSecurityPolicy(nonce = "", { development = false } = {}) {
  const scripts = [
    "'self'",
    ...(nonce ? [`'nonce-${nonce}'`] : []),
    // React rebuilds server stack traces with eval in development only.
    ...(development ? ["'unsafe-eval'"] : []),
  ];
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self' http://localhost:* http://127.0.0.1:*",
    "font-src 'self' data:",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "object-src 'none'",
    `script-src ${scripts.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "form-action 'self'",
  ].join("; ");
}
