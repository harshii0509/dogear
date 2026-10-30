import { excerpt, type Sender } from "@harshi04/dogear/server";

/** Notion's text property, cut to the 2000 characters it takes. */
const text = (content: string) => [{ text: { content: content.slice(0, 2000) } }];

/**
 * Keeps a Notion database of threads: a row for each new one (Comment, Status, Page, Author,
 * Link, Thread), whose Status follows it to Resolved and back to Open. `dataSource` is the
 * database's data source id: in Notion, the database's ⋯ menu, Manage data sources, Copy ID.
 */
export function notion({ token, dataSource }: { token: string; dataSource: string }): Sender {
  async function call(path: string, method: string, body: unknown) {
    const response = await fetch(`https://api.notion.com/v1/${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "notion-version": "2026-03-11",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`notion answered ${response.status}`);
    return response.json();
  }

  return {
    events: ["thread.created", "thread.resolved", "thread.reopened"],
    async send(event) {
      const status = { select: { name: event.type === "thread.resolved" ? "Resolved" : "Open" } };
      if (event.type === "thread.created") {
        await call("pages", "POST", {
          parent: { type: "data_source_id", data_source_id: dataSource },
          properties: {
            Comment: { title: text(excerpt(event.comment, 200)) },
            Status: status,
            Page: { rich_text: text(event.page) },
            Author: { rich_text: text(event.actor.name) },
            Link: { url: event.link },
            Thread: { rich_text: text(event.comment.id) },
          },
        });
        return;
      }
      // A thread started before the connector has no row; there's nothing to update.
      const found = await call(`data_sources/${dataSource}/query`, "POST", {
        filter: { property: "Thread", rich_text: { equals: event.comment.id } },
        page_size: 1,
      });
      const row = found.results[0];
      if (row) await call(`pages/${row.id}`, "PATCH", { properties: { Status: status } });
    },
  };
}
