# 08 — Deployment Guide

How to run the bots reliably 24/5 during market hours.

---

## Hosting Options

| Option            | Cost       | Pros                             | Cons                        |
| ----------------- | ---------- | -------------------------------- | --------------------------- |
| **Railway.app**   | ~$5/mo     | Easy deploy, auto-restart, logs  | Limited free tier            |
| **DigitalOcean**  | $6/mo      | Full VPS, reliable, SSH access   | More setup required          |
| **Render**        | Free–$7/mo | Simple, git deploy               | Free tier sleeps after 15min |
| **Fly.io**        | ~$5/mo     | Good free tier, global edge      | Learning curve               |
| **Raspberry Pi**  | $0/mo      | No recurring cost, full control  | Must keep it running at home |
| **Your own Mac**  | $0/mo      | Already have it                  | Must keep it running, not ideal |

**Recommended for starting:** Railway or DigitalOcean $6/mo droplet.

---

## Option 1: Docker Compose (recommended)

### docker-compose.yml

```yaml
version: "3.8"

services:
  traderpals-bot:
    build: .
    restart: unless-stopped
    env_file:
      - .env
    volumes:
      - ./config:/app/config
      - ./data:/app/data    # SQLite database
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### Dockerfile

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "main.py"]
```

### Commands

```bash
# Build and start
docker compose up -d

# View logs
docker compose logs -f

# Restart after code changes
docker compose up -d --build

# Stop
docker compose down
```

---

## Option 2: Systemd Service (VPS without Docker)

```ini
# /etc/systemd/system/traderpals.service
[Unit]
Description=TraderPals Discord Bots
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/home/deploy/traderpals
ExecStart=/home/deploy/traderpals/venv/bin/python main.py
Restart=always
RestartSec=10
EnvironmentFile=/home/deploy/traderpals/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable traderpals
sudo systemctl start traderpals
sudo journalctl -u traderpals -f  # view logs
```

---

## Option 3: Railway Deploy

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and init
railway login
railway init

# Set environment variables
railway variables set DISCORD_BOT_TOKEN=xxx
railway variables set POLYGON_API_KEY=xxx
railway variables set FINNHUB_API_KEY=xxx

# Deploy
railway up
```

Add a `Procfile`:
```
worker: python main.py
```

---

## Environment Setup

### requirements.txt

```
discord.py>=2.3.0
aiohttp>=3.9.0
python-dotenv>=1.0.0
pyyaml>=6.0
apscheduler>=3.10.0
finnhub-python>=2.4.0
yfinance>=0.2.30
aiosqlite>=0.19.0
websockets>=12.0
```

### Python Version
- Python 3.11+ recommended
- Use `pyenv` or Docker to pin the version

---

## Monitoring

### Health Check Endpoint (optional)
Run a tiny HTTP server alongside the bot for health checks:

```python
# In main.py — a /health endpoint for Railway/Docker health checks
# Returns 200 if bot is connected to Discord
# Returns 503 if disconnected
```

### Logging Strategy

```python
import logging

# Log levels:
# DEBUG   — API responses, websocket messages (dev only)
# INFO    — Bot started, task ran, message posted
# WARNING — Rate limited, API returned empty, retrying
# ERROR   — API failed, websocket disconnected, unhandled exception

# Log to:
# 1. stdout (for Docker/Railway)
# 2. Optional: #bot-logs Discord channel for errors
```

### Uptime Monitoring
- Use [UptimeRobot](https://uptimerobot.com) (free) to ping a health endpoint
- Or check the bot's Discord status — if it goes offline, you'll see it

---

## Updating the Bots

```bash
# On VPS
cd /home/deploy/traderpals
git pull
sudo systemctl restart traderpals

# With Docker
cd /home/deploy/traderpals
git pull
docker compose up -d --build

# On Railway
git push  # auto-deploys
```

---

## Backup

- **SQLite database:** Back up `data/traderpals.db` daily
- **Config files:** Already in git
- **Environment variables:** Store a copy in a password manager (1Password, Bitwarden)

---

## Cost Summary

| Item              | Monthly Cost |
| ----------------- | ------------ |
| Hosting (Railway) | $5           |
| Polygon.io free   | $0           |
| Finnhub free      | $0           |
| Discord bot       | $0           |
| **Total (V1)**    | **$5/mo**    |

### With upgrades:
| Item              | Monthly Cost |
| ----------------- | ------------ |
| Hosting           | $5           |
| Polygon Starter   | $29          |
| Unusual Whales    | $40–100      |
| **Total (V2)**    | **$74–134/mo** |

> Start with V1. Upgrade when the group decides it's worth it.
