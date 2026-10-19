/**
 * The shape shared by the layer and every adapter. No DOM and no server code, so a backend can
 * import it too: `validateNew` is the check to run on anything a browser sends you.
 */

/**
 * Where a comment sits. Relative to an element rather than to the page, so a pin stays on its
 * element when the page scrolls, including apps that scroll an inner element instead of the
 * window. `fx..fh` are fractions of the anchored element's box (a pin has `fw = fh = 0`);
 * `vx..vh` are fractions of the viewport at the time, the fallback when the selector no longer
 * finds anything.
 */
export type Anchor = {
  selector: string;
  fx: number;
  fy: number;
  fw: number;
  fh: number;
  vx: number;
  vy: number;
  vw: number;
  vh: number;
  /**
   * The start of the anchored element's text when the comment was made. Threads load by path, so
   * a structural selector made on one view (`?tab=a`) can resolve to a different element on
   * another (`?tab=b`); this is how the layer tells.
   */
  text?: string;
  /** What a person would call the element (`button "Save"`), for anything that lists threads. */
  label?: string;
};

/**
 * Whoever is signed in, as your backend knows them. `id` is what "mine" is decided by. `admin`
 * shows Delete on everyone's comments; your backend must agree (`docs/contract.md`, rule 5).
 * `agent` marks a coding agent (through `dogear mcp`), whose comments carry an "Agent" badge.
 */
export type User = {
  id: string;
  name: string;
  avatar?: string;
  /**
   * Without a photo: which of the page's avatars (the `avatars` prop) this person picked when
   * they gave their name, by key. One the page doesn't have falls back to one chosen by `id`.
   */
  tint?: string;
  admin?: boolean;
  agent?: boolean;
  /**
   * Where a server reaches this person: set by your sign-in (`createDogear`'s `auth`), used for
   * mentions and alerts. Never stored on comments, so never shown to visitors.
   */
  email?: string;
  /** How others @mention them: `tara.mehta`. Default: the part of `email` before the @. */
  handle?: string;
};

/**
 * Someone who can be @mentioned: a person who has signed in (with `auth`), as the `@` list shows
 * them. Guests aren't people you can reach, so they're never here.
 */
export type Person = {
  id: string;
  name: string;
  handle: string;
  avatar?: string;
  /** An assistant that answers threads (`createDogear`'s `assistant`), not a person. */
  agent?: true;
  /** What it answers: every new thread and any comment that @mentions it, or only the latter. */
  answers?: "threads" | "mentions";
};

/**
 * What was on screen when a thread was started, for whoever opens it later: a form's answers, say
 * (`useDogearSnapshot`). `key` names what it belongs to (`checkout-form:acme`), so it only ever
 * lands back where it came from; `data` is any JSON, up to `MAX_STATE` characters of it.
 */
export type Snapshot = { key: string; data: unknown };

/** One person a comment @mentions, as it was saved: who the `@handle` in its text is. */
export type Mention = { id: string; name: string; handle: string };

export type Comment = {
  id: string;
  /** The URL the thread was made on, path and query: `/settings?tab=security`. */
  page: string;
  /** null on a thread's first comment; the root's id on a reply. */
  parentId: string | null;
  body: string;
  author: User;
  /** Set on roots only: a reply lives where its thread does. */
  anchor: Anchor | null;
  /** Epoch milliseconds. */
  createdAt: number;
  /** When the author last changed `body`, or null if they never have. */
  editedAt: number | null;
  resolved: boolean;
  /**
   * Who reacted with what: each emoji to the ids of the people who picked it (author ids are
   * public on comments already). Absent or empty: no reactions. Toggled with `toggleReaction`.
   */
  reactions?: Record<string, string[]>;
  /**
   * The people its `@handle`s name, who could open the page when it was written. A handle that
   * isn't here (nobody by that name, or someone who can't see the page) stays plain text.
   */
  mentions?: Mention[];
  /**
   * On a thread's first comment: what was on screen when it was written (a `Snapshot`), put back
   * when the thread is opened. Lists of every page leave it out, for weight.
   */
  state?: Snapshot;
};

