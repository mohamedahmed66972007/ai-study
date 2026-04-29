import { useState } from "react";
import { useLocation } from "wouter";
import { Link } from "wouter";
import { useListDocuments, useGetStats, useListRecentQuestions, useDeleteDocument, getListDocumentsQueryKey, getGetStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, FileText, UploadCloud, Trash2, Library, Clock, AlertCircle } from "lucide-react";
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

export function Home() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: stats, isLoading: statsLoading } = useGetStats();
  const { data: documents, isLoading: docsLoading } = useListDocuments();
  const { data: recentQuestions, isLoading: recentLoading } = useListRecentQuestions();
  
  const deleteDoc = useDeleteDocument({
    mutation: {
      onSuccess: () => {
        toast.success("تم حذف المستند بنجاح");
        queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
      },
      onError: () => {
        toast.error("حدث خطأ أثناء حذف المستند");
      }
    }
  });

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <div className="container mx-auto px-4 md:px-8 py-8 max-w-6xl space-y-12">
      {/* Stats Strip */}
      <section>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="bg-primary/10 p-3 rounded-full">
                <Library className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">إجمالي المستندات</p>
                {statsLoading ? <Skeleton className="h-8 w-16 mt-1" /> : <h3 className="text-2xl font-bold">{stats?.documentCount || 0}</h3>}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="bg-primary/10 p-3 rounded-full">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">إجمالي الصفحات</p>
                {statsLoading ? <Skeleton className="h-8 w-16 mt-1" /> : <h3 className="text-2xl font-bold">{stats?.totalPages || 0}</h3>}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="bg-primary/10 p-3 rounded-full">
                <BookOpen className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">الأسئلة المجاب عنها</p>
                {statsLoading ? <Skeleton className="h-8 w-16 mt-1" /> : <h3 className="text-2xl font-bold">{stats?.totalQuestions || 0}</h3>}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content - Documents */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-foreground">مكتبتي</h2>
            <Button onClick={() => setLocation("/upload")} className="gap-2">
              <UploadCloud className="h-4 w-4" />
              رفع مستند جديد
            </Button>
          </div>

          {docsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i} className="overflow-hidden">
                  <CardHeader className="space-y-2">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-10 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : documents?.length === 0 ? (
            <Card className="border-dashed border-2 bg-muted/30">
              <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-4">
                <div className="bg-primary/10 p-4 rounded-full">
                  <BookOpen className="h-8 w-8 text-primary" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold">مكتبتك فارغة حالياً</h3>
                  <p className="text-muted-foreground max-w-md">
                    قم برفع كتاب، مذكرة، أو أي مادة دراسية بصيغة PDF لتبدأ في طرح الأسئلة واستخراج المعلومات.
                  </p>
                </div>
                <Button size="lg" onClick={() => setLocation("/upload")} className="mt-4 gap-2">
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
              {documents?.map((doc) => (
                <motion.div key={doc.id} variants={item}>
                  <Card className="h-full flex flex-col hover-elevate transition-all border border-border/50 hover:border-primary/30">
                    <CardHeader className="flex-1">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <CardTitle className="line-clamp-2 leading-tight text-lg mb-2">
                            <Link href={`/documents/${doc.id}`} className="hover:text-primary transition-colors">
                              {doc.title}
                            </Link>
                          </CardTitle>
                          <CardDescription className="flex items-center gap-2 text-xs">
                            <span>{format(new Date(doc.createdAt), "dd MMMM yyyy", { locale: ar })}</span>
                            <span>•</span>
                            <span>{doc.totalPages} صفحة</span>
                          </CardDescription>
                        </div>
                        
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 -mt-1 -mr-2 shrink-0">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>هل أنت متأكد من حذف هذا المستند؟</AlertDialogTitle>
                              <AlertDialogDescription>
                                سيتم حذف المستند "{doc.title}" وجميع الأسئلة والإجابات المرتبطة به نهائياً. لا يمكن التراجع عن هذا الإجراء.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="flex-row-reverse sm:justify-start gap-2">
                              <AlertDialogCancel className="mt-0">إلغاء</AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={() => deleteDoc.mutate({ id: doc.id })}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                حذف المستند
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
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
                          variant={doc.status === "processing" ? "secondary" : "default"} 
                          className="w-full"
                          asChild
                        >
                          <Link href={`/documents/${doc.id}`}>
                            {doc.status === "processing" ? "جاري المذاكرة..." : "تصفح المستند"}
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

        {/* Sidebar - Recent Questions */}
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-xl font-bold text-foreground">أحدث الأسئلة</h2>
          </div>

          <Card className="border-border/50 bg-card/50">
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
              ) : recentQuestions?.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  لم يتم طرح أي أسئلة بعد.
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {recentQuestions?.map((q) => (
                    <Link 
                      key={q.id} 
                      href={`/documents/${q.documentId}`}
                      className="block p-4 hover:bg-muted/50 transition-colors group"
                    >
                      <p className="font-medium text-sm line-clamp-2 mb-2 group-hover:text-primary transition-colors">
                        "{q.question}"
                      </p>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="line-clamp-1 flex-1 ml-2">{q.documentTitle}</span>
                        <span className="shrink-0">{format(new Date(q.createdAt), "dd MMM", { locale: ar })}</span>
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
