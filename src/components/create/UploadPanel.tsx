
import { saveMaterial } from "../../lib/materialStore";
import { extractPdfVisuals } from "../../lib/pdfVisuals";
import { extractImageVisual } from "../../lib/imageVisuals";

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

type VisualPage = {
  pageNumber: number;
  mimeType: "image/jpeg";
  dataUrl: string;
};

type UploadResult = {
  text: string;
  sourceLabel: string;
  materialId: string | null;
  visuals?: VisualPage[];
};

type UploadPanelProps = {
  onReady: (result: UploadResult | null) => void;
};

type UploadStatus =
  | "idle"
  | "reading"
  | "saving"
  | "ready";

const ALLOWED = [
  "pdf",
  "docx",
  "txt",
  "jpg",
  "jpeg",
  "png",
];

const MAX_FILE_SIZE = 15 * 1024 * 1024;

const STEPS = [
  "Choose file",
  "Process content",
  "Ready to generate",
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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

      try {
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
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await loadingTask.destroy();
  }

  return pages.join("\n\n");
}

async function extractDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth");

  const result = await mammoth.extractRawText({
    arrayBuffer: await file.arrayBuffer(),
  });

  return result.value;
}

export default function UploadPanel({
  onReady,
}: UploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);

  const [status, setStatus] =
    useState<UploadStatus>("idle");

  const [file, setFile] = useState<File | null>(null);
  const [characters, setCharacters] = useState(0);
  const [visualCount, setVisualCount] = useState(0);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  const busy =
    status === "reading" ||
    status === "saving";

  async function processFile(picked?: File) {
    if (!picked || processingRef.current) return;

    onReady(null);
    setFile(null);
    setCharacters(0);
    setVisualCount(0);
    setError("");
    setStatus("idle");

    const extension =
      picked.name.split(".").pop()?.toLowerCase() ?? "";

    if (!ALLOWED.includes(extension)) {
      setError(
        "Only PDF, DOCX, TXT, JPG and PNG files are supported."
      );
      return;
    }

    if (picked.size > MAX_FILE_SIZE) {
      setError("File must be 15 MB or smaller.");
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
      let text = "";
      let visuals: VisualPage[] = [];

      if (extension === "pdf") {
        text = await extractPdf(picked);

        visuals = await extractPdfVisuals(picked);
      } else if (extension === "docx") {
        text = await extractDocx(picked);
      } else if (extension === "txt") {
        text = await picked.text();
      } else {
        const image = await extractImageVisual(picked);

        visuals = [
          {
            pageNumber: 1,
            mimeType: image.mimeType,
            dataUrl: image.dataUrl,
          },
        ];
      }

      text = text.trim();

      if (!text && visuals.length === 0) {
        throw new Error(
          "No readable content found in this file."
        );
      }

      setStatus("saving");

      let materialId: string | null = null;

      // Preserve existing local saving for text materials.
      // Visual-only storage will be added later.
      if (text) {
        const material = await saveMaterial(
          picked,
          text
        );

        materialId = material.id;
      }

      setCharacters(text.length);
      setVisualCount(visuals.length);
      setStatus("ready");

      onReady({
        text,
        sourceLabel: picked.name,
        materialId,
        visuals,
      });
    } catch (err) {
      console.error("File processing failed:", err);

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

  function handlePick(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const picked = event.target.files?.[0];

    event.target.value = "";
    void processFile(picked);
  }

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
      : status === "reading" || status === "saving"
        ? 1
        : 0;

  return (
    <div className="space-y-4">
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
        <input
          ref={inputRef}
          id="material-file"
          type="file"
          accept=".pdf,.docx,.txt,.jpg,.jpeg,.png"
          onChange={handlePick}
          className="sr-only"
        />

        <span
          className={`mx-auto grid h-11 w-11 place-items-center rounded-lg border ${
            status === "ready"
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border bg-card text-muted-foreground"
          }`}
        >
          {status === "ready" ? (
            <Check className="h-5 w-5" />
          ) : busy ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <FileUp className="h-5 w-5" />
          )}
        </span>

        <div className="mt-3">
          {file ? (
            <p className="flex items-center justify-center gap-2 text-[13.5px] font-medium text-foreground">
              <FileText className="h-4 w-4 shrink-0" />
              <span className="truncate">{file.name}</span>
            </p>
          ) : (
            <p className="text-[13.5px] font-medium text-foreground">
              Drop your file here
            </p>
          )}
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          {status === "reading"
            ? "Processing document and visuals..."
            : status === "saving"
              ? "Saving extracted content..."
              : status === "ready" && file
                ? `${formatBytes(file.size)} · ${characters.toLocaleString()} characters · ${visualCount} visual pages`
                : "PDF, DOCX, TXT, JPG or PNG · up to 15 MB"}
        </p>

        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="btn btn-secondary btn-sm"
          >
            {file ? "Choose another file" : "Browse files"}
          </button>

          {status === "ready" && (
            <span className="text-xs text-muted-foreground">
              File processed
            </span>
          )}
        </div>
      </div>

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

                <span className={
                  done || active
                    ? "text-foreground/85"
                    : "text-muted-foreground"
                }>
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
      )}

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
