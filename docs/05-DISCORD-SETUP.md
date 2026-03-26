# Discord Setup

How to configure the Discord server, webhooks, and slash commands for the serverless architecture.

---

## Step 1: Create Channels

Create a channel category and text channels:

```
📊 Trading Bots
├── #premarket
├── #news
├── #politics
├── #econ-calendar
├── #earnings
├── #alerts
├── #flow
└── #bot-logs          (admin only)
```

### Permissions
- All bot channels: **read-only** for members
- `#bot-logs`: visible to admins only
- Members interact via slash commands (work in any channel)

---

## Step 2: Create Webhooks (for posting)

For each channel:
1. Right-click channel → **Edit Channel** → **Integrations** → **Webhooks**
2. Click **New Webhook**
3. Name it (e.g., "TraderPals Bot")
4. Copy the webhook URL
5. Save it as a Vercel env var

| Channel          | Env Var Name                      |
| ---------------- | --------------------------------- |
| `#premarket`     | `DISCORD_WEBHOOK_PREMARKET`       |
| `#news`          | `DISCORD_WEBHOOK_NEWS`            |
| `#politics`      | `DISCORD_WEBHOOK_POLITICS`        |
| `#econ-calendar` | `DISCORD_WEBHOOK_ECON_CALENDAR`   |
| `#earnings`      | `DISCORD_WEBHOOK_EARNINGS`        |
| `#alerts`        | `DISCORD_WEBHOOK_ALERTS`          |
| `#flow`          | `DISCORD_WEBHOOK_FLOW`            |
| `#bot-logs`      | `DISCORD_WEBHOOK_BOT_LOGS`        |

Webhook URLs look like: `https://discord.com/api/webhooks/123456789/abcdef...`

---

## Step 3: Create a Discord Application (for slash commands)

Webhooks handle posting, but slash commands (`/alert`, `/alerts`, `/movers`) need a Discord Application:

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application** → name it "TraderPals"
3. Note the **Application ID** → `DISCORD_APP_ID`
4. Go to **General Information** → copy **Public Key** → `DISCORD_PUBLIC_KEY`
5. Go to **Bot** tab → click **Add Bot** → copy **Token** → `DISCORD_BOT_TOKEN`
6. Go to **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: (none needed — we post via webhooks, not the bot)
   - Copy URL → open it → select your server → authorize

### Set the Interactions Endpoint
7. Go to **General Information**
8. Set **Interactions Endpoint URL** to: `https://traderpals.net/api/discord/interactions`
9. Discord will verify the endpoint responds correctly before saving

---

## Step 4: Register Slash Commands

Run once (from your dev machine or a deploy script) to register commands with Discord:

```typescript
// scripts/register-commands.ts
const commands = [
  {
    name: "alert",
    description: "Set a price alert",
    options: [
      {
        name: "type",
        description: "Alert type",
        type: 3, // STRING
        required: true,
        choices: [
          { name: "above", value: "above" },
          { name: "below", value: "below" },
          { name: "ma", value: "ma_cross" },
          { name: "vwap", value: "vwap" },
          { name: "move", value: "pct_move" },
        ],
      },
      {
        name: "ticker",
        description: "Stock ticker (e.g. NVDA)",
        type: 3,
        required: true,
      },
      {
        name: "value",
        description: "Price level or MA period or % move",
        type: 10, // NUMBER
        required: false,
      },
    ],
  },
  {
    name: "alerts",
    description: "List your active price alerts",
  },
  {
    name: "alert-remove",
    description: "Remove a price alert by ID",
    options: [
      {
        name: "id",
        description: "Alert ID number",
        type: 4, // INTEGER
        required: true,
      },
    ],
  },
  {
    name: "alert-clear",
    description: "Remove all your price alerts",
  },
  {
    name: "movers",
    description: "Show current market movers",
  },
  {
    name: "watch",
    description: "Add a ticker to the group watchlist",
    options: [
      {
        name: "ticker",
        description: "Stock ticker to add (e.g. PLTR)",
        type: 3,
        required: true,
      },
    ],
  },
  {
    name: "unwatch",
    description: "Remove a ticker from the watchlist",
    options: [
      {
        name: "ticker",
        description: "Stock ticker to remove",
        type: 3,
        required: true,
      },
    ],
  },
];

// POST to Discord API to register
// Use guild commands for instant propagation during dev
// Use global commands for production (takes up to 1 hour to propagate)
```

---

## How It Differs From a Traditional Bot

| Traditional Bot (discord.py)              | This Setup (serverless)                    |
| ----------------------------------------- | ------------------------------------------ |
| Persistent process running 24/7           | Functions run on-demand, exit when done     |
| Bot appears "Online" in member list       | Bot does NOT show as online                 |
| Uses gateway WebSocket for events         | Uses webhook URLs for posting               |
| Slash commands via gateway events         | Slash commands via HTTP Interactions API    |
| Bot token used for everything             | Webhook URLs for posting, bot token only for registering commands + interactions |
| Crashes = messages stop until restart     | Each function is independent. One failure doesn't affect others. |

### About the Bot Being "Offline"
The bot won't show a green dot in Discord's member list because there's no gateway connection. Messages still post normally through webhooks. If the group cares about the green dot, a lightweight Cloudflare Worker can maintain a gateway heartbeat (~10 lines of code) as a Phase 2 addition.

---

## Troubleshooting

| Problem                          | Fix                                              |
| -------------------------------- | ------------------------------------------------ |
| Messages not posting             | Check webhook URL in Vercel env vars. Test with `curl -X POST <url> -H "Content-Type: application/json" -d '{"content":"test"}'` |
| Slash commands not appearing     | Wait up to 1 hour (global commands). Use guild commands during development for instant propagation. |
| "Interaction failed" on slash cmd | Check that `traderpals.net/api/discord/interactions` is responding. Check Vercel function logs. |
| Webhook deleted in Discord       | Create a new webhook for that channel, update the env var in Vercel. |
| Discord rate limiting            | Discord allows 5 messages/second per webhook. If hitting this, add delays between posts. |
