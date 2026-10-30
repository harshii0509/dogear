import { excerpt, headline, type Sender } from "@harshi04/dogear/server";

/**
 * Turns each new thread into a Linear issue, with the thread attached as a link. When the thread
 * is resolved, the issue moves to `doneState`; reopened, back to `openState`. Each is optional,
 * and every id comes from Linear's command menu: "Copy model UUID".
 */
export function linear({
  apiKey,
  teamId,
  doneState,
  openState,
}: {
  apiKey: string;
  teamId: string;
  doneState?: string;
  openState?: string;
}): Sender {
  async function call(query: string, variables: Record<string, unknown>) {
    const response = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      // A personal API key goes as it is, without "Bearer".
      headers: { authorization: apiKey, "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    const result = await response.json();
    if (!response.ok || result.errors) throw new Error(`linear answered ${response.status}`);
    return result.data;
  }

  return {
    events: [
      "thread.created",
      ...(doneState ? (["thread.resolved"] as const) : []),
      ...(openState ? (["thread.reopened"] as const) : []),
    ],
    async send(event) {
      if (event.type === "thread.created") {
        const { issueCreate } = await call(
          `mutation ($input: IssueCreateInput!) { issueCreate(input: $input) { issue { id } } }`,
          {
            input: {
              teamId,
              title: excerpt(event.comment, 80),
              description: `${headline(event)}\n\n> ${excerpt(event.comment)}\n\n[Open the thread](${event.link})`,
            },
          },
        );
        // The thread's link is how a resolve finds this issue again.
        await call(
          `mutation ($input: AttachmentCreateInput!) { attachmentCreate(input: $input) { success } }`,
          { input: { issueId: issueCreate.issue.id, title: "Dogear thread", subtitle: event.page, url: event.link } },
        );
        return;
      }
      const stateId = event.type === "thread.resolved" ? doneState : openState;
      const { attachmentsForURL } = await call(
        `query ($url: String!) { attachmentsForURL(url: $url) { nodes { issue { id } } } }`,
        { url: event.link },
      );
      for (const { issue } of attachmentsForURL.nodes) {
        await call(
          `mutation ($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }`,
          { id: issue.id, input: { stateId } },
        );
      }
    },
  };
}
