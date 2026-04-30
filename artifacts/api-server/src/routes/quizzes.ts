import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  documentsTable,
  documentPagesTable,
  documentChaptersTable,
  quizzesTable,
  quizAttemptsTable,
  type StoredQuizQuestion,
  type StoredAttemptItem,
  type QuizSettings,
  QUIZ_QUESTION_TYPES,
} from "@workspace/db";
import { extractChapters } from "../lib/chapters";
import { generateQuiz, gradeAnswer } from "../lib/quiz";

const router: IRouter = Router();

function serializeChapter(c: typeof documentChaptersTable.$inferSelect) {
  return {
    id: c.id,
    documentId: c.documentId,
    orderIndex: c.orderIndex,
    title: c.title,
    summary: c.summary ?? null,
    startPage: c.startPage,
    endPage: c.endPage,
  };
}

function serializeQuiz(q: typeof quizzesTable.$inferSelect) {
  return {
    id: q.id,
    documentId: q.documentId,
    name: q.name,
    chapterIds: q.chapterIds,
    settings: q.settings,
    questions: q.questions,
    createdAt: q.createdAt.toISOString(),
  };
}

function serializeAttempt(a: typeof quizAttemptsTable.$inferSelect) {
  return {
    id: a.id,
    quizId: a.quizId,
    items: a.items,
    score: a.score,
    maxScore: a.maxScore,
    completed: a.completed,
    createdAt: a.createdAt.toISOString(),
  };
}

/* ---------- Chapters ---------- */

router.get(
  "/documents/:id/chapters",
  async (req: Request, res: Response) => {
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
    if (doc.status !== "ready") {
      res
        .status(409)
        .json({ error: "المستند ليس جاهزًا بعد. يرجى الانتظار حتى تتم المعالجة." });
      return;
    }

    const existing = await db
      .select()
      .from(documentChaptersTable)
      .where(eq(documentChaptersTable.documentId, id))
      .orderBy(asc(documentChaptersTable.orderIndex));
    if (existing.length > 0) {
      res.json(existing.map(serializeChapter));
      return;
    }

    const pages = await db
      .select()
      .from(documentPagesTable)
      .where(eq(documentPagesTable.documentId, id))
      .orderBy(asc(documentPagesTable.pageNumber));

    try {
      const extracted = await extractChapters({
        documentTitle: doc.title,
        pages,
      });
      const inserted = await db
        .insert(documentChaptersTable)
        .values(
          extracted.map((c, i) => ({
            documentId: id,
            orderIndex: i,
            title: c.title,
            summary: c.summary ?? null,
            startPage: c.startPage,
            endPage: c.endPage,
          })),
        )
        .returning();
      res.json(inserted.map(serializeChapter));
    } catch (err) {
      req.log.error({ err }, "Failed to extract chapters");
      res.status(500).json({ error: "تعذّر استخراج الدروس من المستند" });
    }
  },
);

/* ---------- Quiz CRUD ---------- */

router.get(
  "/documents/:id/quizzes",
  async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "معرف غير صالح" });
      return;
    }
    const rows = await db
      .select()
      .from(quizzesTable)
      .where(eq(quizzesTable.documentId, id))
      .orderBy(desc(quizzesTable.createdAt));
    res.json(rows.map(serializeQuiz));
  },
);

