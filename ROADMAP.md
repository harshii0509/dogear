# Roadmap

I parked v0.1 (the widget, adapters, the contract, the setup prompt and examples) on 2026-09-28
and picked it up again on 2026-10-12. v0.2.0, the first release as Dogear, is in CHANGELOG.md.

## Build next
- **Connectors in the setup prompt.** The prompt could ask whether you want Slack or Notion, and
  copy the recipe in.
- **Two-way sync.** Ticking a Notion row or closing a Linear issue resolves the thread. After
  seeing how connectors are used.
- **Offline retry queue.** A failed post is kept and retried with backoff. ([#11](https://github.com/harshii0509/dogear/issues/11))

## Done since v0.1
- **Connectors.** Four comment events, and recipes for Slack, Teams, Notion, Linear, GitHub and a Supabase trigger (`docs/connectors/`). ([#10](https://github.com/harshii0509/dogear/issues/10))
- **Ignore selectors.** `ignore="nav, .chat-widget"`, as a prop and an attribute.
- **Aim outline.** The element a press would anchor to is outlined as you move, with a label.
- **Anchor on release.** Dogear takes the element when you let go, not when you send.
- **Labels.** `anchor.label` (`button "Save"`) shows on the thread card, and `data-comment-label` overrides it.
- **Changed flag.** An amber dot on pins whose element text has changed, and a line in the thread.
- **Admins.** `User.admin` shows Delete on anyone's comment, and the contract has the backend check it.
- **Reviewer link.** With `activation="param"`, the widget appears only after `?review`, for the rest of the tab.
- **Copy as Markdown.** Per thread and "Copy all", plus `Dogear.threads()`, `Dogear.markdown()` and `toMarkdown`.
- **MCP for coding agents.** `dogear mcp` (status, list, get, next and watch, plus reply and
  resolve with `--write`), `dogear serve` for local development, agent users and tokens, and
  thread links. See docs/mcp.md.
- **Sturdier selectors.** Rooted at a unique `data-testid`-style attribute when there is one, and
  through open shadow roots (`host >>> inner`).
- **Alerts.** `notify`, with `webhook()` or your own notifier, tells whoever is @mentioned.

## Live presence and cursors, opt-in
This isn't built into the default. The setup prompt could ask "Do you want to see who's on the
page, and their cursors?" If the answer is yes, it would explain that this needs a realtime
service (Supabase Realtime, Liveblocks, PartyKit, Ably or Pusher, or your own WebSocket server),
because serverless hosts like Vercel can't hold connections open. It then writes the adapter part.

- An optional adapter piece, `presence?(path, onPeers) → { update(cursor), leave() }`. Without
  it, nothing presence-related renders.
- An avatar stack by the Comment button, always. Named cursors only in comment mode.
- Cursors are anchored like pins, to the element under the pointer, so they point at the same
  element at any screen size.
- A reference adapter in `docs/examples/supabase.md` (presence plus broadcast, no table).
  `localAdapter` can do it across tabs with `BroadcastChannel`, for demos ([#12](https://github.com/harshii0509/dogear/issues/12)).

## Not doing, and why
- **Screenshots, console and network capture, triage inbox.** That's bug reporting,
  a different product.
- **Desktop and mobile boards, 7-locale i18n, a CLI `init` or `doctor`.** The setup
  prompt does the CLI's job. I'll add i18n if people ask for it.
- **JSON export plus a Markdown CLI.** Copy as Markdown covers it.
- **Pin numbers.** Dogear shows avatars.
