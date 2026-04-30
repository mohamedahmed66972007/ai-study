import { ai, Type } from "@workspace/integrations-gemini-ai";
import type {
  DocumentPageRow,
  StoredQuizQuestion,
  QuizSettings,
  QuizQuestionType,
  StoredAttemptItem,
  StoredComparisonTable,
  StoredOddOneOut,
} from "@workspace/db";
import { QUIZ_QUESTION_TYPES } from "@workspace/db";
import { logger } from "./logger";

const MAX_CONTEXT_CHARS = 500_000;

function buildContext(pages: DocumentPageRow[]): string {
  const sorted = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const parts: string[] = [];
  let total = 0;
  for (const p of sorted) {
    const labelPart = p.pageLabel ? ` (المطبوع: ${p.pageLabel})` : "";
    const block = `\n===== صفحة ${p.pageNumber}${labelPart} =====\n${p.content}\n`;
    if (total + block.length > MAX_CONTEXT_CHARS) {
      parts.push(`\n[تم اقتطاع الباقي بسبب الطول]\n`);
      break;
    }
    parts.push(block);
    total += block.length;
  }
  return parts.join("");
}

function difficultyLabel(d: QuizSettings["difficulty"]): string {
  switch (d) {
    case "easy":
      return "سهل (مفاهيم أساسية ومباشرة)";
    case "medium":
      return "متوسط (يتطلب فهماً وربطاً)";
    case "hard":
      return "صعب (تحليل، استنتاج، وأسئلة دقيقة)";
    case "mixed":
      return "متنوع بين السهل والمتوسط والصعب";
  }
}

function typesArabic(types: QuizQuestionType[]): string {
  const map: Record<QuizQuestionType, string> = {
    mcq: "اختيار من متعدد (4 خيارات بصيغة أ/ب/ج/د)",
    true_false: "صح أو خطأ",
    fill_blank: "أكمل الفراغ (الجواب كلمة أو عبارة قصيرة)",
    short_answer: "إجابة قصيرة (سطر إلى ثلاثة أسطر)",
    comparison_table:
      "جدول مقارنة (املأ خلايا الجدول لمقارنة بين مفهومين أو أكثر)",
    list_factors:
      "اذكر العوامل التي يتوقف عليها (يكتب الطالب عدّة عوامل دون أن يعرف عددها مسبقًا)",
    odd_one_out:
      "ما المختلف مع ذكر السبب (تُعطى أربع كلمات ويحدد الطالب المختلف ويعلّل)",
  };
  return types.map((t) => `- ${map[t]}`).join("\n");
}

function pageLabelMap(pages: DocumentPageRow[]): Map<number, string | null> {
  const m = new Map<number, string | null>();
  for (const p of pages) m.set(p.pageNumber, p.pageLabel ?? null);
  return m;
}

