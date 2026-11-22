
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Link,
  useSearchParams,
} from "react-router-dom";

import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  Download,
  FileDown,
  Files,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  WifiOff,
  X,
} from "lucide-react";

import { supabase } from "../../lib/supabaseClient";

import {
  deleteOfflineReviewer,
  getAllOfflineReviewers,
  type OfflineReviewerRecord,
} from "../../lib/offlineReviewerStore";

import MathReviewerContent from "../../components/reviewer/MathReviewerContent";
import { printReviewerPdf } from "../../lib/printReviewerPdf";
import { getReviewerVisuals } from "../../lib/reviewerVisualReader";

// ==========================================
// TYPES
// ==========================================

type Reviewer = {
  id: string;
  user_id: string;
  title: string;
  subject: string | null;
  content: string | null;
  source_type: string;
  source_label: string | null;
  source_id: string | null;
  is_ai_generated: boolean;
  created_date: string;
  updated_date: string;
};

type Tab = "online" | "downloaded";

type ReviewerListItem = {
  id: string;
  title: string;
  subject: string | null;
  content: string | null;
  is_ai_generated: boolean;
  updated_date: string;
};

type CombineCandidate = ReviewerListItem & {
  source: "online" | "downloaded";
};

type CombinePanelProps = {
  onlineReviewers: Reviewer[];
  downloadedReviewers: OfflineReviewerRecord[];
  isOnline: boolean;
  onClose: () => void;
};

// ==========================================
// HELPERS
// ==========================================

function formatDate(
  date?: string | null
): string {
  if (!date) return "Unknown date";

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return "Unknown date";
  }

  return parsed.toLocaleDateString(
    "en-PH",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  );
}

function errorMessage(
  error: unknown,
  fallback: string
): string {
  return error instanceof Error
    ? error.message
    : fallback;
}

function blobToDataUrl(
  blob: Blob
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(
          new Error("Could not read a diagram.")
        );
      }
    };

    reader.onerror = () => {
      reject(
        new Error("Could not read a diagram.")
      );
    };

    reader.readAsDataURL(blob);
  });
}

function pdfNode<
  K extends keyof HTMLElementTagNameMap
>(
  tag: K,
  className: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;

  if (text !== undefined) {
    node.textContent = text;
  }

  return node;
}

// ==========================================
// COMBINE REVIEWERS PANEL
// ==========================================

