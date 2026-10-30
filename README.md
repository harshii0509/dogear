# Dogear

[![npm](https://img.shields.io/npm/v/@harshi04/dogear)](https://www.npmjs.com/package/@harshi04/dogear)
[![MIT licence](https://img.shields.io/badge/licence-MIT-blue)](LICENSE)
[![CI](https://github.com/harshii0509/dogear/actions/workflows/ci.yml/badge.svg)](https://github.com/harshii0509/dogear/actions/workflows/ci.yml)

Open source, MIT, and it runs on your own backend. [dogear.harshux.com](https://dogear.harshux.com)

Figma-style comments on any web page. Click to drop a pin or drag to mark an area, then write.
You get threads, replies, edit, resolve, and live updates. It works in plain HTML, React and Next.js.

Use it for design reviews on a staging site, feedback from visitors on a live one, or to hand
what people said straight to your coding agent.

<p align="center">
  <img src="media/demo.gif" width="960" alt="A pricing page with Dogear: pressing C, clicking the Start free trial button to pin a comment and posting it, then opening another person's thread, replying, and reacting with a party emoji.">
</p>

**Bring your own backend, or use ours.** `@harshi04/dogear/server` is the whole backend as one
route handler over Postgres, a JSON file or memory. Or give Dogear a five-function adapter over
Supabase, Firebase or your own API. With no backend at all, comments stay in the browser.

**Read the docs at [dogear.harshux.com/docs](https://dogear.harshux.com/docs).**

## Install

```bash
npm install @harshi04/dogear     # or pnpm / yarn / bun
```

For plain HTML, load it from a CDN, or download `element.global.js` from a
[release](https://github.com/harshii0509/dogear/releases) and serve it from your own site:

```html
<script src="https://cdn.jsdelivr.net/npm/@harshi04/dogear@0.6/dist/element.global.js"></script>
<dogear-comments shortcut="c"></dogear-comments>
```

## Quick start

```tsx
// app/dogear-comments.tsx (Next.js App Router; in plain React, render <Comments> directly)
"use client";
import { Comments } from "@harshi04/dogear/react";
export const DogearComments = () => <Comments shortcut="c" />;
// then render <DogearComments /> once in app/layout.tsx
```

With no adapter, comments are stored in this browser's localStorage, which is enough to try it out.
Press C, click anything on the page, and write. To share comments between people,
[pick a backend](https://dogear.harshux.com/docs/backends/overview).

## Docs

| | |
|---|---|
| Start | [Quickstart](https://dogear.harshux.com/docs/quickstart) · [Plain HTML](https://dogear.harshux.com/docs/plain-html) · [Set it up with your coding agent](https://dogear.harshux.com/docs/agent-setup) |
| Concepts | [How it works](https://dogear.harshux.com/docs/concepts/how-it-works) · [How pins stay put](https://dogear.harshux.com/docs/concepts/pins) |
| Backends | [Pick a backend](https://dogear.harshux.com/docs/backends/overview) · [The server](https://dogear.harshux.com/docs/backends/server) · [Next.js and Postgres](https://dogear.harshux.com/docs/backends/next-postgres) · [Supabase](https://dogear.harshux.com/docs/backends/supabase) · [The contract](https://dogear.harshux.com/docs/backends/contract) |
| Guides | [Layouts](https://dogear.harshux.com/docs/guides/layouts) · [Theming](https://dogear.harshux.com/docs/guides/theming) · [Guests](https://dogear.harshux.com/docs/guides/guests) · [Mentions and alerts](https://dogear.harshux.com/docs/guides/mentions) · [An AI assistant](https://dogear.harshux.com/docs/guides/assistant) · [Reactions](https://dogear.harshux.com/docs/guides/reactions) · [Forms](https://dogear.harshux.com/docs/guides/forms) · [Review links](https://dogear.harshux.com/docs/guides/review-links) |
| Agents | [The MCP server](https://dogear.harshux.com/docs/agents/mcp) · [Copy as Markdown](https://dogear.harshux.com/docs/agents/markdown) |

The same guides ship in the npm package as Markdown, for coding agents working offline:
[docs/server.md](docs/server.md), [docs/contract.md](docs/contract.md), [docs/mcp.md](docs/mcp.md)
and [docs/examples/](docs/examples).

## Props

Each prop of `<Comments>` has an attribute on `<dogear-comments>`, except the ones that take a
function or a React node (marked —). On the element, `endpoint="/api/comments"` makes an
`httpAdapter` for you, and `guests` adds `{ guests: true }`. From a script, `Dogear.mount({ adapter, layout, navigate, … })`
takes every prop but `enabled` and `icons`, functions included.

| Prop | Attribute | Default | What it does |
|---|---|---|---|
| `adapter` | `endpoint`, or the element's `adapter` property | `localAdapter()` | where comments live; read once on mount |
| `shortcut` | `shortcut` | none | a key that toggles comment mode, e.g. `"c"` |
| `ignore` | `ignore` | none | a CSS selector to keep comments off, e.g. `"nav, .chat-widget"`. Pressing on a match does nothing |
| `activation` | `activation` | `"always"` | `"param"` shows the layer only after `?review` is in the URL, then for the rest of the tab; `?review=off` ends it. Plain visitors see a clean page |
| `reviewParam` | `review-param` | `"review"` | the query parameter `activation="param"` listens for |
| `enabled` | — | `true` | `false` renders nothing (e.g. only on preview deploys) |
| `layout` | `layout` | `"fab"` | `"tray"`: a pill that opens into a list of every thread; `"dock"`: a button you drag anywhere that opens into controls and a list (see [Layouts](https://dogear.harshux.com/docs/guides/layouts)) |
| `navigate` | — | full page load | how a tray row on another page gets there, e.g. your router's `push` |
| `pageLabel` | — | the path | what a page is called in the tray's list, e.g. `(path) => titles[path] ?? path` |
| `deletable` | — | its author, or an admin | who may delete a comment, to match the server's `deletable`, e.g. anyone may delete the assistant's |
| `linkParam` | `link-param` | `"dogear"` | the query parameter of a link to a thread, e.g. `"comment"` for `?comment=<id>`; a reply's id opens its thread. `?dogear=` always works too |
| `onActiveChange` | — | none | called with `true`/`false` when the visitor opens or closes comments (or a thread link opens them), e.g. for analytics; not on a reload |
| `resolvers` | `resolvers` | `"anyone"` | `"authors"` shows Resolve only to the thread's author and admins, for public pages |
| `resolve` | `no-resolve` | `true` | `false`: no resolving at all, just a list of comments. Every thread shows, with no Resolve, Reopen or Resolved switch |
| `icons` | — | Dogear's own | your icon set, by name (see [Theming](https://dogear.harshux.com/docs/guides/theming)) |
| `joinFirst` | `join-first` | `false` | with guests and the tray: opening the comments first asks a visitor's name and avatar, then shows the threads and pins |
| `reactions` | `reactions='[…]'` | none | the emoji people can react with, e.g. `["❤️", "👍", "😂", "🔥", "👀", "🎉"]`: chips with counts under comments, yours ringed, and a + that unfolds the set. Needs an adapter with `react` |
| `reactionsIn` | `reactions-in` | `"everywhere"` | `"thread"`: reactions only on an open comment, not in the tray's list |
| `emojiData` | `emoji-data` | jsDelivr's `emojibase-data@17` | where the set's "···" picker loads every other emoji from, read as `${emojiData}/en/data.json`. Point it at your own copy of Emojibase's data to self-host |
| `theme` | `theme` | `"dark"` | `"light"`, or `"auto"` to follow the visitor's system setting. Changing the attribute redraws at once. See [Theming](https://dogear.harshux.com/docs/guides/theming) |
| `pick` | `pick` | `"element"` | `"pin"`: the pin you'd drop, with your avatar, follows the pointer and a click drops it. Nothing on the page is outlined or named, and there are no areas, for sites whose visitors comment rather than inspect |
| `pulse` | `no-pulse` | `true` | `false`: no Pulse switch in the tray or the dock's panel. Unreleased, coming in the next version |
| `locations` | `no-locations` | `true` | `false`: no page or "on heading …" under comments in the list or on an open one, just name · time and the text. Pins still show where |
| `avatars` | `avatars='{…}'`, or the element's `avatars` property | none | avatars for people without a photo, by key: `{ sky: "linear-gradient(…)" }`. Guests pick one with their name; everyone else gets one by id |

**Your page's own shortcuts.** While comment mode is on, the layer's host on the page carries
`data-active`, so a page shortcut can stand down rather than fire as someone writes a comment.
Key events from Dogear's fields reach the page retargeted to that host, so check
`event.composedPath()[0]` rather than `event.target` for a field:

```js
addEventListener("keydown", (event) => {
  if (document.querySelector("[data-comment-layer][data-active]")) return;
  const target = event.composedPath()[0];
  if (target.isContentEditable || target.closest?.("input, textarea, select")) return;
  // …your shortcut
});
```


## Working on Dogear

For contributors, and for coding agents working in this repo. Issues and pull requests are welcome:
[CONTRIBUTING.md](CONTRIBUTING.md) has how to pick one up. Coding agents: start with [AGENTS.md](AGENTS.md).

**Commands** (Node 20, as in CI):

```bash
npm ci               # install
npm test             # every test in test/, with Node's test runner through tsx
npm run typecheck    # tsc, no emit
npm run build        # tsup → dist/: the main entry, react, server, element, element.global.js and the CLI
npm run pulse        # how Dogear is doing: npm installs, stars, traffic, issues, and public repos using it
```

**Where things are.**

| Path | What's there |
|---|---|
| `src/comments.tsx` | the whole widget, as one React component: pins, thread cards, the composer, the tray and dock, the join step, reactions |
| `src/styles.ts`, `src/motion.ts` | the stylesheet injected into the shadow root (both themes), and the motion |
| `src/anchor.ts` | pinning a comment to an element, and finding that element again |
| `src/model.ts` | the shapes every part shares (`Comment`, `User`, `Anchor`), validation and limits |
| `src/adapter.ts` | the `Adapter` interface, `localAdapter` and `httpAdapter` |
| `src/element.ts` | `<dogear-comments>` and `Dogear.mount`: attributes into props |
| `src/snapshot.ts`, `src/markdown.ts` | forms that come back with a thread, and threads as Markdown |
| `src/pulse.ts` | `pulseOf`: the figures behind the Pulse view and `dogear_pulse` |
| `src/server/` | `createDogear` (`handler.ts`), the stores (`store.ts`, `postgres.ts`) and alerts (`notify.ts`) |
| `src/cli.ts`, `src/serve.ts`, `src/mcp.ts` | the `dogear` command, `dogear serve` and `dogear mcp` |
| `src/index.ts`, `src/react.ts`, `src/server/index.ts` | the public entry points; `tsup.config.ts` builds each one |
| `test/` | one `*.test.ts` per module; `server.test.ts` checks the contract on every store |
| `docs/` | server, contract and MCP guides, and recipes in `docs/examples/`, as Markdown. It ships in the npm package, for agents working offline |
| `docs-site/` | the docs site at [dogear.harshux.com/docs](https://dogear.harshux.com/docs), in Mintlify MDX. `docs.json` holds the navigation; `cd docs-site && npx mint dev` previews it. Merging to `main` publishes it. Not in the npm package |
| `media/` | the clip in this README and the diagrams in the docs; `node media/diagrams.mjs` redraws the diagrams. Not in the npm package |
| `scripts/pulse.mjs` | `npm run pulse`, for maintainers: npm's download counts and the repo's GitHub figures, through `gh`. Traffic needs push access. It keeps a local history in `.pulse/` (gitignored) to show what changed. Not in the npm package |

**Ground rules.**

- Keep each PR to one change, with a test, and run `npm run typecheck && npm test` before you open it.
- Add a line to [CHANGELOG.md](CHANGELOG.md) for anything a user would notice.
- A change to what the server accepts or returns changes [docs/contract.md](docs/contract.md) and `test/server.test.ts` with it.
- The main entry (`src/index.ts`) stays free of the DOM, and the browser code never imports `src/server/`.
- Example people in docs, tests and demos are made up: Alex Doe, Sam, Jordan Lee, Riley and Casey, and the assistant is Scout.

What's planned is in [ROADMAP.md](ROADMAP.md).

## License

[MIT](LICENSE). Copyright © 2026 Harshvardhan Agarwal. Use it, fork it, build on it.
