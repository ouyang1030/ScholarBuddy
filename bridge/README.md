# ScholarBuddy local research Bridge

The Bridge is a loopback-only service that connects the hosted ScholarBuddy interface to private systems on the visitor's computer without placing credentials or research files in the web bundle.

## Configuration

Run `npm run setup`. On macOS this installs the background Bridge and opens the loopback-only setup page, which stores AI keys in Keychain, selects the Obsidian vault, tests local integrations, and returns to ScholarBuddy for automatic pairing. The ignored `.env.local` remains available for advanced and non-macOS configuration. Supported values include:

Each provider card can test the exact model ID currently in its fields with one short API request. Testing uses the draft key and model without saving either value.

- `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, and `DEEPSEEK_MODEL`.
- `KIMI_API_KEY`, `KIMI_BASE_URL`, and `KIMI_MODEL`.
- `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `OPENAI_MODEL` for ChatGPT models.
- `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, and `ANTHROPIC_MODEL` for Claude.
- `XAI_API_KEY`, `XAI_BASE_URL`, and `XAI_MODEL` for Grok.
- `GEMINI_API_KEY`, `GEMINI_BASE_URL`, and `GEMINI_MODEL` for Google Gemini.
- `OBSIDIAN_VAULT_PATH` for Markdown search and `ScholarBuddy/` record writes.
- `ZOTERO_LOCAL_URL` for the Zotero Desktop Local API.
- `SCHOLARBUDDY_ORIGINS`, a comma-separated exact-origin allowlist.
- `NEXT_PUBLIC_SCHOLARBUDDY_BRIDGE_PORT`, shared by the browser build and Bridge.
- Optional concurrency, request, token, and output limits documented in `.env.local.example`.

Do not use wildcard origins. Add the deployed `https://` origin exactly, restart the Bridge, and pair once on that browser origin. Plain `http` is accepted only for this computer's own `localhost` or `127.0.0.1`; anything else is ignored, and the Bridge says so on startup. Development servers are not in the default allowlist: `npm run setup -- --dev` adds `http://localhost:3000`, `:5173`, and `:4173`.
The project default includes `https://scholarbuddy.tech`, `https://www.scholarbuddy.tech`, and the fixed backup `https://scholarbuddy-eta.vercel.app`. The bare custom domain redirects to `www`, so pair there and separately at the Vercel backup address with a fresh code. Both paired origins access the same local research data.

Existing `.env.local` files are preserved by setup. To enable the backup for an existing installation, append its exact HTTPS origin to `SCHOLARBUDDY_ORIGINS` and restart the Bridge (`npm run bridge:install` for the macOS background service). Open the backup site's Connections drawer and use **Open local pairing page** to get a new code. Pairing in advance allows switching to the backup without relying on the custom domain; browser preferences and unsaved drafts remain separate.

## Layout

`server.mjs` is the entry point: configuration, the router, the HTTP transport, and the
command-line switches. Each concern it routes to has its own module:

- `access.mjs`, `grants.mjs` — allowed origins, per-site credentials, pairing codes, the setup session.
- `records.mjs`, `record-schema.mjs` — records as Markdown files: parsing, validation, concurrency, history.
- `submissions.mjs` — the submission tracker and its mail-driven status changes.
- `zotero.mjs`, `vault-search.mjs`, `search-terms.mjs` — the library, the vault, and how a query becomes terms.
- `providers.mjs`, `ai-run.mjs`, `prompts.mjs` — provider protocols, and a workflow run from retrieval to audited answer.
- `macos.mjs`, `reminders.mjs`, `reminder-rules.mjs`, `reminder-native.mjs` — Calendar, Mail, and notifications.
- `status.mjs`, `setup.mjs`, `setup-page.mjs`, `local-settings.mjs` — connection status and the loopback setup page.
- `http.mjs`, `config.mjs`, `atomic-file.mjs`, `activity-store.mjs` — shared plumbing.

## Running

Use `npm run bridge` in a terminal. On macOS, `npm run setup` or `npm run bridge:install` generates and installs a per-user LaunchAgent. The template contains no developer-specific paths.

Open `http://127.0.0.1:32145/setup` directly in Safari or Chrome to manage local connections. Setup writes require an expiring same-origin session created by that page. Public websites are not allowed to read saved secrets or call its configuration routes.

The service binds only to `127.0.0.1`. Pairing uses a five-minute, one-time code. The exchanged credential belongs to the site that redeemed the code and is saved only in that browser's local storage; the Bridge keeps a hash in the ignored `bridge/.scholarbuddy-grants.json`. Review, limit, or revoke paired browsers on the setup page, or revoke all of them with `npm run bridge:token:rotate` if access should be revoked.

