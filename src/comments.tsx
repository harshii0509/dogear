import {
  Component,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  defaultEmojiDataResolver,
  EmojiPicker as Frimousse,
  type EmojiDataResolver,
  type EmojiPickerListComponents,
} from "frimousse";

import { localAdapter, type Adapter } from "./adapter";
import { animate, EASE_OUT, finePointer, POP, PRESS_IN, reduced, RELEASE, ROLL, stagger, to } from "./motion";
import {
  LAYER_ATTR,
  anchorAt,
  elementFor,
  isIgnoredAt,
  resolveAnchor,
  targetAt,
  type Box,
} from "./anchor";
import {
  cleanList,
  cleanName,
  cleanReaction,
  firstName,
  groupThreads,
  newestFirst,
  initials,
  mentionedHandles,
  mentionParts,
  pathOf,
  MAX_REACTIONS,
  reactionsOf,
  roomForReaction,
  toggleReaction,
  type Anchor,
  type Comment,
  type Mention,
  type NewComment,
  type Person,
  type Snapshot,
  type ThreadSummary,
  type User,
} from "./model";
import { toMarkdown } from "./markdown";
import { captureSnapshot, restoreSnapshot } from "./snapshot";
import { STYLES } from "./styles";

/**
 * Figma-style comments on whatever page is open: press the button, then click to drop a pin or
 * drag to mark an area, and write. Where comments are stored, and who you are, is the adapter's
 * business (`adapter.ts`).
 *
 * Renders into a shadow root on `document.body`, so it works anywhere in your tree and your CSS
 * cannot touch it. Nothing shows until `adapter.me()` answers with a user and the first `list`
 * succeeds, so a signed-out visitor sees no button.
 *
 * Markers only show in comment mode, as in Figma: the page underneath is still the thing being
 * looked at the rest of the time.
 */
export type CommentsProps = {
  /** Defaults to `localAdapter()`: this browser only. Read on mount; remount to change it. */
  adapter?: Adapter;
  /** false renders nothing, e.g. outside review builds. */
  enabled?: boolean;
  /** A key that toggles comment mode when you are not typing, e.g. "c". Off by default. */
  shortcut?: string;
  /**
   * A CSS selector for what comments should leave alone, e.g. "nav, .chat-widget". Pressing on a
   * match does nothing, and an area over one anchors to whatever is underneath.
   */
  ignore?: string;
  /**
   * "always" (the default) shows the layer to every signed-in visitor. "param" shows it only once
   * the URL has had `?review` (see `reviewParam`) in this tab, so plain visitors see a clean page;
   * `?review=off` ends it.
   */
  activation?: "always" | "param";
  /** The query parameter that turns review on under `activation="param"`. Defaults to "review". */
  reviewParam?: string;
  /**
   * "fab" (the default): one button that turns comment mode on and off. "tray": a pill, "Leave a
   * comment", that opens into a list of the threads, on this page and on others, and closes back
   * into itself. Pins show while it is open and the page stays usable; the shortcut, or the pill
   * again, places a new one. "dock": a round button the visitor can drag to any corner, which opens
   * into a row of controls (add, show or hide pins, the list with every page's open count) and the
   * list into a panel; Esc steps back. The page stays usable throughout.
   */
  layout?: "fab" | "tray" | "dock";
  /** How a tray row on another page gets there. Defaults to a full page load; pass your router's push. */
  navigate?: (href: string) => void;
  /**
   * The query parameter of a link to a thread, e.g. "comment" for `?comment=<id>`, to match links
   * your backend sends (the server's `linkParam`). A reply's id opens its thread. `?dogear=` (and
   * `?inkd=`, from before the rename) open threads too. Default: "dogear".
   */
  linkParam?: string;
  /** A friendly name for a page in the list of threads elsewhere, e.g. "/settings" → "Settings". Default: the path. */
  pageLabel?: (path: string) => string;
  /**
   * Who may delete a comment, to match your server's `deletable`, e.g. anyone may delete the
   * assistant's. Default: its author, or an admin.
   */
  deletable?: (me: User, comment: Comment) => boolean;
  /**
   * Called when comment mode turns on or off: the visitor opens or closes it (in the tray, the
   * pill), or a link to a thread opens it. For analytics, say. Not called when the mode comes back
   * on by itself after a reload.
   */
  onActiveChange?: (active: boolean) => void;
  /**
   * Who sees Resolve: "anyone" (the default, contract rule 4) or "authors", the thread's author and
   * admins, for public pages. Your backend must agree.
   */
  resolvers?: "anyone" | "authors";
  /**
   * false: no resolving at all, for a site that just wants a list of comments. Resolve, Reopen
   * and the Resolved switch are gone, and every thread shows, including any resolved before.
   */
  resolve?: boolean;
  /**
   * Your own icons, by name, to match your site's set: any element, an `<svg>` or an icon
   * component (`{ close: <IconCrossSmall /> }`). Each is drawn at 16px and takes `currentColor`.
   * Names: comment, send, close, plus, more, resolve, reopen, field.
   */
  icons?: Partial<Record<IconName, ReactNode>>;
  /**
   * Avatars for people without a photo, by key: any CSS background, e.g.
   * `{ sky: "linear-gradient(0deg, #DFEAF0, #BBC5DD)" }`. A guest picks one with their name (sent
   * to `join`, kept as `User.tint`); anyone else gets one chosen by their id, always the same.
   */
  avatars?: Record<string, string>;
  /**
   * false: no word of where a comment was left (its page, "on heading …") in the list or on an
   * open comment, for a site that wants a plain list. The pins still show where.
   */
  locations?: boolean;
  /**
   * With guests (`adapter.join`) and the tray: a visitor who hasn't given a name is asked for it,
   * and an avatar, as soon as they open the comments, and sees the threads and pins after. Without
   * it, they read first and are asked when they write.
   */
  joinFirst?: boolean;
  /**
   * How a comment is placed. "element" (the default) outlines and names the element under the
   * pointer, and a drag marks an area: for reviewing a product. "pin": the pin you'd drop, with
   * your avatar, follows the pointer and a click drops it, with nothing on the page outlined or
   * named and no areas: for a site whose visitors comment rather than inspect.
   */
  pick?: "element" | "pin";
  /**
   * The emoji people can react with, e.g. `["❤️", "👍", "😂"]`. Off without it, or with an adapter
   * that has no `react`.
   */
  reactions?: string[];
  /**
   * Where reactions show: "everywhere" (the default), under each comment in the tray's list and in
   * an open thread; "thread", only in an open thread.
   */
  reactionsIn?: "everywhere" | "thread";
  /**
   * Where the full emoji picker (the set's "···") loads its emoji from: a copy of Emojibase's data,
   * read as `${emojiData}/en/data.json`. Defaults to jsDelivr's; set it to self-host.
   */
  emojiData?: string;
};

/**
 * A 422 is the route refusing the text itself (a moderation check, say): what it said, for the
 * writer to act on, or a plain ask to reword. Null for any other failure.
 */
function refusal(error: unknown) {
  const { status, reason } = error as { status?: number; reason?: unknown };
  if (status !== 422) return null;
  return typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 200) : "Try rewording it.";
}

/** The composer and thread width. */
const CARD_WIDTH = 296;
/** Below this, a press is a click (a pin); past it, a drag (an area). */
const DRAG_PX = 4;
/** How far a finger may wander and still be a tap rather than a scroll. */
const TAP_SLOP = 10;
/**
 * How often comment mode asks for news, only while the tab is visible, and only when the adapter
 * has no `subscribe`. ponytail: polling, which suits a handful of reviewers; pass `subscribe` for push.
 */
const POLL_MS = 3_000;
/**
 * Looks that fail in a row before the layer hides: one is a blip, two is the backend being down.
 * Hidden, it looks again after 30s, then 1 and 2 minutes, and whenever the tab comes back.
 */
const HIDE_AFTER = 2;
const RETRY_MS = 30_000;
const RETRY_MAX_MS = 120_000;
const MODE_KEY = "dogear:active";
const REVIEW_KEY = "dogear:review";
/** `?dogear=<thread id>` opens that thread: the links `dogear mcp` hands out. */
const LINK_PARAM = "dogear";
/** Links made before the rename to Dogear: `?inkd=<thread id>`. */
const OLD_LINK_PARAM = "inkd";
const PIN = 32;
const PREVIEW_WIDTH = 240;
/** A phone: the tray is a sheet along the bottom, and so are the cards. */
const NARROW = "(max-width: 480px)";
const narrow = () => typeof window !== "undefined" && window.matchMedia(NARROW).matches;
/** A finger for a pointer, which taps rather than clicks and has no Esc to press. */
const coarse = () =>
  typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
/* On a phone a card is a sheet above the dock's pill (8 + 40 + 8), or just above the keyboard
   while one is up (--_kb, from useKeyboardInset). */
const SHEET = {
  left: "calc(8px + env(safe-area-inset-left, 0px))",
  right: "calc(8px + env(safe-area-inset-right, 0px))",
  bottom: "max(calc(56px + env(safe-area-inset-bottom, 0px)), calc(var(--_kb, 0px) + 8px))",
  width: "auto",
  origin: "bottom center",
} as const;

/**
 * How far the on-screen keyboard (or a pinch zoom) has pushed the visible bottom of the page up.
 * iOS leaves the layout viewport, where fixed things live, full height under the keyboard, so a
 * sheet pinned to its bottom would sit behind the keys.
 */
function useKeyboardInset(on: boolean) {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!on || !vv) {
      setInset(0);
      return;
    }
    const read = () =>
      setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    read();
    vv.addEventListener("resize", read);
    vv.addEventListener("scroll", read);
    return () => {
      vv.removeEventListener("resize", read);
      vv.removeEventListener("scroll", read);
    };
  }, [on]);
  return inset;
}
const GAP = 16;
const FIELD_MAX_ROWS = 6;
/** A field's line: 14px text at 20, as a command palette's input. */
const FIELD_LINE = 20;
/** The tray layout's dock: its footer is the closed pill, 40px tall, 14px in on either side. */
const DOCK_FOOT = 40;
const DOCK_PAD = 14;
/** How far the name step's Continue button sits in from the panel's sides and bottom. */
const DOCK_INSET = 12;
/** How long the name step stays as it fades out over the list, in ms. */
const DOCK_FADE_MS = 200;
const DOCK_WIDTH = 320;
/** How often to ask where you were @mentioned, while the tab is visible. */
const MENTIONS_MS = 15_000;
/** Mentions you've seen, in this browser (the most recent 500). */
const SEEN_MENTIONS_KEY = "dogear:mentions-seen";

/** A comment's text as it reads, @handles as names, cut to `max` characters. */
function plainText(comment: Comment, max: number) {
  const text = mentionParts(comment.body, comment.mentions)
    .map((part) => (typeof part === "string" ? part : `@${part.name}`))
    .join("");
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function readSeenMentions(): Set<string> {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(SEEN_MENTIONS_KEY) ?? "[]");
    return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}
function writeSeenMentions(seen: Set<string>) {
  try {
    localStorage.setItem(SEEN_MENTIONS_KEY, JSON.stringify([...seen].slice(-500)));
  } catch {
    // Per-browser convenience only: unread comes back after a reload.
  }
}
/**
 * The list unmounts when the closing box's transition ends; this is the fallback for when there is
 * none to end (reduced motion, or a box already the right size). By then it is clipped out of view.
 */
const DOCK_UNMOUNT_MS = 1000;
/** A posted comment's composer folds into its pin over this long, then unmounts. */
const SENT_MS = 160;

/** The anchor is taken on release, so scrolling while you write can't move it to another element. */
/** `sent`: posted, and folding into its pin for a moment before it goes. */
/** A comment being written; `body` when it was turned away and opens again with its text. */
type Draft = { box: Box; anchor: Anchor; sent?: boolean; body?: string };
type Restore = { parentId: string; body: string; nonce: number };
type PendingState = {
  /** What to key a comment's element by: a saved one keeps the key it had while pending. */
  keyOf: (id: string) => string;
  /** Shown, but not saved yet. */
  pending: (id: string) => boolean;
  /** Turned away, and fading out. */
  gone: (id: string) => boolean;
};
/** How long a turned-away comment takes to leave: fade, then fold its row away. */
const GONE_MS = 380;
const GONE_REDUCED_MS = 120;
let pendingSeq = 0;
/** How long a name check runs before the avatar starts saying hi. */
const CHECK_DELAY_MS = 150;

/**
 * The name was taken: the avatar gives one happy hop, and then the comments come in. Timed by the
 * clock, not the animation, so a slow device never holds anyone at the door.
 */
async function hello(avatar: HTMLElement | null) {
  if (!avatar || reduced()) return;
  const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
  to(avatar, { scale: "1.08" }, { duration: 0.12, ease: EASE_OUT });
  await wait(120);
  to(avatar, { scale: "1" }, POP);
  await wait(140);
}

/** The name was turned away: a small no. */
function shake(avatar: HTMLElement | null) {
  if (!avatar || reduced()) return;
  animate(
    avatar,
    { translate: ["0px 0px", "-6px 0px", "6px 0px", "-4px 0px", "4px 0px", "0px 0px"] },
    { duration: 0.36, ease: [0.645, 0.045, 0.355, 1] },
  );
}
type Toast = {
  id: number;
  title: string;
  description?: string;
  tone?: "error";
  action?: { label: string; onClick: () => void };
};

