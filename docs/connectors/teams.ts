import { excerpt, headline, type Sender } from "@harshi04/dogear/server";

/**
 * Posts to a Teams channel through a Workflows webhook ("Send webhook alerts to a channel"), as
 * an Adaptive Card: who did what, the comment's words, and a button back to the thread.
 */
export function teams(url: string, options: Pick<Sender, "events" | "when"> = {}): Sender {
  return {
    ...options,
    async send(event) {
      const card = {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        type: "AdaptiveCard",
        version: "1.4",
        body: [
          { type: "TextBlock", text: headline(event), weight: "Bolder", wrap: true },
          { type: "TextBlock", text: excerpt(event.comment), isSubtle: true, wrap: true },
        ],
        actions: [{ type: "Action.OpenUrl", title: "Open the thread", url: event.link }],
      };
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "message",
          attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", content: card }],
        }),
      });
      if (!response.ok) throw new Error(`teams answered ${response.status}`);
    },
  };
}
