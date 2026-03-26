/**
 * Federal Reserve Calendar Fetcher
 *
 * Fetches upcoming Fed events (speeches, FOMC, testimony, minutes) from
 * the official Fed iCal feed. This is the authoritative source for all
 * Federal Reserve events — more complete than Finnhub for Fed-specific data.
 *
 * Source: https://www.federalreserve.gov/newsevents/calendar.htm
 * iCal:   https://www.federalreserve.gov/newsevents/calendar.ics
 */

const FED_ICAL_URL =
  "https://www.federalreserve.gov/newsevents/calendar.ics";

// Current FOMC voting members (2026). Update annually.
// Chair, Vice Chair, and all Governors always vote.
// Regional presidents rotate — 4 vote each year plus NY (always votes).
const VOTING_MEMBERS_2026 = new Set([
  "Jerome Powell", // Chair
  "Philip Jefferson", // Vice Chair
  "Michael Barr",
  "Michelle Bowman",
  "Lisa Cook",
  "Adriana Kugler",
  "Christopher Waller",
  "John Williams", // NY Fed — always votes
  // 2026 rotating voters (verify when year starts):
  "Neel Kashkari", // Minneapolis
  "Alberto Musalem", // St. Louis
  "Jeff Schmid", // Kansas City
  "Mary Daly", // San Francisco
]);

export interface FedEvent {
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM ET, or null if all-day
  title: string;
  type: "fomc" | "speech" | "testimony" | "minutes" | "beige_book" | "other";
  speaker: string | null;
  isVotingMember: boolean;
  topic: string | null;
  location: string | null;
}

/**
 * Parse a VCALENDAR iCal feed into FedEvent objects.
 * This is a minimal iCal parser — handles only what the Fed feed uses.
 */
function parseIcal(ical: string): FedEvent[] {
  const events: FedEvent[] = [];
  const blocks = ical.split("BEGIN:VEVENT");

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split("END:VEVENT")[0];
    const fields = parseIcalFields(block);

    const summary = fields["SUMMARY"] ?? "";
    const dtstart = fields["DTSTART"] ?? fields["DTSTART;VALUE=DATE"] ?? "";
    const description = fields["DESCRIPTION"] ?? "";
    const location = fields["LOCATION"] ?? null;

    const date = parseIcalDate(dtstart);
    const time = parseIcalTime(dtstart);
    const type = classifyFedEvent(summary);
    const speaker = extractSpeaker(summary, description);
    const topic = extractTopic(summary, description);

    events.push({
      date,
      time,
      title: summary.trim(),
      type,
      speaker,
      isVotingMember: speaker
        ? VOTING_MEMBERS_2026.has(speaker)
        : type === "fomc", // FOMC decisions always involve voting members
      topic,
      location,
    });
  }

  return events;
}

function parseIcalFields(block: string): Record<string, string> {
  const fields: Record<string, string> = {};
  // Unfold lines (RFC 5545: lines starting with space/tab are continuations)
  const unfolded = block.replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);

  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.substring(0, colonIdx).trim();
    const value = line
      .substring(colonIdx + 1)
      .trim()
      .replace(/\\n/g, "\n")
      .replace(/\\,/g, ",")
      .replace(/\\\\/g, "\\");
    fields[key] = value;
  }
  return fields;
}

function parseIcalDate(dtstart: string): string {
  // Formats: 20260325, 20260325T140000Z, 20260325T140000
  const match = dtstart.match(/(\d{4})(\d{2})(\d{2})/);
  if (!match) return "";
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function parseIcalTime(dtstart: string): string | null {
  // Format: 20260325T140000Z (UTC) or 20260325T140000
  const match = dtstart.match(/T(\d{2})(\d{2})(\d{2})/);
  if (!match) return null; // All-day event

  const utcHour = parseInt(match[1], 10);
  const minute = match[2];

  // Convert UTC to ET (approximate — EDT=UTC-4, EST=UTC-5)
  // Use proper timezone conversion
  const utcDate = new Date();
  utcDate.setUTCHours(utcHour, parseInt(minute, 10), 0, 0);
  const etTime = utcDate.toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  });

  return etTime;
}

function classifyFedEvent(
  summary: string
): FedEvent["type"] {
  const lower = summary.toLowerCase();
  if (lower.includes("fomc") && (lower.includes("meeting") || lower.includes("statement") || lower.includes("decision"))) return "fomc";
  if (lower.includes("fomc") && lower.includes("minutes")) return "minutes";
  if (lower.includes("beige book")) return "beige_book";
  if (lower.includes("testimony") || lower.includes("humphrey-hawkins") || lower.includes("semiannual")) return "testimony";
  if (lower.includes("speech") || lower.includes("speaks") || lower.includes("remarks") || lower.includes("discussion") || lower.includes("fireside") || lower.includes("address")) return "speech";
  // If it has a person's name pattern but wasn't caught above, likely a speech
  if (/\b(chair|governor|president|vice chair)\b/i.test(lower)) return "speech";
  return "other";
}

function extractSpeaker(summary: string, description: string): string | null {
  const text = `${summary} ${description}`;

  // Try known names first
  for (const name of VOTING_MEMBERS_2026) {
    if (text.includes(name)) return name;
    // Also check last name only
    const lastName = name.split(" ").pop()!;
    if (text.includes(lastName)) return name;
  }

  // Try pattern: "Chair Powell", "Governor Waller", "President Kashkari"
  const titleMatch = text.match(
    /(?:Chair|Vice Chair|Governor|President)\s+([A-Z][a-z]+)/
  );
  if (titleMatch) {
    const lastName = titleMatch[1];
    // Check if it's a known voting member
    for (const name of VOTING_MEMBERS_2026) {
      if (name.endsWith(lastName)) return name;
    }
    return lastName; // Return just the last name if not in voting list
  }

  return null;
}

function extractTopic(summary: string, description: string): string | null {
  // The description field often contains the topic
  const text = description || summary;
  if (!text || text.length < 5) return null;

  // If description exists and is different from summary, use it as topic
  if (description && description !== summary) {
    // Truncate long topics
    return description.length > 200
      ? description.substring(0, 200) + "..."
      : description;
  }

  return null;
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Fetch and parse the Fed's official calendar.
 * Returns all events in the feed (typically covers next ~3 months).
 */
export async function fetchFedCalendar(): Promise<FedEvent[]> {
  const res = await fetch(FED_ICAL_URL, {
    headers: { "User-Agent": "traderpals-bot/1.0" },
  });

  if (!res.ok) {
    throw new Error(`Fed calendar fetch failed: ${res.status}`);
  }

  const ical = await res.text();
  return parseIcal(ical);
}

/**
 * Get Fed events for a specific date.
 */
export async function getFedEventsForDate(
  date: string
): Promise<FedEvent[]> {
  const events = await fetchFedCalendar();
  return events.filter((e) => e.date === date);
}

/**
 * Get Fed events for the current week (Mon-Fri).
 */
export async function getFedEventsForWeek(
  weekStartDate: string
): Promise<FedEvent[]> {
  const events = await fetchFedCalendar();
  const start = new Date(weekStartDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 5);
  const endStr = end.toISOString().split("T")[0];

  return events.filter((e) => e.date >= weekStartDate && e.date <= endStr);
}

/**
 * Check if a known name is a current FOMC voting member.
 */
export function isVotingMember(name: string): boolean {
  return VOTING_MEMBERS_2026.has(name);
}
