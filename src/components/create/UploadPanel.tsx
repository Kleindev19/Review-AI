
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
  Images,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";

// ==========================================
// TYPES
// ==========================================

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

type PickMode = "replace" | "append";

// ==========================================
// CONFIGURATION
// ==========================================

const ALLOWED = new Set([
  "pdf",
  "docx",
  "txt",
  "jpg",
  "jpeg",
  "png",
]);

const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
]);

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MAX_IMAGE_FILES = 30;
const MAX_IMAGE_BATCH_SIZE = 60 * 1024 * 1024;

const STEPS = [
  "Choose files",
  "Process content",
  "Ready to generate",
];

const filenameSorter = new Intl.Collator(
  undefined,
  {
    numeric: true,
    sensitivity: "base",
  }
);

// ==========================================
// HELPERS
// ==========================================

function getExtension(file: File): string {
  return (
    file.name
      .split(".")
      .pop()
      ?.toLowerCase() ?? ""
  );
}

function isImageFile(file: File): boolean {
  return IMAGE_EXTENSIONS.has(
    getExtension(file)
  );
}

function isSameFile(a: File, b: File): boolean {
  return (
    a.name === b.name &&
    a.size === b.size &&
    a.lastModified === b.lastModified
  );
}

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

async function extractPdf(
  file: File
): Promise<string> {
  const pdfjs = await import("pdfjs-dist");

  const worker = await import(
    "pdfjs-dist/build/pdf.worker.min.mjs?url"
  );

  pdfjs.GlobalWorkerOptions.workerSrc =
    worker.default;

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(
      await file.arrayBuffer()
    ),
  });

  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  try {
    for (
      let pageNumber = 1;
      pageNumber <= pdf.numPages;
      pageNumber++
    ) {
      const page = await pdf.getPage(
        pageNumber
      );

      try {
        const content =
          await page.getTextContent();

        let pageText = "";

        for (const item of content.items) {
          if ("str" in item) {
            pageText += item.str;
            pageText += item.hasEOL
              ? "\n"
              : " ";
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

// ==========================================
// DOCX TEXT EXTRACTION
// ==========================================

async function extractDocx(
  file: File
): Promise<string> {
  const mammoth = await import("mammoth");

  const result =
    await mammoth.extractRawText({
      arrayBuffer:
        await file.arrayBuffer(),
    });

  return result.value;
}

// ==========================================
// UPLOAD PANEL
// ==========================================

export default function UploadPanel({
  onReady,
}: UploadPanelProps) {
  // Main picker accepts all supported files.
  // Add picker accepts images only.

  const replaceInputRef =
    useRef<HTMLInputElement>(null);

  const addInputRef =
    useRef<HTMLInputElement>(null);

  const processingRef = useRef(false);

  // Preserve selected files between
  // consecutive file-picker selections.

  const filesRef = useRef<File[]>([]);

  const readyResultRef =
    useRef<UploadResult | null>(null);

  // ========================================
  // STATES
  // ========================================

  const [status, setStatus] =
    useState<UploadStatus>("idle");

  const [files, setFiles] =
    useState<File[]>([]);

  const [characters, setCharacters] =
    useState(0);

  const [visualCount, setVisualCount] =
    useState(0);

  const [processedImages, setProcessedImages] =
    useState(0);

  const [error, setError] =
    useState("");

  const [dragging, setDragging] =
    useState(false);

  const busy =
    status === "reading" ||
    status === "saving";

  const imageSelection =
    files.length > 0 &&
    files.every(isImageFile);

  const totalSize = files.reduce(
    (sum, file) => sum + file.size,
    0
  );

  // ========================================
  // UPDATE SELECTED FILES
  // ========================================

  function updateFiles(next: File[]) {
    filesRef.current = next;
    setFiles(next);
  }

  // ========================================
  // PROCESS FILES
  // REPLACE OR APPEND MODE
  // ========================================

  async function processFiles(
    pickedFiles: File[],
    mode: PickMode
  ) {
    if (
      !pickedFiles.length ||
      processingRef.current
    ) {
      return;
    }

    setError("");

    // ======================================
    // MERGE IMAGES WHEN APPENDING
    // ======================================

    let selected =
      mode === "append"
        ? [...filesRef.current]
        : [];

    let added = 0;

    for (const file of pickedFiles) {
      // Prevent duplicate files when adding.

      if (
        mode === "append" &&
        selected.some((item) =>
          isSameFile(item, file)
        )
      ) {
        continue;
      }

      selected.push(file);
      added++;
    }

    if (added === 0) {
      setError(
        "Those images are already selected. Choose different images."
      );
      return;
    }

    // ======================================
    // VALIDATE FILE TYPES
    // ======================================

    const unsupported = selected.find(
      (file) =>
        !ALLOWED.has(getExtension(file))
    );

    if (unsupported) {
      setError(
        `Unsupported file: ${unsupported.name}. Use PDF, DOCX, TXT, JPG or PNG.`
      );
      return;
    }

    // Documents can only be selected
    // one at a time.

    if (
      selected.length > 1 &&
      !selected.every(isImageFile)
    ) {
      setError(
        "Only JPG/PNG images can be uploaded together. Choose PDF, DOCX or TXT by itself."
      );
      return;
    }

    // ======================================
    // MAXIMUM IMAGE COUNT
    // ======================================

    if (
      selected.length > MAX_IMAGE_FILES
    ) {
      setError(
        `You can upload a maximum of ${MAX_IMAGE_FILES} images per reviewer. You currently selected ${selected.length}.`
      );
      return;
    }

    // ======================================
    // EMPTY FILE PROTECTION
    // ======================================

    const empty = selected.find(
      (file) => file.size === 0
    );

    if (empty) {
      setError(
        `${empty.name} is empty.`
      );
      return;
    }

    // ======================================
    // PER-FILE SIZE LIMIT
    // ======================================

    const oversized = selected.find(
      (file) =>
        file.size > MAX_FILE_SIZE
    );

    if (oversized) {
      setError(
        `${oversized.name} exceeds the 15 MB per-file limit.`
      );
      return;
    }

    // ======================================
    // TOTAL IMAGE BATCH LIMIT
    // ======================================

    const selectedBytes = selected.reduce(
      (sum, file) =>
        sum + file.size,
      0
    );

    if (
      selected.every(isImageFile) &&
      selectedBytes > MAX_IMAGE_BATCH_SIZE
    ) {
      setError(
        "Total image size must not exceed 60 MB."
      );
      return;
    }

    // ======================================
    // SORT IMAGES BY FILENAME
    // ======================================

    if (selected.every(isImageFile)) {
      selected = selected.sort(
        (a, b) =>
          filenameSorter.compare(
            a.name,
            b.name
          )
      );
    }

    const firstFile = selected[0];

    if (!firstFile) {
      return;
    }

    // ======================================
    // SAVE PREVIOUS SUCCESSFUL RESULT
    // ======================================

    // If processing a new image fails,
    // restore the previous valid upload.

    const previousFiles = [
      ...filesRef.current,
    ];

    const previousResult =
      readyResultRef.current;

    const previousCharacters =
      characters;

    const previousVisualCount =
      visualCount;

    // ======================================
    // BEGIN PROCESSING
    // ======================================

    processingRef.current = true;
    readyResultRef.current = null;

    onReady(null);

    updateFiles(selected);

    setCharacters(0);
    setVisualCount(0);
    setProcessedImages(0);

    setStatus("reading");

    try {
      let text = "";

      let visuals:
        VisualPage[] = [];

      const extension =
        getExtension(firstFile);

      // ====================================
      // PDF
      // ====================================

      if (extension === "pdf") {
        text = await extractPdf(
          firstFile
        );

        visuals =
          await extractPdfVisuals(
            firstFile
          );
      }

      // ====================================
      // DOCX
      // ====================================

      else if (extension === "docx") {
        text = await extractDocx(
          firstFile
        );
      }

      // ====================================
      // TXT
      // ====================================

      else if (extension === "txt") {
        text = await firstFile.text();
      }

      // ====================================
      // SINGLE OR MULTIPLE IMAGES
      // ====================================

      else {
        const images:
          VisualPage[] = [];

        for (
          let i = 0;
          i < selected.length;
          i++
        ) {
          const imageFile =
            selected[i];

          if (!imageFile) {
            continue;
          }

          const image =
            await extractImageVisual(
              imageFile
            );

          images.push({
            pageNumber: i + 1,
            mimeType:
              image.mimeType,
            dataUrl:
              image.dataUrl,
          });

          setProcessedImages(i + 1);
        }

        visuals = images;
      }

      // ====================================
      // VALIDATE EXTRACTED CONTENT
      // ====================================

      text = text.trim();

      if (
        !text &&
        visuals.length === 0
      ) {
        throw new Error(
          "No readable content was found in the selected files."
        );
      }

      // ====================================
      // SAVE EXTRACTED TEXT MATERIAL
      // ====================================

      
      // ====================================
      // SAVE MATERIAL TO INDEXEDDB
      // ====================================

      let materialId: string | null = null;

      // A scanned PDF can contain images
      // even when extracted text is empty.
      //
      // Save the original single file when
      // it has readable text or visual pages.
      //
      // Image batches are handled separately
      // because each image is a different file.

      const hasReadableContent =
        text.length > 0 ||
        visuals.length > 0;

      if (
        selected.length === 1 &&
        hasReadableContent
      ) {
        setStatus("saving");

        const material = await saveMaterial(
          firstFile,
          text
        );

        materialId = material.id;
      }


      // ====================================
      // SOURCE LABEL
      // ====================================

      const sourceLabel =
        selected.length === 1
          ? firstFile.name
          : `${selected.length} images (${firstFile.name} - ${
              selected[
                selected.length - 1
              ]?.name ?? firstFile.name
            })`;

      // ====================================
      // PREPARE UPLOAD RESULT
      // ====================================

      const result:
        UploadResult = {
        text,
        sourceLabel,
        materialId,
        visuals,
      };

      readyResultRef.current =
        result;

      setCharacters(
        text.length
      );

      setVisualCount(
        visuals.length
      );

      setStatus("ready");

      onReady(result);
    } catch (err) {
      console.error(
        "File processing failed:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "The selected files could not be processed."
      );

      // ====================================
      // RESTORE PREVIOUS RESULT
      // ====================================

      if (previousResult) {
        readyResultRef.current =
          previousResult;

        updateFiles(
          previousFiles
        );

        setCharacters(
          previousCharacters
        );

        setVisualCount(
          previousVisualCount
        );

        setStatus("ready");

        onReady(
          previousResult
        );
      } else {
        updateFiles([]);

        setCharacters(0);
        setVisualCount(0);

        setStatus("idle");

        onReady(null);
      }
    } finally {
      processingRef.current = false;
    }
  }

  // ========================================
  // MAIN FILE PICKER - REPLACE FILES
  // ========================================

  function handleReplace(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const picked = Array.from(
      event.target.files ?? []
    );

    event.target.value = "";

    void processFiles(
      picked,
      "replace"
    );
  }

  // ========================================
  // ADD MORE IMAGES - APPEND FILES
  // ========================================

  function handleAddImages(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const picked = Array.from(
      event.target.files ?? []
    );

    event.target.value = "";

    void processFiles(
      picked,
      "append"
    );
  }

  // ========================================
  // DRAG AND DROP
  // ========================================

  function handleDrop(
    event: DragEvent<HTMLDivElement>
  ) {
    event.preventDefault();

    setDragging(false);

    if (processingRef.current) {
      return;
    }

    const picked = Array.from(
      event.dataTransfer.files
    );

    // Append dropped images if
    // current selection is also images.

    const append =
      filesRef.current.length > 0 &&
      filesRef.current.every(
        isImageFile
      ) &&
      picked.every(
        isImageFile
      );

    void processFiles(
      picked,
      append
        ? "append"
        : "replace"
    );
  }

  // ========================================
  // CLEAR SELECTION
  // ========================================

  function clearSelection() {
    if (processingRef.current) {
      return;
    }

    readyResultRef.current = null;

    updateFiles([]);

    setCharacters(0);
    setVisualCount(0);
    setProcessedImages(0);

    setError("");
    setStatus("idle");

    onReady(null);
  }

  // ========================================
  // UI PROGRESS
  // ========================================

  const activeStep =
    status === "ready"
      ? 2
      : busy
        ? 1
        : 0;

  const progress =
    imageSelection &&
    files.length > 0
      ? (processedImages /
          files.length) *
        100
      : 0;

  // ========================================
  // RENDER
  // ========================================

  return (
    <div className="space-y-4">
      {/* ====================================
          UPLOAD AREA
      ==================================== */}

      <div
        onDragOver={(event) => {
          event.preventDefault();

          if (!busy) {
            setDragging(true);
          }
        }}
        onDragLeave={() =>
          setDragging(false)
        }
        onDrop={handleDrop}
        className={`rounded-xl border border-dashed px-5 py-9 text-center transition-colors ${
          dragging
            ? "border-primary/70 bg-primary/[0.07]"
            : status === "ready"
              ? "border-primary/40 bg-primary/[0.04]"
              : "border-border bg-background/40"
        }`}
      >
        {/* MAIN FILE PICKER */}

        <input
          ref={replaceInputRef}
          id="material-file"
          type="file"
          accept=".pdf,.docx,.txt,.jpg,.jpeg,.png"
          multiple
          onChange={handleReplace}
          disabled={busy}
          className="sr-only"
        />

        {/* ADD MORE IMAGES PICKER */}

        <input
          ref={addInputRef}
          id="material-images-add"
          type="file"
          accept=".jpg,.jpeg,.png"
          multiple
          onChange={handleAddImages}
          disabled={busy}
          className="sr-only"
        />

        {/* ==================================
            STATUS ICON
        ================================== */}

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
          ) : imageSelection ? (
            <Images className="h-5 w-5" />
          ) : (
            <FileUp className="h-5 w-5" />
          )}
        </span>

        {/* ==================================
            SELECTED FILES
        ================================== */}

        <div className="mt-3">
          {files.length > 1 ? (
            <>
              <p className="text-[13.5px] font-medium text-foreground">
                {files.length} images selected
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                {files[0]?.name} to{" "}
                {
                  files[
                    files.length - 1
                  ]?.name
                }
              </p>
            </>
          ) : files.length === 1 ? (
            <p className="flex items-center justify-center gap-2 text-[13.5px] font-medium text-foreground">
              <FileText className="h-4 w-4 shrink-0" />

              <span className="truncate">
                {files[0]?.name}
              </span>
            </p>
          ) : (
            <p className="text-[13.5px] font-medium text-foreground">
              Drop your files here
            </p>
          )}
        </div>

        {/* ==================================
            FILE DETAILS
        ================================== */}

        <p className="mt-2 text-xs text-muted-foreground">
          {status === "reading" &&
          imageSelection
            ? `Processing image ${processedImages} of ${files.length}...`
            : status === "reading"
              ? "Processing document and visuals..."
              : status === "saving"
                ? "Saving extracted content..."
                : status === "ready"
                  ? `${formatBytes(totalSize)} · ${characters.toLocaleString()} characters · ${visualCount} visual pages`
                  : "PDF, DOCX, TXT, or up to 30 JPG/PNG images"}
        </p>

        {/* ==================================
            IMAGE PROCESSING PROGRESS
        ================================== */}

        {busy && imageSelection && (
          <div className="mx-auto mt-4 max-w-xs">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{
                  width: `${progress}%`,
                }}
              />
            </div>

            <p className="mt-1.5 text-xs text-muted-foreground">
              {Math.round(
                progress
              )}
              % of images processed
            </p>
          </div>
        )}

        {/* ==================================
            UPLOAD BUTTONS
        ================================== */}

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {/* BROWSE / REPLACE */}

          <button
            type="button"
            onClick={() =>
              replaceInputRef.current?.click()
            }
            disabled={busy}
            className="btn btn-secondary btn-sm disabled:opacity-50"
          >
            {files.length > 0 ? (
              <>
                <RotateCcw className="h-3.5 w-3.5" />
                Replace files
              </>
            ) : (
              <>
                <FileUp className="h-3.5 w-3.5" />
                Browse files
              </>
            )}
          </button>

          {/* ADD IMAGES */}

          {imageSelection &&
            files.length <
              MAX_IMAGE_FILES && (
              <button
                type="button"
                onClick={() =>
                  addInputRef.current?.click()
                }
                disabled={busy}
                className="btn btn-secondary btn-sm disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Add more images
              </button>
            )}

          {/* CLEAR */}

          {files.length > 0 && (
            <button
              type="button"
              onClick={
                clearSelection
              }
              disabled={busy}
              className="btn btn-ghost btn-sm disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
        </div>

        {/* ==================================
            READY MESSAGE
        ================================== */}

        {status === "ready" && (
          <p
            className="mt-3 text-xs text-muted-foreground"
            role="status"
          >
            Files processed.{" "}
            {imageSelection
              ? "Add more images or generate your reviewer."
              : "Ready to generate your reviewer."}
          </p>
        )}

        {/* ==================================
            IMAGE COUNT
        ================================== */}

        {imageSelection &&
          files.length > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {files.length}/{MAX_IMAGE_FILES} images
              {" · "}
              Select several at once using Ctrl/Shift,
              or add them one by one.
            </p>
          )}
      </div>

      {/* ====================================
          UPLOAD STEPS
      ==================================== */}

      {status !== "idle" && (
        <ol className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1">
          {STEPS.map(
            (label, stepIndex) => {
              const done =
                status === "ready" ||
                stepIndex <
                  activeStep;

              const active =
                status !== "ready" &&
                stepIndex ===
                  activeStep;

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
            }
          )}
        </ol>
      )}

      {/* ====================================
          ERROR MESSAGE
      ==================================== */}

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
