import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";

// Market Movers (existing)
import {
  premarketMovers,
  premarketUpdate,
  marketOpenMovers,
  intradayMoversEDT,
  intradayMoversEST,
  marketCloseMovers,
  afterHoursMovers,
} from "@/inngest/market-movers";

// Econ Calendar
import {
  econDailyCalendar,
  econAlertsEDT,
  econAlertsEST,
  econWeeklyPreview,
} from "@/inngest/econ-calendar";

// Earnings
import {
  earningsDailyCalendar,
  earningsBMOAlert,
  earningsAMCAlert,
  earningsBMOResultsEDT,
  earningsBMOResultsEST,
  earningsAMCResultsEDT,
  earningsAMCResultsEST,
  earningsWeeklyPreview,
} from "@/inngest/earnings";

// News
import {
  newsCompanyScanEDT,
  newsCompanyScanEST,
  newsMacroScanEDT,
  newsMacroScanEST,
} from "@/inngest/news-scan";

// Political News
import { politicalScan } from "@/inngest/political-scan";

// Price Alerts
import {
  priceAlertsRegularEDT,
  priceAlertsRegularEST,
  priceAlertsExtPreEDT,
  priceAlertsExtPreEST,
  priceAlertsExtPostEDT,
  priceAlertsExtPostEST,
} from "@/inngest/price-alerts";

// Flow / Sentiment — DISABLED: placeholder logic, no real signal yet.
// Uncomment when options/Reddit data sources are implemented.
// import {
//   flowShortInterest,
//   flowOptionsScanEDT,
//   flowOptionsScanEST,
//   flowRedditScan,
//   flowWeeklySqueezeWatch,
// } from "@/inngest/flow-scan";

// News cleanup
import { newsCleanup } from "@/inngest/news-cleanup";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    // Market Movers (7 functions)
    premarketMovers,
    premarketUpdate,
    marketOpenMovers,
    intradayMoversEDT,
    intradayMoversEST,
    marketCloseMovers,
    afterHoursMovers,

    // Econ Calendar (4 functions)
    econDailyCalendar,
    econAlertsEDT,
    econAlertsEST,
    econWeeklyPreview,

    // Earnings (8 functions)
    earningsDailyCalendar,
    earningsBMOAlert,
    earningsAMCAlert,
    earningsBMOResultsEDT,
    earningsBMOResultsEST,
    earningsAMCResultsEDT,
    earningsAMCResultsEST,
    earningsWeeklyPreview,

    // News (4 functions)
    newsCompanyScanEDT,
    newsCompanyScanEST,
    newsMacroScanEDT,
    newsMacroScanEST,

    // Political News (1 function)
    politicalScan,

    // Price Alerts (6 functions)
    priceAlertsRegularEDT,
    priceAlertsRegularEST,
    priceAlertsExtPreEDT,
    priceAlertsExtPreEST,
    priceAlertsExtPostEDT,
    priceAlertsExtPostEST,

    // Flow / Sentiment — DISABLED (placeholder)
    // flowShortInterest,
    // flowOptionsScanEDT,
    // flowOptionsScanEST,
    // flowRedditScan,
    // flowWeeklySqueezeWatch,

    // Maintenance (1 function)
    newsCleanup,
  ],
});
