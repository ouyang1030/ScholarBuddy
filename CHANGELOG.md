# Changelog

All notable changes will be documented here. This project follows semantic versioning once stable releases begin.

## Unreleased

### Added

- The interface is available in English and Simplified Chinese. Switch with **EN | 中文** in the top bar; the choice is kept in a `scholarbuddy-locale` cookie, and without one the browser's language decides. The page is rendered in that language from the first frame.
- AI answers follow the interface language. Drafting and reviewing a manuscript section (`@write-section`, `@reviewer-critique`) stay in English; citation markers and the action block are unchanged in either language.
- The Bridge speaks the same language. The setup and pairing pages open in the interface language and have their own **EN | 中文** switch. Unreadable-note reasons, vault and mail coverage notes, activity warnings, and Bridge errors follow the language of each request. Reminder notifications use the language the workbench last used with this Bridge, and the helper's macOS permission prompt has a Chinese version.
- Profile has an **Operations** tab between Focus and AI activity. It shows the focus time spent on operations, by day, by type, and by operation, and as a share of all focus. Time is counted from sessions started with **Focus** on an operation card; typing a new focus target ends the link. The activity ledger keeps only the operation's id and type with each session.

### Changed

- PhD Operations is now simply Operations (事务 in Chinese).
- The language button replaces the initials button at the right of the top bar. Profile stays in the sidebar.
- Interface copy is shorter: page and drawer descriptions, explanatory placeholders, and repeated hints are gone, and the user guide is condensed.
- Statuses, stages, sections, and the other record vocabularies are still written to the vault in English whatever the interface language; only their labels are translated.
- Dates, times, and large numbers follow the interface language; token totals use compact notation (1.2K, 1.2万).

## 1.0.0

### Renamed, with no fallback to the old names

Every remaining `WorkBuddy` name is now `ScholarBuddy`:

- Settings: `WORKBUDDY_*` → `SCHOLARBUDDY_*`, and `NEXT_PUBLIC_WORKBUDDY_BRIDGE_PORT` → `NEXT_PUBLIC_SCHOLARBUDDY_BRIDGE_PORT`.
- Background service: `com.workbuddy.research-bridge` → `tech.scholarbuddy.research-bridge`, logging to `~/Library/Logs/ScholarBuddy`.
- Browser storage and the focus-history database: `workbuddy-…` → `scholarbuddy-…`.
- Vault: the passage property `workbuddyKeywords` → `keywords`; AI notes are marked `scholarbuddyGenerated`; only `ScholarBuddy/AI Outputs` is kept out of search.
- Calendar: events the focus timer writes carry `[ScholarBuddy-ID:…]`.

Upgrade an existing installation once, in this order:

1. With the old version still running, open ScholarBuddy and save any Research log or Idea draft. Pairing, today's tasks, the focus timer, and the chosen AI provider live under the old storage keys and are not carried over; focus history already synced to the Bridge is kept.
2. Remove the old background service, or it will fight the new one for the port:
   `launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.workbuddy.research-bridge.plist` and then `rm ~/Library/LaunchAgents/com.workbuddy.research-bridge.plist`.
3. Rename the settings: `sed -i '' 's/WORKBUDDY_/SCHOLARBUDDY_/g' .env.local`. Rename `NEXT_PUBLIC_WORKBUDDY_BRIDGE_PORT` on the hosting side too if it was set there.
4. Rename the property in saved passages: `sed -i '' 's/^workbuddyKeywords:/keywords:/' "<vault>/ScholarBuddy/passages/"*.md`.
5. Delete the old shared token, which nothing accepts any more: `rm bridge/.workbuddy-token`.
6. If the vault has a `WorkBuddy/AI Outputs` folder, move its notes into `ScholarBuddy/AI Outputs` so earlier answers are not searched as evidence.
7. `npm run bridge:install`, then pair each browser again from Connections.

### Changed

- The Bridge is split into one module per concern; `bridge/server.mjs` remains the entry point. See the layout in `bridge/README.md`.

- Each site now pairs for its own credential: bound to that origin, stored as a hash, lapsing 30 days after last use or 180 days after pairing. The setup page lists paired browsers and can limit one to reading or revoke it, and Disconnect revokes on the Bridge as well as in the browser. `npm run bridge:token` has no shared token to print unless `SCHOLARBUDDY_BRIDGE_TOKEN` is set.
- A pairing code issued by the setup page only works at the site it sends the browser back to.
- AI answers, the passage library, and the submission mail check now say when they only covered part of the vault, the Zotero annotations, or the inbox.
- AI output is written to the vault with image embeds turned into links and resource-loading HTML turned into text.
- A record property whose name could not be read back (a colon or a line break in it) is refused instead of silently becoming other properties.
- Provider keys are sent for verification only on an explicit connection test, not on every status poll.
- Social-preview addresses no longer follow `X-Forwarded-Host`; set `NEXT_PUBLIC_SITE_URL` behind your own proxy.
- The request size limit is 1 MB, so a long manuscript saves as one record. The Bridge's service logs start over past 5 MB, and focus checkpoints reach the Bridge with the half-minute sync instead of every 15 seconds.
- Removed the Worker's unused image-optimisation route and the browser-supplied `emails` parameter of `/submissions/email-sync`.
- Updated Wrangler and the Cloudflare Vite plugin to patched releases; CI audits production dependencies.
- Added `node scripts/calendar-audit.mjs`, which reports whether repeating events are missing from Today's schedule on this Mac.