router.post(
  "/documents/:id/quizzes",
  async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "معرف غير صالح" });
      return;
    }
    const body = req.body as {
      name?: unknown;
      chapterIds?: unknown;
      count?: unknown;
      settings?: unknown;
    };
    const name = String(body?.name ?? "").trim();
    const count = Math.max(
      1,
      Math.min(50, Number(body?.count ?? 10)),
    );
    const chapterIds = Array.isArray(body?.chapterIds)
      ? body!.chapterIds
          .map((x) => Number(x))
          .filter((x) => Number.isFinite(x))
      : [];
    const settingsIn = (body?.settings ?? {}) as Partial<QuizSettings>;
    const settings: QuizSettings = {
      randomizeQuestions: !!settingsIn.randomizeQuestions,
      randomizeChoices: !!settingsIn.randomizeChoices,
      timeLimitMinutes:
        typeof settingsIn.timeLimitMinutes === "number" &&
        settingsIn.timeLimitMinutes > 0
          ? settingsIn.timeLimitMinutes
          : null,
      difficulty:
        settingsIn.difficulty === "easy" ||
        settingsIn.difficulty === "medium" ||
        settingsIn.difficulty === "hard" ||
        settingsIn.difficulty === "mixed"
          ? settingsIn.difficulty
          : "medium",
      allowedTypes:
        Array.isArray(settingsIn.allowedTypes) &&
        settingsIn.allowedTypes.length > 0
          ? settingsIn.allowedTypes.filter(
              (t): t is QuizSettings["allowedTypes"][number] =>
                (QUIZ_QUESTION_TYPES as readonly string[]).includes(String(t)),
            )
          : [...QUIZ_QUESTION_TYPES],
    };
    if (!name) {
      res.status(400).json({ error: "اسم الاختبار مطلوب" });
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
        .json({ error: "المستند ليس جاهزًا بعد." });
      return;
    }

    const allChapters = await db
      .select()
      .from(documentChaptersTable)
      .where(eq(documentChaptersTable.documentId, id))
      .orderBy(asc(documentChaptersTable.orderIndex));

    const selectedChapters =
      chapterIds.length > 0
        ? allChapters.filter((c) => chapterIds.includes(c.id))
        : allChapters;

    let pageFilter: number[] | null = null;
    if (chapterIds.length > 0 && selectedChapters.length > 0) {
      const set = new Set<number>();
      for (const c of selectedChapters) {
        for (let p = c.startPage; p <= c.endPage; p++) set.add(p);
      }
      pageFilter = [...set].sort((a, b) => a - b);
    }

    const pagesRows = pageFilter
      ? await db
          .select()
          .from(documentPagesTable)
          .where(
            and(
              eq(documentPagesTable.documentId, id),
              inArray(documentPagesTable.pageNumber, pageFilter),
            ),
          )
          .orderBy(asc(documentPagesTable.pageNumber))
      : await db
          .select()
          .from(documentPagesTable)
          .where(eq(documentPagesTable.documentId, id))
          .orderBy(asc(documentPagesTable.pageNumber));

    if (pagesRows.length === 0) {
      res.status(422).json({ error: "لا يوجد محتوى في الدروس المختارة" });
      return;
    }

    const documentKind: "curriculum" | "question_bank" =
      doc.kind === "question_bank" ? "question_bank" : "curriculum";

    try {
      const questions = await generateQuiz({
        documentTitle: doc.title,
        documentKind,
        pages: pagesRows,
        chapterTitles: selectedChapters.map((c) => c.title),
        count,
        settings,
      });
      if (questions.length === 0) {
        res.status(422).json({
          error: "تعذّر توليد أسئلة من هذا المحتوى. حاول تغيير الإعدادات.",
        });
        return;
      }

      const [saved] = await db
        .insert(quizzesTable)
        .values({
          documentId: id,
          name,
          chapterIds: selectedChapters.map((c) => c.id),
          settings,
          questions,
        })
        .returning();
      if (!saved) {
        res.status(500).json({ error: "تعذّر حفظ الاختبار" });
        return;
      }
      res.status(201).json(serializeQuiz(saved));
    } catch (err) {
      req.log.error({ err }, "Failed to generate quiz");
      res.status(500).json({ error: "حدث خطأ أثناء توليد الاختبار" });
    }
  },
);

router.get("/quizzes/:quizId", async (req: Request, res: Response) => {
  const quizId = Number(req.params.quizId);
  if (!Number.isFinite(quizId)) {
    res.status(400).json({ error: "معرف غير صالح" });
    return;
  }
  const [quiz] = await db
    .select()
    .from(quizzesTable)
    .where(eq(quizzesTable.id, quizId));
  if (!quiz) {
    res.status(404).json({ error: "الاختبار غير موجود" });
    return;
  }
  res.json(serializeQuiz(quiz));
});