/** What the layer asks an adapter to create. The adapter adds id, author and times. */
export type NewComment = Pick<Comment, "page" | "body" | "parentId" | "anchor" | "state">;

export const MAX_BODY = 2000;
/** A snapshot's `data`, as JSON: a form's whole state is a few KB, so this is the ceiling. */
export const MAX_STATE = 64_000;

/** A snapshot as stored, or undefined when there's none, or null when it isn't one. */
function cleanState(state: unknown): Snapshot | undefined | null {
  if (state === undefined || state === null) return undefined;
  if (typeof state !== "object" || Array.isArray(state)) return null;
  const { key, data } = state as Record<string, unknown>;
  if (typeof key !== "string" || key.length === 0 || key.length > 100) return null;
  let json: string | undefined;
  try {
    json = JSON.stringify(data ?? null);
  } catch {
    return null;
  }
  // Postgres refuses NUL in jsonb: a 400 here rather than a 503 there.
  if (json === undefined || json.length > MAX_STATE || json.includes("\\u0000")) return null;
  return { key, data: JSON.parse(json) };
}

/** A copy of a comment without its snapshot: for lists of many pages, which never need it. */
export function withoutState(comment: Comment): Comment {
  if (!("state" in comment)) return comment;
  const { state: _, ...rest } = comment;
  return rest;
}
const ANCHOR_KEYS = ["fx", "fy", "fw", "fh", "vx", "vy", "vw", "vh"] as const;

export function firstName(author: User) {
  return author.name.split(" ")[0] || author.name;
}

export function initials(name: string) {
  const parts = name.split(" ").filter(Boolean);
  // One word is one letter: first-and-last of "Asha" would be "AA", which reads as someone else.
  const letters =
    parts.length > 1 ? parts[0][0] + parts.at(-1)![0] : (parts[0]?.[0] ?? "");
  return letters.toUpperCase() || "?";
}

/** A comment's text as stored: trimmed, and 1–2000 characters, or null. New and edited alike. */
export function cleanBody(body: unknown): string | null {
  if (typeof body !== "string") return null;
  const text = body.trim();
  return text.length === 0 || text.length > MAX_BODY ? null : text;
}

export function isPage(page: unknown): page is string {
  return typeof page === "string" && page.startsWith("/") && page.length <= 300;
}

/** The path of a page URL: threads load by path, whatever the query string. */
export const pathOf = (page: string) => page.split("?")[0];

/**
 * The trust boundary: the one place untrusted input becomes a `NewComment`, or doesn't. Run it
 * on the server (or in your database rules) before storing anything.
 */
export function validateNew(input: unknown): NewComment | null {
  if (typeof input !== "object" || input === null) return null;
  const { page, body, parentId, anchor, state: given } = input as Record<string, unknown>;
  if (!isPage(page)) return null;
  const state = cleanState(given);
  if (state === null) return null;
  const text = cleanBody(body);
  if (text === null) return null;
  if (
    parentId !== null &&
    (typeof parentId !== "string" || parentId.length === 0 || parentId.length > 100)
  )
    return null;

  // A root needs somewhere to sit; a reply must not claim one.
  if (parentId === null) {
    if (typeof anchor !== "object" || anchor === null) return null;
    const a = anchor as Record<string, unknown>;
    if (typeof a.selector !== "string" || a.selector.length > 1000) return null;
    if (
      !ANCHOR_KEYS.every(
        (key) => typeof a[key] === "number" && Number.isFinite(a[key]),
      )
    ) {
      return null;
    }
    for (const key of ["text", "label"] as const) {
      if (
        a[key] !== undefined &&
        (typeof a[key] !== "string" || (a[key] as string).length > 200)
      ) {
        return null;
      }
    }
    const clean = { selector: a.selector } as Anchor;
    for (const key of ANCHOR_KEYS) clean[key] = a[key] as number;
    if (typeof a.text === "string") clean.text = a.text;
    if (typeof a.label === "string") clean.label = a.label;
    return { page, body: text, parentId: null, anchor: clean, ...(state ? { state } : {}) };
  }
  // A reply belongs to its thread's screen; it brings none of its own.
  if (state) return null;
  return { page, body: text, parentId, anchor: null };
}

