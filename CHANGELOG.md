# Changelog

## Unreleased

### Added
- **Pulse: how feedback is going, in the list.** The tray and the dock's panel have a Pulse switch:
  open threads, threads started this week, the usual wait for a first reply, comments a day over
  14 days, the open threads nobody has answered, the pages with the most open threads, and who
  was active this week. It's worked out from the comments the list already has, so nothing is
  sent anywhere new. `pulse={false}` (`no-pulse`) turns it off.
- **`pulseOf(comments)`** in the main entry: the same figures, for your own dashboard or server.
- **`dogear_pulse`** in `dogear mcp`, so a coding agent can answer "how's feedback going?"

## 0.6.0 — 2026-10-20

### Changed
- **Dogear is made of glass.** The default look is dark glass: black at 64% under a 16px blur, a lit
  edge, white text in four steps, rounder corners. The mark (the pin being placed, the outlines)
  is its own blue, so it shows on any page. A site that set `--dogear-*` keeps what it set.
- **The README shows Dogear at work:** a short clip of the widget, and animated diagrams of how
  the pieces fit (`media/`, not in the npm package). Example people are dummy names throughout.
- **Setting up with a coding agent:** the prompt now lives in the README ("Set it up with your
  coding agent"), written as your own request. It covers `createDogear`, guests and the MCP, and
  ends with a list of what's left for you. `SETUP_PROMPT.md` is gone.

### Added
- **`theme`: `"dark"` (the default), `"light"` or `"auto"`.** Light is frosted white with dark text;
  auto follows the visitor's system setting. The `theme` attribute can change on a live element,
  for a site's own dark-mode switch.

### Fixed
- **Plain HTML (`element.global.js`): reactions and motion work.** The build left
  `process.env.NODE_ENV` in place, which a browser doesn't have, so every spring threw: presses
  and pop-ins never animated, and opening the full emoji picker failed. It's now defined at build
  time.
- **The reaction set stays open when you click +.** The + button gives way to the set, and the
  blur that left behind no longer reads as focus going elsewhere.

## 0.5.1 — 2026-10-20

### Changed
- **The thread list is newest thread first, and stays put.** A reply no longer lifts its thread
  to the top, and each row's time is when the thread was started, so the list reads in sequence.
  This page's threads come first, then the other pages', in the same order.

## 0.5.0 — 2026-10-19

### Changed
- **The first release on npm** (0.4.1 was withdrawn): `npm install @harshi04/dogear`.
- **Alerts** come through `webhook()` or a `Notifier` of your own, `(event) => Promise<void>`,
  where `event.mentioned` is who to tell.

## 0.4.1 — 2026-10-19

### Changed
- **Open source, under MIT** (was all rights reserved), and **on npm**: `npm install @harshi04/dogear`.
  The element loads from a CDN too: `cdn.jsdelivr.net/npm/@harshi04/dogear@0.4/dist/element.global.js`.
- **The package is `@harshi04/dogear`** (was `@dogear/core`, never on npm): imports become
  `@harshi04/dogear`, `@harshi04/dogear/react`, `/server` and `/element`.

## 0.4.0 — 2026-10-15

### Changed
- An agent's comments are marked "AI" (was "Agent"), and one without a photo has a sparkle for
  an avatar.

### Added
- **Your code runs after a comment is saved.** `onCreated({ comment, thread, author, mentioned,
  link })` runs through `defer` (Next's `after`, or `waitUntil`) once the response has gone, for
  alerts, an agent or counts. `mentioned` is who to alert: emails included, only those who can open
  the page. `link` opens the thread; its parameter is `linkParam`.
- **People from your own records.** `directory: { list(), find?(handle) }` is who can be
  @mentioned, instead of everyone who has signed in. `find` can name someone who never has.
- **`canSee` gets the request**, when it's about whoever sent it, so a cookie of yours can narrow
  what they see.
- **`deletable(user, comment)`** decides who may delete what, e.g. anyone may delete the agent's.
- **An assistant that answers threads.** `assistant: { name, answer, answers?, aliases?,
  maxReplies? }` replies in the thread, after the response, to new threads and to anything that
  @mentions it (or only the latter). Your `answer` is the brain; Dogear decides when and saves it.
  It's in the @ list, can @mention people, and the widget marks its words: a sparkle avatar,
  "AI", "Answered by AI", and "Scout is reading…" while it works. `deletable` on the widget
  matches the server's, e.g. anyone may delete the assistant's replies.
- **Comments that remember a form.** `useDogearSnapshot(key, state, restore)` registers a form;
  a thread started while it's on screen saves it (`Comment.state`, up to 64 KB of JSON, roots
  only), and opening the thread puts it back, with a "Showing Alex's form · Back to my form"
  banner. `peekSnapshot(key)` fills a form in as it mounts, for threads opened from another page.
  Postgres gains a `state jsonb` column (added on start); `?all=1` leaves it out.
- **Alerts outside the page.** `notify: [webhook({ url, secret })]`. `webhook()` POSTs the new
  comment as JSON, HMAC-signed with `secret`. Each notifier runs after the response and on its
  own, tried once more after a blip; a `Notifier` of your own is any `(event) => Promise<void>`.
- **Mention alerts in the app.** `GET /mentions` (and `Adapter.mentions`) lists where you were
  @mentioned, on pages you can open. The widget asks every 15 seconds while the tab is visible and
  says so: "Alex mentioned you on Pricing", with View, which opens the thread wherever it is. The
  tray's pill shows `@2` for unread ones, and an `@` in its head narrows the list to them. Seen
  ones are kept in this browser. Postgres indexes `mentions` for it.
- **A dock layout.** `layout="dock"`: a round button with every page's open count, which the
  visitor drags to any corner (remembered), opening into a row of controls (add, the eye that
  shows or hides pins, the list) and the list into a panel with an `@` filter and a resolved
  switch. It grows away from the nearest edges, and Esc steps back one thing at a time.
- **Widget:** `linkParam` (`link-param`) opens threads from your own links, e.g. `?comment=<id>`,
  and a reply's id opens its thread. `pageLabel` names pages in the tray's list.
  `--dogear-mention` and `--dogear-agent` colour @mentions and the agent's badge.

## 0.3.0 — 2026-10-15

### Changed
- **Inkd is now Dogear.** One name everywhere: the package is `@dogear/core` (`@dogear/core/react`,
  `/element`, `/server`), the element `<dogear-comments>`, the global `Dogear`, the server
  `createDogear`, the command `dogear` (`dogear serve`, `dogear mcp`), MCP tools `dogear_*`, theme
  properties `--dogear-*`, environment variables `DOGEAR_*` and Postgres's default table
  `dogear_comments`. The repo is `harshii0509/dogear`.
  For one release the old names still work where data or setups already exist: a guest's
  `inkd_user` cookie still signs them in, `.inkd/` is used when there's no `.dogear/` yet,
  `INKD_TOKEN`, `INKD_SITE_URL` and `INKD_MCP_WRITE` are still read, and `?inkd=` links still open
  their thread.

### Fixed
- **A list row lights all over.** Hovering a comment's lower part, where its reactions sit, lit
  nothing, and a click on the empty room there did nothing. Now it's the row: it lights and opens.

### Changed
- **Licence.** Dogear is now proprietary (all rights reserved), no longer MIT. `package.json`
  says `UNLICENSED`; see LICENSE.

### Added
- **`@dogear/core/server`: the backend, ready-made.** `createDogear({ store })` is the REST contract as one
  `Request → Response` function: mount it as a Next.js route (`export { dogear as GET, dogear as POST,
  dogear as PATCH, dogear as DELETE }`) or anywhere that speaks Fetch. It works with nothing but a
  store, and each option switches more on: `guests` (a name and a signed cookie, with rate
  limits), `auth` (your sign-in), `agentToken` (`dogear mcp`), `canSee` (private pages, checked on
  every read and write), `moderate` (a 422 the writer sees), `adminKey`. Stores: `memoryStore`,
  `fileStore`, and `postgresStore({ query })` for any Postgres client, which makes its table
  (`schema()`) and counts every reaction when people react at once. See docs/server.md.
- **@mentions.** With `auth` on `createDogear`, typing `@` in a comment lists the people who have
  signed in (`Adapter.people`, REST `GET /people`); ↑/↓ and Enter or Tab pick one, Esc closes the
  list. The backend saves who's mentioned on the comment (`Comment.mentions`), and the layer draws
  each as the person's name. Only people who have signed in can be mentioned, only by each other
  (never by a guest), and only if they can open the page: anyone who can't is skipped, and the
  writer is told. `User.email` and `User.handle` say who someone is for this; an email never goes
  on a comment. `mentionedHandles`, `handleOf` and `mentionParts` are exported.
- **`dogear serve` runs on it.** Same flags and answers, one implementation of the contract. Two
  small differences: only a thread resolves (a reply answers 400), and an error inside is a 503.
- **Comments post at once.** A new comment or reply shows as yours the moment you send it, while
  the backend saves it (and may check it first, which can take a few seconds). It has no actions
  until it's saved, then takes its own place without a flicker. If it's turned away (a 422) or
  the request fails, it fades and folds away, the reason shows, and the text goes back into the
  box it was written in, to change and send again.
- **The name step says hi while it waits.** When checking a name takes more than a beat, the
  avatar breathes and nods, an arc in its own colours turns around it, the arrows step back, and
  Continue reads "Saying hi" with hopping dots (`aria-busy`, and "Checking your name" for screen
  readers). Taken: one happy hop, then the comments. Turned away: a small head-shake and the name
  back to change. With reduced motion, nothing moves.
- **`onActiveChange`** (prop, `mount()` option and element property): called with `true` or
  `false` when the visitor opens or closes comments, or a link to a thread opens them, for
  analytics. Not called when comment mode comes back by itself after a reload.
- **Tray layout.** `layout="tray"`: a small button with the count of open threads opens a list of
  every thread, this page's first and then other pages' by path. Pins show while it is open and
  the page stays usable; a row scrolls to its thread or goes to its page (`navigate`, e.g. your
  router's `push`). The shortcut places one comment. Closing it hides the pins. A full-width
  sheet on narrow screens.
- **Guests.** `Adapter.join(name)` (REST `POST /me { name }`, `httpAdapter(…, { guests: true })`)
  lets visitors with no account comment under a name: the layer shows threads read-only until
  they write. `localAdapter({ user: null })` tries it locally. `cleanName` and `groupThreads` are
  exported.
- **`resolvers="authors"`** shows Resolve only to a thread's author and admins, for public pages.
- **`--dogear-on-accent`**, for text and icons on the accent, so a dark accent on a light theme
  stays readable.
- **Agents in the core.** `Adapter.listAll()` (REST `GET ?all=1`) for reading every page;
  `User.agent` puts an "Agent" badge on a coding agent's comments; `httpAdapter(endpoint,
  { token })` sends `Authorization: Bearer`; the contract documents agent tokens, and the Next
  example accepts `DOGEAR_AGENT_TOKEN`.
- **`dogear serve`.** A local comments server for development (the REST contract over
  `.dogear/comments.json`), so a page and a coding agent share threads with nothing to deploy.
  127.0.0.1 only, Host-checked against DNS rebinding, development origins only, 64 KB bodies, and
  the agent signs in with a token written to `.dogear/token`.
- **`dogear mcp`.** An MCP server (stdio) for coding agents, reading your own backend through the
  Adapter: the local `dogear serve` by default, `--endpoint` with a token, or `--adapter <module>`.
  Read-only tools `dogear_status`, `dogear_list_threads` (filters, cursors, concise or detailed),
  `dogear_get_thread` (element, where to look, comments marked as data) and `dogear_next`; a
  `dogear://threads/{id}` Markdown resource and an `dogear_fix_feedback` prompt. Secret-looking query
  values are redacted.
- **`dogear mcp --write`.** `dogear_reply` (shows on the page with an Agent badge) and `dogear_resolve`
  (a closing reply with summary, commit, PR and files, then resolved; or reopen), only when writes
  are turned on. Nothing deletes.
- **`dogear_watch`.** Waits for new threads and people's replies on open threads (not agents' own),
  gathers a burst into one answer, returns a cursor to continue from, defaults to 50 s to fit
  client tool timeouts, and stops when cancelled.