- A note the Bridge cannot load no longer empties the workbench: it is listed in a banner with its path and reason, and every other record loads. Frontmatter that Obsidian rewrote as YAML lists or unquoted numbers is read as the same record.
- Scripts on the hosted page now run under a per-request nonce (`proxy.ts`); `'unsafe-inline'` is gone from `script-src`.
- Added **Disconnect this browser** to Connections, and stated in SECURITY.md and PRIVACY.md what a paired site can reach and what AI workflows send.
- New installations no longer trust `http://localhost` development servers; contributors opt in with `npm run setup -- --dev`. The Bridge ignores non-`https` origins other than this computer's own localhost and reports them on startup. **Existing installations keep their `.env.local`: remove the localhost entries from `SCHOLARBUDDY_ORIGINS` unless you develop locally.**
- Focus sessions are written to Calendar only to a calendar chosen under Connections → Focus sessions. **This is now off by default; choose a calendar to keep the previous behaviour.**
- Esc and a click outside a drawer ask before discarding unsaved record edits or an unsaved AI answer.
- Tasks added from an AI plan each get their own id; previously they were ticked and deleted together.
- CI type-checks and runs the Next.js production build in addition to the Vinext build.

- Added optional background reminders on macOS for upcoming Calendar events (24 hours prior; 09:00 previous day for all-day events) and PhD Operations deadlines (one month, seven days, and one day prior at 09:00).
- Compiled a lightweight local reminder helper (`ReminderHelper.swift`) on demand using UserNotifications and EventKit, reevaluating upcoming items against local state without leaking reminder content to AI providers.
- Integrated reminder controls into the Connections drawer with inline connection diagnostics and status feedback.
- Added an interactive "About ScholarBuddy" overview and demo workspace directly in the navigation sidebar to guide researchers through core workflows.
- Introduced accessible WAI-ARIA tab navigation (`ModuleTabs`) supporting arrow-key and Home/End navigation across modules.
- Standardized drawer headers with a unified component (`DrawerHeader`) and added smooth View Transitions when closing or reordering overlay drawers.
- Enhanced PhD Operations with relative deadline countdowns, overdue tracking, and defensive date parsing for hand-edited Markdown notes.
- Today's daily task list now sinks completed items below active tasks with smooth View Transitions.
- Added optimistic concurrency protection using SHA-256 `contentHash` alongside version tags for Obsidian records, preventing concurrent edits in Obsidian from being silently overwritten.
- Enforced loopback Host header validation across the local Bridge HTTP service, halted startup on invalid tokens, and sanitized upstream error diagnostics to prevent credential leaks in logs.
- Serialized Bridge configuration updates and added safe recovery for journal submission attempts and email matching, ensuring interrupted writes complete idempotently without duplicate timeline events.
- Defined formal workflow contracts for `@ask-knowledge`, `@evidence-for-claim`, `@result-explain`, `@reviewer-critique`, `@plan-today`, and `@write-section`, scoping required inputs, visible evidence sources, and direct output formats.
- Hardened the client SSE streaming parser to require a single terminal completion frame and handle expired conversation turns (HTTP 410) cleanly.
- AI follow-up conversations now preserve the full initial evidence snapshot even when early dialogue turns are trimmed.
- Batch-retrieved Zotero item keys to avoid serial HTTP round-trips when reading collections.
- Replaced generic review notes with dedicated "Feedback & response" work items linking reviewer critiques and research gaps directly to manuscript sections, with inline resolution decisions.
- Added automated section heading classification and back-matter preservation for Markdown manuscripts.
- Added journal submission attempt tracking, stage history, and email synchronization with matching confidence scores.
- Made the macOS Calendar brand icon dynamic, displaying today's actual date in the interface.
- Added authentic vector and high-resolution service brand marks for OpenAI, Claude, Grok, Gemini, Kimi, Obsidian, and Zotero.
- Improved focus session celebrations to defer celebration playback until the browser tab is actively visible.
- Added a research log and an idea inbox to Today. Both capture with a single field, attach the date, active project, and current paper automatically, and save as readable Obsidian records.
- Added ⌘ J and ⌘ I to capture a log entry or an idea from any module, and ⌘ ⏎ to save a log entry.
- Ideas are promoted to a real research question in one click and keep a link to the record they became; dropping one keeps it readable rather than deleting it.
- The last three days of log entries and the waiting ideas now travel with the project context into every AI workflow.
- Added Projects → Ideas and Operations → Research log for the full history.
- Renamed the public product to ScholarBuddy and prepared `scholarbuddy.tech` as the custom Bridge origin.
- Added selectable ChatGPT/OpenAI, Claude, Grok, and Gemini API adapters alongside DeepSeek and Kimi.
- Relicensed the repository for public contribution under Apache-2.0.
- Replaced developer-specific Bridge service paths with a generated macOS LaunchAgent.
- Added portable setup, service management, and credential rotation commands.
- Replaced permanent-token pairing display with five-minute one-time codes.
- Added exact-origin validation, public Bridge port configuration, hosted security headers, documentation, and CI.
- Removed unused authentication and database starter code.
