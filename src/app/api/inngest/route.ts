import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import {
  premarketMovers,
  premarketUpdate,
  marketOpenMovers,
  intradayMoversEDT,
  intradayMoversEST,
  marketCloseMovers,
  afterHoursMovers,
} from "@/inngest/market-movers";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    premarketMovers,
    premarketUpdate,
    marketOpenMovers,
    intradayMoversEDT,
    intradayMoversEST,
    marketCloseMovers,
    afterHoursMovers,
  ],
});
