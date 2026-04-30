import { ai, Type } from "@workspace/integrations-gemini-ai";
import type {
  DocumentPageRow,
  StoredQuizQuestion,
  QuizSettings,
  QuizQuestionType,
  StoredAttemptItem,
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
- mcq: ضع الخيارات في حقل choices كمصفوفة من 4 نصوص (بدون "أ/ب/ج/د"؛ فقط نص الخيار). والـ correctAnswer يكون **النص الحرفي للخيار الصحيح** (مطابق تمامًا لأحد عناصر choices).
- true_false: choices دائمًا ["صح", "خطأ"]. correctAnswer إما "صح" أو "خطأ".
- fill_blank: اطرح جملة فيها فراغ بصيغة "____" (4 شرطات سفلية). الـ correctAnswer هو الكلمة/العبارة التي تملأ الفراغ. اترك choices فارغًا.
- short_answer: سؤال يحتاج إجابة من سطر إلى ثلاثة أسطر. الـ correctAnswer هو نموذج الإجابة المرجعية. اترك choices فارغًا.
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
              },
              required: ["type", "prompt", "correctAnswer"],
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
    const correctAnswer = String(r.correctAnswer ?? "").trim();
    if (!prompt || !correctAnswer) continue;
    let choices: string[] | undefined;
    if (Array.isArray(r.choices)) {
      choices = r.choices
        .map((c) => String(c ?? "").trim())
        .filter((c) => c.length > 0);
    }
    if (r.type === "mcq") {
      if (!choices || choices.length < 2) continue;
      // Ensure correctAnswer is one of the choices; if model returned "أ"
      // or similar, try to map to first choice.
      if (!choices.includes(correctAnswer)) {
        // try to map a single-letter answer (أ/ب/ج/د / A-D / 1-4)
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
    }
    if (r.type === "true_false") {
      const norm = (s: string) =>
        s
          .replace(/[\u064b-\u065f]/g, "")
          .replace(/[ًٌٍَُِّْ]/g, "")
          .trim();
      const ans = norm(correctAnswer);
      const isTrue = ans === "صح" || ans === "صحيح" || ans === "true";
      const isFalse = ans === "خطأ" || ans === "خاطئ" || ans === "غلط" || ans === "false";
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
