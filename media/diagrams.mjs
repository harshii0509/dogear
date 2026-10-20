#!/usr/bin/env node
// Draws the README's "How it works" diagrams as standalone SVG files: grey tiles, dashed wires,
// and a blue pulse that runs the live path. The pulse is CSS, not script, so it plays inside an
// <img> on GitHub and npm. Light and dark follow the viewer's colour scheme; reduced motion stops
// the pulse. No dependencies.
//
//   node media/diagrams.mjs        writes media/*.svg

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = dirname(fileURLToPath(import.meta.url));
const W = 1200;

const ICONS = {
  globe: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M3 12h18 M12 3c3 3.2 3 14.8 0 18 M12 3c-3 3.2-3 14.8 0 18",
  bubble: "M4 12a8 8 0 1 1 3.2 6.4L4 20l1-3.6A8 8 0 0 1 4 12z M8.6 12h.01 M12 12h.01 M15.4 12h.01",
  code: "M8 8l-4 4l4 4 M16 8l4 4l-4 4 M13.5 6l-3 12",
  key: "M8 5a4 4 0 1 0 0 8a4 4 0 0 0 0-8z M11 12l8 8 M15.5 16.5l2-2 M18 19l1.8-1.8",
  shield: "M12 3l7 3v6c0 4.5-3 7.5-7 9c-4-1.5-7-4.5-7-9V6z M9 12l2 2l4-4",
  bell: "M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z M10 20.5a2 2 0 0 0 4 0",
  eye: "M2.5 12S6 6 12 6s9.5 6 9.5 6S18 18 12 18s-9.5-6-9.5-6z M12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5z",
  sparkle: "M11 3l1.8 5.2L18 10l-5.2 1.8L11 17l-1.8-5.2L4 10l5.2-1.8z M18 15l.7 1.8l1.8.7l-1.8.7L18 20l-.7-1.8l-1.8-.7l1.8-.7z",
  db: "M5 4.5h14v6.5H5z M5 13h14v6.5H5z M8.5 7.75h.01 M8.5 16.25h.01 M12 7.75h4 M12 16.25h4",
  chat: "M4 5h16v11H9.5L5 19.5V16H4z M8 9h8 M8 12h5",
  robot: "M12 3.5v3 M7 7.5h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z M9.5 12.5h.01 M14.5 12.5h.01 M9 21h6",
  terminal: "M4 5h16v14H4z M7.5 9.5L10 12l-2.5 2.5 M12 15h4",
  user: "M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M4.5 20.5a7.5 7.5 0 0 1 15 0",
  card: "M3 6h18v12H3z M8.5 9a2 2 0 1 0 0 4a2 2 0 0 0 0-4z M5.5 16c.5-1.4 1.6-2.1 3-2.1s2.5.7 3 2.1 M14 10h4 M14 13h3",
  at: "M16 12a4 4 0 1 1-8 0a4 4 0 0 1 8 0z M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1",
  tray: "M4 13h4l1.5 3h5l1.5-3h4 M4 13l2.5-8h11L20 13v6H4z M12 12V6.5 M9.5 9L12 6.5L14.5 9",
  pin: "M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z M12 8a2 2 0 1 0 0 4a2 2 0 0 0 0-4z",
  branch: "M6 3a2 2 0 1 0 0 4a2 2 0 0 0 0-4z M6 17a2 2 0 1 0 0 4a2 2 0 0 0 0-4z M18 7a2 2 0 1 0 0 4a2 2 0 0 0 0-4z M6 7v10 M18 11c0 4-6 3.5-11 6.5",
  check: "M5 12.5l4.5 4.5L19 7.5",
};

/* Each scene: tiles at their centres, groups behind them, wires between them. The "live" wires,
   in order, are the path the pulse runs. */
