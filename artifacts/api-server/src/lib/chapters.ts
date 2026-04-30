import { ai, Type } from "@workspace/integrations-gemini-ai";
import type { DocumentPageRow } from "@workspace/db";
import { logger } from "./logger";

export interface ExtractedChapter {
  title: string;
  summary?: string;
  startPage: number;
  endPage: number;
}

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

/**
 * Use Gemini to detect the natural chapters/lessons inside a document. Returns
 * a list of chapters with their inclusive PDF page ranges. Falls back to a
 * single "كل المحتوى" chapter if nothing meaningful is detected.
 */
export async function extractChapters(args: {
  documentTitle: string;
  pages: DocumentPageRow[];
}): Promise<ExtractedChapter[]> {
  const { documentTitle, pages } = args;
  if (pages.length === 0) return [];

  const totalPages = pages.length;
  const firstPage = pages[0]?.pageNumber ?? 1;
  const lastPage = pages[pages.length - 1]?.pageNumber ?? totalPages;

  const systemInstruction = `أنت مساعد لتحليل بنية المستندات الدراسية باللغة العربية. مهمتك تحديد الدروس/الفصول/الوحدات الموجودة في مستند "${documentTitle}".

قواعد:
- اقرأ النص بترتيب الصفحات وحدد الأقسام الكبرى (دروس، فصول، وحدات، أبواب، موضوعات رئيسية).
- لكل قسم استخرج: العنوان كما يظهر في النص (مختصر — لا يتجاوز سطرًا)، ملخص قصير اختياري في جملة واحدة، رقم الصفحة (PDF) التي يبدأ منها القسم، ورقم الصفحة (PDF) التي ينتهي عندها.
- تأكد أن الفصول لا تتداخل وأن مجموعها يغطي المستند تقريبًا. لا تترك فجوات إلا إذا كان هناك صفحات مقدمة/فهرس فعلاً.
- إذا كان المستند صغيرًا أو موضوع واحد فقط، أعد عنصرًا واحدًا يغطي كل المستند.
- لا تخترع عناوين غير موجودة في النص. إذا تعذّر تحديد عنوان واضح، استخدم اسمًا وصفيًا قصيرًا للموضوع.
- أرقام الصفحات: استخدم أرقام PDF (الموجودة بعد كلمة "صفحة" في رؤوس الأقسام أعلاه)، وليس الأرقام المطبوعة.
- يجب أن يكون startPage و endPage بين ${firstPage} و ${lastPage} وأن يكون startPage <= endPage.

أعد JSON صالحًا فقط بالحقل chapters (مصفوفة).`;

  const context = buildContext(pages);

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
          chapters: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                summary: { type: Type.STRING },
                startPage: { type: Type.NUMBER },
                endPage: { type: Type.NUMBER },
              },
              required: ["title", "startPage", "endPage"],
            },
          },
        },
        required: ["chapters"],
      },
    },
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.text ?? "{}");
  } catch (err) {
    logger.warn({ err }, "Failed to parse chapters JSON");
    parsed = {};
  }
  const arr =
    parsed && typeof parsed === "object" && "chapters" in parsed
      ? (parsed as { chapters: unknown }).chapters
      : null;

  const validPageNumbers = new Set(pages.map((p) => p.pageNumber));
  const out: ExtractedChapter[] = [];
  if (Array.isArray(arr)) {
    for (const c of arr) {
      if (!c || typeof c !== "object") continue;
      const title = String((c as { title?: unknown }).title ?? "").trim();
      const start = Number((c as { startPage?: unknown }).startPage);
      const end = Number((c as { endPage?: unknown }).endPage);
      if (!title || !Number.isFinite(start) || !Number.isFinite(end)) continue;
      const s = Math.max(firstPage, Math.min(start, lastPage));
      const e = Math.max(s, Math.min(end, lastPage));
      if (!validPageNumbers.has(s) || !validPageNumbers.has(e)) continue;
      const summary = String(
        (c as { summary?: unknown }).summary ?? "",
      ).trim();
      out.push({
        title,
        summary: summary || undefined,
        startPage: s,
        endPage: e,
      });
    }
  }

  if (out.length === 0) {
    out.push({
      title: "كل المحتوى",
      startPage: firstPage,
      endPage: lastPage,
    });
  }

  // Sort by start page and stable on title to ensure deterministic order.
  out.sort((a, b) => a.startPage - b.startPage);
  return out;
}
