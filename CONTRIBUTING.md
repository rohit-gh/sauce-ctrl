# Contributing to SauceControl

Thank you for your interest in contributing! SauceControl is a local Git GUI built with Nuxt 4 and Bun.

## Getting started

1. Read [docs/getting-started.md](./docs/getting-started.md) to install and run the project.
2. Skim [docs/architecture.md](./docs/architecture.md) before making structural changes.
3. Check [.cursor/rules/](./.cursor/rules/) for conventions agents and humans follow.

## Development workflow

```bash
bun install
cp .env.example .env    # optional
bun run dev
```

- Use **Bun** as the runtime (`bun run dev` runs `bun --bun nuxt dev`).
- To verify the Linux standalone build: `bun run build:appimage` (see [getting started → AppImage](./docs/getting-started.md#run-as-a-standalone-app-appimage)).
- Keep changes focused — one concern per PR.
- Match existing patterns in `app/components/`, `app/stores/`, and `server/utils/`.

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Make your changes with clear commit messages.
3. Manually test: add a repo, view history, stage/commit, open terminal, GitHub setup modal.
4. Open a PR describing **what** changed and **why**.

## Code guidelines

- **Frontend**: Nuxt components in `app/components/`, state in Pinia stores.
- **Backend**: Thin handlers in `server/api/`, logic in `server/utils/`.
- **Git**: Shell out to `git` CLI; use `\u001f` field separators in format strings (not NUL in args).
- **Terminal**: Do not move WebSocket server into Nitro or add `node-pty`.
- **Imports**: Relative paths unless importing from `node_modules`.

## Reporting issues

Use GitHub Issues. Include:

- OS and Bun version (`bun --version`)
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs (Nuxt dev output, browser console)

## Security

See [SECURITY.md](./SECURITY.md) for reporting vulnerabilities.

## Code of conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). Be respectful and constructive.
