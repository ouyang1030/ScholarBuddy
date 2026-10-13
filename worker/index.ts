/** Cloudflare Worker entry point for the Vinext build. */
import handler from "vinext/server/app-router-entry";
import { SECURITY_HEADERS, contentSecurityPolicy } from "../shared/security-headers.mjs";

type HandlerArguments = Parameters<typeof handler.fetch>;

function secure(response: Response): Response {
  const secured = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) secured.headers.set(name, value);
  // A page arrives carrying the policy proxy.ts minted for it, nonce included.
  // Anything that did not pass through the proxy gets the policy with no nonce,
  // which allows no inline script at all.
  if (!secured.headers.has("Content-Security-Policy"))
    secured.headers.set("Content-Security-Policy", contentSecurityPolicy());
  return secured;
}

const worker = {
  async fetch(
    request: Request,
    env: HandlerArguments[1],
    ctx: HandlerArguments[2],
  ): Promise<Response> {
    // The interface ships its images as static files, so the image optimisation
    // route — which needs a paid Images binding no deployment here provisions —
    // is not served at all.
    if (new URL(request.url).pathname === "/_vinext/image")
      return secure(new Response("Not found", { status: 404 }));
    return secure(await handler.fetch(request, env, ctx));
  },
};

export default worker;
