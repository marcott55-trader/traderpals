// NYSE holidays by year. Add new years as needed.
// Source: https://www.nyse.com/markets/hours-calendars
const NYSE_HOLIDAYS: Record<number, Set<string>> = {
  2026: new Set([
    "2026-01-01", // New Year's Day
    "2026-01-19", // MLK Jr. Day
    "2026-02-16", // Presidents' Day
    "2026-04-03", // Good Friday
    "2026-05-25", // Memorial Day
    "2026-06-19", // Juneteenth
    "2026-07-03", // Independence Day (observed)
    "2026-09-07", // Labor Day
    "2026-11-26", // Thanksgiving
    "2026-12-25", // Christmas
  ]),
  2027: new Set([
    "2027-01-01", // New Year's Day
    "2027-01-18", // MLK Jr. Day
    "2027-02-15", // Presidents' Day
    "2027-03-26", // Good Friday
    "2027-05-31", // Memorial Day
    "2027-06-18", // Juneteenth (observed)
    "2027-07-05", // Independence Day (observed)
    "2027-09-06", // Labor Day
    "2027-11-25", // Thanksgiving
    "2027-12-24", // Christmas (observed)
  ]),
};

function getEasternDate(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/New_York" })
  );
}

/** Current time formatted for ET display */
export function getEasternTimeString(): string {
  return (
    new Date().toLocaleString("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }) + " ET"
  );
}

/** Current date as YYYY-MM-DD in ET */
export function getEasternDateString(): string {
  const d = getEasternDate();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Formatted date for embed titles: "Wednesday, March 25, 2026" */
export function getFormattedDate(): string {
  return new Date().toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Hour and minute of day in ET */
export function getEasternTime(): { hour: number; minute: number } {
  const d = getEasternDate();
  return { hour: d.getHours(), minute: d.getMinutes() };
}

/** True on Mon-Fri that are not NYSE holidays */
export function isMarketDay(): boolean {
  const d = getEasternDate();
  const day = d.getDay();
  if (day === 0 || day === 6) return false;
  const dateStr = getEasternDateString();
  const year = d.getFullYear();
  const holidays = NYSE_HOLIDAYS[year];
  if (!holidays) {
    // Year not configured — assume it's a market day on weekdays.
    // Log a warning so we notice when it's time to add a new year.
    console.warn(
      `NYSE holidays not configured for ${year}. Add them to market-hours.ts.`
    );
    return true;
  }
  return !holidays.has(dateStr);
}

/** 4:00 AM – 9:29 AM ET */
export function isPremarket(): boolean {
  const { hour } = getEasternTime();
  return isMarketDay() && hour >= 4 && hour < 10;
}

/** 9:30 AM – 3:59 PM ET */
export function isMarketOpen(): boolean {
  const { hour, minute } = getEasternTime();
  const minutesSinceMidnight = hour * 60 + minute;
  return isMarketDay() && minutesSinceMidnight >= 570 && minutesSinceMidnight < 960;
}

/** 4:00 PM – 8:00 PM ET */
export function isAfterHours(): boolean {
  const { hour } = getEasternTime();
  return isMarketDay() && hour >= 16 && hour < 20;
}

// ── DST-aware cron scheduling ───────────────────────────────────────
//
// Inngest crons are UTC-only. Eastern Time switches between UTC-4 (EDT,
// Mar–Nov) and UTC-5 (EST, Nov–Mar). To fire at the correct ET time,
// we register TWO crons per schedule — one for each offset — and the
// function checks whether the current ET time matches before proceeding.
//
// Example: "7:00 AM ET" → cron "0 11 * * 1-5" (EDT) + "0 12 * * 1-5" (EST)
// When EDT is active, the 11 UTC run fires at 7 AM ET and proceeds.
// The 12 UTC run fires at 8 AM ET, sees the time doesn't match, and skips.

/** Returns true if US Eastern is currently in daylight saving time (UTC-4) */
export function isEDT(): boolean {
  // Compare UTC offset in America/New_York directly.
  // Works on any server timezone (including Vercel's UTC).
  const nyNow = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hour12: false,
  });
  const utcNow = new Date().getUTCHours();
  const etNow = parseInt(nyNow, 10);
  // EDT = UTC-4, EST = UTC-5
  const offset = utcNow - etNow;
  // Handle midnight wraparound
  const normalizedOffset = ((offset % 24) + 24) % 24;
  return normalizedOffset === 4;
}

/**
 * Check if now (in ET) matches a target ET hour:minute within a tolerance.
 * Used by Inngest functions to skip the "wrong DST" cron invocation.
 * Default tolerance: 35 minutes (covers cron offset + execution delay).
 */
export function isNearETTime(
  targetHour: number,
  targetMinute: number = 0,
  toleranceMinutes: number = 35
): boolean {
  const { hour, minute } = getEasternTime();
  const nowMinutes = hour * 60 + minute;
  const targetMinutes = targetHour * 60 + targetMinute;
  const diff = Math.abs(nowMinutes - targetMinutes);
  return diff <= toleranceMinutes;
}

/**
 * Build a pair of UTC crons that together cover both EDT and EST for a
 * given ET time. Returns two cron strings.
 *
 * @param etHour - hour in Eastern Time (0-23)
 * @param etMinute - minute (0-59)
 * @param daysOfWeek - cron day-of-week field (default "1-5" for weekdays)
 */
export function etCronPair(
  etHour: number,
  etMinute: number = 0,
  daysOfWeek: string = "1-5"
): [string, string] {
  const edtUtcHour = (etHour + 4) % 24; // EDT = UTC-4
  const estUtcHour = (etHour + 5) % 24; // EST = UTC-5
  const m = String(etMinute);
  return [
    `${m} ${edtUtcHour} * * ${daysOfWeek}`, // EDT cron
    `${m} ${estUtcHour} * * ${daysOfWeek}`, // EST cron
  ];
}

/**
 * Build pairs of UTC crons for a repeating interval during an ET time range.
 * E.g., "every 30 min from 10:00-15:30 ET" → crons for both DST offsets.
 */
export function etIntervalCronPair(
  intervalMinutes: number,
  etStartHour: number,
  etEndHour: number,
  daysOfWeek: string = "1-5"
): [string, string] {
  const minutePart =
    intervalMinutes === 1 ? "*" : `*/${intervalMinutes}`;
  const edtStart = (etStartHour + 4) % 24;
  const edtEnd = (etEndHour + 4) % 24;
  const estStart = (etStartHour + 5) % 24;
  const estEnd = (etEndHour + 5) % 24;
  return [
    `${minutePart} ${edtStart}-${edtEnd} * * ${daysOfWeek}`,
    `${minutePart} ${estStart}-${estEnd} * * ${daysOfWeek}`,
  ];
}
