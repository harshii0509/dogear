import { h, render, type ComponentType } from "preact";

import { httpAdapter, localAdapter, type Adapter } from "./adapter";
import { Comments } from "./comments";
import { toMarkdown } from "./markdown";
import type { Comment, User } from "./model";

/**
 * `<dogear-comments>` for any page, no framework: the same component, run on Preact (the build
 * aliases `react` to `preact/compat`).
 *
 *   <script src="element.global.js"></script>
 *   <dogear-comments endpoint="/api/comments" shortcut="c" ignore="nav"></dogear-comments>
 *
 * `layout="tray"` lists the threads in a tray; `guests` lets signed-out visitors comment under a
 * name (your route answers `POST /me`); `resolvers="authors"` keeps Resolve to authors and admins;
 * `no-resolve` turns resolving off, for a plain list of comments; `avatars='{"sky": "#bbc5dd"}'`
 * offers guests avatars to pick from with their name; `no-locations` leaves out where each comment
 * was left, for a plain list; `no-pulse` leaves the Pulse switch out of the list; `join-first` (with `guests`) asks a visitor's name before showing
 * anything; `pick="pin"` places comments as pins that follow the pointer, outlining nothing;
 * `reactions='["❤️","👍"]'` lets people react, and `reactions-in="thread"` only in an open thread;
 * `emoji-data` is where the full picker's emoji come from, to self-host Emojibase's data;
 * `link-param="comment"` opens threads from `?comment=<id>` links, to match your backend's;
 * `theme="light"` (or "auto", or the default "dark") picks the glass, and can change at any time.
 *
 * No `endpoint` means `localAdapter()`. For any other backend, set `element.adapter = {…}`
 * before the element is connected, or call `Dogear.mount({ adapter })` from a script.
 */
class DogearElement extends HTMLElement {
  adapter?: Adapter;
  /** How a tray row on another page gets there; a full page load by default. */
  navigate?: (href: string) => void;
  /** What a page is called in the list of threads elsewhere; its path by default. */
  pageLabel?: (path: string) => string;
  /** Who may delete a comment, to match the server's `deletable`. */
  deletable?: (me: User, comment: Comment) => boolean;
  /** Called when the visitor turns comment mode on or off. */
  onActiveChange?: (active: boolean) => void;
  /** The adapter in use, once connected: what `threads()` reads from. */
  resolved?: Adapter;
  /** The avatars a guest picks from, by key; or the `avatars` attribute, as JSON. */
  avatars?: Record<string, string>;

  static observedAttributes = ["theme"];

  connectedCallback() {
    const endpoint = this.getAttribute("endpoint");
    this.resolved =
      this.adapter ??
      (endpoint
        ? httpAdapter(endpoint, { guests: this.hasAttribute("guests") })
        : localAdapter());
    this.paint();
  }

  /** A site's dark-mode switch flips `theme` on a live element: draw again, with the same adapter. */
  attributeChangedCallback() {
    if (this.resolved && this.isConnected) this.paint();
  }

  private paint() {
    const adapter = this.resolved;
    render(
      h(Comments as unknown as ComponentType<Parameters<typeof Comments>[0]>, {
        adapter,
        shortcut: this.getAttribute("shortcut") ?? undefined,
        ignore: this.getAttribute("ignore") ?? undefined,
        activation: this.getAttribute("activation") === "param" ? "param" : undefined,
        reviewParam: this.getAttribute("review-param") ?? undefined,
        layout: readLayout(this.getAttribute("layout")),
        resolvers: this.getAttribute("resolvers") === "authors" ? "authors" : undefined,
        resolve: !this.hasAttribute("no-resolve"),
        avatars: this.avatars ?? readAvatars(this.getAttribute("avatars")),
        locations: !this.hasAttribute("no-locations"),
        pulse: !this.hasAttribute("no-pulse"),
        joinFirst: this.hasAttribute("join-first"),
        pick: this.getAttribute("pick") === "pin" ? "pin" : undefined,
        reactions: readReactions(this.getAttribute("reactions")),
        reactionsIn: this.getAttribute("reactions-in") === "thread" ? "thread" : undefined,
        emojiData: this.getAttribute("emoji-data") ?? undefined,
        linkParam: this.getAttribute("link-param") ?? undefined,
        theme: readTheme(this.getAttribute("theme")),
        navigate: this.navigate,
        pageLabel: this.pageLabel,
        deletable: this.deletable,
        onActiveChange: this.onActiveChange,
      }),
      this,
    );
  }