- **Docs for agents.** README "Use it with your coding agent", `docs/mcp.md` (setup for Claude
  Code, Cursor, Codex and VS Code; every tool; working loops; the safety model), and a
  SETUP_PROMPT step that wires the MCP into a project.
- **Thread links.** `?dogear=<thread id>` opens that thread in comment mode, scrolls to it, and
  drops the parameter. A link to a missing thread says so.

- **`resolve={false}`** (`no-resolve` on the element) turns resolving off for a plain list of
  comments: no Resolve, Reopen or Resolved switch, and every thread shows and counts.
- The tray is one list rather than sections: this page's threads first, then other pages', each
  row naming its page, newest first.
- **`icons`**: use your site's icon set in place of Dogear's (React), by name.
- **A quieter, consistent look.** One spacing scale (4, 8, 12, 16) and one radius scale (4, 8, 12,
  16, pills); icons redrawn on a 24px grid with a 1.5 stroke, all 16px in 28px buttons. The tray's
  button is the surface, not the accent, and turns into its close button while open; initials,
  fields and the count are neutral; the accent is kept for Send, the pin being placed and focus.
  The thread card no longer slides under an open tray. The shortcut hint hides on touch screens.
- **The tray opens out of its pill.** The tray layout's button is now a pill, "Leave a comment"
  and its key, which grows into the list and shrinks back into itself on a spring (280 ms open,
  220 ms otherwise), the label staying where it is as the panel's footer. While you place a
  comment it reads "Click to pin, drag to mark an area". The list fades in a beat late, rows a
  little after each other; reversing half-way goes back from where it is. No count or icon on the
  pill, and no second close button under the panel.
