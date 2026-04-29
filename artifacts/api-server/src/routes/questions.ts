import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { asc, desc, eq } from "drizzle-orm";
import {
  db,
  documentsTable,
  documentPagesTable,
  questionsTable,
} from "@workspace/db";
import { AskDocumentQuestionBody } from "@workspace/api-zod";
import { askDocument, extractAndAnswerFromImage } from "../lib/ask";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

router.get("/documents/:id/questions", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "معرف غير صالح" });
    return;
  }
  // Order by createdAt DESC, then by id DESC as tiebreaker. When a batch of
  // questions is inserted from the same image at nearly the same instant
  // (rounded to the same millisecond), the higher id is the later insert,
  // so newest stays at the top consistently. The client reverses this to
  // render oldest-first / newest-at-the-bottom in chat-style.
  const rows = await db
    .select()
    .from(questionsTable)
    .where(eq(questionsTable.documentId, id))
    .orderBy(desc(questionsTable.createdAt), desc(questionsTable.id));
  res.json(
    rows.map((q) => ({
      id: q.id,
      documentId: q.documentId,
      question: q.question,
      answer: q.answer,
      citations: q.citations,
      createdAt: q.createdAt.toISOString(),
    })),
  );
});

router.post("/documents/:id/questions", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "معرف غير صالح" });
    return;
  }
  const parsed = AskDocumentQuestionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "السؤال مطلوب" });
    return;
  }

  const [doc] = await db
    .select()
    .from(documentsTable)
    .where(eq(documentsTable.id, id));
  if (!doc) {
    res.status(404).json({ error: "المستند غير موجود" });
    return;
  }
  if (doc.status !== "ready") {
    res
      .status(409)
      .json({ error: "المستند ليس جاهزًا بعد. يرجى الانتظار حتى تتم المعالجة." });
    return;
  }

  const pages = await db
    .select()
    .from(documentPagesTable)
    .where(eq(documentPagesTable.documentId, id))
    .orderBy(documentPagesTable.pageNumber);

  try {
    const { answer, citations } = await askDocument({
      documentTitle: doc.title,
      pages,
      question: parsed.data.question,
    });

    const [saved] = await db
      .insert(questionsTable)
      .values({
        documentId: id,
        question: parsed.data.question,
        answer,
        citations,
      })
      .returning();

    if (!saved) {
      res.status(500).json({ error: "تعذّر حفظ الإجابة" });
      return;
    }

    res.json({
      id: saved.id,
      documentId: saved.documentId,
      question: saved.question,
      answer: saved.answer,
      citations: saved.citations,
      createdAt: saved.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to ask question");
    res.status(500).json({ error: "حدث خطأ أثناء توليد الإجابة" });
  }
});

router.post(
  "/documents/:id/questions/from-image",
  upload.single("file"),
  async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "معرف غير صالح" });
      return;
    }
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "صورة مطلوبة" });
      return;
    }
    if (!file.mimetype.startsWith("image/")) {
      res.status(400).json({ error: "يجب أن يكون الملف صورة" });
      return;
    }

    const [doc] = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.id, id));
    if (!doc) {
      res.status(404).json({ error: "المستند غير موجود" });
      return;
    }
    if (doc.status !== "ready") {
      res
        .status(409)
        .json({ error: "المستند ليس جاهزًا بعد. يرجى الانتظار." });
      return;
    }

    const pages = await db
      .select()
      .from(documentPagesTable)
      .where(eq(documentPagesTable.documentId, id))
      .orderBy(documentPagesTable.pageNumber);

    try {
      const extracted = await extractAndAnswerFromImage({
        documentTitle: doc.title,
        pages,
        imageBuffer: file.buffer,
        imageMimeType: file.mimetype,
      });

      if (extracted.length === 0) {
        res.status(422).json({
          error: "لم يتم العثور على أي سؤال في الصورة. حاول صورة أوضح.",
        });
        return;
      }

      const inserted = await db
        .insert(questionsTable)
        .values(
          extracted.map((q) => ({
            documentId: id,
            question: q.question,
            answer: q.answer,
            citations: q.citations,
          })),
        )
        .returning();

      res.json(
        inserted.map((q) => ({
          id: q.id,
          documentId: q.documentId,
          question: q.question,
          answer: q.answer,
          citations: q.citations,
          createdAt: q.createdAt.toISOString(),
        })),
      );
    } catch (err) {
      req.log.error({ err }, "Failed to extract+answer from image");
      res.status(500).json({ error: "حدث خطأ أثناء قراءة الصورة" });
    }
  },
);

export default router;
