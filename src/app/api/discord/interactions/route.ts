/**
 * Discord Interactions API Route
 *
 * Handles slash commands from Discord:
 *   /alert above NVDA 150
 *   /alert below TSLA 180
 *   /alert move NVDA 5
 *   /alerts              — List active alerts
 *   /alert remove 3      — Remove alert by ID
 *   /alert clear          — Remove all user's alerts
 *
 * Discord sends HTTP POST requests here. We must:
 * 1. Verify the request signature
 * 2. Handle PING (type 1) for Discord URL verification
 * 3. Parse and execute commands (type 2)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { MAX_ALERTS_PER_USER } from "@/types/alerts";
import type { AlertType } from "@/types/alerts";
import { hasCompanyProfile } from "@/lib/finnhub";
import { isValidTickerFormat, normalizeTicker } from "@/lib/tickers";
import {
  getRandomQuestionIds,
  getQuestionById,
  getAvailableBooks,
  getBookQuestions,
  QUIZ_LENGTH,
} from "@/lib/quiz";

// Discord interaction types
const INTERACTION_TYPE_PING = 1;
const INTERACTION_TYPE_COMMAND = 2;
const INTERACTION_TYPE_COMPONENT = 3;

// Discord response types
const RESPONSE_PONG = 1;
const RESPONSE_MESSAGE = 4;
const RESPONSE_UPDATE_MESSAGE = 7;

// ── Signature verification ──────────────────────────────────────────

async function verifyDiscordSignature(
  request: NextRequest,
  body: string
): Promise<boolean> {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) throw new Error("Missing DISCORD_PUBLIC_KEY");

  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");

  if (!signature || !timestamp) return false;

  try {
    const encoder = new TextEncoder();
    const keyBytes = hexToBytes(publicKey);
    const key = await crypto.subtle.importKey(
      "raw",
      keyBytes.buffer as ArrayBuffer,
      { name: "Ed25519" },
      false,
      ["verify"]
    );

    const message = encoder.encode(timestamp + body);
    const sig = hexToBytes(signature);

    return await crypto.subtle.verify("Ed25519", key, sig.buffer as ArrayBuffer, message);
  } catch {
    return false;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// ── Supabase client ─────────────────────────────────────────────────

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key);
}

// ── Command handlers ────────────────────────────────────────────────

interface CommandOption {
  name: string;
  value: string | number;
}

function respond(content: string) {
  return NextResponse.json({
    type: RESPONSE_MESSAGE,
    data: { content },
  });
}

async function handleAlertCommand(
  subcommand: string,
  options: CommandOption[],
  userId: string,
  username: string
): Promise<NextResponse> {
  const supabase = getSupabase();

  // Get option values as a map
  const opts = new Map(options.map((o) => [o.name, o.value]));

  switch (subcommand) {
    case "above":
    case "below": {
      const ticker = normalizeTicker(String(opts.get("ticker") ?? ""));
      const level = Number(opts.get("level"));

      if (!ticker || !isValidTickerFormat(ticker) || isNaN(level) || level <= 0) {
        return respond("Usage: /alert above TICKER PRICE");
      }

      if (!(await hasCompanyProfile(ticker))) {
        return respond(`Ticker **${ticker}** was not recognized. Double-check the symbol and try again.`);
      }

      // Check max alerts per user
      const { count, error: countError } = await supabase
        .from("price_alerts")
        .select("id", { count: "exact", head: true })
        .eq("discord_user_id", userId)
        .eq("active", true);

      if (countError) {
        return respond("Failed to check your active alerts. Please try again.");
      }

      if ((count ?? 0) >= MAX_ALERTS_PER_USER) {
        return respond(`You have ${MAX_ALERTS_PER_USER} active alerts (max). Remove some first with \`/alert remove\`.`);
      }

      const { error } = await supabase.from("price_alerts").insert({
        ticker,
        alert_type: subcommand as AlertType,
        level,
        discord_user_id: userId,
        discord_username: username,
      });

      if (error) return respond("Failed to save alert. Please try again.");

      const direction = subcommand === "above" ? ">" : "<";
      return respond(`Alert set: **${ticker}** ${direction} **$${level.toFixed(2)}**`);
    }

    case "ma":
    case "vwap":
      return respond("MA cross and VWAP alerts are not yet supported. Coming soon.");

    case "move": {
      const ticker = normalizeTicker(String(opts.get("ticker") ?? ""));
      const pct = Number(opts.get("percent"));

      if (!ticker || !isValidTickerFormat(ticker) || isNaN(pct) || pct <= 0) {
        return respond("Usage: /alert move TICKER PERCENT");
      }

      if (!(await hasCompanyProfile(ticker))) {
        return respond(`Ticker **${ticker}** was not recognized. Double-check the symbol and try again.`);
      }

      const { error } = await supabase.from("price_alerts").insert({
        ticker,
        alert_type: "pct_move" as AlertType,
        level: pct,
        discord_user_id: userId,
        discord_username: username,
      });

      if (error) return respond("Failed to save alert. Please try again.");

      return respond(`Alert set: **${ticker}** moves **${pct}%** in a session`);
    }

    case "remove": {
      const alertId = Number(opts.get("id"));
      if (isNaN(alertId)) return respond("Usage: /alert remove ID");

      const { error } = await supabase
        .from("price_alerts")
        .delete()
        .eq("id", alertId)
        .eq("discord_user_id", userId); // Users can only remove their own

      if (error) return respond("Failed to remove alert.");
      return respond(`Alert #${alertId} removed.`);
    }

    case "clear": {
      const { count, error } = await supabase
        .from("price_alerts")
        .delete({ count: "exact" })
        .eq("discord_user_id", userId)
        .eq("active", true);

      if (error) return respond("Failed to clear alerts. Please try again.");
      return respond(`Cleared **${count ?? 0}** active alert${(count ?? 0) === 1 ? "" : "s"}.`);
    }

    default:
      return respond("Unknown subcommand. Try: above, below, move, remove, clear");
  }
}

async function handleAlertsListCommand(userId: string): Promise<NextResponse> {
  const supabase = getSupabase();

  const { data: alerts, error } = await supabase
    .from("price_alerts")
    .select("*")
    .eq("discord_user_id", userId)
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error) {
    return respond("Failed to load your alerts. Please try again.");
  }

  if (!alerts || alerts.length === 0) {
    return respond("You have no active alerts. Set one with `/alert above TICKER PRICE`.");
  }

  const lines = alerts.map((a) => {
    const typeStr =
      a.alert_type === "above" ? `> $${a.level}` :
      a.alert_type === "below" ? `< $${a.level}` :
      a.alert_type === "ma_cross" ? `× ${a.ma_period}-day MA` :
      a.alert_type === "vwap" ? "× VWAP" :
      a.alert_type === "pct_move" ? `${a.level}% move` : a.alert_type;

    return `#${a.id}  **${a.ticker}** ${typeStr}`;
  });

  return respond(`**Your Active Alerts (${alerts.length}):**\n${lines.join("\n")}`);
}

// ── Quiz handlers ──────────────────────────────────────────────────

const ANSWER_LABELS = ["A", "B", "C", "D"] as const;

function buildQuestionEmbed(
  bookId: number,
  questionIds: number[],
  index: number,
  quizLen: number,
  score: number,
  feedback?: string
) {
  const qId = questionIds[index];
  const q = getQuestionById(bookId, qId);
  if (!q) return null;

  const optionLines = q.options
    .map((opt, i) => `**${ANSWER_LABELS[i]}.** ${opt}`)
    .join("\n");

  const questionText = `**${q.question}**`;
  const description = feedback
    ? `${feedback}\n\n${questionText}\n\n${optionLines}`
    : `${questionText}\n\n${optionLines}`;

  return {
    title: `Question ${index + 1}/${quizLen}`,
    description,
    color: 0x5865f2, // Discord blurple
    fields: [
      { name: "Topic", value: q.topic, inline: true },
      { name: "Score", value: `${score}/${index}`, inline: true },
    ],
  };
}

function buildQuestionButtons(
  bookId: number,
  questionIds: number[],
  index: number,
  quizLen: number,
  score: number
) {
  // custom_id format: quiz:{bookId}:{questionIds}:{index}:{answer}:{score}:{quizLen}
  const idsStr = questionIds.join("-");
  return {
    type: 1, // ACTION_ROW
    components: ANSWER_LABELS.map((label, i) => ({
      type: 2, // BUTTON
      style: 1, // PRIMARY
      label,
      custom_id: `quiz:${bookId}:${idsStr}:${index}:${i}:${score}:${quizLen}`,
    })),
  };
}

function handleQuizCommand(options: CommandOption[]): NextResponse {
  const opts = new Map(options.map((o) => [o.name, o.value]));
  const bookIdOpt = opts.get("book");

  // If no book specified, show the book selection menu
  if (bookIdOpt == null) {
    const books = getAvailableBooks();
    if (books.length === 0) {
      return respondEphemeral("No quizzes available yet.");
    }

    const selectOptions = books.map((b) => ({
      label: `#${b.id} — ${b.shortTitle}`,
      value: String(b.id),
    }));

    return NextResponse.json({
      type: RESPONSE_MESSAGE,
      data: {
        embeds: [{
          title: "📚 Select a Quiz",
          description: "Choose a book below to test your knowledge.\nYou'll get 10 random questions — answer A/B/C/D.\nYour score is tracked and posted on the daily leaderboard!",
          color: 0x5865f2,
        }],
        components: [{
          type: 1, // ACTION_ROW
          components: [{
            type: 3, // STRING_SELECT
            custom_id: "quiz_select",
            placeholder: "Choose a book...",
            options: selectOptions,
          }],
        }],
        flags: 64, // ephemeral
      },
    });
  }

  // Book specified — start the quiz
  const bookId = Number(bookIdOpt);
  const chapter = opts.has("chapter") ? Number(opts.get("chapter")) : undefined;
  return startQuiz(bookId, chapter);
}

function startQuiz(bookId: number, chapter?: number): NextResponse {
  const pool = getBookQuestions(bookId, chapter);
  if (pool.length === 0) {
    return respondEphemeral(
      chapter != null
        ? `No questions found for Book #${bookId}, Chapter ${chapter}.`
        : `No questions found for Book #${bookId}.`
    );
  }

  const quizLen = Math.min(QUIZ_LENGTH, pool.length);
  const questionIds = getRandomQuestionIds(bookId, quizLen, chapter);
  const embed = buildQuestionEmbed(bookId, questionIds, 0, quizLen, 0);
  const actionRow = buildQuestionButtons(bookId, questionIds, 0, quizLen, 0);

  const books = getAvailableBooks();
  const book = books.find((b) => b.id === bookId);
  const bookTitle = book?.shortTitle ?? `Book #${bookId}`;

  return NextResponse.json({
    type: RESPONSE_MESSAGE,
    data: {
      embeds: [
        {
          title: `📖 ${bookTitle}${chapter != null ? ` — Chapter ${chapter}` : ""}`,
          description: `${quizLen} questions — pick A/B/C/D for each. Good luck!`,
          color: 0x5865f2,
        },
        ...(embed ? [embed] : []),
      ],
      components: [actionRow],
      flags: 64, // ephemeral
    },
  });
}

function respondEphemeral(content: string): NextResponse {
  return NextResponse.json({
    type: RESPONSE_MESSAGE,
    data: { content, flags: 64 },
  });
}

function handleQuizSelect(values: string[]): NextResponse {
  const bookId = parseInt(values[0], 10);
  if (isNaN(bookId)) return respondEphemeral("Invalid selection.");
  return startQuiz(bookId);
}

async function handleQuizButton(
  customId: string,
  userId: string,
  username: string
): Promise<NextResponse> {
  // Parse: quiz:{bookId}:{ids}:{index}:{answer}:{score}:{quizLen}
  const parts = customId.split(":");
  if (parts.length !== 7) {
    return NextResponse.json({
      type: RESPONSE_UPDATE_MESSAGE,
      data: { content: "Something went wrong. Try `/quiz` again.", components: [] },
    });
  }

  const bookId = parseInt(parts[1], 10);
  const questionIds = parts[2].split("-").map(Number);
  const index = parseInt(parts[3], 10);
  const selectedAnswer = parseInt(parts[4], 10);
  const previousScore = parseInt(parts[5], 10);
  const quizLen = parseInt(parts[6], 10);

  // Grade the current question
  const currentQ = getQuestionById(bookId, questionIds[index]);
  const isCorrect = currentQ ? selectedAnswer === currentQ.answer : false;
  const newScore = previousScore + (isCorrect ? 1 : 0);

  const correctLabel = currentQ ? ANSWER_LABELS[currentQ.answer] : "?";
  const explanation = currentQ?.explanation ?? "";
  const feedback = isCorrect
    ? `✅ Correct! ${explanation}`
    : `❌ Wrong — the answer was **${correctLabel}**. ${explanation}`;

  const nextIndex = index + 1;

  // Quiz complete
  if (nextIndex >= quizLen) {
    // Save score
    const supabase = getSupabase();
    await supabase.from("quiz_scores").insert({
      discord_user_id: userId,
      discord_username: username,
      score: newScore,
      total: quizLen,
      book_id: bookId,
    });

    const pct = Math.round((newScore / quizLen) * 100);
    const color = pct >= 80 ? 0x57f287 : pct >= 50 ? 0xfee75c : 0xed4245;
    const message =
      newScore === quizLen ? "Perfect score! 🏆" :
      pct >= 80 ? "Great job! 🎯" :
      pct >= 50 ? "Not bad — keep studying! 📚" :
      "Keep learning — review the Trader University channels! 💪";

    const books = getAvailableBooks();
    const bookTitle = books.find((b) => b.id === bookId)?.shortTitle ?? `Book #${bookId}`;

    return NextResponse.json({
      type: RESPONSE_UPDATE_MESSAGE,
      data: {
        embeds: [{
          title: `Quiz Complete — ${bookTitle}`,
          description: `${feedback}\n\nYou scored **${newScore}/${quizLen}** (${pct}%)\n\n${message}`,
          color,
        }],
        components: [],
      },
    });
  }

  // Next question
  const embed = buildQuestionEmbed(bookId, questionIds, nextIndex, quizLen, newScore, feedback);
  const actionRow = buildQuestionButtons(bookId, questionIds, nextIndex, quizLen, newScore);

  return NextResponse.json({
    type: RESPONSE_UPDATE_MESSAGE,
    data: {
      embeds: embed ? [embed] : [],
      components: [actionRow],
    },
  });
}

// ── Main handler ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const body = await request.text();

  // Verify Discord signature
  const isValid = await verifyDiscordSignature(request, body);
  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const interaction = JSON.parse(body);

  // Handle PING (Discord URL verification)
  if (interaction.type === INTERACTION_TYPE_PING) {
    return NextResponse.json({ type: RESPONSE_PONG });
  }

  // Handle slash commands
  if (interaction.type === INTERACTION_TYPE_COMMAND) {
    const commandName = interaction.data.name;
    const userId = interaction.member?.user?.id ?? interaction.user?.id;
    const username = interaction.member?.user?.username ?? interaction.user?.username ?? "unknown";
    const options = interaction.data.options ?? [];

    if (commandName === "alert") {
      const subcommand = options[0]?.name;
      const subOptions = options[0]?.options ?? [];
      return handleAlertCommand(subcommand, subOptions, userId, username);
    }

    if (commandName === "alerts") {
      return handleAlertsListCommand(userId);
    }

    if (commandName === "quiz") {
      return handleQuizCommand(options);
    }

    return respond("Unknown command.");
  }

  // Handle button interactions (quiz answers)
  if (interaction.type === INTERACTION_TYPE_COMPONENT) {
    const customId: string = interaction.data.custom_id ?? "";
    const userId = interaction.member?.user?.id ?? interaction.user?.id;
    const username = interaction.member?.user?.username ?? interaction.user?.username ?? "unknown";

    if (customId === "quiz_select") {
      const values: string[] = interaction.data.values ?? [];
      return handleQuizSelect(values);
    }

    if (customId.startsWith("quiz:")) {
      return handleQuizButton(customId, userId, username);
    }

    return NextResponse.json({
      type: RESPONSE_UPDATE_MESSAGE,
      data: { content: "Unknown interaction." },
    });
  }

  return NextResponse.json({ error: "Unknown interaction type" }, { status: 400 });
}
