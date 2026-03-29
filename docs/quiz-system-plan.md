# Quiz System — Book-by-Book Plan of Attack

## Overview

Build a comprehensive quiz system where each of the 18 Trader University books gets its own dedicated quiz bank. Users read a book, then test their knowledge with `/quiz` in Discord. Quizzes are ephemeral (private), scores are tracked, and daily leaderboards are posted.

---

## How It Works for Users

1. User reads a book from `#books` channel
2. Goes to `#quiz` channel
3. Types `/quiz` — sees a dropdown menu of all 18 books
4. Selects a book — gets 10 random questions from that book's question bank
5. Answers A/B/C/D via buttons (ephemeral — only they see it)
6. Gets their score at the end with feedback
7. Pastes/shares their result in `#quiz-results` if they want
8. Daily leaderboard posts at 9 PM ET

### Command Structure

```
/quiz                          → Book selection dropdown
/quiz book:3                   → Jump straight to "25 Rules of Day Trading" quiz
/quiz book:5 chapter:3         → Chapter-specific quiz (for books that have them)
```

---

## Book Inventory & Quiz Sizing

### Tier 1 — Short Books (1 quiz, 10-15 questions)

| # | Book | Est. Pages | Questions | Chapters to Quiz |
|---|------|-----------|-----------|-----------------|
| 3 | 25 Rules of Day Trading | ~35 | 15 | Single quiz covering all 25 rules |
| 11 | Market Profile MetaTrader Indicator | ~40 | 10 | Single quiz — tool-focused |

### Tier 2 — Medium Books (1-2 quizzes, 15-25 questions)

| # | Book | Est. Pages | Questions | Chapters to Quiz |
|---|------|-----------|-----------|-----------------|
| 4 | Ultimate Trading Risk Management Guide | ~100 | 20 | 2 quizzes: Risk Concepts + Position Sizing & Stops |
| 5 | Moving Averages 101 | ~120 | 20 | 2 quizzes: MA Types + Crossover Systems |
| 6 | 30 Rules for Master Swing Trader | ~100 | 20 | Single quiz covering the 30 rules |
| 8 | Simple Options Trading | ~120 | 25 | 2 quizzes: Options Basics + Strategies & Greeks |
| 9 | Ultimate Options Strategy Guide | ~100 | 20 | 2 quizzes: Strategy Selection + Payoff Diagrams |
| 10 | Anyone Can Learn Market Profile | ~100 | 20 | 2 quizzes: Profile Basics + Value Areas |
| 13 | Profit with the Market Profile | ~100 | 15 | Single quiz — practical application |
| 16 | Global Macro Trading | ~80 | 15 | Single quiz — macro concepts |

### Tier 3 — Dense Books (2-4 quizzes, 25-40 questions)

| # | Book | Est. Pages | Questions | Chapters to Quiz |
|---|------|-----------|-----------|-----------------|
| 1 | Day Trading for Dummies | ~225 | 30 | 3 quizzes: Fundamentals, Stock Selection, Execution |
| 2 | Day Trading 101 | ~225 | 30 | 3 quizzes: Basics, Risk/AI, Crypto/Fed/Rates |
| 7 | The Daily Trading Coach | ~225 | 30 | 3 quizzes grouped by lesson themes |
| 12 | Volume Profile - Insider's Guide | ~200 | 25 | 3 quizzes: Concepts, Profile Types, Setups |
| 14 | Mind over Markets - Dalton | ~200 | 25 | 3 quizzes: Theory, Market-Generated Info, Application |
| 15 | Steidlmayer on Markets | ~225 | 25 | 3 quizzes: Foundations, Advanced Profiles, Trading |

### Tier 4 — Reference Books (4-6 quizzes, 40-60 questions)

| # | Book | Est. Pages | Questions | Chapters to Quiz |
|---|------|-----------|-----------|-----------------|
| 17 | Technical Analysis of Stock Trends | ~700 | 50 | 5 quizzes by section: Trends, Patterns, S/R, Indicators, Application |
| 18 | Risk Management & Financial Institutions | ~900 | 40 | 4 quizzes: Risk Types, Derivatives, Institutional, Advanced |

