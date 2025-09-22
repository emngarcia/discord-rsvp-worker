# Discord RSVP Worker (Cloudflare)

Slash command `/event title: ...` posts an RSVP message with buttons (Yes/No/Maybe).  
Button clicks write to Google Sheets and the message shows live counts.

## Deploy
1) Create a Google Sheet + Apps Script Web App (see Code.gs).  
2) Put these in Cloudflare Worker **secrets**:
- DISCORD_PUBLIC_KEY
- DISCORD_APPLICATION_ID
- SHEETS_ENDPOINT (Apps Script URL)

3) Connect this repo in Cloudflare Workers → “Deploy from GitHub”.
4) In Discord Developer Portal → Interactions Endpoint URL = Worker URL.
5) Register `/event` (run locally):
