
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
  Camera,
  Check,
  FileText,
  FileUp,
  Images,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
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
  return file.name
    .split(".")
    .pop()
    ?.toLowerCase() ?? "";
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

async function extractPdf(file: File): Promise<string> {
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

// ==========================================
// DOCX TEXT EXTRACTION
// ==========================================

async function extractDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth");

  const result = await mammoth.extractRawText({
    arrayBuffer: await file.arrayBuffer(),
  });

  return result.value;
}

// ==========================================
// COMPONENT
// ==========================================

export default function UploadPanel({
  onReady,
}: UploadPanelProps) {
  const replaceInputRef =
    useRef<HTMLInputElement>(null);

  const addInputRef =
    useRef<HTMLInputElement>(null);

  const cameraInputRef =
    useRef<HTMLInputElement>(null);

  const processingRef = useRef(false);
  const filesRef = useRef<File[]>([]);

  const readyResultRef =
    useRef<UploadResult | null>(null);

  const photoCounterRef = useRef(0);

  // ========================================
  // STATE
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

  const isImageSelection =
    files.length > 0 &&
    files.every(isImageFile);

  const totalSize = files.reduce(
    (sum, file) => sum + file.size,
    0
  );

  function updateFiles(nextFiles: File[]) {
    filesRef.current = nextFiles;
    setFiles(nextFiles);
  }

  // ========================================
  // PROCESS FILES
  // ========================================

  async function processFiles(
    pickedFiles: File[],
    mode: PickMode
  ) {
    if (
      pickedFiles.length === 0 ||
      processingRef.current
    ) {
      return;
    }

    setError("");

    // Sort each selected batch by filename.
    // Previously uploaded images remain
    // in their original page order.

    const orderedPicked =
      pickedFiles.every(isImageFile)
        ? [...pickedFiles].sort((a, b) =>
            filenameSorter.compare(
              a.name,
              b.name
            )
          )
        : [...pickedFiles];

    const selected: File[] =
      mode === "append"
        ? [...filesRef.current]
        : [];

    let added = 0;

    for (const file of orderedPicked) {
      if (
        mode === "append" &&
        selected.some((existing) =>
          isSameFile(existing, file)
        )
      ) {
        continue;
      }

      selected.push(file);
      added++;
    }

    if (added === 0) {
      setError(
        "These images are already selected."
      );
      return;
    }

    // ======================================
    // VALIDATION
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

    if (
      selected.length > 1 &&
      !selected.every(isImageFile)
    ) {
      setError(
        "Only JPG/PNG images can be combined. Upload PDF, DOCX or TXT individually."
      );
      return;
    }

    if (
      selected.length > MAX_IMAGE_FILES
    ) {
      setError(
        `Maximum of ${MAX_IMAGE_FILES} images per reviewer.`
      );
      return;
    }

    const empty = selected.find(
      (file) => file.size === 0
    );

    if (empty) {
      setError(
        `${empty.name} is empty.`
      );
      return;
    }

    const oversized = selected.find(
      (file) =>
        file.size > MAX_FILE_SIZE
    );

    if (oversized) {
      setError(
        `${oversized.name} exceeds the 15 MB file limit.`
      );
      return;
    }

    const combinedSize = selected.reduce(
      (sum, file) => sum + file.size,
      0
    );

    if (
      selected.every(isImageFile) &&
      combinedSize > MAX_IMAGE_BATCH_SIZE
    ) {
      setError(
        "The combined image size must not exceed 60 MB."
      );
      return;
    }

    const firstFile = selected[0];

    if (!firstFile) {
      return;
    }

    // ======================================
    // SAVE PREVIOUS VALID SELECTION
    // ======================================

    const previousFiles = [
      ...filesRef.current,
    ];

    const previousResult =
      readyResultRef.current;

    const previousCharacters =
      characters;

    const previousVisualCount =
      visualCount;

    // Reuse previously processed images
    // when adding another photo.

    const previousImageMap =
      new Map<File, VisualPage>();

    if (
      mode === "append" &&
      previousResult?.visuals &&
      previousResult.visuals.length ===
        previousFiles.length &&
      previousFiles.every(isImageFile)
    ) {
      previousFiles.forEach((file, index) => {
        const visual =
          previousResult.visuals?.[index];

        if (visual) {
          previousImageMap.set(
            file,
            visual
          );
        }
      });
    }

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
      let visuals: VisualPage[] = [];

      const extension =
        getExtension(firstFile);

      // ====================================
      // PDF
      // ====================================

      if (extension === "pdf") {
        text = await extractPdf(firstFile);

        visuals = await extractPdfVisuals(
          firstFile
        );
      }

      // ====================================
      // DOCX
      // ====================================

      else if (extension === "docx") {
        text = await extractDocx(firstFile);
      }

      // ====================================
      // TXT
      // ====================================

      else if (extension === "txt") {
        text = await firstFile.text();
      }

      // ====================================
      // JPG / PNG / CAMERA PHOTOS
      // ====================================

      else {
        const images: VisualPage[] = [];

        for (
          let index = 0;
          index < selected.length;
          index++
        ) {
          const imageFile =
            selected[index];

          if (!imageFile) {
            continue;
          }

          const cached =
            previousImageMap.get(
              imageFile
            );

          if (cached) {
            images.push({
              ...cached,
              pageNumber: index + 1,
            });
          } else {
            const image =
              await extractImageVisual(
                imageFile
              );

            images.push({
              pageNumber: index + 1,
              mimeType: image.mimeType,
              dataUrl: image.dataUrl,
            });
          }

          setProcessedImages(
            index + 1
          );
        }

        visuals = images;
      }

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
      // SAVE SINGLE FILE TO MATERIALS
      // ====================================

      // Scanned PDFs and single photos
      // are saved even when no extracted
      // text is available.

      let materialId: string | null =
        null;

      if (
        selected.length === 1 &&
        (text.length > 0 ||
          visuals.length > 0)
      ) {
        setStatus("saving");

        const material =
          await saveMaterial(
            firstFile,
            text
          );

        materialId = material.id;
      }

      // ====================================
      // RESULT
      // ====================================

      const sourceLabel =
        selected.length === 1
          ? firstFile.name
          : `${selected.length} images (${firstFile.name} - ${
              selected[
                selected.length - 1
              ]?.name ?? firstFile.name
            })`;

      const result: UploadResult = {
        text,
        sourceLabel,
        materialId,
        visuals,
      };

      readyResultRef.current = result;

      setCharacters(text.length);
      setVisualCount(visuals.length);
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

      if (previousResult) {
        readyResultRef.current =
          previousResult;

        updateFiles(previousFiles);

        setCharacters(
          previousCharacters
        );

        setVisualCount(
          previousVisualCount
        );

        setStatus("ready");

        onReady(previousResult);
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
  // UPLOAD FILES
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
  // ADD MORE IMAGES
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
  // CAMERA PHOTO CAPTURE
  // ========================================

  function handleCamera(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const capturedFile =
      event.target.files?.[0];

    event.target.value = "";

    if (!capturedFile) {
      return;
    }

    // Camera files may have generic names.
    // Give JPEG/PNG photos a unique name
    // to preserve each captured page.

    const fileType =
      capturedFile.type.toLowerCase();

    const originalExtension =
      getExtension(capturedFile);

    const supportedCameraImage =
      IMAGE_EXTENSIONS.has(
        originalExtension
      ) ||
      fileType === "image/jpeg" ||
      fileType === "image/png";

    if (!supportedCameraImage) {
      setError(
        "This camera image format is not supported. Please use JPG or PNG."
      );
      return;
    }

    const extension =
      fileType === "image/png" ||
      (
        !fileType &&
        originalExtension === "png"
      )
        ? "png"
        : "jpg";

    photoCounterRef.current += 1;

    const photoNumber =
      String(
        photoCounterRef.current
      ).padStart(3, "0");

    const photo = new File(
      [capturedFile],
      `lesson-photo-${photoNumber}.${extension}`,
      {
        type:
          capturedFile.type ||
          (extension === "png"
            ? "image/png"
            : "image/jpeg"),
        lastModified:
          capturedFile.lastModified,
      }
    );

    // If current selection contains images,
    // add the new photo as the next page.
    //
    // If current selection is a PDF/DOCX/TXT,
    // start a new image selection.

    const canAppend =
      filesRef.current.length > 0 &&
      filesRef.current.every(
        isImageFile
      );

    void processFiles(
      [photo],
      canAppend
        ? "append"
        : "replace"
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

    if (picked.length === 0) {
      return;
    }

    const canAppend =
      filesRef.current.length > 0 &&
      filesRef.current.every(isImageFile) &&
      picked.every(isImageFile);

    void processFiles(
      picked,
      canAppend
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
  // UI STATE
  // ========================================

  const activeStep =
    status === "ready"
      ? 2
      : busy
        ? 1
        : 0;

  const progress =
    isImageSelection &&
    files.length > 0
      ? (processedImages /
          files.length) *
        100
      : 0;

  const imageLimitReached =
    isImageSelection &&
    files.length >=
      MAX_IMAGE_FILES;

  // ========================================
  // RENDER
  // ========================================

  return (
    <div className="space-y-4">
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
        className={`rounded-xl border border-dashed px-5 py-8 text-center transition-colors ${
          dragging
            ? "border-primary/70 bg-primary/[0.07]"
            : status === "ready"
              ? "border-primary/40 bg-primary/[0.04]"
              : "border-border bg-background/40"
        }`}
      >
        {/* ==================================
            HIDDEN FILE INPUTS
        ================================== */}

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

        <input
          ref={addInputRef}
          id="material-images-add"
          type="file"
          accept=".jpg,.jpeg,.png"
          multiple
          onChange={handleAddImages}
          disabled={
            busy || imageLimitReached
          }
          className="sr-only"
        />

        {/* Opens the device's native
            camera when supported. */}

        <input
          ref={cameraInputRef}
          id="material-camera"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleCamera}
          disabled={
            busy || imageLimitReached
          }
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
          ) : isImageSelection ? (
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
              Add your study material
            </p>
          )}
        </div>

        {/* ==================================
            DETAILS
        ================================== */}

        <p className="mt-2 text-xs text-muted-foreground">
          {status === "reading" &&
          isImageSelection
            ? `Processing image ${processedImages} of ${files.length}...`
            : status === "reading"
              ? "Processing document and visuals..."
              : status === "saving"
                ? "Saving extracted content..."
                : status === "ready"
                  ? `${formatBytes(totalSize)} · ${characters.toLocaleString()} characters · ${visualCount} visual pages`
                  : "Upload a file or take a picture of your lesson"}
        </p>

        {/* ==================================
            PROGRESS
        ================================== */}

        {busy && isImageSelection && (
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
              {Math.round(progress)}%
              of images processed
            </p>
          </div>
        )}

        {/* ==================================
            MAIN ACTION BUTTONS
        ================================== */}

        <div className="mx-auto mt-5 grid max-w-sm grid-cols-2 gap-2">
          {/* UPLOAD FILES */}

          <button
            type="button"
            onClick={() =>
              replaceInputRef.current?.click()
            }
            disabled={busy}
            className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-3 text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload className="h-5 w-5 text-primary" />

            <span className="text-xs font-medium">
              Upload Files
            </span>

            <span className="text-[10px] text-muted-foreground">
              PDF, DOCX, TXT, Images
            </span>
          </button>

          {/* TAKE PHOTO */}

          <button
            type="button"
            onClick={() =>
              cameraInputRef.current?.click()
            }
            disabled={
              busy || imageLimitReached
            }
            className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-3 text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Camera className="h-5 w-5 text-primary" />

            <span className="text-xs font-medium">
              Take Photo
            </span>

            <span className="text-[10px] text-muted-foreground">
              Camera / Capture
            </span>
          </button>
        </div>

        {/* ==================================
            ADD / REPLACE / CLEAR
        ================================== */}

        {files.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {isImageSelection &&
              !imageLimitReached && (
                <button
                  type="button"
                  onClick={() =>
                    addInputRef.current?.click()
                  }
                  disabled={busy}
                  className="btn btn-secondary btn-sm"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add more images
                </button>
              )}

            <button
              type="button"
              onClick={() =>
                replaceInputRef.current?.click()
              }
              disabled={busy}
              className="btn btn-secondary btn-sm"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Replace files
            </button>

            <button
              type="button"
              onClick={clearSelection}
              disabled={busy}
              className="btn btn-ghost btn-sm"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </button>
          </div>
        )}

        {/* ==================================
            READY MESSAGE
        ================================== */}

        {status === "ready" && (
          <p className="mt-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5" />
              Files processed and ready for AI
            </span>
          </p>
        )}

        {/* ==================================
            IMAGE COUNT
        ================================== */}

        {isImageSelection &&
          files.length > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {files.length}/{MAX_IMAGE_FILES} images
              {" · "}
              You can keep taking photos
              to add more pages.
            </p>
          )}

        {imageLimitReached && (
          <p className="mt-2 text-xs text-muted-foreground">
            Maximum of 30 images reached.
          </p>
        )}

        {!files.length && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Up to 30 JPG/PNG images per reviewer
          </p>
        )}
      </div>

      {/* ====================================
          UPLOAD STEPS
      ==================================== */}

      {status !== "idle" && (
        <ol className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1">
          {STEPS.map((label, index) => {
            const done =
              status === "ready" ||
              index < activeStep;

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
