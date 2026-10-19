import type { Anchor } from "./model";

/** Every node the comment layer draws carries this, so anchoring can look straight through it. */
export const LAYER_ATTR = "data-comment-layer";

export type Box = { x: number; y: number; w: number; h: number };

/** Between the path to a shadow host and the path inside its (open) shadow root. */
const SHADOW = " >>> ";

/** Attributes a team puts on elements on purpose, so they outlive a reshuffled DOM. */
const TEST_ATTRS = ["data-testid", "data-test", "data-qa", "data-cy"];

/**
 * An id worth anchoring on. React's `useId` (`_r_27_`) and Radix's (`radix-…`) change between
 * renders and builds, so a selector rooted on one would find nothing tomorrow.
 */
function stableId(element: Element) {
  const id = element.id;
  return id !== "" && /^[A-Za-z][\w-]*$/.test(id) && !/radix|_r_/.test(id)
    ? id
    : null;
}

/** `[data-testid="…"]` when the element has a test id no other element in its root shares. */
function testIdSelector(element: Element, root: Document | ShadowRoot) {
  for (const attr of TEST_ATTRS) {
    const value = element.getAttribute(attr);
    if (!value) continue;
    const selector = `[${attr}="${CSS.escape(value)}"]`;
    if (root.querySelectorAll(selector).length === 1) return selector;
  }
  return null;
}

/**
 * A path from `element` up to the top of its own root: the nearest stable id or test id, or else
 * `body` (in the document) or the shadow root's top level. Class names are left out on purpose:
 * styled-components hashes them per build.
 *
 * ponytail: structural below the nearest id, so a comment loses its element when the DOM above
 * it is reshaped; it then draws at its viewport fallback, muted. Test ids are the cure, where a
 * page has them.
 */
function pathWithin(element: Element, root: Document | ShadowRoot): string {
  const parts: string[] = [];
  let node: Element | null = element;
  while (node && node !== document.body && node !== document.documentElement) {
    const id = stableId(node);
    const pinned = id ? `#${CSS.escape(id)}` : testIdSelector(node, root);
    if (pinned) {
      parts.unshift(pinned);
      return parts.join(" > ");
    }
    const tag = node.tagName.toLowerCase();
    const parent: Element | null = node.parentElement;
    const siblings = parent ? parent.children : root.children;
    const index =
      Array.from(siblings)
        .filter((child) => child.tagName === node!.tagName)
        .indexOf(node) + 1;
    parts.unshift(`${tag}:nth-of-type(${index})`);
    node = parent;
  }
  if (root instanceof Document) parts.unshift("body");
  return parts.join(" > ");
}

/** The element's path, through every open shadow root it sits in: `host path >>> inner path`. */
function selectorFor(element: Element): string {
  const segments: string[] = [];
  let node = element;
  for (;;) {
    const root = node.getRootNode();
    if (root instanceof ShadowRoot) {
      segments.unshift(pathWithin(node, root));
      node = root.host;
    } else {
      segments.unshift(pathWithin(node, document));
      return segments.join(SHADOW);
    }
  }
}

/**
 * The first match of a path inside a shadow root. `querySelector` there matches at any depth,
 * so a path that starts at the root's top level must also end up there.
 */
function findWithin(root: ShadowRoot, path: string): Element | null {
  if (path.startsWith("#") || path.startsWith("[")) return root.querySelector(path);
  const depth = path.split(" > ").length - 1;
  return (
    Array.from(root.querySelectorAll(path)).find((element) => {
      let top: Element | null = element;
      for (let i = 0; i < depth && top; i++) top = top.parentElement;
      return top?.parentNode === root;
    }) ?? null
  );
}

/** What a selector from `selectorFor` points at now, or null. Throws on a selector that won't parse. */
function find(selector: string): Element | null {
  const [first, ...inner] = selector.split(SHADOW);
  let found = document.querySelector(first);
  for (const path of inner) {
    const root = found?.shadowRoot;
    if (!root) return null;
    found = findWithin(root, path);
  }
  return found;
}

/** The element an anchor points at now, or null (gone, or a selector that no longer parses). */
export function elementFor(anchor: Anchor): Element | null {
  try {
    return find(anchor.selector);
  } catch {
    return null;
  }
}

/** Whether `element` sits inside something the page asked us to leave alone. */
function ignored(element: Element, ignore?: string) {
  if (!ignore) return false;
  try {
    return element.closest(ignore) !== null;
  } catch {
    // An `ignore` that isn't a valid selector ignores nothing.
    return false;
  }
}

/**
 * The page element under a point, looking past the comment layer's own overlay and markers and
 * anything matching `ignore`, and into open shadow roots (a closed one keeps its host).
 */
function elementAt(x: number, y: number, ignore?: string): Element {
  let element =
    document
      .elementsFromPoint(x, y)
      .find(
        (candidate) =>
          !candidate.closest(`[${LAYER_ATTR}]`) && !ignored(candidate, ignore),
      ) ?? document.body;
  while (element.shadowRoot) {
    // The topmost hit from a shadow root can be outside it (our own overlay is), so take the
    // first one that is really inside.
    const root = element.shadowRoot;
    const inner = root.elementsFromPoint(x, y).find((candidate) => root.contains(candidate));
    if (!inner) break;
    element = inner;
  }
  return element;
}

