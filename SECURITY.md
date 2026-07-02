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

- The terminal WebSocket server binds to a local port (`SAUCE_WS_PORT`, default `3009`).
  It is intended for localhost use during development.
- GitHub tokens may be cached in `~/.sauce-ctrl/sauce-ctrl.sqlite` after `gh auth`.
  Protect this file like any other credential store.
