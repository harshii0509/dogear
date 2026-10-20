# Dogear

Figma-style comments on any web page. Click to drop a pin or drag to mark an area, then write.
You get threads, replies, edit, resolve, and live updates. It works in plain HTML, React and Next.js.

**Bring your own backend, or use ours.** `@harshi04/dogear/server` is the whole backend as one route handler
over Postgres, a JSON file or memory: it works with nothing but a database, and turns on guests,
your sign-in, private pages and moderation as you add them. Or give Dogear a five-function adapter
over Supabase, Firebase, your own API, or anything else. It also works with no backend at all,
using localStorage.

## Install

```bash
npm install @harshi04/dogear     # or pnpm / yarn / bun
```

For plain HTML, load it from a CDN, or download `element.global.js` from a
[release](https://github.com/harshii0509/dogear/releases) and serve it from your own site:

```html
<script src="https://cdn.jsdelivr.net/npm/@harshi04/dogear@0.5/dist/element.global.js"></script>
```

## Set it up with your coding agent

Open Claude Code, Cursor, Codex or any coding agent in your project and paste this. It's an
ordinary request in your own words: the agent looks at your project, asks you a few questions,
sets Dogear up, and ends with a list of what's left for you to do. It asks before it installs
anything, it leaves your secrets to you, and nothing is sent anywhere.

```text
I'd like to add Dogear (npm: @harshi04/dogear, MIT licence) to this project. It's Figma-style
comments on our pages: pins, threads, replies and resolve. Please set it up with me.

1. First look around: our framework, any sign-in we already have, our database, and where we
   host. Then ask me these in one message, with your recommendation for each:
   - Where should comments be stored? (For a Node or Next.js app, Dogear's own route handler
     over our Postgres. A JSON file or memory just to try it. Or an adapter for Supabase or our
     own API.)
   - Who can comment? (Our existing sign-in, or visitors who just give a name.)
   - Who should see comments? (Everyone, or only some pages or environments.)
   - Should my coding agent be able to read and reply to comments? (Dogear has an MCP server.)
   Please wait for my answers before installing anything.

2. Install @harshi04/dogear and set it up the way I choose. Use the package's docs as the
   reference: node_modules/@harshi04/dogear/README.md, docs/server.md (createDogear, stores
   and options), docs/contract.md (the rules every backend keeps) and docs/examples/.
   - The author of a comment should come from the server (our session, or Dogear's signed
     guest cookie), never from the browser.
   - Mount the comments once, near the root of the app.

3. For secrets, please add the variable names to .env.example (or list them for me) and leave
   the values to me. Don't commit, push or deploy; I'll do that myself.

4. Check that it works: typecheck and build, and if there's a route, start the dev server and
   try GET /me and a POST with curl.

5. Finish with two short lists:
   - Done: each file you added or changed, one line each.
   - My turn: what I still need to do, in order. Include each environment variable to set
     (locally and on our host) and how to make its value, any database step, and how to try
     it (open the app, press C, drop a pin, reply). Then the optional extras: theming with the
     --dogear-* CSS variables, moderation, and connecting a coding agent (MCP).
```

## Quick start

**Plain HTML**

```html
<script src="/dogear/element.global.js"></script>
<dogear-comments shortcut="c"></dogear-comments>
```

**React**

```tsx
import { Comments } from "@harshi04/dogear/react";

<Comments shortcut="c" />;
```

**Next.js (App Router)**

```tsx
// app/dogear-comments.tsx
"use client";
import { Comments } from "@harshi04/dogear/react";
export const DogearComments = () => <Comments shortcut="c" />;
// then render <DogearComments /> once in app/layout.tsx
```

With no adapter, comments are stored in this browser's localStorage, which is enough to try it out.

## Pick your backend

**Let your agent do it.** Paste the prompt in [Set it up with your coding agent](#set-it-up-with-your-coding-agent)
into Claude Code, Cursor or any coding agent. It asks where you want comments stored and who your
users are, then sets up the backend and the security rules, mounts it, checks it, and tells you
what's left for you.

**Or do it yourself.**

| You have | Use |
|---|---|
| Nothing yet, just trying | `localAdapter()` (the default) |
| A Node server (Next.js, Hono, …) | `createDogear` from `@harshi04/dogear/server`, then `httpAdapter("/api/comments")`: [docs/server.md](docs/server.md) ([Next + Postgres](docs/examples/next-postgres.md)) |
| A server route you write yourself | `httpAdapter("/api/comments")` with the [REST shape](docs/contract.md#the-rest-shape-for-httpadapter) |
| Supabase | [a ready adapter with RLS and realtime](docs/examples/supabase.md) |
| Anything else | implement [`Adapter`](docs/contract.md) (five functions) |

```ts
type Adapter = {
  me(): Promise<User | null>;
  list(path: string): Promise<Comment[]>;
  create(input: NewComment): Promise<Comment>;
  update(id: string, patch: { body: string } | { resolved: boolean }): Promise<Comment>;
  remove(id: string): Promise<string[]>;
  subscribe?(path: string, onChange: () => void): () => void;
};
```

Want live cursors and presence? See [ROADMAP.md](ROADMAP.md): it needs a realtime service.

The rules every backend must keep, such as "the author comes from the session" and "only authors
edit, and authors or admins delete", are in [docs/contract.md](docs/contract.md). Return
`admin: true` from `me()` for your admins and they can clean up anyone's comments. Use `validateNew` from
`@harshi04/dogear` in your server code; it has no DOM dependency.

## Props

| Prop | Default | |
|---|---|---|
| `adapter` | `localAdapter()` | where comments live; read once on mount |
| `shortcut` | none | a key that toggles comment mode, e.g. `"c"` |
| `ignore` | none | a CSS selector to keep comments off, e.g. `"nav, .chat-widget"`. Pressing on a match does nothing |
| `activation` | `"always"` | `"param"` shows the layer only after `?review` is in the URL, then for the rest of the tab; `?review=off` ends it. Plain visitors see a clean page |
| `reviewParam` | `"review"` | the query parameter `activation="param"` listens for |
| `enabled` | `true` | `false` renders nothing (e.g. only on preview deploys) |
| `layout` | `"fab"` | `"tray"`: a pill that opens into a list of every thread; `"dock"`: a button you drag anywhere that opens into controls and a list (see [Layouts](#layouts)) |
| `navigate` | full page load | how a tray row on another page gets there, e.g. your router's `push` |
| `pageLabel` | the path | what a page is called in the tray's list, e.g. `(path) => titles[path] ?? path` |
| `deletable` | its author, or an admin | who may delete a comment, to match the server's `deletable`, e.g. anyone may delete the assistant's |
| `linkParam` | `"dogear"` | the query parameter of a link to a thread, e.g. `"comment"` for `?comment=<id>`; a reply's id opens its thread. `?dogear=` always works too. Attribute: `link-param` |
| `onActiveChange` | none | called with `true`/`false` when the visitor opens or closes comments (or a thread link opens them), e.g. for analytics; not on a reload |
| `resolvers` | `"anyone"` | `"authors"` shows Resolve only to the thread's author and admins, for public pages |
| `icons` | Dogear's own | Your icon set, by name (see [Theming](#theming)) |
| `joinFirst` | `false` | With guests and the tray: opening the comments first asks a visitor's name and avatar, then shows the threads and pins |
| `reactions` | none | The emoji people can react with, e.g. `["❤️", "👍", "😂", "🔥", "👀", "🎉"]`: chips with counts under comments, yours ringed, and a + that unfolds the set. Needs an adapter with `react`. Attribute: `reactions='[…]'` |
| `reactionsIn` | `"everywhere"` | `"thread"`: reactions only on an open comment, not in the tray's list. Attribute: `reactions-in="thread"` |
| `emojiData` | jsDelivr's `emojibase-data@17` | Where the set's "···" picker loads every other emoji from, read as `${emojiData}/en/data.json`. Point it at your own copy of Emojibase's data to self-host. Attribute: `emoji-data` |
| `pick` | `"element"` | `"pin"`: the pin you'd drop, with your avatar, follows the pointer and a click drops it. Nothing on the page is outlined or named, and there are no areas, for sites whose visitors comment rather than inspect. Attribute: `pick="pin"` |
| `locations` | `true` | `false`: no page or "on heading …" under comments in the list or on an open one, just name · time and the text. Pins still show where |
| `avatars` | none | Avatars for people without a photo, by key: `{ sky: "linear-gradient(…)" }`. Guests pick one with their name; everyone else gets one by id |
| `resolve` | `true` | `false`: no resolving at all, just a list of comments. Every thread shows, with no Resolve, Reopen or Resolved switch |

On the element, the equivalents are the `endpoint="/api/comments"` attribute (for `httpAdapter`),
`shortcut="c"`, `ignore="nav"`, `activation="param"`, `review-param="review"`, `layout="tray"`,
`resolvers="authors"`, `no-resolve` and `guests` (for `httpAdapter(endpoint, { guests: true })`) attributes, or
`Dogear.mount({ adapter, layout, navigate })` from script.

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

## Layouts

**`"fab"`** (the default) is one button that turns comment mode on and off, as in Figma: in
comment mode every press places a comment.

**`"tray"`** suits a site with visitors, such as a portfolio or docs:
- A pill sits bottom-right: "Leave a comment" and its key.
- Clicking it opens the tray out of the pill, which stays put as the tray's footer: one list, this
  page's threads first, then other pages' (each showing its path), newest first. Pins show while
  it is open, and the page stays usable.
- A row on this page scrolls to its element and opens it. A row on another page goes there (with
  `navigate`) and opens it on arrival.
- The shortcut, or the pill again, places one comment, then returns to the tray. Esc steps back:
  the draft, the open thread, placing, then the tray.
- Closing the tray hides every pin.

**`"dock"`** suits a product team reviewing an app all day:
- A round button, with the number of open threads on every page. Drag it to any corner; this
  browser remembers where.
- Clicking it opens a row of controls: add a comment (click to pin, drag for an area), the eye
  (show or hide pins, the page stays usable either way), the list with the open count, and ✕.
- The list opens the row into a panel of every thread, this page first, with an `@` filter for
  mentions of you and a resolved switch. Drag it by its head.
- It opens away from the nearest edges. Esc steps back one thing at a time: the panel, the draft,
  the open thread, placing, then the row. The pins stay until the eye hides them.
- Its first place is `--dogear-right` / `--dogear-bottom` from the corner (24px).

```tsx
const router = useRouter();
<Comments layout="tray" shortcut="c" navigate={router.push} />;
// Just a list of comments, no resolving:
<Comments layout="tray" resolve={false} navigate={router.push} />;
```

**Guests.** For anyone to comment with just a name, give the adapter `join(name)`:
`httpAdapter("/api/comments", { guests: true })` calls `POST /me { name }`, and your route signs
the visitor in (a cookie) and returns them. Signed-out visitors then see the threads, and are
asked for a name the first time they write. `localAdapter({ user: null })` tries the flow
locally, and so does `npx dogear serve --guest`. With `avatars`, the name step also offers them to
pick from (one picked at random to start); the key goes to `POST /me { name, tint }`, and your
route keeps it as `User.tint` if it's one of yours. On a public page, pair it with `resolvers="authors"`, rate limits in your route, and an
admin who can delete.

To review a page without everyone else seeing the layer, set `activation="param"` and send
reviewers a link with `?review`. The parameter isn't part of where comments live:
`/pricing?review` and `/pricing` share threads.

## Comments that remember a form

A comment left halfway through a form keeps the form, so whoever opens it sees what you saw.
Register the form's state; Dogear saves it with each thread started while the form is on screen,
puts it back when the thread is opened, and shows "Showing Alex's form · Back to my form".

```tsx
import { peekSnapshot, useDogearSnapshot } from "@harshi04/dogear/react";

const [state, setState] = useState(() => ({ ...EMPTY, ...peekSnapshot<Setup>("setup:stripe") }));
useDogearSnapshot("setup:stripe", state, (saved) => setState(saved));
```

The key names the form and what it fills in, so a snapshot only lands where it came from.
`peekSnapshot` covers a thread opened from another page: the form mounts already filled in. Any
JSON up to 64 KB; it comes back with its page's comments and is left out of every-page lists.
Without React: `Dogear.registerSnapshot(key, get, restore)`.

## Use it with your coding agent (MCP)

`dogear mcp` is an MCP server that lets Claude Code, Cursor, Codex or any MCP client read the
threads people leave on your pages, and, if you allow it, reply and resolve them. Replies show up
in the thread on the page with an **Agent** badge. It reads **your own backend** through the same
adapter: nothing hosted, no account.

**Try it locally in two minutes:**

```bash
npm install -D @harshi04/dogear                # once; then `npx dogear` runs from node_modules
npx dogear serve                           # a local comments server in .dogear/ (add it to .gitignore)
```

Point your dev page at it: `<dogear-comments endpoint="http://127.0.0.1:4848/api/comments">`, or
`<Comments adapter={httpAdapter("http://127.0.0.1:4848/api/comments")} />`. Leave a few
comments, then connect your agent from the same directory:

```bash
claude mcp add dogear -- npx dogear mcp --write --site http://localhost:3000
```

Ask it to "work through the Dogear feedback". It calls `dogear_next`, finds the element in your code,
makes the change, and resolves the thread with a summary you'll see on the page.

Setup for Cursor, Codex and VS Code, every tool, connecting to your production backend, and the
security model are in [docs/mcp.md](docs/mcp.md).

## Hand feedback to an agent, by hand

Every thread's `•••` menu has **Copy as Markdown**, and in comment mode **Copy all** copies every
thread on the page (resolved ones too while *Show resolved* is on). Each thread comes out with its
element's label, selector and text, its status, and the replies, ready to paste into Claude,
Cursor or an issue.

From a script, Playwright or an agent, with the element on the page:

```js
await Dogear.threads();  // every comment on this path, through the layer's adapter
await Dogear.markdown(); // the same, as Markdown
```

`toMarkdown(comments)` is also exported from `@harshi04/dogear`, with no DOM, for building the same thing
on a server.

## Theming

The layer draws into a shadow root, so your CSS can't break it and its CSS can't leak out. You
change its look by setting custom properties on `:root` or any ancestor:

```css
:root {
  --dogear-accent: #7c3aed;
  --dogear-surface: #1f1f1f;
  --dogear-font: "Inter", sans-serif;
  --dogear-bottom: 88px; /* move the button up, clear of your own widgets */
}
```

You can also set `--dogear-text`, `--dogear-on-accent` (text and icons on the accent),
`--dogear-muted`, `--dogear-divider`, `--dogear-placeholder`, `--dogear-hover`, `--dogear-send-idle`,
`--dogear-shadow`, `--dogear-changed`, `--dogear-right` and `--dogear-z-index`.

The accent marks only the one thing to do next: Send once there's text, the pin being placed, the
outline while you aim, and focus. Buttons, avatars and fields use the surface and the text colour,
so a dark accent on a light site doesn't turn every control into a black blob.

**Material.** A few more properties change what the panels are made of, all off by default:

| Property | Default | What it does |
| --- | --- | --- |
| `--dogear-radius` | `16px` | Corners of the tray, a thread and a preview |
| `--dogear-row-radius` | `12px` | Corners of a tray row |
| `--dogear-backdrop` | `none` | A `backdrop-filter` on every panel and pin, e.g. `blur(16px)` |
| `--dogear-highlight` | none | Inner shadows layered under `--dogear-shadow`, for a lit edge |
| `--dogear-well` | transparent | The tray's list sits in this inset tray |
| `--dogear-row-active` | `--dogear-hover` | A hovered or focused tray row |
| `--dogear-row-highlight` | none | Its inner shadow |
| `--dogear-faint` | `--dogear-muted` | Times, the dot between name and time, a row's page |
| `--dogear-strong` | `--dogear-text` | The tray's dock label |
| `--dogear-mark` | `--dogear-accent` | What's drawn on the page: the pin being placed and the outlines |
| `--dogear-on-mark` | `--dogear-on-accent` | Text on the mark (the aim label) |
| `--dogear-field` | 6% of the text colour | The fill of a field inside a card (a reply, an edit) |
| `--dogear-pin-shadow` | `--dogear-shadow` | A pin's shadow, lighter than a panel's if that one is deep |
| `--dogear-mention` | `--dogear-accent` | An @mention in a comment |
| `--dogear-agent` | `--dogear-accent` | The agent's badge |

Dark glass on any page, for example:

```css
:root {
  --dogear-surface: rgba(0, 0, 0, 0.64);
  --dogear-backdrop: blur(16px);
  --dogear-radius: 22px;
  --dogear-row-radius: 10px;
  --dogear-text: rgba(255, 255, 255, 0.72);
  --dogear-muted: rgba(255, 255, 255, 0.4);
  --dogear-faint: rgba(255, 255, 255, 0.32);
  --dogear-hover: rgba(255, 255, 255, 0.08);
  --dogear-well: rgba(0, 0, 0, 0.12);
  --dogear-highlight: inset 0 0 0 1px rgba(255, 255, 255, 0.08), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.1);
  --dogear-mark: #262626; /* the page is light, so what's drawn on it is dark */
}
```

**Your own icons.** Dogear draws its icons on a 24px grid with a 1.5 stroke, like most current sets.
To use your site's set instead, pass any of them by name (React):

```tsx
import { IconArrowUp, IconBubble3, IconCrossMedium, IconPlusMedium } from "your-icons";

<Comments
  icons={{
    comment: <IconBubble3 />,
    send: <IconArrowUp />,
    close: <IconCrossMedium />,
    plus: <IconPlusMedium />,
  }}
/>;
```

Names: `comment`, `send`, `close`, `plus`, `more`, `resolve`, `reopen`, `field` (leads every field),
`prev` and `next` (the name step's avatar arrows), `react` (adds a reaction) and `search` (leads
the emoji picker's search). Each is drawn at 16px in
`currentColor`. Icons that use an SVG mask or `url(#id)` need it to resolve inside the shadow root:
prefer a plain-path mode if your set has one.

## How pins stay put

In comment mode, the element a press would land on is outlined as you move, with what it is
(`button "Start free trial"`). That element is the one the comment is anchored to, taken when you
release, so scrolling while you write doesn't move it.

A pin is stored relative to that element, using a selector plus the element's first 60 characters
of text as a fingerprint. The selector starts at the nearest stable `id` or unique `data-testid`
(also `data-test`, `data-qa`, `data-cy`), so adding test ids makes pins survive DOM changes above
them. Below that it is structural (`div:nth-of-type(2)`), and it reaches into open shadow roots.
It also keeps a viewport position as a fallback, and a short label for the thread card. Put
`data-comment-label="Pricing table"` on an element to name it yourself.
Pins follow their element through scrolling (including inner scroll containers) and resizing. If
the element is gone, the pin is drawn faded at its fallback position. Threads are keyed by path,
so `/settings` and `/settings?tab=billing` share them. A pin made on one tab only shows on
another if its element is really there. A pin whose element is still there but whose text has
changed since gets an amber dot, so you can see which feedback may already be dealt with.

## Examples

- `examples/html`: one HTML file with the script tag and localStorage. It includes hostile page
  CSS to show the isolation.
- `examples/next`: Next.js with a complete REST route, using an in-memory store and guest users.
  Open it in two browsers to watch comments arrive.

```bash
npm install && npm run build
npx serve .            # then open /examples/html/
cd examples/next && npm install && npm run dev
```

## License

[MIT](LICENSE). Copyright © 2026 Harshvardhan Agarwal. Use it, fork it, build on it.

## Contributing

Issues and pull requests are welcome. Keep each PR to one change, with a test, and run
`npm run typecheck && npm test` before you open it.
