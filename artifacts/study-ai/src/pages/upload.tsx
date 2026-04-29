import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  UploadCloud,
  File,
  AlertCircle,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListDocumentsQueryKey,
  getGetStatsQueryKey,
  Document,
} from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const MAX_DOC_SIZE = 25 * 1024 * 1024;

export function Upload() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validate = (selectedFile: File): boolean => {
    if (selectedFile.type !== "application/pdf") {
      toast.error("يُقبل ملف PDF فقط");
      return false;
    }
    if (selectedFile.size > MAX_DOC_SIZE) {
      toast.error("حجم الملف يجب أن لا يتجاوز 25 ميجابايت");
      return false;
    }
    return true;
  };

  const handleFile = (selectedFile: File) => {
    if (!validate(selectedFile)) return;
    setFile(selectedFile);
    const defaultTitle = selectedFile.name.replace(/\.[^/.]+$/, "");
    setTitle(defaultTitle);
  };

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleUpload = async () => {
    if (!file || !title.trim()) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title.trim());
    try {
      const response = await fetch(
        `${import.meta.env.BASE_URL}api/documents`,
        { method: "POST", body: formData },
      );
      if (!response.ok) throw new Error("فشل الرفع");
      const doc: Document = await response.json();
      toast.success("تم رفع المستند بنجاح");
      queryClient.invalidateQueries({
        queryKey: getListDocumentsQueryKey(),
      });
      queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
      setLocation(`/documents/${doc.id}`);
    } catch {
      toast.error("حدث خطأ أثناء الرفع. حاول مرة أخرى.");
      setIsUploading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            رفع مستند جديد
          </h1>
          <p className="text-muted-foreground">
            ارفع كتاباً أو مذكرة بصيغة PDF لتبدأ في طرح الأسئلة عليها
          </p>
        </div>

        <Card className="border-2 border-border/60 overflow-hidden">
          <CardContent className="p-6 space-y-6">
            <AnimatePresence mode="wait">
              {!file ? (
                <motion.div
                  key="drop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className={cn(
                    "border-2 border-dashed rounded-2xl p-10 md:p-14 text-center transition-colors cursor-pointer",
                    isDragging
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50 hover:bg-muted/30",
                  )}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="application/pdf"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleFile(e.target.files[0]);
                      }
                    }}
                  />
                  <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <UploadCloud className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">
                    اسحب وأفلت ملف PDF هنا
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    أو انقر لاختيار ملف من جهازك
                  </p>
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <AlertCircle className="h-3 w-3" />
                    <span>الحد الأقصى 25 ميجابايت</span>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="file-details"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="grid grid-cols-[auto_1fr] gap-4 items-start p-4 bg-muted/40 rounded-xl border border-border">
                    <div className="bg-primary/10 p-3 rounded-lg w-fit">
                      <File className="h-7 w-7 text-primary" />
                    </div>
                    <div className="space-y-1 min-w-0">
                      <p className="font-medium text-sm line-clamp-2 break-all">
                        {file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-0 text-primary hover:bg-transparent hover:underline"
                        onClick={() => setFile(null)}
                        disabled={isUploading}
                      >
                        تغيير الملف
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="title">العنوان</Label>
                    <Input
                      id="title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="أدخل عنواناً للمستند…"
                      disabled={isUploading}
                    />
                  </div>

                  <Button
                    className="w-full gap-2"
                    size="lg"
                    onClick={handleUpload}
                    disabled={isUploading || !title.trim()}
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        جاري الرفع…
                      </>
                    ) : (
                      <>
                        بدء المذاكرة
                        <ArrowRight className="h-5 w-5 rtl:rotate-180" />
                      </>
                    )}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