function isQuizType(v: unknown): v is QuizQuestionType {
  return (
    typeof v === "string" &&
    (QUIZ_QUESTION_TYPES as readonly string[]).includes(v)
  );
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export interface GenerateQuizArgs {
  documentTitle: string;
  documentKind: "curriculum" | "question_bank";
  pages: DocumentPageRow[];
  chapterTitles: string[];
  count: number;
  settings: QuizSettings;
}

/**
 * Generate quiz questions from the (chapter-filtered) pages of a document.
 * If documentKind === "question_bank" the AI will lift questions out of the
 * document instead of authoring new ones.
 */
export async function generateQuiz(
  args: GenerateQuizArgs,
): Promise<StoredQuizQuestion[]> {
  const {
    documentTitle,
    documentKind,
    pages,
    chapterTitles,
    count,
    settings,
  } = args;
  if (pages.length === 0) return [];

  const labelMap = pageLabelMap(pages);
  const context = buildContext(pages);
  const targetTypes =
    settings.allowedTypes.length > 0
      ? settings.allowedTypes
      : ([...QUIZ_QUESTION_TYPES] as QuizQuestionType[]);

  const chaptersHint =
    chapterTitles.length > 0
      ? `الدروس/الفصول المختارة: ${chapterTitles.join(" • ")}`
      : "كل المحتوى المرفق";

  const sourceRule =
    documentKind === "question_bank"
      ? `هذا الملف عبارة عن بنك أسئلة جاهز. **استخرج الأسئلة من المستند نفسه كما هي** ولا تخترع أسئلة جديدة. استخدم الإجابة الموجودة في المستند كإجابة صحيحة.`
      : `هذا الملف عبارة عن محتوى دراسي. **اصنع أسئلة جديدة** بناءً على المحتوى لتختبر فهم الطالب.`;

  const systemInstruction = `أنت مولّد اختبارات دراسية باللغة العربية لمستند "${documentTitle}".

${sourceRule}

${chaptersHint}.
المستوى المطلوب: ${difficultyLabel(settings.difficulty)}.
عدد الأسئلة المطلوبة: ${count}.
أنواع الأسئلة المسموح بها (وزّع الأسئلة بين هذه الأنواع بشكل متوازن قدر الإمكان):
${typesArabic(targetTypes)}

قواعد صارمة:
- كل الأسئلة والإجابات يجب أن تستند حصريًا إلى محتوى المستند المرفق. ممنوع استخدام أي معلومة خارجية.
- لكل سؤال حدّد الحقل type بأحد القيم: ${targetTypes.join(", ")}.
- mcq: ضع الخيارات في حقل choices كمصفوفة من 4 نصوص (بدون "أ/ب/ج/د"؛ فقط نص الخيار). والـ correctAnswer يكون **النص الحرفي للخيار الصحيح** (مطابق تمامًا لأحد عناصر choices). اترك حقول comparison و factors و oddOneOut فارغة.
- true_false: choices دائمًا ["صح", "خطأ"]. correctAnswer إما "صح" أو "خطأ". اترك حقول comparison و factors و oddOneOut فارغة.
- fill_blank: اطرح جملة فيها فراغ بصيغة "____" (4 شرطات سفلية). الـ correctAnswer هو الكلمة/العبارة التي تملأ الفراغ. اترك choices فارغًا.
- short_answer: سؤال يحتاج إجابة من سطر إلى ثلاثة أسطر. الـ correctAnswer هو نموذج الإجابة المرجعية. اترك choices فارغًا.
- comparison_table: في حقل comparison ضع الجدول كاملاً:
    headers: مصفوفة من المفاهيم التي تقارن بينها (مثلاً ["الخلية النباتية", "الخلية الحيوانية"]). يجب أن تحتوي على عنصرين على الأقل.
    rows: مصفوفة كل عنصر فيها {label, cells}؛ label هو وجه المقارنة (مثلاً "جدار الخلية")، و cells مصفوفة من النصوص بنفس طول headers، تمثل القيمة الصحيحة لكل عمود.
  prompt يجب أن يصف ما يقارن بينه بوضوح (مثلاً: "أكمل جدول المقارنة الآتي بين الخلية النباتية والخلية الحيوانية"). اجعل عدد الصفوف بين 3 و 6.
  correctAnswer: ضع نسخة JSON مختصرة بالشكل {"rows":[{"label":"...","cells":["...","..."]}, ...]} (تستخدم للتصحيح فقط).
  اترك choices و factors و oddOneOut فارغة.
- list_factors: السؤال من نوع "اذكر العوامل التي يتوقف عليها كذا". في حقل factors ضع المصفوفة الكاملة للعوامل الصحيحة كما وردت بالمستند. اجعل عدد العوامل بين 2 و 6.
  prompt يبدأ غالبًا بـ "اذكر العوامل التي يتوقف عليها …" دون ذكر العدد.
  correctAnswer: نسخة JSON مختصرة بالشكل {"factors":["...","..."]}.
  اترك choices و comparison و oddOneOut فارغة.
- odd_one_out: ضع أربع كلمات في حقل choices (يجب أن تكون 4 بالضبط). في حقل oddOneOut ضع {different, reason}؛ different هو الكلمة المختلفة (يجب أن تطابق إحدى عناصر choices حرفيًا)، و reason جملة قصيرة من المستند تشرح سبب اختلافها.
  prompt مثال: "أيّ الكلمات التالية مختلفة عن البقية؟ اذكر الكلمة المختلفة مع تعليل اختيارك."
  correctAnswer: نسخة JSON مختصرة بالشكل {"different":"...","reason":"..."}.
  اترك comparison و factors فارغة.
- لكل سؤال، أضف explanation قصيرًا (جملة) يوضح لماذا الإجابة صحيحة.
- لكل سؤال، اذكر pageNumber برقم صفحة PDF (الرقم بعد كلمة "صفحة" في رؤوس الأقسام)، وليس الرقم المطبوع.
- لا تكرر أسئلة. نوّع الأسئلة على أجزاء المحتوى المتاح.
- لا تذكر "صفحة كذا" داخل نص السؤال نفسه.

أعد JSON فقط بالحقل questions.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [{ text: `محتوى المستند:\n${context}` }],
      },
    ],
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING },
                prompt: { type: Type.STRING },
                choices: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                correctAnswer: { type: Type.STRING },
                explanation: { type: Type.STRING },
                pageNumber: { type: Type.NUMBER },
                comparison: {
                  type: Type.OBJECT,
                  properties: {
                    headers: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    rows: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          label: { type: Type.STRING },
                          cells: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                          },
                        },
                      },
                    },
                  },
                },
                factors: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                oddOneOut: {
                  type: Type.OBJECT,
                  properties: {
                    different: { type: Type.STRING },
                    reason: { type: Type.STRING },
                  },
                },
              },
              required: ["type", "prompt"],
            },
          },
        },
        required: ["questions"],
      },
    },
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.text ?? "{}");
  } catch (err) {
    logger.warn({ err }, "Failed to parse quiz JSON");
    parsed = {};
  }
  const arr =
    parsed && typeof parsed === "object" && "questions" in parsed
      ? (parsed as { questions: unknown }).questions
      : null;
  if (!Array.isArray(arr)) return [];

  const out: StoredQuizQuestion[] = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (!isQuizType(r.type)) continue;
    const prompt = String(r.prompt ?? "").trim();
    if (!prompt) continue;
    let correctAnswer = String(r.correctAnswer ?? "").trim();
    let choices: string[] | undefined;
    if (Array.isArray(r.choices)) {
      choices = r.choices
        .map((c) => String(c ?? "").trim())
        .filter((c) => c.length > 0);
    }

    if (r.type === "mcq") {
      if (!correctAnswer) continue;
      if (!choices || choices.length < 2) continue;
      // Ensure correctAnswer is one of the choices; if model returned "أ"
      // or similar, try to map to first choice.
      if (!choices.includes(correctAnswer)) {
        const letterMap: Record<string, number> = {
          أ: 0, ب: 1, ج: 2, د: 3,
          A: 0, B: 1, C: 2, D: 3,
          a: 0, b: 1, c: 2, d: 3,
          "1": 0, "2": 1, "3": 2, "4": 3,
        };
        const idx = letterMap[correctAnswer];
        if (idx !== undefined && choices[idx] !== undefined) {
          out.push({
            id: shortId(),
            type: "mcq",
            prompt,
            choices,
            correctAnswer: choices[idx]!,
            explanation: r.explanation
              ? String(r.explanation).trim()
              : undefined,
            pageNumber:
              typeof r.pageNumber === "number" ? r.pageNumber : undefined,
            pageLabel:
              typeof r.pageNumber === "number"
                ? labelMap.get(r.pageNumber) ?? null
                : null,
            points: 1,
          });
        }
        continue;
      }
      out.push({
        id: shortId(),
        type: "mcq",
        prompt,
        choices,
        correctAnswer,
        explanation: r.explanation ? String(r.explanation).trim() : undefined,
        pageNumber:
          typeof r.pageNumber === "number" ? r.pageNumber : undefined,
        pageLabel:
          typeof r.pageNumber === "number"
            ? labelMap.get(r.pageNumber) ?? null
            : null,
        points: 1,
      });
      continue;
    }

    if (r.type === "true_false") {
      if (!correctAnswer) continue;
      const norm = (s: string) =>
        s
          .replace(/[\u064b-\u065f]/g, "")
          .replace(/[ًٌٍَُِّْ]/g, "")
          .trim();
      const ans = norm(correctAnswer);
      const isTrue = ans === "صح" || ans === "صحيح" || ans === "true";
      const isFalse =
        ans === "خطأ" || ans === "خاطئ" || ans === "غلط" || ans === "false";
      if (!isTrue && !isFalse) continue;
      out.push({
        id: shortId(),
        type: "true_false",
        prompt,
        choices: ["صح", "خطأ"],
        correctAnswer: isTrue ? "صح" : "خطأ",
        explanation: r.explanation ? String(r.explanation).trim() : undefined,
        pageNumber:
          typeof r.pageNumber === "number" ? r.pageNumber : undefined,
        pageLabel:
          typeof r.pageNumber === "number"
            ? labelMap.get(r.pageNumber) ?? null
            : null,
        points: 1,
      });
      continue;
    }

    if (r.type === "comparison_table") {
      const cmpRaw = r.comparison as Record<string, unknown> | undefined;
      const headers = Array.isArray(cmpRaw?.headers)
        ? cmpRaw!.headers
            .map((h) => String(h ?? "").trim())
            .filter((h) => h.length > 0)
        : [];
      const rowsRaw = Array.isArray(cmpRaw?.rows) ? cmpRaw!.rows : [];
      const rows: { label: string; cells: string[] }[] = [];
      for (const rowRaw of rowsRaw) {
        if (!rowRaw || typeof rowRaw !== "object") continue;
        const row = rowRaw as Record<string, unknown>;
        const label = String(row.label ?? "").trim();
        const cells = Array.isArray(row.cells)
          ? row.cells.map((c) => String(c ?? "").trim())
          : [];
        if (!label || cells.length !== headers.length) continue;
        rows.push({ label, cells });
      }
      if (headers.length < 2 || rows.length === 0) continue;
      const comparison: StoredComparisonTable = { headers, rows };
      const ca = correctAnswer || JSON.stringify({ rows });
      out.push({
        id: shortId(),
        type: "comparison_table",
        prompt,
        correctAnswer: ca,
        explanation: r.explanation ? String(r.explanation).trim() : undefined,
        pageNumber:
          typeof r.pageNumber === "number" ? r.pageNumber : undefined,
        pageLabel:
          typeof r.pageNumber === "number"
            ? labelMap.get(r.pageNumber) ?? null
            : null,
        points: 1,
        comparison,
      });
      continue;
    }

    if (r.type === "list_factors") {
      const factors = Array.isArray(r.factors)
        ? (r.factors as unknown[])
            .map((f) => String(f ?? "").trim())
            .filter((f) => f.length > 0)
        : [];
      if (factors.length < 2) continue;
      const ca = correctAnswer || JSON.stringify({ factors });
      out.push({
        id: shortId(),
        type: "list_factors",
        prompt,
        correctAnswer: ca,
        explanation: r.explanation ? String(r.explanation).trim() : undefined,
        pageNumber:
          typeof r.pageNumber === "number" ? r.pageNumber : undefined,
        pageLabel:
          typeof r.pageNumber === "number"
            ? labelMap.get(r.pageNumber) ?? null
            : null,
        points: 1,
        factors,
      });
      continue;
    }

    if (r.type === "odd_one_out") {
      if (!choices || choices.length !== 4) continue;
      const oddRaw = r.oddOneOut as Record<string, unknown> | undefined;
      const different = String(oddRaw?.different ?? "").trim();
      const reason = String(oddRaw?.reason ?? "").trim();
      if (!different || !reason) continue;
      if (!choices.includes(different)) continue;
      const odd: StoredOddOneOut = { different, reason };
      const ca = correctAnswer || JSON.stringify(odd);
      out.push({
        id: shortId(),
        type: "odd_one_out",
        prompt,
        choices,
        correctAnswer: ca,
        explanation: r.explanation ? String(r.explanation).trim() : undefined,
        pageNumber:
          typeof r.pageNumber === "number" ? r.pageNumber : undefined,
        pageLabel:
          typeof r.pageNumber === "number"
            ? labelMap.get(r.pageNumber) ?? null
            : null,
        points: 1,
        oddOneOut: odd,
      });
      continue;
    }

    // fill_blank / short_answer fallback
    if (!correctAnswer) continue;
    out.push({
      id: shortId(),
      type: r.type,
      prompt,
      choices,
      correctAnswer,
      explanation: r.explanation ? String(r.explanation).trim() : undefined,
      pageNumber: typeof r.pageNumber === "number" ? r.pageNumber : undefined,
      pageLabel:
        typeof r.pageNumber === "number"
          ? labelMap.get(r.pageNumber) ?? null
          : null,
      points: 1,
    });
  }

  return out;
}

/* ----------------------------------------------------------------------- */
/* Grading                                                                  */
/* ----------------------------------------------------------------------- */

function normalizeArabic(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u064b-\u065f]/g, "") // remove diacritics
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\s\u00a0]+/g, " ")
    .replace(/[.,،؛:!؟?\-_/\\()"'`]/g, "")
    .trim();
}