- **`joinFirst`** (`join-first`, `mount({ joinFirst })`): with guests and the tray, opening the
  comments first asks a visitor's name and avatar in the panel, the pill reading Continue ⏎, and
  shows the threads and pins once they've joined; the shortcut opens the same step. The first
  avatar is the default everywhere, rather than a random one. The step is a large avatar between
  ‹ › arrows (each pick fades in over the last), the name centred under it, and Continue as an
  inset button that the pill eases into; once they've joined, it fades out where it is while the
  list fades in. New icon names `prev` and `next`.
- **Fields as a command palette has them.** Every field (a new comment, a reply, an edit, the name
  step) is an input row (an icon, then 14/20 text) with a footer of actions as label and key:
  Post ⏎, Reply ⏎, Cancel Esc and Save ⏎, Continue ⏎. The round Send button is gone. A field in a
  card sits on `--dogear-field`; a reply leads with your photo. New icon name `field`.
- **`data-active`** on the layer's host (`[data-comment-layer]`) while comment mode is on, so a
  page's own shortcuts can stand down while someone comments.
- **The open list, without its well.** The list is the panel's own scroller and runs under the
  "Comments" title, rows dissolving as they pass under it and softening into the footer; a thin
  scrollbar on the faint text colour. Rows are 12×10, so photos and the title both start 16px in,
  and each name · time is centred on its photo.
