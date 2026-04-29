import { ai, Type } from "@workspace/integrations-gemini-ai";
import type { DocumentPageRow, StoredCitation } from "@workspace/db";
import { logger } from "./logger";

export interface AskResult {
  answer: string;
  citations: StoredCitation[];
}

export interface ExtractedAnsweredQuestion {
  question: string;
  answer: string;
  citations: StoredCitation[];
}

const MAX_CONTEXT_CHARS = 600_000;

function buildContext(pages: DocumentPageRow[]): string {
  const sorted = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const chunks: string[] = [];
  let total = 0;
  for (const p of sorted) {
    const labelPart = p.pageLabel
      ? ` (الرقم المطبوع في الصفحة: ${p.pageLabel})`
      : "";
    const block = `\n===== صفحة ${p.pageNumber}${labelPart} =====\n${p.content}\n`;
    if (total + block.length > MAX_CONTEXT_CHARS) {
      chunks.push(`\n[تم اقتطاع الباقي من المستند بسبب الطول]\n`);
      break;
    }
    chunks.push(block);
    total += block.length;
  }
  return chunks.join("");
}

function buildLabelMap(
  pages: DocumentPageRow[],
): Map<number, string | null> {
  const map = new Map<number, string | null>();
  for (const p of pages) {
    map.set(p.pageNumber, p.pageLabel ?? null);
  }
  return map;
}

function buildCitations(
  raw: unknown,
  pageLabelByNumber: Map<number, string | null>,
): StoredCitation[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredCitation[] = [];
  for (const c of raw) {
    if (!c || typeof c !== "object") continue;
    const pageNumber = (c as { pageNumber?: unknown }).pageNumber;
    const quote = (c as { quote?: unknown }).quote;
    if (
      typeof pageNumber !== "number" ||
      !pageLabelByNumber.has(pageNumber) ||
      typeof quote !== "string" ||
      quote.trim().length === 0
    ) {
      continue;
    }
    out.push({
      pageNumber,
      pageLabel: pageLabelByNumber.get(pageNumber) ?? null,
      quote,
    });
  }
  return out;
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
- اذكر المصادر دائمًا: لكل معلومة جوهرية أضف اقتباسًا قصيرًا (جملة واحدة أو جملتين) من المستند في حقل citations مع رقم الصفحة. لا تذكر أرقام الصفحات داخل نص الإجابة نفسه.
- اجعل الإجابة منظمة وواضحة، وقدّم خلاصة عملية تساعد الطالب على الفهم لا مجرد نسخ نص.

تنسيق الإجابة (مهم — استخدم هذه العلامات):
- **نص بين نجمتين** = تجعله بخط عريض (Bold). استخدمها للعناوين الفرعية والمفاهيم المهمة.
- ==نص بين علامتي يساوي== = تجعله مظللاً بلون أصفر فسفوري كأنه عُلِّم بقلم تحديد. استخدمه للجمل المفتاحية والتعريفات والنقاط الجوهرية في الإجابة.
- [[نص بين قوسين مربعين مزدوجين]] = اللفظة/العبارة التي هي **الإجابة المباشرة** على السؤال (المصطلح المطلوب تحديدًا، أو الخيار الصحيح، أو الرقم/التاريخ المطلوب). استخدمها مرة أو مرتين فقط في كل إجابة، للكلمة الجوهرية التي يبحث عنها الطالب فعلاً.
- استخدم سطرًا جديدًا بين الفقرات، واستخدم قوائم مرقّمة أو نقطية (- ) عند تعداد عدة أمور.
- لا تبالغ في التظليل: اختر بعناية الكلمات الأهم فقط.

مثال على التنسيق:
"الإجابة الصحيحة: [[ب]].
**السبب:** ==يحدث مرض فقر الدم المنجلي بسبب طفرة استبدال قاعدة A بدلاً من T في الجين==. أما باقي الخيارات فلا تنطبق لأن…"
- لا تخترع أرقام صفحات. لا تستشهد إلا بنص موجود فعلاً في المستند ضمن الصفحة المذكورة.
- ردك يجب أن يكون JSON صالحًا فقط، بالحقلين: answer (نص الإجابة الكاملة)، citations (قائمة من العناصر بحقول pageNumber و quote).

أرقام الصفحات في الاقتباسات (مهم جدًا):
- كل صفحة في المستند معرّفة برقمين: رقم الصفحة في ملف الـ PDF (الترتيب الفعلي للصفحات في الملف، يبدأ من 1)، وقد يكون لها أيضًا "الرقم المطبوع في الصفحة" بين قوسين في رؤوس الصفحات أعلاه.
- في حقل citations استخدم دائمًا رقم الـ PDF (الرقم الموجود بعد كلمة "صفحة" في رأس كل قسم) في الحقل pageNumber. لا تستخدم الرقم المطبوع.
- **داخل نص الإجابة (answer): لا تذكر أرقام الصفحات إطلاقًا. لا تكتب "صفحة كذا" ولا "(مطبوع كذا)" ولا "المرقّمة كذا" داخل الإجابة.** أرقام الصفحات تظهر تلقائيًا في بطاقات المصادر/الأدلة أسفل الإجابة، فلا تكررها داخل النص. ركّز نص الإجابة على المعلومة والشرح فقط.

التعامل مع الأسئلة الاختيارية (Multiple Choice):
- اكتشف تلقائيًا إذا كان السؤال يحتوي على خيارات (مثل: أ/ب/ج/د، 1/2/3/4، A/B/C/D، أو خيارات منفصلة بأسطر أو فواصل، أو صياغات مثل "أي مما يلي" أو "اختر").
- إذا كان السؤال اختياريًا:
  • أعد سرد كل الخيارات كما وردت بنفس ترميزها (أ، ب، ج، …).
  • حدّد بوضوح في بداية الإجابة الخيار/الخيارات الصحيحة بصيغة: "الإجابة الصحيحة: أ" أو "الإجابات الصحيحة: ب، د" حسب عدد الإجابات الصحيحة.
  • لا تفترض أن الإجابة واحدة فقط — راجع كل خيار على حدة بناءً على المستند، وإذا كان أكثر من خيار صحيحًا فاذكرها كلها.
  • اشرح باختصار لماذا كل خيار صحيح أو خاطئ بالاستناد إلى المستند، مع اقتباسات وأرقام صفحات.
  • إذا تعذّر التحقق من خيار من المستند فاذكر ذلك صراحة بدلاً من التخمين.`;

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
  let parsed: { answer?: string; citations?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    logger.error({ err, text }, "Failed to parse Gemini JSON response");
    throw new Error("AI response was not valid JSON");
  }

  const labelMap = buildLabelMap(pages);
  return {
    answer: typeof parsed.answer === "string" ? parsed.answer : "",
    citations: buildCitations(parsed.citations, labelMap),
  };
}

export async function extractAndAnswerFromImage(args: {
  documentTitle: string;
  pages: DocumentPageRow[];
  imageBuffer: Buffer;
  imageMimeType: string;
}): Promise<ExtractedAnsweredQuestion[]> {
  const { documentTitle, pages, imageBuffer, imageMimeType } = args;
  const context = buildContext(pages);

  const systemInstruction = `أنت "مذاكر"، مساعد مذاكرة عربي ذكي وموثوق. مرفق معك:
1) محتوى مستند مرجعي ("${documentTitle}") مقسم إلى صفحات مرقّمة.
2) صورة تحتوي على سؤال أو عدة أسئلة دراسية.

