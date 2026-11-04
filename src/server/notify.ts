import { createHmac } from "node:crypto";

import { mentionParts, pathOf, withoutState, type Comment, type User } from "../model";
import type { Created } from "./handler";

/**
 * Connectors: comment activity, sent to the tools a team already works in. Dogear announces four
 * things, after the response, and each connector picks what it hears. Nothing goes through a
 * Dogear service; a connector is code on your server, talking to Slack, Notion or your own URL.
 */
export type EventType = "thread.created" | "comment.replied" | "thread.resolved" | "thread.reopened";

type Activity = {
  /** Who did it: who wrote the comment, or who resolved or reopened the thread. */
  actor: User;
  /** The comment just written; for a resolve or reopen, the thread's first comment. */
  comment: Comment;
  /** Its thread, oldest first, as it is now. */
  thread: Comment[];
  /** The page it's on, without the query string: `/pricing`. */
  page: string;
  /** A link that opens the thread on its page. */
  link: string;
};

/** Something that happened to a comment. A new comment carries `Created`'s fields as well. */
export type DogearEvent =
  | ({ type: "thread.created" | "comment.replied" } & Activity & Created)
  | ({ type: "thread.resolved" | "thread.reopened" } & Activity);

/**
 * A function that hears about each new comment, threads and replies: a chat app that messages
 * whoever was @mentioned, your own. Each runs on its own; what one throws goes to `onError` and
 * the others still run.
 */
export type Notifier = (event: Created) => Promise<void>;

/**
 * Where activity goes (`DogearOptions.notify`): a `Notifier`, or an object that picks its
 * `events` (default: new threads and resolves, so a channel isn't flooded with replies) and,
 * with `when`, which ones of those, by page or person.
 */
export type Connector = Notifier | Sender;

/** A connector that picks what it hears, as `webhook()` and the recipes are. */
export type Sender = {
  events?: EventType[];
  when?: (event: DogearEvent) => boolean;
  send: (event: DogearEvent) => Promise<void>;
};

/** What a connector hears unless it says otherwise. */
export const DEFAULT_EVENTS: readonly EventType[] = ["thread.created", "thread.resolved"];

/** Whether a connector listens for this type at all; `when` is asked later, with the event. */
export function listens(connector: Connector, type: EventType) {
  if (typeof connector === "function") return type === "thread.created" || type === "comment.replied";
  return (connector.events ?? DEFAULT_EVENTS).includes(type);
}

/** Hands the event to a connector that listens for it, unless its `when` says no. */
export async function deliver(connector: Connector, event: DogearEvent) {
  if (!listens(connector, event.type)) return;
  if (typeof connector === "function") {
    if (event.type === "thread.created" || event.type === "comment.replied") await connector(event);
    return;
  }
  if (connector.when && !connector.when(event)) return;
  await connector.send(event);
}

const DID: Record<EventType, string> = {
  "thread.created": "started a thread on",
  "comment.replied": "replied on",
  "thread.resolved": "resolved a thread on",
  "thread.reopened": "reopened a thread on",
};

/** One plain line for any tool: "Alex Doe started a thread on /pricing". */
export function headline(event: DogearEvent) {
  return `${event.actor.name} ${DID[event.type]} ${event.page}`;
}

/** How much of a comment an alert quotes. */
const EXCERPT = 300;

/** A comment's text with each @handle as the person's name, cut to `max`. */
export function excerpt(comment: Comment, max = EXCERPT) {
  const text = mentionParts(comment.body, comment.mentions)
    .map((part) => (typeof part === "string" ? part : `@${part.name}`))
    .join("");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** A fetch, tried once more after a network error or a 5xx; a 4xx is an answer, not a blip. */
async function retried(send: () => Promise<Response>, wait = 500): Promise<Response> {
  try {
    const response = await send();
    if (response.status < 500) return response;
  } catch {
    // Once more, below.
  }
  await new Promise((resolve) => setTimeout(resolve, wait));
  return send();
}

/**
 * POSTs each event to your URL as JSON, for Zapier, Make, n8n or your own service:
 * `{ type, actor, comment, thread, page, link }`, plus `author` and `mentioned` (with emails) for
 * a new comment. With `secret`, it's signed: `x-dogear-signature: sha256=<hex HMAC of the body>`,
 * so your end can check it came from you.
 */
export function webhook({
  url,
  secret,
  headers = {},
  events,
  when,
  fetch: send = globalThis.fetch,
}: {
  url: string;
  secret?: string;
  headers?: Record<string, string>;
  /** Default: new threads and resolves. */
  events?: EventType[];
  when?: (event: DogearEvent) => boolean;
  /** For tests. */
  fetch?: typeof fetch;
}): Sender {
  const person = ({ id, name, email }: User) => ({ id, name, ...(email ? { email } : {}) });
  return {
    events,
    when,
    async send(event) {
      const body = JSON.stringify({
        type: event.type,
        actor: person(event.actor),
        comment: withoutState(event.comment),
        thread: event.thread.map(withoutState),
        page: event.page,
        link: event.link,
        ...(event.type === "thread.created" || event.type === "comment.replied"
          ? {
              author: person(event.author),
              mentioned: event.mentioned.map(({ id, name, handle, email }) => ({
                id,
                name,
                handle,
                ...(email ? { email } : {}),
              })),
            }
          : {}),
      });
      const signed: Record<string, string> = secret
        ? { "x-dogear-signature": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}` }
        : {};
      const response = await retried(() =>
        send(url, { method: "POST", headers: { "content-type": "application/json", ...headers, ...signed }, body }),
      );
      if (!response.ok) throw new Error(`dogear: the webhook answered ${response.status}`);
    },
  };
}
