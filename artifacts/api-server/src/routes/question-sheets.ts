import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { desc, eq } from "drizzle-orm";
import {
  db,
  questionSheetsTable,
  extractedQuestionsTable,
} from "@workspace/db";
import { extractQuestionsFromFile } from "../lib/extract";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

const ACCEPTED_IMAGE = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function classifyMime(mimeType: string): "image" | "pdf" | null {
  const lower = mimeType.toLowerCase();
  if (lower === "application/pdf" || lower.endsWith("/pdf")) return "pdf";
  if (ACCEPTED_IMAGE.has(lower) || lower.startsWith("image/")) return "image";
  return null;
}

function serializeSheet(
  sheet: typeof questionSheetsTable.$inferSelect,
) {
  return {
    id: sheet.id,
    title: sheet.title,
    sourceType: sheet.sourceType,
    filename: sheet.filename,
    mimeType: sheet.mimeType,
    status: sheet.status,
    errorMessage: sheet.errorMessage,
    questionCount: sheet.questionCount,
    createdAt: sheet.createdAt.toISOString(),
  };
}

router.get("/question-sheets", async (_req: Request, res: Response) => {
  const rows = await db
    .select()
    .from(questionSheetsTable)
    .orderBy(desc(questionSheetsTable.createdAt));
  res.json(rows.map(serializeSheet));
});

router.post(
  "/question-sheets",
  upload.single("file"),
  async (req: Request, res: Response) => {
    const file = req.file;
    const titleRaw = (req.body?.title ?? "").toString().trim();
    if (!file) {
      res.status(400).json({ error: "ملف مطلوب" });
      return;
    }
    const sourceType = classifyMime(file.mimetype);
    if (!sourceType) {
      res
        .status(400)
        .json({ error: "نوع الملف غير مدعوم. يجب أن يكون صورة أو PDF" });
      return;
    }
    const title = titleRaw || file.originalname.replace(/\.[^/.]+$/, "");

    const [created] = await db
      .insert(questionSheetsTable)
      .values({
        title,
        sourceType,
        filename: file.originalname,
        mimeType: file.mimetype,
        fileData: file.buffer,
        status: "processing",
        questionCount: 0,
      })
      .returning();

    if (!created) {
      res.status(500).json({ error: "تعذّر إنشاء ورقة الأسئلة" });
      return;
    }

    res.status(201).json(serializeSheet(created));

    const buffer = file.buffer;
    void (async () => {
      try {
        const questions = await extractQuestionsFromFile({
          buffer,
          mimeType: file.mimetype,
        });
        if (questions.length === 0) {
          throw new Error("لم نتمكن من استخراج أي سؤال من الملف");
        }
        await db.transaction(async (tx) => {
          await tx.insert(extractedQuestionsTable).values(
            questions.map((q) => ({
              sheetId: created.id,
              questionNumber: q.questionNumber,
              question: q.question,
              answer: q.answer,
              explanation: q.explanation,
            })),
          );
          await tx
            .update(questionSheetsTable)
            .set({
              status: "ready",
              questionCount: questions.length,
              errorMessage: null,
            })
            .where(eq(questionSheetsTable.id, created.id));
        });
        logger.info(
          { sheetId: created.id, count: questions.length },
          "Question sheet processed",
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "خطأ غير معروف";
        logger.error({ err, sheetId: created.id }, "Sheet processing failed");
        await db
          .update(questionSheetsTable)
          .set({ status: "failed", errorMessage: message })
          .where(eq(questionSheetsTable.id, created.id));
      }
    })();
  },
);

router.get("/question-sheets/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "معرف غير صالح" });
    return;
  }
  const [sheet] = await db
    .select()
    .from(questionSheetsTable)
    .where(eq(questionSheetsTable.id, id));
  if (!sheet) {
    res.status(404).json({ error: "ورقة الأسئلة غير موجودة" });
    return;
  }
  const questions = await db
    .select()
    .from(extractedQuestionsTable)
    .where(eq(extractedQuestionsTable.sheetId, id))
    .orderBy(extractedQuestionsTable.questionNumber);
  res.json({
    ...serializeSheet(sheet),
    questions: questions.map((q) => ({
      id: q.id,
      sheetId: q.sheetId,
      questionNumber: q.questionNumber,
      question: q.question,
      answer: q.answer,
      explanation: q.explanation,
    })),
  });
});

router.delete("/question-sheets/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "معرف غير صالح" });
    return;
  }
  const result = await db
    .delete(questionSheetsTable)
    .where(eq(questionSheetsTable.id, id))
    .returning({ id: questionSheetsTable.id });
  if (result.length === 0) {
    res.status(404).json({ error: "ورقة الأسئلة غير موجودة" });
    return;
  }
  res.status(204).end();
});

router.get(
  "/question-sheets/:id/file",
  async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "معرف غير صالح" });
      return;
    }
    const [sheet] = await db
      .select({
        filename: questionSheetsTable.filename,
        mimeType: questionSheetsTable.mimeType,
        fileData: questionSheetsTable.fileData,
      })
      .from(questionSheetsTable)
      .where(eq(questionSheetsTable.id, id));
    if (!sheet || !sheet.fileData) {
      res.status(404).json({ error: "الملف غير متوفر" });
      return;
    }
    res.setHeader("Content-Type", sheet.mimeType || "application/octet-stream");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(sheet.filename)}"`,
    );
    res.send(sheet.fileData);
  },
);

export default router;
