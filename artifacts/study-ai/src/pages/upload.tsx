import { useState, useRef, useCallback, useEffect } from "react";
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
  BookOpen,
  FileQuestion,
  Image as ImageIcon,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListDocumentsQueryKey,
  getListQuestionSheetsQueryKey,
  getGetStatsQueryKey,
  Document,
  QuestionSheet,
} from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const MAX_DOC_SIZE = 25 * 1024 * 1024;
const MAX_SHEET_SIZE = 25 * 1024 * 1024;

type Mode = "doc" | "sheet";

export function Upload() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>(() => {
    if (typeof window === "undefined") return "doc";
    const params = new URLSearchParams(window.location.search);
    return params.get("mode") === "sheet" ? "sheet" : "doc";
  });
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFile(null);
    setTitle("");
  }, [mode]);

  const accept =
    mode === "doc" ? "application/pdf" : "application/pdf,image/*";

  const validate = (selectedFile: File): boolean => {
    if (mode === "doc") {
      if (selectedFile.type !== "application/pdf") {
        toast.error("في وضع المستند يُقبل ملف PDF فقط");
        return false;
      }
      if (selectedFile.size > MAX_DOC_SIZE) {
        toast.error("حجم الملف يجب أن لا يتجاوز 25 ميجابايت");
        return false;
      }
      return true;
    }
    const isImage = selectedFile.type.startsWith("image/");
    const isPdf = selectedFile.type === "application/pdf";
    if (!isImage && !isPdf) {
      toast.error("يجب أن يكون الملف صورة أو PDF");
      return false;
    }
    if (selectedFile.size > MAX_SHEET_SIZE) {
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
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
      }
    },
    [mode],
  );

  const handleUpload = async () => {
    if (!file || !title.trim()) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title.trim());
    const endpoint =
      mode === "doc"
        ? `${import.meta.env.BASE_URL}api/documents`
        : `${import.meta.env.BASE_URL}api/question-sheets`;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("فشل الرفع");
      if (mode === "doc") {
        const doc: Document = await response.json();
        toast.success("تم رفع المستند بنجاح");
        queryClient.invalidateQueries({
          queryKey: getListDocumentsQueryKey(),
        });
        queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
        setLocation(`/documents/${doc.id}`);
      } else {
        const sheet: QuestionSheet = await response.json();
        toast.success("تم رفع ورقة الأسئلة، جاري الاستخراج…");
        queryClient.invalidateQueries({
          queryKey: getListQuestionSheetsQueryKey(),
        });
        queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
        setLocation(`/sheets/${sheet.id}`);
      }
    } catch {
      toast.error("حدث خطأ أثناء الرفع. حاول مرة أخرى.");
      setIsUploading(false);
    }
  };

  const isImageSheet = mode === "sheet" && file?.type.startsWith("image/");

  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            رفع جديد
          </h1>
          <p className="text-muted-foreground">
            اختر ما تريد: كتاب لطرح الأسئلة، أو ورقة أسئلة لاستخراج إجاباتها
          </p>
        </div>

        {/* Mode picker */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ModeOption
            active={mode === "doc"}
            onClick={() => setMode("doc")}
            icon={BookOpen}
            title="كتاب أو مذكرة"
            description="ارفع PDF واسأل ما تريد عنه. يقتبس لك الأدلة من المحتوى."
            badge="PDF"
          />
          <ModeOption
            active={mode === "sheet"}
            onClick={() => setMode("sheet")}
            icon={FileQuestion}
            title="ورقة أسئلة"
            description="ارفع صورة أو PDF لورقة امتحان. نستخرج كل الأسئلة ونجيبها."
            badge="صورة / PDF"
          />
        </div>

        <Card className="border-2 border-border/60 overflow-hidden">
          <CardContent className="p-6 space-y-6">
            <AnimatePresence mode="wait">
              {!file ? (
                <motion.div
                  key={`drop-${mode}`}
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
                    accept={accept}
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
                    {mode === "doc"
                      ? "اسحب وأفلت ملف PDF هنا"
                      : "اسحب وأفلت صورة أو PDF هنا"}
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
                  <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-4 items-start p-4 bg-muted/40 rounded-xl border border-border">
                    {isImageSheet ? (
                      <img
                        src={URL.createObjectURL(file)}
                        alt="معاينة"
                        className="w-full md:w-32 h-32 object-cover rounded-lg border border-border"
                      />
                    ) : (
                      <div className="bg-primary/10 p-3 rounded-lg w-fit">
                        {file.type.startsWith("image/") ? (
                          <ImageIcon className="h-7 w-7 text-primary" />
                        ) : (
                          <File className="h-7 w-7 text-primary" />
                        )}
                      </div>
                    )}
                    <div className="space-y-1 min-w-0">
                      <p className="font-medium text-sm line-clamp-2 break-all">
                        {file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / (1024 * 1024)).toFixed(2)} MB •{" "}
                        {file.type || "ملف"}
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
                      placeholder={
                        mode === "doc"
                          ? "أدخل عنواناً للمستند…"
                          : "أدخل عنواناً لورقة الأسئلة…"
                      }
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
                        {mode === "doc"
                          ? "بدء المذاكرة"
                          : "استخراج الأسئلة وحلّها"}
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

function ModeOption({
  active,
  onClick,
  icon: Icon,
  title,
  description,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  badge: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-right rounded-2xl border-2 p-4 transition-all flex gap-3 items-start",
        active
          ? "border-primary bg-primary/5 shadow-md"
          : "border-border hover:border-primary/40 hover:bg-muted/40",
      )}
    >
      <div
        className={cn(
          "p-2.5 rounded-lg shrink-0 transition-colors",
          active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-bold text-sm">{title}</h3>
          <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium">
            {badge}
          </span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {description}
        </p>
      </div>
    </button>
  );
}
