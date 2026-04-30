import { useEffect, useMemo, useState } from "react";
import {
  useListDocumentChapters,
  useListDocumentQuizzes,
  useCreateDocumentQuiz,
  useDeleteQuiz,
  useGetQuiz,
  useListQuizAttempts,
  useSubmitQuizAttempt,
  getListDocumentQuizzesQueryKey,
  getListQuizAttemptsQueryKey,
  getGetQuizQueryKey,
  type Chapter,
  type Quiz,
  type QuizAttempt,
  type QuizQuestion,
  type QuizQuestionType,
  type QuizDifficulty,
  type CreateQuizBody,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  ListChecks,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  CheckCircle2,
  XCircle,
  CircleHelp,
  ArrowLeft,
  History,
  ClipboardCheck,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const QUESTION_TYPE_LABEL: Record<QuizQuestionType, string> = {
  mcq: "اختيار من متعدد",
  true_false: "صح/خطأ",
  fill_blank: "أكمل الفراغ",
  short_answer: "إجابة قصيرة",
};

const DIFFICULTY_LABEL: Record<QuizDifficulty, string> = {
  easy: "سهل",
  medium: "متوسط",
  hard: "صعب",
  mixed: "متنوع",
};

const ALL_TYPES: QuizQuestionType[] = [
  "mcq",
  "true_false",
  "fill_blank",
  "short_answer",
];

type View =
  | { kind: "list" }
  | { kind: "take"; quizId: number }
  | { kind: "result"; attempt: QuizAttempt; quiz: Quiz }
  | { kind: "history"; quizId: number };

export function QuizPanel({ documentId }: { documentId: number }) {
  const [view, setView] = useState<View>({ kind: "list" });
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (view.kind === "take") {
    return (
      <QuizTake
        quizId={view.quizId}
        onExit={() => setView({ kind: "list" })}
        onResult={(attempt, quiz) => setView({ kind: "result", attempt, quiz })}
      />
    );
  }
  if (view.kind === "result") {
    return (
      <QuizResultView
        attempt={view.attempt}
        quiz={view.quiz}
        onClose={() => setView({ kind: "list" })}
      />
    );
  }
  if (view.kind === "history") {
    return (
      <QuizHistoryView
        quizId={view.quizId}
        onBack={() => setView({ kind: "list" })}
        onView={(attempt, quiz) =>
          setView({ kind: "result", attempt, quiz })
        }
      />
    );
  }

  return (
    <QuizListView
      documentId={documentId}
      openSettings={() => setSettingsOpen(true)}
      settingsOpen={settingsOpen}
      onCloseSettings={() => setSettingsOpen(false)}
      onStart={(quizId) => setView({ kind: "take", quizId })}
      onShowHistory={(quizId) => setView({ kind: "history", quizId })}
    />
  );
}

/* --------------------------- LIST + SETTINGS --------------------------- */

function QuizListView({
  documentId,
  openSettings,
  settingsOpen,
  onCloseSettings,
  onStart,
  onShowHistory,
}: {
  documentId: number;
  openSettings: () => void;
  settingsOpen: boolean;
  onCloseSettings: () => void;
  onStart: (quizId: number) => void;
  onShowHistory: (quizId: number) => void;
}) {
  const queryClient = useQueryClient();
  const { data: chapters, isLoading: chaptersLoading } =
    useListDocumentChapters(documentId, {
      query: {
        enabled: !!documentId,
        staleTime: Infinity,
        queryKey: ["documents", documentId, "chapters"] as const,
      },
    });
  const { data: quizzes, isLoading: quizzesLoading } =
    useListDocumentQuizzes(documentId, {
      query: {
        enabled: !!documentId,
        queryKey: getListDocumentQuizzesQueryKey(documentId),
      },
    });

  const deleteQuiz = useDeleteQuiz({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getListDocumentQuizzesQueryKey(documentId),
        });
        toast.success("تم حذف الاختبار");
      },
      onError: () => toast.error("تعذّر حذف الاختبار"),
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold">الاختبارات</h2>
          <p className="text-sm text-muted-foreground">
            ولّد اختبارًا ذكيًا من دروس هذا المستند وقيّم مستواك
          </p>
        </div>
        <Button onClick={openSettings} className="gap-2" size="lg">
          <Sparkles className="h-4 w-4" />
          اختبار جديد
        </Button>
      </div>

      {/* Chapters preview */}
      <Card className="border-border/60">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ListChecks className="h-4 w-4 text-primary" />
            الدروس المكتشفة في هذا المستند
          </div>
          {chaptersLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : chapters && chapters.length > 0 ? (
            <ul className="text-sm text-muted-foreground space-y-1">
              {chapters.map((c) => (
                <li key={c.id} className="flex gap-2">
                  <span className="text-primary">•</span>
                  <span className="line-clamp-2 break-words">
                    {c.title}
                    <span className="text-xs text-muted-foreground/70 mr-2">
                      (ص {c.startPage}–{c.endPage})
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              لم يتم العثور على دروس بعد.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Saved quizzes */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm text-muted-foreground">
          اختباراتك المحفوظة
        </h3>
        {quizzesLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : quizzes && quizzes.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {quizzes.map((q) => (
              <Card key={q.id} className="border-border/60 hover-elevate">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h4 className="font-semibold truncate">{q.name}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {q.questions.length} أسئلة •{" "}
                        {DIFFICULTY_LABEL[q.settings.difficulty]} •{" "}
                        {format(new Date(q.createdAt), "PP", { locale: ar })}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:bg-destructive/10 -mr-1 -mt-1"
                      onClick={() => {
                        if (confirm(`حذف اختبار "${q.name}"؟`)) {
                          deleteQuiz.mutate({ quizId: q.id });
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {q.settings.allowedTypes.map((t) => (
                      <Badge key={t} variant="secondary" className="text-xs">
                        {QUESTION_TYPE_LABEL[t]}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 gap-2"
                      onClick={() => onStart(q.id)}
                    >
                      <ClipboardCheck className="h-4 w-4" />
                      ابدأ الآن
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => onShowHistory(q.id)}
                    >
                      <History className="h-4 w-4" />
                      المحاولات
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-dashed border-2">
            <CardContent className="p-8 text-center text-sm text-muted-foreground space-y-2">
              <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/50" />
              <p>لم تُنشئ أي اختبار بعد.</p>
              <p>اضغط "اختبار جديد" لتوليد أسئلة من دروس هذا المستند.</p>
            </CardContent>
          </Card>
        )}
      </div>

      <NewQuizDialog
        open={settingsOpen}
        onClose={onCloseSettings}
        documentId={documentId}
        chapters={chapters ?? []}
      />
    </div>
  );
}

function NewQuizDialog({
  open,
  onClose,
  documentId,
  chapters,
}: {
  open: boolean;
  onClose: () => void;
  documentId: number;
  chapters: Chapter[];
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [count, setCount] = useState(10);
  const [coverAll, setCoverAll] = useState(false);
  const [randomizeQuestions, setRandomizeQuestions] = useState(true);
  const [randomizeChoices, setRandomizeChoices] = useState(true);
  const [difficulty, setDifficulty] = useState<QuizDifficulty>("mixed");
  const [allowedTypes, setAllowedTypes] = useState<QuizQuestionType[]>([
    ...ALL_TYPES,
  ]);
  const [selectedChapterIds, setSelectedChapterIds] = useState<number[]>([]);
  const [timeLimit, setTimeLimit] = useState<number | "">("");

  useEffect(() => {
    if (open) {
      setName("");
      setCount(10);
      setCoverAll(false);
      setRandomizeQuestions(true);
      setRandomizeChoices(true);
      setDifficulty("mixed");
      setAllowedTypes([...ALL_TYPES]);
      setSelectedChapterIds([]);
      setTimeLimit("");
    }
  }, [open]);

  const allChaptersSelected =
    chapters.length > 0 && selectedChapterIds.length === chapters.length;

  const create = useCreateDocumentQuiz({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getListDocumentQuizzesQueryKey(documentId),
        });
        toast.success("تم توليد الاختبار");
        onClose();
      },
      onError: (err: unknown) => {
        const msg =
          (err as { message?: string })?.message ?? "تعذّر توليد الاختبار";
        toast.error(msg);
      },
    },
  });

  const toggleType = (t: QuizQuestionType) => {
    setAllowedTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  };

  const toggleChapter = (id: number) => {
    setSelectedChapterIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error("اكتب اسمًا للاختبار");
      return;
    }
    if (allowedTypes.length === 0) {
      toast.error("اختر نوعًا واحدًا على الأقل من الأسئلة");
      return;
    }
    const finalCount = coverAll ? Math.min(50, Math.max(15, chapters.length * 5 || 20)) : count;
    const body: CreateQuizBody = {
      name: name.trim(),
      chapterIds: allChaptersSelected ? [] : selectedChapterIds,
      count: finalCount,
      settings: {
        randomizeQuestions,
        randomizeChoices,
        timeLimitMinutes: typeof timeLimit === "number" ? timeLimit : null,
        difficulty,
        allowedTypes,
      },
    };
    create.mutate({ id: documentId, data: body });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>إعدادات الاختبار الجديد</DialogTitle>
          <DialogDescription>
            اختر الدروس والإعدادات وسنولّد لك الأسئلة من المستند.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label>اسم الاختبار</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثلاً: مراجعة الفصل الأول"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>الدروس</Label>
              {chapters.length > 0 && (
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() =>
                    setSelectedChapterIds(
                      allChaptersSelected ? [] : chapters.map((c) => c.id),
                    )
                  }
                >
                  {allChaptersSelected ? "إلغاء الكل" : "اختر الكل"}
                </button>
              )}
            </div>
            <div className="border rounded-md max-h-48 overflow-y-auto p-2 space-y-1.5">
              {chapters.length === 0 ? (
                <p className="text-xs text-muted-foreground p-2">
                  لم تُكتشف دروس بعد. سيستخدم الاختبار كل المستند.
                </p>
              ) : (
                chapters.map((c) => {
                  const checked = selectedChapterIds.includes(c.id);
                  return (
                    <label
                      key={c.id}
                      className="flex items-start gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleChapter(c.id)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-snug">
                          {c.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          ص {c.startPage}–{c.endPage}
                        </p>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              لا تختر شيئًا إذا أردت تغطية كل المستند.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>عدد الأسئلة</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={count}
                disabled={coverAll}
                onChange={(e) =>
                  setCount(
                    Math.max(1, Math.min(50, Number(e.target.value) || 1)),
                  )
                }
              />
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={coverAll}
                  onCheckedChange={(v) => setCoverAll(!!v)}
                />
                تغطية كل جزئيات الدرس
              </label>
            </div>
            <div className="space-y-2">
              <Label>المستوى</Label>
              <Select
                value={difficulty}
                onValueChange={(v) => setDifficulty(v as QuizDifficulty)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">سهل</SelectItem>
                  <SelectItem value="medium">متوسط</SelectItem>
                  <SelectItem value="hard">صعب</SelectItem>
                  <SelectItem value="mixed">متنوع</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>أنواع الأسئلة</Label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_TYPES.map((t) => (
                <label
                  key={t}
                  className="flex items-center gap-2 border rounded-md p-2 cursor-pointer hover:bg-muted/50"
                >
                  <Checkbox
                    checked={allowedTypes.includes(t)}
                    onCheckedChange={() => toggleType(t)}
                  />
                  <span className="text-sm">{QUESTION_TYPE_LABEL[t]}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center justify-between border rounded-md p-3">
              <div>
                <Label className="text-sm">ترتيب عشوائي للأسئلة</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  يخلط ترتيب الأسئلة في كل محاولة
                </p>
              </div>
              <Switch
                checked={randomizeQuestions}
                onCheckedChange={setRandomizeQuestions}
              />
            </div>
            <div className="flex items-center justify-between border rounded-md p-3">
              <div>
                <Label className="text-sm">ترتيب عشوائي للخيارات</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  يخلط ترتيب خيارات الـMCQ
                </p>
              </div>
              <Switch
                checked={randomizeChoices}
                onCheckedChange={setRandomizeChoices}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>المدة الزمنية (دقائق — اختياري)</Label>
            <Input
              type="number"
              min={1}
              max={300}
              value={timeLimit}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") setTimeLimit("");
                else setTimeLimit(Math.max(1, Math.min(300, Number(v) || 1)));
              }}
              placeholder="بدون حد"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>
            إلغاء
          </Button>
          <Button onClick={handleSubmit} disabled={create.isPending} className="gap-2">
            {create.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                جاري التوليد…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                توليد الاختبار
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------- TAKE ---------------------------- */

function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

function QuizTake({
  quizId,
  onExit,
  onResult,
}: {
  quizId: number;
  onExit: () => void;
  onResult: (a: QuizAttempt, q: Quiz) => void;
}) {
  const queryClient = useQueryClient();
  const { data: quiz, isLoading } = useGetQuiz(quizId, {
    query: { queryKey: getGetQuizQueryKey(quizId) },
  });

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [seed] = useState(() => Math.floor(Math.random() * 1_000_000) + 1);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  const submit = useSubmitQuizAttempt({
    mutation: {
      onSuccess: (attempt) => {
        if (!quiz) return;
        queryClient.invalidateQueries({
          queryKey: getListQuizAttemptsQueryKey(quizId),
        });
        onResult(attempt, quiz);
      },
      onError: () => toast.error("تعذّر تسليم الاختبار"),
    },
  });

  const orderedQuestions = useMemo(() => {
    if (!quiz) return [];
    return quiz.settings.randomizeQuestions
      ? shuffle(quiz.questions, seed)
      : quiz.questions;
  }, [quiz, seed]);

  // initialize timer
  useEffect(() => {
    if (!quiz) return;
    const t = quiz.settings.timeLimitMinutes;
    if (typeof t === "number" && t > 0) setSecondsLeft(t * 60);
  }, [quiz]);

  useEffect(() => {
    if (secondsLeft === null) return;
    if (secondsLeft <= 0) {
      handleSubmit();
      return;
    }
    const id = window.setTimeout(() => setSecondsLeft((s) => (s ?? 1) - 1), 1000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

  if (isLoading || !quiz) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const handleSubmit = () => {
    submit.mutate({
      quizId,
      data: {
        answers: quiz.questions.map((q) => ({
          questionId: q.id,
          userAnswer: (answers[q.id] ?? "").trim(),
        })),
      },
    });
  };

  const answeredCount = Object.values(answers).filter((a) => a.trim()).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" onClick={onExit}>
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          </Button>
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold truncate">{quiz.name}</h2>
            <p className="text-xs text-muted-foreground">
              {answeredCount} / {quiz.questions.length} أُجيب عنها
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {secondsLeft !== null && (
            <Badge
              variant="secondary"
              className={cn(
                "font-mono",
                secondsLeft < 60 && "bg-destructive/15 text-destructive",
              )}
            >
              {Math.floor(secondsLeft / 60)
                .toString()
                .padStart(2, "0")}
              :
              {(secondsLeft % 60).toString().padStart(2, "0")}
            </Badge>
          )}
          <Button onClick={() => setConfirmSubmit(true)} disabled={submit.isPending}>
            تسليم
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {orderedQuestions.map((q, idx) => (
          <QuestionCard
            key={q.id}
            index={idx + 1}
            question={q}
            value={answers[q.id] ?? ""}
            onChange={(v) => setAnswers((p) => ({ ...p, [q.id]: v }))}
            randomizeChoices={!!quiz.settings.randomizeChoices}
            seed={seed + idx}
          />
        ))}
      </div>

      <div className="pt-2">
        <Button
          size="lg"
          className="w-full gap-2"
          onClick={() => setConfirmSubmit(true)}
          disabled={submit.isPending}
        >
          {submit.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              جاري التصحيح…
            </>
          ) : (
            <>
              <ClipboardCheck className="h-4 w-4" />
              تسليم الاختبار وعرض النتيجة
            </>
          )}
        </Button>
      </div>

      <Dialog open={confirmSubmit} onOpenChange={setConfirmSubmit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تسليم الاختبار؟</DialogTitle>
            <DialogDescription>
              سيتم تصحيح إجاباتك تلقائيًا بناءً على المستند.
              {answeredCount < quiz.questions.length && (
                <span className="block mt-2 text-destructive font-medium">
                  ⚠ لديك {quiz.questions.length - answeredCount} سؤال بدون إجابة.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSubmit(false)}>
              عودة
            </Button>
            <Button
              onClick={() => {
                setConfirmSubmit(false);
                handleSubmit();
              }}
              disabled={submit.isPending}
            >
              تأكيد التسليم
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QuestionCard({
  index,
  question,
  value,
  onChange,
  randomizeChoices,
  seed,
}: {
  index: number;
  question: QuizQuestion;
  value: string;
  onChange: (v: string) => void;
  randomizeChoices: boolean;
  seed: number;
}) {
  const orderedChoices = useMemo(() => {
    if (!question.choices) return [];
    if (question.type === "true_false") return question.choices; // keep صح/خطأ
    return randomizeChoices ? shuffle(question.choices, seed) : question.choices;
  }, [question.choices, question.type, randomizeChoices, seed]);

  return (
    <Card className="border-border/60">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <Badge variant="outline" className="shrink-0 mt-0.5">
            {index}
          </Badge>
          <div className="flex-1 min-w-0">
            <p className="font-medium leading-relaxed whitespace-pre-line">
              {question.prompt}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {QUESTION_TYPE_LABEL[question.type]}
            </p>
          </div>
        </div>

        {(question.type === "mcq" || question.type === "true_false") && (
          <RadioGroup value={value} onValueChange={onChange}>
            <div className="space-y-2">
              {orderedChoices.map((c, i) => (
                <label
                  key={`${i}-${c}`}
                  className={cn(
                    "flex items-start gap-2 border rounded-md p-3 cursor-pointer hover:bg-muted/40",
                    value === c && "border-primary bg-primary/5",
                  )}
                >
                  <RadioGroupItem value={c} className="mt-0.5" />
                  <span className="text-sm leading-relaxed">{c}</span>
                </label>
              ))}
            </div>
          </RadioGroup>
        )}

        {question.type === "fill_blank" && (
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="اكتب الكلمة أو العبارة المناسبة…"
          />
        )}

        {question.type === "short_answer" && (
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="اكتب إجابتك…"
            rows={3}
          />
        )}
      </CardContent>
    </Card>
  );
}

/* --------------------------- RESULT ---------------------------- */

function verdictBadge(v: string) {
  if (v === "correct")
    return (
      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 border-emerald-500/20">
        <CheckCircle2 className="h-3 w-3 ml-1" />
        صحيحة
      </Badge>
    );
  if (v === "partial")
    return (
      <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 border-amber-500/20">
        <CircleHelp className="h-3 w-3 ml-1" />
        جزئية
      </Badge>
    );
  if (v === "empty")
    return (
      <Badge variant="outline" className="text-muted-foreground">
        <AlertCircle className="h-3 w-3 ml-1" />
        فارغة
      </Badge>
    );
  return (
    <Badge className="bg-destructive/15 text-destructive hover:bg-destructive/20 border-destructive/20">
      <XCircle className="h-3 w-3 ml-1" />
      خاطئة
    </Badge>
  );
}

function QuizResultView({
  attempt,
  quiz,
  onClose,
}: {
  attempt: QuizAttempt;
  quiz: Quiz;
  onClose: () => void;
}) {
  const pct =
    attempt.maxScore > 0
      ? Math.round((attempt.score / attempt.maxScore) * 100)
      : 0;
  const itemByQid = new Map(attempt.items.map((it) => [it.questionId, it]));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        </Button>
        <div>
          <h2 className="text-xl font-extrabold">نتيجة: {quiz.name}</h2>
          <p className="text-xs text-muted-foreground">
            {format(new Date(attempt.createdAt), "PPpp", { locale: ar })}
          </p>
        </div>
      </div>

      <Card
        className={cn(
          "border-2",
          pct >= 80
            ? "border-emerald-500/40 bg-emerald-500/5"
            : pct >= 50
            ? "border-amber-500/40 bg-amber-500/5"
            : "border-destructive/40 bg-destructive/5",
        )}
      >
        <CardContent className="p-6 text-center">
          <p className="text-sm text-muted-foreground">نتيجتك</p>
          <p className="text-5xl font-extrabold mt-1">
            {attempt.score}{" "}
            <span className="text-2xl text-muted-foreground">
              / {attempt.maxScore}
            </span>
          </p>
          <p className="text-2xl font-bold mt-2">{pct}%</p>
        </CardContent>
      </Card>

      <Separator />
      <h3 className="font-semibold text-sm text-muted-foreground">
        مراجعة الأسئلة
      </h3>

      <div className="space-y-4">
        {quiz.questions.map((q, i) => {
          const item = itemByQid.get(q.id);
          return (
            <Card key={q.id} className="border-border/60">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <Badge variant="outline" className="shrink-0 mt-0.5">
                      {i + 1}
                    </Badge>
                    <p className="font-medium leading-relaxed whitespace-pre-line">
                      {q.prompt}
                    </p>
                  </div>
                  {item && verdictBadge(item.verdict)}
                </div>
                <Separator />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">إجابتك:</p>
                    <p
                      className={cn(
                        "rounded-md p-2 border whitespace-pre-line",
                        item?.verdict === "correct"
                          ? "bg-emerald-500/5 border-emerald-500/30"
                          : item?.verdict === "partial"
                          ? "bg-amber-500/5 border-amber-500/30"
                          : "bg-destructive/5 border-destructive/30",
                        !item?.userAnswer && "italic text-muted-foreground",
                      )}
                    >
                      {item?.userAnswer || "لم تُجِب"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      الإجابة الصحيحة:
                    </p>
                    <p className="rounded-md p-2 border border-emerald-500/30 bg-emerald-500/5 whitespace-pre-line">
                      {q.correctAnswer}
                    </p>
                  </div>
                </div>
                {(item?.feedback || q.explanation) && (
                  <div className="text-xs bg-muted/40 rounded-md p-2 space-y-1">
                    {item?.feedback && (
                      <p>
                        <span className="font-semibold">ملاحظة المصحح: </span>
                        {item.feedback}
                      </p>
                    )}
                    {q.explanation && (
                      <p>
                        <span className="font-semibold">تفسير: </span>
                        {q.explanation}
                      </p>
                    )}
                    {q.pageNumber && (
                      <p className="text-muted-foreground">
                        المصدر: صفحة {q.pageNumber}
                        {q.pageLabel && q.pageLabel !== String(q.pageNumber)
                          ? ` (المطبوع ${q.pageLabel})`
                          : ""}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Button onClick={onClose} className="w-full" size="lg">
        رجوع لقائمة الاختبارات
      </Button>
    </div>
  );
}

/* --------------------------- HISTORY ---------------------------- */

function QuizHistoryView({
  quizId,
  onBack,
  onView,
}: {
  quizId: number;
  onBack: () => void;
  onView: (a: QuizAttempt, q: Quiz) => void;
}) {
  const { data: quiz } = useGetQuiz(quizId);
  const { data: attempts, isLoading } = useListQuizAttempts(quizId, {
    query: { queryKey: getListQuizAttemptsQueryKey(quizId) },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        </Button>
        <div>
          <h2 className="text-lg font-extrabold">
            محاولات: {quiz?.name ?? ""}
          </h2>
          <p className="text-xs text-muted-foreground">
            سجل المحاولات السابقة لهذا الاختبار
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : attempts && attempts.length > 0 && quiz ? (
        <div className="space-y-2">
          <AnimatePresence>
            {attempts.map((a) => {
              const pct =
                a.maxScore > 0 ? Math.round((a.score / a.maxScore) * 100) : 0;
              return (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Card className="border-border/60 hover-elevate">
                    <CardContent className="p-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">
                          {a.score} / {a.maxScore}{" "}
                          <span className="text-muted-foreground">({pct}%)</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(a.createdAt), "PPpp", {
                            locale: ar,
                          })}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onView(a, quiz)}
                      >
                        عرض التفاصيل
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      ) : (
        <Card className="border-dashed border-2">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            لا توجد محاولات سابقة لهذا الاختبار.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