const since = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
function ago(time: number) {
  const seconds = Math.round((time - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size)
      return since.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

/**
 * The current URL, path and query. ponytail: a 300ms check plus `popstate` rather than patching
 * `history`, which routers (Next, React Router) patch themselves and in varying order. The
 * ceiling is a pin set lagging a route change by up to 300ms.
 */
function useHref() {
  const read = () => location.pathname + location.search;
  // Server rendering (a "use client" component still renders once on the server) has no location.
  const [href, setHref] = useState(() => (typeof location === "undefined" ? "/" : read()));
  useEffect(() => {
    const check = () => setHref(read());
    const timer = window.setInterval(check, 300);
    window.addEventListener("popstate", check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("popstate", check);
    };
  }, []);
  return href;
}

/** A shadow root of our own, on `document.body`, for the life of the component. */
function useShadowRoot() {
  const [root, setRoot] = useState<ShadowRoot | null>(null);
  useEffect(() => {
    const host = document.createElement("div");
    host.setAttribute(LAYER_ATTR, "");
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLES;
    shadow.append(style);
    document.body.append(host);
    setRoot(shadow);
    return () => host.remove();
  }, []);
  return root;
}

/** `search` without `param`. URLSearchParams re-encodes the rest, so only touch it when needed. */
function withoutParam(search: string, param: string) {
  const params = new URLSearchParams(search);
  if (!params.has(param)) return search;
  params.delete(param);
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}

/**
 * Whether this tab is reviewing: `?review` turns it on and the tab remembers it across pages,
 * `?review=off` (or `=0`) turns it off. `sessionStorage` may throw; then only the URL counts.
 */
function readReview(search: string, param: string) {
  const value = new URLSearchParams(search).get(param);
  const off = value === "off" || value === "0";
  try {
    if (off) sessionStorage.removeItem(REVIEW_KEY);
    else if (value !== null) sessionStorage.setItem(REVIEW_KEY, "1");
    return !off && (value !== null || sessionStorage.getItem(REVIEW_KEY) === "1");
  } catch {
    return value !== null && !off;
  }
}

/**
 * Comments are never worth the page: anything that throws while rendering the layer removes the
 * layer, says so once in the console, and leaves the host app as it was.
 */
class Contained extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("dogear: the comments layer hit an error and was removed.", error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function Comments(props: CommentsProps) {
  return (
    <Contained>
      <Layered {...props} />
    </Contained>
  );
}

function Layered({
  enabled = true,
  activation = "always",
  reviewParam = "review",
  linkParam = LINK_PARAM,
  ...props
}: CommentsProps) {
  const root = useShadowRoot();
  const href = useHref();
  const byParam = activation === "param";
  const search = href.slice(pathOf(href).length);
  const [reviewing, setReviewing] = useState(() => !byParam || readReview(search, reviewParam));
  useEffect(() => {
    setReviewing(!byParam || readReview(search, reviewParam));
  }, [byParam, search, reviewParam]);
  if (!enabled || !root || !reviewing) return null;
  // Neither the review switch nor a thread link is part of where a comment lives.
  const linkParams = [linkParam, LINK_PARAM, OLD_LINK_PARAM];
  const kept = linkParams.reduce(
    (rest, param) => withoutParam(rest, param),
    byParam ? withoutParam(search, reviewParam) : search,
  );
  const params = new URLSearchParams(search);
  const linked = linkParams.map((param) => params.get(param)).find(Boolean) ?? null;
  const { icons = {}, avatars = NO_AVATARS, locations = true, pageLabel = samePath, deletable, ...rest } = props;
  return createPortal(
    <IconsContext.Provider value={icons}>
      <AvatarsContext.Provider value={avatars}>
        <LocationsContext.Provider value={locations}>
          <PageLabelContext.Provider value={pageLabel}>
            <DeletableContext.Provider value={deletable ?? ownOrAdmin}>
              <Layer {...rest} page={pathOf(href) + kept} linked={linked} linkParam={linkParam} host={root.host} />
            </DeletableContext.Provider>
          </PageLabelContext.Provider>
        </LocationsContext.Provider>
      </AvatarsContext.Provider>
    </IconsContext.Provider>,
    root,
  );
}

function Layer({
  adapter: given,
  shortcut,
  ignore,
  layout = "fab",
  navigate = (href) => location.assign(href),
  onActiveChange,
  resolvers = "anyone",
  resolve = true,
  joinFirst = false,
  pick = "element",
  reactions,
  reactionsIn = "everywhere",
  emojiData = EMOJI_DATA,
  page,
  linked,
  linkParam,
  host,
}: Pick<
  CommentsProps,
  "adapter" | "shortcut" | "ignore" | "layout" | "navigate" | "onActiveChange" | "resolvers" | "resolve" | "joinFirst" | "pick" | "reactions" | "reactionsIn" | "emojiData"
> & {
  /** The current URL, path and query, as comments are keyed. */
  page: string;
  /** A comment id from `?dogear=` (or the `linkParam`), to open its thread once comments have loaded. */
  linked: string | null;
  /** The parameter links to threads use. */
  linkParam: string;
  /** The shadow root's host on the page, which says when comment mode is on. */
  host: Element;
}) {
  // Read once: an adapter written inline would otherwise be a new object, and a refetch, per render.
  const [adapter] = useState(() => given ?? localAdapter());
  const pathname = pathOf(page);
  /** The dock layout: a tray of its own, in three shapes, anywhere on the screen. */
  const docked = layout === "dock";
  /** A layout with a list, where the page stays usable while pins show and placing is its own step. */
  const tray = layout === "tray" || docked;

  const [available, setAvailable] = useState(false);
  const [me, setMe] = useState<User | null>(null);
  /** Who you can @mention: none for a guest, or when the backend has no `people`. */
  const [people, setPeople] = useState<Person[]>([]);
  useEffect(() => {
    if (!me || me.agent || !adapter.people) return setPeople([]);
    let live = true;
    adapter.people().then(
      (list) => live && setPeople(Array.isArray(list) ? list : []),
      () => live && setPeople([]),
    );
    return () => {
      live = false;
    };
  }, [me?.id]);
  /** Who a text @mentions among them, as the backend will most likely save it: for a pending comment. */
  const mentionsFor = (body: string): Mention[] => {
    const byHandle = new Map(people.map((p) => [p.handle.toLowerCase(), p]));
    return mentionedHandles(body).flatMap((handle) => {
      const p = byHandle.get(handle);
      return p ? [{ id: p.id, name: p.name, handle: p.handle }] : [];
    });
  };
  /** What the backend last listed (and what you've changed since). */
  const [listed, setComments] = useState<Comment[]>([]);
  /**
   * Yours, shown the moment you post while the backend takes them (a moderation check can take a
   * few seconds): drawn like any other, without actions until they're saved, and taken away
   * gently if they're refused.
   */
  const [pending, setPending] = useState<Comment[]>([]);
  /** Pending ones on their way out: refused, or the request failed. */
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  /** A saved comment's id → the pending id it was drawn under, so it keeps its place on screen. */
  const aliases = useRef(new Map<string, string>());
  /* Every look lists from the backend, which doesn't know about pending ones yet: they're drawn
     on top. Once a look already has one (saved, its answer still on the way), that one wins. */
  const comments = useMemo(() => {
    if (pending.length === 0) return listed;
    const waiting = pending.filter(
      (p) =>
        !listed.some(
          (c) =>
            c.author.id === p.author.id &&
            c.parentId === p.parentId &&
            c.body === p.body &&
            c.createdAt >= p.createdAt - 60_000,
        ),
    );
    return waiting.length ? [...listed, ...waiting] : listed;
  }, [listed, pending]);
  const pendingState = useMemo<PendingState>(
    () => ({
      keyOf: (id) => aliases.current.get(id) ?? id,
      pending: (id) => pending.some((c) => c.id === id),
      gone: (id) => gone.has(id),
    }),
    [pending, gone],
  );
  /** Every page's comments, for the tray's other pages: read only while it is open. */
  const [all, setAll] = useState<Comment[]>([]);
  /** The path `comments` were last listed for, so a thread link waits for its page's list. */
  const [listedPath, setListedPath] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = useCallback((toast: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current.slice(-2), { ...toast, id }]);
    window.setTimeout(
      () => setToasts((current) => current.filter((t) => t.id !== id)),
      5000,
    );
  }, []);

  /* Comment mode survives a reload of this tab. `sessionStorage` may throw in a locked-down
     browser, and then the mode simply starts off. */
  const [active, setActiveState] = useState(() => {
    try {
      return sessionStorage.getItem(MODE_KEY) === "1";
    } catch {
      return false;
    }
  });
  /* For `load`, which runs from timers: whether comment mode is on, and which threads were
     already here the last time it looked (null until the first look). */
  const activeRef = useRef(active);
  const seenRef = useRef<{ path: string; ids: Set<string> } | null>(null);
  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;
  const setActive = useCallback((next: boolean) => {
    if (next !== activeRef.current) onActiveChangeRef.current?.(next);
    setActiveState(next);
    activeRef.current = next;
    seenRef.current = null;
    try {
      if (next) sessionStorage.setItem(MODE_KEY, "1");
      else sessionStorage.removeItem(MODE_KEY);
    } catch {
      // Per-tab convenience only.
    }
  }, []);
  /* `data-active` on the layer's host while comment mode is on, so the page's own shortcuts can
     stand down: `document.querySelector("[data-comment-layer][data-active]")`. */
  useEffect(() => {
    host.toggleAttribute("data-active", active);
  }, [host, active]);
  const [showResolved, setShowResolved] = useState(false);
  /** Whether resolved threads are in view: always, when there's no resolving. */
  const withResolved = !resolve || showResolved;
  /**
   * In the tray, the next press places a comment. The fab's comment mode always does, so there
   * the overlay follows `active`.
   */
  const [placing, setPlacing] = useState(false);
  const capturing = tray ? placing : active;
  /** The dock layout's shape. Here, so Esc is one chain. Open as the row if comments were on. */
  const [face, setFace] = useState<DockFace>(() => (active ? "tray" : "icon"));
  /** When every page's comments were last read, for the dock's count: on arrival, then now and then. */
  const allAt = useRef(0);
  const faceRef = useRef(face);
  faceRef.current = face;
  const [draft, setDraft] = useState<Draft | null>(null);
  /** The comment whose reaction set is unfolded, as `where:id` (it can show in two places), and
      whether the full picker is open over it. */
  const [picking, setPicking] = useState<Picking>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  /**
   * A thread's form, put back when it was opened (`useDogearSnapshot`): whose it is, and yours as
   * it was, to go back to. Gone once you leave the flow (`prefix`: the thread's path less its
   * last part, so the steps of one form are one flow).
   */
  const [replay, setReplay] = useState<{
    author: User;
    at: number;
    key: string;
    backup: Snapshot | null;
    prefix: string;
  } | null>(null);
  const [drag, setDrag] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    /** A finger: it only ever pins, since on a touch screen a drag is a scroll. */
    touch: boolean;
  } | null>(null);
  /** Where the pointer is over the overlay, to outline what a press there would anchor to. */
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  // Bumped on scroll and resize so markers re-read where their elements are.
  const [, setFrame] = useState(0);
  /** Pins stay mounted past `active` just long enough to fade out. */
  const [pinsRendered, setPinsRendered] = useState(false);
  if (active && !pinsRendered) setPinsRendered(true);
  /** The comment you just posted, whose pin is already on screen and should not pop again. */
  const [freshId, setFreshId] = useState<string | null>(null);
  /** A reply that was turned away, back in its thread's reply box. */
  const [restore, setRestore] = useState<Restore | null>(null);
  /** The pin under the pointer, previewed. */
  const [hoverId, setHoverId] = useState<string | null>(null);
  /* The preview is drawn over its own pin, so leaving either waits a beat before closing and
     entering either cancels it: the pair behaves as one target. */
  const hoverTimer = useRef<number | undefined>(undefined);
  const hover = useCallback((id: string) => {
    window.clearTimeout(hoverTimer.current);
    setHoverId(id);
  }, []);
  const unhover = useCallback((id: string) => {
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(
      () => setHoverId((current) => (current === id ? null : current)),
      120,
    );
  }, []);
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);
  /** Threads someone else posted while you were watching: they pop at once and ping. */
  const [arrived, setArrived] = useState<ReadonlySet<string>>(() => new Set());

  /** Looks that failed in a row, and the next retry while that has the layer hidden. */
  const failures = useRef(0);
  const [retry, setRetry] = useState<{ ms: number } | null>(null);
  /** A look in flight, so polls and focus don't stack up behind a slow one. */
  const busy = useRef(false);
  const dockRef = useRef<HTMLDivElement>(null);
  /** Whether any look has succeeded: until one does, a single failure keeps the layer hidden. */
  const seenOnce = useRef(false);
  const meRef = useRef<User | null>(null);
  /* A guest is asked once: after that, until they `join`, every look is read-only. Without `join`
     a signed-out visitor is asked on every look, so signing in elsewhere shows the layer. */
  const askedMe = useRef(false);
  const load = useCallback(async () => {
    busy.current = true;
    try {
      const user =
        meRef.current ??
        (adapter.join && askedMe.current ? null : await adapter.me());
      askedMe.current = true;
      if (!user && !adapter.join) return setAvailable(false);
      if (user) meRef.current = user;
      const list = cleanList(await adapter.list(pathname));
      // Other pages are extra: when they fail, the tray shows this page alone.
      const everywhere =
        adapter.listAll &&
        ((layout === "tray" && activeRef.current) ||
          (docked && (faceRef.current === "panel" || Date.now() - allAt.current > ALL_EVERY_MS)))
          ? await adapter.listAll().then(cleanList, () => null)
          : null;
      if (everywhere) allAt.current = Date.now();
      failures.current = 0;
      setRetry(null);
      setMe(user);
      setComments(list);
      if (everywhere) setAll(everywhere);
      setListedPath(pathname);
      setAvailable(true);
      seenOnce.current = true;

      /* News: a thread that was not here last time we looked, and not yours. The first look of a
         session (or of a new page) only takes note. */
      if (activeRef.current) {
        const roots = list.filter((c) => c.parentId === null);
        const seen = seenRef.current;
        if (seen && seen.path === pathname) {
          const fresh = roots.filter(
            (c) => !seen.ids.has(c.id) && c.author.id !== user?.id,
          );
          if (fresh.length > 0) {
            setArrived(
              (current) => new Set([...current, ...fresh.map((c) => c.id)]),
            );
            notify({
              title:
                fresh.length === 1
                  ? `New comment from ${fresh[0].author.name}`
                  : `${fresh.length} new comments`,
            });
          }
        }
        seenRef.current = {
          path: pathname,
          ids: new Set(roots.map((c) => c.id)),
        };
      }
    } catch {
      /* One failure after a success is a blip, and what is on screen stays until the next look.
         Before any success, or twice in a row, the backend is down: hide everything (drafts are
         kept) and look again later. */
      failures.current += 1;
      if (failures.current >= HIDE_AFTER || seenOnce.current === false) {
        setAvailable(false);
        setRetry({
          ms: Math.min(RETRY_MS * 2 ** Math.max(0, failures.current - HIDE_AFTER), RETRY_MAX_MS),
        });
      }
    } finally {
      busy.current = false;
    }
  }, [adapter, pathname, notify, layout, docked]);

  /* Threads load by path: `/settings` and `/settings?tab=security` are one screen reached two
     ways. A new path is a new set of threads; a new query string keeps them and only closes
     what was open. */
  const [loadedPath, setLoadedPath] = useState(pathname);
  if (loadedPath !== pathname) {
    setLoadedPath(pathname);
    setComments([]);
    // On a move, not every render: a thread opened from another page sets it before the move.
    if (replay && !pathname.startsWith(replay.prefix)) setReplay(null);
  }

  /* Mentions of you, on every page (`adapter.mentions`): asked every few seconds while the tab is
     visible, so a mention reaches you wherever you are on the site. The first look says how many
     are unread; after that, each new one is announced. */
  const pageLabel = useContext(PageLabelContext);
  const [mentioned, setMentioned] = useState<Comment[]>([]);
  const [seenMentions, setSeenMentions] = useState<Set<string>>(readSeenMentions);
  const [mentionsOnly, setMentionsOnly] = useState(false);
  const mentionIds = useRef<Set<string> | null>(null);
  const mentionActions = useRef<{ show: () => void; open: (c: Comment) => void }>({
    show: () => {},
    open: () => {},
  });
  const pollsMentions = Boolean(available && me && !me.agent && adapter.mentions);
  useEffect(() => {
    if (!pollsMentions) return;
    mentionIds.current = null;
    let live = true;
    const look = async () => {
      let list: Comment[];
      try {
        list = await adapter.mentions!();
      } catch {
        return; // A blip keeps the last list; the next look tries again.
      }
      if (!live) return;
      const known = mentionIds.current;
      mentionIds.current = new Set(list.map((c) => c.id));
      setMentioned(list);
      const seen = readSeenMentions();
      const fresh = list.filter((c) => !seen.has(c.id) && !known?.has(c.id));
      if (fresh.length === 0) return;
      const [first] = fresh;
      if (known === null || fresh.length > 1) {
        notify({
          title:
            fresh.length === 1 ? "You were mentioned in a comment" : `You were mentioned in ${fresh.length} comments`,
          action: { label: "View", onClick: () => mentionActions.current.show() },
        });
      } else {
        notify({
          title: `${firstName(first.author)} mentioned you on ${pageLabel(pathOf(first.page))}`,
          description: plainText(first, 120),
          action: { label: "View", onClick: () => mentionActions.current.open(first) },
        });
      }
    };
    void look();
    const poll = window.setInterval(() => {
      if (!document.hidden) void look();
    }, MENTIONS_MS);
    return () => {
      live = false;
      window.clearInterval(poll);
    };
  }, [pollsMentions, me?.id, adapter, notify, pageLabel]);

  // Closing the comments ends the filter: they open on everything next time.
  useEffect(() => {
    if (!active) setMentionsOnly(false);
  }, [active]);

  function markSeen(ids: string[]) {
    setSeenMentions((current) => {
      const next = new Set([...readSeenMentions(), ...current, ...ids]);
      writeSeenMentions(next);
      return next;
    });
  }

  /** Put a thread's form back, keeping yours (the first time) to return to. Event handlers only. */
  function replayForm(root: Comment) {
    const state = root.state;
    if (!state) return;
    const mine = captureSnapshot();
    restoreSnapshot(state);
    setReplay((current) => ({
      author: root.author,
      at: root.createdAt,
      key: state.key,
      // Opening a second thread on the same form must not make the first one's form "yours".
      backup:
        current?.key === state.key ? current.backup : mine?.key === state.key ? mine : null,
      prefix: pathOf(root.page).replace(/\/[^/]*$/, "") || "/",
    }));
  }
  const [loadedPage, setLoadedPage] = useState(page);
  if (loadedPage !== page) {
    setLoadedPage(page);
    setDraft(null);
    setOpenId(null);
  }

  /* A link to a thread: open it (in comment mode), bring its element into view, then drop the
     parameter so closing the thread doesn't open it again. Once per link. */
  const followed = useRef<string | null>(null);
  useEffect(() => {
    if (!linked || listedPath !== pathname || followed.current === linked) return;
    followed.current = linked;
    // A reply's id opens its thread.
    const target = comments.find((c) => c.id === linked);
    const rootId = target?.parentId ?? target?.id;
    const root = comments.find((c) => c.id === rootId && c.parentId === null && c.anchor);
    if (root) {
      setActive(true);
      setPlacing(false);
      replayForm(root);
      setOpenId(root.id);
      if (root.anchor) elementFor(root.anchor)?.scrollIntoView({ block: "center" });
    } else {
      notify({
        title: "That comment isn't here",
        description: "It may have been deleted, or be on another page.",
      });
    }
    const url = new URL(location.href);
    for (const param of [linkParam, LINK_PARAM, OLD_LINK_PARAM]) url.searchParams.delete(param);
    history.replaceState(history.state, "", url);
  }, [linked, linkParam, listedPath, pathname, comments, setActive, notify]);

  useEffect(() => {
    void load();
    // News only; a look already under way will answer it.
    const refetch = () => {
      if (!busy.current) void load();
    };
    const onVisible = () => {
      if (!document.hidden) refetch();
    };
    window.addEventListener("focus", refetch);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", refetch);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, active]);

  // Live updates while comment mode is on, and only while the backend answers.
  useEffect(() => {
    if (!active || !available) return;
    const refetch = () => {
      if (!busy.current) void load();
    };
    if (adapter.subscribe) return adapter.subscribe(pathname, refetch);
    const poll = window.setInterval(() => {
      if (!document.hidden) refetch();
    }, POLL_MS);
    return () => window.clearInterval(poll);
  }, [load, active, available, adapter, pathname]);

  // Hidden because the backend is down: look again, slower each time.
  useEffect(() => {
    if (!retry) return;
    const timer = window.setTimeout(() => {
      if (!document.hidden && !busy.current) void load();
    }, retry.ms);
    return () => window.clearTimeout(timer);
  }, [retry, load]);

  // Markers follow their elements. Capture phase, because an app may scroll an inner element and
  // `scroll` does not bubble.
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const bump = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setFrame((n) => n + 1));
    };
    window.addEventListener("scroll", bump, true);
    window.addEventListener("resize", bump);
    const observer = new ResizeObserver(bump);
    observer.observe(document.body);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", bump, true);
      window.removeEventListener("resize", bump);
      observer.disconnect();
    };
  }, [active]);

  const exit = useCallback(() => {
    setActive(false);
    setPlacing(false);
    setPoint(null);
    setDraft(null);
    setOpenId(null);
    setFreshId(null);
    setArrived(new Set());
  }, [setActive]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // The dock: one thing at a time, the most recent first, and last the row back to its button.
      // The pins stay as they are; the eye is what hides them.
      if (docked && event.key === "Escape") {
        if (picking?.more) setPicking({ ...picking, more: false });
        else if (picking) setPicking(null);
        else if (face === "panel") setFace("tray");
        else if (draft) setDraft(null);
        else if (openId) setOpenId(null);
        else if (placing) setPlacing(false);
        else if (face === "tray") setFace("icon");
        return;
      }
      if (active && event.key === "Escape") {
        if (picking?.more) setPicking({ ...picking, more: false });
        else if (picking) setPicking(null);
        else if (draft) setDraft(null);
        else if (openId) setOpenId(null);
        else if (placing) setPlacing(false);
        else exit();
        return;
      }
      if (
        !shortcut ||
        event.key.toLowerCase() !== shortcut.toLowerCase() ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        !available
      )
        return;
      // Not while typing, in the page or in our own fields (which the shadow root retargets).
      const target = event.composedPath()[0] as HTMLElement | undefined;
      if (
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      )
        return;
      if (!tray) {
        if (active) exit();
        else setActive(true);
      } else if (docked && !placing) {
        setFace((current) => (current === "icon" ? "tray" : current));
        setActive(true);
        setOpenId(null);
        setPlacing(true);
      } else if (joinFirst && !meRef.current && adapter.join) {
        // Asked first: the shortcut opens the name step, and places nothing until they've joined.
        setActive(true);
      } else if (placing) {
        setPlacing(false);
        setDraft(null);
      } else {
        setActive(true);
        setOpenId(null);
        setPlacing(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, draft, openId, exit, shortcut, available, setActive, tray, docked, face, placing, joinFirst, adapter, picking]);

  /* The tray leaves the page usable, so a press anywhere on it (outside the layer, whose events
     the shadow root retargets to its host) closes an open thread. */
  useEffect(() => {
    if (!tray || capturing || !openId) return;
    const onDown = (event: PointerEvent) => {
      if ((event.target as Element | null)?.closest?.(`[${LAYER_ATTR}]`)) return;
      setOpenId(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [tray, capturing, openId]);

  /** Signs a guest in by name, and the avatar they picked: the first thing they write is who they are. */
  async function join(name: string, tint?: string, welcome?: () => Promise<void>) {
    const clean = cleanName(name);
    if (!adapter.join || clean === null) {
      notify({ title: "Names are 1 to 40 characters", tone: "error" });
      return false;
    }
    try {
      const user = await adapter.join(clean, tint);
      // The name step's little hello, before it gives way to the comments.
      await welcome?.().catch(() => {});
      meRef.current = user;
      setMe(user);
      return true;
    } catch (error) {
      const refused = refusal(error);
      notify(
        refused
          ? { title: "Choose another name", description: refused, tone: "error" }
          : {
              title: "Couldn't sign you in",
              description: "Check your connection and try again.",
              tone: "error",
            },
      );
      return false;
    }
  }

  /**
   * Posts at once: the comment shows as yours straight away while the backend saves it (and may
   * check it first, which can take a few seconds). Saved, it takes the pending one's place; turned
   * away, it fades out, the reason shows, and the text goes back where it was written, to change.
   */
  function post(input: NewComment, restore: (body: string) => void): string | null {
    if (!me) return null;
    const id = `pending-${++pendingSeq}`;
    const mentions = mentionsFor(input.body);
    const local: Comment = {
      ...input,
      id,
      body: input.body.trim(),
      author: me,
      createdAt: Date.now(),
      editedAt: null,
      resolved: false,
      ...(mentions.length ? { mentions } : {}),
    };
    setPending((current) => [...current, local]);
    const settle = () => setPending((current) => current.filter((c) => c.id !== id));
    adapter.create(input).then(
      ({ skipped, ...created }) => {
        // Mentioned, but they can't open this page: they won't see it, and nothing goes to them.
        if (skipped?.length) {
          notify({
            title: `${listOf(skipped)} can't open this page`,
            description: "So they won't see this comment or be alerted.",
          });
        }
        aliases.current.set(created.id, id);
        // Yours is not news to you.
        seenRef.current?.ids.add(created.id);
        setComments((current) =>
          current.some((c) => c.id === created.id) ? current : [...current, created],
        );
        settle();
        setOpenId((current) => (current === id ? created.id : current));
        setFreshId((current) => (current === id ? created.id : current));
      },
      (error: unknown) => {
        const tooMany = (error as { status?: number }).status === 429;
        notify({
          title: "Comment not posted",
          description:
            refusal(error) ??
            (tooMany
              ? "That's a lot of comments at once. Try again in a few minutes."
              : "Check your connection and try again."),
          tone: "error",
        });
        setGone((current) => new Set(current).add(id));
        window.setTimeout(() => {
          settle();
          setGone((current) => {
            const next = new Set(current);
            next.delete(id);
            return next;
          });
          setOpenId((current) => (current === id ? null : current));
          restore(input.body);
        }, reduced() ? GONE_REDUCED_MS : GONE_MS);
      },
    );
    return id;
  }

  async function setResolved(root: Comment, resolved: boolean) {
    const flip = (value: boolean) =>
      setComments((current) =>
        current.map((c) => (c.id === root.id ? { ...c, resolved: value } : c)),
      );
    flip(resolved);
    if (resolved) setOpenId(null);
    try {
      await adapter.update(root.id, { resolved });
      if (resolved) {
        notify({
          title: "Thread resolved",
          description: "Turn on Show resolved to see it again.",
          action: {
            label: "Undo",
            onClick: () => void setResolved(root, false),
          },
        });
      }
    } catch {
      flip(!resolved);
      notify({
        title: resolved
          ? "Couldn't resolve the thread"
          : "Couldn't reopen the thread",
        tone: "error",
      });
    }
  }

  /** Optimistic: the text changes at once, and goes back if the save fails. */
  async function edit(comment: Comment, body: string) {
    const put = (next: Comment) =>
      setComments((current) =>
        current.map((c) => (c.id === next.id ? next : c)),
      );
    const mentions = mentionsFor(body);
    put({ ...comment, body: body.trim(), editedAt: Date.now(), mentions: mentions.length ? mentions : undefined });
    try {
      put(await adapter.update(comment.id, { body }));
      return true;
    } catch (error) {
      put(comment);
      notify({
        title: "Comment not saved",
        description: refusal(error) ?? "Check your connection and try again.",
        tone: "error",
      });
      return false;
    }
  }

  /** Your reaction on a comment, toggled: shown at once, rolled back if the backend says no. */
  async function react(comment: Comment, emoji: string) {
    if (!me || !adapter.react) return;
    if (!roomForReaction(comment.reactions, emoji)) {
      notify({
        title: "No room for that one",
        description: `A comment can carry ${MAX_REACTIONS} kinds of reaction. Add to one that's there.`,
        tone: "error",
      });
      return;
    }
    const flip = (c: Comment) =>
      c.id === comment.id ? { ...c, reactions: toggleReaction(c.reactions, emoji, me.id) } : c;
    setComments((current) => current.map(flip));
    setAll((current) => current.map(flip));
    try {
      const next = await adapter.react(comment.id, emoji);
      const put = (c: Comment) => (c.id === next.id ? next : c);
      setComments((current) => current.map(put));
      setAll((current) => current.map(put));
    } catch (error) {
      setComments((current) => current.map(flip));
      setAll((current) => current.map(flip));
      notify({
        title: "Reaction not saved",
        description: refusal(error) ?? "Check your connection and try again.",
        tone: "error",
      });
    }
  }

  /** Threads to the clipboard as Markdown, for an agent or an issue. */
  async function copy(threads: Comment[], what: string) {
    try {
      await navigator.clipboard.writeText(toMarkdown(threads, pathname));
      notify({ title: `Copied ${what} as Markdown` });
    } catch {
      notify({
        title: "Couldn't copy",
        description: "The browser didn't allow the clipboard here.",
        tone: "error",
      });
    }
  }

  async function remove(comment: Comment) {
    try {
      const deleted = await adapter.remove(comment.id);
      setComments((current) => current.filter((c) => !deleted.includes(c.id)));
      if (deleted.includes(openId ?? "")) setOpenId(null);
    } catch {
      notify({ title: "Comment not deleted", tone: "error" });
    }
  }

  // Press → move → release on the overlay. Under DRAG_PX it is a pin, past it an area.
  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if (draft || openId) {
      // A press outside an open card closes it rather than starting another.
      setDraft(null);
      setOpenId(null);
      return;
    }
    if (isIgnoredAt(event.clientX, event.clientY, ignore)) return;
    const touch = event.pointerType === "touch";
    // A finger isn't captured: if it moves, the browser scrolls and cancels it (below).
    if (!touch) event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      x0: event.clientX,
      y0: event.clientY,
      x1: event.clientX,
      y1: event.clientY,
      touch,
    });
  }
  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    // Only a mouse aims: a finger has nothing to outline until it presses.
    if (event.pointerType !== "touch") setPoint({ x: event.clientX, y: event.clientY });
    if (drag) setDrag({ ...drag, x1: event.clientX, y1: event.clientY });
  }
  /** The browser took the finger over to scroll: nothing was placed. */
  function onPointerCancel() {
    setDrag(null);
    setPoint(null);
  }
  function onPointerUp() {
    if (!drag) return;
    const w = Math.abs(drag.x1 - drag.x0);
    const h = Math.abs(drag.y1 - drag.y0);
    // A tap wobbles a few pixels; a finger that really moved was scrolling, not placing.
    if (drag.touch && (w > TAP_SLOP || h > TAP_SLOP)) return onPointerCancel();
    const isArea = pick !== "pin" && !drag.touch && (w > DRAG_PX || h > DRAG_PX);
    const box = isArea
      ? { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w, h }
      : { x: drag.x0, y: drag.y0, w: 0, h: 0 };
    setDraft({ box, anchor: anchorAt(box, ignore) });
    setDrag(null);
  }

  const rootRef = useRef<HTMLDivElement>(null);
  /** The keyboard's height while a card is up, for the sheet on a phone. */
  const keyboard = useKeyboardInset(Boolean(draft || openId));
  /* On a phone the card is a sheet over the bottom of the page: once one opens, the page scrolls
     so its pin sits in the room above it. Once per card, not again as comments arrive. */
  const sheetFor = draft && !draft.sent ? "draft" : openId;
  useEffect(() => {
    if (!sheetFor || !narrow()) return;
    const raf = requestAnimationFrame(() => {
      const card = rootRef.current?.querySelector(".pc-card[data-sheet]")?.getBoundingClientRect();
      const anchor =
        sheetFor === "draft" ? draft?.anchor : comments.find((c) => c.id === sheetFor)?.anchor;
      if (!card || !anchor) return;
      const { y } = resolveAnchor(anchor);
      // The pin stands above its point: in view if it clears the top and the sheet by a little.
      if (y - PIN >= 16 && y <= card.top - 16) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollBy({ top: y - card.top * 0.45, behavior: reduce ? "auto" : "smooth" });
    });
    return () => cancelAnimationFrame(raf);
  }, [sheetFor]);

  if (!available) return null;

  /** A guest on a page that asks first: until they join, the tray asks, and there are no pins. */
  const gated = layout === "tray" && joinFirst && !me && Boolean(adapter.join);

  /** Where a thread card must stop on the right: the open tray's left edge, or the window's. */
  function cardEdge() {
    const panel = dockRef.current
      ?.querySelector('.pc-dock-box[data-state="open"]')
      ?.getBoundingClientRect();
    return panel && panel.width > 0 && panel.left > CARD_WIDTH + GAP * 2
      ? panel.left
      : window.innerWidth;
  }

  /** A tray row on this page: bring its element into view and open it. */
  function show(root: Comment) {
    setDraft(null);
    setPlacing(false);
    setHoverId(null);
    if (root.id !== openId) replayForm(root);
    setOpenId(root.id);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // On a phone the card is a sheet, and the pin is brought above it once it's open (below).
    if (root.anchor && !narrow()) {
      elementFor(root.anchor)?.scrollIntoView({
        block: "center",
        behavior: reduce ? "auto" : "smooth",
      });
    }
  }
  /**
   * A tray row on another page: go there with its link, which opens it on arrival. A thread with
   * a form is read from its own page first (lists of every page leave forms out), so the form is
   * filled in, or queued for its mount, before the move: a step that checks the earlier ones
   * never sees it empty.
   */
  async function go(root: Comment) {
    try {
      const full = (await adapter.list(pathOf(root.page))).find((c) => c.id === root.id);
      if (full) replayForm(full);
    } catch {
      // It opens without its form.
    }
    const url = new URL(root.page, location.origin);
    url.searchParams.set(linkParam, root.id);
    navigate(url.pathname + url.search);
  }

  /** The tray, narrowed to threads that mention you, every mention marked read. The fab has no list: the newest opens. */
  function showMentions() {
    markSeen(mentioned.map((c) => c.id));
    if (!tray) {
      if (mentioned[0]) openMention(mentioned[0]);
      return;
    }
    if (docked) setFace("panel");
    setMentionsOnly(true);
    if (resolve) setShowResolved(true);
    setDraft(null);
    setPlacing(false);
    setActive(true);
  }
  /** The thread a mention is in, here or on its own page. */
  function openMention(c: Comment) {
    markSeen([c.id]);
    const rootId = c.parentId ?? c.id;
    const here = comments.find((x) => x.id === rootId && x.parentId === null && x.anchor);
    if (here) {
      setActive(true);
      if (here.resolved && resolve) setShowResolved(true);
      show(here);
    } else void go({ ...c, id: rootId, parentId: null });
  }
  mentionActions.current = { show: showMentions, open: openMention };
  /** Threads that mention you: the mentions filter keeps these. */
  const mentionRoots = new Set(mentioned.map((c) => c.parentId ?? c.id));
  const unreadMentions = mentioned.filter((c) => !seenMentions.has(c.id)).length;

  const roots = comments.filter((c) => c.parentId === null && c.anchor);
  const openCount = roots.filter((c) => !resolve || !c.resolved).length;
  const visible = roots.filter((c) => withResolved || !c.resolved);
  const openRoot = roots.find((c) => c.id === openId) ?? null;
  const openAt = openRoot ? resolveAnchor(openRoot.anchor!) : null;
  /* The pin being written: where its anchor is now, so it rides along when the page scrolls (as
     it does on a phone, to clear the sheet and the keyboard). */
  const draftAt = draft ? resolveAnchor(draft.anchor) : null;
  const hoverRoot = roots.find((c) => c.id === hoverId) ?? null;
  /* What a press would anchor to: the element under the pointer, or under a drag's centre, since
     that is what an area hangs on. Read every render, so it follows scrolling. */
  const aim = drag
    ? { x: (drag.x0 + drag.x1) / 2, y: (drag.y0 + drag.y1) / 2 }
    : point;
  const target =
    pick === "element" && capturing && aim && !draft && !openId
      ? targetAt(aim.x, aim.y, ignore)
      : null;
  /* pick="pin": where the pin you'd drop follows the pointer, in place of the outline. Not over
     what's ignored, where a press does nothing. */
  const ghost =
    pick === "pin" && capturing && point && !draft && !openId && !isIgnoredAt(point.x, point.y, ignore)
      ? point
      : null;
  const canResolve = (root: Comment) =>
    resolve &&
    me !== null &&
    (resolvers === "anyone" || root.author.id === me.id || Boolean(me.admin));
  const reacting: ReactionsState | null =
    reactions?.length && adapter.react
      ? { set: reactions, where: reactionsIn, me: me?.id ?? null, picking, setPicking, react, emojiData }
      : null;

  return (
    <PeopleContext.Provider value={people}>
    <ReactionsContext.Provider value={reacting}>
    <PendingContext.Provider value={pendingState}>
    <div
      ref={rootRef}
      className="pc-root"
      style={keyboard ? ({ "--_kb": `${keyboard}px` } as CSSProperties) : undefined}
    >
      {capturing && (
        <div
          aria-hidden="true"
          className="pc-overlay"
          data-aiming={ghost ? "" : undefined}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onPointerLeave={() => setPoint(null)}
        />
      )}

      {target && <TargetOutline box={target.box} label={target.label} />}
      {drag && !drag.touch && pick === "element" && <AreaOutline box={normalise(drag)} />}
      {ghost && <Pin x={ghost.x} y={ghost.y} author={me ?? undefined} entryDelay={null} ghost />}

      {/* One group, so leaving comment mode fades the pins out together before they unmount;
          `onAnimationEnd` is guarded because every pin's own pop bubbles here too. */}
      {pinsRendered && !gated && (
        <div
          className="pc-pins"
          data-state={active ? "open" : "closed"}
          onAnimationEnd={(event) => {
            if (event.target !== event.currentTarget) return;
            if (!active) setPinsRendered(false);
          }}
        >
          {visible.map((root, index) => {
            const at = resolveAnchor(root.anchor!);
            if (at.hidden) return null;
            /* Made on exactly this URL: always draw, at its fallback if the element moved.
               Made on another view of this path: only if its element is here. */
            if (root.page !== page && (at.lost || !at.same)) return null;
            // Its element is still here but says something else now: the feedback may be done.
            const changed = !at.lost && !at.same;
            return (
              <Marker
                key={pendingState.keyOf(root.id)}
                leaving={pendingState.gone(root.id)}
                box={at}
                root={root}
                label={`Comment ${index + 1} by ${root.author.name}${
                  root.anchor!.label ? ` on ${root.anchor!.label}` : ""
                }${changed ? ", element changed since" : ""}`}
                muted={at.lost || (resolve && root.resolved)}
                changed={changed}
                selected={root.id === openId}
                // The one just posted is already on screen as the pending pin.
                entryDelay={
                  root.id === freshId
                    ? null
                    : arrived.has(root.id)
                      ? 0
                      : Math.min(index, 7) * 30
                }
                arrived={arrived.has(root.id)}
                settle={root.id === freshId}
                onOpen={() => {
                  setDraft(null);
                  setHoverId(null);
                  if (root.id !== openId) replayForm(root);
                  setOpenId(root.id === openId ? null : root.id);
                }}
                onHover={(hovering) =>
                  hovering ? hover(root.id) : unhover(root.id)
                }
              />
            );
          })}
        </div>
      )}

      {draft && draftAt && (
        <>
          {draftAt.w > 0 && <AreaOutline box={draftAt} />}
          {/* Yours, with your photo, as it will be once posted. */}
          <Pin
            x={draftAt.x}
            y={draftAt.y}
            author={me ?? undefined}
            entryDelay={0}
            leaving={draft.sent}
          />
          {me ? (
            <Composer
              key={draft.body === undefined ? "comment" : `again-${draft.body}`}
              leaving={draft.sent}
              box={draftAt}
              placeholder="Add a comment"
              initial={draft.body}
              onSubmit={async (body) => {
                const placed = draft;
                // The form under the comment, if one is on screen, so others see what you saw.
                const state = captureSnapshot();
                const id = post(
                  { page, body, parentId: null, anchor: placed.anchor, ...(state ? { state } : {}) },
                  // Turned away: the comment box opens again where it was, with the text in it.
                  (text) => {
                    setActive(true);
                    setOpenId(null);
                    setDraft({ box: placed.box, anchor: placed.anchor, body: text });
                  },
                );
                if (id) {
                  setFreshId(id);
                  setPlacing(false);
                  setDraft((current) => current && { ...current, sent: true });
                  window.setTimeout(
                    () => setDraft((current) => (current?.sent ? null : current)),
                    SENT_MS,
                  );
                }
                return Boolean(id);
              }}
            />
          ) : (
            <Composer key="name" box={draftAt}>
              <JoinBox placeholder="Your name, shown with comments" onJoin={join} />
            </Composer>
          )}
        </>
      )}

      {active && hoverRoot && hoverRoot.id !== openId && !draft && (
        <Preview
          comment={hoverRoot}
          box={resolveAnchor(hoverRoot.anchor!)}
          onHover={(hovering) =>
            hovering ? hover(hoverRoot.id) : unhover(hoverRoot.id)
          }
          onOpen={() => {
            setHoverId(null);
            replayForm(hoverRoot);
            setOpenId(hoverRoot.id);
          }}
        />
      )}

      {openRoot && (
        <Thread
          assistant={people.find((p) => p.agent)}
          edge={cardEdge()}
          key={openRoot.id}
          root={openRoot}
          box={openAt!}
          changed={!openAt!.lost && !openAt!.same}
          replies={comments.filter((c) => c.parentId === openRoot.id)}
          me={me}
          canResolve={canResolve(openRoot)}
          closed={resolve && openRoot.resolved}
          onJoin={join}
          onClose={() => setOpenId(null)}
          onResolve={(resolved) => void setResolved(openRoot, resolved)}
          onDelete={(comment) => void remove(comment)}
          onEdit={edit}
          onCopy={() =>
            void copy(
              comments.filter((c) => c.id === openRoot.id || c.parentId === openRoot.id),
              "the thread",
            )
          }
          restore={restore?.parentId === openRoot.id ? restore : undefined}
          onReply={async (body) => {
            const root = openRoot;
            return Boolean(
              post({ page: root.page, body, parentId: root.id, anchor: null }, (text) => {
                // Turned away: the thread opens again with the reply back in its box.
                setOpenId(root.id);
                setRestore({ parentId: root.id, body: text, nonce: Date.now() });
              }),
            );
          }}
        />
      )}

      {replay && (
        <ReplayBanner
          author={replay.author}
          at={replay.at}
          mine={replay.author.id === me?.id}
          onBack={
            replay.backup
              ? () => {
                  restoreSnapshot(replay.backup!);
                  setReplay(null);
                }
              : undefined
          }
          onDismiss={() => setReplay(null)}
        />
      )}

      {docked && (
        <Floater
          face={face}
          onFace={setFace}
          openCount={
            [...comments, ...all.filter((c) => pathOf(c.page) !== pathname)].filter(
              (c) => c.parentId === null && c.anchor && (!resolve || !c.resolved),
            ).length
          }
          {...groupThreads(
            [...comments, ...all.filter((c) => pathOf(c.page) !== pathname)].filter(
              (c) => !mentionsOnly || mentionRoots.has(c.parentId ?? c.id),
            ),
            pathname,
            { resolved: withResolved },
          )}
          pinsShown={active}
          onPinsShown={(shown) => (shown ? setActive(true) : exit())}
          placing={placing}
          onPlacing={(next) => {
            setDraft(null);
            setOpenId(null);
            setPlacing(next);
            if (next) setActive(true);
          }}
          pick={pick}
          showResolved={resolve ? showResolved : undefined}
          onShowResolved={setShowResolved}
          mentionCount={unreadMentions}
          mentionsOnly={mentionsOnly}
          onMentionsOnly={
            mentioned.length > 0 || mentionsOnly
              ? (on) => (on ? showMentions() : setMentionsOnly(false))
              : undefined
          }
          freshId={freshId}
          onShow={(root) => {
            // The list makes way for the thread: back to the row.
            setFace("tray");
            setActive(true);
            if (root.resolved && resolve) setShowResolved(true);
            show(root);
          }}
          onGo={(root) => {
            setFace("tray");
            void go(root);
          }}
        />
      )}

      <div ref={dockRef} className="pc-dock" data-layout={layout}>
        {layout === "tray" && (
          <Dock
            state={
              !active
                ? "closed"
                : gated
                  ? "join"
                  : capturing || (draft && !draft.sent)
                    ? "placing"
                    : "open"
            }
            onJoin={join}
            freshId={freshId}
            {...groupThreads(
              [...comments, ...all.filter((c) => pathOf(c.page) !== pathname)].filter(
                (c) => !mentionsOnly || mentionRoots.has(c.parentId ?? c.id),
              ),
              pathname,
              { resolved: withResolved },
            )}
            mentionCount={unreadMentions}
            mentionsOnly={mentionsOnly}
            onMentionsOnly={
              mentioned.length > 0 || mentionsOnly
                ? (on) => (on ? showMentions() : setMentionsOnly(false))
                : undefined
            }
            threadOpen={openId !== null}
            shortcut={shortcut}
            pick={pick}
            showResolved={resolve ? showResolved : undefined}
            onShowResolved={setShowResolved}
            onShow={show}
            onGo={go}
            onOpen={() => setActive(true)}
            onPlace={() => {
              setOpenId(null);
              setPlacing(true);
            }}
            onCancel={() => {
              setPlacing(false);
              setDraft(null);
            }}
            onClose={exit}
          />
        )}
        {!tray && active && (
          <div
            className="pc-card pc-surface pc-hint pc-row"
            style={{ transformOrigin: "bottom right" }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <span>{coarse() ? "Tap anywhere to comment" : "Click to pin, drag to mark an area"}</span>
            {visible.length > 0 && (
              <button
                type="button"
                className="pc-link"
                onClick={() => {
                  const shown = new Set(visible.map((c) => c.id));
                  void copy(
                    comments.filter((c) => shown.has(c.parentId ?? c.id)),
                    visible.length === 1 ? "1 thread" : `${visible.length} threads`,
                  );
                }}
              >
                Copy all
              </button>
            )}
            {resolve && (
              <label className="pc-switch">
                <input
                  type="checkbox"
                  checked={showResolved}
                  onChange={(event) => setShowResolved(event.currentTarget.checked)}
                />
                Show resolved
              </label>
            )}
          </div>
        )}
        {!tray && (
          <button
            type="button"
            className="pc-fab"
            data-active={active ? "" : undefined}
            aria-pressed={active}
            onClick={() => (active ? exit() : setActive(true))}
          >
            <Glyph name="comment" />
            {active
              ? "Done"
              : openCount > 0
                ? `Comments · ${openCount}`
                : "Comment"}
          </button>
        )}
      </div>

      <div className="pc-toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pc-toast pc-surface pc-card"
            data-tone={toast.tone}
          >
            <div className="pc-col pc-fill">
              <span style={{ fontWeight: 500 }}>{toast.title}</span>
              {toast.description && (
                <span style={{ color: "var(--_muted)" }}>
                  {toast.description}
                </span>
              )}
            </div>
            {toast.action && (
              <button
                type="button"
                className="pc-toast-action"
                onClick={() => {
                  setToasts((current) => current.filter((t) => t.id !== toast.id));
                  toast.action!.onClick();
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
    </PendingContext.Provider>
    </ReactionsContext.Provider>
    </PeopleContext.Provider>
  );
}

function normalise(d: { x0: number; y0: number; x1: number; y1: number }): Box {
  return {
    x: Math.min(d.x0, d.x1),
    y: Math.min(d.y0, d.y1),
    w: Math.abs(d.x1 - d.x0),
    h: Math.abs(d.y1 - d.y0),
  };
}

/**
 * The layer's own icons, drawn for it on a 24px grid with a 1.5 stroke and round ends, the
 * grammar of most current icon sets, so a site's own (the `icons` prop) can stand in for any of
 * them without the rest looking out of place.
 */
const ICONS = {
  comment: (
    <path d="M12 4.25c4.56 0 8.25 3.13 8.25 7s-3.69 7-8.25 7c-.98 0-1.92-.14-2.79-.41L5.1 19.6c-.4.1-.76-.27-.64-.67l.97-3.1A6.5 6.5 0 0 1 3.75 11.25c0-3.87 3.69-7 8.25-7Z" />
  ),
  send: (
    <>
      <path d="M12 19.25V5.25" />
      <path d="M6.25 11 12 5.25 17.75 11" />
    </>
  ),
  close: (
    <>
      <path d="m6.75 6.75 10.5 10.5" />
      <path d="M17.25 6.75 6.75 17.25" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5.75v12.5" />
      <path d="M5.75 12h12.5" />
    </>
  ),
  more: (
    <g fill="currentColor" stroke="none">
      <circle cx="6" cy="12" r="1.25" />
      <circle cx="12" cy="12" r="1.25" />
      <circle cx="18" cy="12" r="1.25" />
    </g>
  ),
  resolve: (
    <>
      <circle cx="12" cy="12" r="8.25" />
      <path d="m8.75 12.25 2.25 2.25 4.25-4.5" />
    </>
  ),
  reopen: (
    <>
      <path d="M4.75 12a7.25 7.25 0 1 0 2.12-5.13L4.75 9" />
      <path d="M4.75 4.75V9H9" />
    </>
  ),
  /** Steps back and forth through the name step's avatars. */
  prev: <path d="m14.25 6.75-5.25 5.25 5.25 5.25" />,
  next: <path d="m9.75 6.75 5.25 5.25-5.25 5.25" />,
  /** Adds a reaction: a face with a plus. */
  react: (
    <>
      <path d="M19.25 11.25a7.25 7.25 0 1 1-6.5-7.21" />
      <path d="M9.25 14.25s1 1.5 2.75 1.5 2.75-1.5 2.75-1.5" />
      <path d="M9.5 10h.01M14.5 10h.01" />
      <path d="M18.5 3.25v4.5M16.25 5.5h4.5" />
    </>
  ),
  /** Leads the emoji picker's search. */
  search: (
    <>
      <circle cx="11" cy="11" r="6.25" />
      <path d="m15.75 15.75 3.5 3.5" />
    </>
  ),
  /** The dock layout's controls: add a comment, show or hide pins, list them, mentions of you. */
  add: (
    <>
      <path d="M12 4.25c4.56 0 8.25 3.13 8.25 7s-3.69 7-8.25 7c-.98 0-1.92-.14-2.79-.41L5.1 19.6c-.4.1-.76-.27-.64-.67l.97-3.1A6.5 6.5 0 0 1 3.75 11.25c0-3.87 3.69-7 8.25-7Z" />
      <path d="M12 8.5v5.5M9.25 11.25h5.5" />
    </>
  ),
  eye: (
    <>
      <path d="M3.25 12s3.18-6.25 8.75-6.25S20.75 12 20.75 12 17.57 18.25 12 18.25 3.25 12 3.25 12Z" />
      <circle cx="12" cy="12" r="2.75" />
    </>
  ),
  hidden: (
    <>
      <path d="M9.9 6.02A8.8 8.8 0 0 1 12 5.75c5.57 0 8.75 6.25 8.75 6.25a15 15 0 0 1-2.18 3.04M6.5 7.5A14.6 14.6 0 0 0 3.25 12S6.43 18.25 12 18.25a8.6 8.6 0 0 0 4.5-1.25" />
      <path d="m4.75 4.75 14.5 14.5" />
    </>
  ),
  list: (
    <>
      <path d="M9.25 7.25h10M9.25 12h10M9.25 16.75h10" />
      <path d="M4.75 7.25h.01M4.75 12h.01M4.75 16.75h.01" />
    </>
  ),
  at: (
    <>
      <circle cx="12" cy="12" r="3.25" />
      <path d="M15.25 8.75v4.5c0 1.38.87 2.5 2.25 2.5s2.25-1.5 2.25-3.75a8 8 0 1 0-3.5 6.6" />
    </>
  ),
  /** The assistant's avatar. */
  sparkle: (
    <>
      <path d="M12 3.75c.5 3.9 2.35 5.75 6.25 6.25-3.9.5-5.75 2.35-6.25 6.25-.5-3.9-2.35-5.75-6.25-6.25 3.9-.5 5.75-2.35 6.25-6.25Z" />
      <path d="M18 15.75c.2 1.55.95 2.3 2.5 2.5-1.55.2-2.3.95-2.5 2.5-.2-1.55-.95-2.3-2.5-2.5 1.55-.2 2.3-.95 2.5-2.5Z" />
    </>
  ),
  /** Leads every field, as in a command palette's input row. */
  field: (
    <>
      <path d="M5.25 12h13.5" />
      <path d="m13 6.25 5.75 5.75L13 17.75" />
    </>
  ),
};

export type IconName = keyof typeof ICONS;

const IconsContext = createContext<Partial<Record<IconName, ReactNode>>>({});

/** One of the layer's icons, or the site's own in its place, at 16px in `currentColor`. */
function Glyph({ name, size = 16 }: { name: IconName; size?: number }) {
  const own = useContext(IconsContext)[name];
  if (own) {
    return (
      <span aria-hidden="true" className="pc-glyph" style={{ width: size, height: size }}>
        {own}
      </span>
    );
  }
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[name]}
    </svg>
  );
}

/** The element a press would anchor to, and what it is, as you aim. */
function TargetOutline({ box, label }: { box: Box; label: string }) {
  // The label sits above the element, or inside its top edge when there is no room above.
  const above = box.y >= 24;
  return (
    <>
      <div
        aria-hidden="true"
        className="pc-target"
        style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
      />
      <div
        aria-hidden="true"
        className="pc-target-label pc-truncate"
        style={{
          left: Math.max(4, box.x),
          top: above ? box.y - 4 : box.y + 4,
          transform: above ? "translateY(-100%)" : undefined,
        }}
      >
        {label}
      </div>
    </>
  );
}

function AreaOutline({ box }: { box: Box }) {
  return (
    <div
      aria-hidden="true"
      className="pc-area"
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
    />
  );
}

/** No avatars offered: initials on the neutral disc. */
const NO_AVATARS: Record<string, string> = {};
const AvatarsContext = createContext<Record<string, string>>(NO_AVATARS);

/** The same number for the same id, every time: which avatar someone gets who didn't pick one. */
function hashOf(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

/**
 * A 24px round photo; or the author's initials on the avatar they picked, or on one chosen by
 * their id, when the page offers avatars; or on the neutral disc.
 */
function Avatar({ author }: { author: User | Person }) {
  const avatars = useContext(AvatarsContext);
  const [broken, setBroken] = useState(false);
  // An agent without a photo is a sparkle, never someone's initials.
  if (author.agent && (!author.avatar || broken)) {
    return (
      <span aria-hidden="true" className="pc-avatar" data-agent="">
        <Glyph name="sparkle" size={14} />
      </span>
    );
  }
  if (author.avatar && !broken) {
    return (
      <img
        className="pc-avatar"
        src={author.avatar}
        alt=""
        width={24}
        height={24}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    );
  }
  const keys = Object.keys(avatars);
  const key =
    "tint" in author && author.tint && author.tint in avatars
      ? author.tint
      : keys.length > 0
        ? keys[hashOf(author.id) % keys.length]
        : null;
  return (
    <span
      aria-hidden="true"
      className="pc-avatar"
      data-tint={key ? "" : undefined}
      style={key ? { background: avatars[key] } : undefined}
    >
      {initials(author.name)}
    </span>
  );
}

/**
 * A pin: a 32px teardrop whose square bottom-left corner is the tail, sitting on the point.
 * Pending (you are writing it) is solid accent; placed is the surface with the author's photo.
 * `entryDelay` is when its pop starts, or null for none.
 */
function Pin({
  x,
  y,
  author,
  entryDelay,
  muted = false,
  changed = false,
  selected = false,
  arrived = false,
  settle = false,
  leaving = false,
  ghost = false,
  label,
  onOpen,
  onHover,
}: {
  x: number;
  y: number;
  /** Absent on the pending pin. */
  author?: User;
  entryDelay: number | null;
  /** The comment you just posted: it settles in from under the pending pin as that one goes. */
  settle?: boolean;
  /** The pending pin of a posted comment, giving way to the real one. */
  leaving?: boolean;
  /** pick="pin": the pin you'd drop, following the pointer, with your avatar if you're known. */
  ghost?: boolean;
  muted?: boolean;
  /** Its element's text no longer matches the fingerprint: a dot on the pin. */
  changed?: boolean;
  selected?: boolean;
  arrived?: boolean;
  label?: string;
  onOpen?: () => void;
  onHover?: (hovering: boolean) => void;
}) {
  const style: CSSProperties = {
    left: x,
    top: y - PIN,
    opacity: muted ? 0.5 : 1,
    ...(entryDelay === null ? {} : { animationDelay: `${entryDelay}ms` }),
  };
  const className = `pc-pin${entryDelay === null ? "" : " pc-pin-enter"}${settle ? " pc-pin-settle" : ""}`;
  if (ghost) {
    return (
      <div
        aria-hidden="true"
        className={`${className} pc-pin-ghost`}
        style={style}
        data-pending={author ? undefined : ""}
      >
        {author && <Avatar author={author} />}
      </div>
    );
  }
  if (!onOpen) {
    // The pin being written. Marked in the page's colour only for a guest with no name yet.
    return (
      <div
        aria-hidden="true"
        className={className}
        style={style}
        data-pending={author ? undefined : ""}
        data-leaving={leaving ? "" : undefined}
      >
        {author && <Avatar author={author} />}
      </div>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={selected}
      data-selected={selected ? "" : undefined}
      data-arrived={arrived ? "" : undefined}
      className={className}
      style={style}
      onPointerDown={(event) => event.stopPropagation()}
      // A preview is a hover: on a touch screen a tap opens the thread itself.
      onPointerEnter={(event) => event.pointerType === "mouse" && onHover?.(true)}
      onPointerLeave={(event) => event.pointerType === "mouse" && onHover?.(false)}
      onClick={onOpen}
    >
      {author && <Avatar author={author} />}
      {changed && <span aria-hidden="true" className="pc-pin-dot" />}
    </button>
  );
}

function Marker({
  box,
  root,
  ...pin
}: {
  box: Box;
  root: Comment;
  label: string;
  muted: boolean;
  changed: boolean;
  selected: boolean;
  entryDelay: number | null;
  arrived: boolean;
  settle: boolean;
  /** Turned away: fading out. */
  leaving?: boolean;
  onOpen: () => void;
  onHover: (hovering: boolean) => void;
}) {
  return (
    <>
      {box.w > 0 && <AreaOutline box={box} />}
      <Pin x={box.x} y={box.y} author={root.author} {...pin} />
    </>
  );
}

/** First name · time, with the agent's badge: the head of every comment, wherever it's listed. */
/** Whether to say where a comment was left (the `locations` prop). */
const LocationsContext = createContext(true);
/** What a page is called in the list (the `pageLabel` prop). */
const samePath = (path: string) => path;
const PageLabelContext = createContext(samePath);
/** Who may delete what (the `deletable` prop). */
const ownOrAdmin = (me: User, comment: Comment) => comment.author.id === me.id || Boolean(me.admin);
const DeletableContext = createContext(ownOrAdmin);

/**
 * Whether the assistant is still on this thread: its last comment is one the assistant answers,
 * under two minutes old. The reply arriving ends it, and so does time, if it chose to stay quiet.
 */
function awaitingAssistant(thread: Comment[], assistant: Person | undefined) {
  const last = thread.at(-1);
  if (!assistant || !last || last.author.agent || Date.now() - last.createdAt > 120_000) return false;
  const calls =
    last.mentions?.some((m) => m.id === assistant.id) ||
    mentionedHandles(last.body).includes(assistant.handle.toLowerCase());
  return calls || (assistant.answers !== "mentions" && last.parentId === null);
}

function Byline({ author, time, extra }: { author: User; time: string; extra?: string }) {
  return (
    <span className="pc-byline">
      <span className="pc-name pc-truncate">{firstName(author)}</span>
      {author.agent && <span className="pc-badge">AI</span>}
      <span aria-hidden="true" className="pc-sep">
        ·
      </span>
      <span className="pc-time">{time}</span>
      {extra && (
        <>
          <span aria-hidden="true" className="pc-sep">
            ·
          </span>
          <span className="pc-time">{extra}</span>
        </>
      )}
    </span>
  );
}

/** The unfolded set: whose, and whether the full picker is open over it. */
type Picking = { key: string; more: boolean } | null;

type ReactionsState = {
  /** The emoji on offer. */
  set: string[];
  where: "everywhere" | "thread";
  /** Your id, or null while you haven't joined: you see reactions but can't leave one. */
  me: string | null;
  picking: Picking;
  setPicking: (picking: Picking) => void;
  react: (comment: Comment, emoji: string) => void;
  /** Where the full picker's emoji come from (Emojibase's data, by locale). */
  emojiData: string;
};
/** Null: reactions are off. */
const ReactionsContext = createContext<ReactionsState | null>(null);

/** Who can be @mentioned, for the `@` list in a compose box. Empty: typing @ is just text. */
const PeopleContext = createContext<Person[]>([]);

/** "Sam", "Sam and Jordan", "Sam, Jordan and Riley". */
function listOf(names: string[]) {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** A comment's text, each @handle it mentions drawn as the person's name. */
function Body({ comment, className, inline = false }: { comment: Comment; className: string; inline?: boolean }) {
  const Tag = inline ? "span" : "p";
  return (
    <Tag className={className}>
      {mentionParts(comment.body, comment.mentions).map((part, index) =>
        typeof part === "string" ? (
          part
        ) : (
          <span key={index} className="pc-mention" title={`@${part.handle}`}>
            @{part.name}
          </span>
        ),
      )}
    </Tag>
  );
}
const PendingContext = createContext<PendingState>({
  keyOf: (id) => id,
  pending: () => false,
  gone: () => false,
});

/**
 * A comment's reactions, as chips: the emoji and how many, yours ringed. A chip toggles yours;
 * the + unfolds the whole set in its place (no popover for the list's scroll and fades to clip),
 * and a pick, a press elsewhere or Esc folds it back.
 *
 * In motion: chips squash when pressed and spring back; leaving one of yours pops its emoji and
 * bursts a few copies of it up out of the chip; counts roll; a chip that arrives springs in and
 * one that empties shrinks away; the set comes in one emoji after another. Reduced motion keeps
 * only fades.
 */
function Reactions({ comment, where }: { comment: Comment; where: "list" | "thread" }) {
  const state = useContext(ReactionsContext);
  const rowRef = useRef<HTMLDivElement>(null);
  const shown = state ? reactionsOf(comment, state.me) : [];
  const live = new Set(shown.map((r) => r.emoji));
  /* Chips that just emptied stay a moment to shrink away, where they were. */
  const [leaving, setLeaving] = useState<string[]>([]);
  const order = useRef<string[]>([]);
  const previous = useRef<Set<string> | null>(null);
  const keys = shown.map((r) => r.emoji).join(" ");
  useEffect(() => {
    const before = previous.current;
    previous.current = new Set(keys ? keys.split(" ") : []);
    if (!before) return;
    const gone = [...before].filter((emoji) => !previous.current!.has(emoji));
    if (gone.length) setLeaving((current) => [...current, ...gone.filter((e) => !current.includes(e))]);
  }, [keys]);
  /* Gone since the last render: shown leaving at once, before the effect above records it, so a
     chip never blinks out for a frame first. */
  const exiting = new Set([
    ...leaving,
    ...[...(previous.current ?? [])].filter((emoji) => !live.has(emoji)),
  ]);
  // Where each chip sits: the order they were first seen, so one leaving doesn't jump to the end.
  order.current = [
    ...order.current.filter((emoji) => live.has(emoji) || exiting.has(emoji)),
    ...shown.map((r) => r.emoji).filter((emoji) => !order.current.includes(emoji)),
  ];
  /** Chips present on the first render don't arrive; new ones after do (not the ones coming back
      as the set folds away). */
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);
  /* The full picker stays a moment after it's closed, to fade away. */
  const [pickerShown, setPickerShown] = useState(false);
  const key = `${where}:${comment.id}`;
  const more = state?.picking?.key === key && state.picking.more;
  useEffect(() => {
    if (more) setPickerShown(true);
  }, [more]);

  if (!state || (where === "list" && state.where !== "everywhere")) return null;
  const { set, me, picking, setPicking, react, emojiData } = state;
  const open = picking?.key === key;
  if (shown.length === 0 && exiting.size === 0 && me === null) return null;
  const byEmoji = new Map(shown.map((r) => [r.emoji, r]));
  const mine = new Set(shown.filter((r) => r.mine).map((r) => r.emoji));

  /** Yours, just left: the emoji pops and a few copies of it burst up from where it is. */
  const celebrate = (from: Element, emoji: string) => {
    if (reduced()) return;
    const root = rowRef.current?.closest(".pc-root");
    if (root) burst(root, from.getBoundingClientRect(), emoji);
  };
  /** A pick from the set or the picker: yours toggled, and everything folds away. */
  const pick = (emoji: string, from: Element) => {
    if (!mine.has(emoji)) {
      celebrate(from, emoji);
      remember(emoji);
    }
    react(comment, emoji);
    setPicking(null);
  };
  /** Focus left for somewhere that's neither the row nor its picker: fold it all away. */
  const leave = (next: EventTarget | null) => {
    const element = next instanceof Element ? next : null;
    if (rowRef.current?.contains(element) || element?.closest(".pc-emoji")) return;
    setPicking(null);
  };

  return (
    <div
      ref={rowRef}
      className="pc-reactions pc-row"
      data-open={open ? "" : undefined}
      onPointerDown={(event) => event.stopPropagation()}
      onBlur={(event) => {
        if (open) leave(event.relatedTarget);
      }}
    >
      {open ? (
        <ReactionSet
          set={set}
          mine={mine}
          more={more}
          onMore={() => setPicking({ key, more: !more })}
          onPick={pick}
        />
      ) : (
        <>
          {order.current.map((emoji) => {
            const r = byEmoji.get(emoji);
            return r ? (
              <ReactionChip
                key={emoji}
                emoji={emoji}
                count={r.count}
                mine={r.mine}
                disabled={me === null}
                arrive={mounted.current && !previous.current?.has(emoji)}
                onToggle={(chip) => {
                  if (!r.mine) celebrate(chip, emoji);
                  react(comment, emoji);
                }}
              />
            ) : exiting.has(emoji) ? (
              <LeavingChip
                key={emoji}
                emoji={emoji}
                onGone={() => setLeaving((current) => current.filter((e) => e !== emoji))}
              />
            ) : null;
          })}
          {me !== null && (
            <button
              type="button"
              className="pc-reaction pc-reaction-add pc-row"
              aria-label="Add a reaction"
              {...pressable()}
              onClick={() => setPicking({ key, more: false })}
            >
              <Glyph name="react" size={14} />
            </button>
          )}
        </>
      )}
      {(more || pickerShown) && rowRef.current && (
        <EmojiPicker
          anchor={rowRef.current}
          emojiData={emojiData}
          mine={mine}
          leaving={!more}
          onPick={pick}
          onBlur={leave}
          onGone={() => setPickerShown(false)}
        />
      )}
    </div>
  );
}

/** Squash on press, spring back on release: for any small button. Nothing with reduced motion. */
function pressable(depth = 0.9) {
  const release = (event: ReactPointerEvent<HTMLElement>) => {
    const element = event.currentTarget;
    if (element.dataset.pressed === undefined) return;
    delete element.dataset.pressed;
    if (!reduced()) to(element, { scale: "1" }, RELEASE);
  };
  return {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || reduced()) return;
      event.currentTarget.dataset.pressed = "";
      to(event.currentTarget, { scale: String(depth) }, PRESS_IN);
    },
    onPointerUp: release,
    onPointerLeave: release,
    onPointerCancel: release,
  };
}

function ReactionChip({
  emoji,
  count,
  mine,
  disabled,
  arrive,
  onToggle,
}: {
  emoji: string;
  count: number;
  mine: boolean;
  disabled: boolean;
  /** New since the row first showed: it springs in. */
  arrive: boolean;
  onToggle: (chip: HTMLElement) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const emojiRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const chip = ref.current;
    if (!arrive || !chip) return;
    if (reduced()) animate(chip, { opacity: [0, 1] }, { duration: 0.12 });
    else animate(chip, { scale: ["0.4", "1"], opacity: [0, 1] }, POP);
    // Only on arriving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Yours, just added: the emoji jumps and tilts, then settles.
  const wasMine = useRef(mine);
  useEffect(() => {
    const added = mine && !wasMine.current;
    wasMine.current = mine;
    const face = emojiRef.current;
    if (!added || !face || reduced()) return;
    animate(
      face,
      { scale: ["1", "1.45", "1"], rotate: ["0deg", "-14deg", "8deg", "0deg"] },
      { duration: 0.45, ease: EASE_OUT },
    );
  }, [mine]);
  return (
    <button
      ref={ref}
      type="button"
      className="pc-reaction pc-row"
      aria-pressed={mine}
      aria-label={`${emoji} ${count}${disabled ? "" : mine ? ", take yours back" : ", add yours"}`}
      disabled={disabled}
      {...(disabled ? {} : pressable())}
      onClick={(event) => onToggle(event.currentTarget)}
    >
      <span ref={emojiRef} className="pc-reaction-emoji">
        {emoji}
      </span>
      <Count value={count} />
    </button>
  );
}

/** A chip that just emptied, shrinking away where it was. */
function LeavingChip({ emoji, onGone }: { emoji: string; onGone: () => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const chip = ref.current;
    if (!chip) return onGone();
    const out = reduced()
      ? animate(chip, { opacity: [1, 0] }, { duration: 0.12 })
      : animate(chip, { scale: ["1", "0.6"], opacity: [1, 0] }, { duration: 0.14, ease: EASE_OUT });
    void out.then(onGone);
    // Once, as it starts leaving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <span ref={ref} aria-hidden="true" className="pc-reaction pc-row" data-leaving="">
      <span className="pc-reaction-emoji">{emoji}</span>
      <span className="pc-count">0</span>
    </span>
  );
}

/** A count that rolls: the old number slides out as the new one comes in, up as it grows. */
function Count({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const last = useRef(value);
  useLayoutEffect(() => {
    const was = last.current;
    last.current = value;
    const box = ref.current;
    if (was === value || !box || reduced()) return;
    const up = value > was;
    const ghost = document.createElement("span");
    ghost.className = "pc-count-ghost";
    ghost.setAttribute("aria-hidden", "true");
    ghost.textContent = String(was);
    box.append(ghost);
    const now = box.firstElementChild!;
    animate(now, { translate: [`0px ${up ? 9 : -9}px`, "0px 0px"], opacity: [0, 1] }, ROLL);
    void animate(
      ghost,
      { translate: ["0px 0px", `0px ${up ? -9 : 9}px`], opacity: [1, 0] },
      ROLL,
    ).then(() => ghost.remove());
  }, [value]);
  return (
    <span ref={ref} className="pc-count">
      <span>{value}</span>
    </span>
  );
}

/**
 * The whole set, unfolded in place of the chips: each emoji comes in just after the last, and
 * "···" at the end opens the full picker for any other.
 */
function ReactionSet({
  set,
  mine,
  more,
  onMore,
  onPick,
}: {
  set: string[];
  mine: Set<string>;
  /** Whether the full picker is open. */
  more: boolean;
  onMore: () => void;
  onPick: (emoji: string, from: HTMLElement) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { emojiData } = useContext(ReactionsContext)!;
  useEffect(() => {
    // Someone reacting may want more than these: the full picker's emoji start loading now.
    void Promise.resolve(defaultEmojiDataResolver("en", { emojibaseUrl: emojiData })).catch(() => {});
  }, [emojiData]);
  useLayoutEffect(() => {
    const items = [...(ref.current?.children ?? [])];
    // The first one takes focus, so the set is usable from the keyboard at once.
    (items[0] as HTMLElement | undefined)?.focus({ preventScroll: true });
    if (reduced()) {
      animate(ref.current!, { opacity: [0, 1] }, { duration: 0.12 });
      return;
    }
    animate(
      items,
      { opacity: [0, 1], scale: ["0.5", "1"], translate: ["0px 6px", "0px 0px"] },
      { ...POP, bounce: 0.4, visualDuration: 0.3, delay: stagger(0.025) },
    );
  }, []);
  const lift = finePointer()
    ? {
        onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => {
          if (!reduced()) to(event.currentTarget, { scale: "1.3", translate: "0px -3px" }, RELEASE);
        },
        onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => {
          if (!reduced()) to(event.currentTarget, { scale: "1", translate: "0px 0px" }, RELEASE);
        },
      }
    : {};
  return (
    <div ref={ref} className="pc-reaction-set pc-row" role="group" aria-label="React">
      {set.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className="pc-reaction-pick"
          aria-pressed={mine.has(emoji)}
          aria-label={mine.has(emoji) ? `Take back ${emoji}` : `React ${emoji}`}
          {...lift}
          onClick={(event) => onPick(emoji, event.currentTarget)}
        >
          {emoji}
        </button>
      ))}
      <button
        type="button"
        className="pc-reaction-pick pc-reaction-more"
        aria-label="More emoji"
        aria-expanded={more}
        aria-haspopup="dialog"
        {...pressable()}
        onClick={onMore}
      >
        <Glyph name="more" size={14} />
      </button>
    </div>
  );
}

/** Your last few picks, newest first, for the picker's Recent row. Only in this browser. */
const RECENT_KEY = "dogear:recent-emoji";
function recentEmoji(): string[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((e): e is string => cleanReaction(e) !== null).slice(0, 8) : [];
  } catch {
    return [];
  }
}
function remember(emoji: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([emoji, ...recentEmoji().filter((e) => e !== emoji)].slice(0, 8)));
  } catch {
    // Storage off (a private window, say): no Recent row, nothing else lost.
  }
}

