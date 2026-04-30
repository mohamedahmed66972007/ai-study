import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { documentsTable } from "./documents";

/**
 * One row per chapter/lesson detected in a document. Built once on demand and
 * then reused for all quiz generation.
 */
export const documentChaptersTable = pgTable(
  "document_chapters",
  {
    id: serial("id").primaryKey(),
    documentId: integer("document_id")
      .notNull()
      .references(() => documentsTable.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    startPage: integer("start_page").notNull(),
    endPage: integer("end_page").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    docIdx: index("document_chapters_doc_idx").on(t.documentId, t.orderIndex),
  }),
);

export type DocumentChapterRow = typeof documentChaptersTable.$inferSelect;

/**
 * Question types supported by the quiz engine.
 */
export const QUIZ_QUESTION_TYPES = [
  "mcq",
  "true_false",
  "fill_blank",
  "short_answer",
] as const;
export type QuizQuestionType = (typeof QUIZ_QUESTION_TYPES)[number];

/**
 * One generated quiz question. Stored as JSON inside `quizzes.questions` so
 * we don't need a row-per-question (questions are immutable once generated).
 */
export type StoredQuizQuestion = {
  id: string;
  type: QuizQuestionType;
  prompt: string;
  /** For mcq / true_false: the candidate options. */
  choices?: string[];
  /** Reference (correct) answer in plain text. For mcq: the literal text of
   *  the correct choice. For true_false: "صح" or "خطأ". */
  correctAnswer: string;
  /** Short explanation (optional) shown when the user reviews the result. */
  explanation?: string;
  /** Optional citation back to a page in the document. */
  pageNumber?: number;
  pageLabel?: string | null;
  points: number;
};

export type QuizSettings = {
  randomizeQuestions: boolean;
  randomizeChoices: boolean;
  /** Soft hint for the AI; not enforced by a server timer. */
  timeLimitMinutes?: number | null;
  difficulty: "easy" | "medium" | "hard" | "mixed";
  allowedTypes: QuizQuestionType[];
};

export const quizzesTable = pgTable(
  "quizzes",
  {
    id: serial("id").primaryKey(),
    documentId: integer("document_id")
      .notNull()
      .references(() => documentsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    chapterIds: jsonb("chapter_ids").$type<number[]>().notNull().default([]),
    settings: jsonb("settings").$type<QuizSettings>().notNull(),
    questions: jsonb("questions")
      .$type<StoredQuizQuestion[]>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    docIdx: index("quizzes_doc_idx").on(t.documentId),
  }),
);

export const insertQuizSchema = createInsertSchema(quizzesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertQuiz = z.infer<typeof insertQuizSchema>;
export type QuizRow = typeof quizzesTable.$inferSelect;

/**
 * Per-question grading record stored in attempts.
 */
export type StoredAttemptItem = {
  questionId: string;
  userAnswer: string;
  /** 0..1 fraction of points awarded. */
  score: number;
  /** Server-side judgement: "correct" | "partial" | "wrong" | "empty". */
  verdict: "correct" | "partial" | "wrong" | "empty";
  /** Brief feedback shown to the user. */
  feedback?: string;
};

export const quizAttemptsTable = pgTable(
  "quiz_attempts",
  {
    id: serial("id").primaryKey(),
    quizId: integer("quiz_id")
      .notNull()
      .references(() => quizzesTable.id, { onDelete: "cascade" }),
    items: jsonb("items").$type<StoredAttemptItem[]>().notNull().default([]),
    /** Total points achieved. */
    score: integer("score").notNull().default(0),
    /** Maximum possible points. */
    maxScore: integer("max_score").notNull().default(0),
    completed: boolean("completed").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    quizIdx: index("quiz_attempts_quiz_idx").on(t.quizId),
  }),
);

export type QuizAttemptRow = typeof quizAttemptsTable.$inferSelect;
