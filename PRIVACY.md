# Privacy

ScholarBuddy is designed around user-controlled local data.

## Data locations

- Project, manuscript, review, reading, passage, and submission records are readable Markdown files under `ScholarBuddy/` in the configured vault.
- Focus state, daily tasks, UI preferences, and the paired Bridge credential are stored in the current browser origin.
- Zotero items and annotations are read from Zotero Desktop when requested.
- Calendar events are read or changed only through explicit ScholarBuddy actions.
- Mail scanning is opt-in and limited to recent messages matching saved submission context.
- On macOS, AI credentials entered through local setup are stored in Keychain. `.env.local` and the Bridge process environment remain supported fallbacks for developers and other systems.

## External AI providers

When a user runs an AI workflow, the prompt and selected Zotero or Obsidian context are sent to the configured provider. ScholarBuddy does not proxy these requests through a shared hosted account. Users are responsible for reviewing the provider's privacy terms and avoiding sensitive input they are not permitted to send.

## Public deployments

Opening the hosted interface does not grant access to another person's computer. Each browser must reach and pair with a Bridge on its own machine. Site operators should publish an audience-appropriate privacy notice and comply with applicable requirements if they add analytics, accounts, storage, or other data collection.
