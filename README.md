# ScholarBuddy — Sports Research OS

ScholarBuddy is a local-first research workbench for sports analytics and other evidence-heavy research. The hosted interface organizes projects, manuscripts, reading, reviews, submissions, and daily focus. A loopback-only Bridge keeps Obsidian, Zotero, macOS Calendar, and macOS Mail on the researcher's own computer.

## Architecture

```text
Hosted ScholarBuddy UI (Sites or another compatible deployment)
                         |
                 exact-origin CORS
                 + paired browser
                         |
           http://127.0.0.1:32145
                  Local Bridge
           /        |       |       \
      Obsidian   Zotero  Calendar   Mail
                         |
                 optional AI APIs
```

The hosted site contains no provider API keys, Zotero library, Obsidian vault, calendar, or mailbox data. Each visitor runs and pairs their own Bridge. Browser-only focus state and preferences stay in that browser.

## Requirements

- Node.js 22.13 or newer.
- npm and a modern desktop browser with local-network access enabled.
- An Obsidian-compatible Markdown vault for persistent ScholarBuddy records.
- Zotero Desktop with its Local API enabled for live literature features.
- macOS for Calendar and Mail integration. The web UI and other Bridge features can run elsewhere, but those two adapters are macOS-only.
- Optional DeepSeek, Kimi, OpenAI, Anthropic, xAI, or Gemini API credentials for AI workflows. Users supply their own keys.

## Local setup

```bash
npm install
npm run setup
```

Edit the generated `.env.local`:

- Set `OBSIDIAN_VAULT_PATH` to an absolute vault path.
- Add any optional AI provider credentials.
- Override the matching `*_MODEL` value if your account uses a different available model.
- Keep local development origins in `WORKBUDDY_ORIGINS`.
- After deployment, add every exact public origin. Wildcards are rejected.

Start the interface and Bridge in separate terminals:

```bash
npm run dev
npm run bridge
```

Open ScholarBuddy → Connections → Open local pairing page. Copy the one-time code and redeem it within five minutes. The resulting private token is stored only in that browser origin.

## macOS background service

The installer generates a per-user LaunchAgent using the current Node executable and repository path; no developer-specific paths are committed.

```bash
npm run bridge:install
npm run bridge:status
npm run bridge:uninstall
```

Rotate the long-lived Bridge token if a paired browser or profile is no longer trusted:

```bash
npm run bridge:token:rotate
```

Rotation requires every browser to pair again. `npm run bridge:token` prints the current credential for recovery and should be used only in a private terminal.

## Deployment and domains

This repository preserves the ChatGPT Sites-compatible Vinext/Cloudflare Worker build. `.openai/hosting.json` identifies the production ScholarBuddy Site; maintainers of a fork should replace that project binding with their own deployment.

The intended public custom domain is `https://scholarbuddy.tech`. That exact origin is included in the example Bridge allowlist. After connecting the domain, restart the Bridge and pair again from ScholarBuddy because changing origins does not transfer browser storage.

Publishing source code, making a Site public, and connecting a custom domain are separate decisions. A public repository can still back a private Site.

## Data and security model

- The Bridge binds only to `127.0.0.1`.
- CORS accepts only exact configured HTTP(S) origins; wildcard origins are ignored.
- Browser requests require a high-entropy bearer credential.
- Pairing pages expose a one-time code, not the long-lived credential.
- API keys remain in ignored local configuration and are never sent to the hosted UI.
- Obsidian writes use constrained collections, validated record identifiers, atomic writes, and version archives.
- Selected Zotero and Obsidian context is sent to the configured AI provider only when the user runs an AI workflow.

See [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md) before sharing a deployment.

## Development

```bash
npm run lint
npm test
```

`npm test` performs a production build and runs Bridge and server-rendering tests. Pull requests run the same checks in GitHub Actions.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) first. Security reports should follow [SECURITY.md](SECURITY.md), not a public issue.

## License

Apache License 2.0. See [LICENSE](LICENSE).