- **A tighter pill:** 40px tall with 14px sides, for "Leave a comment" and the placing hint.
- **Reactions.** `reactions={["❤️", "👍", …]}` lets people react to a comment: chips with the
  emoji and a count under its text, yours ringed; a chip adds or takes back yours, and a + unfolds
  the set in place. Under each comment in the tray's list and in an open thread, or only in the
  thread with `reactionsIn="thread"`. `Comment.reactions` (emoji → ids), `Adapter.react(id, emoji)`
  (REST `POST /:id/reactions { emoji }`, also in `localAdapter` and `dogear serve`), and
  `toggleReaction` and `cleanReaction` for backends. New icon name `react`.
  In motion (motion's small build, `motion/mini` + `spring`, about 6 kB gzipped): chips squash on
  press and spring back; leaving yours pops the emoji and bursts copies of it up out of the chip;
  counts roll; new chips spring in and emptied ones shrink away; the set comes in one emoji after
  another, and each lifts under the pointer. Reduced motion keeps plain fades.
  **Any emoji:** "···" at the end of the set opens a picker (Frimousse, about 9 kB gzipped):
  search, your recent picks, then every emoji by category, in a panel of its own inside the
  tray or thread. Its emoji load on first use, from jsDelivr's Emojibase data, or your own copy
  with `emojiData` (`emoji-data`). A reaction is exactly one emoji, a few rude ones (🖕 🍆 🍑 💦)
  are never offered or stored, and a comment carries at most `MAX_REACTIONS` (20) kinds;
  `roomForReaction` checks it, and `dogear serve` answers a 21st with a 422. New icon name
  `search`.
- **Refusals the writer can act on.** A 422 from the route, with `{ error }`, shows that line to
  the writer ("Comment not posted", "Comment not saved", "Choose another name") instead of asking
  them to check their connection, and their text stays where it was. For a route that moderates
  comments or names. `httpAdapter` errors carry the route's `error` as `reason`.
- **`pick="pin"`** places comments without inspecting the page: the pin you'd drop, with your
  avatar, follows the pointer in place of the cursor, and a click drops it. No element is outlined
  or named, and a drag doesn't mark an area; the placing hint reads "Click anywhere to comment".
  The pin is still anchored to the element under it. The default, `"element"`, is as before.
- **`locations={false}`** (`no-locations`) leaves out where each comment was left, in the tray
  and on an open comment, for a plain list: name · time (· replies), then the text.
- **Avatars to pick.** `avatars` (`{ key: CSS background }`, the `avatars` attribute as JSON,
  `mount({ avatars })`) gives people without a photo one of the page's avatars: a guest picks one
  in the name step, under the field, with their initials shown as they type (arrow keys move the
  pick), and anyone else gets one chosen by id. `join(name, tint)`, `POST /me { name, tint }`,
  `User.tint`, `cleanTint`. `--dogear-avatar-text` colours initials on them.
- **`dogear serve --guest`** starts signed out, so a page asks for a name (and avatar) as it would a
  first-time visitor.
- **Posting lands.** A posted comment's composer folds toward its pin as the pending pin gives way
  to the real one, which settles in from under it; the tray opens back out of the hint, and your
  row drops in at the top lit, the light fading. Rows that move while the list is open (one
  arriving above them) slide rather than jump.
- **Materials.** `--dogear-radius`, `--dogear-row-radius`, `--dogear-backdrop`, `--dogear-highlight`,
  `--dogear-well`, `--dogear-row-active`, `--dogear-row-highlight`, `--dogear-faint`, `--dogear-strong`,
  `--dogear-mark`, `--dogear-on-mark` and `--dogear-pin-shadow`, enough for frosted glass (README, Theming). The tray's list
  sits in an inset well with 14×16 rows, and every comment shares one byline (name · time, 13px at
  1.2) and body (13px at 1.4); keys are filled caps.
- **Fails safe.** When the backend is down, the whole layer hides (after two failed looks in a
  row, or at once if it never loaded) and comes back by itself; while hidden it looks again after
  30 s, 1 and 2 minutes, and when the tab returns, and it doesn't poll. `httpAdapter` requests
  time out after 8 s (`timeout`). An error inside the layer removes only the layer, never the
  host app. Rows a backend sends that can't be drawn are dropped (`cleanList`).

### Fixed
- **Commenting on a phone.** A tap places a pin even if the finger wobbles (it used to become a
  tiny area); swiping to scroll while placing just scrolls, with no outline left behind; the placing
  hint says "Tap anywhere to comment" and Cancel; previews are for the mouse, so a tap opens the
  thread. On narrow screens the composer and an open thread are a sheet along the bottom that rides
  above the keyboard, with the page scrolled to keep the pin in view; opening a thread doesn't raise
  the keyboard; toasts move to the top; a guest's lone Continue no longer shows under a linked
  thread. On short screens (a phone on its side) a card's height is capped to the room it has.
- The pin being written shows your photo, as the posted pin will, rather than a solid mark.
- **On phones.** Fields are 16px on touch screens, so iOS no longer zooms the page into them; hover
  states only apply with a mouse, so a tapped row or pin doesn't stay lit; the dock and toasts clear
  the home indicator and notch (with `viewport-fit=cover`); panels size to the visible height
  (`dvh`); no tap flash or long-press selection on controls; the return key says Send or Go.
- `httpAdapter.me()` read any failure as "signed out"; now only 401/403 does, and a 5xx counts as
  the backend being down.
- A failing `?all=1` no longer throws away the page's own threads in the tray.
- A failed name step keeps what was typed.
- A thread link followed by a client-side route change waits for the new page's threads instead
  of reporting the thread missing.
- The reply and comment fields no longer draw a focus ring inside their own outlined box.

## 0.2.0 — 2026-10-12

The first release as **Inkd**.

### Breaking
- Renamed from `page-comments`: npm `inkd`, `<inkd-comments>`, global `Inkd`, CSS custom
  properties `--inkd-*`, storage keys `inkd` and `inkd:active`.

### Added
- **Aim outline.** In comment mode, the element a press would anchor to is outlined, with a label
  such as `button "Save"`.
- **`ignore`** (prop and attribute): pressing on a match does nothing.
- **Labels.** `anchor.label`, shown on the thread card; `data-comment-label` overrides it.
- **Sturdier selectors.** Rooted at a unique `data-testid` / `data-test` / `data-qa` / `data-cy`,
  and through open shadow roots.
- **Changed flag.** An amber dot on pins whose element text has changed since
  (`--inkd-changed`).
- **Admins.** `User.admin` can delete anyone's comment; the contract has the backend check it.
- **Reviewer link.** `activation="param"` shows the layer only after `?review`, for the tab.
- **Copy as Markdown.** Per thread and "Copy all", plus `Inkd.threads()`, `Inkd.markdown()` and
  `toMarkdown()`.
- Installing from GitHub builds the package (`prepare`).

### Fixed
- The anchor is taken when the press is released, not when the comment is sent, so scrolling
  while writing no longer moves it to another element.
- The idle Comment button, placed pins and the send button lost their background to the CSS
  reset (the button was an empty white pill on light pages).

## 0.1.0 — 2026-09-28

The layer, `localAdapter`, `httpAdapter`, the adapter contract, `SETUP_PROMPT.md` and examples,
as `page-comments`.
