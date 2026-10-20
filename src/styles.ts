/**
 * The layer's whole stylesheet, injected into its shadow root, so the host page's CSS cannot reach
 * in and ours cannot leak out. Theme it by setting any `--dogear-*` property on an ancestor (`:root`
 * works): custom properties are the one thing that crosses the shadow boundary.
 */
/*
 * One scale for everything. Space: 4, 8, 12, 16. Radius: 4 for chips (badges, keys, labels), 8
 * for small controls (icon buttons, menu items), 12 for rows, fields, menus and toasts, 16 for
 * cards (the tray, a thread), 999 for pills. Icons are 16px in 28px buttons.
 *
 * The accent is for the one thing to do next: Send once there is text, the pin being placed, the
 * outline while aiming, and focus. Everything else is the surface, the text and its muted tones.
 */
/**
 * The light glass: the dark one mirrored, frosted white with black text in the same steps. Used by
 * `theme="light"`, and by `theme="auto"` when the visitor's system is light. Every value is still
 * a fallback, so a site's `--dogear-*` wins in either theme.
 */
const LIGHT = /* css */ `
  --_surface: var(--dogear-surface, oklch(1 0 0 / 0.72));
  --_strong: var(--dogear-strong, oklch(0 0 0 / 0.88));
  --_text: var(--dogear-text, oklch(0 0 0 / 0.68));
  --_muted: var(--dogear-muted, oklch(0 0 0 / 0.46));
  --_faint: var(--dogear-faint, oklch(0 0 0 / 0.38));
  --_placeholder: var(--dogear-placeholder, oklch(0 0 0 / 0.38));
  --_divider: var(--dogear-divider, oklch(0 0 0 / 0.07));
  --_hover: var(--dogear-hover, oklch(0 0 0 / 0.05));
  --_send-idle: var(--dogear-send-idle, oklch(0 0 0 / 0.14));
  --_accent: var(--dogear-accent, oklch(0.2686 0 0));
  --_on-accent: var(--dogear-on-accent, oklch(0.9851 0 0));
  --_well: var(--dogear-well, oklch(0 0 0 / 0.04));
  --_highlight: var(--dogear-highlight, inset 0 0 0 1px oklch(1 0 0 / 0.5), inset 0 1px 0 oklch(1 0 0 / 0.9));
  --_row-highlight: var(--dogear-row-highlight, 0 0.5px 0.5px oklch(0 0 0 / 0.06), 0 1px 2px oklch(0 0 0 / 0.04),
    inset 0 0.5px 0 oklch(1 0 0 / 0.8));
  --_shadow: var(--dogear-shadow, 0 0 0 1px oklch(0 0 0 / 0.08), 0 3px 12px oklch(0 0 0 / 0.08),
    0 8px 40px oklch(0 0 0 / 0.1), 0 24px 64px oklch(0 0 0 / 0.08));
  /* A white pin on a white page: a ring and a firmer shadow keep it in view. */
  --_pin-shadow: var(--dogear-pin-shadow, 0 0 0 1px oklch(0 0 0 / 0.12), 0 2px 8px oklch(0 0 0 / 0.18));
  --_mention: var(--dogear-mention, #2f6fd0);
  --_agent: var(--dogear-agent, #7c4ddb);
`;

