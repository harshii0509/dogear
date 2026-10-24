# AGENTS.md

Dogear is Figma-style comments for any web page, published as `@harshi04/dogear`. This file is
for coding agents working in this repo. For the file map and what each part does, read
[README.md → Working on Dogear](README.md#working-on-dogear). For the rules every backend keeps,
read [docs/contract.md](docs/contract.md).

## Commands

Node 20, as in CI:

```bash
npm ci
npm test            # Node's test runner through tsx, test/*.test.ts
npm run typecheck   # tsc --noEmit
npm run build       # tsup → dist/
```

Run `npm test`, `npm run typecheck` and `npm run build` before you say a change is done.

## What must stay true

- The author of a comment comes from the server (the session, or the signed guest cookie), never from the browser.
- `src/index.ts`, the main entry, has no DOM, so servers can import it. The browser code never imports `src/server/`.
- The layer draws into a shadow root. Its stylesheet is `src/styles.ts`; the host page's CSS must not reach in, and ours must not leak out.

## Changes that touch several files

- **A prop** goes into `CommentsProps` in `src/comments.tsx`, its attribute and `mount()` in
  `src/element.ts`, the props table in `README.md`, and `CHANGELOG.md`. The README ships in the npm
  package, and the setup prompt sends agents to it, so keep the table exact.
- **What the server accepts or returns** changes `docs/contract.md` and `test/server.test.ts` with it.
- **A new module** gets its own `test/<module>.test.ts`.

## Gotchas

- Postgres JSON parameters are cast `$n::text::jsonb`, never a bare `::jsonb`: some clients encode
  the string twice (see `src/server/postgres.ts`).
- After a build, pack with `npm pack --ignore-scripts`; without it you can ship stale `.d.ts` files.

## Boundaries

- Work on a branch and open a pull request. Don't push to `main`, and don't publish to npm: the maintainer does both.
- Never commit secrets or `.env` files. Example values go in docs as placeholders.
- Example people in docs, tests and demos are made up: Alex Doe, Sam, Jordan Lee, Riley and Casey, and the assistant is Scout. Use example domains such as `acme.test`. No real people or companies.