const SCENES = [
  {
    file: "how-it-fits",
    title: "How Dogear fits together",
    desc: "Your page runs the widget, which talks to one route made by createDogear. The route checks who you are and what you may see, then stores the comment. Auth, moderation, alerts and an assistant are optional. Coding agents read the same route over MCP.",
    H: 640,
    groups: [{ x: 420, y: 66, w: 440, h: 500, label: "@HARSHI04/DOGEAR/SERVER" }],
    nodes: [
      { id: "page", x: 110, y: 310, icon: "globe", label: "YOUR PAGE", sub: "any site" },
      { id: "widget", x: 290, y: 310, icon: "bubble", label: "WIDGET", sub: "<dogear-comments>", state: "on" },
      { id: "mcp", x: 290, y: 470, icon: "terminal", label: "MCP", sub: "coding agents" },
      { id: "auth", x: 530, y: 150, icon: "key", label: "AUTH", sub: "optional" },
      { id: "api", x: 530, y: 310, icon: "code", label: "ONE ROUTE", sub: "createDogear" },
      { id: "mod", x: 530, y: 470, icon: "shield", label: "MODERATE", sub: "optional" },
      { id: "notify", x: 750, y: 150, icon: "bell", label: "NOTIFY", sub: "optional" },
      { id: "see", x: 750, y: 310, icon: "eye", label: "CAN SEE?", sub: "your rule" },
      { id: "assistant", x: 750, y: 470, icon: "sparkle", label: "ASSISTANT", sub: "optional" },
      { id: "webhook", x: 1010, y: 150, icon: "tray", label: "WEBHOOK", sub: "or your own" },
      { id: "store", x: 1010, y: 310, icon: "db", label: "STORE", sub: "postgres · file · memory", state: "sel" },
      { id: "model", x: 1010, y: 470, icon: "robot", label: "YOUR MODEL", sub: "answer(thread)" },
    ],
    edges: [
      { from: "page", to: "widget", live: true },
      { from: "widget", to: "api", live: true },
      { from: "api", to: "see", live: true },
      { from: "see", to: "store", live: true },
      { from: "auth", to: "api" },
      { from: "mod", to: "api" },
      { from: "see", to: "notify" },
      { from: "see", to: "assistant" },
      { from: "notify", to: "webhook" },
      { from: "assistant", to: "model" },
      { points: [[334, 470], [400, 470], [400, 310], [486, 310]] },
    ],
    texts: [{ x: 600, y: 612, t: "NO SERVER? GIVE THE WIDGET AN ADAPTER: SUPABASE, YOUR API, LOCALSTORAGE", cls: "t-note" }],
  },
  {
    file: "guests",
    title: "Nobody has to sign in",
    desc: "With guests on, a visitor gives a name the first time and comments. The server signs a cookie, so the author never comes from the browser. Mentions and alerts stay off until you add your own sign-in.",
    H: 500,
    groups: [{ x: 400, y: 290, w: 400, h: 170, label: "ADD AUTH TO TURN THESE ON", dash: true, accent: true }],
    nodes: [
      { id: "visitor", x: 110, y: 170, icon: "user", label: "VISITOR", sub: "no account" },
      { id: "name", x: 300, y: 170, icon: "card", label: "NAME", sub: "asked once" },
      { id: "comment", x: 490, y: 170, icon: "bubble", label: "COMMENT", sub: "pin + thread", state: "on" },
      { id: "api", x: 690, y: 170, icon: "code", label: "ONE ROUTE", sub: "guests: true" },
      { id: "store", x: 890, y: 170, icon: "db", label: "STORE", sub: "signed cookie", state: "sel" },
      { id: "at", x: 510, y: 370, icon: "at", label: "MENTIONS", state: "off" },
      { id: "bell", x: 690, y: 370, icon: "bell", label: "ALERTS", state: "off" },
    ],
    edges: [
      { from: "visitor", to: "name", live: true },
      { from: "name", to: "comment", live: true },
      { from: "comment", to: "api", live: true },
      { from: "api", to: "store", live: true },
    ],
  },
  {
    file: "mentions",
    title: "Tag someone, and they hear about it",
    desc: "A tag counts only for someone who has signed in and can open the page. They see it in the app, and your notifier can tell them wherever your team talks. Anyone else stays plain text, or is skipped and the author is told.",
    H: 610,
    groups: [{ x: 386, y: 80, w: 330, h: 460, label: "WHO GETS IT" }],
    nodes: [
      { id: "author", x: 100, y: 200, icon: "user", label: "AUTHOR", sub: "signed in" },
      { id: "comment", x: 270, y: 200, icon: "at", label: "@JORDAN", sub: "in a comment", state: "on" },
      { id: "known", x: 470, y: 200, icon: "key", label: "KNOWN?", sub: "has signed in" },
      { id: "see", x: 630, y: 200, icon: "eye", label: "CAN SEE?", sub: "the page" },
      { id: "plain", x: 470, y: 420, icon: "at", label: "PLAIN TEXT", sub: "@nobody", state: "off" },
      { id: "skip", x: 630, y: 420, icon: "eye", label: "SKIPPED", sub: "author told", state: "off" },
      { id: "inapp", x: 830, y: 140, icon: "bell", label: "IN THE APP", sub: "toast · @ badge", state: "sel" },
      { id: "notify", x: 830, y: 360, icon: "tray", label: "NOTIFY", sub: "webhook · your own", state: "sel" },
      { id: "jordan", x: 1070, y: 140, icon: "user", label: "JORDAN", sub: "opens ?comment=id" },
      { id: "chat", x: 1070, y: 360, icon: "chat", label: "YOUR TEAM CHAT", sub: "or email" },
    ],
    edges: [
      { from: "author", to: "comment", live: true },
      { from: "comment", to: "known", live: true },
      { from: "known", to: "see", live: true, label: "YES" },
      { from: "see", to: "notify", live: true, mx: 744 },
      { from: "notify", to: "chat", live: true },
      { from: "chat", to: "jordan", live: true },
      { from: "see", to: "inapp", mx: 744 },
      { from: "inapp", to: "jordan" },
      { from: "known", to: "plain", label: "NO", off: true },
      { from: "see", to: "skip", label: "NO", off: true },
    ],
  },
  {
    file: "assistant",
    title: "An assistant that answers in the thread",
    desc: "When a thread starts, or someone mentions the assistant, Dogear calls your answer function after the response. Your model and your docs write the reply; Dogear saves it in the thread, marked as AI.",
    H: 470,
    groups: [{ x: 466, y: 96, w: 210, h: 230, label: "YOUR CODE", accent: true }],
    nodes: [
      { id: "thread", x: 110, y: 210, icon: "bubble", label: "THREAD", sub: "new, or @scout" },
      { id: "dogear", x: 330, y: 210, icon: "code", label: "DOGEAR", sub: "after the reply" },
      { id: "answer", x: 571, y: 210, icon: "robot", label: "answer()", sub: "your model + docs", state: "on" },
      { id: "reply", x: 810, y: 210, icon: "sparkle", label: "REPLY", sub: "marked AI" },
      { id: "store", x: 1040, y: 210, icon: "db", label: "STORE", sub: "in the thread", state: "sel" },
    ],
    edges: [
      { from: "thread", to: "dogear", live: true },
      { from: "dogear", to: "answer", live: true },
      { from: "answer", to: "reply", live: true },
      { from: "reply", to: "store", live: true },
    ],
    texts: [
      { x: 600, y: 400, t: "\"SCOUT IS READING…\" WHILE IT WORKS · AT MOST maxReplies A THREAD", cls: "t-note" },
      { x: 600, y: 428, t: "RETURN NULL TO STAY QUIET", cls: "t-note" },
    ],
  },
  {
    file: "mcp",
    title: "From a comment to a fix, and back",
    desc: "Someone pins a comment on an element. Your coding agent picks it up over MCP with the element's selector and text, makes the change for review, then replies and resolves. The reply shows up in the thread on the page.",
    H: 500,
    groups: [],
    nodes: [
      { id: "person", x: 100, y: 200, icon: "user", label: "REVIEWER" },
      { id: "pin", x: 290, y: 200, icon: "pin", label: "COMMENT", sub: "on the element" },
      { id: "dogear", x: 480, y: 200, icon: "code", label: "DOGEAR", sub: "thread + selector", state: "sel" },
      { id: "coder", x: 680, y: 200, icon: "terminal", label: "CODING AGENT", sub: "dogear_next", state: "on" },
      { id: "pr", x: 880, y: 200, icon: "branch", label: "CHANGE", sub: "for review" },
      { id: "done", x: 1070, y: 200, icon: "check", label: "REPLY + RESOLVE", sub: "dogear_resolve" },
      { id: "seen", x: 1070, y: 400, icon: "bubble", label: "IN THE THREAD", sub: "on the page" },
    ],
    edges: [
      { from: "person", to: "pin", live: true },
      { from: "pin", to: "dogear", live: true },
      { from: "dogear", to: "coder", live: true },
      { from: "coder", to: "pr", live: true },
      { from: "pr", to: "done", live: true },
      { from: "done", to: "seen", live: true },
      { points: [[1026, 400], [100, 400], [100, 244]], live: true, label: "THEY SEE THE REPLY", lx: 560, ly: 390 },
    ],
  },
];

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function side(n, s) {
  const h = (n.s ?? 88) / 2;
  return { right: [n.x + h, n.y], left: [n.x - h, n.y], top: [n.x, n.y - h], bottom: [n.x, n.y + h] }[s];
}