### Totals

- **18 books**
- **~460 questions** across all books
- **~45 quizzes** (individual chapter/section quizzes)

---

## Process for Each Book

### Step 1: Read & Extract

For each book, read through systematically and extract:

- **Key definitions** — terms the book introduces or explains
- **Core concepts** — the main ideas each chapter teaches
- **Rules/principles** — numbered rules, guidelines, frameworks
- **Practical applications** — "when X happens, do Y" scenarios
- **Common mistakes** — what the book warns against
- **Formulas/calculations** — if applicable (risk/reward, position sizing, Greeks)

### Step 2: Write Questions

For each extracted concept, write questions that test **comprehension, not just recall**:

**Good question types:**
- Scenario-based: "A stock breaks above resistance with high volume. According to the book, this is a signal to..."
- Application: "You have a $25,000 account. Using the 1% risk rule, what is your max loss per trade?"
- Conceptual: "Why does the book recommend paper trading before going live?"
- Distinction: "What is the difference between a stop-loss and a stop-limit order?"

**Avoid:**
- Pure memorization: "On what page does the author discuss X?"
- Trivial: "True or false: trading involves risk"
- Ambiguous: Questions where multiple answers are defensibly correct

**Question format:**
```typescript
{
  id: number,
  bookId: number,
  chapter: number | null,    // null for whole-book questions
  topic: string,             // e.g. "Risk Management"
  question: string,
  options: [string, string, string, string],  // A, B, C, D
  answer: number,            // 0-3 index
  explanation: string,       // shown after answering — reinforces learning
}
```

The `explanation` field is new — after each answer (right or wrong), the bot shows a one-line explanation. This turns the quiz into active learning, not just testing.

### Step 3: Review & Validate

Before committing each book's questions:

1. Read through all questions — are they fair? Would someone who read the book get them right?
2. Check that wrong answers are plausible but clearly wrong (no trick questions)
3. Verify explanations are accurate and concise
4. Run typecheck to ensure no syntax issues

### Step 4: Upload to Codebase

Each book's questions go in a dedicated file:

```
src/lib/quiz/
  index.ts              — exports all books, question lookup, random selection
  book-01.ts            — Day Trading for Dummies
  book-02.ts            — Day Trading 101
  book-03.ts            — 25 Rules of Day Trading
  ...
  book-18.ts            — Risk Management & Financial Institutions
  types.ts              — shared QuizQuestion, QuizBook interfaces
```

**Why separate files:**
- Each book can be worked on independently
- No merge conflicts when adding books in parallel
- Easy to review one book's questions without scrolling through 460 questions
- Clean imports — only load what's needed

### Step 5: Register & Test

After each book is added:

1. Run `npm run typecheck` — verify no errors
2. Test locally with `/quiz` — verify the book appears in the dropdown
3. Take the quiz yourself — verify questions render correctly
4. Commit and push

---

## Technical Changes Required

### 1. Restructure Quiz Questions

Current state: 30 hardcoded questions in `src/lib/quiz-questions.ts` (the beginner quiz already built).

Target state: Move to `src/lib/quiz/` directory structure above. The existing 30 beginner questions become a "General Basics" quiz (book ID 0) or get redistributed into the relevant book quizzes.

### 2. Update `/quiz` Slash Command

Current: `/quiz` immediately starts a random 10-question quiz.

New behavior:
```
/quiz              → Select menu with book list
/quiz book:3       → Start quiz for book #3
/quiz book:5 ch:2  → Start chapter 2 quiz for book #5
```

Register updated command with subcommands:
```typescript
{
  name: "quiz",
  description: "Test your trading knowledge",
  options: [
    {
      name: "book",
      description: "Book number (1-18), or omit for the full book list",
      type: 4, // INTEGER
      required: false,
    },
    {
      name: "chapter",
      description: "Chapter number (optional — for chapter-specific quizzes)",
      type: 4,
      required: false,
    },
  ],
}
```

### 3. Update Interaction Handler

The Discord interactions route needs to handle:

