// One list for both deployments: next.config.ts applies it on the Next.js host,
// and the Cloudflare Worker applies it to every response it serves.
export const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; base-uri 'self'; connect-src 'self' http://localhost:* http://127.0.0.1:*; font-src 'self' data:; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; form-action 'self'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};