function wirePath(e, byId) {
  if (e.points) return e.points;
  const a = byId[e.from], b = byId[e.to];
  if (Math.abs(a.x - b.x) < 1) {
    const [x1, y1] = side(a, b.y > a.y ? "bottom" : "top");
    const [x2, y2] = side(b, b.y > a.y ? "top" : "bottom");
    return [[x1, y1], [x2, y2]];
  }
  const [x1, y1] = side(a, b.x > a.x ? "right" : "left");
  const [x2, y2] = side(b, b.x > a.x ? "left" : "right");
  if (Math.abs(y1 - y2) < 1) return [[x1, y1], [x2, y2]];
  const mx = e.mx ?? (x1 + x2) / 2;
  return [[x1, y1], [mx, y1], [mx, y2], [x2, y2]];
}

const d = (pts) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
const length = (pts) => pts.slice(1).reduce((sum, [x, y], i) => sum + Math.hypot(x - pts[i][0], y - pts[i][1]), 0);
const pct = (n) => `${(n * 100).toFixed(3)}%`;

const STYLE = `
  :root { --canvas: #ffffff; --dot: #d7d8dd; --frame: #dcdde2; --tile: #f1f1f3; --tile-line: #d2d3d8;
    --ink: #15161a; --label: #5c5e66; --muted: #8a8c94; --wire: #b5b7bf; --accent: #2457e6;
    --on-accent: #ffffff; }
  @media (prefers-color-scheme: dark) {
    :root { --canvas: #111216; --dot: #272930; --frame: #2a2c33; --tile: #191a20; --tile-line: #33353d;
      --ink: #ecedf0; --label: #a3a5ae; --muted: #6f717a; --wire: #4a4c55; --accent: #5a85ff; }
  }
  .bg { fill: var(--canvas); }
  .dot { fill: var(--dot); }
  .frame { fill: none; stroke: var(--frame); }
  .grp { fill: none; stroke: var(--tile-line); }
  .grp.dash { stroke-dasharray: 5 5; }
  .grp.accent { stroke: var(--accent); stroke-opacity: 0.55; }
  .tile { fill: var(--tile); stroke: var(--tile-line); }
  .tile.sel { stroke: var(--accent); stroke-width: 1.5; }
  .tile.on { fill: var(--accent); stroke: var(--accent); }
  .node.off { opacity: 0.5; }
  .node.off .tile { stroke-dasharray: 4 4; }
  .ico { fill: none; stroke: var(--ink); stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
  .node.on .ico { stroke: var(--on-accent); }
  .wire { fill: none; stroke: var(--wire); stroke-width: 1.3; stroke-dasharray: 4 4; }
  .wire.live { stroke: var(--accent); stroke-opacity: 0.45; }
  .wire.off { opacity: 0.55; }
  .pulse { fill: none; stroke: var(--accent); stroke-width: 2.6; stroke-linecap: round; }
  .t { font-family: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    paint-order: stroke; stroke: var(--canvas); stroke-width: 7px; stroke-linejoin: round; }
  .t-lab { font-size: 13px; letter-spacing: 0.08em; fill: var(--label); }
  .t-sub { font-size: 12px; fill: var(--accent); }
  .node.off .t-sub { fill: var(--muted); }
  .t-grp { font-size: 13px; letter-spacing: 0.08em; fill: var(--ink); }
  .t-grp.accent { fill: var(--accent); }
  .t-edge { font-size: 11px; letter-spacing: 0.08em; fill: var(--muted); }
  .t-note { font-size: 12px; letter-spacing: 0.06em; fill: var(--label); }
  .t-title { font-size: 15px; letter-spacing: 0.04em; fill: var(--ink); }
  @media (prefers-reduced-motion: reduce) { .pulse { display: none; } .wire.live { stroke-opacity: 0.8; } }`;

