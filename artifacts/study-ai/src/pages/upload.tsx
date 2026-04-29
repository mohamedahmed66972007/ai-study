import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UploadCloud, File, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { getListDocumentsQueryKey, getGetStatsQueryKey, Document } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

export function Upload() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (selectedFile: File) => {
    if (selectedFile.type !== "application/pdf") {
      toast.error("يرجى اختيار ملف PDF فقط");
      return;
    }
    if (selectedFile.size > MAX_FILE_SIZE) {
      toast.error("حجم الملف يجب أن لا يتجاوز 25 ميجابايت");
      return;
    }
    setFile(selectedFile);
    // Auto-fill title without extension
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
      const response = await fetch(`${import.meta.env.BASE_URL}api/documents`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("فشل الرفع");
      }

      const doc: Document = await response.json();
      
      toast.success("تم رفع المستند بنجاح");
      queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
      
      setLocation(`/documents/${doc.id}`);
    } catch (error) {
      toast.error("حدث خطأ أثناء رفع المستند. حاول مرة أخرى.");
      setIsUploading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl">
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">رفع مستند جديد</h1>
          <p className="text-muted-foreground">قم برفع كتاب أو مذكرة بصيغة PDF لتبدأ المذاكرة الذكية</p>
        </div>

        <Card className="border-2">
          <CardContent className="p-6 space-y-6">
            <AnimatePresence mode="wait">
              {!file ? (
                <motion.div
                  key="dropzone"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
                    isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
                  }`}
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
                  <h3 className="text-lg font-semibold mb-2">اسحب وأفلت ملف PDF هنا</h3>
                  <p className="text-sm text-muted-foreground mb-4">أو انقر لاختيار ملف من جهازك</p>
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
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border border-border">
                    <div className="flex items-center gap-3">
                      <div className="bg-primary/10 p-2 rounded-lg">
                        <File className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm line-clamp-1">{file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(file.size / (1024 * 1024)).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setFile(null)}
                      disabled={isUploading}
                    >
                      تغيير الملف
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="title">عنوان المستند</Label>
                    <Input
                      id="title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="أدخل عنواناً للمستند..."
                      disabled={isUploading}
                    />
                  </div>

                  <Button 
                    className="w-full" 
                    size="lg" 
                    onClick={handleUpload}
                    disabled={isUploading || !title.trim()}
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        جاري الرفع...
                      </>
                    ) : (
                      "بدء المذاكرة"
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
