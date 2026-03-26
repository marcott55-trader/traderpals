# 09 — Discord Server & Bot Setup

Step-by-step guide to configure your Discord server and register the bot.

---

## Step 1: Create Discord Channels

Create these text channels (under a "Trading Bots" category):

```
📊 Trading Bots
├── #premarket
├── #news
├── #politics        ← White House, tariffs, geopolitics
├── #econ-calendar
├── #earnings
├── #alerts
├── #flow
└── #bot-logs        ← errors and status updates (admin only)
```

### Channel Permissions
- Bot channels: **read-only** for members, **send messages** for bot role
- `#alerts`: members need to use slash commands here (or in a separate `#bot-commands` channel)
- `#bot-logs`: admin/mod only

---

## Step 2: Create the Discord Bot Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **"New Application"** → name it "TraderPals Bot" (or whatever you want)
3. Go to the **Bot** tab:
   - Click **"Add Bot"**
   - Copy the **Bot Token** → save to `.env` as `DISCORD_BOT_TOKEN`
   - Enable these **Privileged Gateway Intents**:
     - ✅ Message Content Intent
     - ✅ Server Members Intent (if you want to track who set alerts)
4. Go to **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions:
     - ✅ Send Messages
     - ✅ Send Messages in Threads
     - ✅ Embed Links
     - ✅ Attach Files
     - ✅ Read Message History
     - ✅ Use External Emojis
     - ✅ Add Reactions
     - ✅ Use Slash Commands
   - Copy the generated URL → open it → select your server → authorize

---

## Step 3: Get Channel IDs

1. In Discord: **Settings → Advanced → Enable Developer Mode**
2. Right-click each channel → **Copy Channel ID**
3. Paste into `config/channels.yaml`:

```yaml
channels:
  premarket: "1234567890123456789"
  news: "1234567890123456790"
  politics: "1234567890123456796"
  econ_calendar: "1234567890123456791"
  earnings: "1234567890123456792"
  alerts: "1234567890123456793"
  flow: "1234567890123456794"
  bot_logs: "1234567890123456795"
```

---

## Step 4: Get API Keys

### Polygon.io
1. Sign up at https://polygon.io
2. Free tier = 5 API calls/minute, 15-minute delayed data
3. Copy your API key → `.env` as `POLYGON_API_KEY`

### Finnhub
1. Sign up at https://finnhub.io
2. Free tier = 60 API calls/minute, real-time websocket (30 symbols)
3. Copy your API key → `.env` as `FINNHUB_API_KEY`

### Reddit (for sentiment bot)
1. Go to https://www.reddit.com/prefs/apps
2. Create a "script" type app
3. Note the client ID and secret → `.env` as `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET`

---

## Step 5: One Bot or Multiple Bots?

### Option A: Single Bot, Multiple Cogs (recommended for starting)

One bot token, one process. Each "bot" is a discord.py Cog (module).

**Pros:** Simple, one token, one process to manage
**Cons:** If it crashes, everything goes down

```python
# main.py structure
bot = commands.Bot(command_prefix="!", intents=intents)

# Load each module as a cog
await bot.load_extension("bots.market_movers.bot")
await bot.load_extension("bots.news.bot")
await bot.load_extension("bots.econ_calendar.bot")
await bot.load_extension("bots.earnings.bot")
await bot.load_extension("bots.price_alerts.bot")
await bot.load_extension("bots.flow.bot")
```

### Option B: Separate Bot per Channel (more resilient)

Each bot = separate Discord application + separate process.

**Pros:** Isolation — one crash doesn't kill others
**Cons:** 6 bot tokens, 6 processes, more complexity

**Recommendation:** Start with Option A. Split into separate bots later if stability is an issue.

---

## Step 6: Test Your Setup

```bash
# 1. Create .env from template
cp .env.example .env
# Edit .env with your actual keys

# 2. Install dependencies
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 3. Run the bot
python main.py

# 4. You should see in the console:
# "TraderPals Bot connected as TraderPals Bot#1234"
# "Loaded cog: MarketMovers"
# "Loaded cog: EconCalendar"
# etc.

# 5. In Discord, the bot should appear online
# Try: /alerts (should show the slash command)
```

---

## Bot Status Messages

Set the bot's Discord status to show useful info:

```python
# Rotate status every 60 seconds:
activity_messages = [
    "📊 Watching 25 tickers",
    "⏰ Next event: CPI at 8:30 AM",
    "💰 3 earnings after close today",
    "🔔 12 active price alerts",
]
```

---

## Troubleshooting

| Problem                    | Fix                                                |
| -------------------------- | -------------------------------------------------- |
| Bot appears offline        | Check token is correct. Check intents are enabled.  |
| Slash commands don't show  | Wait up to 1 hour for global commands to propagate. Use guild commands for instant. |
| Bot can't send messages    | Check channel permissions. Bot role needs Send Messages. |
| Rate limited by Discord    | You're sending too many messages. Add delays between posts. Discord limit: 5 msg/sec per channel. |
| API key not working        | Check .env file. Make sure no quotes around values. |