function CombineReviewersPanel({
  onlineReviewers,
  downloadedReviewers,
  isOnline,
  onClose,
}: CombinePanelProps) {
  const [query, setQuery] = useState("");

  const [pdfTitle, setPdfTitle] =
    useState("My Combined Reviewer");

  const [selectedIds, setSelectedIds] =
    useState<string[]>([]);

  const [includeToc, setIncludeToc] =
    useState(true);

  // false: Reviewer Only
  // true: Include original source images
  const [includeDiagrams, setIncludeDiagrams] =
    useState(false);

  const [exporting, setExporting] =
    useState(false);

  const [progress, setProgress] =
    useState("");

  const [error, setError] =
    useState("");

  const renderRef =
    useRef<HTMLDivElement>(null);

  // ========================================
  // AVAILABLE REVIEWERS
  // ========================================

  const choices = useMemo(() => {
    const map = new Map<
      string,
      CombineCandidate
    >();

    for (const record of downloadedReviewers) {
      map.set(record.id, {
        ...record.reviewer,
        source: "downloaded",
      });
    }

    if (isOnline) {
      for (const reviewer of onlineReviewers) {
        map.set(reviewer.id, {
          ...reviewer,
          source: "online",
        });
      }
    }

    return [...map.values()].sort(
      (a, b) =>
        a.title.localeCompare(b.title)
    );
  }, [
    onlineReviewers,
    downloadedReviewers,
    isOnline,
  ]);

  // ========================================
  // SEARCH
  // ========================================

  const filtered = useMemo(() => {
    const needle = query
      .trim()
      .toLowerCase();

    return choices.filter((item) =>
      `${item.title} ${item.subject ?? ""}`
        .toLowerCase()
        .includes(needle)
    );
  }, [choices, query]);

  // ========================================
  // SELECTED REVIEWERS
  // ========================================

  const selected = useMemo(() => {
    const byId = new Map(
      choices.map((item) => [
        item.id,
        item,
      ])
    );

    return selectedIds
      .map((id) => byId.get(id))
      .filter(
        (item): item is CombineCandidate =>
          item !== undefined
      );
  }, [choices, selectedIds]);

  // ========================================
  // SELECT / UNSELECT
  // ========================================

  function toggle(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter(
            (item) => item !== id
          )
        : [...current, id]
    );

    setError("");
  }

  // ========================================
  // REORDER CHAPTERS
  // ========================================

  function move(
    id: string,
    offset: -1 | 1
  ) {
    setSelectedIds((current) => {
      const next = [...current];

      const index = next.indexOf(id);
      const target = index + offset;

      if (
        index < 0 ||
        target < 0 ||
        target >= next.length
      ) {
        return current;
      }

      [next[index], next[target]] = [
        next[target],
        next[index],
      ];

      return next;
    });
  }

  // ========================================
  // LOAD ORIGINAL SOURCE IMAGES
  // ========================================

  async function loadDiagrams(
    item: CombineCandidate
  ) {
    // DOWNLOADED SOURCE

    if (item.source === "downloaded") {
      const record =
        downloadedReviewers.find(
          (entry) => entry.id === item.id
        );

      if (!record) {
        throw new Error(
          `Offline diagrams missing: ${item.title}`
        );
      }

      return Promise.all(
        record.visuals.map(
          async ({ metadata, blob }) => ({
            pageNumber: metadata.pageNumber,
            dataUrl: await blobToDataUrl(blob),
          })
        )
      );
    }

    // CLOUD SOURCE

    const savedVisuals =
      await getReviewerVisuals(item.id);

    return Promise.all(
      savedVisuals.map(async (visual) => {
        const response = await fetch(visual.url);

        if (!response.ok) {
          throw new Error(
            `Could not load a diagram for ${item.title}.`
          );
        }

        return {
          pageNumber: visual.pageNumber,
          dataUrl: await blobToDataUrl(
            await response.blob()
          ),
        };
      })
    );
  }

  // ========================================
  // COMBINE AND DOWNLOAD PDF
  // ========================================

  async function combineAndDownload() {
    if (
      exporting ||
      selected.length < 2
    ) {
      return;
    }

    if (!pdfTitle.trim()) {
      setError("Please enter a PDF title.");
      return;
    }

    setExporting(true);
    setError("");
    setProgress("Preparing reviewer chapters...");

    try {
      const combined =
        document.createElement("div");

      const style =
        document.createElement("style");

      style.textContent = `
        #sr-pdf-download .combined-chapter-title {
          font-size: 22px !important;
          line-height: 1.3 !important;
          font-weight: 700 !important;
          margin: 0 0 7px !important;
          color: #14243d !important;
        }

        #sr-pdf-download .combined-subject {
          color: #64748b !important;
          font-size: 12px !important;
          margin-bottom: 16px !important;
        }

        #sr-pdf-download .combined-diagram {
          max-width: 100% !important;
          max-height: 650px !important;
          display: block !important;
          object-fit: contain !important;
          margin: 12px auto 5px !important;
        }

        #sr-pdf-download .combined-figure {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
          margin: 14px 0 !important;
        }

        #sr-pdf-download .html2pdf__page-break {
          break-after: page !important;
          page-break-after: always !important;
          height: 0 !important;
        }
      `;

      combined.appendChild(style);

      // ====================================
      // TABLE OF CONTENTS
      // ====================================

      if (includeToc) {
        const toc = pdfNode(
          "section",
          "combined-toc"
        );

        toc.appendChild(
          pdfNode(
            "h2",
            "",
            "Table of Contents"
          )
        );

        const ordered = pdfNode("ol", "");

        selected.forEach((item) => {
          ordered.appendChild(
            pdfNode(
              "li",
              "",
              `${item.title} — ${
                item.subject || "General"
              }`
            )
          );
        });

        toc.appendChild(ordered);
        combined.appendChild(toc);
      }

      // ====================================
      // BUILD EACH REVIEWER CHAPTER
      // ====================================

      for (
        let i = 0;
        i < selected.length;
        i++
      ) {
        const reviewer = selected[i];

        const rendered =
          renderRef.current?.children.item(i);

        if (!(rendered instanceof HTMLElement)) {
          throw new Error(
            `Content isn't ready: ${reviewer.title}`
          );
        }

        setProgress(
          `Preparing chapter ${
            i + 1
          } of ${selected.length}...`
        );

        // Begin each chapter on a new page.

        if (i > 0 || includeToc) {
          combined.appendChild(
            pdfNode(
              "div",
              "html2pdf__page-break"
            )
          );
        }

        const chapter = pdfNode(
          "section",
          "combined-chapter"
        );

        chapter.appendChild(
          pdfNode(
            "h2",
            "combined-chapter-title",
            `${i + 1}. ${reviewer.title}`
          )
        );

        chapter.appendChild(
          pdfNode(
            "p",
            "combined-subject",
            reviewer.subject || "General"
          )
        );

        // Preserve rendered reviewer notes.
        // MathReviewerContent already
        // processes Markdown and KaTeX.
        // This keeps calculations, formulas,
        // tables, and embedded graphs.

        chapter.appendChild(
          rendered.cloneNode(true)
        );

        // ==================================
        // ORIGINAL IMAGES: OPTIONAL
        // ==================================

        if (includeDiagrams) {
          const diagrams =
            await loadDiagrams(reviewer);

          if (diagrams.length > 0) {
            chapter.appendChild(
              pdfNode(
                "h3",
                "",
                "Original Diagrams & Figures"
              )
            );
          }

          for (const diagram of diagrams.sort(
            (a, b) =>
              a.pageNumber - b.pageNumber
          )) {
            const figure = pdfNode(
              "figure",
              "combined-figure"
            );

            const image = pdfNode(
              "img",
              "combined-diagram"
            );

            image.src = diagram.dataUrl;

            image.alt =
              `Source page ${diagram.pageNumber}`;

            figure.appendChild(image);

            figure.appendChild(
              pdfNode(
                "figcaption",
                "",
                `Source page ${diagram.pageNumber}`
              )
            );

            chapter.appendChild(figure);
          }
        }

        combined.appendChild(chapter);
      }

      // ====================================
      // EXPORT PDF
      // ====================================

      setProgress("Rendering combined PDF...");

      await printReviewerPdf({
        title: pdfTitle.trim(),
        subject:
          `${selected.length} combined reviewers`,
        updatedAt: new Date().toISOString(),
        contentElement: combined,
      });

      setProgress("");
    } catch (cause) {
      console.error(
        "Could not combine reviewers:",
        cause
      );

      setError(
        cause instanceof Error
          ? cause.message
          : "Could not create the combined PDF."
      );

      setProgress("");
    } finally {
      setExporting(false);
    }
  }

  // ========================================
  // COMBINE PANEL UI
  // ========================================

  return (
    <section
      className="panel space-y-5 p-4 sm:p-6"
      aria-label="Combine reviewers"
    >
      {/* HEADER */}

      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Files className="h-5 w-5 text-primary" />
            Combine reviewers to PDF
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Choose saved reviewers, arrange
            their chapters, and export one PDF.
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          disabled={exporting}
          aria-label="Close combine reviewers"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* TITLE AND SEARCH */}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-muted-foreground">
          PDF title

          <input
            className="input mt-1.5"
            value={pdfTitle}
            maxLength={90}
            onChange={(event) =>
              setPdfTitle(event.target.value)
            }
            disabled={exporting}
            placeholder="e.g. Final Exam Reviewer"
          />
        </label>

        <label className="block text-xs font-medium text-muted-foreground">
          Search reviewers

          <input
            type="search"
            className="input mt-1.5"
            value={query}
            onChange={(event) =>
              setQuery(event.target.value)
            }
            disabled={exporting}
            placeholder="Title or subject"
          />
        </label>
      </div>

      {/* SELECTION TOOLS */}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {selected.length} selected ·{" "}
          {choices.length} available
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={
              exporting ||
              filtered.length === 0
            }
            onClick={() =>
              setSelectedIds((current) => [
                ...current,
                ...filtered
                  .map((item) => item.id)
                  .filter(
                    (id) => !current.includes(id)
                  ),
              ])
            }
          >
            Select shown
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={
              exporting ||
              selectedIds.length === 0
            }
            onClick={() =>
              setSelectedIds([])
            }
          >
            Clear
          </button>
        </div>
      </div>

      {/* REVIEWER SELECTION */}

      <div className="max-h-60 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
        {filtered.length > 0 ? (
          filtered.map((item) => (
            <label
              key={item.id}
              className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-secondary/50"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(
                  item.id
                )}
                disabled={exporting}
                onChange={() =>
                  toggle(item.id)
                }
              />

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-foreground">
                  {item.title}
                </span>

                <span className="block text-xs text-muted-foreground">
                  {item.subject || "General"} ·{" "}
                  {item.source === "online"
                    ? "Cloud"
                    : "Downloaded"}
                </span>
              </span>
            </label>
          ))
        ) : (
          <p className="p-3 text-sm text-muted-foreground">
            No matching reviewers.
          </p>
        )}
      </div>

      {/* CHAPTER ORDER */}

      {selected.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">
            Chapter order
          </p>

          {selected.map((item, index) => (
            <div
              key={item.id}
              className="flex items-center gap-2 rounded-lg border border-border p-2"
            >
              <span className="w-6 text-center text-xs text-muted-foreground">
                {index + 1}
              </span>

              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {item.title}
              </span>

              <button
                type="button"
                title="Move up"
                aria-label={`Move ${item.title} up`}
                disabled={
                  exporting || index === 0
                }
                onClick={() =>
                  move(item.id, -1)
                }
                className="grid h-8 w-8 place-items-center rounded-md border border-border disabled:opacity-30"
              >
                <ArrowUp className="h-4 w-4" />
              </button>

              <button
                type="button"
                title="Move down"
                aria-label={`Move ${item.title} down`}
                disabled={
                  exporting ||
                  index === selected.length - 1
                }
                onClick={() =>
                  move(item.id, 1)
                }
                className="grid h-8 w-8 place-items-center rounded-md border border-border disabled:opacity-30"
              >
                <ArrowDown className="h-4 w-4" />
              </button>

              <button
                type="button"
                title="Remove"
                aria-label={`Remove ${item.title}`}
                disabled={exporting}
                onClick={() =>
                  toggle(item.id)
                }
                className="grid h-8 w-8 place-items-center rounded-md border border-border disabled:opacity-30"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* PDF EXPORT SETTINGS */}

      <div className="space-y-3 rounded-lg border border-border bg-secondary/20 p-3">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={includeToc}
            disabled={exporting}
            onChange={(event) =>
              setIncludeToc(event.target.checked)
            }
          />

          Include table of contents
        </label>

        <fieldset
          className="space-y-3"
          disabled={exporting}
        >
          <legend className="text-sm font-medium text-foreground">
            PDF Content
          </legend>

          <label className="flex cursor-pointer items-start gap-3 text-sm text-foreground">
            <input
              type="radio"
              name="combined-pdf-mode"
              checked={!includeDiagrams}
              onChange={() =>
                setIncludeDiagrams(false)
              }
              className="mt-1"
            />

            <span>
              <span className="block font-medium">
                Reviewer Only (Recommended)
              </span>

              <span className="block text-xs text-muted-foreground">
                Keep notes, calculations,
                formulas, tables, and embedded
                reviewer graphs. Exclude original
                uploaded pictures.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 text-sm text-foreground">
            <input
              type="radio"
              name="combined-pdf-mode"
              checked={includeDiagrams}
              onChange={() =>
                setIncludeDiagrams(true)
              }
              className="mt-1"
            />

            <span>
              <span className="block font-medium">
                Reviewer + Original Sources
              </span>

              <span className="block text-xs text-muted-foreground">
                Attach separately saved original
                pictures and scanned pages.
              </span>
            </span>
          </label>
        </fieldset>

        <p className="text-xs text-muted-foreground">
          Large reviewers and images may
          take longer on mobile devices.
        </p>
      </div>

      {/* ERRORS */}

      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {/* PROGRESS */}

      {progress && (
        <p
          role="status"
          className="text-xs text-muted-foreground"
        >
          {progress}
        </p>
      )}

      {/* EXPORT BUTTON */}

      <button
        type="button"
        disabled={
          exporting ||
          selected.length < 2 ||
          !pdfTitle.trim()
        }
        onClick={() =>
          void combineAndDownload()
        }
        className="btn btn-primary w-full justify-center disabled:opacity-50"
      >
        {exporting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileDown className="h-4 w-4" />
        )}

        {exporting
          ? "Preparing combined PDF..."
          : `Combine & download PDF (${selected.length})`}
      </button>

      {/* HIDDEN MARKDOWN / MATH RENDERER */}

      <div
        ref={renderRef}
        aria-hidden="true"
        style={{
          position: "fixed",
          left: "-30000px",
          top: 0,
          width: 674,
          pointerEvents: "none",
        }}
      >
        {selected.map((item) => (
          <div key={item.id}>
            <MathReviewerContent
              content={item.content ?? ""}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

// ==========================================
// REVIEWERS LIBRARY
// ==========================================

export default function ReviewersPage() {
  const [searchParams, setSearchParams] =
    useSearchParams();

  const query =
    searchParams.get("q") ?? "";

  // ========================================
  // LIBRARY TABS
  // ========================================

  const [tab, setTab] = useState<Tab>(
    () =>
      typeof navigator !== "undefined" &&
      !navigator.onLine
        ? "downloaded"
        : "online"
  );

  const [isOnline, setIsOnline] =
    useState(() =>
      typeof navigator === "undefined"
        ? true
        : navigator.onLine
    );

  // ========================================
  // DATABASE DATA
  // ========================================

  const [reviewers, setReviewers] =
    useState<Reviewer[]>([]);

  const [downloaded, setDownloaded] =
    useState<OfflineReviewerRecord[]>([]);

  // ========================================
  // FILTERS
  // ========================================

  const [subject, setSubject] =
    useState("All");

  const [combining, setCombining] =
    useState(false);

  // ========================================
  // LOADING STATES
  // ========================================

  const [loadingOnline, setLoadingOnline] =
    useState(true);

  const [
    loadingDownloaded,
    setLoadingDownloaded,
  ] = useState(true);

  const [onlineError, setOnlineError] =
    useState("");

  const [offlineError, setOfflineError] =
    useState("");

  const [actionError, setActionError] =
    useState("");

  const [deletingId, setDeletingId] =
    useState<string | null>(null);

  const [
    removingLocalId,
    setRemovingLocalId,
  ] = useState<string | null>(null);

  // ========================================
  // LOAD DOWNLOADED REVIEWERS
  // ========================================

  const loadDownloaded =
    useCallback(async () => {
      setLoadingDownloaded(true);
      setOfflineError("");

      try {
        const records =
          await getAllOfflineReviewers();

        setDownloaded(records);
      } catch (error) {
        setOfflineError(
          errorMessage(
            error,
            "Unable to load downloaded reviewers."
          )
        );
      } finally {
        setLoadingDownloaded(false);
      }
    }, []);

  // ========================================
  // LOAD ONLINE REVIEWERS
  // ========================================

  const loadReviewers =
    useCallback(async () => {
      setLoadingOnline(true);
      setOnlineError("");

      if (!navigator.onLine) {
        setOnlineError(
          "You're offline. Open the Downloaded tab to read saved reviewers."
        );

        setTab("downloaded");
        setLoadingOnline(false);
        return;
      }

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
          throw new Error(
            "Please log in to view your reviewers."
          );
        }

        const {
          data,
          error: databaseError,
        } = await supabase
          .from("reviewers")
          .select("*")
          .eq("user_id", user.id)
          .order("updated_date", {
            ascending: false,
          });

        if (databaseError) {
          throw new Error(
            databaseError.message
          );
        }

        setReviewers(
          (data ?? []) as Reviewer[]
        );
      } catch (error) {
        console.error(
          "Failed to load online reviewers:",
          error
        );

        setOnlineError(
          errorMessage(
            error,
            "Unable to load reviewers."
          )
        );

        setTab("downloaded");
      } finally {
        setLoadingOnline(false);
      }
    }, []);

  // ========================================
  // INITIAL LOAD
  // ========================================

  useEffect(() => {
    void loadDownloaded();
    void loadReviewers();
  }, [loadDownloaded, loadReviewers]);

  // ========================================
  // ONLINE / OFFLINE LISTENERS
  // ========================================

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      void loadReviewers();
    }

    function handleOffline() {
      setIsOnline(false);
      setTab("downloaded");
    }

    window.addEventListener(
      "online",
      handleOnline
    );

    window.addEventListener(
      "offline",
      handleOffline
    );

    return () => {
      window.removeEventListener(
        "online",
        handleOnline
      );

      window.removeEventListener(
        "offline",
        handleOffline
      );
    };
  }, [loadReviewers]);

  // ========================================
  // SEARCH
  // ========================================

  function updateSearch(value: string) {
    const next = new URLSearchParams(
      searchParams
    );

    if (value.trim()) {
      next.set("q", value);
    } else {
      next.delete("q");
    }

    setSearchParams(next, {
      replace: true,
    });
  }

  // ========================================
  // DOWNLOADED IDS AND DATES
  // ========================================

  const downloadedIds = useMemo(
    () =>
      new Set(
        downloaded.map(
          (record) => record.id
        )
      ),
    [downloaded]
  );

  const savedAtById = useMemo(
    () =>
      new Map(
        downloaded.map((record) => [
          record.id,
          record.savedAt,
        ])
      ),
    [downloaded]
  );

  // ========================================
  // ACTIVE REVIEWERS
  // ========================================

  const activeReviewers:
    ReviewerListItem[] = useMemo(
    () =>
      tab === "downloaded"
        ? downloaded.map(
            (record) => record.reviewer
          )
        : reviewers,
    [tab, downloaded, reviewers]
  );

  // ========================================
  // SUBJECT FILTERS
  // ========================================

  const subjects = useMemo(() => {
    return [
      "All",
      ...new Set(
        activeReviewers
          .map(
            (reviewer) =>
              reviewer.subject || "General"
          )
          .filter(
            (value) => value !== "All"
          )
      ),
    ];
  }, [activeReviewers]);

  // ========================================
  // FILTER REVIEWERS
  // ========================================

  const visible = useMemo(() => {
    const needle = query
      .trim()
      .toLowerCase();

    return activeReviewers.filter(
      (reviewer) => {
        const reviewerSubject =
          reviewer.subject || "General";

        const matchesSubject =
          subject === "All" ||
          reviewerSubject === subject;

        const searchableText = [
          reviewer.title,
          reviewer.subject,
          reviewer.content,
        ]
          .map((value) =>
            String(value ?? "")
          )
          .join(" ")
          .toLowerCase();

        const matchesQuery =
          !needle ||
          searchableText.includes(needle);

        return matchesSubject && matchesQuery;
      }
    );
  }, [
    activeReviewers,
    query,
    subject,
  ]);

  // ========================================
  // SWITCH TAB
  // ========================================

  function switchTab(nextTab: Tab) {
    setTab(nextTab);
    setSubject("All");
    setActionError("");
  }

  // ========================================
  // REMOVE OFFLINE DOWNLOAD
  // ========================================

  async function removeDownload(
    id: string
  ) {
    if (removingLocalId || deletingId) {
      return;
    }

    const record = downloaded.find(
      (item) => item.id === id
    );

    if (!record) return;

    const confirmed = window.confirm(
      `Remove the offline download of "${record.reviewer.title}"?\n\n` +
      "The online reviewer in Supabase will NOT be deleted."
    );

    if (!confirmed) return;

    setRemovingLocalId(id);
    setActionError("");

    try {
      await deleteOfflineReviewer(id);

      setDownloaded((current) =>
        current.filter(
          (item) => item.id !== id
        )
      );
    } catch (error) {
      setActionError(
        errorMessage(
          error,
          "Could not remove offline download."
        )
      );
    } finally {
      setRemovingLocalId(null);
    }
  }

  // ========================================
  // DELETE ONLINE REVIEWER
  // ========================================

  async function removeReviewer(
    id: string
  ) {
    if (
      deletingId ||
      removingLocalId ||
      !isOnline
    ) {
      return;
    }

    const reviewer = reviewers.find(
      (item) => item.id === id
    );

    if (!reviewer) return;

    const confirmed = window.confirm(
      `Delete "${reviewer.title}"?\n\n` +
      "The online reviewer and saved diagrams will be permanently deleted. " +
      "Its downloaded copy on this device will also be removed."
    );

    if (!confirmed) return;

    setDeletingId(id);
    setActionError("");

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error(
          "Please log in again."
        );
      }

      // GET ASSOCIATED IMAGE PATHS

      const {
        data: imageRecords,
        error: imageReadError,
      } = await supabase
        .from("reviewer_visuals")
        .select("storage_path")
        .eq("reviewer_id", id)
        .eq("user_id", user.id);

      if (imageReadError) {
        throw new Error(
          `Could not check reviewer diagrams: ${imageReadError.message}`
        );
      }

      const storagePaths = (
        imageRecords ?? []
      )
        .map(
          (image) => image.storage_path
        )
        .filter(
          (path): path is string =>
            typeof path === "string"
        );

      const allowedPrefix =
        `${user.id}/${id}/`;

      const invalidPath =
        storagePaths.some(
          (path) =>
            !path.startsWith(
              allowedPrefix
            )
        );

      if (
        invalidPath ||
        storagePaths.length !==
          (imageRecords ?? []).length
      ) {
        throw new Error(
          "Invalid diagram storage path. Deletion cancelled."
        );
      }

      // DELETE ONLINE REVIEWER

      const {
        data: deleted,
        error: deleteError,
      } = await supabase
        .from("reviewers")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id)
        .select("id");

      if (deleteError) {
        throw new Error(
          deleteError.message
        );
      }

      if (
        !deleted ||
        deleted.length === 0
      ) {
        throw new Error(
          "Reviewer was not found or could not be deleted."
        );
      }

      setReviewers((current) =>
        current.filter(
          (item) => item.id !== id
        )
      );

      const cleanupProblems: string[] = [];

      // REMOVE LOCAL COPY

      try {
        await deleteOfflineReviewer(id);

        setDownloaded((current) =>
          current.filter(
            (item) => item.id !== id
          )
        );
      } catch (error) {
        console.error(
          "Offline copy cleanup failed:",
          error
        );

        cleanupProblems.push(
          "the local offline copy"
        );
      }

      // REMOVE SUPABASE IMAGES

      if (storagePaths.length > 0) {
        const {
          error: storageError,
        } = await supabase.storage
          .from("reviewer-visuals")
          .remove(storagePaths);

        if (storageError) {
          console.error(
            "Reviewer image cleanup failed:",
            storageError
          );

          cleanupProblems.push(
            "some Supabase diagram files"
          );
        }
      }

      if (cleanupProblems.length > 0) {
        setActionError(
          "Reviewer deleted online, but cleanup failed for " +
          cleanupProblems.join(" and ") +
          "."
        );
      }
    } catch (error) {
      console.error(
        "Failed to delete reviewer:",
        error
      );

      setActionError(
        errorMessage(
          error,
          "Unable to delete reviewer."
        )
      );
    } finally {
      setDeletingId(null);
    }
  }

  // ========================================
  // CURRENT LOADING / ERROR STATE
  // ========================================

  const loading =
    tab === "downloaded"
      ? loadingDownloaded
      : loadingOnline;

  const currentError =
    tab === "downloaded"
      ? offlineError
      : onlineError;

  // ========================================
  // PAGE UI
  // ========================================

  return (
    <div className="space-y-6">
      {/* HEADER */}

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            Library
          </p>

          <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.02em] text-foreground">
            Reviewers
          </h1>

          <p className="mt-1.5 text-sm text-muted-foreground">
            Browse, search, and manage your
            saved study reviewers.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* REFRESH */}

          <button
            type="button"
            onClick={() => {
              void loadDownloaded();
              void loadReviewers();
            }}
            disabled={
              loadingDownloaded ||
              loadingOnline
            }
            className="btn btn-secondary disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${
                loadingDownloaded || loadingOnline
                  ? "animate-spin"
                  : ""
              }`}
            />
            Refresh
          </button>

          {/* COMBINE REVIEWERS */}

          <button
            type="button"
            onClick={() =>
              setCombining(
                (current) => !current
              )
            }
            aria-expanded={combining}
            className="btn btn-secondary"
          >
            <Files className="h-4 w-4" />
            Combine reviewers
          </button>

          {/* NEW REVIEWER */}

          <Link
            to="/create"
            className="btn btn-primary"
          >
            <Sparkles className="h-4 w-4" />
            New reviewer
          </Link>
        </div>
      </header>

      {/* COMBINE PANEL */}

      {combining && (
        <CombineReviewersPanel
          onlineReviewers={reviewers}
          downloadedReviewers={downloaded}
          isOnline={isOnline}
          onClose={() =>
            setCombining(false)
          }
        />
      )}

      {/* LIBRARY TABS */}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() =>
            switchTab("online")
          }
          className={`chip ${
            tab === "online"
              ? "chip-active"
              : ""
          }`}
          aria-pressed={
            tab === "online"
          }
        >
          <BookOpen className="h-3.5 w-3.5" />

          All Reviewers

          {reviewers.length > 0
            ? ` (${reviewers.length})`
            : ""}
        </button>

        <button
          type="button"
          onClick={() =>
            switchTab("downloaded")
          }
          className={`chip ${
            tab === "downloaded"
              ? "chip-active"
              : ""
          }`}
          aria-pressed={
            tab === "downloaded"
          }
        >
          <Download className="h-3.5 w-3.5" />
          Downloaded ({downloaded.length})
        </button>
      </div>

      {/* LIBRARY DESCRIPTION */}

      <p className="text-xs text-muted-foreground">
        {tab === "online"
          ? "Reviewers saved in your StudyRoom account."
          : "Downloaded reviewers are stored on this device and can be opened without internet."}
      </p>

      {/* OFFLINE INDICATOR */}

      {!isOnline && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/20 p-3 text-sm text-muted-foreground">
          <WifiOff className="h-4 w-4" />
          You're offline. Your downloaded
          reviewers are available below.
        </div>
      )}

      {/* SEARCH AND FILTER */}

      <div className="space-y-3">
        <div className="relative sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

          <input
            type="search"
            value={query}
            onChange={(event) =>
              updateSearch(event.target.value)
            }
            placeholder="Search title, subject or content"
            className="input pl-9"
            aria-label="Search reviewers"
          />
        </div>

        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {subjects.map((item) => (
            <button
              type="button"
              key={item}
              onClick={() =>
                setSubject(item)
              }
              className={`chip ${
                subject === item
                  ? "chip-active"
                  : ""
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {/* ERRORS */}

      {(actionError || currentError) && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {actionError || currentError}
        </div>
      )}

      {/* LOADING / EMPTY / LIST */}

      {loading ? (
        <div className="panel flex flex-col items-center justify-center px-6 py-14 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />

          <p className="mt-3 text-sm text-muted-foreground">
            Loading{" "}
            {tab === "downloaded"
              ? "downloaded"
              : "online"}{" "}
            reviewers...
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="panel flex flex-col items-center justify-center px-6 py-14 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-secondary">
            {tab === "downloaded" ? (
              <Download className="h-6 w-6 text-muted-foreground" />
            ) : (
              <BookOpen className="h-6 w-6 text-muted-foreground" />
            )}
          </div>

          <h2 className="mt-4 text-base font-medium text-foreground">
            {activeReviewers.length > 0
              ? "No reviewers match your search"
              : tab === "downloaded"
                ? "No downloaded reviewers yet"
                : "No reviewers yet"}
          </h2>

          <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
            {tab === "downloaded"
              ? "Open a reviewer while online and select Save for Offline. It will appear here."
              : "Create your first reviewer to save it to your StudyRoom account."}
          </p>

          {tab === "online" &&
            activeReviewers.length === 0 && (
              <Link
                to="/create"
                className="btn btn-primary btn-sm mt-5"
              >
                <Sparkles className="h-4 w-4" />
                Create reviewer
              </Link>
            )}
        </div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {visible.map((reviewer) => (
            <article
              key={reviewer.id}
              className="row-hover flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:px-5"
            >
              {/* REVIEWER INFORMATION */}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/reviewers/${encodeURIComponent(
                      reviewer.id
                    )}`}
                    className="truncate text-[14.5px] font-medium text-foreground transition-colors hover:text-primary"
                  >
                    {reviewer.title}
                  </Link>

                  <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                    {reviewer.subject || "General"}
                  </span>

                  {reviewer.is_ai_generated && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-primary">
                      <Sparkles className="h-3 w-3" />
                      AI
                    </span>
                  )}

                  {downloadedIds.has(reviewer.id) && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                      <CheckCircle2 className="h-3 w-3" />
                      Saved Offline
                    </span>
                  )}
                </div>

                {/* CONTENT PREVIEW */}

                <p className="mt-1.5 line-clamp-1 text-[13px] text-muted-foreground">
                  {String(reviewer.content ?? "")
                    .replace(/[#*_`>-]/g, " ")
                    .slice(0, 160)}
                </p>

                {/* UPDATED DATE */}

                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {tab === "downloaded"
                    ? `Downloaded ${formatDate(
                        savedAtById.has(reviewer.id)
                          ? new Date(
                              savedAtById.get(
                                reviewer.id
                              ) ?? 0
                            ).toISOString()
                          : null
                      )}`
                    : `Updated ${formatDate(
                        reviewer.updated_date
                      )}`}
                </p>
              </div>

              {/* ACTION BUTTONS */}

              <div className="flex shrink-0 items-center gap-2">
                <Link
                  to={`/reviewers/${encodeURIComponent(
                    reviewer.id
                  )}`}
                  className="btn btn-secondary btn-sm"
                >
                  Read
                </Link>

                {tab === "online" ? (
                  <>
                    <Link
                      to={`/reviewers/${encodeURIComponent(
                        reviewer.id
                      )}/edit`}
                      aria-label={`Edit ${reviewer.title}`}
                      className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Link>

                    <button
                      type="button"
                      onClick={() => {
                        void removeReviewer(
                          reviewer.id
                        );
                      }}
                      disabled={
                        deletingId !== null ||
                        removingLocalId !== null ||
                        !isOnline
                      }
                      aria-label={`Delete ${reviewer.title}`}
                      title="Delete online reviewer"
                      className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive disabled:opacity-50"
                    >
                      {deletingId === reviewer.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      void removeDownload(
                        reviewer.id
                      );
                    }}
                    disabled={
                      removingLocalId !== null ||
                      deletingId !== null
                    }
                    aria-label={`Remove offline download of ${reviewer.title}`}
                    title="Remove offline copy only"
                    className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive disabled:opacity-50"
                  >
                    {removingLocalId === reviewer.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