/** Your reactions on the comment the picker is for, to ring them in the grid. */
const MineContext = createContext<Set<string>>(new Set());

/** The picker's list, in the layer's look: defined once, so typing a search doesn't remount it. */
const PICKER_PARTS: Partial<EmojiPickerListComponents> = {
  CategoryHeader: ({ category, ...props }) => (
    <div {...props} className="pc-emoji-label pc-emoji-header">
      {category.label}
    </div>
  ),
  Row: ({ children, ...props }) => (
    <div {...props} className="pc-emoji-row">
      {children}
    </div>
  ),
  Emoji: function PickerEmoji({ emoji, ...props }) {
    const mine = useContext(MineContext);
    return (
      <button {...props} className="pc-emoji-cell" aria-pressed={mine.has(emoji.emoji)}>
        {emoji.emoji}
      </button>
    );
  },
};

/** Emojibase's data on jsDelivr, at the major version the picker reads. */
const EMOJI_DATA = "https://cdn.jsdelivr.net/npm/emojibase-data@17";
const PICKER_WIDTH = 288;
const PICKER_HEIGHT = 340;

/**
 * Every emoji, searchable: a panel of its own over the layer, under the reactions row where there's
 * room and over it where there isn't, so the tray's scroll and fades never clip it. Recent picks
 * lead; the rude few are left out (`cleanReaction`). It loads its emoji when it first opens.
 */
