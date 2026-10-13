import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy } from "./shared/security-headers.mjs";

// Every page gets its own nonce. The framework reads it back out of the request's
// Content-Security-Policy header and stamps it on each script it emits, which is
// why the header is set on the request as well as on the response.
export function proxy(request: NextRequest) {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  const policy = contentSecurityPolicy(nonce, {
    development: process.env.NODE_ENV === "development",
  });
  const headers = new Headers(request.headers);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  // Static files carry no inline script. Everything else gets a nonce, a prefetch
  // included: the browser may go on to show that very response, and a page that
  // arrived without a nonce would have every one of its scripts refused.
  matcher: ["/((?!_next/static|_next/image|_vinext/|brands/|favicon.svg|og.png).*)"],
};