function exactOrCloseLocal(
  user: string,
  ref: string,
): { score: number; verdict: StoredAttemptItem["verdict"] } | null {
  if (!user.trim()) return { score: 0, verdict: "empty" };
  const u = normalizeArabic(user);
  const r = normalizeArabic(ref);
  if (!u) return { score: 0, verdict: "empty" };
  if (u === r) return { score: 1, verdict: "correct" };
  // simple containment heuristic for very short references
  if (r.length <= 30 && (u.includes(r) || r.includes(u))) {
    return { score: 1, verdict: "correct" };
  }
  return null;
}

export interface GradeAnswerArgs {
  documentTitle: string;
  pages: DocumentPageRow[];
  question: StoredQuizQuestion;
  userAnswer: string;
}

function tryParseUserPayload(s: string): unknown {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * Grade a single short-answer / fill-blank user answer against the reference
 * answer using the document as the only source of truth. MCQ and true/false
 * are graded locally (no AI call).
 */
export async function gradeAnswer(
  args: GradeAnswerArgs,
): Promise<Omit<StoredAttemptItem, "questionId" | "userAnswer">> {
  const { question, userAnswer } = args;

  // Cheap path: empty
  if (!userAnswer.trim()) {
    return { score: 0, verdict: "empty", feedback: "لم يتم إدخال إجابة." };
  }

  // MCQ + true/false → exact match against the literal correct option.
  if (question.type === "mcq" || question.type === "true_false") {
    const ok =
      normalizeArabic(userAnswer) === normalizeArabic(question.correctAnswer);
    return {
      score: ok ? 1 : 0,
      verdict: ok ? "correct" : "wrong",
      feedback: ok ? undefined : `الإجابة الصحيحة: ${question.correctAnswer}`,
    };
  }

  // ---- list_factors: set-membership match against the canonical list. ----
  if (question.type === "list_factors") {
    const ref = question.factors ?? [];
    const payload = tryParseUserPayload(userAnswer);
    let userFactors: string[] = [];
    if (payload && typeof payload === "object" && Array.isArray(
      (payload as { factors?: unknown }).factors,
    )) {
      userFactors = (payload as { factors: unknown[] }).factors
        .map((x) => String(x ?? "").trim())
        .filter((x) => x.length > 0);
    } else {
      userFactors = userAnswer
        .split(/[\n،,•\-]+/)
        .map((x) => x.trim())
        .filter((x) => x.length > 0);
    }
    if (ref.length === 0) {
      return {
        score: 0,
        verdict: "wrong",
        feedback: "لا يوجد مرجع للعوامل في هذا السؤال.",
      };
    }
    if (userFactors.length === 0) {
      return { score: 0, verdict: "empty", feedback: "لم تُذكر أي عوامل." };
    }

    const refNormSet = new Set(ref.map((r) => normalizeArabic(r)));
    let matched = 0;
    const seen = new Set<string>();
    for (const f of userFactors) {
      const nf = normalizeArabic(f);
      if (!nf || seen.has(nf)) continue;
      seen.add(nf);
      // exact match OR substring containment in either direction
      let hit = refNormSet.has(nf);
      if (!hit) {
        for (const rN of refNormSet) {
          if (rN.length >= 3 && (nf.includes(rN) || rN.includes(nf))) {
            hit = true;
            break;
          }
        }
      }
      if (hit) matched++;
    }
    const correctCount = matched;
    const totalRef = ref.length;
    const extras = Math.max(0, seen.size - matched);
    // Lose a small amount for wrong extras (but never below 0).
    const raw = Math.max(0, correctCount - extras * 0.25) / totalRef;
    const score = Math.max(0, Math.min(1, raw));
    let verdict: StoredAttemptItem["verdict"];
    if (score >= 0.95 && correctCount === totalRef) verdict = "correct";
    else if (score >= 0.3) verdict = "partial";
    else verdict = "wrong";
    const feedback =
      verdict === "correct"
        ? undefined
        : `ذكرت ${correctCount} من ${totalRef} عامل صحيح. العوامل المرجعية: ${ref.join(
            "، ",
          )}.`;
    return { score, verdict, feedback };
  }

  // ---- odd_one_out: half for picking the right word, half for the reason. ----
  if (question.type === "odd_one_out") {
    const ref = question.oddOneOut;
    const payload = tryParseUserPayload(userAnswer);
    let userDiff = "";
    let userReason = "";
    if (payload && typeof payload === "object") {
      const p = payload as Record<string, unknown>;
      userDiff = String(p.different ?? "").trim();
      userReason = String(p.reason ?? "").trim();
    }
    if (!ref) {
      return {
        score: 0,
        verdict: "wrong",
        feedback: "لا يوجد مرجع لهذا السؤال.",
      };
    }
    if (!userDiff && !userReason) {
      return { score: 0, verdict: "empty", feedback: "لم يتم إدخال إجابة." };
    }
    const wordOk =
      normalizeArabic(userDiff) === normalizeArabic(ref.different);
    let reasonScore = 0;
    if (userReason) {
      const local = exactOrCloseLocal(userReason, ref.reason);
      if (local && local.verdict === "correct") reasonScore = 1;
    }
    // If the local heuristic didn't catch the reason, ask AI to judge.
    if (userReason && reasonScore === 0) {
      const aiJudge = await aiJudgeShort({
        documentTitle: args.documentTitle,
        pages: args.pages,
        prompt: `الكلمة المختلفة الصحيحة: ${ref.different}. هل تعليل الطالب التالي صحيح ومستند للمستند؟ تعليل الطالب: "${userReason}". التعليل المرجعي: "${ref.reason}". أعد JSON {ok: true|false}.`,
      });
      if (aiJudge.ok) reasonScore = 1;
    }
    const score = (wordOk ? 0.5 : 0) + reasonScore * 0.5;
    let verdict: StoredAttemptItem["verdict"];
    if (score >= 0.95) verdict = "correct";
    else if (score > 0) verdict = "partial";
    else verdict = "wrong";
    const feedback =
      verdict === "correct"
        ? undefined
        : `الكلمة المختلفة: ${ref.different}. السبب: ${ref.reason}`;
    return { score, verdict, feedback };
  }

  // ---- comparison_table: per-cell match, partial credit. ----
  if (question.type === "comparison_table") {
    const cmp = question.comparison;
    if (!cmp) {
      return {
        score: 0,
        verdict: "wrong",
        feedback: "لا يوجد مرجع للجدول.",
      };
    }
    const payload = tryParseUserPayload(userAnswer) as
      | { rows?: { cells?: unknown[] }[] }
      | null;
    const userRows = Array.isArray(payload?.rows) ? payload!.rows : [];
    if (userRows.length === 0) {
      return { score: 0, verdict: "empty", feedback: "لم يتم ملء الجدول." };
    }
    let totalCells = 0;
    let correctCells = 0;
    for (let i = 0; i < cmp.rows.length; i++) {
      const refRow = cmp.rows[i]!;
      const userRow = userRows[i];
      const userCells = Array.isArray(userRow?.cells) ? userRow!.cells : [];
      for (let j = 0; j < refRow.cells.length; j++) {
        totalCells++;
        const ref = refRow.cells[j] ?? "";
        const usr = String(userCells[j] ?? "");
        if (!usr.trim()) continue;
        const local = exactOrCloseLocal(usr, ref);
        if (local && local.verdict === "correct") {
          correctCells++;
          continue;
        }
        // AI fallback for a single cell
        const aiOk = await aiJudgeShort({
          documentTitle: args.documentTitle,
          pages: args.pages,
          prompt: `هل هذه الإجابة صحيحة لخانة "${refRow.label}" في عمود "${
            cmp.headers[j]
          }"؟ إجابة الطالب: "${usr}". الإجابة المرجعية: "${ref}". أعد JSON {ok:true|false}.`,
        });
        if (aiOk.ok) correctCells++;
      }
    }
    const score = totalCells > 0 ? correctCells / totalCells : 0;
    let verdict: StoredAttemptItem["verdict"];
    if (score >= 0.95) verdict = "correct";
    else if (score >= 0.3) verdict = "partial";
    else verdict = "wrong";
    const feedback =
      verdict === "correct"
        ? undefined
        : `صحّ من خلايا الجدول ${correctCells} من ${totalCells}.`;
    return { score, verdict, feedback };
  }

  // Local quick path for fill_blank and short_answer.
  const local = exactOrCloseLocal(userAnswer, question.correctAnswer);
  if (local) {
    return {
      ...local,
      feedback:
        local.verdict === "correct"
          ? undefined
          : `الإجابة الصحيحة: ${question.correctAnswer}`,
    };
  }

  // Otherwise ask the AI to judge based on the document context.
  const { documentTitle, pages } = args;
  const context = buildContext(pages);

  const systemInstruction = `أنت مصحّح اختبارات. اعتمد فقط على محتوى المستند "${documentTitle}" وعلى الإجابة المرجعية المعطاة.

قواعد التصحيح:
- إجابة صحيحة بالكامل أو إعادة صياغة دقيقة لنفس المعنى => verdict="correct" و score=1.0 مع تجاهل الأخطاء الإملائية الصغيرة.
- إجابة جزئية (ذكرت بعض النقاط الجوهرية فقط أو فيها عناصر صحيحة وعناصر خاطئة) => verdict="partial" و score بين 0.3 و 0.7.
- إجابة خاطئة أو لا تستند للمستند => verdict="wrong" و score=0.0.
- إجابة فارغة => verdict="empty" و score=0.0.
أضف feedback مختصرًا (جملة واحدة) يوضح للطالب سبب التقييم، ويذكر الإجابة الصحيحة المختصرة عند الخطأ.

أعد JSON فقط بالحقول: score (رقم 0..1), verdict, feedback.`;

  const userPrompt = `نص السؤال: ${question.prompt}
الإجابة المرجعية (من المستند): ${question.correctAnswer}
إجابة الطالب: ${userAnswer}

محتوى المستند للمرجعية:
${context.slice(0, 100_000)}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.NUMBER },
            verdict: { type: Type.STRING },
            feedback: { type: Type.STRING },
          },
          required: ["score", "verdict"],
        },
      },
    });
    const parsed = JSON.parse(response.text ?? "{}") as {
      score?: unknown;
      verdict?: unknown;
      feedback?: unknown;
    };
    const score = Math.max(
      0,
      Math.min(1, typeof parsed.score === "number" ? parsed.score : 0),
    );
    const v = String(parsed.verdict ?? "wrong");
    const verdict: StoredAttemptItem["verdict"] =
      v === "correct" || v === "partial" || v === "wrong" || v === "empty"
        ? v
        : score >= 0.95
        ? "correct"
        : score > 0
        ? "partial"
        : "wrong";
    return {
      score,
      verdict,
      feedback: parsed.feedback ? String(parsed.feedback) : undefined,
    };
  } catch (err) {
    logger.warn({ err }, "AI grading failed; defaulting to wrong");
    return {
      score: 0,
      verdict: "wrong",
      feedback: `تعذّر التصحيح آليًا. الإجابة المرجعية: ${question.correctAnswer}`,
    };
  }
}

/** Tiny one-shot AI judge that returns a yes/no for a sub-claim. */
async function aiJudgeShort(args: {
  documentTitle: string;
  pages: DocumentPageRow[];
  prompt: string;
}): Promise<{ ok: boolean }> {
  const ctx = buildContext(args.pages).slice(0, 80_000);
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: args.prompt }] }],
      config: {
        systemInstruction: `أنت مصحح. اعتمد على المستند "${args.documentTitle}" فقط. أعد {ok:true|false}.\nمحتوى للمرجعية:\n${ctx}`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: { ok: { type: Type.BOOLEAN } },
          required: ["ok"],
        },
      },
    });
    const parsed = JSON.parse(response.text ?? "{}") as { ok?: unknown };
    return { ok: parsed.ok === true };
  } catch (err) {
    logger.warn({ err }, "aiJudgeShort failed; defaulting to false");
    return { ok: false };
  }
}