export const STYLES = /* css */ `
.pc-root {
  /* Dark glass, the default (theme="dark"): black at 64% under a 16px blur, a lit white edge, and
     white text at 92/72/40/32%. theme="light" mirrors it (LIGHT above). */
  --_surface: var(--dogear-surface, oklch(0 0 0 / 0.64));
  --_accent: var(--dogear-accent, oklch(0.9851 0 0));
  --_divider: var(--dogear-divider, oklch(1 0 0 / 0.08));
  --_placeholder: var(--dogear-placeholder, oklch(1 0 0 / 0.32));
  --_muted: var(--dogear-muted, oklch(1 0 0 / 0.4));
  --_send-idle: var(--dogear-send-idle, oklch(1 0 0 / 0.16));
  --_text: var(--dogear-text, oklch(1 0 0 / 0.72));
  /* Text and icons on the accent: the pending pin's send, the target label, initials, counts. */
  --_on-accent: var(--dogear-on-accent, oklch(0.2686 0 0));
  --_hover: var(--dogear-hover, oklch(1 0 0 / 0.08));
  --_changed: var(--dogear-changed, #f5a524);
  --_shadow: var(--dogear-shadow, 0 0 0 1px oklch(0 0 0 / 0.72), 0 3px 12px oklch(0 0 0 / 0.32),
    0 8px 40px oklch(0 0 0 / 0.32), 0 24px 64px oklch(0 0 0 / 0.32));
  --_z: var(--dogear-z-index, 2147483000);
  /* The material: a frosted panel with a lit edge (see README, Theming). */
  --_radius: var(--dogear-radius, 22px);
  --_row-radius: var(--dogear-row-radius, 10px);
  --_backdrop: var(--dogear-backdrop, blur(16px));
  --_highlight: var(--dogear-highlight, inset 0 0 0 1px oklch(1 0 0 / 0.08), inset 0 0.5px 0.5px oklch(1 0 0 / 0.1),
    inset 0 1px 2px oklch(1 0 0 / 0.04));
  --_well: var(--dogear-well, oklch(0 0 0 / 0.12));
  --_row-active: var(--dogear-row-active, var(--_hover));
  --_row-highlight: var(--dogear-row-highlight, 0 0.5px 0.5px oklch(0 0 0 / 0.08), 0 1px 2px oklch(0 0 0 / 0.04),
    inset 0 0.5px 0.5px oklch(1 0 0 / 0.1), inset 0 1px 2px oklch(1 0 0 / 0.04));
  /* Quieter than muted (times, the dot between name and time), and louder than text (the dock). */
  --_faint: var(--dogear-faint, oklch(1 0 0 / 0.32));
  --_strong: var(--dogear-strong, oklch(1 0 0 / 0.92));
  /* What sits on the page rather than on a panel: the pin being placed, the aim and area outlines.
     Its own blue, not the accent, so it shows on any page, light or dark. */
  --_mark: var(--dogear-mark, #3f8ae2);
  /* A field inside a card (a reply, an edit). */
  --_field: var(--dogear-field, color-mix(in srgb, var(--_text) 6%, transparent));
  /* Pins sit on the page, small: a panel's deep shadow would be a halo around each. */
  /* A dark ring for light pages and a faint lit one outside it for dark pages: each vanishes on the
     page it isn't for. */
  --_pin-shadow: var(--dogear-pin-shadow, 0 0 0 0.5px oklch(0 0 0 / 0.4), 0 0 0 1.5px oklch(1 0 0 / 0.14),
    0 2px 6px oklch(0 0 0 / 0.16));
  --_on-mark: var(--dogear-on-mark, #ffffff);
  /* An @mention in a comment, and the assistant: their own colours, readable on the glass. */
  --_mention: var(--dogear-mention, #7fb2f0);
  --_agent: var(--dogear-agent, #b39cf5);
  font-family: var(--dogear-font, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  font-size: 13px;
  line-height: 1.5;
  letter-spacing: -0.01em;
  color: var(--_text);
  -webkit-font-smoothing: antialiased;
  /* On a phone: no grey flash on tap (each control has its own :active instead). */
  -webkit-tap-highlight-color: transparent;
}
.pc-root *, .pc-root *::before, .pc-root *::after { box-sizing: border-box; margin: 0; }
.pc-root[data-theme="light"] {${LIGHT}}
@media (prefers-color-scheme: light) {
  .pc-root[data-theme="auto"] {${LIGHT}}
}
/* Zero specificity (:where), so .pc-fab and .pc-pin can set their own background. Controls answer a
   tap at once (no double-tap-zoom wait) and a long press doesn't select their labels; comment text
   stays selectable. */
:where(.pc-root) button {
  font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer;
  touch-action: manipulation; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;
}
:where(.pc-root) button:disabled { cursor: default; }
.pc-root :focus-visible { outline: 2px solid var(--_accent); outline-offset: 1px; }
.pc-root svg { display: block; flex-shrink: 0; }
/* A site's own icon (the icons prop) fills the box the layer gives it, whatever size it was made at. */
.pc-glyph { display: flex; flex-shrink: 0; }
.pc-glyph > svg { width: 100%; height: 100%; }

.pc-fixed { position: fixed; z-index: var(--_z); }
.pc-row { display: flex; align-items: center; }
.pc-col { display: flex; flex-direction: column; }
.pc-fill { min-width: 0; flex: 1; }
.pc-truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pc-surface, .pc-pin, .pc-compose:not([data-flat]) {
  background: var(--_surface); box-shadow: var(--_highlight), var(--_shadow);
  -webkit-backdrop-filter: var(--_backdrop); backdrop-filter: var(--_backdrop);
}

.pc-overlay { position: fixed; inset: 0; z-index: var(--_z); cursor: crosshair; }
/* pick="pin": the pin is the cursor while it follows the pointer. */
.pc-overlay[data-aiming] { cursor: none; }
.pc-target {
  position: fixed; z-index: var(--_z); pointer-events: none; border-radius: 2px;
  outline: 1.5px solid var(--_mark); outline-offset: -1px;
  background: color-mix(in srgb, var(--_mark) 6%, transparent);
}
.pc-target-label {
  position: fixed; z-index: var(--_z); pointer-events: none; max-width: 280px;
  padding: 2px 4px; border-radius: 4px; font-size: 11px; line-height: 16px;
  background: var(--_mark); color: var(--_on-mark);
}
.pc-area {
  position: fixed; z-index: var(--_z); pointer-events: none; border-radius: 4px;
  border: 2px solid var(--_mark);
  background: color-mix(in srgb, var(--_mark) 8%, transparent);
}

/* A coding agent's comment, posted through dogear mcp. */
.pc-badge {
  flex-shrink: 0; align-self: center; padding: 0 4px; border-radius: 4px;
  font-size: 10px; line-height: 16px; font-weight: 600; letter-spacing: 0.02em;
  color: var(--_agent); background: color-mix(in srgb, var(--_agent) 18%, transparent);
}
/* The assistant: a sparkle on its own colour, a note under its answers, and a pulse while it reads. */
.pc-avatar[data-agent] {
  display: flex; align-items: center; justify-content: center;
  background: var(--_agent); color: var(--_on-accent);
}
.pc-ai-note { display: block; margin-top: 4px; padding-left: 32px; color: var(--_muted); }
.pc-reading { gap: 8px; color: var(--_muted); }
.pc-reading > span:last-child { animation: pc-reading 1.6s ease-in-out infinite; }
@keyframes pc-reading { 50% { opacity: 0.45; } }
@media (prefers-reduced-motion: reduce) { .pc-reading > span:last-child { animation: none; } }
/* Initials sit on a quiet tint of the text colour, so a list of them doesn't read as a row of buttons. */
.pc-avatar {
  flex-shrink: 0; width: 24px; height: 24px; border-radius: 999px; object-fit: cover;
  display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--_text) 8%, var(--_surface)); color: var(--_text);
  font-size: 10px; line-height: 1; font-weight: 600;
}
/* On one of the page's avatars (light, soft gradients by default), the initials are dark. */
.pc-avatar[data-tint], .pc-swatch { color: var(--dogear-avatar-text, rgba(0, 0, 0, 0.56)); }

/* The name step's avatars: a row under the name field, the pick ringed. */
.pc-swatches { gap: 8px; flex-wrap: wrap; }
.pc-swatch {
  width: 24px; height: 24px; border-radius: 999px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; line-height: 1; font-weight: 600; letter-spacing: 0;
  transition: transform 150ms ease, box-shadow 150ms ease;
}
.pc-root .pc-swatch[aria-checked="true"] { box-shadow: 0 0 0 2px var(--_surface), 0 0 0 3.5px var(--_strong); }
.pc-root .pc-swatch:focus-visible { outline-offset: 4px; }
.pc-swatch:active { transform: scale(0.92); }
@media (hover: hover) and (pointer: fine) {
  .pc-swatch:hover { transform: scale(1.08); }
}

/* A pin grows out of its tail: the square bottom-left corner sits on the point. */
.pc-pin {
  position: fixed; z-index: var(--_z); width: 32px; height: 32px; padding: 4px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 16px 16px 16px 0; transform-origin: bottom left;
  box-shadow: var(--_highlight), var(--_pin-shadow);
}
.pc-pin[data-pending] { background: var(--_mark); }
.pc-pin[data-selected] { box-shadow: 0 0 0 2px var(--_mark), var(--_pin-shadow); }
/* backwards, not both: a forwards fill would keep owning transform and the hover scale would never apply. */
/* "Changed since": the element's text no longer matches what was commented on. */
.pc-dot { flex-shrink: 0; width: 8px; height: 8px; border-radius: 999px; background: var(--_changed); }
.pc-pin-dot {
  position: absolute; top: -2px; right: -2px; width: 10px; height: 10px; border-radius: 999px;
  background: var(--_changed); box-shadow: 0 0 0 2px var(--_surface);
}
.pc-pin-enter { animation: pc-pop 200ms cubic-bezier(0.215, 0.61, 0.355, 1) backwards; }
@keyframes pc-pop { from { opacity: 0; transform: scale(0.6); } }
button.pc-pin { transition: transform 150ms ease; }
@media (hover: hover) and (pointer: fine) {
  button.pc-pin:hover { transform: scale(1.08); }
}
/* The pin you'd drop (pick="pin"), following the pointer: it comes in, then just moves. */
.pc-pin-ghost { pointer-events: none; animation: pc-ghost-in 120ms cubic-bezier(0.215, 0.61, 0.355, 1) backwards; }
@keyframes pc-ghost-in { from { opacity: 0; transform: scale(0.9); } }
button.pc-pin:active { transform: scale(0.95); }
/* Someone else's comment, arriving while you watch: one ring goes out from its tail. */
.pc-pin[data-arrived]::after {
  content: ""; position: absolute; inset: 0; border-radius: inherit; background: inherit;
  transform-origin: bottom left; pointer-events: none; z-index: -1;
  animation: pc-ping 700ms cubic-bezier(0.215, 0.61, 0.355, 1) forwards;
}
@keyframes pc-ping { from { opacity: 0.5; transform: scale(1); } to { opacity: 0; transform: scale(2.2); } }

.pc-card { animation: pc-card-in 200ms cubic-bezier(0.215, 0.61, 0.355, 1); }
@keyframes pc-card-in { from { opacity: 0; transform: scale(0.96); } }
/* Posted: the composer folds toward its pin, and the pending pin gives way to the real one, which
   settles in from under it. */
.pc-card[data-leaving] {
  pointer-events: none; animation: pc-card-out 160ms cubic-bezier(0.215, 0.61, 0.355, 1) forwards;
}
@keyframes pc-card-out { to { opacity: 0; transform: scale(0.96); } }
.pc-pin[data-leaving] { animation: pc-pin-out 160ms cubic-bezier(0.215, 0.61, 0.355, 1) forwards; }
@keyframes pc-pin-out { to { opacity: 0; transform: scale(0.9); } }
.pc-pin-settle { animation: pc-settle 200ms cubic-bezier(0.215, 0.61, 0.355, 1) 120ms backwards; }
@keyframes pc-settle { from { transform: scale(0.9); } }
.pc-row-enter { animation: pc-row-in 200ms cubic-bezier(0.215, 0.61, 0.355, 1); }
@keyframes pc-row-in { from { opacity: 0; transform: translateY(4px); } }
/* Yours, turned away after it showed: it softens out where it is (180ms), then its row folds from
   its own height (--_h, measured) to nothing (200ms), so what's under it closes up. */
.pc-root [data-gone] {
  pointer-events: none; overflow: hidden; transform-origin: center top;
  animation: pc-gone 180ms cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards,
    pc-fold 200ms cubic-bezier(0.645, 0.045, 0.355, 1) 180ms forwards;
}
@keyframes pc-gone { to { opacity: 0; transform: scale(0.98); filter: blur(2px); } }
@keyframes pc-fold {
  from { max-height: var(--_h, 120px); }
  to { max-height: 0; padding-top: 0; padding-bottom: 0; margin-top: 0; margin-bottom: 0; }
}
.pc-pins[data-state="closed"] {
  pointer-events: none;
  animation: pc-pins-out 150ms cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
}
@keyframes pc-pins-out { to { opacity: 0; } }

/* Fields, as a command palette has them: no box. An input row (a leading icon, then 14/20 text,
   bright as typed over a faint placeholder) and a footer of actions, each its label and key. On
   its own a field is a panel; inside a card it sits on a faint fill. */
.pc-field {
  font: inherit; font-size: 14px; line-height: 20px; color: var(--_strong); background: transparent;
  border: none; outline: none; resize: none; width: 100%; padding: 0; min-width: 0;
}
.pc-field::placeholder { color: var(--_placeholder); }
/* The caret and the row's own light are the focus state: no ring inside a panel. */
.pc-root .pc-field:focus-visible { outline: none; }
/* iOS zooms the page into a field under 16px, and doesn't zoom back out. */
@media (pointer: coarse) {
  .pc-field { font-size: 16px; }
}
.pc-compose { border-radius: var(--_radius); overflow: hidden; }
.pc-compose[data-flat] { border-radius: 12px; background: var(--_field); }
.pc-compose-row { align-items: flex-start; gap: 12px; padding: 14px 16px 8px; }
.pc-compose-lead {
  flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  min-width: 16px; height: 20px; color: var(--_muted); transition: color 150ms ease;
}
.pc-compose-lead > .pc-avatar { margin-block: -2px; }
.pc-compose:focus-within .pc-compose-lead { color: var(--_strong); }
.pc-compose-foot { justify-content: flex-end; gap: 16px; padding: 4px 14px 12px; }
/* The @ list: who you can mention, in an inset tray under the text as you type. */
.pc-mentions { margin: 2px 8px 4px; padding: 4px; gap: 2px; border-radius: 12px; background: var(--_well); }
.pc-mention-row {
  gap: 8px; width: 100%; padding: 6px 8px; border-radius: 8px; text-align: left;
  font-size: 13px; line-height: 16px; color: var(--_text);
}
.pc-mention-row[data-active] { background: var(--_row-active); box-shadow: var(--_row-highlight); color: var(--_strong); }
.pc-mention-name { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pc-mention-handle { color: var(--_muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.pc-mention-row > .pc-avatar { width: 20px; height: 20px; font-size: 9px; }
/* A name a comment @mentions, as the writer meant it: the person, not their handle. */
.pc-mention { color: var(--_mention); font-weight: 500; }
.pc-key-action {
  display: flex; align-items: center; gap: 6px; font-size: 12px; line-height: 16px; font-weight: 500;
  letter-spacing: -0.015em; color: var(--_faint); white-space: nowrap; transition: color 150ms ease;
}
.pc-key-action[data-ready] { color: var(--_strong); }
.pc-key-action[aria-disabled="true"] { cursor: default; }
.pc-root .pc-key-action:focus-visible { outline-offset: 3px; border-radius: 4px; }
/* An inset tray inside a panel: the list's, and the name step's avatars. */
.pc-well {
  margin: 0 8px; padding: 12px; gap: 10px; border-radius: calc(var(--_radius) - 6px); background: var(--_well);
}
.pc-compose[data-flat] .pc-well { margin: 0 8px; }
.pc-well-label { font-size: 12px; line-height: 16px; color: var(--_faint); }
/* The name step: a large avatar between its arrows, the name centred under it, and Continue (the
   dock's footer, below) inset at the bottom. */
.pc-join { position: relative; align-items: center; gap: 20px; padding: 32px 16px 24px; }
.pc-join-close { position: absolute; top: 8px; right: 8px; }
.pc-stage { gap: 16px; }
.pc-stage .pc-icon-action {
  transition: background-color 150ms ease, color 150ms ease, transform 150ms ease,
    opacity 150ms cubic-bezier(0.215, 0.61, 0.355, 1);
}
.pc-stage .pc-icon-action:active { transform: scale(0.97); }
.pc-stage-avatar {
  position: relative; width: 96px; height: 96px; border-radius: 999px; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--_text) 8%, var(--_surface));
}
.pc-stage-layer { position: absolute; inset: 0; }
/* A new pick fades in over the last. */
.pc-stage-layer[data-in] { animation: pc-fade 180ms cubic-bezier(0.215, 0.61, 0.355, 1); }
.pc-stage-initials {
  position: relative; font-size: 32px; line-height: 1; font-weight: 600; letter-spacing: -0.02em;
  color: var(--dogear-avatar-text, rgba(0, 0, 0, 0.56));
}
.pc-join-name { text-align: center; }
/* Checking the name: the avatar says hi while it waits. It breathes, its initials nod, an arc in
   its own colours turns around it, and the arrows step back so it can't change mid-check. */
.pc-stage-hold { position: relative; display: flex; }
.pc-stage-ring {
  position: absolute; inset: -6px; border-radius: 999px; opacity: 0; pointer-events: none;
  /* A 2.5px band, fading in along its length like a comet's tail. */
  -webkit-mask: conic-gradient(transparent 0deg, #000 300deg),
    radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px));
  -webkit-mask-composite: source-in;
  mask: conic-gradient(transparent 0deg, #000 300deg),
    radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px));
  mask-composite: intersect;
  transition: opacity 150ms cubic-bezier(0.215, 0.61, 0.355, 1);
}
.pc-join[data-checking] .pc-stage-ring { opacity: 1; animation: pc-spin 1.1s linear infinite; }
@keyframes pc-spin { to { rotate: 360deg; } }
.pc-join[data-checking] .pc-stage-avatar { animation: pc-breathe 1.4s ease-in-out infinite alternate; }
@keyframes pc-breathe { to { scale: 1.04; } }
.pc-join[data-checking] .pc-stage-initials { animation: pc-nod 1.4s ease-in-out infinite; }
@keyframes pc-nod {
  15% { rotate: -8deg; }
  30% { rotate: 6deg; }
  43%, 100% { rotate: 0deg; }
}
.pc-join[data-checking] .pc-stage .pc-icon-action { opacity: 0; pointer-events: none; }
.pc-join[data-checking] .pc-join-name { color: var(--_muted); }
/* "Saying hi", and three dots hopping one after another. */
.pc-dots { display: inline-flex; gap: 2px; margin-left: 2px; }
.pc-dots i { width: 3px; height: 3px; border-radius: 999px; background: currentColor; animation: pc-hop 900ms ease-in-out infinite; }
.pc-dots i:nth-child(2) { animation-delay: 120ms; }
.pc-dots i:nth-child(3) { animation-delay: 240ms; }
@keyframes pc-hop { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-3px); } }
.pc-hidden {
  position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap;
}

/* A thread's form on screen instead of yours: a pill, top centre. */
.pc-replay {
  position: fixed; z-index: var(--_z); top: 16px; left: 0; right: 0;
  display: flex; justify-content: center; pointer-events: none; padding: 0 16px;
}
.pc-replay-pill {
  pointer-events: auto; min-width: 0; max-width: 100%; gap: 8px; padding: 4px 4px 4px 8px;
  border-radius: 999px; color: var(--_text); transform-origin: top center;
}
.pc-replay-pill > .pc-avatar { width: 20px; height: 20px; font-size: 9px; }
.pc-replay-back {
  flex-shrink: 0; height: 28px; padding: 0 12px; border-radius: 999px;
  background: var(--_hover); color: var(--_text); font-weight: 500;
}
.pc-replay-back:active { transform: scale(0.97); }

.pc-icon-action {
  width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; color: var(--_muted); border-radius: 8px;
  transition: background-color 150ms ease, color 150ms ease;
}
.pc-icon-action:active, [aria-expanded="true"] > .pc-icon-action { background: var(--_hover); color: var(--_text); }
.pc-menu {
  position: absolute; min-width: 160px; padding: 4px; border-radius: 12px;
  box-shadow: 0 0 0 1px var(--_divider), var(--_shadow); transform-origin: top right;
}
.pc-menu-item { text-align: left; padding: 8px 12px; border-radius: 8px; }
.pc-menu-item:active, .pc-menu-item:focus-visible { background: var(--_hover); outline: none; }
/* Hover only where there's a pointer to hover with: on touch, the first tap leaves :hover stuck. */
@media (hover: hover) and (pointer: fine) {
  .pc-icon-action:hover { background: var(--_hover); color: var(--_text); }
  .pc-menu-item:hover { background: var(--_hover); }
}

/* Card chrome shared by the tray and a thread: a 44px header (16px in, 8px around the 28px
   buttons), then the body. */
.pc-head {
  gap: 8px; min-height: 44px; padding: 8px 8px 8px 16px; border-bottom: 1px solid var(--_divider);
}
.pc-title { font-weight: 600; }
.pc-meta { color: var(--_muted); font-size: 12px; line-height: 16px; }
/* A comment's byline and text, the same in the tray, a thread and a preview: 13px throughout,
   the name at 1.2 and the text at 1.4, 4 between them, 3 around the dot. */
.pc-byline { display: flex; align-items: baseline; gap: 3px; min-width: 0; line-height: 1.2; }
.pc-name { font-weight: 500; }
.pc-sep { flex-shrink: 0; color: var(--_faint); opacity: 0.6; font-size: 12px; font-weight: 600; }
.pc-time { flex-shrink: 0; color: var(--_faint); font-variant-numeric: tabular-nums; }
.pc-body { font-weight: 450; line-height: 1.4; }

.pc-thread { border-radius: var(--_radius); max-height: calc(100vh - 32px); max-height: calc(100dvh - 32px); }
/* 16 between comments against 4 inside one, so each reads as its own block. */
.pc-thread-list { min-height: 0; overflow-y: auto; gap: 16px; padding: 16px; }
.pc-comment-body { margin-top: 4px; padding-left: 32px; white-space: pre-wrap; overflow-wrap: anywhere; }
.pc-comment-head { gap: 8px; min-height: 28px; }
.pc-reply { padding: 0 8px 8px; }
.pc-preview { cursor: pointer; padding: 12px; }

.pc-dock {
  position: fixed; z-index: var(--_z); display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
  right: var(--dogear-right, 24px); bottom: var(--dogear-bottom, 24px);
  /* Clear of the home indicator and the notch, on a page with viewport-fit=cover. */
  right: calc(var(--dogear-right, 24px) + env(safe-area-inset-right, 0px));
  bottom: calc(var(--dogear-bottom, 24px) + env(safe-area-inset-bottom, 0px));
}
.pc-fab {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  min-width: 36px; height: 36px; padding: 0 12px; border-radius: 999px;
  font-weight: 500; background: var(--_surface); color: var(--_text); box-shadow: var(--_shadow);
  transition: transform 150ms ease;
}
.pc-fab:active { transform: scale(0.96); }
/* The fab's comment mode is a mode, so it shows as one. */
.pc-fab[data-active] { background: var(--_accent); color: var(--_on-accent); }
/* The dock layout: a button you can drag anywhere, a row of controls, a panel. The box takes the
   face's measured size, so the shape leads and the face fades in behind it. */
.pc-float {
  position: fixed; z-index: var(--_z); user-select: none; -webkit-user-select: none; touch-action: none;
}
.pc-float-box {
  position: relative; overflow: hidden; color: var(--_text); cursor: grab;
  border-radius: 20px; min-width: 40px; min-height: 40px;
  --_spring: cubic-bezier(0.645, 0.045, 0.355, 1);
}
@supports (transition-timing-function: linear(0, 1)) {
  .pc-float-box {
    --_spring: linear(0, 0.0422, 0.1396, 0.2606, 0.3856, 0.5032, 0.6077, 0.6966, 0.77, 0.829, 0.8754,
      0.911, 0.938, 0.9579, 0.9723, 0.9826, 0.9897, 0.9945, 0.9976, 0.9996, 1.0007, 1.0013, 1.0015,
      1.0015, 1);
  }
}
.pc-float-box[data-ready] { transition: width 300ms var(--_spring), height 300ms var(--_spring), border-radius 300ms var(--_spring), box-shadow 150ms ease; }
.pc-float-box[data-face="panel"] { border-radius: var(--_radius); cursor: auto; }
.pc-float[data-dragging] .pc-float-box { cursor: grabbing; transition: none; box-shadow: var(--_highlight), 0 8px 24px rgba(0, 0, 0, 0.3), 0 0 0 0.5px rgba(0, 0, 0, 0.12); }
.pc-float-face { position: absolute; width: max-content; animation: pc-face-in 150ms cubic-bezier(0.23, 1, 0.32, 1) 40ms backwards; }
@keyframes pc-face-in { from { opacity: 0; transform: scale(0.96); filter: blur(4px); } }
.pc-float-icon { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; cursor: inherit; }
.pc-float-tray { height: 40px; padding: 4px; gap: 2px; }
.pc-float-button {
  justify-content: center; gap: 6px; min-width: 32px; height: 32px; padding: 0 8px; border-radius: 999px;
  flex-shrink: 0; color: var(--_muted); cursor: inherit; font-variant-numeric: tabular-nums;
  transition: background-color 150ms ease, color 150ms ease, transform 150ms ease;
}
.pc-float-button:active { transform: scale(0.96); }
.pc-float-button[aria-pressed="true"] { color: var(--_accent); background: color-mix(in srgb, var(--_accent) 16%, transparent); }
.pc-float-count { color: var(--_text); font-weight: 500; }
.pc-float-mentions { color: var(--_mention); }
.pc-float-divider { width: 1px; align-self: stretch; margin: 6px 4px; background: var(--_divider); }
.pc-float-panel { min-height: 0; }
.pc-float-head { flex-shrink: 0; gap: 4px; min-height: 44px; padding: 4px 4px 4px 16px; border-bottom: 1px solid var(--_divider); cursor: grab; }
.pc-float[data-dragging] .pc-float-head { cursor: grabbing; }
.pc-float-list {
  min-height: 0; overflow-y: auto; padding: 4px 6px 8px; list-style: none; overscroll-behavior: contain;
  scrollbar-width: thin; scrollbar-color: var(--_faint) transparent;
}
.pc-float-badge {
  position: absolute; top: -4px; pointer-events: none; display: flex; align-items: center; justify-content: center;
  min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px;
  font-size: 11px; line-height: 1; font-weight: 600; font-variant-numeric: tabular-nums;
  color: var(--_on-accent); animation: pc-badge-in 160ms cubic-bezier(0.23, 1, 0.32, 1);
}
.pc-float-badge-mentions { left: -4px; background: var(--_mention); }
.pc-float-badge-open { right: -4px; background: var(--_accent); }
@keyframes pc-badge-in { from { opacity: 0; transform: scale(0.6); } }
@media (hover: hover) and (pointer: fine) {
  .pc-float-button:hover { background: var(--_hover); color: var(--_text); }
  .pc-float-button[aria-pressed="true"]:hover { color: var(--_accent); background: color-mix(in srgb, var(--_accent) 22%, transparent); }
  .pc-float-icon:hover { color: var(--_strong); }
}
@media (prefers-reduced-motion: reduce) {
  .pc-float-box[data-ready] { transition: none; }
  .pc-float-face, .pc-float-badge { animation: none; }
}
.pc-hint { border-radius: 12px; padding: 8px 12px; gap: 12px; color: var(--_muted); }
.pc-count { color: var(--_muted); font-variant-numeric: tabular-nums; }
.pc-kbd {
  font: inherit; font-size: 12px; line-height: 16px; font-weight: 500; letter-spacing: -0.015em;
  min-width: 20px; padding: 2px 6px; border-radius: 4px; text-align: center;
  background: var(--_hover); color: color-mix(in srgb, var(--_text) 90%, transparent);
}

/* The tray layout's dock (Dock in comments.tsx): one box that is the closed pill, the open panel
   and the placing hint. Its width and height are set in px and transition, on a spring that barely
   overshoots (an ease-in-out where linear() isn't supported), so the panel grows out of the pill
   and shrinks back into it, and reverses from wherever it is. 280ms open, 220ms otherwise. */
.pc-dock-box {
  position: relative; overflow: hidden; border-radius: var(--_radius); transform-origin: bottom right;
  --_spring: cubic-bezier(0.645, 0.045, 0.355, 1);
}
@supports (transition-timing-function: linear(0, 1)) {
  .pc-dock-box {
    --_spring: linear(0, 0.0422, 0.1396, 0.2606, 0.3856, 0.5032, 0.6077, 0.6966, 0.77, 0.829, 0.8754,
      0.911, 0.938, 0.9579, 0.9723, 0.9826, 0.9897, 0.9945, 0.9976, 0.9996, 1.0007, 1.0013, 1.0015,
      1.0015, 1);
  }
}
.pc-dock-box[data-ready] {
  transition: width 280ms var(--_spring), height 280ms var(--_spring), transform 150ms ease;
}
.pc-dock-box[data-ready]:is([data-state="closed"], [data-state="placing"]) { transition-duration: 220ms, 220ms, 150ms; }
.pc-dock-box:is([data-state="closed"], [data-state="placing"]):active { transform: scale(0.97); }
/* Pinned to the bottom right, so the box reveals it from there as it grows. */
.pc-dock-inner { position: absolute; right: 0; bottom: 0; width: max-content; }
.pc-dock-body {
  position: relative; min-height: 0; max-height: calc(min(520px, 100vh - 96px) - 40px);
  /* The visible height, which shrinks while the browser's toolbars show. */
  max-height: calc(min(520px, 100dvh - 96px) - 40px);
  animation: pc-dock-in 200ms cubic-bezier(0.215, 0.61, 0.355, 1) 60ms backwards;
}
.pc-dock-body[data-leaving] {
  pointer-events: none; animation: pc-dock-out 140ms ease forwards;
}
@keyframes pc-dock-in { from { opacity: 0; transform: translateY(6px); filter: blur(2px); } }
@keyframes pc-dock-out { to { opacity: 0; } }
/* Just joined: the name step fades out where it was, over the list fading in. */
.pc-dock-body[data-fading] { position: absolute; left: 0; right: 0; bottom: 40px; }
.pc-dock-row { animation: pc-row-in 200ms cubic-bezier(0.215, 0.61, 0.355, 1) backwards; }
/* Yours, just posted: drops in from above, lit, and the light fades. */
.pc-row-fresh { animation-name: pc-row-arrive; animation-duration: 220ms; }
@keyframes pc-row-arrive { from { opacity: 0; transform: translateY(-4px); filter: blur(2px); } }
.pc-row-fresh > .pc-tray-row { animation: pc-row-lit 900ms ease 200ms backwards; }
@keyframes pc-row-lit {
  0%, 30% { background: var(--_row-active); box-shadow: var(--_row-highlight); }
}
/* The title floats over the top of the list, which scrolls under it, and starts where the rows'
   photos do: 6 (the list's side) + 10 (the row's) = 16. */
.pc-dock-body .pc-head {
  position: absolute; top: 0; left: 0; right: 0; z-index: 1; height: 44px; min-height: 0;
  border-bottom: none; padding: 8px 8px 8px 16px;
}
/* The pill, and the open panel's footer: the label sits right, where the pill was. */
.pc-dock-foot {
  flex-shrink: 0; justify-content: flex-end; width: 100%; height: 40px; padding: 0 14px;
  color: var(--_strong); font-size: 12px; line-height: 16px; font-weight: 500;
  letter-spacing: -0.015em; white-space: nowrap; transition: background-color 150ms ease;
}
.pc-dock-foot[data-waiting] { color: var(--_faint); cursor: default; }
/* Joining, the pill is the name step's Continue button, inset in the panel; it eases there and
   back with the panel itself. */
.pc-dock-box[data-ready] .pc-dock-foot {
  transition: margin 280ms var(--_spring), width 280ms var(--_spring), border-radius 280ms var(--_spring),
    background-color 150ms ease, box-shadow 150ms ease, transform 150ms ease;
}
.pc-dock-box[data-state="join"] .pc-dock-foot {
  justify-content: center; margin: 0 12px 12px; width: calc(100% - 24px); border-radius: 12px;
  background: var(--_hover); box-shadow: var(--_row-highlight);
}
.pc-dock-box[data-state="join"] .pc-dock-foot:not([data-waiting]):active { transform: scale(0.97); }
@media (hover: hover) and (pointer: fine) {
  .pc-dock-box[data-state="join"] .pc-dock-foot:not([data-waiting]):hover { background: var(--_row-active); }
}
.pc-dock-label { gap: 6px; animation: pc-fade 120ms cubic-bezier(0.215, 0.61, 0.355, 1); }
@keyframes pc-fade { from { opacity: 0; } }
.pc-root .pc-dock-foot:focus-visible { outline-offset: -4px; border-radius: calc(var(--_radius) - 4px); }
@media (hover: hover) and (pointer: fine) {
  .pc-dock-box:is([data-state="closed"], [data-state="placing"]) .pc-dock-foot:hover { background: var(--_hover); }
  .pc-dock-foot:hover .pc-kbd { color: var(--_strong); }
}
/* The list is the panel's own scroller, starting under the title: rows dissolve as they pass under
   it (gone level with the title, above 32px; whole from 56px, where the first row's photo starts)
   and soften into the footer over the last 24px (the last row's padding and the list's, at the
   end). A thin scrollbar on the faint text colour; Safari, which has no scrollbar-color, gets the
   same as a WebKit scrollbar clear of the title. Each row is 12×10. */
.pc-tray-list {
  min-height: 0; overflow-y: auto; padding: 44px 6px 12px; list-style: none; overscroll-behavior: contain;
  -webkit-mask-image: linear-gradient(to bottom, transparent 32px, #000 56px, #000 calc(100% - 24px), transparent);
  mask-image: linear-gradient(to bottom, transparent 32px, #000 56px, #000 calc(100% - 24px), transparent);
  scrollbar-width: thin; scrollbar-color: var(--_faint) transparent;
}
@supports not (scrollbar-color: red red) {
  .pc-tray-list::-webkit-scrollbar { width: 8px; }
  .pc-tray-list::-webkit-scrollbar-track { background: transparent; margin: 44px 0 12px; }
  .pc-tray-list::-webkit-scrollbar-thumb {
    background: var(--_faint); border: 2px solid transparent; border-radius: 999px; background-clip: padding-box;
  }
}
.pc-tray-row {
  align-items: flex-start; gap: 8px; padding: 12px 10px; border-radius: var(--_row-radius);
  text-align: left; width: 100%; transition: background-color 150ms ease, box-shadow 150ms ease;
}
/* Reactions: chips of emoji and count under a comment's text, yours ringed. In the list they sit
   in room the row leaves at its foot, over its button rather than inside it, starting where the
   text does (10 + 24 + 8 = 42). */
.pc-reactions { flex-wrap: wrap; gap: 4px; min-height: 24px; }
.pc-dock-row { position: relative; }
.pc-dock-row:has(> .pc-reactions) > .pc-tray-row { padding-bottom: 40px; }
.pc-dock-row > .pc-reactions { position: absolute; left: 42px; right: 10px; bottom: 10px; }
/* Only the chips catch the pointer: the band's empty room is still the row, to hover and to press. */
.pc-dock-row > .pc-reactions { pointer-events: none; }
.pc-dock-row > .pc-reactions > * { pointer-events: auto; }
.pc-thread-reactions { padding: 6px 0 0 32px; }
.pc-thread-reactions:empty { display: none; }
:where(.pc-root) .pc-reaction {
  height: 24px; min-width: 24px; padding: 0 7px; gap: 4px; justify-content: center;
  border-radius: 999px; background: var(--_hover); color: var(--_text);
  font-size: 12px; line-height: 1; font-variant-numeric: tabular-nums;
  /* Presses, arrivals and exits are motion's (src/motion.ts); colour stays here. */
  transition: background-color 150ms ease, box-shadow 150ms ease, color 150ms ease;
}
.pc-reaction-emoji { display: inline-block; font-size: 14px; line-height: 1; }
.pc-reaction[aria-pressed="true"] {
  background: color-mix(in srgb, var(--_strong) 14%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--_strong) 32%, transparent);
  color: var(--_strong);
}
.pc-reaction:disabled { cursor: default; }
.pc-reaction[data-leaving] { pointer-events: none; }
.pc-reaction-add { padding: 0; width: 24px; color: var(--_muted); }
/* A count rolls inside its own box, clipped, so the old number and the new never show at once
   outside it and the chip keeps its width. */
.pc-count { position: relative; display: inline-grid; overflow: hidden; height: 14px; line-height: 14px; }
.pc-count > span { grid-area: 1 / 1; display: block; }
.pc-count-ghost { position: absolute; inset: 0; text-align: center; }
@media (hover: hover) and (pointer: fine) {
  .pc-reaction:hover:not(:disabled) { background: color-mix(in srgb, var(--_strong) 12%, transparent); }
  .pc-reaction-add:hover { color: var(--_strong); }
  .pc-reaction-pick:hover { background: var(--_hover); }
}
.pc-reaction-set { gap: 2px; padding: 2px; border-radius: 999px; background: var(--_hover); }
:where(.pc-root) .pc-reaction-pick {
  width: 28px; height: 24px; border-radius: 999px; font-size: 15px; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  transition: background-color 150ms ease;
}
.pc-reaction-pick[aria-pressed="true"] { background: color-mix(in srgb, var(--_strong) 16%, transparent); }
.pc-reaction-more { color: var(--_muted); }
@media (hover: hover) and (pointer: fine) {
  .pc-reaction-more:hover { color: var(--_strong); }
}
/* The full picker: a panel of its own over the layer. A search row as the fields have it, your
   recent picks, then every emoji by category. */
.pc-emoji {
  display: flex; flex-direction: column; overflow: hidden; border-radius: var(--_radius); outline: none;
  /* A layer up from the panel under it, so a touch lighter rather than twice as dark; and over
     the panel's own controls. */
  --_picker: color-mix(in srgb, var(--_text) 5%, var(--_surface));
  background-color: var(--_picker); z-index: calc(var(--_z) + 1);
}
.pc-emoji[data-leaving] { pointer-events: none; }
.pc-emoji-root { flex: 1; min-height: 0; width: 100%; }
.pc-emoji-search { gap: 8px; padding: 14px 16px 10px; color: var(--_placeholder); flex-shrink: 0; }
.pc-emoji-search .pc-field::-webkit-search-cancel-button { display: none; }
.pc-emoji-recent { gap: 2px; padding: 0 0 4px; flex-shrink: 0; }
.pc-emoji-recent > .pc-row { padding: 0 16px; }
.pc-emoji-label {
  padding: 0 16px; font-size: 11px; line-height: 24px; font-weight: 500; color: var(--_muted);
}
.pc-emoji-viewport {
  position: relative; flex: 1; min-height: 0; outline: none;
  scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--_text) 24%, transparent) transparent;
}
.pc-emoji-list { padding-bottom: 8px; }
.pc-emoji-row { display: flex; justify-content: center; }
:where(.pc-root) .pc-emoji-cell {
  width: 32px; height: 32px; flex-shrink: 0; border-radius: 8px; font-size: 20px; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--frimousse-emoji-font, inherit);
  transition: background-color 120ms ease;
}
.pc-emoji-cell[data-active] { background: var(--_hover); }
.pc-emoji-cell[aria-pressed="true"] { background: color-mix(in srgb, var(--_strong) 16%, transparent); }
@media (hover: hover) and (pointer: fine) {
  .pc-emoji-recent .pc-emoji-cell:hover { background: var(--_hover); }
}
.pc-emoji-state {
  position: absolute; inset: 0; display: flex; flex-direction: column; gap: 10px;
  align-items: center; justify-content: center; color: var(--_muted); text-align: center;
}
:where(.pc-root) .pc-emoji-retry {
  height: 28px; padding: 0 12px; border-radius: 999px; background: var(--_hover); color: var(--_strong);
  font-weight: 500; transition: background-color 150ms ease;
}
/* Copies of a reaction you just left, flying up out of it: above everything, never in the way. */
.pc-burst {
  position: fixed; z-index: var(--_z); pointer-events: none; font-size: 12px; line-height: 1;
  translate: -50% -50%;
}

/* The name · time line is the photo's height, so it sits centred on it; the text follows. */
.pc-tray-row-text { gap: 0; }
.pc-tray-row .pc-byline, .pc-preview .pc-byline { line-height: 24px; }
.pc-tray-row .pc-meta { color: var(--_faint); }
.pc-tray-row:active, .pc-tray-row:focus-visible { background: var(--_row-active); box-shadow: var(--_row-highlight); }
@media (hover: hover) and (pointer: fine) {
  /* The row stays lit while the pointer is on one of its chips, which sit over it. */
  .pc-tray-row:hover, .pc-dock-row:hover > .pc-tray-row { background: var(--_row-active); box-shadow: var(--_row-highlight); }
}
.pc-root .pc-tray-row:focus-visible { outline-offset: -2px; }
.pc-clamp {
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  overflow-wrap: anywhere;
}
.pc-tray-empty { padding: 12px 10px; color: var(--_muted); }
/* On a touch screen, placing says how to stop: the pill is the Esc key. */
.pc-dock-cancel { color: var(--_faint); }
/* A card as a phone's sheet (cardPosition): the pin stays in sight above it, and the keyboard
   (--_kb) takes its share of the screen. */
.pc-thread[data-sheet] {
  max-height: calc(min(60vh, 100vh - var(--_kb, 0px) - 120px));
  max-height: calc(min(60dvh, 100dvh - var(--_kb, 0px) - 120px));
}
@media (max-width: 480px) {
  .pc-dock[data-layout="tray"] {
    left: calc(8px + env(safe-area-inset-left, 0px)); right: calc(8px + env(safe-area-inset-right, 0px));
    bottom: calc(8px + env(safe-area-inset-bottom, 0px));
  }
  .pc-dock-body { max-height: calc(70vh - 40px); max-height: calc(70dvh - 40px); }
  /* The open thread's card needs the room: the list folds away, and the footer stays. */
  .pc-dock-box[data-thread] .pc-dock-body { display: none; }
  /* A guest who came by a link, before giving a name: the thread asks for it itself, so the name
     step's lone Continue would be a second, disabled ask under it. */
  .pc-dock-box[data-thread][data-state="join"] { visibility: hidden; }
}
/* Mentions of you: a filter in the tray's head, and a badge on its pill while unread. */
.pc-mentions-filter {
  flex-shrink: 0; height: 24px; gap: 4px; padding: 0 8px; border-radius: 999px;
  color: var(--_muted); font-weight: 500; transition: background-color 150ms ease, color 150ms ease;
}
.pc-mentions-filter[aria-pressed="true"] {
  color: var(--_mention); background: color-mix(in srgb, var(--_mention) 18%, transparent);
}
.pc-mentions-count, .pc-mentions-badge {
  min-width: 16px; padding: 0 5px; border-radius: 999px; text-align: center;
  font-size: 11px; line-height: 16px; font-weight: 600;
  background: var(--_mention); color: var(--_on-accent);
}
.pc-mentions-badge { font-size: 12px; line-height: 20px; padding: 0 6px; }
@media (hover: hover) and (pointer: fine) {
  .pc-mentions-filter:hover { background: var(--_hover); color: var(--_text); }
  .pc-mentions-filter[aria-pressed="true"]:hover { background: color-mix(in srgb, var(--_mention) 24%, transparent); color: var(--_mention); }
}
.pc-switch { display: flex; align-items: center; gap: 8px; color: var(--_text); cursor: pointer; }
.pc-switch input {
  appearance: none; width: 28px; height: 16px; border-radius: 999px; margin: 0; cursor: pointer;
  background: var(--_send-idle); position: relative; transition: background-color 150ms ease;
}
.pc-switch input::after {
  content: ""; position: absolute; top: 2px; left: 2px; width: 12px; height: 12px;
  border-radius: 999px; background: var(--_on-accent); transition: transform 150ms ease;
}
.pc-switch input:checked { background: var(--_accent); }
.pc-switch input:checked::after { transform: translateX(12px); }

.pc-toasts {
  /* Across the screen and centred in it, not hung from its middle (left: 50%), which left a toast
     only half the width to wrap in. */
  position: fixed; z-index: var(--_z); left: 16px; right: 16px;
  bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  display: flex; flex-direction: column; gap: 8px; align-items: center; pointer-events: none;
}
.pc-toast {
  pointer-events: auto; display: flex; align-items: center; gap: 12px;
  padding: 12px 16px; border-radius: 12px; max-width: min(420px, calc(100vw - 32px));
}
/* The bottom is the tray's and the sheet's on a phone: toasts drop in from the top instead. */
@media (max-width: 480px) {
  .pc-toasts { bottom: auto; top: calc(12px + env(safe-area-inset-top, 0px)); }
}
.pc-toast[data-tone="error"] { box-shadow: inset 3px 0 0 #e5484d, var(--_shadow); }
.pc-link { color: var(--_accent); font-weight: 600; white-space: nowrap; }
.pc-toast-action { color: var(--_accent); font-weight: 600; }

/* No keyboard to press it on. */
@media (hover: none) and (pointer: coarse) {
  .pc-kbd { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .pc-pin-enter, .pc-pin-ghost, .pc-card, .pc-row-enter, .pc-pin[data-arrived]::after { animation: none; }
  .pc-tray-row, .pc-dock-foot, .pc-fab, .pc-key-action, .pc-compose-lead { transition: none; }
  .pc-fab:active { transform: none; }
  .pc-dock-box[data-ready] { transition: none; }
  .pc-dock-box:is([data-state="closed"], [data-state="placing"]):active { transform: none; }
  .pc-dock-body, .pc-dock-body[data-leaving], .pc-dock-row, .pc-dock-label { animation: none; }
  .pc-row-fresh > .pc-tray-row, .pc-pin-settle { animation: none; }
  .pc-swatch { transition: none; }
  .pc-dock-box[data-ready] .pc-dock-foot, .pc-stage .pc-icon-action { transition: none; }
  .pc-dock-box[data-state="join"] .pc-dock-foot:active, .pc-stage .pc-icon-action:active { transform: none; }
  .pc-stage-layer[data-in] { animation: none; }
  .pc-root [data-gone] { animation: pc-dock-out 120ms ease forwards; }
  /* Checking a name: the ring still shows, nothing moves. */
  .pc-join[data-checking] .pc-stage-ring, .pc-join[data-checking] .pc-stage-avatar,
  .pc-join[data-checking] .pc-stage-initials, .pc-dots i { animation: none; }
  .pc-stage-ring, .pc-stage .pc-icon-action { transition: none; }
  .pc-dock-body[data-fading] { display: none; }
  .pc-swatch:hover, .pc-swatch:active { transform: none; }
  /* 1ms, not none: the composer and the pending pin still go when it ends. */
  .pc-card[data-leaving], .pc-pin[data-leaving] { animation-duration: 1ms; }
  button.pc-pin, button.pc-pin:hover, button.pc-pin:active { transition: none; transform: none; }
  /* 1ms, not none: onAnimationEnd is what unmounts the pins. */
  .pc-pins[data-state="closed"] { animation-duration: 1ms; }
}
`;
