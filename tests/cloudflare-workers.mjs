import { register } from "node:module";

// The built Worker imports `cloudflare:workers`, which only the Workers runtime
// provides. Rendering it under Node needs a stand-in, as vinext's own prerender
// step uses: no tracing integration to register and no bindings to reach.
const stub = `data:text/javascript,${encodeURIComponent("export const tracing = undefined;")}`;
register(
  `data:text/javascript,${encodeURIComponent(`
    export async function resolve(specifier, context, nextResolve) {
      if (specifier === "cloudflare:workers") return { shortCircuit: true, url: ${JSON.stringify(stub)} };
      return nextResolve(specifier, context);
    }
  `)}`,
);
