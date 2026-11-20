
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Link,
  useSearchParams,
} from "react-router-dom";

import {
  BookOpen,
  CheckCircle2,
  Download,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  WifiOff,
} from "lucide-react";

import { supabase } from "../../lib/supabaseClient";

import {
  deleteOfflineReviewer,
  getAllOfflineReviewers,
  type OfflineReviewerRecord,
} from "../../lib/offlineReviewerStore";

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

  // ========================================
  // LOADING AND ERROR STATES
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
  // NETWORK STATUS LISTENERS
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
  // DOWNLOADED IDS
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
  // ACTIVE REVIEWER COLLECTION
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
              reviewer.subject ||
              "General"
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
          searchableText.includes(
            needle
          );

        return (
          matchesSubject &&
          matchesQuery
        );
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
  // REMOVE OFFLINE DOWNLOAD ONLY
  // ========================================

  async function removeDownload(
    id: string
  ) {
    if (
      removingLocalId ||
      deletingId
    ) {
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
      await deleteOfflineReviewer(
        id
      );

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
  // DELETE ONLINE REVIEWER + IMAGES
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
      // ====================================
      // VERIFY CURRENT USER
      // ====================================

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error(
          "Please log in again."
        );
      }

      // ====================================
      // GET ASSOCIATED IMAGE PATHS
      // ====================================

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
          (image) =>
            image.storage_path
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

      // ====================================
      // DELETE ONLINE REVIEWER
      // ====================================

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

      // Reviewer has been deleted online.
      // Perform best-effort cleanup next.

      const cleanupProblems:
        string[] = [];

      // ====================================
      // DELETE LOCAL OFFLINE COPY
      // ====================================

      try {
        await deleteOfflineReviewer(
          id
        );

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

      // ====================================
      // DELETE SUPABASE STORAGE IMAGES
      // ====================================

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

      if (
        cleanupProblems.length > 0
      ) {
        setActionError(
          "Reviewer deleted online, but cleanup failed for " +
          cleanupProblems.join(
            " and "
          ) +
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
      {/* ======================================
          PAGE HEADER
      ====================================== */}

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
                loadingDownloaded ||
                loadingOnline
                  ? "animate-spin"
                  : ""
              }`}
            />

            Refresh
          </button>

          {/* CREATE REVIEWER */}

          <Link
            to="/create"
            className="btn btn-primary"
          >
            <Sparkles className="h-4 w-4" />
            New reviewer
          </Link>
        </div>
      </header>

      {/* ======================================
          LIBRARY TABS
      ====================================== */}

      <div className="flex flex-wrap items-center gap-2">
        {/* ALL REVIEWERS */}

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

        {/* DOWNLOADED REVIEWERS */}

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

      {/* ======================================
          SEARCH AND FILTER
      ====================================== */}

      <div className="space-y-3">
        {/* SEARCH */}

        <div className="relative sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

          <input
            type="search"
            value={query}
            onChange={(event) =>
              updateSearch(
                event.target.value
              )
            }
            placeholder="Search title, subject or content"
            className="input pl-9"
            aria-label="Search reviewers"
          />
        </div>

        {/* SUBJECT FILTER */}

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

      {/* ======================================
          ERROR MESSAGE
      ====================================== */}

      {(actionError || currentError) && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {actionError ||
            currentError}
        </div>
      )}

      {/* ======================================
          LOADING STATE
      ====================================== */}

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
        /* ====================================
           EMPTY STATE
        ==================================== */

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
        /* ====================================
           REVIEWER LIST
        ==================================== */

        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {visible.map((reviewer) => (
            <article
              key={reviewer.id}
              className="row-hover flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:px-5"
            >
              {/* REVIEWER INFORMATION */}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {/* TITLE */}

                  <Link
                    to={`/reviewers/${encodeURIComponent(
                      reviewer.id
                    )}`}
                    className="truncate text-[14.5px] font-medium text-foreground transition-colors hover:text-primary"
                  >
                    {reviewer.title}
                  </Link>

                  {/* SUBJECT */}

                  <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                    {reviewer.subject ||
                      "General"}
                  </span>

                  {/* AI BADGE */}

                  {reviewer.is_ai_generated && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-primary">
                      <Sparkles className="h-3 w-3" />
                      AI
                    </span>
                  )}

                  {/* OFFLINE BADGE */}

                  {downloadedIds.has(
                    reviewer.id
                  ) && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                      <CheckCircle2 className="h-3 w-3" />

                      Saved Offline
                    </span>
                  )}
                </div>

                {/* CONTENT PREVIEW */}

                <p className="mt-1.5 line-clamp-1 text-[13px] text-muted-foreground">
                  {String(
                    reviewer.content ?? ""
                  )
                    .replace(
                      /[#*_`>-]/g,
                      " "
                    )
                    .slice(0, 160)}
                </p>

                {/* DATE */}

                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {tab === "downloaded"
                    ? `Downloaded ${formatDate(
                        savedAtById.has(
                          reviewer.id
                        )
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

              {/* ==================================
                  ACTION BUTTONS
              ================================== */}

              <div className="flex shrink-0 items-center gap-2">
                {/* READ REVIEWER */}

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
                    {/* EDIT ONLINE REVIEWER */}

                    <Link
                      to={`/reviewers/${encodeURIComponent(
                        reviewer.id
                      )}/edit`}
                      aria-label={`Edit ${reviewer.title}`}
                      className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Link>

                    {/* DELETE ONLINE REVIEWER */}

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
                      {deletingId ===
                      reviewer.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </>
                ) : (
                  /* REMOVE DOWNLOADED COPY */

                  <button
                    type="button"
                    onClick={() => {
                      void removeDownload(
                        reviewer.id
                      );
                    }}
                    disabled={
                      removingLocalId !==
                        null ||
                      deletingId !== null
                    }
                    aria-label={`Remove offline download of ${reviewer.title}`}
                    title="Remove offline copy only"
                    className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive disabled:opacity-50"
                  >
                    {removingLocalId ===
                    reviewer.id ? (
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
