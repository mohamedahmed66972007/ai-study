import { useState } from "react";
import { Link, useParams } from "wouter";
import {
  useGetQuestionSheet,
  getGetQuestionSheetQueryKey,
} from "@workspace/api-client-react";
import {
  Loader2,
  ChevronRight,
  AlertCircle,
  FileQuestion,
  Lightbulb,
  CheckCircle2,
  Image as ImageIcon,
  FileText,
  Eye,
  EyeOff,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function SheetView() {
  const params = useParams();
  const id = Number(params.id);
  const [previewOpen, setPreviewOpen] = useState(false);

  const { data: sheet, isLoading } = useGetQuestionSheet(id, {
    query: {
      enabled: Number.isFinite(id),
      queryKey: getGetQuestionSheetQueryKey(id),
      refetchInterval: (q) =>
        q.state.data?.status === "processing" ? 1500 : false,
    },
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-4xl space-y-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!sheet) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center flex-col gap-4 text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-2xl font-bold">الورقة غير موجودة</h2>
        <Button asChild variant="outline">
          <Link href="/sheets">عودة لأوراق الأسئلة</Link>
        </Button>
      </div>
    );
  }

  if (sheet.status === "failed") {
    return (
      <div className="container mx-auto px-4 py-12 max-w-2xl text-center space-y-4">
        <AlertCircle className="h-14 w-14 text-destructive mx-auto" />
        <h2 className="text-2xl font-bold">فشل في استخراج الأسئلة</h2>
        <p className="text-muted-foreground">{sheet.errorMessage}</p>
        <Button asChild variant="outline">
          <Link href="/sheets">عودة لأوراق الأسئلة</Link>
        </Button>
      </div>
    );
  }

  if (sheet.status === "processing") {
    return (
      <div className="flex-1 p-8 flex items-center justify-center flex-col gap-6 text-center">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse"></div>
          <div className="bg-primary/10 p-6 rounded-full relative">
            <FileQuestion className="h-12 w-12 text-primary animate-pulse" />
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold">جاري استخراج الأسئلة…</h2>
          <p className="text-muted-foreground max-w-sm mx-auto text-sm">
            يقوم الذكاء الاصطناعي بقراءة "{sheet.title}" واستخراج كل سؤال
            وكتابة إجابته ودليله. قد يستغرق ذلك بضع ثوانٍ.
          </p>
        </div>
        <div className="w-64 h-2 bg-muted rounded-full overflow-hidden mt-4">
          <div className="h-full bg-primary animate-[progress_2s_ease-in-out_infinite] origin-left"></div>
        </div>
      </div>
    );
  }

  const fileUrl = `${import.meta.env.BASE_URL}api/question-sheets/${sheet.id}/file`;

  return (
    <div className="container mx-auto px-4 py-8 md:py-12 max-w-4xl space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <Link
          href="/sheets"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          أوراق الأسئلة
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1">
                {sheet.sourceType === "image" ? (
                  <ImageIcon className="h-3 w-3" />
                ) : (
                  <FileText className="h-3 w-3" />
                )}
                {sheet.sourceType === "image" ? "صورة" : "PDF"}
              </Badge>
              <Badge className="bg-primary/10 text-primary border-primary/20 gap-1">
                <CheckCircle2 className="h-3 w-3" />
                {sheet.questionCount} سؤال
              </Badge>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-balance">
              {sheet.title}
            </h1>
            <p className="text-xs text-muted-foreground">
              تم الرفع في{" "}
              {format(new Date(sheet.createdAt), "dd MMMM yyyy", { locale: ar })}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => setPreviewOpen(true)}
            className="gap-2 shrink-0"
          >
            <Eye className="h-4 w-4" />
            عرض الملف الأصلي
          </Button>
        </div>
      </div>

      {/* Q&A list */}
      {sheet.questions.length === 0 ? (
        <Card className="border-dashed p-8 text-center text-muted-foreground">
          لم يتم العثور على أسئلة قابلة للاستخراج في هذا الملف.
        </Card>
      ) : (
        <div className="space-y-4">
          {sheet.questions.map((q, idx) => (
            <QACard
              key={q.id}
              index={idx}
              questionNumber={q.questionNumber}
              question={q.question}
              answer={q.answer}
              explanation={q.explanation}
            />
          ))}
        </div>
      )}

      {/* Original file preview */}
      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent
          side="left"
          className="w-full sm:max-w-2xl p-0 flex flex-col"
        >
          <SheetHeader className="px-6 py-4 border-b">
            <SheetTitle className="flex items-center justify-between gap-2">
              <span>الملف الأصلي</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setPreviewOpen(false)}
                className="h-8 w-8"
              >
                <ChevronRight className="h-4 w-4 rtl:rotate-180" />
              </Button>
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-auto bg-muted/30 p-4">
            {sheet.sourceType === "image" ? (
              <img
                src={fileUrl}
                alt={sheet.title}
                className="w-full h-auto rounded-lg shadow-md mx-auto bg-white"
              />
            ) : (
              <iframe
                src={fileUrl}
                title={sheet.title}
                className="w-full h-full min-h-[80vh] rounded-lg bg-white border"
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function QACard({
  index,
  questionNumber,
  question,
  answer,
  explanation,
}: {
  index: number;
  questionNumber: number;
  question: string;
  answer: string;
  explanation: string;
}) {
  const [showProof, setShowProof] = useState(false);
  const hasProof = explanation.trim().length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.4) }}
    >
      <Card className="overflow-hidden border-border/60 hover:border-primary/30 transition-colors">
        <div className="p-5 md:p-6 space-y-4">
          {/* Question */}
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "flex items-center justify-center shrink-0 w-9 h-9 rounded-full font-bold text-sm",
                "bg-primary/10 text-primary",
              )}
            >
              {questionNumber}
            </span>
            <div className="flex-1 min-w-0 pt-1">
              <p className="text-xs font-semibold text-muted-foreground mb-1">
                السؤال
              </p>
              <p className="text-base md:text-lg font-bold leading-relaxed text-balance whitespace-pre-wrap">
                {question}
              </p>
            </div>
          </div>

          {/* Answer */}
          <div className="rounded-xl bg-primary/5 border border-primary/15 p-4 mr-12">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <p className="text-xs font-bold text-primary">الإجابة</p>
            </div>
            <p className="text-sm md:text-base leading-relaxed whitespace-pre-wrap">
              {answer}
            </p>
          </div>

          {/* Proof toggle */}
          {hasProof && (
            <div className="mr-12">
              <Button
                variant={showProof ? "secondary" : "outline"}
                size="sm"
                onClick={() => setShowProof((v) => !v)}
                className="gap-2 text-xs"
              >
                {showProof ? (
                  <>
                    <EyeOff className="h-3.5 w-3.5" />
                    إخفاء الدليل
                  </>
                ) : (
                  <>
                    <Lightbulb className="h-3.5 w-3.5" />
                    عرض الدليل للتحقق
                  </>
                )}
              </Button>
              <AnimatePresence initial={false}>
                {showProof && (
                  <motion.div
                    key="proof"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 rounded-xl border border-dashed border-primary/30 bg-muted/40 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Lightbulb className="h-4 w-4 text-primary" />
                        <p className="text-xs font-bold text-foreground">
                          الدليل / الشرح
                        </p>
                      </div>
                      <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">
                        {explanation}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