function EmojiPicker({
  anchor,
  emojiData,
  mine,
  leaving,
  onPick,
  onBlur,
  onGone,
}: {
  anchor: HTMLElement;
  emojiData: string;
  mine: Set<string>;
  leaving: boolean;
  onPick: (emoji: string, from: Element) => void;
  onBlur: (next: EventTarget | null) => void;
  onGone: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number; width: number; height: number; below: boolean } | null>(null);
  const [query, setQuery] = useState("");
  const [recent] = useState(recentEmoji);
  /** Failed to load, and how many times it's been tried: a retry is a fresh load. */
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const resolve = useCallback<EmojiDataResolver>(
    async (locale, options) => {
      try {
        const data = await defaultEmojiDataResolver(locale, options);
        return { ...data, emojis: data.emojis.filter((e) => cleanReaction(e.emoji) !== null) };
      } catch (error) {
        if (!options.signal?.aborted) setFailed(true);
        throw error;
      }
    },
    // A new resolver is a new cache, so a retry doesn't get the failure back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attempt],
  );

  // Placed against the reactions row, and kept there as the list under it scrolls.
  useLayoutEffect(() => {
    const measure = () => {
      const box = anchor.getBoundingClientRect();
      const viewHeight = window.visualViewport?.height ?? innerHeight;
      const width = Math.min(PICKER_WIDTH, innerWidth - 16);
      // Inside the panel the row is in where it fits, as one more layer of it; else the screen.
      const panel = anchor.closest(".pc-dock-box, .pc-card")?.getBoundingClientRect();
      const inside = panel && panel.width >= width + 16 && panel.height >= 240;
      const [minX, maxX] = inside ? [panel.left + 8, panel.right - width - 8] : [8, innerWidth - width - 8];
      const minY = inside ? Math.max(8, panel.top + 8) : 8;
      const maxY = inside ? Math.min(viewHeight - 8, panel.bottom - 8) : viewHeight - 8;
      const height = Math.min(PICKER_HEIGHT, maxY - minY);
      // Under the row if it fits there, over it if it fits there, else wherever there's more room.
      const room = { under: maxY - box.bottom - 8, over: box.top - 8 - minY };
      const below = room.under >= height || (room.over < height && room.under >= room.over);
      const top = Math.min(Math.max(minY, below ? box.bottom + 8 : box.top - 8 - height), maxY - height);
      const left = Math.min(Math.max(minX, box.left - 4), maxX);
      setPlace({ left, top, width, height, below });
    };
    measure();
    addEventListener("resize", measure);
    addEventListener("scroll", measure, true);
    return () => {
      removeEventListener("resize", measure);
      removeEventListener("scroll", measure, true);
    };
  }, [anchor]);

  // In: up out of the row (or down onto it), with a little give. Out: a quick fade.
  const placed = place !== null;
  const below = place?.below ?? true;
  useLayoutEffect(() => {
    const panel = ref.current;
    if (!panel || !placed) return;
    if (leaving) {
      // Focus goes back to the "···" it came from, so the set stays usable from the keyboard.
      if (panel.contains((panel.getRootNode() as Document | ShadowRoot).activeElement)) {
        anchor.querySelector<HTMLElement>(".pc-reaction-more")?.focus({ preventScroll: true });
      }
      const out = reduced()
        ? animate(panel, { opacity: 0 }, { duration: 0.12 })
        : animate(panel, { opacity: 0, scale: "0.97" }, { duration: 0.12, ease: EASE_OUT });
      void out.then(onGone);
      return () => out.stop();
    }
    if (reduced()) animate(panel, { opacity: [0, 1] }, { duration: 0.12 });
    else {
      animate(
        panel,
        { opacity: [0, 1], scale: ["0.96", "1"], translate: [`0px ${below ? -8 : 8}px`, "0px 0px"] },
        { ...POP, bounce: 0.25 },
      );
    }
    // The search, ready to type in; on a touch screen the panel itself, so no keyboard jumps up.
    if (finePointer()) panel.querySelector<HTMLElement>("[frimousse-search]")?.focus({ preventScroll: true });
    else panel.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving, placed]);

  const root = anchor.closest(".pc-root");
  if (!root) return null;
  /** The emoji that was picked, on screen: where its burst starts. */
  const from = () =>
    ref.current?.querySelector("[frimousse-emoji][data-active]") ?? anchor.querySelector(".pc-reaction-more") ?? anchor;
  return createPortal(
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-label="Pick an emoji"
      className="pc-emoji pc-surface pc-fixed"
      data-leaving={leaving ? "" : undefined}
      style={{
        left: place?.left ?? 0,
        top: place?.top ?? 0,
        width: place?.width ?? PICKER_WIDTH,
        height: place?.height ?? PICKER_HEIGHT,
        visibility: place ? undefined : "hidden",
        transformOrigin: below ? "left top" : "left bottom",
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (!leaving && !(next instanceof Node && event.currentTarget.contains(next))) onBlur(next);
      }}
    >
      {failed ? (
        <div className="pc-emoji-state pc-col">
          <span>Couldn't load emoji</span>
          <button
            type="button"
            className="pc-emoji-retry"
            onClick={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </button>
        </div>
      ) : (
        <Frimousse.Root
          key={attempt}
          className="pc-emoji-root pc-col"
          columns={8}
          // Labels scroll with their emoji: a pinned one would be a second pane of glass over the
          // first, a dark band across the grid.
          sticky={false}
          emojibaseUrl={emojiData}
          resolveEmojiData={resolve}
          onEmojiSelect={({ emoji }) => onPick(emoji, from())}
        >
          <div className="pc-emoji-search pc-row">
            <Glyph name="search" size={16} />
            <Frimousse.Search
              className="pc-field pc-fill"
              placeholder="Search emoji"
              aria-label="Search emoji"
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </div>
          {recent.length > 0 && query === "" && (
            <div className="pc-emoji-recent pc-col">
              <span className="pc-emoji-label">Recent</span>
              <div className="pc-row">
                {recent.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="pc-emoji-cell"
                    aria-pressed={mine.has(emoji)}
                    aria-label={mine.has(emoji) ? `Take back ${emoji}` : `React ${emoji}`}
                    onClick={(event) => onPick(emoji, event.currentTarget)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Frimousse.Viewport className="pc-emoji-viewport pc-fill">
            <Frimousse.Loading className="pc-emoji-state">Loading…</Frimousse.Loading>
            <Frimousse.Empty className="pc-emoji-state">No emoji found</Frimousse.Empty>
            <MineContext.Provider value={mine}>
              <Frimousse.List className="pc-emoji-list" components={PICKER_PARTS} />
            </MineContext.Provider>
          </Frimousse.Viewport>
        </Frimousse.Root>
      )}
    </div>,
    root,
  );
}

/** A few copies of the emoji flying up and out from where it was left, then gone. */
function burst(root: Element, from: DOMRect, emoji: string) {
  const x = from.left + from.width / 2;
  const y = from.top + from.height / 2;
  for (let i = 0; i < 6; i++) {
    const bit = document.createElement("span");
    bit.className = "pc-burst";
    bit.setAttribute("aria-hidden", "true");
    bit.textContent = emoji;
    bit.style.left = `${x}px`;
    bit.style.top = `${y}px`;
    root.append(bit);
    // Upwards, across a 140° arc, each a little further or nearer.
    const angle = ((-90 + (Math.random() * 140 - 70)) * Math.PI) / 180;
    const distance = 18 + Math.random() * 16;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    void animate(
      bit,
      {
        translate: ["-50% -50%", `calc(-50% + ${dx.toFixed(1)}px) calc(-50% + ${dy.toFixed(1)}px)`],
        scale: ["1", "0.4"],
        opacity: [1, 0],
      },
      { duration: 0.55, ease: EASE_OUT, delay: i * 0.015 },
    ).then(() => bit.remove());
  }
}

/** Photo, first name and time, then the text: shared by the preview and threads. */
function CommentRow({
  comment,
  actions,
  children,
  layout = "thread",
}: {
  comment: Comment;
  actions?: ReactNode;
  /** Replaces the body, for editing in place. */
  children?: ReactNode;
  layout?: "thread" | "preview";
}) {
  const name = (
    <Byline
      author={comment.author}
      time={ago(comment.createdAt) + (comment.editedAt !== null ? " · edited" : "")}
    />
  );
  if (layout === "preview") {
    return (
      <div className="pc-row" style={{ alignItems: "flex-start", gap: 8 }}>
        <Avatar author={comment.author} />
        <div className="pc-col pc-fill">
          {name}
          <Body comment={comment} className="pc-clamp pc-body" />
        </div>
      </div>
    );
  }
  return (
    <div className="pc-col">
      {/* 28px tall whether or not there is a menu, so rows with and without one line up. */}
      <div className="pc-row pc-comment-head">
        <Avatar author={comment.author} />
        <div className="pc-fill">{name}</div>
        {actions}
      </div>
      {/* 32 = the 24px photo and its 8px gap, so the text starts under the name. */}
      {children ? (
        <div style={{ marginTop: 4, paddingLeft: 32 }}>{children}</div>
      ) : (
        <>
          <Body comment={comment} className="pc-comment-body pc-body" />
          {comment.author.agent && comment.parentId !== null && (
            <span className="pc-ai-note">Answered by AI</span>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Hovering a pin. The card grows out of the pin's tail, so it reads as the pin opening rather
 * than a tooltip beside it. Hover holds it open, a click opens the thread.
 */
function Preview({
  comment,
  box,
  onHover,
  onOpen,
}: {
  comment: Comment;
  box: Box;
  onHover: (hovering: boolean) => void;
  onOpen: () => void;
}) {
  const left = Math.min(box.x, window.innerWidth - PREVIEW_WIDTH - 16);
  const nearTop = box.y < 120;
  return (
    <div
      aria-hidden="true"
      className="pc-card pc-fixed pc-surface pc-preview"
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onOpen}
      style={{
        left,
        width: PREVIEW_WIDTH,
        ...(nearTop ? { top: box.y } : { bottom: window.innerHeight - box.y }),
        transformOrigin: nearTop ? "top left" : "bottom left",
        borderRadius: nearTop
          ? "0 var(--_radius) var(--_radius) var(--_radius)"
          : "var(--_radius) var(--_radius) var(--_radius) 0",
      }}
    >
      <CommentRow comment={comment} layout="preview" />
    </div>
  );
}

/** A footer action as a command palette writes one: its label and its key, faint until it can run. */
function KeyAction({
  label,
  keyLabel,
  ready,
  onClick,
}: {
  label: string;
  keyLabel: string;
  ready: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="pc-key-action"
      data-ready={ready ? "" : undefined}
      aria-disabled={!ready}
      onClick={() => ready && onClick()}
    >
      {label}
      <kbd className="pc-kbd">{keyLabel}</kbd>
    </button>
  );
}

/**
 * A field, as a command palette has one: no box, an input row (a leading icon, then the text)
 * and a footer with its action and key. The row grows to six lines, then scrolls.
 *
 * Enter sends and Shift+Enter breaks the line. Esc leaves: the edit only, when `onCancel` is
 * given, and the layer's own Esc otherwise. Standalone it is a panel of its own; `flat` is a field
 * inside a card, on a faint fill. `between` sits between the row and the footer (the name step's
 * avatars); `lead` replaces the icon (a reply leads with your photo). `focus: false` leaves the
 * caret out until it's tapped.
 */
function ComposeBox({
  placeholder,
  onSubmit,
  initial = "",
  submitLabel = "Post",
  onCancel,
  onChange,
  flat = false,
  between,
  lead,
  focus = true,
}: {
  focus?: boolean;
  placeholder: string;
  onSubmit: (body: string) => Promise<unknown>;
  initial?: string;
  submitLabel?: string;
  onCancel?: () => void;
  /** Every keystroke's text, for whatever shows it as it's typed. */
  onChange?: (body: string) => void;
  flat?: boolean;
  between?: ReactNode;
  lead?: ReactNode;
}) {
  const [body, setBodyState] = useState(initial);
  const setBody = (next: string) => {
    setBodyState(next);
    onChange?.(next);
  };
  const [sending, setSending] = useState(false);
  const editing = onCancel !== undefined;
  const ready = body.trim().length > 0 && !sending;
  const send = async () => {
    if (!ready) return;
    setSending(true);
    try {
      if ((await onSubmit(body)) !== false && !editing) setBody("");
    } finally {
      setSending(false);
    }
  };
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const mention = useMentionPicker(body, fieldRef, setBody);
  // Focus on mount, with the caret after any text an edit opens with.
  useEffect(() => {
    const field = fieldRef.current;
    if (!field || !focus) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }, []);
  // One 20px line until there is more, then up to six, then it scrolls.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, FIELD_LINE * FIELD_MAX_ROWS)}px`;
  }, [body]);
  return (
    <div className="pc-compose pc-col" data-flat={flat ? "" : undefined}>
      <div className="pc-compose-row pc-row">
        <span className="pc-compose-lead">{lead ?? <Glyph name="field" />}</span>
        <textarea
          ref={fieldRef}
          className="pc-field pc-fill"
          value={body}
          placeholder={placeholder}
          rows={1}
          aria-label={placeholder}
          enterKeyHint="send"
          aria-autocomplete={mention.on ? "list" : undefined}
          aria-expanded={mention.on ? mention.matches.length > 0 : undefined}
          onChange={(event) => {
            setBody(event.currentTarget.value);
            mention.track();
          }}
          onSelect={mention.track}
          onKeyDown={(event) => {
            if (mention.key(event)) return;
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
            if (event.key === "Escape" && onCancel) {
              // Only the edit: the layer's own Esc (on `document`) would close the thread too.
              event.nativeEvent.stopPropagation();
              onCancel();
            }
          }}
        />
      </div>
      {mention.list}
      {between}
      <div className="pc-compose-foot pc-row">
        {onCancel && <KeyAction label="Cancel" keyLabel="Esc" ready onClick={onCancel} />}
        <KeyAction label={submitLabel} keyLabel="⏎" ready={ready} onClick={() => void send()} />
      </div>
    </div>
  );
}

/**
 * The `@` list in a compose box. Typing @ (after a space or at the start) lists the people who
 * match what follows, by name or handle; ↑/↓ move, Enter or Tab puts `@handle ` in the text, Esc
 * closes it. Off when there's nobody to mention.
 */
function useMentionPicker(
  body: string,
  fieldRef: RefObject<HTMLTextAreaElement | null>,
  setBody: (next: string) => void,
) {
  const people = useContext(PeopleContext);
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  /** The @ that Esc closed, so it stays closed until the text around it changes. */
  const [closed, setClosed] = useState<string | null>(null);
  const before = body.slice(0, caret);
  const typed = people.length ? /(^|[^\w@.])@([\w.-]*)$/.exec(before) : null;
  const query = typed ? { text: typed[2].toLowerCase(), start: before.length - typed[2].length - 1 } : null;
  const key = query ? `${query.start}:${query.text}` : null;
  const matches =
    query && key !== closed
      ? people
          .filter((p) => p.handle.toLowerCase().includes(query.text) || p.name.toLowerCase().includes(query.text))
          // Whoever starts with it first.
          .sort((a, b) => Number(!startsWith(a, query.text)) - Number(!startsWith(b, query.text)))
          .slice(0, 6)
      : [];
  const at = Math.min(active, Math.max(0, matches.length - 1));
  useEffect(() => setActive(0), [key]);
  /* Where the caret goes once a pick is in the text: set before the browser handles another key,
     so typing straight on lands after the name, not before it. */
  const placeAt = useRef<number | null>(null);
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (placeAt.current === null || !field) return;
    field.focus();
    field.setSelectionRange(placeAt.current, placeAt.current);
    placeAt.current = null;
  }, [body]);

  const track = () => setCaret(fieldRef.current?.selectionStart ?? 0);
  const choose = (person: Person) => {
    if (!query) return;
    const insert = `@${person.handle} `;
    const next = body.slice(0, query.start) + insert + body.slice(caret);
    const end = query.start + insert.length;
    placeAt.current = end;
    setBody(next);
    setCaret(end);
  };
  /** The list's keys, before the field's own. True when it took the key. */
  const onKey = (event: ReactKeyboardEvent) => {
    if (matches.length === 0) return false;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const by = event.key === "ArrowDown" ? 1 : -1;
      setActive((at + by + matches.length) % matches.length);
    } else if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
      choose(matches[at]);
    } else if (event.key === "Escape") {
      // Closes the list only: the layer's Esc (on `document`) would close the card too.
      event.nativeEvent.stopPropagation();
      setClosed(key);
    } else {
      return false;
    }
    event.preventDefault();
    return true;
  };
  const list =
    matches.length > 0 ? (
      <div className="pc-mentions pc-col" role="listbox" aria-label="People to mention">
        {matches.map((person, index) => (
          <button
            key={person.id}
            type="button"
            role="option"
            aria-selected={index === at}
            data-active={index === at ? "" : undefined}
            className="pc-mention-row pc-row"
            // Keep the caret in the field.
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => choose(person)}
          >
            <Avatar author={person} />
            <span className="pc-mention-name">{person.name}</span>
            <span className="pc-mention-handle">@{person.handle}</span>
          </button>
        ))}
      </div>
    ) : null;
  return { on: people.length > 0, matches, track, key: onKey, list };
}

const startsWith = (person: Person, text: string) =>
  person.handle.toLowerCase().startsWith(text) || person.name.toLowerCase().startsWith(text);

/**
 * Where a card sits beside its pin: 16px to the right (the left, near the right edge). The
 * composer's pill centres on the pin; a thread's top lines up with it. In the lower half of the
 * screen both hang upward instead. `origin` is the corner nearest the pin, for the entrance.
 */
function cardPosition(box: Box, align: "center" | "top", edge = window.innerWidth) {
  if (narrow()) return SHEET;
  const right = box.x + Math.max(box.w, PIN) + GAP;
  const flipX = right + CARD_WIDTH > edge - 16;
  const left = flipX ? Math.max(16, box.x - CARD_WIDTH - GAP) : right;
  const flipY = box.y > window.innerHeight / 2;
  const pinMid = box.y - PIN / 2;
  const origin = `${flipY ? "bottom" : "top"} ${flipX ? "right" : "left"}`;
  /* Never taller than the room on its side, 16px clear of the edge: a short screen (a phone on its
     side) would otherwise push a long thread off the top. Its comments scroll instead. */
  if (flipY) {
    const bottomEdge = align === "center" ? pinMid + 20 : box.y;
    const bottom = Math.max(16, window.innerHeight - bottomEdge);
    return { left, bottom, maxHeight: window.innerHeight - bottom - 16, origin };
  }
  const topEdge = align === "center" ? pinMid - 20 : box.y - PIN;
  const top = Math.max(16, topEdge);
  return { left, top, maxHeight: window.innerHeight - top - 16, origin };
}

function Composer({
  box,
  placeholder,
  submitLabel,
  leaving = false,
  onSubmit,
  initial,
  children,
}: {
  box: Box;
  placeholder?: string;
  submitLabel?: string;
  /** Text it opens with: a comment that was turned away, to change and send again. */
  initial?: string;
  /** Posted: folding into its pin, toward the corner nearest it. */
  leaving?: boolean;
  onSubmit?: (body: string) => Promise<unknown>;
  /** In place of the compose box, e.g. the name step. */
  children?: ReactNode;
}) {
  const { origin, ...position } = cardPosition(box, "center");
  return (
    <div
      data-leaving={leaving ? "" : undefined}
      data-sheet={narrow() ? "" : undefined}
      className="pc-card pc-fixed"
      style={{ width: CARD_WIDTH, transformOrigin: origin, ...position }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {children ?? (
        <ComposeBox placeholder={placeholder!} submitLabel={submitLabel} initial={initial} onSubmit={onSubmit!} />
      )}
    </div>
  );
}

/**
 * The avatars to pick from, as a radio group: each shows the initials of `name` as it's typed, the
 * pick is ringed, and arrow keys move it.
 */
function AvatarPicker({
  value,
  name,
  onChange,
}: {
  value?: string;
  name: string;
  onChange: (key: string) => void;
}) {
  const avatars = useContext(AvatarsContext);
  const keys = Object.keys(avatars);
  const group = useRef<HTMLDivElement>(null);
  const pick = (index: number) => {
    const next = keys[(index + keys.length) % keys.length];
    onChange(next);
    group.current?.querySelector<HTMLElement>(`[data-key="${next}"]`)?.focus();
  };
  const letters = name.trim() ? initials(name.trim()) : "";
  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label="Your avatar"
      className="pc-swatches pc-row"
      onKeyDown={(event) => {
        const at = keys.indexOf(value ?? "");
        if (event.key === "ArrowRight" || event.key === "ArrowDown") pick(at + 1);
        else if (event.key === "ArrowLeft" || event.key === "ArrowUp") pick(at - 1);
        else return;
        event.preventDefault();
      }}
    >
      {keys.map((key, index) => (
        <button
          key={key}
          type="button"
          role="radio"
          data-key={key}
          aria-checked={key === value}
          aria-label={`Avatar ${index + 1} of ${keys.length}`}
          tabIndex={key === value ? 0 : -1}
          className="pc-swatch"
          style={{ background: avatars[key] }}
          onClick={() => onChange(key)}
        >
          {letters}
        </button>
      ))}
    </div>
  );
}

/** The first of the page's avatars: everyone starts on the same one, and changes it if they like. */
function useFirstAvatar() {
  const keys = Object.keys(useContext(AvatarsContext));
  return useState<string | undefined>(keys[0]);
}

/**
 * The name step's avatar: one large circle in the pick, with the initials as they're typed, and
 * arrows either side that step through the page's avatars (round, and ←/→ on either arrow). Each
 * new pick fades in over the last; the initials stay where they are.
 */
function AvatarStage({
  value,
  name,
  onChange,
  checking = false,
  avatarRef,
}: {
  value?: string;
  name: string;
  onChange: (key: string) => void;
  /** The name is being checked: the arrows step back and a ring turns around the avatar. */
  checking?: boolean;
  avatarRef?: RefObject<HTMLSpanElement | null>;
}) {
  const avatars = useContext(AvatarsContext);
  const keys = Object.keys(avatars);
  const at = Math.max(0, keys.indexOf(value ?? ""));
  /** The pick being faded over, until the new one is in. */
  const [under, setUnder] = useState<string | null>(null);
  const step = (by: number) => {
    const next = keys[(at + by + keys.length) % keys.length];
    if (next === value || checking) return;
    setUnder(value ?? null);
    onChange(next);
  };
  const letters = name.trim() ? initials(name.trim()) : "";
  return (
    <div
      className="pc-stage pc-row"
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") step(-1);
        else if (event.key === "ArrowRight") step(1);
        else return;
        event.preventDefault();
      }}
    >
      <IconAction label="Previous avatar" icon={<Glyph name="prev" />} onClick={() => step(-1)} />
      <span aria-hidden="true" className="pc-stage-hold">
      {/* The avatar's own colours, as a turning arc around it while the name is checked. */}
      <span className="pc-stage-ring" style={value ? { background: avatars[value] } : undefined} />
      <span ref={avatarRef} className="pc-stage-avatar">
        {under && <span className="pc-stage-layer" style={{ background: avatars[under] }} />}
        {value && (
          <span
            key={value}
            className="pc-stage-layer"
            data-in={under ? "" : undefined}
            style={{ background: avatars[value] }}
            onAnimationEnd={() => setUnder(null)}
          />
        )}
        <span className="pc-stage-initials">{letters}</span>
      </span>
      </span>
      <IconAction label="Next avatar" icon={<Glyph name="next" />} onClick={() => step(1)} />
      <span className="pc-hidden" aria-live="polite">
        Avatar {at + 1} of {keys.length}
      </span>
    </div>
  );
}

/**
 * The name step inside a comment or a reply, for pages that don't ask first (`joinFirst`): the
 * name field, with the page's avatars between it and Continue.
 */
function JoinBox({
  placeholder,
  flat = false,
  focus = true,
  onJoin,
}: {
  placeholder: string;
  flat?: boolean;
  focus?: boolean;
  onJoin: (name: string, tint?: string) => Promise<boolean>;
}) {
  const [tint, setTint] = useFirstAvatar();
  const [name, setName] = useState("");
  const offered = Object.keys(useContext(AvatarsContext)).length > 0;
  return (
    <ComposeBox
      flat={flat}
      focus={focus}
      placeholder={placeholder}
      submitLabel="Continue"
      onChange={setName}
      onSubmit={(value) => onJoin(value, tint)}
      between={
        offered && (
          <div className="pc-well pc-col">
            <AvatarPicker value={tint} name={name} onChange={setTint} />
          </div>
        )
      }
    />
  );
}

type DockState = "closed" | "open" | "placing" | "join";

/**
 * The tray layout's one control, in four shapes. Closed, it is a pill: "Leave a comment" and its
 * key. Open, the same pill is the footer of a panel that has grown up and to the left out of it,
 * with every thread above: this page's first, then other pages', each newest first. Placing, it
 * says how to place one. Joining (`joinFirst`, a guest who hasn't given a name), the panel asks
 * for an avatar and a name first, and the pill becomes the Continue button inside it; once they've
 * joined, the name step fades out where it is while the list fades in. The footer never moves,
 * so the panel reads as the pill opening.
 *
 * The box's width and height are set from measurements and transition between them, so a change
 * of mind mid-way reverses from where it is. The list stays mounted while the box closes, fading,
 * and the box shrinks around it from the top left.
 */
function Dock({
  state,
  freshId,
  here,
  elsewhere,
  threadOpen,
  shortcut,
  pick,
  showResolved,
  onShowResolved,
  onShow,
  onGo,
  onOpen,
  onPlace,
  onCancel,
  onClose,
  onJoin,
  mentionCount = 0,
  mentionsOnly = false,
  onMentionsOnly,
}: {
  state: DockState;
  /** The thread you just posted: its row arrives with a highlight that fades. */
  freshId: string | null;
  here: ThreadSummary[];
  elsewhere: { path: string; threads: ThreadSummary[] }[];
  /** A thread card is open, which on a narrow screen the panel makes way for. */
  threadOpen: boolean;
  shortcut?: string;
  /** What the placing hint says: pins only, or pins and areas. */
  pick: "element" | "pin";
  /** undefined: no resolving, so no switch. */
  showResolved?: boolean;
  onShowResolved: (show: boolean) => void;
  onShow: (root: Comment) => void;
  onGo: (root: Comment) => void;
  onOpen: () => void;
  onPlace: () => void;
  onCancel: () => void;
  onClose: () => void;
  onJoin: (name: string, tint?: string, welcome?: () => Promise<void>) => Promise<boolean>;
  /** Mentions of you not seen yet: a badge on the pill and on the filter. */
  mentionCount?: number;
  /** Whether the list is narrowed to threads that mention you. */
  mentionsOnly?: boolean;
  /** Absent when nothing mentions you: no filter. */
  onMentionsOnly?: (on: boolean) => void;
}) {
  /** Whether the panel is out: the list, or the name step before it. */
  const open = state === "open" || state === "join";
  /** Which panel: kept while the box closes, so what's leaving is what was there. */
  const [kind, setKind] = useState<"list" | "join">(state === "join" ? "join" : "list");
  /** Just joined: the name step stays a moment, fading out over the list as it fades in. */
  const [fading, setFading] = useState(false);
  if (open && kind !== (state === "join" ? "join" : "list")) {
    setKind(state === "join" ? "join" : "list");
    setFading(kind === "join");
  }
  useEffect(() => {
    if (!fading) return;
    const timer = window.setTimeout(() => setFading(false), DOCK_FADE_MS);
    return () => window.clearTimeout(timer);
  }, [fading]);
  const [name, setName] = useState("");
  const [tint, setTint] = useFirstAvatar();
  const [joining, setJoining] = useState(false);
  const canJoin = name.trim().length > 0 && !joining;
  /* The name is being checked (moderation can take a few seconds): after a beat, so a quick answer
     never flashes it, the avatar says hi while it waits. */
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (!joining) return setChecking(false);
    const timer = window.setTimeout(() => setChecking(true), CHECK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [joining]);
  const avatarRef = useRef<HTMLSpanElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const join = async () => {
    if (!canJoin) return;
    setJoining(true);
    let joined = false;
    try {
      joined = await onJoin(name, tint, () => hello(avatarRef.current));
    } finally {
      setJoining(false);
    }
    if (!joined) {
      // A small head-shake, and the name back to change.
      shake(avatarRef.current);
      window.setTimeout(() => nameRef.current?.focus(), 0);
    }
  };
  const { keyOf } = useContext(PendingContext);
  const offered = Object.keys(useContext(AvatarsContext)).length > 0;
  /** Whether the list is mounted: from opening until the box has finished closing. */
  const [shown, setShown] = useState(open);
  /** Bumped on every opening, so the list plays its entrance again even if it never unmounted. */
  const [opening, setOpening] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setShown(true);
      setOpening((n) => n + 1);
    }
  }
  useEffect(() => {
    if (open || !shown) return;
    const timer = window.setTimeout(() => setShown(false), DOCK_UNMOUNT_MS);
    return () => window.clearTimeout(timer);
  }, [open, shown]);
  /* Closing with focus inside the panel (the name field, a row) hands it to the pill the panel
     closes into, rather than leave it in something fading out, where a key would still type. */
  useEffect(() => {
    if (open) return;
    const root = boxRef.current?.getRootNode() as ShadowRoot | undefined;
    if (root?.activeElement && bodyRef.current?.contains(root.activeElement)) {
      footRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  const boxRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const footRef = useRef<HTMLButtonElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  /** The open width: the panel's, or the screen's less 8px a side on a narrow one. */
  const [openWidth, setOpenWidth] = useState(DOCK_WIDTH);
  /* Measured, not laid out: the box's own size is what animates, so it can't also be what decides
     it. Closed, the label and its padding; open, the list (capped by its max-height) and the foot. */
  useLayoutEffect(() => {
    const measure = () => {
      const label = labelRef.current;
      if (!label) return;
      // Narrow, the dock spans the screen between its insets (8px, plus any safe area), so its own
      // width is the panel's; innerWidth would also count a scrollbar and the notch.
      const wide = narrow()
        ? (boxRef.current?.parentElement?.clientWidth ?? window.innerWidth - 16)
        : DOCK_WIDTH;
      setOpenWidth(wide);
      const next = open
        ? {
            width: wide,
            height:
              (bodyRef.current?.offsetHeight ?? 0) + DOCK_FOOT + (state === "join" ? DOCK_INSET : 0),
          }
        : { width: Math.ceil(label.offsetWidth) + DOCK_PAD * 2, height: DOCK_FOOT };
      setSize((current) =>
        current && current.width === next.width && current.height === next.height ? current : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (labelRef.current) observer.observe(labelRef.current);
    if (bodyRef.current) observer.observe(bodyRef.current);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [open, shown, state, opening]);
  /* The first size is set without a transition, so the pill doesn't grow in from nothing when the
     page loads. */
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!size || ready) return;
    const raf = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(raf);
  }, [size, ready]);

  /* Rows that move while the list is open (one arrives above them, or one goes) slide from where
     they were rather than jump: FLIP, from each row's last top to its new one. */
  const tops = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return void tops.current.clear();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<string, number>();
    for (const row of body.querySelectorAll<HTMLElement>("li[data-id]")) {
      const top = row.offsetTop;
      next.set(row.dataset.id!, top);
      const was = tops.current.get(row.dataset.id!);
      if (was !== undefined && was !== top && !reduce) {
        row.animate([{ transform: `translateY(${was - top}px)` }, { transform: "none" }], {
          duration: 220,
          easing: "cubic-bezier(0.645, 0.045, 0.355, 1)",
        });
      }
    }
    tops.current = next;
  });
  useEffect(() => tops.current.clear(), [opening]);

  const others = elsewhere
    .flatMap((group) => group.threads.map((thread) => ({ ...thread, path: group.path })))
    .sort(newestFirst);
  const empty = here.length === 0 && others.length === 0;
  const placing = state === "placing";
  const asking = state === "join";
  // Nothing to press while the name is being checked.
  const key = placing ? "Esc" : asking ? (checking ? undefined : "⏎") : shortcut?.toUpperCase();
  let row = 0;
  /** Each row a beat after the one above, for the first six. */
  const stagger = () => ({ animationDelay: `${80 + Math.min(row++, 6) * 20}ms` });

  return (
    <div
      ref={boxRef}
      className="pc-dock-box pc-surface"
      data-state={state}
      data-ready={ready ? "" : undefined}
      data-thread={threadOpen ? "" : undefined}
      style={size ? { width: size.width, height: size.height } : undefined}
      onPointerDown={(event) => event.stopPropagation()}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && event.propertyName === "height" && !open) {
          setShown(false);
        }
      }}
    >
      <div
        className="pc-dock-inner pc-col"
        style={{ width: shown ? openWidth : undefined }}
      >
        {shown && (kind === "join" || fading) && (
          <div
            key={`join-${opening}`}
            ref={kind === "join" ? bodyRef : undefined}
            role="dialog"
            aria-label="Your avatar and name"
            className="pc-dock-body pc-col pc-join"
            data-checking={checking ? "" : undefined}
            data-leaving={open && !fading ? undefined : ""}
            data-fading={fading ? "" : undefined}
          >
            <span className="pc-join-close">
              <IconAction label="Close" icon={<Glyph name="close" />} onClick={onClose} />
            </span>
            {offered && (
              <AvatarStage
                value={tint}
                name={name}
                onChange={setTint}
                checking={checking}
                avatarRef={avatarRef}
              />
            )}
            <input
              ref={nameRef}
              autoFocus
              readOnly={joining}
              className="pc-field pc-join-name"
              value={name}
              maxLength={40}
              placeholder="Your name"
              aria-label="Your name, shown with your comments"
              enterKeyHint="go"
              autoComplete="nickname"
              autoCapitalize="words"
              onChange={(event) => setName(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void join();
                }
              }}
            />
            <span className="pc-hidden" aria-live="polite">
              {checking ? "Checking your name" : ""}
            </span>
          </div>
        )}
        {shown && kind === "list" && (
          <div
            key={`list-${opening}`}
            ref={bodyRef}
            role="dialog"
            aria-label="Comments"
            className="pc-dock-body pc-col"
            data-leaving={open ? undefined : ""}
          >
            <div className="pc-head pc-row">
              <span className="pc-title pc-fill">{mentionsOnly ? "Mentions" : "Comments"}</span>
              {onMentionsOnly && (
                <button
                  type="button"
                  className="pc-mentions-filter pc-row"
                  aria-pressed={mentionsOnly}
                  title={mentionsOnly ? "All comments" : "Mentions of you"}
                  aria-label={
                    mentionsOnly
                      ? "Show all comments"
                      : `Show mentions of you${mentionCount ? `, ${mentionCount} unread` : ""}`
                  }
                  onClick={() => onMentionsOnly(!mentionsOnly)}
                >
                  @{mentionCount > 0 && <span className="pc-mentions-count">{mentionCount}</span>}
                </button>
              )}
              {showResolved !== undefined && (
                <label className="pc-switch" style={{ color: "var(--_muted)" }}>
                  <input
                    type="checkbox"
                    checked={showResolved}
                    onChange={(event) => onShowResolved(event.currentTarget.checked)}
                  />
                  Resolved
                </label>
              )}
              <IconAction
                label="Close comments"
                icon={<Glyph name="close" />}
                onClick={(event) => {
                  // From the keyboard, focus goes back to the pill it closes into; a click leaves it.
                  const keyboard = event.currentTarget.matches(":focus-visible");
                  onClose();
                  if (keyboard) footRef.current?.focus();
                }}
              />
            </div>
            <ul className="pc-tray-list pc-col">
              {empty && (
                <li className="pc-tray-empty pc-dock-row" style={stagger()}>
                  {mentionsOnly
                    ? "Nothing mentions you."
                    : `${showResolved === false ? "No open comments." : "No comments yet."} Leave the first one on anything here.`}
                </li>
              )}
              {here.map((thread) => (
                <TrayRow
                  key={keyOf(thread.root.id)}
                  thread={thread}
                  resolving={showResolved !== undefined}
                  fresh={thread.root.id === freshId}
                  style={stagger()}
                  onPick={onShow}
                />
              ))}
              {others.map((thread) => (
                <TrayRow
                  key={keyOf(thread.root.id)}
                  thread={thread}
                  path={thread.path}
                  resolving={showResolved !== undefined}
                  fresh={thread.root.id === freshId}
                  style={stagger()}
                  onPick={onGo}
                />
              ))}
            </ul>
          </div>
        )}
        <button
          ref={footRef}
          type="button"
          className="pc-dock-foot pc-row"
          data-waiting={asking && !canJoin && !joining ? "" : undefined}
          aria-busy={asking && checking ? true : undefined}
          aria-expanded={state === "closed" ? false : open ? true : undefined}
          onClick={
            state === "closed" ? onOpen : asking ? () => void join() : open ? onPlace : onCancel
          }
        >
          <span
            ref={labelRef}
            key={placing ? "place" : asking ? (checking ? "hi" : "join") : "leave"}
            className="pc-dock-label pc-row"
          >
            <span>
              {placing
                ? coarse()
                  ? "Tap anywhere to comment"
                  : pick === "pin"
                    ? "Click anywhere to comment"
                    : "Click to pin, drag to mark an area"
                : asking
                  ? checking
                    ? "Saying hi"
                    : "Continue"
                  : "Leave a comment"}
              {asking && checking && (
                <span aria-hidden="true" className="pc-dots">
                  <i />
                  <i />
                  <i />
                </span>
              )}
            </span>
            {/* No Esc on a touch screen: the pill itself is how you stop. */}
            {placing && coarse() && <span className="pc-dock-cancel">Cancel</span>}
            {state === "closed" && mentionCount > 0 && (
              <span
                className="pc-mentions-badge"
                aria-label={`${mentionCount} unread mention${mentionCount === 1 ? "" : "s"}`}
              >
                @{mentionCount}
              </span>
            )}
            {key && <kbd className="pc-kbd">{key}</kbd>}
          </span>
        </button>
      </div>
    </div>
  );
}

