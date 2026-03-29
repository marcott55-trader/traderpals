/** Shared types for the book-by-book quiz system */

export interface QuizQuestion {
  id: number;
  bookId: number;
  chapter: number | null;
  topic: string;
  question: string;
  options: [string, string, string, string];
  answer: number; // 0-3 index
  explanation: string;
}

export interface QuizBook {
  id: number;
  title: string;
  shortTitle: string; // For dropdown labels (max 100 chars)
  chapters: QuizChapter[];
  questionCount: number;
}

export interface QuizChapter {
  number: number;
  title: string;
  questionCount: number;
}

export const QUIZ_LENGTH = 10;
