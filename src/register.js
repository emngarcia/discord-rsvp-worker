import fetch from "node-fetch";
import { EVENT_COMMAND } from "./commands.js";

const token = process.env.DISCORD_TOKEN;           // Bot token for registering commands
const appId = process.env.DISCORD_APPLICATION_ID;  // Application ID

if (!token) throw new Error("DISCORD_TOKEN required");
if (!appId) throw new Error("DISCORD_APPLICATION_ID required");

async function registerGlobal() {
  const url = `https://discord.com/api/v10/applications/${appId}/commands`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type":"application/json",
      "Authorization": `Bot ${token}`
    },
    body: JSON.stringify([EVENT_COMMAND])
  });
  if (!res.ok) {
    console.error("Register error:", await res.text());
    throw new Error("Failed to register commands");
  }
  console.log("Registered commands globally.");
}
await registerGlobal();
