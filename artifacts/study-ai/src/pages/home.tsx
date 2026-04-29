import { useLocation, Link } from "wouter";
import {
  useListDocuments,
  useGetStats,
  useListRecentQuestions,
  useDeleteDocument,
  getListDocumentsQueryKey,
  getGetStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  FileText,
  UploadCloud,
  Trash2,
  Library,
  Clock,
  AlertCircle,
  Sparkles,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } };

export function Home() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: stats, isLoading: statsLoading } = useGetStats();
  const { data: documents, isLoading: docsLoading } = useListDocuments();
  const { data: recentQuestions, isLoading: recentLoading } =
    useListRecentQuestions();

  const deleteDoc = useDeleteDocument({
    mutation: {
      onSuccess: () => {
        toast.success("تم حذف المستند بنجاح");
        queryClient.invalidateQueries({
          queryKey: getListDocumentsQueryKey(),
        });
        queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
      },
      onError: () => toast.error("حدث خطأ أثناء الحذف"),
    },
  });

  return (
    <div className="container mx-auto px-4 md:px-8 py-8 md:py-12 max-w-6xl space-y-12">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-bl from-primary/15 via-card to-card p-8 md:p-12">
        <div className="absolute -top-20 -left-20 h-64 w-64 rounded-full bg-primary/20 blur-3xl pointer-events-none"></div>
        <div className="relative">
          <Badge
            variant="secondary"
            className="bg-primary/10 text-primary border-primary/20 mb-4"
          >
            <Sparkles className="h-3 w-3 ml-1" />
            مدعوم بالذكاء الاصطناعي
          </Badge>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-balance leading-tight mb-3">
            مذاكرتك أصبحت أذكى
            <span className="block text-primary mt-1">مع مذاكر الذكي</span>
          </h1>
          <p className="text-muted-foreground text-base md:text-lg max-w-2xl text-balance">
            ارفع كتابك أو مذكرتك واسأل أي سؤال — أو أرفق صورة لورقة أسئلة من
            داخل المذكرة وسيتم استخراجها والإجابة عنها مع الاقتباسات.
          </p>
          <div className="flex flex-wrap gap-3 mt-6">
            <Button
              size="lg"
              onClick={() => setLocation("/upload")}
              className="gap-2 shadow-md"
            >
              <UploadCloud className="h-5 w-5" />
              ارفع مستنداً جديداً
            </Button>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section>
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            icon={Library}
            label="المستندات"
            value={stats?.documentCount}
            loading={statsLoading}
          />
          <StatCard
            icon={FileText}
            label="الصفحات"
            value={stats?.totalPages}
            loading={statsLoading}
          />
          <StatCard
            icon={BookOpen}
            label="الأسئلة المُجَابة"
            value={stats?.totalQuestions}
            loading={statsLoading}
          />
        </div>
      </section>

      {/* Documents + recent questions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-lg">
                <Library className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-xl md:text-2xl font-bold">مكتبتي</h2>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/upload")}
              className="gap-2"
            >
              <UploadCloud className="h-4 w-4" />
              رفع مستند
            </Button>
          </div>

          {docsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-40 rounded-xl" />
              ))}
            </div>
          ) : !documents || documents.length === 0 ? (
            <Card className="border-dashed border-2 bg-muted/20">
              <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-4">
                <div className="bg-primary/10 p-4 rounded-full">
                  <BookOpen className="h-8 w-8 text-primary" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold">مكتبتك فارغة حالياً</h3>
                  <p className="text-muted-foreground max-w-md text-sm">
                    قم برفع كتاب أو مذكرة بصيغة PDF لتبدأ في طرح الأسئلة.
                  </p>
                </div>
                <Button
                  size="lg"
                  onClick={() => setLocation("/upload")}
                  className="mt-2 gap-2"
                >
                  <UploadCloud className="h-5 w-5" />
                  رفع أول مستند
                </Button>
              </CardContent>
            </Card>
          ) : (
            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 sm:grid-cols-2 gap-4"
            >
              {documents.map((doc) => (
                <motion.div key={doc.id} variants={item}>
                  <Card className="h-full flex flex-col hover:border-primary/40 hover:shadow-lg transition-all">
                    <CardHeader className="flex-1">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <CardTitle className="line-clamp-2 leading-tight text-lg mb-2">
                            <Link
                              href={`/documents/${doc.id}`}
                              className="hover:text-primary transition-colors"
                            >
                              {doc.title}
                            </Link>
                          </CardTitle>
                          <CardDescription className="flex items-center gap-2 text-xs">
                            <span>
                              {format(new Date(doc.createdAt), "dd MMM yyyy", {
                                locale: ar,
                              })}
                            </span>
                            <span>•</span>
                            <span>{doc.totalPages} صفحة</span>
                          </CardDescription>
                        </div>
                        <DeleteButton
                          title="هل تريد حذف هذا المستند؟"
                          description={`سيتم حذف "${doc.title}" وجميع الأسئلة المرتبطة به نهائياً.`}
                          onConfirm={() => deleteDoc.mutate({ id: doc.id })}
                        />
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {doc.status === "failed" ? (
                        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-2 rounded-md">
                          <AlertCircle className="h-4 w-4" />
                          <span>فشل في المعالجة</span>
                        </div>
                      ) : (
                        <Button
                          variant={
                            doc.status === "processing"
                              ? "secondary"
                              : "default"
                          }
                          className="w-full gap-2"
                          asChild
                        >
                          <Link href={`/documents/${doc.id}`}>
                            {doc.status === "processing" ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                جاري المعالجة...
                              </>
                            ) : (
                              <>
                                تصفح المستند
                                <ArrowLeft className="h-4 w-4" />
                              </>
                            )}
                          </Link>
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-lg">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-xl font-bold">أحدث الأسئلة</h2>
          </div>

          <Card className="border-border/60">
            <CardContent className="p-0">
              {recentLoading ? (
                <div className="p-4 space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  ))}
                </div>
              ) : !recentQuestions || recentQuestions.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  لم يُطرح أي سؤال بعد.
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {recentQuestions.map((q) => (
                    <Link
                      key={q.id}
                      href={`/documents/${q.documentId}`}
                      className="block p-4 hover:bg-muted/40 transition-colors group"
                    >
                      <p className="font-medium text-sm line-clamp-2 mb-2 group-hover:text-primary transition-colors">
                        "{q.question}"
                      </p>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="line-clamp-1 flex-1 ml-2">
                          {q.documentTitle}
                        </span>
                        <span className="shrink-0">
                          {format(new Date(q.createdAt), "dd MMM", {
                            locale: ar,
                          })}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | undefined;
  loading: boolean;
}) {
  return (
    <Card className="overflow-hidden border-border/60 bg-card/70 hover:border-primary/30 transition-colors">
      <CardContent className="p-4 md:p-5 flex items-center gap-3">
        <div className="bg-primary/10 p-2.5 rounded-lg shrink-0">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground line-clamp-1">
            {label}
          </p>
          {loading ? (
            <Skeleton className="h-7 w-12 mt-1" />
          ) : (
            <h3 className="text-2xl font-extrabold tabular-nums">
              {value ?? 0}
            </h3>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DeleteButton({
  title,
  description,
  onConfirm,
}: {
  title: string;
  description: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 -mt-1 -mr-2 shrink-0"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row-reverse sm:justify-start gap-2">
          <AlertDialogCancel className="mt-0">إلغاء</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            حذف
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
