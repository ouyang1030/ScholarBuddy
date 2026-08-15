# ScholarBuddy local research Bridge

The Bridge is a loopback-only service that connects the hosted ScholarBuddy interface to private systems on the visitor's computer without placing credentials or research files in the web bundle.

## Configuration

Run `npm run setup`. On macOS this installs the background Bridge and opens the loopback-only setup page, which stores AI keys in Keychain, selects the Obsidian vault, tests local integrations, and returns to ScholarBuddy for automatic pairing. The ignored `.env.local` remains available for advanced and non-macOS configuration. Supported values include:

- `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, and `DEEPSEEK_MODEL`.
- `KIMI_API_KEY`, `KIMI_BASE_URL`, and `KIMI_MODEL`.
- `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `OPENAI_MODEL` for ChatGPT models.
- `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, and `ANTHROPIC_MODEL` for Claude.
- `XAI_API_KEY`, `XAI_BASE_URL`, and `XAI_MODEL` for Grok.
- `GEMINI_API_KEY`, `GEMINI_BASE_URL`, and `GEMINI_MODEL` for Google Gemini.
- `OBSIDIAN_VAULT_PATH` for Markdown search and `ScholarBuddy/` record writes.
- `ZOTERO_LOCAL_URL` for the Zotero Desktop Local API.
- `WORKBUDDY_ORIGINS`, a comma-separated exact-origin allowlist.
- `NEXT_PUBLIC_WORKBUDDY_BRIDGE_PORT`, shared by the browser build and Bridge.
- Optional concurrency, request, token, and output limits documented in `.env.local.example`.

Do not use wildcard origins. Add the deployed `https://` origin exactly, restart the Bridge, and pair once on that browser origin.
The project default includes `https://scholarbuddy.tech`; add a `www` origin separately only if that hostname is also configured.

## Running

Use `npm run bridge` in a terminal. On macOS, `npm run setup` or `npm run bridge:install` generates and installs a per-user LaunchAgent. The template contains no developer-specific paths.

Open `http://127.0.0.1:32145/setup` directly in Safari or Chrome to manage local connections. Setup writes require an expiring same-origin session created by that page. Public websites are not allowed to read saved secrets or call its configuration routes.

The service binds only to `127.0.0.1`. Pairing uses a five-minute, one-time code. The exchanged bearer token is saved only in the paired browser's local storage. Rotate it with `npm run bridge:token:rotate` if access should be revoked.

## Local integrations

- Zotero and Obsidian features are available wherever their local paths and APIs are reachable.
- Calendar and Mail adapters use macOS JavaScript for Automation and require user-approved Automation permissions.
- Mail scanning is opt-in and its 15-minute browser timer runs only while Submission Tracker is open. It checks recent Inbox messages against saved submission identifiers or manuscript titles and stores only matching audit metadata in Obsidian. Acceptance, rejection, withdrawal, and publication require confirmation before Obsidian changes.
- AI requests use only the sources selected for that workflow. Credentials remain inside the Bridge.
- Each provider uses its native API protocol; changing providers does not expose one provider's key to another.
- AI rate and token limits reset when the Bridge restarts and should not be treated as billing controls.