/** How often the dock reads every page's comments, for its count, while its list is closed. */
const ALL_EVERY_MS = 30_000;

/** The dock layout's three shapes: a round button, a row of controls, the list. */
export type DockFace = "icon" | "tray" | "panel";

/** Which corner the dock hangs from, and how far it sits from that corner's two edges. */
type Spot = { h: "left" | "right"; v: "top" | "bottom"; dx: number; dy: number };

const SPOT_KEY = "dogear:dock";
/** The button's diameter and the row's height. */
const FLOAT_SIZE = 40;
/** The closest the dock comes to an edge of the window. */
const FLOAT_EDGE = 8;
const FLOAT_PANEL_WIDTH = 320;
const FLOAT_PANEL_HEIGHT = 480;

/** Where it starts: the page's `--dogear-right` and `--dogear-bottom`, else 24px in from the corner. */
function defaultSpot(): Spot {
  const style = getComputedStyle(document.documentElement);
  const at = (name: string) => {
    const value = parseFloat(style.getPropertyValue(name));
    return Number.isFinite(value) ? value : 24;
  };
  return { h: "right", v: "bottom", dx: at("--dogear-right"), dy: at("--dogear-bottom") };
}

function storedSpot(): Spot {
  try {
    const spot = JSON.parse(localStorage.getItem(SPOT_KEY) ?? "null");
    if (
      (spot?.h === "left" || spot?.h === "right") &&
      (spot?.v === "top" || spot?.v === "bottom") &&
      Number.isFinite(spot.dx) &&
      Number.isFinite(spot.dy)
    ) {
      return spot as Spot;
    }
  } catch {
    // Per-viewer convenience: a locked-down browser gets the default.
  }
  return defaultSpot();
}

