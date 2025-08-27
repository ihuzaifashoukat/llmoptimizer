# Contributing to llmoptimizer

Thanks for your interest in contributing! This guide helps you set up the project, make changes safely, and submit a great PR.

## Prerequisites

- Node.js 18+
- npm 9+ (or a compatible package manager)

## Setup

1) Clone and install
```
git clone https://github.com/ihuzaifashoukat/llmoptimizer
cd llmoptimizer
npm install
```

2) Build and develop
```
# One-off build
npm run build

# Watch mode during development
npm run dev

# Type check
npm run typecheck
```

3) Try the CLI locally
```
# After building, run the compiled CLI
node dist/cli.cjs --help

# Or run installed binary if linked
npx llmoptimizer --help
```

## Project structure (high level)

- `src/lib/*`: Core crawling, extraction, sitemap parsing, robots, markdown emitters.
- `src/integrations/*`: Framework integrations (vite, next, nuxt, astro, remix, docs, auto, node).
- `src/adapters/*`: Route detection per framework.
- `src/cli.ts`: CLI entry and subcommands.
- `README.md`: User docs; please keep examples current.

## Development guidelines

- TypeScript throughout; keep public APIs typed and minimal.
- Favor small, composable functions in `src/lib` and keep integrations thin.
- Avoid hard dependencies on frameworks in core; use dynamic imports in integrations (e.g., Nuxt, Next) for optionality.
- Use `globby` for file discovery, `cheerio` for HTML parsing, and `zod` for CLI/JSON validation.
- Keep defaults sensible and safe; expose options for advanced tuning.
- Don’t broaden scope: fix the root cause related to the change at hand.

### Style

- Consistent naming: `llms.txt` (not `llm.txt`).
- Keep logs concise; reserve verbose output for a future `--verbose` mode.
- Update examples and docs when changing CLI flags or default outputs.

### Tests

- Add targeted tests where practical (unit for lib helpers, light integration for CLI).
- Avoid network calls in tests; mock fetch or use fixtures.
- If no runner is configured, include a simple script or fixture to demonstrate behavior and keep it small.

### Commits & PRs

- Prefer Conventional Commits (feat:, fix:, docs:, refactor:, chore:, perf:).
- Keep PRs focused and reasonably small.
- Include:
  - What changed and why
  - Any breaking changes and migration notes
  - Screenshots or sample outputs when relevant (e.g., llms.txt snippets)
- Update `CHANGELOG.md` and `README.md` when user-facing behavior changes.

## Adding or updating integrations

- Auto-detect where possible (package.json, common build dirs), but keep detection conservative.
- Use dynamic imports to keep integrations optional (no hard deps).
- Expose a clear postbuild entry point and defaults to `llms.txt`.
- Document new flags and behaviors in README with minimal user friction.

## Reporting issues

- Include environment info (OS, Node version) and exact command(s) used.
- Attach snippets of relevant output (`--help`, logs, sample llms files) where helpful.
- If reproducible via a minimal repo, link it.
- Contact for questions/coordination: ihuzaifashoukat@gmail.com or open an issue at https://github.com/ihuzaifashoukat

## Code of conduct

Be kind, constructive, and inclusive. We welcome contributions from developers of all backgrounds and experience levels.

Thank you for helping improve llmoptimizer!
