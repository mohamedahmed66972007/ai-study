import { ai, Type } from "@workspace/integrations-gemini-ai";
import { logger } from "./logger";

export interface ExtractedQA {
  questionNumber: number;
  question: string;
  answer: string;
  explanation: string;
}

const SYSTEM_INSTRUCTION = `أنت "مذاكر"، مساعد مذاكرة عربي ذكي. مهمتك:
1) استخراج جميع الأسئلة الموجودة في الصورة أو ملف PDF بدقة وأمانة (دون تخمين أسئلة غير ظاهرة).
2) لكل سؤال، تقديم إجابة دقيقة ومنظمة.
3) لكل إجابة، تقديم "دليل" واضح يشرح سبب الإجابة بأسلوب مختصر يساعد الطالب على التحقق (الخطوات، القاعدة، التعريف، أو الاستنباط من نص السؤال).

قواعد صارمة:
- أجب بنفس اللغة التي كُتب بها السؤال (إذا كان بالعربية أجب بالعربية).
- إذا كان السؤال متعدد الخيارات (MCQ) فاذكر الإجابة الصحيحة بوضوح، ثم وضّح في الدليل سبب صحتها وسبب خطأ الباقي إن أمكن.
- لا تُكرّر السؤال داخل الإجابة. اجعل الإجابة موجزة ومباشرة.
- إذا تعذّر قراءة سؤال أو الإجابة عليه فاكتب صراحةً أنه غير واضح في حقل الإجابة.
- رقم السؤال (questionNumber) يجب أن يبدأ من 1 ويزيد بترتيب ظهور الأسئلة في المستند.
- ردك يجب أن يكون JSON صالحًا فقط بالحقل: questions (قائمة عناصر بحقول questionNumber، question، answer، explanation).`;

export async function extractQuestionsFromFile(args: {
  buffer: Buffer;
  mimeType: string;
}): Promise<ExtractedQA[]> {
  const { buffer, mimeType } = args;

  const userPrompt = `الملف المرفق يحتوي على أسئلة دراسية (واحد أو أكثر). استخرج كل الأسئلة وأجب عنها كما هو موضّح في التعليمات.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType,
              data: buffer.toString("base64"),
            },
          },
          { text: userPrompt },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                questionNumber: { type: Type.INTEGER },
                question: { type: Type.STRING },
                answer: { type: Type.STRING },
                explanation: { type: Type.STRING },
              },
              required: ["questionNumber", "question", "answer", "explanation"],
            },
          },
        },
        required: ["questions"],
      },
    },
  });

  const text = response.text ?? "";
  let parsed: { questions?: ExtractedQA[] };
  try {
    parsed = JSON.parse(text) as { questions?: ExtractedQA[] };
  } catch (err) {
    logger.error({ err, text }, "Failed to parse Gemini extraction JSON");
    throw new Error("AI response was not valid JSON");
  }

  const list = Array.isArray(parsed.questions) ? parsed.questions : [];
  const cleaned: ExtractedQA[] = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (
      typeof item?.question !== "string" ||
      item.question.trim().length === 0 ||
      typeof item?.answer !== "string"
    ) {
      continue;
    }
    cleaned.push({
      questionNumber:
        typeof item.questionNumber === "number" && item.questionNumber > 0
          ? item.questionNumber
          : cleaned.length + 1,
      question: item.question.trim(),
      answer: item.answer.trim(),
      explanation:
        typeof item.explanation === "string" ? item.explanation.trim() : "",
    });
  }

  // Re-number sequentially in case the model produced duplicates.
  return cleaned.map((q, idx) => ({ ...q, questionNumber: idx + 1 }));
}