/** Keeps a `w`×`h` dock at least FLOAT_EDGE inside the window. */
function clampSpot(spot: Spot, w: number, h: number): Spot {
  const dx = Math.max(FLOAT_EDGE, Math.min(window.innerWidth - w - FLOAT_EDGE, spot.dx));
  const dy = Math.max(FLOAT_EDGE, Math.min(window.innerHeight - h - FLOAT_EDGE, spot.dy));
  return dx === spot.dx && dy === spot.dy ? spot : { ...spot, dx, dy };
}

/** The same box, hung from the corner nearest its centre: nothing moves, but it next grows the other way. */
function reanchor(rect: DOMRect): Spot {
  const h = rect.left + rect.width / 2 > window.innerWidth / 2 ? "right" : "left";
  const v = rect.top + rect.height / 2 > window.innerHeight / 2 ? "bottom" : "top";
  return {
    h,
    v,
    dx: h === "left" ? rect.left : window.innerWidth - rect.right,
    dy: v === "top" ? rect.top : window.innerHeight - rect.bottom,
  };
}

/**
 * The dock layout's one control, which the visitor can drag anywhere: a round button that opens
 * into a row of controls (add, show or hide the pins, the list), whose list button opens the row
 * into the list of every thread. Esc, or ✕, closes it a step at a time (the layer owns that).
 * It grows away from the nearest edges: its place is kept as a distance from the corner it's
 * nearest, so on the right half of the screen it opens leftward, and on the bottom half, upward.
 */
