/**
 * One-time script to register Discord slash commands.
 *
 * Run with: npm run register-commands
 *
 * Requires env vars:
 *   DISCORD_APP_ID
 *   DISCORD_BOT_TOKEN
 */

const DISCORD_API = "https://discord.com/api/v10";

const commands = [
  {
    name: "alert",
    description: "Set a price alert",
    options: [
      {
        name: "above",
        description: "Alert when price goes above a level",
        type: 1, // SUB_COMMAND
        options: [
          { name: "ticker", description: "Stock ticker (e.g. NVDA)", type: 3, required: true },
          { name: "level", description: "Price level (e.g. 150)", type: 10, required: true },
        ],
      },
      {
        name: "below",
        description: "Alert when price goes below a level",
        type: 1,
        options: [
          { name: "ticker", description: "Stock ticker", type: 3, required: true },
          { name: "level", description: "Price level", type: 10, required: true },
        ],
      },
      {
        name: "move",
        description: "Alert on percentage move in a session",
        type: 1,
        options: [
          { name: "ticker", description: "Stock ticker", type: 3, required: true },
          { name: "percent", description: "Percentage threshold (e.g. 5)", type: 10, required: true },
        ],
      },
      {
        name: "remove",
        description: "Remove an alert by ID",
        type: 1,
        options: [
          { name: "id", description: "Alert ID number", type: 4, required: true },
        ],
      },
      {
        name: "clear",
        description: "Remove all your active alerts",
        type: 1,
      },
    ],
  },
  {
    name: "alerts",
    description: "List your active price alerts",
  },
  {
    name: "quiz",
    description: "Test your trading knowledge with a 10-question quiz",
    options: [
      {
        name: "book",
        description: "Book number (0 = General Basics, 1-18 = specific book)",
        type: 4, // INTEGER
        required: false,
      },
      {
        name: "chapter",
        description: "Chapter number (optional — for chapter-specific quizzes)",
        type: 4, // INTEGER
        required: false,
      },
    ],
  },
];

async function registerCommands() {
  const appId = process.env.DISCORD_APP_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!appId || !botToken) {
    console.error("Missing DISCORD_APP_ID or DISCORD_BOT_TOKEN env vars.");
    process.exit(1);
  }

  const url = `${DISCORD_API}/applications/${appId}/commands`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${botToken}`,
    },
    body: JSON.stringify(commands),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`Failed to register commands: ${response.status}`);
    console.error(error);
    process.exit(1);
  }

  const result = await response.json();
  console.log(`Successfully registered ${result.length} command(s):`);
  for (const cmd of result) {
    console.log(`  /${cmd.name} — ${cmd.description}`);
  }
}

registerCommands();
