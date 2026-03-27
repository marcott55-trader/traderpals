import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { isWebhookEnabledFor } from "@/lib/webhook-flags";

// Market Movers (existing)
import {
  premarketMovers,
  premarketUpdate,
  marketOpenMovers,
  intradayMovers,
  marketCloseMovers,
  afterHoursMovers,
} from "@/inngest/market-movers";
import {
  marketMapPremarket,
  marketMapOpen,
  marketMapMidday,
  marketMapClose,
} from "@/inngest/market-map";
import {
  sectorBreadthPremarket,
  sectorBreadthOpen,
  sectorBreadthMidday,
  sectorBreadthClose,
} from "@/inngest/sector-breadth";
import {
  keyLevelsPremarket,
  keyLevelsOpen,
  keyLevelsMidday,
} from "@/inngest/key-levels";

// Econ Calendar
import {
  econDailyCalendar,
  econFedSpeakerAlerts,
  econWeeklyPreview,
} from "@/inngest/econ-calendar";

// Earnings
import {
  earningsDailyCalendar,
  earningsBMOAlert,
  earningsAMCAlert,
  earningsBMOResults,
  earningsAMCResults,
  earningsWeeklyPreview,
} from "@/inngest/earnings";

// News
import {
  newsScan,
} from "@/inngest/news-scan";

// Political News
import { politicalScan } from "@/inngest/political-scan";

// Flow / Sentiment — short interest (FINRA) + Reddit scan
// Options flow scan remains disabled until Polygon Starter is confirmed
import {
  flowShortInterest,
  flowWeeklySqueezeWatch,
} from "@/inngest/flow-scan";

// News cleanup
import { newsCleanup } from "@/inngest/news-cleanup";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    // Market Movers (7 functions)
    premarketMovers,
    premarketUpdate,
    marketOpenMovers,
    intradayMovers,
    marketCloseMovers,
    afterHoursMovers,
    marketMapPremarket,
    marketMapOpen,
    marketMapMidday,
    marketMapClose,
    sectorBreadthPremarket,
    sectorBreadthOpen,
    sectorBreadthMidday,
    sectorBreadthClose,
    keyLevelsPremarket,
    keyLevelsOpen,
    keyLevelsMidday,

    // Econ Calendar (4 functions)
    econDailyCalendar,
    econWeeklyPreview,

    // Earnings
    earningsDailyCalendar,
    earningsBMOAlert,
    earningsAMCAlert,
    earningsWeeklyPreview,

    // Flow / Sentiment
    flowShortInterest,
    flowWeeklySqueezeWatch,

    // Maintenance
    newsCleanup,
    ...(!isWebhookEnabledFor("econ") ? [econFedSpeakerAlerts] : []),
    ...(!isWebhookEnabledFor("earnings") ? [earningsBMOResults, earningsAMCResults] : []),
    ...(!isWebhookEnabledFor("news") ? [newsScan] : []),
    ...(!isWebhookEnabledFor("politics") ? [politicalScan] : []),
  ],
});
