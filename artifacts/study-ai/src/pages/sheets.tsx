import { Link, useLocation } from "wouter";
import {
  useListQuestionSheets,
  useDeleteQuestionSheet,
  getListQuestionSheetsQueryKey,
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
import {
  FileQuestion,
  UploadCloud,
  Trash2,
  AlertCircle,
  FileText,
  Image as ImageIcon,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { motion } from "framer-motion";
import { toast } from "sonner";

export function Sheets() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: sheets, isLoading } = useListQuestionSheets({
    query: {
      queryKey: getListQuestionSheetsQueryKey(),
      refetchInterval: 4000,
    },
  });

  const del = useDeleteQuestionSheet({
    mutation: {
      onSuccess: () => {
        toast.success("تم الحذف");
        queryClient.invalidateQueries({
          queryKey: getListQuestionSheetsQueryKey(),
        });
        queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
      },
      onError: () => toast.error("فشل الحذف"),
    },
  });

  return (
    <div className="container mx-auto px-4 md:px-8 py-8 md:py-12 max-w-6xl space-y-8">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2.5 rounded-lg">
            <FileQuestion className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              أوراق الأسئلة
            </h1>
            <p className="text-sm text-muted-foreground">
              ارفع صورة أو PDF يحتوي على أسئلة، وستحصل على إجابات لكل سؤال مع
              دليل قابل للعرض.
            </p>
          </div>
        </div>
        <Button onClick={() => setLocation("/upload?mode=sheet")} className="gap-2">
          <UploadCloud className="h-4 w-4" />
          ورقة جديدة
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : !sheets || sheets.length === 0 ? (
        <Card className="border-dashed border-2 bg-muted/20">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-4">
            <div className="bg-primary/10 p-4 rounded-full">
              <FileQuestion className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-semibold">لا توجد أوراق أسئلة بعد</h3>
              <p className="text-muted-foreground max-w-md text-sm">
                ارفع صورة لورقة امتحان، صورة لكتاب يحتوي أسئلة، أو ملف PDF،
                وسنستخرج جميع الأسئلة ونحلها لك.
              </p>
            </div>
            <Button
              size="lg"
              onClick={() => setLocation("/upload?mode=sheet")}
              className="gap-2"
            >
              <UploadCloud className="h-5 w-5" />
              رفع أول ورقة
            </Button>
          </CardContent>
        </Card>
      ) : (
        <motion.div
          initial="hidden"
          animate="show"
          variants={{
            hidden: { opacity: 0 },
            show: { opacity: 1, transition: { staggerChildren: 0.05 } },
          }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {sheets.map((sheet) => (
            <motion.div
              key={sheet.id}
              variants={{
                hidden: { opacity: 0, y: 12 },
                show: { opacity: 1, y: 0 },
              }}
            >
              <Card className="h-full flex flex-col hover:border-primary/40 hover:shadow-lg transition-all">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="bg-primary/10 p-1.5 rounded-md">
                        {sheet.sourceType === "image" ? (
                          <ImageIcon className="h-4 w-4 text-primary" />
                        ) : (
                          <FileText className="h-4 w-4 text-primary" />
                        )}
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {sheet.sourceType === "image" ? "صورة" : "PDF"}
                      </Badge>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            هل تريد حذف هذه الورقة؟
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            سيتم حذف "{sheet.title}" مع كل الأسئلة المستخرجة.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="flex-row-reverse sm:justify-start gap-2">
                          <AlertDialogCancel className="mt-0">
                            إلغاء
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => del.mutate({ id: sheet.id })}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            حذف
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                  <CardTitle className="text-base line-clamp-2 leading-tight mt-2">
                    <Link
                      href={`/sheets/${sheet.id}`}
                      className="hover:text-primary transition-colors"
                    >
                      {sheet.title}
                    </Link>
                  </CardTitle>
                  <CardDescription className="text-[11px]">
                    {format(new Date(sheet.createdAt), "dd MMM yyyy", {
                      locale: ar,
                    })}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0 mt-auto">
                  {sheet.status === "failed" ? (
                    <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 p-2 rounded-md">
                      <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span className="line-clamp-2">
                        {sheet.errorMessage || "فشل الاستخراج"}
                      </span>
                    </div>
                  ) : sheet.status === "processing" ? (
                    <Button variant="secondary" className="w-full gap-2" asChild>
                      <Link href={`/sheets/${sheet.id}`}>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        جاري الاستخراج…
                      </Link>
                    </Button>
                  ) : (
                    <Button className="w-full gap-2" asChild>
                      <Link href={`/sheets/${sheet.id}`}>
                        عرض ({sheet.questionCount} سؤال)
                        <ArrowLeft className="h-4 w-4" />
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
  );
}
