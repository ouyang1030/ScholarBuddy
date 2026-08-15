# ScholarBuddy local research Bridge

The Bridge is a loopback-only service that connects the hosted ScholarBuddy interface to private systems on the visitor's computer without placing credentials or research files in the web bundle.

## Configuration

Run `npm run setup`, then edit the ignored `.env.local` at the repository root. Supported values include:

- `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, and `DEEPSEEK_MODEL`.
- `KIMI_API_KEY`, `KIMI_BASE_URL`, and `KIMI_MODEL`.
- `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `OPENAI_MODEL` for ChatGPT/OpenAI models.
- `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, and `ANTHROPIC_MODEL` for Claude.
- `XAI_API_KEY`, `XAI_BASE_URL`, and `XAI_MODEL` for Grok.
- `GEMINI_API_KEY`, `GEMINI_BASE_URL`, and `GEMINI_MODEL` for Google Gemini.
- `OBSIDIAN_VAULT_PATH` for Markdown search and `WorkBuddy/` record writes.
- `ZOTERO_LOCAL_URL` for the Zotero Desktop Local API.
- `WORKBUDDY_ORIGINS`, a comma-separated exact-origin allowlist.
- `NEXT_PUBLIC_WORKBUDDY_BRIDGE_PORT`, shared by the browser build and Bridge.
- Optional concurrency, request, token, and output limits documented in `.env.local.example`.

Do not use wildcard origins. Add the deployed `https://` origin exactly, restart the Bridge, and pair once on that browser origin.
The project default includes `https://scholarbuddy.tech`; add a `www` origin separately only if that hostname is also configured.

## Running

Use `npm run bridge` in a terminal. On macOS, `npm run bridge:install` generates and installs a per-user LaunchAgent. The template contains no developer-specific paths.

The service binds only to `127.0.0.1`. Pairing uses a five-minute, one-time code. The exchanged bearer token is saved only in the paired browser's local storage. Rotate it with `npm run bridge:token:rotate` if access should be revoked.

## Local integrations

- Zotero and Obsidian features are available wherever their local paths and APIs are reachable.
- Calendar and Mail adapters use macOS JavaScript for Automation and require user-approved Automation permissions.
- Mail scanning is opt-in. It checks recent Inbox messages against saved submission identifiers or manuscript titles and stores only matching audit metadata in Kbase.
- AI requests use only the sources selected for that workflow. Credentials remain inside the Bridge.
- Each provider uses its native API protocol; changing providers does not expose one provider's key to another.
