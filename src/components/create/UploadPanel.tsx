import { saveMaterial } from "../../lib/materialStore";
import {
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";

import {
  AlertCircle,
  Check,
  FileText,
  FileUp,
  Loader2,
} from "lucide-react";

// ==========================================
// TYPES
// ==========================================

type UploadResult = {
  text: string;
  sourceLabel: string;
  materialId: string;
};

type UploadPanelProps = {
  onReady: (result: UploadResult | null) => void;
};

type UploadStatus = "idle" | "reading" | "saving" | "ready";
// ==========================================
// CONFIGURATION
// ==========================================

const ALLOWED = ["pdf", "docx", "txt"];

const MAX_FILE_SIZE = 15 * 1024 * 1024;

const STEPS = [
  "Choose file",
  "Extract text",
  "Ready to generate",
];

// ==========================================
// FORMAT FILE SIZE
// ==========================================

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ==========================================
// PDF TEXT EXTRACTION
// ==========================================

async function extractPdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");

  const worker = await import(
    "pdfjs-dist/build/pdf.worker.min.mjs?url"
  );

  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const buffer = await file.arrayBuffer();

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
  });

  const pdf = await loadingTask.promise;

  const pages: string[] = [];

  try {
    for (
      let pageNumber = 1;
      pageNumber <= pdf.numPages;
      pageNumber++
    ) {
      const page = await pdf.getPage(pageNumber);

      const content = await page.getTextContent();

      let pageText = "";

      for (const item of content.items) {
        if ("str" in item) {
          pageText += item.str;
          pageText += item.hasEOL ? "\n" : " ";
        }
      }

      if (pageText.trim()) {
        pages.push(pageText.trim());
      }

      page.cleanup();
    }
  } finally {
  await loadingTask.destroy();
}

  return pages.join("\n\n");
}

// ==========================================
// WORD DOCUMENT EXTRACTION
// ==========================================

async function extractDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth");

  const result = await mammoth.extractRawText({
    arrayBuffer: await file.arrayBuffer(),
  });

  return result.value;
}

// ==========================================
// EXTRACT TEXT BASED ON FILE TYPE
// ==========================================

async function extractFileText(
  file: File,
  extension: string
): Promise<string> {
  switch (extension) {
    case "txt":
      return file.text();

    case "pdf":
      return extractPdf(file);

    case "docx":
      return extractDocx(file);

    default:
      throw new Error("Unsupported file format.");
  }
}

// ==========================================
// MAIN UPLOAD PANEL
// ==========================================

export default function UploadPanel({
  onReady,
}: UploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);

  const [status, setStatus] =
    useState<UploadStatus>("idle");

  const [file, setFile] = useState<File | null>(null);

  const [characters, setCharacters] = useState(0);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

