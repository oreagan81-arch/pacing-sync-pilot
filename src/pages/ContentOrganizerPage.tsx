import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, FileText, Sparkles } from "lucide-react";
import { useState, useCallback } from "react";
import { toast } from "sonner";

interface ProcessedFile {
  original: string;
  renamed: string;
  status: "processing" | "done";
}

export default function ContentOrganizerPage() {
  const [files, setFiles] = useState<ProcessedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);

  const processFile = useCallback((file: File) => {
    const entry: ProcessedFile = {
      original: file.name,
      renamed: "",
      status: "processing",
    };
    setFiles((prev) => [...prev, entry]);

    // Simulate Gemini Vision rename
    setTimeout(() => {
      const smartName = file.name
        .replace(/ugly_scan|scan_|IMG_\d+/gi, "")
        .replace(/[_-]+/g, "_")
        .replace(/^_|_$/g, "");
      const base = smartName.replace(/\.pdf$/i, "");
      const renamed = `${base.charAt(0).toUpperCase() + base.slice(1)}_Processed.pdf`;
      setFiles((prev) =>
        prev.map((f) =>
          f.original === file.name ? { ...f, renamed, status: "done" } : f
        )
      );
      toast.success(`Renamed: ${file.name} \u2192 ${renamed}`);
    }, 2000);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const dropped = Array.from(e.dataTransfer.files).filter((f) =>
        f.name.toLowerCase().endsWith(".pdf")
      );
      if (dropped.length === 0) {
        toast.error("Only PDF files are accepted.");
        return;
      }
      dropped.forEach(processFile);
    },
    [processFile]
  );

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Content Organizer</h1>
        <p className="text-muted-foreground mt-1">
          Drop PDFs to auto-rename via AI vision analysis
        </p>
      </div>

      <Card
        className={`glass border-2 border-dashed transition-colors cursor-pointer ${
          dragActive ? "border-primary bg-primary/5" : "border-border"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="rounded-full bg-primary/10 p-4">
            <Upload className="h-8 w-8 text-primary" />
          </div>
          <div className="text-center">
            <p className="font-semibold">Drop PDF files here</p>
            <p className="text-sm text-muted-foreground mt-1">
              Files will be sent to Gemini Vision for smart renaming
            </p>
          </div>
        </CardContent>
      </Card>

      {files.length > 0 && (
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-base">Processed Files</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {files.map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border border-border p-3"
              >
                <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono truncate">{f.original}</p>
                  {f.status === "done" && (
                    <p className="text-sm text-success flex items-center gap-1 mt-0.5">
                      <Sparkles className="h-3 w-3" />
                      {f.renamed}
                    </p>
                  )}
                </div>
                {f.status === "processing" && (
                  <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                )}
                {f.status === "done" && (
                  <span className="text-xs text-success font-medium">Done</span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
