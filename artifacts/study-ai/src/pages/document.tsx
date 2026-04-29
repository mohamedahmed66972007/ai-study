import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useParams } from "wouter";
import { Document as PdfDocument, Page as PdfPage, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();
import { 
  useGetDocument, 
  useListDocumentQuestions, 
  useAskDocumentQuestion, 
  useGetDocumentPage,
  getGetDocumentQueryKey,
  getListDocumentQuestionsQueryKey,
  getGetStatsQueryKey,
  getListRecentQuestionsQueryKey,
  getGetDocumentPageQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { 
  Loader2, 
  Send, 
  BookOpen, 
  ChevronLeft, 
  FileText, 
  AlertCircle,
  ChevronRight,
  Maximize2,
  ImagePlus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

export function Document() {
  const params = useParams();
  const id = Number(params.id);
  const queryClient = useQueryClient();
  
  const [question, setQuestion] = useState("");
  const [activePage, setActivePage] = useState<{
    pageNumber: number;
    pageLabel: string | null;
  } | null>(null);
  const [isMobileSourceOpen, setIsMobileSourceOpen] = useState(false);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isExtractingImage, setIsExtractingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: document, isLoading: docLoading } = useGetDocument(id, {
    query: {
      enabled: !!id,
      queryKey: getGetDocumentQueryKey(id),
      refetchInterval: (data) => (data?.state?.data?.status === "processing" ? 1500 : false)
    }
  });

  const { data: questions, isLoading: questionsLoading } = useListDocumentQuestions(id, {
    query: {
      enabled: !!id && document?.status === "ready",
      queryKey: getListDocumentQuestionsQueryKey(id)
    }
  });

  const askQuestion = useAskDocumentQuestion({
    mutation: {
      onSuccess: () => {
        setQuestion("");
        queryClient.invalidateQueries({ queryKey: getListDocumentQuestionsQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListRecentQuestionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDocumentQueryKey(id) });
      },
      onError: () => {
        toast.error("حدث خطأ أثناء الإجابة. حاول مرة أخرى.");
      }
    }
  });

  const handleAsk = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || askQuestion.isPending) return;
    askQuestion.mutate({ id, data: { question: question.trim() } });
  };

  const handleCitationClick = (
    pageNumber: number,
    pageLabel: string | null,
  ) => {
    setActivePage({ pageNumber, pageLabel });
    setIsMobileSourceOpen(true);
  };

  const handlePickImage = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("يجب أن يكون الملف صورة");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast.error("حجم الصورة يجب أن لا يتجاوز 25 ميجابايت");
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setImageDialogOpen(true);
  };

  const closeImageDialog = () => {
    setImageDialogOpen(false);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    setImageFile(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const handleSubmitImage = async () => {
    if (!imageFile) return;
    setIsExtractingImage(true);
    try {
      const fd = new FormData();
      fd.append("file", imageFile);
      const res = await fetch(
        `${import.meta.env.BASE_URL}api/documents/${id}/questions/from-image`,
        { method: "POST", body: fd },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "فشل تحليل الصورة");
      }
      const created = (await res.json()) as Array<{ id: number }>;
      toast.success(`تم استخراج وحلّ ${created.length} سؤال من الصورة`);
      queryClient.invalidateQueries({
        queryKey: getListDocumentQuestionsQueryKey(id),
      });
      queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
      queryClient.invalidateQueries({
        queryKey: getListRecentQuestionsQueryKey(),
      });
      queryClient.invalidateQueries({ queryKey: getGetDocumentQueryKey(id) });
      closeImageDialog();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "حدث خطأ";
      toast.error(msg);
    } finally {
      setIsExtractingImage(false);
    }
  };

  // We anchor the most recent Q&A to the top of the chat viewport so the
  // user can always see what they asked while the answer streams in below.
  // We do this by tracking the latest "anchor" element (either the in-flight
  // question while pending, or the most recently saved one) and scrolling it
  // into view at the top of the scroll container.
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const lastAnchoredKeyRef = useRef<string | null>(null);
  const previousQuestionCountRef = useRef<number>(0);

  // Initial load: jump to the bottom (most recent first-time view).
  useEffect(() => {
    if (
      scrollRef.current &&
      questions &&
      previousQuestionCountRef.current === 0 &&
      questions.length > 0
    ) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      previousQuestionCountRef.current = questions.length;
    }
  }, [questions]);

  // Whenever the anchor (latest pending/persisted Q) changes, scroll it to
  // the top of the chat area. The bottom spacer (added below) gives enough
  // room for the answer to grow without the question being pushed away.
  useEffect(() => {
    const anchorKey = askQuestion.isPending
      ? `pending:${askQuestion.variables?.data.question ?? ""}`
      : questions && questions.length > 0
        ? `q:${questions[0]!.id}`
        : null;

    if (
      anchorKey &&
      anchorKey !== lastAnchoredKeyRef.current &&
      anchorRef.current &&
      scrollRef.current
    ) {
      const container = scrollRef.current;
      const target = anchorRef.current;
      const offset = target.offsetTop - container.offsetTop - 8;
      container.scrollTo({ top: offset, behavior: "smooth" });
      lastAnchoredKeyRef.current = anchorKey;
    }

    if (questions) {
      previousQuestionCountRef.current = questions.length;
    }
  }, [questions, askQuestion.isPending, askQuestion.variables?.data.question]);

  if (docLoading) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!document) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center flex-col gap-4 text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-2xl font-bold">المستند غير موجود</h2>
        <p className="text-muted-foreground">لم نتمكن من العثور على هذا المستند.</p>
      </div>
    );
  }

  if (document.status === "failed") {
    return (
      <div className="flex-1 p-8 flex items-center justify-center flex-col gap-4 text-center">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <h2 className="text-2xl font-bold">فشل في المعالجة</h2>
        <p className="text-muted-foreground">حدث خطأ أثناء معالجة هذا المستند. يرجى حذفه والمحاولة مرة أخرى.</p>
        {document.errorMessage && (
          <div className="bg-destructive/10 text-destructive p-4 rounded-md text-sm mt-4">
            {document.errorMessage}
          </div>
        )}
      </div>
    );
  }

  if (document.status === "processing") {
    return (
      <div className="flex-1 p-8 flex items-center justify-center flex-col gap-6 text-center">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse"></div>
          <div className="bg-primary/10 p-6 rounded-full relative">
            <BookOpen className="h-12 w-12 text-primary animate-bounce" />
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold">جاري المذاكرة...</h2>
          <p className="text-muted-foreground max-w-sm mx-auto">
            يقوم الذكاء الاصطناعي الآن بقراءة وتحليل المستند "{document.title}". سيستغرق هذا بضع ثوانٍ.
          </p>
        </div>
        <div className="w-64 h-2 bg-muted rounded-full overflow-hidden mt-4">
          <div className="h-full bg-primary animate-[progress_2s_ease-in-out_infinite] origin-left"></div>
        </div>
      </div>
    );
  }

  return (
    // We pin the document page to the viewport (below the 4rem-tall sticky
    // header) using fixed positioning. This guarantees the chat composer
    // input stays visible at the bottom of the screen — without it, when the
    // chat content grows past the viewport the parent flex chain lets the
    // whole page scroll, pushing the input off-screen.
    <div className="fixed inset-x-0 top-16 bottom-0 flex flex-col md:flex-row overflow-hidden bg-background">
      {/* Left Pane - Chat Area */}
      <div className="flex-1 flex flex-col relative border-l min-h-0 min-w-0">
        {/* Document Header */}
        <div className="border-b bg-background/95 backdrop-blur px-6 py-4 flex items-center justify-between z-10 shrink-0">
          <div>
            <h1 className="font-bold text-lg line-clamp-1">{document.title}</h1>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
              <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> {document.totalPages} صفحة</span>
              <span>•</span>
              <span>تم الرفع في {format(new Date(document.createdAt), "dd MMM yyyy", { locale: ar })}</span>
            </div>
          </div>
          {activePage && (
            <Button 
              variant="outline" 
              size="sm" 
              className="md:hidden gap-2"
              onClick={() => setIsMobileSourceOpen(true)}
            >
              <BookOpen className="h-4 w-4" />
              المصدر
            </Button>
          )}
        </div>

        {/* Q&A History */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6" ref={scrollRef}>
          {questionsLoading ? (
            <div className="space-y-8">
              {[1, 2].map(i => (
                <div key={i} className="space-y-4">
                  <Skeleton className="h-10 w-3/4 mr-auto" />
                  <Skeleton className="h-32 w-[90%] ml-auto" />
                </div>
              ))}
            </div>
          ) : questions?.length === 0 ? (
             <div className="h-full flex flex-col items-center justify-center text-center space-y-4 text-muted-foreground max-w-md mx-auto">
               <div className="bg-primary/5 p-6 rounded-full mb-2">
                 <BookOpen className="h-10 w-10 text-primary/50" />
               </div>
               <h3 className="text-lg font-medium text-foreground">المستند جاهز</h3>
               <p className="text-sm">
                 ابدأ بطرح أي سؤال حول محتوى "{document.title}". سيقوم الذكاء الاصطناعي بالإجابة وتحديد رقم الصفحة كدليل.
               </p>
             </div>
          ) : (
            (() => {
              // The API returns questions newest-first. Render them in
              // chat-style order (oldest first, newest at the bottom near the
              // input) and put the in-flight pending Q&A right after.
              const ordered = questions ? [...questions].reverse() : [];
              // The "latest" message is whichever is at the bottom: the
              // pending one if present, otherwise the most recent persisted
              // question. We attach `anchorRef` to it so we can scroll it to
              // the top of the viewport (see useEffect above).
              const latestPersistedIndex = ordered.length - 1;
              const pendingIsLatest = askQuestion.isPending;
              return (
                <div className="space-y-8 max-w-3xl mx-auto pb-4">
                  {ordered.map((q, idx) => {
                    const isLatest =
                      !pendingIsLatest && idx === latestPersistedIndex;
                    return (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={q.id}
                        ref={isLatest ? anchorRef : undefined}
                        className="space-y-4 scroll-mt-4"
                      >
                        {/* User Question */}
                        <div className="flex items-start gap-4">
                          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-1">
                            <span className="font-semibold text-sm">أنا</span>
                          </div>
                          <div className="bg-secondary/50 rounded-2xl rounded-tr-sm px-5 py-3 text-sm font-medium leading-relaxed">
                            {q.question}
                          </div>
                        </div>

                        {/* AI Answer */}
                        <div className="flex items-start gap-4 mr-4">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                            <BookOpen className="h-4 w-4 text-primary" />
                          </div>
                          <div className="space-y-4 flex-1">
                            <div className="bg-background border shadow-sm rounded-2xl rounded-tl-sm px-5 py-4 text-sm leading-relaxed whitespace-pre-wrap">
                              {q.answer}
                            </div>

                            {/* Citations */}
                            {q.citations && q.citations.length > 0 && (
                              <div className="space-y-2">
                                <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                                  <FileText className="h-3 w-3" />
                                  المصادر / الأدلة
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {q.citations.map((cite, idx) => {
                                    const label = cite.pageLabel ?? null;
                                    const isActive =
                                      activePage?.pageNumber ===
                                      cite.pageNumber;
                                    return (
                                      <button
                                        key={idx}
                                        onClick={() =>
                                          handleCitationClick(
                                            cite.pageNumber,
                                            label,
                                          )
                                        }
                                        className={`text-right group flex flex-col gap-1.5 bg-muted/30 hover:bg-primary/5 border hover:border-primary/30 p-2.5 rounded-lg transition-colors w-full sm:w-[calc(50%-0.25rem)] ${isActive ? "border-primary bg-primary/5" : ""}`}
                                      >
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <Badge
                                            variant="secondary"
                                            className="w-fit text-[10px] py-0 h-5 bg-background"
                                          >
                                            صفحة {cite.pageNumber}
                                          </Badge>
                                          {label &&
                                            label !==
                                              String(cite.pageNumber) && (
                                              <Badge
                                                variant="outline"
                                                className="w-fit text-[10px] py-0 h-5"
                                                title="الرقم المطبوع داخل الصفحة"
                                              >
                                                مطبوع: {label}
                                              </Badge>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground line-clamp-2 group-hover:text-foreground transition-colors italic">
                                          "{cite.quote}"
                                        </p>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}

                  {/* Pending state */}
                  {askQuestion.isPending && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      ref={anchorRef}
                      className="space-y-4 scroll-mt-4"
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-1">
                          <span className="font-semibold text-sm">أنا</span>
                        </div>
                        <div className="bg-secondary/50 rounded-2xl rounded-tr-sm px-5 py-3 text-sm font-medium leading-relaxed">
                          {askQuestion.variables?.data.question}
                        </div>
                      </div>
                      <div className="flex items-start gap-4 mr-4">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                          <BookOpen className="h-4 w-4 text-primary" />
                        </div>
                        <div className="bg-background border shadow-sm rounded-2xl rounded-tl-sm px-5 py-4 flex items-center gap-2">
                          <span className="flex gap-1">
                            <span
                              className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce"
                              style={{ animationDelay: "0ms" }}
                            ></span>
                            <span
                              className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce"
                              style={{ animationDelay: "150ms" }}
                            ></span>
                            <span
                              className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce"
                              style={{ animationDelay: "300ms" }}
                            ></span>
                          </span>
                          <span className="text-sm text-muted-foreground ml-2">
                            يبحث في المستند...
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Spacer so the latest message can be anchored to the top
                      of the viewport (mirrors ChatGPT-style behaviour). */}
                  <div aria-hidden className="min-h-[55vh]" />
                </div>
              );
            })()
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 bg-background border-t shrink-0">
          <form onSubmit={handleAsk} className="max-w-3xl mx-auto relative">
            <input
              type="file"
              accept="image/*"
              ref={imageInputRef}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handlePickImage(f);
              }}
            />
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="اسأل عن أي شيء في المستند..."
              className="pr-12 pl-12 py-6 text-base rounded-xl shadow-sm bg-background"
              disabled={askQuestion.isPending || isExtractingImage}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => imageInputRef.current?.click()}
              disabled={askQuestion.isPending || isExtractingImage}
              title="رفع صورة فيها أسئلة"
              className="absolute right-2 top-2 h-9 w-9 rounded-lg text-muted-foreground hover:text-primary"
            >
              <ImagePlus className="h-4 w-4" />
            </Button>
            <Button
              type="submit"
              size="icon"
              disabled={!question.trim() || askQuestion.isPending || isExtractingImage}
              className="absolute left-2 top-2 h-9 w-9 rounded-lg"
            >
              {askQuestion.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4 rotate-180" />
              )}
            </Button>
          </form>
          <p className="text-[11px] text-muted-foreground text-center mt-2">
            اكتب سؤالك، أو اضغط أيقونة الصورة لرفع ورقة أسئلة وسنستخرجها ونجيب
            عنها من المذكرة.
          </p>
        </div>
      </div>

      {/* Image upload dialog */}
      <Dialog
        open={imageDialogOpen}
        onOpenChange={(open) => {
          if (!open && !isExtractingImage) closeImageDialog();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>استخراج أسئلة من صورة</DialogTitle>
            <DialogDescription>
              سيتم قراءة الأسئلة من الصورة والإجابة عنها بناءً على محتوى
              "{document.title}" مع الاقتباسات.
            </DialogDescription>
          </DialogHeader>
          {imagePreview && (
            <div className="relative rounded-lg overflow-hidden border bg-muted/30">
              <img
                src={imagePreview}
                alt="معاينة"
                className="w-full max-h-72 object-contain bg-background"
              />
              {!isExtractingImage && (
                <button
                  type="button"
                  onClick={closeImageDialog}
                  className="absolute top-2 left-2 bg-background/80 backdrop-blur p-1 rounded-full hover:bg-background"
                  aria-label="إلغاء"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
          <DialogFooter className="flex-row-reverse sm:justify-start gap-2">
            <Button
              variant="outline"
              onClick={closeImageDialog}
              disabled={isExtractingImage}
            >
              إلغاء
            </Button>
            <Button
              onClick={handleSubmitImage}
              disabled={isExtractingImage || !imageFile}
              className="gap-2"
            >
              {isExtractingImage ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جاري الاستخراج…
                </>
              ) : (
                <>استخراج وحلّ الأسئلة</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Right Pane - Source Viewer (Desktop) */}
      <div className="hidden md:flex w-[400px] lg:w-[500px] flex-col bg-muted/10 shrink-0">
        <SourceViewer
          documentId={id}
          pageNumber={activePage?.pageNumber ?? null}
          pageLabel={activePage?.pageLabel ?? null}
        />
      </div>

      {/* Mobile Source Viewer Sheet */}
      <Sheet open={isMobileSourceOpen} onOpenChange={setIsMobileSourceOpen}>
        <SheetContent side="bottom" className="h-[80vh] p-0 flex flex-col rounded-t-xl">
          <SourceViewer
            documentId={id}
            pageNumber={activePage?.pageNumber ?? null}
            pageLabel={activePage?.pageLabel ?? null}
            onClose={() => setIsMobileSourceOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SourceViewer({
  documentId,
  pageNumber,
  pageLabel,
  onClose,
}: {
  documentId: number;
  pageNumber: number | null;
  pageLabel?: string | null;
  onClose?: () => void;
}) {
  const [mode, setMode] = useState<"image" | "text">("image");
  const [pdfError, setPdfError] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { data: pageData, isLoading: isTextLoading } = useGetDocumentPage(documentId, pageNumber || 1, {
    query: {
      enabled: !!documentId && !!pageNumber && mode === "text",
      queryKey: getGetDocumentPageQueryKey(documentId, pageNumber || 1),
    },
  });

  const fileUrl = `${import.meta.env.BASE_URL}api/documents/${documentId}/file`;

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setContainerWidth(Math.max(0, w - 32));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setPdfError(false);
  }, [documentId]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b bg-background flex items-center justify-between shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <BookOpen className="h-4 w-4 text-primary shrink-0" />
          <h3 className="font-semibold text-sm">المصدر</h3>
          {pageNumber && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant="secondary" className="text-xs">
                صفحة {pageNumber}
              </Badge>
              {pageLabel && pageLabel !== String(pageNumber) && (
                <Badge
                  variant="outline"
                  className="text-[10px] py-0 h-5"
                  title="الرقم المطبوع داخل الصفحة"
                >
                  مطبوع: {pageLabel}
                </Badge>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!pdfError && (
            <div className="flex rounded-md border bg-background overflow-hidden text-[11px]">
              <button
                onClick={() => setMode("image")}
                className={`px-2 py-1 transition-colors ${mode === "image" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                صورة الصفحة
              </button>
              <button
                onClick={() => setMode("text")}
                className={`px-2 py-1 transition-colors ${mode === "text" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                نص
              </button>
            </div>
          )}
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 -mr-1">
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-auto p-4 bg-[#F9F7F1] dark:bg-background/50">
        {!pageNumber ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground space-y-3 opacity-50">
            <Maximize2 className="h-10 w-10" />
            <p className="text-sm max-w-[200px]">انقر على أي مصدر في الإجابات لعرض الصفحة كاملة هنا.</p>
          </div>
        ) : mode === "image" && !pdfError ? (
          <div className="flex justify-center" dir="ltr">
            <PdfDocument
              file={fileUrl}
              onLoadError={() => setPdfError(true)}
              onSourceError={() => setPdfError(true)}
              loading={
                <div className="flex items-center justify-center py-20 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              }
              error={
                <div className="text-center text-muted-foreground mt-10 text-sm">
                  لم نتمكن من تحميل صورة الصفحة. سيتم عرض النص بدلاً منها.
                </div>
              }
            >
              {containerWidth > 0 && (
                <PdfPage
                  pageNumber={pageNumber}
                  width={containerWidth}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  className="shadow-md rounded overflow-hidden bg-white"
                  loading={
                    <div className="flex items-center justify-center py-20 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  }
                />
              )}
            </PdfDocument>
          </div>
        ) : isTextLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Skeleton key={i} className={`h-4 w-${i % 2 === 0 ? 'full' : '11/12'}`} />
            ))}
          </div>
        ) : pageData ? (
          <div className="prose prose-sm dark:prose-invert max-w-none font-serif text-foreground/90 leading-relaxed whitespace-pre-wrap">
            {pageData.content}
          </div>
        ) : (
          <div className="text-center text-muted-foreground mt-10">
            عذراً، لم نتمكن من تحميل الصفحة.
          </div>
        )}
      </div>
    </div>
  );
}
