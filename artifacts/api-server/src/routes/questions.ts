import { Router, type IRouter, type Request, type Response } from "express";
import { desc, eq } from "drizzle-orm";
import {
  db,
  documentsTable,
  documentPagesTable,
  questionsTable,
} from "@workspace/db";
import { AskDocumentQuestionBody } from "@workspace/api-zod";
import { askDocument } from "../lib/ask";

const router: IRouter = Router();

router.get("/documents/:id/questions", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "معرف غير صالح" });
    return;
  }
  const rows = await db
    .select()
    .from(questionsTable)
    .where(eq(questionsTable.documentId, id))
    .orderBy(desc(questionsTable.createdAt));
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

export default router;