/* One pulse runs the live wires in order, rests, then runs again: each wire's slice of the cycle is
   its own keyframes, so it's all CSS. */
function pulses(live) {
  const SPEED = 0.42; // px per ms
  const DASH = 34;
  const total = live.reduce((sum, w) => sum + w.len, 0);
  const cycle = total / SPEED + 900;
  let at = 0;
  const css = [];
  const paths = [];
  live.forEach((w, i) => {
    const start = at / SPEED / cycle;
    const end = Math.min((at + w.len + DASH) / SPEED / cycle, 1);
    at += w.len;
    css.push(
      `@keyframes p${i} { 0%, ${pct(start)} { stroke-dashoffset: ${DASH}; } ${pct(end)}, 100% { stroke-dashoffset: ${(-w.len).toFixed(1)}; } }`,
      `.p${i} { stroke-dasharray: ${DASH} ${(w.len + DASH * 2).toFixed(1)}; stroke-dashoffset: ${DASH}; animation: p${i} ${Math.round(cycle)}ms linear infinite; }`,
    );
    paths.push(`<path class="pulse p${i}" d="${w.d}"/>`);
  });
  return { css: css.join("\n  "), paths: paths.join("") };
}

function text(x, y, t, cls, anchor = "middle") {
  return `<text x="${x}" y="${y}" class="t ${cls}" text-anchor="${anchor}">${esc(t)}</text>`;
}

