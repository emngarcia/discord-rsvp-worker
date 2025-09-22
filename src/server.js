// src/server.js
import {
  verifyKey,
  InteractionType,
  InteractionResponseType,
  InteractionResponseFlags,
} from "discord-interactions";

// Custom IDs for our buttons
const YES = "YES_BTN";
const NO = "NO_BTN";
const MAYBE = "MAYBE_BTN";

/** Utility: JSON response */
function json(obj) {
  return new Response(JSON.stringify(obj), {
    headers: { "Content-Type": "application/json" },
  });
}

/** Utility: ephemeral reply payload */
function ephemeral(content) {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: InteractionResponseFlags.EPHEMERAL },
  };
}

/** Render the message content with a counts line on the second line */
function formatContentWithCounts(originalContent, totals) {
  const title =
    (originalContent?.split("\n")[0] ?? "").trim() || "Event";
  const counts = `Yes: ${totals.yes} | No: ${totals.no} | Maybe: ${totals.maybe}`;
  return `${title}\n${counts}`;
}

export default {
  async fetch(request, env) {
    // Health check
    // Quick diagnostics endpoint (GET /diag)
    // Returns booleans and lengths only — no secrets are exposed.
    if (request.method === "GET" && new URL(request.url).pathname === "/diag") {
    const pub = env.DISCORD_PUBLIC_KEY || "";
    const app = env.DISCORD_APPLICATION_ID || "";
    return new Response(JSON.stringify({
        hasPublicKey: !!pub,
        publicKeyLen: pub.length,       // should be ~64 for hex
        hasAppId: !!app,
        appIdLen: app.length
    }), { headers: { "Content-Type": "application/json" }});
    }

    if (request.method === "POST") {
        // --- REQUIRED: Verify Discord signature with RAW BYTES ---
        const signature = request.headers.get("x-signature-ed25519");
        const timestamp = request.headers.get("x-signature-timestamp");

        // Read the exact raw bytes (no string conversion!)
        const bodyBuffer = await request.arrayBuffer();

        const isValid = verifyKey(
        bodyBuffer,                 // pass ArrayBuffer directly
        signature,
        timestamp,
        env.DISCORD_PUBLIC_KEY      // 64-char hex from Dev Portal → General Information
        );

        if (!isValid) {
        console.error("verifyKey failed", {
            hasSig: !!signature,
            hasTs: !!timestamp,
            // do NOT log the body or key
        });
        return new Response("Bad request signature.", { status: 401 });
        }

        // Only now parse JSON
        const msg = JSON.parse(new TextDecoder().decode(bodyBuffer));

      // 1) Handshake (Discord will send this when you set Interactions URL)
      if (msg.type === InteractionType.PING) {
        return json({ type: InteractionResponseType.PONG });
      }

      // 2) Slash command: /event title: ...
      if (msg.type === InteractionType.APPLICATION_COMMAND) {
        const name = msg.data?.name?.toLowerCase();
        if (name === "event") {
          const eventTitle =
            msg.data.options?.find((o) => o.name === "title")?.value ??
            "Event";

          // Respond with message + 3 buttons
          return json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `**${eventTitle}**\nClick a button to RSVP.`,
              components: [
                {
                  type: 1, // action row
                  components: [
                    {
                      type: 2,
                      style: 3,
                      label: "Yes",
                      custom_id: YES,
                      emoji: { name: "✅" },
                    },
                    {
                      type: 2,
                      style: 4,
                      label: "No",
                      custom_id: NO,
                      emoji: { name: "❌" },
                    },
                    {
                      type: 2,
                      style: 2,
                      label: "Maybe",
                      custom_id: MAYBE,
                      emoji: { name: "❓" },
                    },
                  ],
                },
              ],
            },
          });
        }

        return json(ephemeral("Unknown command."));
      }

      // 3) Button presses (message components)
      if (msg.type === InteractionType.MESSAGE_COMPONENT) {
        // User info (nick/global/username)
        const user = msg.member?.user ?? msg.user;
        const username = user?.username ?? "unknown";
        const globalName = user?.global_name ?? null;
        const serverNick = msg.member?.nick ?? null;
        const display = serverNick || globalName || username;

        // Context
        const userId = user?.id ?? "unknown";
        const channelId = msg.channel_id ?? "";
        const messageId = msg.message?.id ?? "";
        const original = msg.message?.content ?? "";
        const eventTitle =
          (original.split("\n")[0] || "").replace(/\*\*/g, "").trim() ||
          `Event ${messageId}`;

        // Which button?
        let rsvp = null;
        if (msg.data?.custom_id === YES) rsvp = "Yes";
        else if (msg.data?.custom_id === NO) rsvp = "No";
        else if (msg.data?.custom_id === MAYBE) rsvp = "Maybe";
        if (!rsvp) return json(ephemeral("Unknown action."));

        // 3a) Upsert to Google Sheet via Apps Script; get totals back
        const payload = {
          eventTitle,
          userId,
          username,
          globalName,
          serverNick,
          display,
          rsvp,
          timestamp: new Date().toISOString(),
          messageId,
          channelId,
        };

        const writeRes = await fetch(env.SHEETS_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!writeRes.ok) {
          return json(ephemeral("Failed to record RSVP. Try again."));
        }
        const { ok: okWrite, totals } = await writeRes.json();
        if (!okWrite) {
          return json(ephemeral("Failed to record RSVP."));
        }

        // 3b) Edit the ORIGINAL message with new counts using interaction token
        const newContent = formatContentWithCounts(
          original,
          totals || { yes: 0, no: 0, maybe: 0 }
        );
        const appId = env.DISCORD_APPLICATION_ID;
        const token = msg.token; // interaction token

        const editRes = await fetch(
          `https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: newContent,
              components: msg.message.components, // keep buttons
            }),
          }
        );
        if (!editRes.ok) {
          console.error("Edit failed:", await editRes.text());
          // Even if edit fails, acknowledge the click so the user isn't stuck
        }

        // Ephemeral ack to the clicker
        return json(ephemeral(`Recorded: **${rsvp}**`));
      }

      // Fallback
      return new Response("Unhandled interaction type", { status: 400 });
    }

    return new Response("Method not allowed", { status: 405 });
  },
};