## Local integrations

- Zotero and Obsidian features are available wherever their local paths and APIs are reachable.
- Calendar and Mail adapters use macOS JavaScript for Automation and require user-approved Automation permissions.
- Mail scanning starts only once a submission attempt exists: opening Submission Tracker scans at most once every six hours, and **Check email updates** scans on demand. It checks recent Inbox messages against saved submission identifiers or manuscript titles and stores only matching audit metadata in Obsidian. Acceptance, rejection, withdrawal, and publication require confirmation before Obsidian changes.
- AI requests use only the sources selected for that workflow. Credentials remain inside the Bridge.
- Each provider uses its native API protocol; changing providers does not expose one provider's key to another.
- AI rate and token limits reset when the Bridge restarts and should not be treated as billing controls.

## Updating the Bridge and browser together

Record reads and saves now return a `contentHash` computed from the Markdown file.
Updates and deletes require that hash as well as `version`; it is transport metadata
and is not written into frontmatter. Restart the updated Bridge and reload the
updated web interface before editing. An older browser receives a reload error
instead of overwriting an external Obsidian edit. Existing Markdown needs no migration.
The hash check is optimistic concurrency protection, not a lock on Obsidian or sync tools.

Credentials are per site and kept as hashes in `bridge/.scholarbuddy-grants.json`. A
list that cannot be read is treated as empty, so every browser pairs again rather than
any being trusted by mistake. An explicitly set `SCHOLARBUDDY_BRIDGE_TOKEN` keeps a
single fixed credential instead; if it is empty or malformed the Bridge refuses to start.

AI follow-ups resend the original evidence snapshot with each provider request,
including after older conversation turns are trimmed. This increases follow-up input
usage compared with the previous incomplete prompts.

New submission events record the attempt version they were created against. Retrying
an event or running email sync can finish an interrupted attempt update without
creating a second event. Recovery does not overwrite a later Bridge edit. Legacy
events without this version are not automatically replayed during email sync.
Configuration saves are serialized within the running Bridge; external edits and
multiple Bridge processes are not coordinated by that queue.

The HTTP transport rejects non-loopback Host headers before routing, including the
setup and pairing pages. Provider errors returned to the browser contain a status
and recognized diagnostic code, not arbitrary upstream messages. Local diagnostic
logs redact the exact credential used for the request, including draft setup keys.
The token rotation command revokes every paired browser. It refuses to act when
`SCHOLARBUDDY_BRIDGE_TOKEN` is present in local configuration or the process environment,
and reports how to change that credential instead of claiming a revocation.

`/status` sends a provider key to its provider only when a check is asked for
(`?fresh=1`, which **Test again** uses). The periodic poll reports a saved key as
configured, or repeats the verdict of the last check made with that same key.

## Reminder runtime

The Bridge entry point starts a serialized reminder worker at 60-second intervals.
`GET /reminders`, `PUT /reminders`, and `POST /reminders/test` use the existing
exact-origin and bearer-token boundary. `GET /reminders/events?date=YYYY-MM-DD`
resolves a clicked notification against current calendar data without prompting.
The update endpoint takes only boolean `enabled`, `calendar`, and `operations`
patches. Its navigation origin comes from the authenticated request, never the body.

`bridge/notifications/ReminderHelper.swift` is compiled lazily on explicit enable
into the ignored `bridge/.notifications/ScholarBuddy Reminders.app`. It uses
UserNotifications and read-only EventKit queries (which expand recurring events).
You can prepare it without requesting permissions using
`node scripts/build-reminder-helper.mjs`. Apple Command Line Tools are required
for a source installation. No notification/calendar permission is requested by
startup, status reads, or background retries.

Settings, a transient delivery outbox, and expiring deduplication keys are stored
atomically under `bridge/.notifications/state` with private file permissions. The
outbox is revalidated against live sources before retries. Retries reuse a stable
notification identifier; the helper checks Notification Center for prior delivery.
A crash after OS delivery and dismissal but before the Bridge records success can
still cause a retry notification; exactly-once delivery cannot be guaranteed across
that OS/filesystem boundary. Different Bridge processes must not share this state;
the supported background service runs one instance on the configured loopback port.

Only currently due reminders are submitted to macOS, so stale future schedules do
not survive source edits while the Bridge is offline. After restart/wake, upcoming
items with missed nodes are combined once. Source failures are shown in the reminder
panel and retried; Calendar failure does not block Operation reminders. Notification
clicks use URL fragments with identifiers, so those identifiers are not sent to the
hosted server. System notification content and the transient local outbox contain
the item title and date; no reminder data is sent to an AI provider.
