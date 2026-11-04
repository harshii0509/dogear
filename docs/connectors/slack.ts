import { excerpt, headline, type Sender } from "@harshi04/dogear/server";

/** Slack's markup treats &, < and > as its own; the rest is plain. */
const plain = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Posts to a Slack channel through an incoming webhook: who did what, the comment's words, and a
 * link back to the thread. New threads and resolves by default; pass `events` for more.
 */
export function slack(url: string, options: Pick<Sender, "events" | "when"> = {}): Sender {
  return {
    ...options,
    async send(event) {
      const quote = plain(excerpt(event.comment)).replace(/\n/g, "\n>");
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          // What the notification says; the blocks are what the channel shows.
          text: headline(event),
          blocks: [
            { type: "section", text: { type: "mrkdwn", text: `*${plain(headline(event))}*\n>${quote}` } },
            { type: "context", elements: [{ type: "mrkdwn", text: `<${event.link}|Open the thread>` }] },
          ],
        }),
      });
      if (!response.ok) throw new Error(`slack answered ${response.status}`);
    },
  };
}
