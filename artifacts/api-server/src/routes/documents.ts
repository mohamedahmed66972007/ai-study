import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  documentsTable,
  documentPagesTable,
  questionsTable,
} from "@workspace/db";
import { extractPdfPages } from "../lib/pdf";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB
});

function serializeDocument(
  doc: typeof documentsTable.$inferSelect,
  questionCount: number,
) {
  return {
    id: doc.id,
    title: doc.title,
    filename: doc.filename,
    totalPages: doc.totalPages,
    status: doc.status,
    errorMessage: doc.errorMessage,
    kind: doc.kind === "question_bank" ? "question_bank" : "curriculum",
    questionCount,
    createdAt: doc.createdAt.toISOString(),
  };
}

router.get("/stats", async (_req: Request, res: Response) => {
  const [docCounts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      ready: sql<number>`count(*) filter (where ${documentsTable.status} = 'ready')::int`,
      processing: sql<number>`count(*) filter (where ${documentsTable.status} = 'processing')::int`,
      pages: sql<number>`coalesce(sum(${documentsTable.totalPages}), 0)::int`,
    })
    .from(documentsTable);

  const [questionCounts] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(questionsTable);

  res.json({
    documentCount: docCounts?.total ?? 0,
    readyDocumentCount: docCounts?.ready ?? 0,
    processingDocumentCount: docCounts?.processing ?? 0,
    totalPages: docCounts?.pages ?? 0,
    totalQuestions: questionCounts?.total ?? 0,
  });
});

router.get("/documents/recent-questions", async (_req: Request, res: Response) => {
  const rows = await db
    .select({
      id: questionsTable.id,
      documentId: questionsTable.documentId,
      question: questionsTable.question,
      createdAt: questionsTable.createdAt,
      documentTitle: documentsTable.title,
    })
    .from(questionsTable)
    .innerJoin(documentsTable, eq(documentsTable.id, questionsTable.documentId))
    .orderBy(desc(questionsTable.createdAt))
    .limit(10);

  res.json(
    rows.map((r) => ({
      id: r.id,
      documentId: r.documentId,
      documentTitle: r.documentTitle,
      question: r.question,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

router.get("/documents", async (_req: Request, res: Response) => {
  const rows = await db
    .select({
      doc: documentsTable,
      questionCount: sql<number>`(
        select count(*)::int from ${questionsTable}
        where ${questionsTable.documentId} = ${documentsTable.id}
      )`,
    })
    .from(documentsTable)
    .orderBy(desc(documentsTable.createdAt));

  res.json(rows.map((r) => serializeDocument(r.doc, r.questionCount ?? 0)));
});

router.post(
  "/documents",
  upload.single("file"),
  async (req: Request, res: Response) => {
    const file = req.file;
    const titleRaw = (req.body?.title ?? "").toString().trim();
    if (!file) {
      res.status(400).json({ error: "ملف PDF مطلوب" });
      return;
    }
    if (!file.mimetype.includes("pdf")) {
      res.status(400).json({ error: "نوع الملف غير مدعوم. يجب أن يكون PDF" });
      return;
    }
    const title = titleRaw || file.originalname.replace(/\.pdf$/i, "");
    const kindRaw = (req.body?.kind ?? "").toString().trim();
    const kind = kindRaw === "question_bank" ? "question_bank" : "curriculum";

    const [created] = await db
      .insert(documentsTable)
      .values({
        title,
        filename: file.originalname,
        status: "processing",
        totalPages: 0,
        kind,
        fileData: file.buffer,
      })
      .returning();

    if (!created) {
      res.status(500).json({ error: "تعذّر إنشاء المستند" });
      return;
    }

    res.status(201).json(serializeDocument(created, 0));

    const buffer = file.buffer;
    void (async () => {
      try {
        const { totalPages, pages } = await extractPdfPages(buffer);
        if (pages.length === 0) {
          throw new Error("لم يتم العثور على نص في الملف");
        }
        await db.transaction(async (tx) => {
          await tx.insert(documentPagesTable).values(
            pages.map((p) => ({
              documentId: created.id,
              pageNumber: p.pageNumber,
              pageLabel: p.pageLabel,
              content: p.content,
            })),
          );
          await tx
            .update(documentsTable)
            .set({ totalPages, status: "ready", errorMessage: null })
            .where(eq(documentsTable.id, created.id));
        });
        logger.info({ docId: created.id, totalPages }, "Document processed");
      } catch (err) {
        const message = err instanceof Error ? err.message : "خطأ غير معروف";
        logger.error({ err, docId: created.id }, "PDF processing failed");
        await db
          .update(documentsTable)
          .set({ status: "failed", errorMessage: message })
          .where(eq(documentsTable.id, created.id));
      }
    })();
  },
);

router.get("/documents/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "معرف غير صالح" });
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
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(questionsTable)
    .where(eq(questionsTable.documentId, id));
  res.json(serializeDocument(doc, count ?? 0));
});

router.patch("/documents/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "معرف غير صالح" });
    return;
  }
  const body = req.body as { kind?: unknown; title?: unknown };
  const updates: Partial<typeof documentsTable.$inferInsert> = {};
  if (body && typeof body.kind === "string") {
    updates.kind = body.kind === "question_bank" ? "question_bank" : "curriculum";
  }
  if (body && typeof body.title === "string" && body.title.trim()) {
    updates.title = body.title.trim();
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "لا يوجد تحديث" });
    return;
  }
  const [updated] = await db
    .update(documentsTable)
    .set(updates)
    .where(eq(documentsTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "المستند غير موجود" });
    return;
  }
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(questionsTable)
    .where(eq(questionsTable.documentId, id));
  res.json(serializeDocument(updated, count ?? 0));
});

router.delete("/documents/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "معرف غير صالح" });
    return;
  }
  const result = await db
    .delete(documentsTable)
    .where(eq(documentsTable.id, id))
    .returning({ id: documentsTable.id });
  if (result.length === 0) {
    res.status(404).json({ error: "المستند غير موجود" });
    return;
  }
  res.status(204).end();
});

router.get("/documents/:id/file", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "معرف غير صالح" });
    return;
  }
  const [doc] = await db
    .select({
      filename: documentsTable.filename,
      fileData: documentsTable.fileData,
    })
    .from(documentsTable)
    .where(eq(documentsTable.id, id));
  if (!doc || !doc.fileData) {
    res.status(404).json({ error: "الملف غير متوفر" });
    return;
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${encodeURIComponent(doc.filename)}"`,
  );
  res.send(doc.fileData);
});

router.get(
  "/documents/:id/pages/:pageNumber",
  async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const pageNumber = Number(req.params.pageNumber);
    if (!Number.isFinite(id) || !Number.isFinite(pageNumber)) {
      res.status(400).json({ error: "معرف غير صالح" });
      return;
    }
    const [page] = await db
      .select()
      .from(documentPagesTable)
      .where(
        and(
          eq(documentPagesTable.documentId, id),
          eq(documentPagesTable.pageNumber, pageNumber),
        ),
      );
    if (!page) {
      res.status(404).json({ error: "الصفحة غير موجودة" });
      return;
    }
    res.json({
      documentId: page.documentId,
      pageNumber: page.pageNumber,
      pageLabel: page.pageLabel ?? null,
      content: page.content,
    });
  },
);

export default router;