  disconnectedCallback() {
    render(null, this);
  }
}

/** The `avatars` attribute: a JSON object of key → CSS background, or nothing if it isn't one. */
/** The `reactions` attribute: a JSON array of emoji. Anything else turns reactions off. */
function readReactions(json: string | null): string[] | undefined {
  if (!json) return undefined;
  try {
    const value = JSON.parse(json) as unknown;
    return Array.isArray(value) ? value.filter((e): e is string => typeof e === "string") : undefined;
  } catch {
    return undefined;
  }
}

function readAvatars(json: string | null): Record<string, string> | undefined {
  if (!json) return undefined;
  try {
    const value = JSON.parse(json) as unknown;
    if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
  } catch {
    return undefined;
  }
}

function readTheme(value: string | null) {
  return value === "light" || value === "auto" || value === "dark" ? value : undefined;
}

function readLayout(value: string | null) {
  return value === "tray" || value === "dock" ? value : undefined;
}

if (typeof customElements !== "undefined" && !customElements.get("dogear-comments")) {
  customElements.define("dogear-comments", DogearElement);
}

/** Mount without writing the tag: `Dogear.mount({ adapter: myAdapter })`. */
export function mount({
  adapter,
  shortcut,
  ignore,
  activation,
  reviewParam,
  layout,
  resolvers,
  resolve,
  avatars,
  locations,
  pulse,
  joinFirst,
  pick,
  reactions,
  reactionsIn,
  emojiData,
  linkParam,
  theme,
  navigate,
  pageLabel,
  deletable,
  onActiveChange,
}: {
  adapter?: Adapter;
  shortcut?: string;
  ignore?: string;
  activation?: "always" | "param";
  reviewParam?: string;
  layout?: "fab" | "tray" | "dock";
  resolvers?: "anyone" | "authors";
  resolve?: boolean;
  avatars?: Record<string, string>;
  locations?: boolean;
  pulse?: boolean;
  joinFirst?: boolean;
  pick?: "element" | "pin";
  reactions?: string[];
  reactionsIn?: "everywhere" | "thread";
  emojiData?: string;
  linkParam?: string;
  theme?: "dark" | "light" | "auto";
  navigate?: (href: string) => void;
  pageLabel?: (path: string) => string;
  deletable?: (me: User, comment: Comment) => boolean;
  onActiveChange?: (active: boolean) => void;
} = {}) {
  const element = document.createElement("dogear-comments") as DogearElement;
  element.adapter = adapter;
  element.avatars = avatars;
  element.navigate = navigate;
  element.pageLabel = pageLabel;
  element.deletable = deletable;
  element.onActiveChange = onActiveChange;
  if (layout) element.setAttribute("layout", layout);
  if (resolvers) element.setAttribute("resolvers", resolvers);
  if (resolve === false) element.setAttribute("no-resolve", "");
  if (locations === false) element.setAttribute("no-locations", "");
  if (pulse === false) element.setAttribute("no-pulse", "");
  if (joinFirst) element.setAttribute("join-first", "");
  if (pick) element.setAttribute("pick", pick);
  if (reactions) element.setAttribute("reactions", JSON.stringify(reactions));
  if (reactionsIn) element.setAttribute("reactions-in", reactionsIn);
  if (emojiData) element.setAttribute("emoji-data", emojiData);
  if (theme) element.setAttribute("theme", theme);
  if (linkParam) element.setAttribute("link-param", linkParam);
  if (shortcut) element.setAttribute("shortcut", shortcut);
  if (ignore) element.setAttribute("ignore", ignore);
  if (activation) element.setAttribute("activation", activation);
  if (reviewParam) element.setAttribute("review-param", reviewParam);
  document.body.append(element);
  return () => element.remove();
}

/**
 * Every comment on this page's path, through the mounted layer's adapter: for scripts, Playwright
 * and agents. `Dogear.markdown()` is the same as Markdown.
 */
export async function threads(): Promise<Comment[]> {
  const element = document.querySelector<DogearElement>("dogear-comments");
  if (!element?.resolved) throw new Error("dogear: no <dogear-comments> on this page");
  return element.resolved.list(location.pathname);
}

export async function markdown(): Promise<string> {
  return toMarkdown(await threads(), location.pathname);
}

export { httpAdapter, localAdapter };
export { peekSnapshot, captureSnapshot, restoreSnapshot, registerSnapshot } from "./snapshot";
export * from "./index";
