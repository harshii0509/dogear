# Contributing to Dogear

I build Dogear on my own, in public, and it's MIT licensed. Issues and pull requests are welcome,
from people and from coding agents.

## Find something to work on

- [Good first issues](https://github.com/harshii0509/dogear/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
  are small and well scoped, and each one names the files to look at.
- [Help wanted](https://github.com/harshii0509/dogear/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22)
  issues are bigger pieces from the roadmap.
- [ROADMAP.md](ROADMAP.md) lists what's next, what's done, and what Dogear won't do and why.

Found a bug, or want something that isn't listed? [Open an issue](https://github.com/harshii0509/dogear/issues/new/choose)
first, so we can agree on the shape before you write the code.

## Set up

Node 20, as in CI.

```bash
git clone https://github.com/harshii0509/dogear.git
cd dogear
npm ci
npm test             # every test in test/, with Node's test runner through tsx
npm run typecheck    # tsc, no emit
npm run build        # tsup → dist/
```

To see the widget, open `examples/html/index.html` after a build. Comments go to your browser's
localStorage. `npx dogear serve` runs a local comments server if you need a backend.

The README's [Working on Dogear](README.md#working-on-dogear) table says where things live.
Coding agents should start with [AGENTS.md](AGENTS.md).

## Ground rules

- Keep each pull request to one change, with a test, and run `npm run typecheck && npm test` before you open it.
- Add a line to [CHANGELOG.md](CHANGELOG.md), under Unreleased, for anything a user would notice.
- A change to what the server accepts or returns changes [docs/contract.md](docs/contract.md), `docs-site/backends/contract.mdx` and `test/server.test.ts` with it.
- The main entry (`src/index.ts`) stays free of the DOM, and the browser code never imports `src/server/`.
- Example people in docs, tests and demos are made up. They're Alex Doe, Sam, Jordan Lee, Riley and Casey, the assistant is Scout, and the demo product is Fernhill.

## Licence

By contributing, you agree that your contribution is licensed under the [MIT licence](LICENSE).