const busy =
  status === "reading" ||
  status === "saving";

  // ========================================
  // PROCESS UPLOADED FILE
  // ========================================

  async function processFile(picked?: File) {
    if (!picked || processingRef.current) return;

    onReady(null);

    setFile(null);
    setCharacters(0);
    setError("");
    setStatus("idle");

    const extension =
      picked.name.split(".").pop()?.toLowerCase() ?? "";

    if (!ALLOWED.includes(extension)) {
      setError(
        "Only PDF, Word (.docx), and TXT files are supported."
      );
      return;
    }

    if (picked.size > MAX_FILE_SIZE) {
      setError(
        "That file is larger than 15 MB. Split it and try again."
      );
      return;
    }

    if (picked.size === 0) {
      setError("The selected file is empty.");
      return;
    }

    processingRef.current = true;

    setFile(picked);
    setStatus("reading");

    try {
      const text = (
        await extractFileText(picked, extension)
      ).trim();

      if (!text) {
        throw new Error(
          extension === "pdf"
            ? "No readable text found. Scanned PDFs may require OCR."
            : "No readable text found in this file."
        );
      }

      setStatus("saving");

const material = await saveMaterial(picked, text);

setCharacters(text.length);
setStatus("ready");

onReady({
  text,
  sourceLabel: picked.name,
  materialId: material.id,
});
    } catch (err) {
      console.error("Text extraction failed:", err);

      setStatus("idle");

      setError(
        err instanceof Error
          ? err.message
          : "The file could not be processed."
      );
    } finally {
      processingRef.current = false;
    }
  }

  // ========================================
  // BROWSE FILE
  // ========================================

  function handlePick(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const picked = event.target.files?.[0];

    event.target.value = "";

    void processFile(picked);
  }

  // ========================================
  // DRAG AND DROP
  // ========================================

  function handleDrop(
    event: DragEvent<HTMLDivElement>
  ) {
    event.preventDefault();

    setDragging(false);

    if (!busy) {
      void processFile(event.dataTransfer.files[0]);
    }
  }

  const activeStep =
    status === "ready"
      ? 2
      : status === "reading"
        ? 1
        : 0;

  // ========================================
  // UPLOAD PANEL UI
  // ========================================

  return (
    <div className="space-y-4">

      {/* FILE DROP ZONE */}

      <div
        onDragOver={(event) => {
          event.preventDefault();

          if (!busy) {
            setDragging(true);
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`rounded-xl border border-dashed px-5 py-9 text-center transition-colors ${
          dragging
            ? "border-primary/70 bg-primary/[0.07]"
            : status === "ready"
              ? "border-primary/40 bg-primary/[0.04]"
              : "border-border bg-background/40"
        }`}
      >
        {/* FILE INPUT */}

        <input
          ref={inputRef}
          id="material-file"
          type="file"
          accept=".pdf,.docx,.txt"
          onChange={handlePick}
          className="sr-only"
        />

        {/* UPLOAD ICON */}

        <span
          className={`mx-auto mb-3 grid h-11 w-11 place-items-center rounded-lg border ${
            status === "ready"
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border bg-card text-muted-foreground"
          }`}
        >
          {status === "ready" ? (
            <Check className="h-5 w-5" />
          ) : busy ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : (
            <FileUp className="h-5 w-5" />
          )}
        </span>

        {/* FILE NAME */}

        {file ? (
          <p className="flex items-center justify-center gap-2 text-[13.5px] font-medium text-foreground">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />

            <span className="truncate">
              {file.name}
            </span>
          </p>
        ) : (
          <p className="text-[13.5px] font-medium text-foreground">
            Drop your file here
          </p>
        )}

        {/* STATUS MESSAGE */}

        <p className="mt-1 text-xs text-muted-foreground">
          {status === "reading"
            ? "Reading and extracting text from your file…"
            : status === "ready" && file
              ? `${formatBytes(file.size)} · ${characters.toLocaleString()} characters extracted`
              : "PDF, Word (.docx), or TXT · up to 15 MB"}
        </p>

        <p className="mt-1 text-[11px] text-muted-foreground">
          Processed locally · cloud storage not connected yet
        </p>

        {/* BROWSE BUTTON */}

        <div className="mt-4 flex items-center justify-center gap-2">

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="btn btn-secondary btn-sm"
          >
            {file
              ? "Choose another file"
              : "Browse files"}
          </button>

          {status === "ready" && (
            <span className="text-xs text-muted-foreground">
              Ready for the reviewer
            </span>
          )}
        </div>
      </div>

      {/* PROGRESS INDICATORS */}

      {status !== "idle" && (
        <ol className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1">
          {STEPS.map((label, index) => {
            const done =
              status === "ready" || index < activeStep;

            const active =
              status !== "ready" &&
              index === activeStep;

            return (
              <li
                key={label}
                className="flex items-center gap-1.5 text-xs"
              >
                <span
                  className={`grid h-4 w-4 place-items-center rounded-full border ${
                    done
                      ? "border-primary bg-primary text-primary-foreground"
                      : active
                        ? "border-primary/60 text-primary"
                        : "border-border text-muted-foreground"
                  }`}
                >
                  {done ? (
                    <Check className="h-2.5 w-2.5" />
                  ) : active ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  ) : null}
                </span>

                <span
                  className={
                    done || active
                      ? "text-foreground/85"
                      : "text-muted-foreground"
                  }
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {/* ERROR MESSAGE */}

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-[13px] text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />

          <span>{error}</span>
        </p>
      )}

    </div>
  );
}
