import { createHmac } from "node:crypto";

import { mentionParts, withoutState, type Comment } from "../model";
import type { Created } from "./handler";

/**
 * Something that hears about each new comment, after the response (`DogearOptions.notify`): a
 * chat app that messages whoever was @mentioned, a webhook, your own. Each runs on its own; what
 * one throws goes to `onError` and the others still run.
 */
export type Notifier = (event: Created) => Promise<void>;

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
 * POSTs each new comment to your URL as JSON, for Slack workflows, Zapier, your own service:
 * `{ type: "comment.created", comment, thread, author, mentioned, link }`, where `mentioned` has
 * emails. With `secret`, it's signed: `x-dogear-signature: sha256=<hex HMAC of the body>`, so
 * your end can check it came from you.
 */
export function webhook({
  url,
  secret,
  headers = {},
  fetch: send = globalThis.fetch,
}: {
  url: string;
  secret?: string;
  headers?: Record<string, string>;
  /** For tests. */
  fetch?: typeof fetch;
}): Notifier {
  return async ({ comment, thread, author, mentioned, link }) => {
    const body = JSON.stringify({
      type: "comment.created",
      comment: withoutState(comment),
      thread: thread.map(withoutState),
      author: { id: author.id, name: author.name, ...(author.email ? { email: author.email } : {}) },
      mentioned: mentioned.map(({ id, name, handle, email }) => ({ id, name, handle, ...(email ? { email } : {}) })),
      link,
    });
    const signed: Record<string, string> = secret
      ? { "x-dogear-signature": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}` }
      : {};
    const response = await retried(() =>
      send(url, { method: "POST", headers: { "content-type": "application/json", ...headers, ...signed }, body }),
    );
    if (!response.ok) throw new Error(`dogear: the webhook answered ${response.status}`);
  };
}