/**
 * What an adapter's `list` answered, as the layer can safely draw it: an array (or a throw, which
 * fails the look), less any comment missing what rendering it needs. Whatever a backend sends, a
 * bad row is dropped rather than taking the layer down.
 */
export function cleanList(input: unknown): Comment[] {
  if (!Array.isArray(input)) throw new Error("dogear: list did not answer an array");
  return input.filter((c): c is Comment => {
    if (typeof c !== "object" || c === null) return false;
    const { id, page, parentId, body, author, anchor, createdAt } = c as Record<string, unknown>;
    const who = author as Record<string, unknown> | null;
    return (
      typeof id === "string" &&
      isPage(page) &&
      (parentId === null || typeof parentId === "string") &&
      typeof body === "string" &&
      typeof who === "object" &&
      who !== null &&
      typeof who.id === "string" &&
      typeof who.name === "string" &&
      typeof createdAt === "number" &&
      // A root without a usable anchor has nowhere to sit.
      (parentId !== null ||
        (typeof anchor === "object" &&
          anchor !== null &&
          typeof (anchor as Anchor).selector === "string" &&
          ANCHOR_KEYS.every((key) => typeof (anchor as Anchor)[key] === "number")))
    );
  });
}

/** A new comment, fully formed: for adapters that mint ids and times on the client. */
export function newComment(input: NewComment, author: User): Comment {
  return {
    ...input,
    id: crypto.randomUUID(),
    author,
    createdAt: Date.now(),
    editedAt: null,
    resolved: false,
  };
}

export const MAX_NAME = 40;

/** How many different emoji one comment can carry, so a row of chips stays a row. */
export const MAX_REACTIONS = 20;

/** Emoji the layer won't offer and backends won't store, being rude wherever they're used. */
const UNKIND = new Set(["🖕", "🍆", "🍑", "💦"]);

/** One emoji, by the Unicode list of them where the runtime has it (flags, keycaps, families). */
const RGI = (() => {
  try {
    return new RegExp("^\\p{RGI_Emoji}$", "v");
  } catch {
    return null;
  }
})();
const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter() : null;

/**
 * A reaction as a backend should store it: exactly one emoji (a skin tone, a family or a flag
 * counts as one), and not one of the few rude ones, or null.
 */
export function cleanReaction(emoji: unknown): string | null {
  if (typeof emoji !== "string") return null;
  const text = emoji.trim();
  if (text.length === 0 || text.length > 16) return null;
  if (segmenter && [...segmenter.segment(text)].length !== 1) return null;
  const pictographic = /\p{Extended_Pictographic}/u.test(text) && !/[\p{L}\p{N}]/u.test(text);
  if (!pictographic && !RGI?.test(text)) return null;
  // The bare emoji, without its skin tone or presentation selector.
  return UNKIND.has(text.replace(/[\u{1F3FB}-\u{1F3FF}\u{FE0F}]/gu, "")) ? null : text;
}

/** Whether this emoji can go on: it's there already, or there's room for one more kind. */
export function roomForReaction(reactions: Comment["reactions"], emoji: string): boolean {
  const kinds = Object.entries(reactions ?? {}).filter(([, ids]) => Array.isArray(ids) && ids.length > 0);
  return kinds.some(([key]) => key === emoji) || kinds.length < MAX_REACTIONS;
}

/**
 * The comment's reactions with this person's one toggled: added if they hadn't picked it, taken
 * back if they had. An emoji nobody has left disappears. Every backend toggles through this.
 */
export function toggleReaction(
  reactions: Comment["reactions"],
  emoji: string,
  userId: string,
): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  for (const [key, ids] of Object.entries(reactions ?? {})) {
    if (Array.isArray(ids)) next[key] = ids.filter((id) => typeof id === "string");
  }
  const ids = next[emoji] ?? [];
  next[emoji] = ids.includes(userId) ? ids.filter((id) => id !== userId) : [...ids, userId];
  if (next[emoji].length === 0) delete next[emoji];
  return next;
}

