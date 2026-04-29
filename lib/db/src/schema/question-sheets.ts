import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  index,
  customType,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return "bytea";
  },
});

export const questionSheetsTable = pgTable("question_sheets", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  sourceType: text("source_type").notNull(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  fileData: bytea("file_data"),
  status: text("status").notNull().default("processing"),
  errorMessage: text("error_message"),
  questionCount: integer("question_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertQuestionSheetSchema = createInsertSchema(
  questionSheetsTable,
).omit({ id: true, createdAt: true });
export type InsertQuestionSheet = z.infer<typeof insertQuestionSheetSchema>;
export type QuestionSheetRow = typeof questionSheetsTable.$inferSelect;

export const extractedQuestionsTable = pgTable(
  "extracted_questions",
  {
    id: serial("id").primaryKey(),
    sheetId: integer("sheet_id")
      .notNull()
      .references(() => questionSheetsTable.id, { onDelete: "cascade" }),
    questionNumber: integer("question_number").notNull(),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    explanation: text("explanation").notNull(),
  },
  (t) => ({
    sheetIdx: index("extracted_questions_sheet_idx").on(
      t.sheetId,
      t.questionNumber,
    ),
  }),
);

export const insertExtractedQuestionSchema = createInsertSchema(
  extractedQuestionsTable,
).omit({ id: true });
export type InsertExtractedQuestion = z.infer<
  typeof insertExtractedQuestionSchema
>;
export type ExtractedQuestionRow = typeof extractedQuestionsTable.$inferSelect;