/** Whether a press here lands on something the page asked us to leave alone. */
export function isIgnoredAt(x: number, y: number, ignore?: string) {
  if (!ignore) return false;
  const top = document
    .elementsFromPoint(x, y)
    .find((candidate) => !candidate.closest(`[${LAYER_ATTR}]`));
  return top ? ignored(top, ignore) : false;
}

/** The first 60 characters of an element's text, whitespace collapsed — its fingerprint. */
function textOf(element: Element) {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
}

/** `"Save changes"`, shortened, or "" for nothing worth quoting. */
function quoted(text: string | null | undefined) {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return ` "${clean.length > 40 ? `${clean.slice(0, 39)}…` : clean}"`;
}

/** Text that belongs to the element itself, not to its children. */
function ownText(element: Element) {
  return Array.from(element.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent)
    .join(" ");
}

/**
 * What a person would call the element: `button "Save"`, `field "Email"`, `heading "Pricing"`.
 * For the thread card and anything that lists threads, where a selector means nothing.
 */
export function labelOf(element: Element): string {
  const named = element.getAttribute("data-comment-label");
  if (named) return named.slice(0, 80);
  const tag = element.tagName.toLowerCase();
  const role = element.getAttribute("role");
  const aria = element.getAttribute("aria-label");

  // An icon names itself after the control it sits in.
  if (element instanceof SVGElement) {
    const control = element.closest("button, a, [role=button]");
    return control ? `icon in ${labelOf(control)}` : "icon";
  }
  let label: string;
  if (tag === "button" || role === "button")
    label = `button${quoted(aria || textOf(element))}`;
  else if (tag === "a") label = `link${quoted(aria || textOf(element))}`;
  else if (tag === "input" || tag === "textarea" || tag === "select") {
    const field = element as HTMLInputElement;
    const labelled = field.labels?.[0]?.textContent;
    label = `field${quoted(aria || labelled || field.placeholder || field.name)}`;
  } else if (tag === "img")
    label = `image${quoted(aria || element.getAttribute("alt"))}`;
  else if (/^h[1-6]$/.test(tag)) label = `heading${quoted(textOf(element))}`;
  else if (tag === "p") label = `paragraph${quoted(textOf(element))}`;
  else if (tag === "label") label = `label${quoted(textOf(element))}`;
  else if (aria) label = `${role ?? tag}${quoted(aria)}`;
  else label = `${role ?? tag}${quoted(ownText(element))}`;
  return label.slice(0, 80);
}

/**
 * What a press at this point would anchor to, for the outline drawn while aiming. Null over the
 * page itself (`body`, `html`), where an outline would only frame the window.
 */
export function targetAt(
  x: number,
  y: number,
  ignore?: string,
): { box: Box; label: string } | null {
  const element = elementAt(x, y, ignore);
  if (element === document.body || element === document.documentElement) return null;
  const rect = element.getBoundingClientRect();
  return {
    box: { x: rect.left, y: rect.top, w: rect.width, h: rect.height },
    label: labelOf(element),
  };
}

/** A viewport box (a pin is `w = h = 0`) → an anchor that survives scrolling and resizing. */
export function anchorAt(box: Box, ignore?: string): Anchor {
  const element = elementAt(box.x + box.w / 2, box.y + box.h / 2, ignore);
  const rect = element.getBoundingClientRect();
  const width = rect.width || 1;
  const height = rect.height || 1;
  return {
    selector: selectorFor(element),
    fx: (box.x - rect.left) / width,
    fy: (box.y - rect.top) / height,
    fw: box.w / width,
    fh: box.h / height,
    vx: box.x / window.innerWidth,
    vy: box.y / window.innerHeight,
    vw: box.w / window.innerWidth,
    vh: box.h / window.innerHeight,
    text: textOf(element),
    label: labelOf(element),
  };
}

/** Where an anchor is right now, in viewport pixels — or its fallback, flagged `lost`. */
export function resolveAnchor(
  anchor: Anchor,
): Box & { lost: boolean; hidden: boolean; same: boolean } {
  let element: Element | null = null;
  try {
    element = find(anchor.selector);
  } catch {
    // A selector from a DOM shape we no longer render may not even parse; treat it as lost.
  }
  if (element) {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left + anchor.fx * rect.width,
      y: rect.top + anchor.fy * rect.height,
      w: anchor.fw * rect.width,
      h: anchor.fh * rect.height,
      lost: false,
      // An element that is in the DOM but not laid out — a closed tab panel, a collapsed row.
      hidden: rect.width === 0 && rect.height === 0,
      // Found something at that path; is it the thing that was commented on?
      same: anchor.text === undefined || textOf(element) === anchor.text,
    };
  }
  return {
    x: anchor.vx * window.innerWidth,
    y: anchor.vy * window.innerHeight,
    w: anchor.vw * window.innerWidth,
    h: anchor.vh * window.innerHeight,
    lost: true,
    hidden: false,
    same: false,
  };
}