مهمتك:
- استخراج كل سؤال موجود في الصورة (ولا شيء غير الأسئلة).
- **ترتيب الأسئلة في حقل questions يجب أن يطابق ترتيبها الطبيعي في الصورة من الأعلى إلى الأسفل (السؤال 1 أولاً ثم 2 ثم 3 ... وهكذا). لا تعكس الترتيب أبدًا. إذا كانت الأسئلة مرقّمة في الصورة (1، 2، 3، …) فاحرص على أن يكون أول عنصر في القائمة هو السؤال صاحب أصغر رقم.**
- إذا كان السؤال اختياريًا (Multiple Choice) فاستخرج كل خياراته كاملة بنفس ترميزها كما تظهر في الصورة (أ/ب/ج/د، 1/2/3/4، A/B/C/D، …) واجعل الخيارات جزءًا من نص السؤال المستخرج.
- الإجابة عن كل سؤال اعتمادًا حصريًا على نص المستند المرجعي المرفق.
- إذا لم تكن الإجابة موجودة في المستند فاكتب صراحةً أن المعلومة غير متوفرة في هذا المصدر.
- لكل إجابة، أرفق اقتباسات قصيرة من المستند في حقل citations مع رقم الصفحة الصحيح كأدلة. لا تذكر أرقام الصفحات داخل نص الإجابة.

تنسيق نص الإجابة (مهم — استخدم هذه العلامات):
- **نص بين نجمتين** = خط عريض (Bold). استخدمها للعناوين الفرعية والمفاهيم المهمة.
- ==نص بين علامتي يساوي== = مظلَّل بلون أصفر فسفوري كأنه عُلِّم بقلم تحديد. استخدمه للجمل المفتاحية والتعريفات الجوهرية.
- [[نص بين قوسين مربعين مزدوجين]] = اللفظة/العبارة التي هي **الإجابة المباشرة** على السؤال (المصطلح المطلوب، الخيار الصحيح، الرقم، التاريخ، …). استخدمها مرة أو مرتين فقط لكل إجابة، للكلمة الجوهرية التي يبحث عنها الطالب.
- استخدم سطرًا جديدًا بين الفقرات، واستخدم قوائم نقطية (- ) عند تعداد عدة عناصر.
- لا تبالغ في التظليل — اختر الكلمات الأهم فقط.

