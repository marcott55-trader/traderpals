/**
 * Quiz Leaderboard — #quiz
 *
 * Schedule:
 *   9:00 PM ET daily — Post daily leaderboard summary
 */

import { inngest } from "./client";
import { postEmbed } from "@/lib/discord";
import { supabase } from "@/lib/supabase";
import { isNearETTime, etCron } from "@/lib/market-hours";
import { COLORS } from "@/lib/embeds";
import type { DiscordEmbed } from "@/types/market";

const leaderboardCron = etCron(21, 0, "*"); // 9 PM ET daily (including weekends)

export const quizDailyLeaderboard = inngest.createFunction(
  {
    id: "quiz-daily-leaderboard",
    retries: 2,
    triggers: [{ cron: leaderboardCron }],
  },
  async ({ step }) => {
    const shouldRun: boolean = await step.run("check-schedule", async () => {
      return isNearETTime(21, 0);
    });
    if (!shouldRun) return { skipped: true };

    const posted = await step.run("post-leaderboard", async () => {
      // Get today's scores — best score per user
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);

      const { data: scores } = await supabase
        .from("quiz_scores")
        .select("discord_user_id, discord_username, score")
        .gte("completed_at", todayStart.toISOString())
        .order("score", { ascending: false });

      if (!scores || scores.length === 0) return false;

      // Best score per user
      const best = new Map<string, { username: string; score: number }>();
      for (const s of scores) {
        const existing = best.get(s.discord_user_id);
        if (!existing || s.score > existing.score) {
          best.set(s.discord_user_id, {
            username: s.discord_username,
            score: s.score,
          });
        }
      }

      const ranked = Array.from(best.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

      const medals = ["🥇", "🥈", "🥉"];
      const lines = ranked.map((entry, i) => {
        const prefix = medals[i] ?? `${i + 1}.`;
        return `${prefix} **${entry.username}** — ${entry.score}/10`;
      });

      const embed: DiscordEmbed = {
        title: "📊 Daily Quiz Leaderboard",
        color: COLORS.YELLOW,
        fields: [{
          name: `Today's Top Scores (${ranked.length} players)`,
          value: lines.join("\n"),
        }],
        footer: { text: "Take the quiz with /quiz • Resets daily" },
      };

      await postEmbed("quiz", embed);
      return true;
    });

    return { posted };
  }
);