/** A comment's reactions as the layer draws them, in the order they were first left. */
export function reactionsOf(comment: Comment, me: string | null) {
  return Object.entries(comment.reactions ?? {})
    .filter(([, ids]) => Array.isArray(ids) && ids.length > 0)
    .map(([emoji, ids]) => ({ emoji, count: ids.length, mine: me !== null && ids.includes(me) }));
}

/** An avatar key as a backend should store it: 1–24 of a–z, 0–9 and "-", or null. */
export function cleanTint(tint: unknown): string | null {
  return typeof tint === "string" && /^[a-z0-9-]{1,24}$/.test(tint) ? tint : null;
}

/** A guest's name as stored: trimmed, spaces collapsed, 1–40 characters, or null. */
export function cleanName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const text = name.replace(/\s+/g, " ").trim();
  return text.length === 0 || text.length > MAX_NAME ? null : text;
}

/**
 * A handle as typed after @: letters, digits, dots, dashes and underscores, not ending in a dot
 * (so a sentence can end on one). After the start, a space or punctuation, so an email address
 * isn't a mention.
 */
const MENTION = /(^|[^\w@.])@([a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)/gi;

/** The handles a text @mentions, lowercased, each once, in order. */
export function mentionedHandles(body: string): string[] {
  return [...new Set([...body.matchAll(MENTION)].map((m) => m[2].toLowerCase()))];
}

/** How someone is @mentioned: their `handle`, else their email before the @, else their name. */
export function handleOf(user: Pick<User, "name" | "email" | "handle">): string {
  const from = user.handle ?? user.email?.split("@")[0] ?? user.name;
  return (
    from
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9._-]+/g, ".")
      .replace(/^[._-]+|[._-]+$/g, "") || "someone"
  );
}

/**
 * A comment's text in pieces, for drawing: plain runs, and each `@handle` that `mentions` names
 * as that person. Other handles stay in the text as typed.
 */
export function mentionParts(body: string, mentions: Mention[] = []): (string | Mention)[] {
  if (mentions.length === 0) return [body];
  const byHandle = new Map(mentions.map((m) => [m.handle.toLowerCase(), m]));
  const parts: (string | Mention)[] = [];
  let at = 0;
  for (const match of body.matchAll(MENTION)) {
    const person = byHandle.get(match[2].toLowerCase());
    if (!person) continue;
    const start = match.index! + match[1].length;
    if (start > at) parts.push(body.slice(at, start));
    parts.push(person);
    at = start + 1 + match[2].length;
  }
  if (at < body.length) parts.push(body.slice(at));
  return parts;
}

/** A thread as a list shows it: its first comment, how many replies, and when it last moved. */
export type ThreadSummary = { root: Comment; replies: number; lastActivity: number };

/**
 * The threads in `comments`, newest activity first: those on `path`, then the rest grouped by
 * path, the most recently active group first. Resolved threads only with `resolved: true`.
 */
export function groupThreads(
  comments: Comment[],
  path: string,
  { resolved = false }: { resolved?: boolean } = {},
) {
  const threads = new Map<string, ThreadSummary>();
  for (const c of comments) {
    if (c.parentId === null && c.anchor && (resolved || !c.resolved)) {
      threads.set(c.id, { root: c, replies: 0, lastActivity: c.createdAt });
    }
  }
  for (const c of comments) {
    const thread = c.parentId === null ? undefined : threads.get(c.parentId);
    if (!thread) continue;
    thread.replies += 1;
    thread.lastActivity = Math.max(thread.lastActivity, c.createdAt);
  }
  const here: ThreadSummary[] = [];
  const elsewhere = new Map<string, ThreadSummary[]>();
  for (const thread of [...threads.values()].sort((a, b) => b.lastActivity - a.lastActivity)) {
    const at = pathOf(thread.root.page);
    if (at === path) here.push(thread);
    else elsewhere.set(at, [...(elsewhere.get(at) ?? []), thread]);
  }
  return {
    here,
    elsewhere: [...elsewhere].map(([path, threads]) => ({ path, threads })),
  };
}