مثال:
"الإجابة الصحيحة: [[ب]].
**السبب:** ==يحدث مرض فقر الدم المنجلي بسبب طفرة استبدال قاعدة A بدلاً من T في الجين==."

قواعد صارمة:
- أجب بنفس لغة السؤال (إذا كان بالعربية أجب بالعربية).
- لا تستخدم أي معلومة من خارج المستند المرجعي.
- لا تخترع أرقام صفحات. لا تستشهد إلا بنص موجود فعلاً في الصفحة المذكورة.
- لا تُكرّر السؤال داخل الإجابة (باستثناء الإشارة إلى رمز الخيار الصحيح).
- ردك يجب أن يكون JSON صالحًا فقط بالحقل: questions (قائمة عناصر بحقول question (نص السؤال كما استخرج من الصورة، شاملًا الخيارات إن وُجدت)، answer (الإجابة الكاملة)، citations (قائمة عناصر بحقول pageNumber و quote)).

أرقام الصفحات في الاقتباسات (مهم جدًا):
- كل صفحة في المستند معرّفة برقمين: رقم الصفحة في ملف الـ PDF (الترتيب الفعلي يبدأ من 1)، وقد يكون لها أيضًا "الرقم المطبوع في الصفحة" بين قوسين في رؤوس الصفحات أعلاه.
- في حقل citations استخدم دائمًا رقم الـ PDF (الرقم بعد كلمة "صفحة" في رأس كل قسم) في الحقل pageNumber. لا تستخدم الرقم المطبوع.
- **داخل نص الإجابة (answer): لا تذكر أرقام الصفحات إطلاقًا. لا تكتب "صفحة كذا" ولا "(مطبوع كذا)" ولا "المرقّمة كذا" داخل نص الإجابة.** أرقام الصفحات (PDF + المطبوع) تظهر تلقائيًا في بطاقات المصادر/الأدلة أسفل الإجابة، فلا تكررها داخل النص. ركّز نص الإجابة على المعلومة والشرح فقط.

التعامل مع الأسئلة الاختيارية (Multiple Choice):
- لكل سؤال اختياري، حدّد بوضوح في بداية الإجابة الخيار/الخيارات الصحيحة بصيغة: "الإجابة الصحيحة: أ" أو "الإجابات الصحيحة: ب، د" حسب عدد الإجابات الصحيحة.
- لا تفترض أن الإجابة واحدة فقط — راجع كل خيار على حدة بناءً على المستند، وإذا كان أكثر من خيار صحيحًا فاذكرها كلها (قد يكون السؤال "اختر إجابتين" أو "كل ما سبق" أو يحتوي خيارات صحيحة متعددة).
- اشرح باختصار لماذا كل خيار صحيح أو خاطئ بالاستناد إلى المستند، مع اقتباسات وأرقام صفحات.
- إذا تعذّر التحقق من خيار من المستند فاذكر ذلك صراحة بدلاً من التخمين.`;

  const userPrompt = `محتوى المستند المرجعي:\n${context}\n\nالصورة المرفقة تحتوي على أسئلة. استخرجها وأجب عنها بناءً على المستند فقط.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: imageMimeType,
              data: imageBuffer.toString("base64"),
            },
          },
          { text: userPrompt },
        ],
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
                question: { type: Type.STRING },
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
              required: ["question", "answer", "citations"],
            },
          },
        },
        required: ["questions"],
      },
    },
  });

  const text = response.text ?? "";
  let parsed: { questions?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    logger.error({ err, text }, "Failed to parse Gemini extraction JSON");
    throw new Error("AI response was not valid JSON");
  }

  if (!Array.isArray(parsed.questions)) return [];

  const labelMap = buildLabelMap(pages);
  const out: ExtractedAnsweredQuestion[] = [];
  for (const item of parsed.questions) {
    if (
      !item ||
      typeof (item as ExtractedAnsweredQuestion).question !== "string" ||
      typeof (item as ExtractedAnsweredQuestion).answer !== "string"
    ) {
      continue;
    }
    const q = (item as ExtractedAnsweredQuestion).question.trim();
    const a = (item as ExtractedAnsweredQuestion).answer.trim();
    if (q.length === 0) continue;
    out.push({
      question: q,
      answer: a,
      citations: buildCitations(
        (item as ExtractedAnsweredQuestion).citations,
        labelMap,
      ),
    });
  }
  return out;
}
