# Contributing

Thank you for helping improve ScholarBuddy.

## Before opening a change

1. Search existing issues and pull requests.
2. Keep changes focused and preserve the local-first security boundary.
3. Never commit API keys, Bridge tokens, vault contents, email data, calendar data, personal paths, or deployment identifiers.
4. For large features or new data integrations, open a proposal before implementation.

## Development workflow

```bash
npm install
npm run setup -- --dev
npm run lint
npm run typecheck
npm test
```

`--dev` lets the local development servers use your Bridge; a plain `npm run setup` trusts only the hosted origins.

Add tests for changed behavior. Bridge write routes must retain exact-origin checks, pairing authentication, input limits, and safe filesystem boundaries. Platform-specific features should fail gracefully when unavailable.

Use clear commits and explain user-visible changes, privacy impact, and validation in the pull request. By contributing, you agree that your contribution is licensed under Apache-2.0.