- `/quiz` with no args → respond with a select menu (component type 3 = STRING_SELECT)
- `/quiz book:N` → start that book's quiz
- `/quiz book:N chapter:C` → start chapter quiz
- Select menu interaction → start the selected book's quiz
- Button interactions → same as current (advance through questions)

### 4. Add Explanations to Quiz Flow

After each answer, before showing the next question, briefly show:
```
✅ Correct! VWAP resets at the start of each trading session.

Question 4/10 — Topic: Technical Analysis
...
```

This is already partially built — just need to add the `explanation` field to the embed.

### 5. Database — No Changes Needed

The existing `quiz_scores` table works as-is. We can add a `book_id` column:

```sql
alter table quiz_scores add column book_id int;
create index idx_quiz_scores_book on quiz_scores (book_id);
```

This lets the leaderboard show per-book rankings.

---

## Execution Order

### Phase 1: Infrastructure (do first)
- [ ] Restructure `src/lib/quiz/` directory
- [ ] Add `book_id` column to `quiz_scores`
- [ ] Update `/quiz` command registration with book/chapter options
- [ ] Update interaction handler for select menus + book routing
- [ ] Migrate existing 30 questions into the new structure
- [ ] Test end-to-end

### Phase 2: Books (one at a time, in order)

| Order | Book # | Title | Why This Order |
|-------|--------|-------|---------------|
| 1 | 1 | Day Trading for Dummies | Foundational — most beginners start here |
| 2 | 2 | Day Trading 101 | Builds on #1 with modern topics |
| 3 | 3 | 25 Rules of Day Trading | Short, quick win |
| 4 | 4 | Ultimate Trading Risk Management Guide | Critical topic, read early |
| 5 | 5 | Moving Averages 101 | First technical analysis book |
| 6 | 6 | 30 Rules for Master Swing Trader | Rules-based, similar format to #3 |
| 7 | 7 | The Daily Trading Coach | Psychology — pairs well after rules |
| 8 | 8 | Simple Options Trading | Options basics before advanced |
| 9 | 9 | Ultimate Options Strategy Guide | Builds on #8 |
| 10 | 10 | Anyone Can Learn Market Profile | Market Profile intro |
| 11 | 11 | Market Profile MetaTrader Indicator | Short, tool-specific |
| 12 | 12 | Volume Profile - Insider's Guide | Builds on #10 |
| 13 | 13 | Profit with the Market Profile | Practical application of #10-12 |
| 14 | 14 | Mind over Markets - Dalton | Advanced Market Profile theory |
| 15 | 15 | Steidlmayer on Markets | Advanced Market Profile |
| 16 | 16 | Global Macro Trading | Macro perspective |
| 17 | 17 | Technical Analysis of Stock Trends | Comprehensive reference — biggest |
| 18 | 18 | Risk Management & Financial Institutions | Academic — most advanced |

### Phase 3: Polish
- [ ] Add `#quiz-results` channel for sharing scores
- [ ] Leaderboard shows per-book rankings
- [ ] Consider "certification" roles: complete all quizzes for a book with 80%+ → earn a Discord role
- [ ] Weekly quiz challenges: "This week's featured book is #5 — top scorer gets highlighted"

---

## What to Put in #books Channel

For each book that has a quiz ready, add a note like:

> **Day Trading for Dummies** 📖
> After reading this book, test your knowledge:
> Go to `#quiz` and type `/quiz book:1`
> 30 questions covering fundamentals, stock selection, and execution.
> Post your results in `#quiz-results`!

---

## Per-Book Workflow Summary

For each book in Phase 2:

1. **Read** the PDF cover-to-cover (or key chapters for dense books)
2. **Extract** definitions, concepts, rules, scenarios
3. **Write** questions in `src/lib/quiz/book-NN.ts`
4. **Review** — are questions fair, explanations accurate?
5. **Typecheck** — `npm run typecheck`
6. **Commit** — one commit per book: "Add quiz: Book #N — Title"
7. **Push & deploy**
8. **Update** `#books` channel with quiz instructions for that book
