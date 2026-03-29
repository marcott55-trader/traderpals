/**
 * Quiz Question Bank — Beginner Trading Knowledge
 *
 * Sourced from TraderPals Trader University materials:
 *   - Beginner Day Trader Roadmap
 *   - Futures Terms Guide
 *   - Wash Sale Rule Guide
 */

export interface QuizQuestion {
  id: number;
  topic: string;
  question: string;
  options: [string, string, string, string];
  answer: number; // 0-3 index
}

export const QUIZ_LENGTH = 10;

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  // ── Day Trading Basics (from Beginner Day Trader Roadmap) ──────────
  {
    id: 1,
    topic: "Day Trading Basics",
    question: "What is the main focus of day trading?",
    options: [
      "Holding positions for weeks or months",
      "Profiting from intraday price movement",
      "Collecting dividends from stocks",
      "Buying and holding index funds",
    ],
    answer: 1,
  },
  {
    id: 2,
    topic: "Day Trading Basics",
    question: "According to the Beginner Roadmap, what should you do BEFORE going live with real money?",
    options: [
      "Deposit at least $25,000",
      "Subscribe to a stock picking service",
      "Backtest and paper trade your strategy",
      "Buy the most popular stock on social media",
    ],
    answer: 2,
  },
  {
    id: 3,
    topic: "Day Trading Basics",
    question: "What is the recommended maximum risk per trade for a beginner day trader?",
    options: [
      "10% of your account",
      "5% of your account",
      "1% of your account",
      "50% of your account",
    ],
    answer: 2,
  },
  {
    id: 4,
    topic: "Day Trading Basics",
    question: "What is the recommended maximum daily risk for a beginner?",
    options: [
      "3% of your account",
      "10% of your account",
      "25% of your account",
      "No limit — keep trading until you make it back",
    ],
    answer: 0,
  },
  {
    id: 5,
    topic: "Day Trading Basics",
    question: "Why is journaling every trade important?",
    options: [
      "The IRS requires it for all traders",
      "It helps you track entries, exits, setups, emotions, and lessons",
      "Your broker will close your account without a journal",
      "It replaces the need for a trading plan",
    ],
    answer: 1,
  },
  {
    id: 6,
    topic: "Day Trading Basics",
    question: "What does 'mastering your psychology' as a trader mean?",
    options: [
      "Never feeling any emotions while trading",
      "Avoiding FOMO, revenge trades, and overtrading",
      "Only trading when you feel lucky",
      "Ignoring your losses completely",
    ],
    answer: 1,
  },

  // ── Market Sessions & Order Types ──────────────────────────────────
  {
    id: 7,
    topic: "Market Sessions",
    question: "What are the regular US stock market trading hours (Eastern Time)?",
    options: [
      "8:00 AM – 4:00 PM",
      "9:30 AM – 4:00 PM",
      "9:00 AM – 3:30 PM",
      "7:00 AM – 5:00 PM",
    ],
    answer: 1,
  },
  {
    id: 8,
    topic: "Market Sessions",
    question: "What is 'pre-market' trading?",
    options: [
      "Trading that happens before you open your broker app",
      "Trading before regular market hours, typically starting at 4:00 AM ET",
      "A simulated practice environment",
      "Trading only available to institutional investors",
    ],
    answer: 1,
  },
  {
    id: 9,
    topic: "Market Sessions",
    question: "What type of order guarantees execution but NOT the price?",
    options: [
      "Limit order",
      "Stop-limit order",
      "Market order",
      "Trailing stop order",
    ],
    answer: 2,
  },
  {
    id: 10,
    topic: "Market Sessions",
    question: "What type of order lets you set the maximum price you're willing to pay?",
    options: [
      "Market order",
      "Limit order",
      "Stop order",
      "Fill-or-kill order",
    ],
    answer: 1,
  },
  {
    id: 11,
    topic: "Market Sessions",
    question: "What is the Pattern Day Trader (PDT) rule?",
    options: [
      "You must trade at least 4 times per week",
      "Accounts under $25,000 are limited to 3 day trades in 5 business days",
      "You can only day trade penny stocks",
      "You need a special license to day trade",
    ],
    answer: 1,
  },
  {
    id: 12,
    topic: "Market Sessions",
    question: "Why is liquidity typically lower during pre-market and after-hours sessions?",
    options: [
      "The exchanges are closed",
      "Only market makers can trade",
      "Fewer participants are trading, leading to wider spreads",
      "Stocks are frozen during those times",
    ],
    answer: 2,
  },

  // ── Technical Analysis ─────────────────────────────────────────────
  {
    id: 13,
    topic: "Technical Analysis",
    question: "What does VWAP stand for?",
    options: [
      "Value Weighted Asset Price",
      "Volume Weighted Average Price",
      "Volatility Weighted Annual Percentage",
      "Variable Width Average Pattern",
    ],
    answer: 1,
  },
  {
    id: 14,
    topic: "Technical Analysis",
    question: "If a stock is trading ABOVE VWAP, what does that generally indicate?",
    options: [
      "Bearish sentiment — sellers are in control",
      "The stock is about to be halted",
      "Bullish sentiment — intraday buyers are in control",
      "The stock has low volume",
    ],
    answer: 2,
  },
  {
    id: 15,
    topic: "Technical Analysis",
    question: "What are common EMA periods used by day traders according to the Roadmap?",
    options: [
      "3, 7, and 14",
      "9, 21, and 55",
      "100, 200, and 500",
      "1, 2, and 3",
    ],
    answer: 1,
  },
  {
    id: 16,
    topic: "Technical Analysis",
    question: "What is a 'support level'?",
    options: [
      "A price level where a stock tends to stop falling and bounce",
      "The highest price a stock has ever reached",
      "A price level set by the SEC",
      "The price where your broker blocks your order",
    ],
    answer: 0,
  },
  {
    id: 17,
    topic: "Technical Analysis",
    question: "What is a 'breakout' setup?",
    options: [
      "When a stock splits into two tickers",
      "When price moves through a key resistance level with volume",
      "When a stock drops 50% in one day",
      "When you break out of a losing streak",
    ],
    answer: 1,
  },
  {
    id: 18,
    topic: "Technical Analysis",
    question: "What is a 'bull flag' pattern?",
    options: [
      "A flag that appears on bullish news headlines",
      "A sharp move up followed by a slight consolidation, suggesting continuation higher",
      "A pattern that only appears on monthly charts",
      "When the stock price forms the letter F on the chart",
    ],
    answer: 1,
  },

  // ── Futures Basics (from Futures Terms Guide) ──────────────────────
  {
    id: 19,
    topic: "Futures Basics",
    question: "What is a futures contract?",
    options: [
      "A loan from your broker to trade stocks",
      "An agreement to buy or sell an asset at a predetermined price on a future date",
      "A stock that will be listed in the future",
      "A savings bond issued by the government",
    ],
    answer: 1,
  },
  {
    id: 20,
    topic: "Futures Basics",
    question: "What is 'margin' in futures trading?",
    options: [
      "The profit you make on a trade",
      "The money required to open and maintain a futures position, acting as a security deposit",
      "The space between the bid and ask price",
      "The commission your broker charges",
    ],
    answer: 1,
  },
  {
    id: 21,
    topic: "Futures Basics",
    question: "What happens if your account falls below the 'maintenance margin'?",
    options: [
      "Your account is automatically closed",
      "You receive a margin call and must add funds",
      "The exchange adds money to your account",
      "Nothing — it only matters at expiration",
    ],
    answer: 1,
  },
  {
    id: 22,
    topic: "Futures Basics",
    question: "What does 'going long' in futures mean?",
    options: [
      "Holding a position for a long time",
      "Buying a contract expecting the price will rise",
      "Selling a contract expecting the price will fall",
      "Borrowing shares from your broker",
    ],
    answer: 1,
  },
  {
    id: 23,
    topic: "Futures Basics",
    question: "What does 'going short' in futures mean?",
    options: [
      "Holding a position for a short time",
      "Buying a contract with a short expiration",
      "Selling a contract expecting the price will fall",
      "Trading micro contracts instead of full-size",
    ],
    answer: 2,
  },
  {
    id: 24,
    topic: "Futures Basics",
    question: "What is 'open interest' in futures?",
    options: [
      "How interested traders are in a contract",
      "The total number of outstanding contracts that have not been settled",
      "The interest rate charged on margin",
      "The number of people watching a ticker",
    ],
    answer: 1,
  },

  // ── Wash Sale Rule & Tax Rules ─────────────────────────────────────
  {
    id: 25,
    topic: "Wash Sale Rule",
    question:
      "What is the wash sale rule?",
    options: [
      "You must wash your hands before trading",
      "You cannot sell and rebuy a substantially identical security within 30 days and claim the tax loss",
      "You must hold a stock for 30 days before selling",
      "All trading losses are tax-deductible without limits",
    ],
    answer: 1,
  },
  {
    id: 26,
    topic: "Wash Sale Rule",
    question: "If a wash sale occurs, what happens to the disallowed loss?",
    options: [
      "It is permanently lost and cannot be recovered",
      "It is added to the cost basis of the newly purchased security",
      "The IRS sends you a refund",
      "It carries forward as a capital gains credit",
    ],
    answer: 1,
  },
  {
    id: 27,
    topic: "Wash Sale Rule",
    question: "What does 'substantially identical' mean in the wash sale rule?",
    options: [
      "Any stock in the same industry",
      "Any security listed on the same exchange",
      "The same stock, or a very similar security like options on the same stock",
      "Any security you have traded before",
    ],
    answer: 2,
  },
  {
    id: 28,
    topic: "Wash Sale Rule",
    question:
      "You sell 100 shares of XYZ at a $50 loss, then buy XYZ back 15 days later. Can you deduct the $50 loss this year?",
    options: [
      "Yes — you already sold the shares",
      "Yes — but only half the loss",
      "No — this is a wash sale because you repurchased within 30 days",
      "No — losses on stocks are never tax-deductible",
    ],
    answer: 2,
  },
  {
    id: 29,
    topic: "Wash Sale Rule",
    question: "Does the wash sale rule apply to transactions in retirement accounts (IRA, 401k)?",
    options: [
      "No — retirement accounts are fully exempt",
      "Yes — selling at a loss in a taxable account and buying in an IRA within 30 days still triggers it",
      "Only if the retirement account is a Roth IRA",
      "Only if you are over 59½ years old",
    ],
    answer: 1,
  },
  {
    id: 30,
    topic: "Wash Sale Rule",
    question: "What is the purpose of the wash sale rule?",
    options: [
      "To prevent traders from claiming artificial tax losses while maintaining the same position",
      "To force traders to diversify their portfolio",
      "To limit the number of trades per day",
      "To prevent insider trading",
    ],
    answer: 0,
  },
];

/** Pick `count` random questions and return their IDs */
export function getRandomQuestionIds(count: number): number[] {
  const ids = QUIZ_QUESTIONS.map((q) => q.id);
  // Fisher-Yates shuffle
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, count);
}

export function getQuestionById(id: number): QuizQuestion | undefined {
  return QUIZ_QUESTIONS.find((q) => q.id === id);
}
