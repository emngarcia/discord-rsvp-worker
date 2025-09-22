import {
  verifyKey,
  InteractionType,
  InteractionResponseType,
  InteractionResponseFlags
} from "discord-interactions";

const YES = "YES_BTN";
const NO = "NO_BTN";
const MAYBE = "MAYBE_BTN";

function json(obj) {
  return new Response(JSON.stringify(obj), {
    headers: { "Content-Type": "application/json" }
  });
}

function ephemeral(content) {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: InteractionResponseFlags.EPHEMERAL }
  };
}

function formatContentWithCounts(originalContent, totals) {
  const title = (originalContent?.split("\n")[0] ?? "").trim() || "Event";
  const counts = `Yes: ${totals.yes} | No: ${totals.no} | Maybe: ${totals.maybe}`;
  return `${title}\n${counts}`;
}

export default {
  async fetch(request, env) {
    if (request.method === "POST") {
      const signature = request.headers.get("x-signature-ed25519");
      const timestamp = request.headers.get("x-signature-timestamp");
      const raw = await request.text();

      const ok = verifyKey(
        new TextEncoder().encode(raw),
        signature,
        timestamp,
        env.DISCORD_PUBLIC_KEY
      );
      if (!ok) return new Response("Bad request signature.", { status: 401 });

      const msg = JSON.parse(raw);

      // 1) Ping
      if (msg.type === InteractionType.PING) {
        return json({ type: InteractionResponseType.PONG });
      }

      // 2) Slash command: /event title: ...
      if (msg.type === InteractionType.APPLICATION_COMMAND) {
        const name = msg.data.name.toLowerCase();
        if (name === "event") {
          const eventTitle = msg.data.options.find(o=>o.name==="title")?.value ?? "Event";
          return json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `**${eventTitle}**\nClick a button to RSVP.`,
              components: [
                {
                  type: 1, // action row
                  components: [
                    { type: 2, style: 3, label: "Yes",   custom_id: YES,   emoji: { name: "✅" } },
                    { type: 2, style: 4, label: "No",    custom_id: NO,    emoji: { name: "❌" } },
                    { type: 2, style: 2, label: "Maybe", custom_id: MAYBE, emoji: { name: "❓" } }
                  ]
                }
              ]
            }
          });
        }
        return json(ephemeral("Unknown command."));
      }

      // 3) Button presses
      if (msg.type === InteractionType.MESSAGE_COMPONENT) {
        const user = msg.member?.user ?? msg.user;
        const username   = user?.username ?? "unknown";
        const globalName = user?.global_name ?? null;
        const serverNick = msg.member?.nick ?? null;
        const display    = serverNick || globalName || username;

        const userId     = user?.id ?? "unknown";
        const channelId  = msg.channel_id ?? "";
        const messageId  = msg.message?.id ?? "";
        const original   = msg.message?.content ?? "";
        const eventTitle = (original.split("\n")[0] || "").replace(/\*\*/g,"").trim()
                           || `Event ${messageId}`;

        let rsvp = null;
        if (msg.data.custom_id === YES) rsvp = "Yes";
        else if (msg.data.custom_id === NO) rsvp = "No";
        else if (msg.data.custom_id === MAYBE) rsvp = "Maybe";
        if (!rsvp) return json(ephemeral("Unknown action."));

        // write to Sheets (and get totals back)
        const payload = {
          eventTitle, userId, username, globalName, serverNick, display,
          rsvp, timestamp: new Date().toISOString(), messageId, channelId
        };

        const res = await fetch(env.SHEETS_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type":"application/json" },
          body: JSON.stringify(payload)
        });

        if (!res.ok) return json(ephemeral("Failed to record RSVP. Try again."));
        const { ok:okWrite, totals } = await res.json();
        if (!okWrite) return json(ephemeral("Failed to record RSVP."));

        // edit the original message in-place using the interaction token (no bot token needed)
        const newContent = formatContentWithCounts(original, totals || {yes:0,no:0,maybe:0});
        const appId = env.DISCORD_APPLICATION_ID;
        const token = msg.token;

        const edit = await fetch(
          `https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`,
          {
            method: "PATCH",
            headers: { "Content-Type":"application/json" },
            body: JSON.stringify({
              content: newContent,
              components: msg.message.components // keep buttons
            })
          }
        );
        if (!edit.ok) {
          console.error("Edit failed:", await edit.text());
        }
        return json(ephemeral(`Recorded: **${rsvp}**`));
      }

      return new Response("Unhandled type", { status: 400 });
    }

    // health
    return new Response("OK");
  }
};
