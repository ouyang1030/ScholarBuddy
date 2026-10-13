# Privacy

ScholarBuddy is designed around user-controlled local data.

## Data locations

- Project, manuscript, review, reading, passage, and submission records are readable Markdown files under `ScholarBuddy/` in the configured vault.
- Focus state, daily tasks, UI preferences, and the paired Bridge credential are stored in the current browser origin.
- Zotero items and annotations are read from Zotero Desktop when requested.
- Calendar events are read when Today's schedule is open, and changed when you add, edit, or delete one there. Finished focus sessions are written as events only after you choose a calendar under Connections → Focus sessions; that setting starts off.
- Mail is scanned only once a submission attempt exists: opening Submission Tracker checks at most once every six hours, and **Check email updates** checks on demand. macOS asks for Automation permission before the first scan. The scan is limited to recent Inbox messages matching saved submission context, and message bodies are not sent to the browser.
- On macOS, AI credentials entered through local setup are stored in Keychain. `.env.local` and the Bridge process environment remain supported fallbacks for developers and other systems.

## External AI providers

When a user runs an AI workflow, the following are sent to the provider selected for that run, and only the sources ticked in the workflow drawer are included:

- The task text, and for section and result workflows the manuscript section or the result fields entered in the drawer.
- **Zotero literature**: titles, authors, year, DOI, keywords, and abstracts of matching items; for evidence checks, short excerpts from their PDFs.
- **Obsidian notes**: titles, vault-relative paths, and a snippet of each matching note. The search covers the whole configured vault, not only `ScholarBuddy/`.
- **Paper frame & passages**: the active project and current paper (title, stage, journal, word counts, next action), open feedback and planned responses, the reading queue, open commitments with due dates, research log entries from the last three days, idea inbox titles, and up to eight saved passages.
- **Committed time** (planning only): the start, end, and title of Calendar events for the next seven days. Locations and notes are not sent.

Follow-up questions resend the same retrieved sources. ScholarBuddy does not proxy these requests through a shared hosted account. Users are responsible for reviewing the provider's privacy terms and avoiding sensitive input they are not permitted to send.

## Public deployments

Opening the hosted interface does not grant access to another person's computer. Each browser must reach and pair with a Bridge on its own machine. Pairing is a grant of trust in that site: from then on its pages can read and change local data through the Bridge until the browser is disconnected in Connections or the Bridge token is rotated. Pair only with a deployment whose operator you trust. Site operators should publish an audience-appropriate privacy notice and comply with applicable requirements if they add analytics, accounts, storage, or other data collection.

Optional reminders run locally and are off by default. When enabled, ScholarBuddy
Reminders reads calendar event metadata and PhD Operations deadlines to send macOS
notifications. macOS may retain notification titles/dates in Notification Center.
The Bridge stores reminder settings, an expiring deduplication ledger, and a
transient retry payload locally under `bridge/.notifications`. Notification links
carry navigation identifiers in a URL fragment, which is not sent to the hosted
server. These reminder inputs are not sent to AI providers.
