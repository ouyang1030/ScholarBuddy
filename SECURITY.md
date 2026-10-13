# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's private vulnerability reporting feature for this repository. Include affected versions, reproduction steps, impact, and any suggested mitigation. Do not include real research data or credentials.

Maintainers should acknowledge a complete report within seven days and coordinate disclosure after a fix is available. No response-time or bounty guarantee is implied.

## Supported version

Security fixes target the latest release and the default branch.

## Security boundary

The hosted UI is never given provider API keys. The Bridge must remain bound to loopback, require exact allowed origins and a paired bearer credential, and keep provider keys in macOS Keychain or ignored local configuration. The local setup page requires direct loopback navigation and a short-lived same-origin setup session; it never returns stored keys to browser JavaScript. A public deployment does not make a visitor's local data public.

Pairing is where trust is extended. Pages served from a paired origin can, through the Bridge, search the whole configured vault, read the Zotero library and its annotations, read and change Calendar events, trigger the submission mail scan, write records and notes, and run AI workflows on the user's keys. Anything that lets an attacker run script on a paired origin — a compromised deployment or build dependency, or an injection flaw — therefore reaches that data. Reports in this class are in scope and treated as high severity.

Controls that must be preserved:

- Scripts on the hosted page run only with the per-request nonce minted in `proxy.ts`. `script-src` must not regain `'unsafe-inline'`, and production must not allow `'unsafe-eval'`.
- Allowed origins are exact, and `https` unless they are the user's own `localhost`. Development origins are opt-in.
- Each paired site has its own credential: bound to that origin, kept only as a hash, lapsing 30 days after its last use and 180 days after pairing. The setup page lists them, can limit one to reading, and can revoke it; **Connections → Disconnect this browser** revokes the one in use, and `npm run bridge:token:rotate` revokes all.
- The list of paired browsers and every change to it are reachable only from the loopback setup page, never from a paired site.
- AI output is neutralised before it reaches the vault: image embeds become links and resource-loading HTML becomes text.

Known limits:

- A credential is all-or-read-only; there are no finer scopes, and a destructive request from a paired site is not confirmed on the Mac.
- A fixed `SCHOLARBUDDY_BRIDGE_TOKEN` opts out of per-site credentials and expiry.
- Any website can learn that a ScholarBuddy Bridge is running: `/health` answers a refused origin readably so that a legitimate deployment missing from the allowlist can say so. It discloses nothing else.
- Keychain items are readable by other processes running as the same macOS user, and a key passes through the `security` tool's arguments while it is being saved.
