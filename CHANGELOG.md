# Changelog

All notable changes will be documented here. This project follows semantic versioning once stable releases begin.

## Unreleased

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
