/**
 * Quiz System — Book Registry & Question Lookup
 *
 * Central module that registers all book question banks and provides
 * lookup/selection helpers for the Discord interaction handler.
 */

import type { QuizQuestion, QuizBook } from "./types";
export { QUIZ_LENGTH } from "./types";
export type { QuizQuestion, QuizBook } from "./types";

import { BOOK_00_META, BOOK_00_QUESTIONS } from "./book-00";
import { BOOK_01_META, BOOK_01_QUESTIONS } from "./book-01";
import { BOOK_02_META, BOOK_02_QUESTIONS } from "./book-02";
import { BOOK_03_META, BOOK_03_QUESTIONS } from "./book-03";
import { BOOK_04_META, BOOK_04_QUESTIONS } from "./book-04";

// ── Book Registry ────────────────────────────────────────────────────

interface BookEntry {
  meta: { id: number; title: string; shortTitle: string };
  questions: QuizQuestion[];
}

const BOOK_REGISTRY: BookEntry[] = [
  { meta: BOOK_00_META, questions: BOOK_00_QUESTIONS },
  { meta: BOOK_01_META, questions: BOOK_01_QUESTIONS },
  { meta: BOOK_02_META, questions: BOOK_02_QUESTIONS },
  { meta: BOOK_03_META, questions: BOOK_03_QUESTIONS },
  { meta: BOOK_04_META, questions: BOOK_04_QUESTIONS },
];

// ── Derived lookups (built once at import time) ──────────────────────

const ALL_QUESTIONS = new Map<string, QuizQuestion>();
const BOOK_QUESTIONS = new Map<number, QuizQuestion[]>();
const BOOK_CHAPTER_QUESTIONS = new Map<string, QuizQuestion[]>();

for (const entry of BOOK_REGISTRY) {
  const bookId = entry.meta.id;
  BOOK_QUESTIONS.set(bookId, entry.questions);

  for (const q of entry.questions) {
    ALL_QUESTIONS.set(`${q.bookId}:${q.id}`, q);

    if (q.chapter != null) {
      const key = `${bookId}:${q.chapter}`;
      const existing = BOOK_CHAPTER_QUESTIONS.get(key) ?? [];
      existing.push(q);
      BOOK_CHAPTER_QUESTIONS.set(key, existing);
    }
  }
}

// ── Public API ───────────────────────────────────────────────────────

/** Get the full list of available quiz books for the select menu */
export function getAvailableBooks(): QuizBook[] {
  return BOOK_REGISTRY.map((entry) => {
    const chapters = new Map<number, { title: string; count: number }>();
    for (const q of entry.questions) {
      if (q.chapter != null) {
        const existing = chapters.get(q.chapter);
        if (existing) {
          existing.count++;
        } else {
          chapters.set(q.chapter, { title: q.topic, count: 1 });
        }
      }
    }

    return {
      id: entry.meta.id,
      title: entry.meta.title,
      shortTitle: entry.meta.shortTitle,
      questionCount: entry.questions.length,
      chapters: Array.from(chapters.entries()).map(([num, info]) => ({
        number: num,
        title: info.title,
        questionCount: info.count,
      })),
    };
  });
}

/** Look up a single question by bookId + questionId */
export function getQuestionById(bookId: number, questionId: number): QuizQuestion | undefined {
  return ALL_QUESTIONS.get(`${bookId}:${questionId}`);
}

/** Get all questions for a book, optionally filtered by chapter */
export function getBookQuestions(bookId: number, chapter?: number): QuizQuestion[] {
  if (chapter != null) {
    return BOOK_CHAPTER_QUESTIONS.get(`${bookId}:${chapter}`) ?? [];
  }
  return BOOK_QUESTIONS.get(bookId) ?? [];
}

/** Pick `count` random question IDs from a book (optionally by chapter) */
export function getRandomQuestionIds(
  bookId: number,
  count: number,
  chapter?: number
): number[] {
  const pool = getBookQuestions(bookId, chapter);
  const ids = pool.map((q) => q.id);

  // Fisher-Yates shuffle
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }

  return ids.slice(0, Math.min(count, ids.length));
}
