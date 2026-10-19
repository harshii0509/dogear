# Roadmap

v0.1 (the layer, adapters, the contract, SETUP_PROMPT.md, examples) was parked on 2026-09-28 and
picked up again on 2026-10-12. v0.2.0, the first release as Dogear, is in CHANGELOG.md.

## Build next
- **Notify a channel.** A docs recipe: a webhook to Slack or Teams on a new comment, from the
  route or a DB trigger. SETUP_PROMPT asks whether you want it. (kalebheitzman/pindrop)
- **Offline retry queue.** A failed post is kept and retried with backoff. (SitePing)

## Done since v0.1
- **Ignore selectors.** `ignore="nav, .chat-widget"` (prop and attribute).
- **Aim outline.** The element a press would anchor to is outlined, with a label, as you move.
- **Anchor on release.** The element is taken when you let go, not when you send.
- **Labels.** `anchor.label` (`button "Save"`), shown on the thread card; `data-comment-label` overrides it.
- **Changed flag.** An amber dot on pins whose element text moved on, and a line in the thread.
- **Admins.** `User.admin` shows Delete on anyone's comment; the contract has the backend check it.
- **Reviewer link.** `activation="param"`: the layer appears only after `?review`, for the tab.
- **Copy as Markdown.** Per thread and "Copy all", plus `Dogear.threads()` / `Dogear.markdown()` and `toMarkdown`.
- **MCP for coding agents.** `dogear mcp` (status, list, get, next, watch; reply and resolve with
  `--write`), `dogear serve` for local development, agent users and tokens, thread links.
  See docs/mcp.md.
- **Sturdier selectors.** Rooted at a unique `data-testid`-style attribute when there is one, and
  through open shadow roots (`host >>> inner`).

## Opt-in: live presence and cursors
Not built into the default. SETUP_PROMPT asks "Do you want to see who's on the page, and their
cursors?" If the answer is yes, it explains that **this needs a realtime service connected**
(Supabase Realtime, Liveblocks, PartyKit, Ably/Pusher, or your own WebSocket server), since
serverless hosts like Vercel can't hold connections open. It then writes the adapter part.

- An optional adapter piece, `presence?(path, onPeers) → { update(cursor), leave() }`. Without
  it, nothing presence-related renders.
- An avatar stack by the Comment button, always. Named cursors only in comment mode.
- Cursors are anchored like pins (to the element under the pointer), so they land right across
  screen sizes.
- A reference adapter in `docs/examples/supabase.md` (presence plus broadcast; no table).
  `localAdapter` can do it across tabs with `BroadcastChannel`, for demos.

## Not doing (and why)
- **Screenshots, console and network capture, triage inbox (SitePing):** that's bug reporting, a
  different product.
- **Desktop/mobile boards (reviewplz), 7-locale i18n, CLI `init`/`doctor`:** SETUP_PROMPT does
  the CLI's job. Add i18n on request.
- **JSON export plus Markdown CLI (pindrop.js):** covered by Copy as Markdown.
- **Pin numbers:** we show avatars, as Figma does.

## Similar projects (checked 2026-09-28)
- [SitePing](https://github.com/NeosiaNexus/SitePing): closest match. MIT, shadow DOM, storage
  adapters, screenshots, inbox.
- [pindrop.js](https://github.com/huangdun/pindrop.js): local-first, `load`/`save` adapters,
  automation API.
- [reviewplz](https://github.com/rafarc21/reviewplz): a script plus a Cloudflare D1 REST backend,
  with `?review` activation.
- [pindrop](https://github.com/kalebheitzman/pindrop): Supabase, live cursors, webhooks, outdated
  flags (Commons Clause).
- [agentation](https://github.com/benjitaylor/agentation): annotations for AI agents, not team
  threads.
- Paid: Liveblocks Comments, Velt, Vercel Toolbar comments, BugHerd, Marker.io.

What we have that they don't: Figma-level interaction polish, SETUP_PROMPT (agent-driven
backend setup), cross-tab pins that check the element's text fingerprint, and about 18KB gz.
