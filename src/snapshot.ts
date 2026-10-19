import { useEffect, useRef } from "react";

import type { Snapshot } from "./model";

/**
 * A comment made halfway through a form remembers the form. Otherwise whoever opens it later lands
 * on an empty one: the answers live in the writer's own state, which doesn't travel. So a form
 * registers its state here (`useDogearSnapshot`), the layer saves it with each thread started
 * while it's on screen, and opening the thread puts it back.
 *
 * One registry for the page, kept on `globalThis`: the layer and the forms sit in different trees,
 * may come from different bundles (`@harshi04/dogear/react`, the element), and only one form is on
 * screen at a time.
 *
 * Opening a thread from another page means its form isn't mounted yet. Then the snapshot is
 * queued, and the form reads it in its initial state (`peekSnapshot`), so it mounts already filled
 * in: a step that checks the earlier ones never sees it empty.
 */

type Source = { key: string; get(): unknown; restore(data: unknown): void };
type Registry = { live: Source | null; queued: (Snapshot & { at: number }) | null };

/** Long enough for a route change, short enough not to fill in a later visit. */
const QUEUE_MS = 10_000;
const REGISTRY = Symbol.for("dogear.snapshot");

function registry(): Registry {
  const host = globalThis as { [REGISTRY]?: Registry };
  return (host[REGISTRY] ??= { live: null, queued: null });
}

const isPlain = (data: unknown): data is Record<string, unknown> =>
  typeof data === "object" && data !== null && !Array.isArray(data);

/** The form on screen as it stands, or null when no form has registered. */
export function captureSnapshot(): Snapshot | null {
  const { live } = registry();
  return live ? { key: live.key, data: live.get() } : null;
}

/**
 * Fill the form in now if it's on screen, or as soon as it mounts. A snapshot lands over the
 * form's own state, so a field it lacks (it predates one, or was crafted) keeps its default rather
 * than arriving as `undefined`. Top-level fields only: version your key if a nested shape changes.
 */
export function restoreSnapshot(snapshot: Snapshot) {
  if (!isPlain(snapshot.data)) return;
  const r = registry();
  if (r.live?.key === snapshot.key) {
    r.queued = null;
    const now = r.live.get();
    r.live.restore({ ...(isPlain(now) ? now : {}), ...snapshot.data });
  } else {
    r.queued = { ...snapshot, at: Date.now() };
  }
}

/**
 * A snapshot waiting for this form, for its initial state: `useState(() => ({ ...defaults,
 * ...peekSnapshot(key) }))`. Reading it doesn't use it up (React may run initialisers twice).
 */
export function peekSnapshot<T>(key: string): Partial<T> | undefined {
  const { queued } = registry();
  if (!queued || queued.key !== key || Date.now() - queued.at > QUEUE_MS) return undefined;
  return isPlain(queued.data) ? (queued.data as Partial<T>) : undefined;
}

/**
 * Register what's on screen without React: `get` reads it, `restore` puts a snapshot's data back.
 * Answers the function that unregisters it.
 */
export function registerSnapshot(key: string, get: () => unknown, restore: (data: unknown) => void) {
  const r = registry();
  const source: Source = { key, get, restore };
  r.live = source;
  // It mounted from the queue, so the queue has done its job.
  if (r.queued?.key === key) r.queued = null;
  return () => {
    if (registry().live === source) registry().live = null;
  };
}

/**
 * Let comments remember this form. `key` names the form and what it's filling in
 * (`connections-setup:stripe`), so a snapshot only lands in the form it came from; `state` is
 * what to save (any JSON); `restore` puts a saved one back. Pair it with `peekSnapshot` in the
 * form's initial state, for threads opened from another page.
 */
export function useDogearSnapshot<T>(key: string, state: T, restore: (data: T) => void) {
  const latest = useRef({ state, restore });
  useEffect(() => {
    latest.current = { state, restore };
  });
  useEffect(
    () =>
      registerSnapshot(
        key,
        () => latest.current.state,
        (data) => latest.current.restore(data as T),
      ),
    [key],
  );
}