function Floater({
  face,
  onFace,
  openCount,
  here,
  elsewhere,
  pinsShown,
  onPinsShown,
  placing,
  onPlacing,
  pick,
  showResolved,
  onShowResolved,
  mentionCount,
  mentionsOnly,
  onMentionsOnly,
  freshId,
  onShow,
  onGo,
}: {
  face: DockFace;
  onFace: (face: DockFace) => void;
  /** Open threads on every page. */
  openCount: number;
  here: ThreadSummary[];
  elsewhere: { path: string; threads: ThreadSummary[] }[];
  pinsShown: boolean;
  onPinsShown: (shown: boolean) => void;
  placing: boolean;
  onPlacing: (placing: boolean) => void;
  pick: "element" | "pin";
  /** undefined: no resolving, so no switch. */
  showResolved?: boolean;
  onShowResolved: (show: boolean) => void;
  mentionCount: number;
  mentionsOnly: boolean;
  /** Absent when nothing mentions you: no filter. */
  onMentionsOnly?: (on: boolean) => void;
  freshId: string | null;
  onShow: (root: Comment) => void;
  onGo: (root: Comment) => void;
}) {
  const { keyOf } = useContext(PendingContext);
  const [spot, setSpot] = useState(storedSpot);
  const [dragging, setDragging] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const faceRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; spot: Spot; moved: boolean } | null>(null);
  /** A drag ends on the button it began on, and that click mustn't press it too. */
  const justDragged = useRef(false);

  /* The box's size is the face's, measured: the box animates to it, and the face, pinned to the
     anchored corner, is revealed from there. */
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const el = faceRef.current;
    if (!el) return;
    const measure = () =>
      setSize((current) =>
        current && current.width === el.offsetWidth && current.height === el.offsetHeight
          ? current
          : { width: el.offsetWidth, height: el.offsetHeight },
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [face]);
  /* No transition for the first size, so it doesn't grow in from nothing when the page loads. */
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!size || ready) return;
    const raf = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(raf);
  }, [size, ready]);

  function onPointerDown(event: ReactPointerEvent) {
    // Nothing on the dock reaches the layer's overlay underneath.
    event.stopPropagation();
    justDragged.current = false;
    if (event.button !== 0) return;
    // The panel scrolls and holds rows: only its head moves it.
    if (face === "panel" && !(event.target as Element).closest("[data-dock-handle]")) return;
    drag.current = { x: event.clientX, y: event.clientY, spot, moved: false };
  }

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const now = drag.current;
      const wrapper = wrapperRef.current;
      if (!now || !wrapper) return;
      const mx = event.clientX - now.x;
      const my = event.clientY - now.y;
      if (!now.moved) {
        if (Math.hypot(mx, my) < DRAG_PX) return;
        now.moved = true;
        setDragging(true);
      }
      const { width, height } = wrapper.getBoundingClientRect();
      setSpot(
        clampSpot(
          {
            ...now.spot,
            dx: now.spot.dx + (now.spot.h === "left" ? mx : -mx),
            dy: now.spot.dy + (now.spot.v === "top" ? my : -my),
          },
          width,
          height,
        ),
      );
    };
    const up = () => {
      const now = drag.current;
      drag.current = null;
      if (!now?.moved || !wrapperRef.current) return;
      justDragged.current = true;
      setDragging(false);
      const next = reanchor(wrapperRef.current.getBoundingClientRect());
      setSpot(next);
      try {
        localStorage.setItem(SPOT_KEY, JSON.stringify(next));
      } catch {
        // Per-viewer convenience only.
      }
    };
    const resize = () => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (rect) setSpot((current) => clampSpot(current, rect.width, rect.height));
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
      window.removeEventListener("resize", resize);
    };
  }, []);

  /** Every press goes through here, so the click that ends a drag is swallowed. */
  const press = (action: () => void) => () => {
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }
    action();
  };

  const panelWidth = Math.min(FLOAT_PANEL_WIDTH, window.innerWidth - spot.dx - FLOAT_EDGE);
  const panelHeight = Math.min(FLOAT_PANEL_HEIGHT, window.innerHeight - spot.dy - FLOAT_EDGE);
  const others = elsewhere
    .flatMap((group) => group.threads.map((thread) => ({ ...thread, path: group.path })))
    .sort(newestFirst);
  const corner = { [spot.h]: 0, [spot.v]: 0 } as CSSProperties;
  let row = 0;
  const stagger = () => ({ animationDelay: `${40 + Math.min(row++, 6) * 20}ms` });

  return (
    <div
      ref={wrapperRef}
      className="pc-float"
      data-dragging={dragging ? "" : undefined}
      style={{ [spot.h]: spot.dx, [spot.v]: spot.dy }}
      onPointerDown={onPointerDown}
    >
      <div
        className="pc-float-box pc-surface"
        data-face={face}
        data-ready={ready ? "" : undefined}
        style={size ? { width: size.width, height: size.height } : undefined}
      >
        <div ref={faceRef} key={face} className="pc-float-face" style={corner}>
          {face === "icon" && (
            <button
              type="button"
              className="pc-float-icon"
              aria-label={openCount > 0 ? `Comments, ${openCount} open` : "Comments"}
              aria-expanded={false}
              onClick={press(() => onFace("tray"))}
            >
              <Glyph name="comment" size={18} />
            </button>
          )}
          {face === "tray" && (
            <div
              className="pc-float-tray pc-row"
              // ✕ sits where the button was, on the anchored side: the same spot opens and closes it.
              style={{ flexDirection: spot.h === "left" ? "row-reverse" : "row" }}
            >
              <FloatButton
                label={
                  placing
                    ? "Stop adding"
                    : pick === "pin"
                      ? "Add a comment"
                      : "Add a comment: click to pin, drag to mark an area"
                }
                pressed={placing}
                onClick={press(() => onPlacing(!placing))}
              >
                <Glyph name="add" />
              </FloatButton>
              <FloatButton
                label={pinsShown ? "Hide comments" : "Show comments"}
                pressed={pinsShown}
                onClick={press(() => onPinsShown(!pinsShown))}
              >
                <Glyph name={pinsShown ? "eye" : "hidden"} />
              </FloatButton>
              <FloatButton label="All comments" expanded={false} onClick={press(() => onFace("panel"))}>
                <Glyph name="list" />
                {openCount > 0 && <span className="pc-float-count">{openCount}</span>}
              </FloatButton>
              <span aria-hidden="true" className="pc-float-divider" />
              <FloatButton label="Close" onClick={press(() => onFace("icon"))}>
                <Glyph name="close" />
              </FloatButton>
            </div>
          )}
          {face === "panel" && (
            <div
              role="dialog"
              aria-label="All comments"
              className="pc-float-panel pc-col"
              style={{ width: panelWidth, maxHeight: panelHeight }}
            >
              <div data-dock-handle="" className="pc-float-head pc-row">
                <span className="pc-title pc-fill">{mentionsOnly ? "Mentions" : "Comments"}</span>
                {onMentionsOnly && (
                  <FloatButton
                    label={mentionsOnly ? "All comments" : "Mentions of you"}
                    pressed={mentionsOnly}
                    onClick={press(() => onMentionsOnly(!mentionsOnly))}
                  >
                    <Glyph name="at" />
                    {mentionCount > 0 && <span className="pc-float-count pc-float-mentions">{mentionCount}</span>}
                  </FloatButton>
                )}
                {showResolved !== undefined && (
                  <FloatButton
                    label={showResolved ? "Hide resolved" : "Show resolved"}
                    pressed={showResolved}
                    onClick={press(() => onShowResolved(!showResolved))}
                  >
                    <Glyph name="resolve" />
                  </FloatButton>
                )}
                <FloatButton label="Close" onClick={press(() => onFace("tray"))}>
                  <Glyph name="close" />
                </FloatButton>
              </div>
              <ul className="pc-float-list pc-col">
                {here.length === 0 && others.length === 0 && (
                  <li className="pc-tray-empty pc-dock-row" style={stagger()}>
                    {mentionsOnly
                      ? "Nothing mentions you."
                      : showResolved === false
                        ? "No open comments."
                        : "No comments yet."}
                  </li>
                )}
                {here.map((thread) => (
                  <TrayRow
                    key={keyOf(thread.root.id)}
                    thread={thread}
                    resolving={showResolved !== undefined}
                    fresh={thread.root.id === freshId}
                    style={stagger()}
                    onPick={onShow}
                  />
                ))}
                {others.map((thread) => (
                  <TrayRow
                    key={keyOf(thread.root.id)}
                    thread={thread}
                    path={thread.path}
                    resolving={showResolved !== undefined}
                    style={stagger()}
                    onPick={onGo}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      {/* Outside the box, which clips: unread mentions of you on every face, and the open count
          on the button. */}
      {mentionCount > 0 && (
        <span
          role="status"
          className="pc-float-badge pc-float-badge-mentions"
          aria-label={`${mentionCount} unread mention${mentionCount === 1 ? "" : "s"}`}
        >
          @{mentionCount}
        </span>
      )}
      {face === "icon" && openCount > 0 && (
        <span aria-hidden="true" className="pc-float-badge pc-float-badge-open">
          {openCount}
        </span>
      )}
    </div>
  );
}

/** A 32px control on the dock. `pressed` marks a toggle, lit when on. */
function FloatButton({
  label,
  pressed,
  expanded,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  expanded?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      className="pc-float-button pc-row"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function TrayRow({
  thread: { root, replies },
  path,
  resolving,
  fresh = false,
  style,
  onPick,
}: {
  thread: ThreadSummary;
  /** Set on another page's thread: where a click goes. */
  path?: string;
  /** Whether "Resolved" means anything here. */
  resolving: boolean;
  /** Yours, just posted. */
  fresh?: boolean;
  /** Its entrance delay. */
  style?: CSSProperties;
  onPick: (root: Comment) => void;
}) {
  const locations = useContext(LocationsContext);
  const pageLabel = useContext(PageLabelContext);
  const state = useContext(PendingContext);
  const gone = state.gone(root.id);
  const goneRef = useGoneHeight<HTMLLIElement>(gone);
  const replyCount = replies > 0 ? (replies === 1 ? "1 reply" : `${replies} replies`) : undefined;
  // Without locations, the reply count joins the byline and there is no line under the text.
  const details = [
    locations && path && pageLabel(path),
    locations && root.anchor?.label && `on ${root.anchor.label}`,
    locations && replyCount,
    resolving && root.resolved && "Resolved",
  ].filter(Boolean);
  return (
    <li
      ref={goneRef}
      data-id={root.id}
      data-gone={gone ? "" : undefined}
      className={fresh ? "pc-dock-row pc-row-fresh" : "pc-dock-row"}
      style={style}
    >
      <button
        type="button"
        className="pc-tray-row pc-row"
        aria-label={path ? `${firstName(root.author)} on ${path}: ${root.body}` : undefined}
        onClick={() => onPick(root)}
      >
        <Avatar author={root.author} />
        <span className="pc-col pc-fill pc-tray-row-text">
          <Byline
            author={root.author}
            time={ago(root.createdAt)}
            extra={locations ? undefined : replyCount}
          />
          <Body comment={root} className="pc-clamp pc-body" inline />
          {details.length > 0 && (
            <span className="pc-meta pc-truncate">{details.join(" · ")}</span>
          )}
        </span>
      </button>
      {/* Beside the row's button, not in it (a button can't hold buttons), and drawn over the
          room the row leaves for it at its foot, so they read as one. */}
      {/* Not until it's saved: there's nothing to react to yet. */}
      {!state.pending(root.id) && <Reactions comment={root} where="list" />}
    </li>
  );
}

/**
 * Top centre while a thread's form is on screen instead of yours: whose it is, and the way back.
 * The layer's own surface, so it reads as part of the comments, not the page.
 */
function ReplayBanner({
  author,
  at,
  mine,
  onBack,
  onDismiss,
}: {
  author: User;
  at: number;
  mine: boolean;
  onBack?: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="pc-replay" onPointerDown={(event) => event.stopPropagation()}>
      <div role="status" className="pc-card pc-surface pc-row pc-replay-pill">
        <Avatar author={author} />
        <span className="pc-fill pc-truncate">
          Showing {mine ? "your" : `${firstName(author)}'s`} form from {ago(at)}
        </span>
        {onBack && (
          <button type="button" className="pc-replay-back" onClick={onBack}>
            Back to my form
          </button>
        )}
        <IconAction label="Dismiss" icon={<Glyph name="close" />} onClick={onDismiss} />
      </div>
    </div>
  );
}

function IconAction({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="pc-icon-action"
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

/**
 * Measures a row as it's turned away, so it can fold from its own height (`--_h`) to nothing
 * once it has faded, and what's under it closes up smoothly.
 */
function useGoneHeight<T extends HTMLElement>(gone: boolean) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    if (gone && ref.current) ref.current.style.setProperty("--_h", `${ref.current.offsetHeight}px`);
  }, [gone]);
  return ref;
}

/** One comment in a thread: slides in if it came after the thread opened, folds away if refused. */
function ThreadItem({
  gone,
  entering,
  children,
}: {
  gone: boolean;
  entering: boolean;
  children: ReactNode;
}) {
  const ref = useGoneHeight<HTMLDivElement>(gone);
  return (
    <div ref={ref} data-gone={gone ? "" : undefined} className={entering ? "pc-row-enter" : ""}>
      {children}
    </div>
  );
}

function Thread({
  root,
  box,
  edge,
  changed,
  replies,
  me,
  canResolve,
  closed,
  onJoin,
  onClose,
  onResolve,
  onDelete,
  onEdit,
  onReply,
  onCopy,
  restore,
  assistant,
}: {
  root: Comment;
  box: Box;
  /** How far right the card may reach: the open tray's left edge, so the two never overlap. */
  edge: number;
  /** The anchored element's text has moved on since the comment was made. */
  changed: boolean;
  replies: Comment[];
  /** null: a guest who hasn't given a name yet, asked for one where the reply box would be. */
  me: User | null;
  canResolve: boolean;
  /** Resolved, where resolving is on: read-only until reopened. */
  closed: boolean;
  onJoin: (name: string, tint?: string) => Promise<boolean>;
  onClose: () => void;
  onResolve: (resolved: boolean) => void;
  onDelete: (comment: Comment) => void;
  onEdit: (comment: Comment, body: string) => Promise<boolean>;
  onReply: (body: string) => Promise<boolean>;
  onCopy: () => void;
  /** A reply that was turned away, back in the reply box. */
  restore?: Restore;
  /** The site's assistant, from the @ list: it says when it's reading. */
  assistant?: Person;
}) {
  const locations = useContext(LocationsContext);
  const deletable = useContext(DeletableContext);
  const state = useContext(PendingContext);
  /** The one row being rewritten, if any. The thread is keyed by its root, so this resets with it. */
  const [editingId, setEditingId] = useState<string | null>(null);
  /**
   * The open `•••` menu, measured against the card. It renders on the card rather than beside
   * its trigger because the rows scroll, and a menu inside them would be clipped.
   */
  const [menu, setMenu] = useState<
    (MenuSpec & { top: number; right: number }) | null
  >(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const toggleMenu = (spec: MenuSpec, trigger: HTMLElement) => {
    const card = cardRef.current;
    if (menu?.id === spec.id || !card) return setMenu(null);
    const at = trigger.getBoundingClientRect();
    const rect = card.getBoundingClientRect();
    setMenu({ ...spec, top: at.bottom - rect.top + 4, right: rect.right - at.right });
  };
  /** Your own comments, or anyone's when you are an admin. Editing stays with the author. */
  const canDelete = (comment: Comment) =>
    !state.pending(comment.id) && me !== null && !me.agent && deletable(me, comment);
  /* A reply lands at the foot of the list; in a thread long enough to scroll, the list follows it
     down. Only on growth: an edit or a delete leaves it be. */
  const listRef = useRef<HTMLDivElement>(null);
  const replyCount = useRef(replies.length);
  useEffect(() => {
    const list = listRef.current;
    if (list && replies.length > replyCount.current)
      list.scrollTop = list.scrollHeight;
    replyCount.current = replies.length;
  }, [replies.length]);
  /** What was here when the thread opened. Anything after slides in. */
  const [initialIds] = useState(
    () => new Set([root, ...replies].map((c) => c.id)),
  );
  const { origin, ...position } = cardPosition(box, "top", edge);
  return (
    <div
      ref={cardRef}
      data-sheet={narrow() ? "" : undefined}
      className="pc-card pc-fixed pc-col pc-surface pc-thread"
      style={{ width: CARD_WIDTH, transformOrigin: origin, ...position }}
      onPointerDown={(event) => {
        event.stopPropagation();
        setMenu(null);
      }}
    >
      <div className="pc-head pc-row">
        <div className="pc-col pc-fill">
          <span className="pc-title">Comment</span>
          {locations && root.anchor?.label && (
            <span className="pc-meta pc-truncate">on {root.anchor.label}</span>
          )}
          {changed && (
            <span className="pc-meta pc-row" style={{ gap: 4 }}>
              <span aria-hidden="true" className="pc-dot" />
              Text changed since
            </span>
          )}
        </div>
        <div className="pc-row">
          <MenuButton
            spec={{
              id: "thread",
              label: "Thread actions",
              items: [
                { label: "Copy as Markdown", onSelect: onCopy },
                ...(canDelete(root)
                  ? [{ label: "Delete thread", onSelect: () => onDelete(root) }]
                  : []),
              ],
            }}
            open={menu?.id === "thread"}
            onToggle={toggleMenu}
          />
          {canResolve && (
            <IconAction
              label={root.resolved ? "Reopen thread" : "Resolve thread"}
              icon={
                root.resolved ? (
                  <Glyph name="reopen" />
                ) : (
                  <Glyph name="resolve" />
                )
              }
              onClick={() => onResolve(!root.resolved)}
            />
          )}
          <IconAction
            label="Close"
            icon={<Glyph name="close" />}
            onClick={onClose}
          />
        </div>
      </div>

      <div ref={listRef} className="pc-col pc-thread-list" onScroll={() => setMenu(null)}>
        {[root, ...replies].map((comment) => (
          <ThreadItem
            key={state.keyOf(comment.id)}
            gone={state.gone(comment.id)}
            entering={!initialIds.has(comment.id)}
          >
            <CommentRow
              comment={comment}
              actions={
                canDelete(comment) && editingId !== comment.id ? (
                  <MenuButton
                    spec={{
                      id: comment.id,
                      label: comment.parentId
                        ? "Reply actions"
                        : "Comment actions",
                      items: [
                        ...(comment.author.id === me?.id
                          ? [
                              {
                                label: "Edit",
                                onSelect: () => setEditingId(comment.id),
                              },
                            ]
                          : []),
                        {
                          label: comment.parentId ? "Delete" : "Delete thread",
                          onSelect: () => onDelete(comment),
                        },
                      ],
                    }}
                    open={menu?.id === comment.id}
                    onToggle={toggleMenu}
                  />
                ) : undefined
              }
            >
              {editingId === comment.id ? (
                <ComposeBox
                  flat
                  placeholder="Edit comment"
                  initial={comment.body}
                  submitLabel="Save"
                  onCancel={() => setEditingId(null)}
                  onSubmit={async (body) => {
                    // Unchanged text is not an edit: close it without a request or a mark.
                    if (body.trim() === comment.body) return setEditingId(null);
                    if (await onEdit(comment, body)) setEditingId(null);
                  }}
                />
              ) : undefined}
            </CommentRow>
            {editingId !== comment.id && !state.pending(comment.id) && (
              <div className="pc-thread-reactions">
                <Reactions comment={comment} where="thread" />
              </div>
            )}
          </ThreadItem>
        ))}
        {awaitingAssistant([root, ...replies], assistant) && (
          <div className="pc-row pc-row-enter pc-reading" role="status">
            <Avatar author={assistant!} />
            <span>{assistant!.name} is reading…</span>
          </div>
        )}
      </div>

      {/* On a touch screen, opening a thread is for reading it: focusing the reply would put the
          keyboard over the page. A tap on the field writes. */}
      {/* A thread you've only just started has no reply box until it's saved. */}
      {!closed && !state.pending(root.id) && (
        <div className="pc-reply">
          {me ? (
            <ComposeBox
              key={`reply-${restore?.nonce ?? 0}`}
              flat
              focus={!coarse() || restore !== undefined}
              placeholder="Reply"
              submitLabel="Reply"
              lead={<Avatar author={me} />}
              initial={restore?.body}
              onSubmit={onReply}
            />
          ) : (
            <JoinBox
              key="name"
              flat
              focus={!coarse()}
              placeholder="Your name, to reply"
              onJoin={onJoin}
            />
          )}
        </div>
      )}

      {menu && (
        <Menu
          spec={menu}
          style={{ top: menu.top, right: menu.right }}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

type MenuSpec = {
  id: string;
  label: string;
  items: { label: string; onSelect: () => void }[];
};

/** The `•••` on the thread header and on your own rows. */
function MenuButton({
  spec,
  open,
  onToggle,
}: {
  spec: MenuSpec;
  open: boolean;
  onToggle: (spec: MenuSpec, trigger: HTMLElement) => void;
}) {
  return (
    <div
      aria-haspopup="menu"
      aria-expanded={open}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <IconAction
        label={spec.label}
        icon={<Glyph name="more" />}
        onClick={(event) => onToggle(spec, event.currentTarget)}
      />
    </div>
  );
}

function Menu({
  spec,
  style,
  onClose,
}: {
  spec: MenuSpec;
  style: CSSProperties;
  onClose: () => void;
}) {
  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => firstRef.current?.focus(), []);
  return (
    <div
      role="menu"
      aria-label={spec.label}
      className="pc-card pc-col pc-surface pc-menu"
      style={style}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        // The menu only: the layer's own Esc (on `document`) would close the thread too.
        event.nativeEvent.stopPropagation();
        onClose();
      }}
    >
      {spec.items.map((item, index) => (
        <button
          key={item.label}
          ref={index === 0 ? firstRef : undefined}
          type="button"
          role="menuitem"
          className="pc-menu-item"
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