router.delete("/quizzes/:quizId", async (req: Request, res: Response) => {
  const quizId = Number(req.params.quizId);
  if (!Number.isFinite(quizId)) {
    res.status(400).json({ error: "معرف غير صالح" });
    return;
  }
  const result = await db
    .delete(quizzesTable)
    .where(eq(quizzesTable.id, quizId))
    .returning({ id: quizzesTable.id });
  if (result.length === 0) {
    res.status(404).json({ error: "الاختبار غير موجود" });
    return;
  }
  res.status(204).end();
});

/* ---------- Attempts ---------- */

router.get(
  "/quizzes/:quizId/attempts",
  async (req: Request, res: Response) => {
    const quizId = Number(req.params.quizId);
    if (!Number.isFinite(quizId)) {
      res.status(400).json({ error: "معرف غير صالح" });
      return;
    }
    const rows = await db
      .select()
      .from(quizAttemptsTable)
      .where(eq(quizAttemptsTable.quizId, quizId))
      .orderBy(desc(quizAttemptsTable.createdAt));
    res.json(rows.map(serializeAttempt));
  },
);

router.post(
  "/quizzes/:quizId/attempts",
  async (req: Request, res: Response) => {
    const quizId = Number(req.params.quizId);
    if (!Number.isFinite(quizId)) {
      res.status(400).json({ error: "معرف غير صالح" });
      return;
    }
    const body = req.body as { answers?: unknown; questionIds?: unknown };
    const answersIn = Array.isArray(body?.answers) ? body!.answers : [];
    const subsetIdsIn = Array.isArray(body?.questionIds)
      ? body!.questionIds
      : null;

    const [quiz] = await db
      .select()
      .from(quizzesTable)
      .where(eq(quizzesTable.id, quizId));
    if (!quiz) {
      res.status(404).json({ error: "الاختبار غير موجود" });
      return;
    }
    const [doc] = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.id, quiz.documentId));
    if (!doc) {
      res.status(404).json({ error: "المستند غير موجود" });
      return;
    }

    const answerByQid = new Map<string, string>();
    for (const a of answersIn) {
      if (!a || typeof a !== "object") continue;
      const r = a as Record<string, unknown>;
      const qid = String(r.questionId ?? "");
      const ua = String(r.userAnswer ?? "");
      if (qid) answerByQid.set(qid, ua);
    }

    const pages = await db
      .select()
      .from(documentPagesTable)
      .where(eq(documentPagesTable.documentId, doc.id))
      .orderBy(asc(documentPagesTable.pageNumber));

    const items: StoredAttemptItem[] = [];
    let totalScore = 0;
    let maxScore = 0;
    const allQuestions = (quiz.questions ?? []) as StoredQuizQuestion[];
    // Optional subset filter: when set, only these questions count toward
    // the attempt (used by the "retake wrong questions only" flow).
    const subsetSet =
      subsetIdsIn && subsetIdsIn.length > 0
        ? new Set(subsetIdsIn.map((x) => String(x)))
        : null;
    const questions = subsetSet
      ? allQuestions.filter((q) => subsetSet.has(q.id))
      : allQuestions;
    if (questions.length === 0) {
      res.status(400).json({ error: "لا توجد أسئلة للتصحيح." });
      return;
    }

    // Grade in parallel batches to keep latency reasonable.
    const concurrency = 4;
    let cursor = 0;
    async function worker() {
      while (cursor < questions.length) {
        const i = cursor++;
        const q = questions[i]!;
        const userAnswer = answerByQid.get(q.id) ?? "";
        const result = await gradeAnswer({
          documentTitle: doc.title,
          pages,
          question: q,
          userAnswer,
        });
        items[i] = {
          questionId: q.id,
          userAnswer,
          score: result.score,
          verdict: result.verdict,
          feedback: result.feedback,
        };
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(concurrency, questions.length) }, () =>
        worker(),
      ),
    );

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]!;
      const item = items[i]!;
      maxScore += q.points;
      totalScore += item.score * q.points;
    }

    const [saved] = await db
      .insert(quizAttemptsTable)
      .values({
        quizId,
        items,
        score: Math.round(totalScore),
        maxScore: Math.round(maxScore),
        completed: true,
      })
      .returning();

    if (!saved) {
      res.status(500).json({ error: "تعذّر حفظ المحاولة" });
      return;
    }
    res.status(201).json(serializeAttempt(saved));
  },
);

export default router;
