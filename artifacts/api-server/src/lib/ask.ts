import { ai, Type } from "@workspace/integrations-gemini-ai";
import type { DocumentPageRow, StoredCitation } from "@workspace/db";
import { logger } from "./logger";

export interface AskResult {
  answer: string;
  citations: StoredCitation[];
}

const MAX_CONTEXT_CHARS = 600_000;

function buildContext(pages: DocumentPageRow[]): string {
  const sorted = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const chunks: string[] = [];
  let total = 0;
  for (const p of sorted) {
    const block = `\n===== صفحة ${p.pageNumber} =====\n${p.content}\n`;
    if (total + block.length > MAX_CONTEXT_CHARS) {
      chunks.push(`\n[تم اقتطاع الباقي من المستند بسبب الطول]\n`);
      break;
    }
    chunks.push(block);
    total += block.length;
  }
  return chunks.join("");
}

export async function askDocument(args: {
  documentTitle: string;
  pages: DocumentPageRow[];
  question: string;
}): Promise<AskResult> {
  const { documentTitle, pages, question } = args;
  const context = buildContext(pages);

  const systemInstruction = `أنت "مذاكر"، مساعد مذاكرة عربي ذكي وموثوق. مهمتك الإجابة على أسئلة الطالب اعتمادًا حصريًا على محتوى المستند المرفق ("${documentTitle}").

قواعد صارمة:
- أجب بنفس لغة سؤال المستخدم (إذا كان السؤال بالعربية أجب بالعربية).
- لا تستخدم أي معلومة من خارج المستند. إذا كانت الإجابة غير موجودة في المستند، قل بوضوح إن المعلومة غير متوفرة في هذا المصدر.
- اذكر المصادر دائمًا: لكل معلومة جوهرية أضف اقتباسًا قصيرًا (جملة واحدة أو جملتين) من المستند مع رقم الصفحة.
- اجعل الإجابة منظمة وواضحة، وقدّم خلاصة عملية تساعد الطالب على الفهم لا مجرد نسخ نص.
- لا تخترع أرقام صفحات. لا تستشهد إلا بنص موجود فعلاً في المستند ضمن الصفحة المذكورة.
- ردك يجب أن يكون JSON صالحًا فقط، بالحقلين: answer (نص الإجابة الكاملة)، citations (قائمة من العناصر بحقول pageNumber و quote).`;

  const userPrompt = `محتوى المستند:\n${context}\n\nسؤال الطالب:\n${question}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          answer: { type: Type.STRING },
          citations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                pageNumber: { type: Type.INTEGER },
                quote: { type: Type.STRING },
              },
              required: ["pageNumber", "quote"],
            },
          },
        },
        required: ["answer", "citations"],
      },
    },
  });

  const text = response.text ?? "";
  let parsed: AskResult;
  try {
    parsed = JSON.parse(text) as AskResult;
  } catch (err) {
    logger.error({ err, text }, "Failed to parse Gemini JSON response");
    throw new Error("AI response was not valid JSON");
  }

  const validPageNumbers = new Set(pages.map((p) => p.pageNumber));
  const citations = (parsed.citations ?? []).filter(
    (c) =>
      typeof c?.pageNumber === "number" &&
      validPageNumbers.has(c.pageNumber) &&
      typeof c?.quote === "string" &&
      c.quote.trim().length > 0,
  );

  return {
    answer: typeof parsed.answer === "string" ? parsed.answer : "",
    citations,
  };
}
