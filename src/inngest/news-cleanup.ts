/**
 * News Cleanup — Maintenance function
 *
 * Runs daily at 3 AM UTC to delete posted_news entries older than 7 days.
 * This prevents the dedup table from growing indefinitely.
 */

import { inngest } from "./client";
import { supabase } from "@/lib/supabase";

export const newsCleanup = inngest.createFunction(
  {
    id: "news-cleanup",
    retries: 3,
    triggers: [{ cron: "0 3 * * *" }], // Daily at 3 AM UTC
  },
  async ({ step }) => {
    const deleted = await step.run("cleanup-old-news", async () => {
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const { count } = await supabase
        .from("posted_news")
        .delete({ count: "exact" })
        .lt("posted_at", cutoff);

      return count ?? 0;
    });

    // Also clean old bot logs (keep 30 days)
    const logsDeleted = await step.run("cleanup-old-logs", async () => {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const { count } = await supabase
        .from("bot_log")
        .delete({ count: "exact" })
        .lt("created_at", cutoff);

      return count ?? 0;
    });

    await step.run("log-cleanup", async () => {
      await supabase.from("bot_log").insert({
        module: "maintenance",
        action: "cleanup",
        details: { newsDeleted: deleted, logsDeleted },
      });
    });

    return { newsDeleted: deleted, logsDeleted };
  }
);
