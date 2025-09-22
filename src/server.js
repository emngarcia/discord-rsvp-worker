// src/server.js
import {
  verifyKey,
  InteractionType,
  InteractionResponseType
} from "discord-interactions";

export default {
  async fetch(request, env) {
    // Optional: simple GET so your browser shows something
    if (request.method === "GET") {
      return new Response("Discord Worker up");
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // --- EXACT verification flow ---
    const signature = request.headers.get("x-signature-ed25519");
    const timestamp = request.headers.get("x-signature-timestamp");
    if (!signature || !timestamp) {
      return new Response("Missing signature headers", { status: 401 });
    }

    // Read raw body and pass a Uint8Array to verifyKey
    const ab = await request.arrayBuffer();
    const body = new Uint8Array(ab);

    const ok = verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY);
    if (!ok) {
      // Don’t log body or key; headers presence is enough for debugging
      console.error("verifyKey failed", { hasSig: !!signature, hasTs: !!timestamp });
      return new Response("Bad request signature.", { status: 401 });
    }

    // Only parse AFTER verification succeeds
    const msg = JSON.parse(new TextDecoder().decode(body));

    // Discord sends a PING when you save the Interactions URL
    if (msg.type === InteractionType.PING) {
      return new Response(
        JSON.stringify({ type: InteractionResponseType.PONG }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // For anything else, just 200 OK with a noop JSON (not required for verify)
    return new Response(
      JSON.stringify({ ok: true }),
      { headers: { "Content-Type": "application/json" } }
    );
  }
};
