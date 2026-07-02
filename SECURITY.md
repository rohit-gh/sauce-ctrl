# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| latest `main` | yes |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, report security issues privately to the repository maintainers via
GitHub Security Advisories (if enabled) or by contacting the maintainers
directly through the contact method on the repository profile.

Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We aim to acknowledge reports within a few business days.

## Scope

SauceControl runs **locally** on the developer's machine with access to:

- The filesystem (git repositories the user adds)
- Shell execution (`git`, `gh`, interactive terminal)
- `~/.sauce-ctrl/` SQLite database

Treat SauceControl as a **trusted local tool** — only add repositories you trust,
and run it on machines you control.

## Known considerations

- The terminal WebSocket server (`SAUCE_WS_PORT`, default `3009`) binds to
  `127.0.0.1` only, rejects non-loopback `Origin` headers, and requires a
  per-run token minted by the app and served same-origin at
  `/api/terminal/token`. This prevents both LAN access and cross-site pages
  from opening a shell.
- GitHub authentication is delegated to the `gh` CLI; SauceControl does not copy
  or store your GitHub token in its database.
