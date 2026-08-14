# WorkBuddy local research bridge

The deployed WorkBuddy UI uses this loopback-only service to reach private, Mac-local research systems without shipping API keys or vault contents in the web bundle.

Configuration lives in the ignored `.env.local` file at the repository root. Supported keys:

- `DEEPSEEK_API_KEY` for DeepSeek chat completions.
- `KIMI_API_KEY` for Kimi chat completions.
- `OBSIDIAN_VAULT_PATH` for Markdown search and `WorkBuddy/` note writes.
- `ZOTERO_LOCAL_URL` for the Zotero Desktop Local API.
- macOS Calendar through the user-approved Calendar automation permission, including today reads and explicit event create, update, and delete actions.
- macOS Mail through a user-enabled submission tracker. WorkBuddy scans only recent Inbox messages whose subject or sender matches a saved submission ID or manuscript title. High-confidence status changes are appended automatically; ambiguous matches require confirmation.

Run it manually with `npm run bridge`. On this Mac, `com.workbuddy.research-bridge.plist` is also installed as a per-user LaunchAgent so the bridge starts at login and restarts if interrupted.

The first email check may trigger a macOS Automation permission prompt for Mail. Disabling “Auto-check every 15 min” stops scheduled scans; manual checks remain available. WorkBuddy stores the matching message ID, subject, sender, date, and a short audit note with the status event rather than copying the mailbox into Kbase.

The HTTP service binds only to `127.0.0.1`. CORS is restricted to `WORKBUDDY_ORIGINS`, and private-network preflight support allows the deployed HTTPS workbench to request access from a compatible desktop browser.
