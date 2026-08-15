# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's private vulnerability reporting feature for this repository. Include affected versions, reproduction steps, impact, and any suggested mitigation. Do not include real research data or credentials.

Maintainers should acknowledge a complete report within seven days and coordinate disclosure after a fix is available. No response-time or bounty guarantee is implied.

## Supported version

Security fixes target the latest release and the default branch.

## Security boundary

The hosted UI is not trusted with local credentials. The Bridge must remain bound to loopback, require exact allowed origins and a paired bearer credential, and keep provider keys in ignored local configuration. A public deployment does not make a visitor's local data public.