function draw(scene) {
  const { H } = scene;
  const byId = Object.fromEntries(scene.nodes.map((n) => [n.id, n]));
  const out = [];

  // The dotted canvas.
  out.push(
    `<defs><pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle class="dot" cx="11" cy="11" r="1.1"/></pattern></defs>`,
    `<rect class="bg" x="0" y="0" width="${W}" height="${H}"/>`,
    `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#dots)"/>`,
  );

  for (const g of scene.groups) {
    out.push(`<rect class="grp${g.dash ? " dash" : ""}${g.accent ? " accent" : ""}" x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}"/>`);
    out.push(text(g.x + 18, g.y + 5, g.label, `t-grp${g.accent ? " accent" : ""}`, "start"));
  }

  const live = [];
  for (const e of scene.edges) {
    const pts = wirePath(e, byId);
    out.push(`<path class="wire${e.live ? " live" : ""}${e.off ? " off" : ""}" d="${d(pts)}"/>`);
    if (e.live) live.push({ d: d(pts), len: length(pts) });
    if (e.label) {
      let lx = e.lx, ly = e.ly;
      if (lx == null) {
        const [p, q] = pts.length > 2 ? [pts[pts.length - 2], pts[pts.length - 1]] : pts;
        lx = (p[0] + q[0]) / 2 + (p[1] === q[1] ? 0 : 12);
        ly = (p[1] + q[1]) / 2 + (p[1] === q[1] ? -8 : 4);
      }
      out.push(text(lx, ly, e.label, "t-edge", e.anchor ?? (pts.length > 2 || pts[0][1] === pts[1][1] ? "middle" : "start")));
    }
  }
  const pulse = pulses(live);
  out.push(pulse.paths);

  for (const n of scene.nodes) {
    const s = n.s ?? 88;
    const k = s >= 80 ? 1.45 : 1.05;
    const tile = n.state === "on" ? " on" : n.state === "sel" ? " sel" : "";
    out.push(
      `<g class="node${n.state ? ` ${n.state}` : ""}">`,
      `<rect class="tile${tile}" x="${n.x - s / 2}" y="${n.y - s / 2}" width="${s}" height="${s}" rx="2"/>`,
      `<g transform="translate(${n.x - 12 * k} ${n.y - 12 * k}) scale(${k})"><path class="ico" vector-effect="non-scaling-stroke" d="${ICONS[n.icon]}"/></g>`,
      text(n.x, n.y + s / 2 + 24, n.label, "t-lab"),
      n.sub ? text(n.x, n.y + s / 2 + 42, n.sub, "t-sub") : "",
      `</g>`,
    );
  }
  for (const t of scene.texts ?? []) out.push(text(t.x, t.y, t.t, t.cls));
  out.push(`<rect class="frame" x="0.5" y="0.5" width="${W - 1}" height="${H - 1}"/>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="title desc">
<title id="title">${esc(scene.title)}</title>
<desc id="desc">${esc(scene.desc)}</desc>
<style>${STYLE}
  ${pulse.css}
</style>
${out.join("\n")}
</svg>
`;
}

for (const scene of SCENES) {
  writeFileSync(join(OUT, `${scene.file}.svg`), draw(scene));
  console.log(`media/${scene.file}.svg`);
}
