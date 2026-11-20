
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Download,
  FileDown,
  FileText,
  Images,
  Loader2,
  Pencil,
  Sparkles,
  Trash2,
  WifiOff,
} from "lucide-react";

import MathReviewerContent from "../../components/reviewer/MathReviewerContent";

import { printReviewerPdf } from "../../lib/printReviewerPdf";
import { supabase } from "../../lib/supabaseClient";

import {
  getReviewerVisuals,
  type SavedReviewerVisual,
} from "../../lib/reviewerVisualReader";

import {
  createOfflineVisualUrls,
  deleteOfflineReviewer,
  getOfflineReviewer,
  saveReviewerForOffline,
  type OfflineReviewerData,
  type OfflineReviewerRecord,
} from "../../lib/offlineReviewerStore";

// ==========================================
// TYPES AND HELPERS
// ==========================================

type Reviewer = OfflineReviewerData;

function formatDate(value: string | null): string {
  if (!value) return "Unknown date";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Unknown date"
    : date.toLocaleDateString("en-PH", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
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
// MAIN COMPONENT
// ==========================================

export default function ReviewerPage() {
  const { reviewerId } = useParams<{
    reviewerId: string;
  }>();

  const [reviewer, setReviewer] =
    useState<Reviewer | null>(null);

  const [visuals, setVisuals] =
    useState<SavedReviewerVisual[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [loadingVisuals, setLoadingVisuals] =
    useState(true);

  const [error, setError] = useState("");
  const [visualsError, setVisualsError] =
    useState("");

  // ========================================
  // OFFLINE STATES
  // ========================================

  const [usingOffline, setUsingOffline] =
    useState(false);

  const [offlineSaved, setOfflineSaved] =
    useState(false);

  const [savingOffline, setSavingOffline] =
    useState(false);

  const [offlineBusy, setOfflineBusy] =
    useState(false);

  const [offlineMessage, setOfflineMessage] =
    useState("");

  const [offlineError, setOfflineError] =
    useState("");

  // ========================================
  // PDF EXPORT STATES
  // ========================================

  const [exporting, setExporting] =
    useState(false);

  const [exportError, setExportError] =
    useState("");

  const reviewerContentRef =
    useRef<HTMLDivElement>(null);

  const offlineRevokeRef =
    useRef<() => void>(() => {});

  // ========================================
  // LOAD ONLINE OR OFFLINE REVIEWER
  // ========================================

  useEffect(() => {
    let active = true;

    async function loadReviewer() {
      offlineRevokeRef.current();
      offlineRevokeRef.current = () => {};

      setReviewer(null);
      setVisuals([]);
      setLoading(true);
      setLoadingVisuals(true);
      setError("");
      setVisualsError("");
      setExportError("");
      setOfflineError("");
      setOfflineMessage("");
      setUsingOffline(false);
      setOfflineSaved(false);

      if (!reviewerId) {
        setError("Invalid reviewer ID.");
        setLoading(false);
        setLoadingVisuals(false);
        return;
      }

      // ====================================
      // CHECK LOCAL INDEXEDDB COPY
      // ====================================

      let local: OfflineReviewerRecord | null =
        null;

      try {
        local = await getOfflineReviewer(
          reviewerId
        );
      } catch (storageError) {
        console.warn(
          "Offline database unavailable:",
          storageError
        );
      }

      if (!active) return;

      setOfflineSaved(Boolean(local));

      // ====================================
      // DISPLAY CACHED REVIEWER
      // ====================================

      function showCached(
        record: OfflineReviewerRecord
      ) {
        const images =
          createOfflineVisualUrls(record);

        if (!active) {
          images.revoke();
          return;
        }

        offlineRevokeRef.current();

        offlineRevokeRef.current =
          images.revoke;

        setReviewer(record.reviewer);
        setVisuals(images.visuals);

        setUsingOffline(true);
        setLoading(false);
        setLoadingVisuals(false);

        setError("");
        setVisualsError("");
      }

      // If browser reports offline,
      // show cached reviewer immediately.

      if (!navigator.onLine && local) {
        showCached(local);
        return;
      }

      // ====================================
      // TRY ONLINE SUPABASE FIRST
      // ====================================

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
          throw new Error(
            "Could not verify your login online."
          );
        }

        const {
          data,
          error: databaseError,
        } = await supabase
          .from("reviewers")
          .select(
            "id, title, subject, content, source_type, source_label, is_ai_generated, created_date, updated_date"
          )
          .eq("id", reviewerId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (databaseError) {
          throw new Error(
            databaseError.message
          );
        }

        if (!data) {
          throw new Error(
            "Reviewer not found or access not permitted."
          );
        }

        const onlineVisuals =
          await getReviewerVisuals(reviewerId);

        if (!active) return;

        setReviewer(data as Reviewer);
        setVisuals(onlineVisuals);

        setLoading(false);
        setLoadingVisuals(false);
      } catch (onlineError) {
        if (!active) return;

        console.warn(
          "Online reviewer load failed:",
          onlineError
        );

        // ==================================
        // FALLBACK TO OFFLINE COPY
        // ==================================

        if (local) {
          showCached(local);
        } else {
          setError(
            errorMessage(
              onlineError,
              "Could not load reviewer. Save it for offline use while connected."
            )
          );

          setLoading(false);
          setLoadingVisuals(false);
        }
      }
    }

    void loadReviewer();

    return () => {
      active = false;

      offlineRevokeRef.current();

      offlineRevokeRef.current = () => {};
    };
  }, [reviewerId]);

  // ========================================
  // SAVE REVIEWER FOR OFFLINE USE
  // ========================================

  async function saveOffline() {
    if (
      !reviewer ||
      savingOffline ||
      usingOffline
    ) {
      return;
    }

    setSavingOffline(true);
    setOfflineError("");
    setOfflineMessage("");

    try {
      // Download fresh signed image URLs.
      // Actual image data goes to IndexedDB.

      const freshVisuals =
        await getReviewerVisuals(
          reviewer.id
        );

      await saveReviewerForOffline(
        reviewer,
        freshVisuals
      );

      setOfflineSaved(true);

      setOfflineMessage(
        `Saved on this device with ${freshVisuals.length} diagram(s). You can open this reviewer offline.`
      );
    } catch (saveError) {
      setOfflineError(
        errorMessage(
          saveError,
          "Could not save reviewer for offline use."
        )
      );
    } finally {
      setSavingOffline(false);
    }
  }

  // ========================================
  // REMOVE OFFLINE COPY
  // ========================================

  async function removeOffline() {
    if (!reviewer || offlineBusy) return;

    setOfflineBusy(true);
    setOfflineError("");
    setOfflineMessage("");

    try {
      await deleteOfflineReviewer(
        reviewer.id
      );

      setOfflineSaved(false);

      setOfflineMessage(
        "Offline copy removed from this device. The online reviewer is unchanged."
      );
    } catch (removeError) {
      setOfflineError(
        errorMessage(
          removeError,
          "Could not remove offline copy."
        )
      );
    } finally {
      setOfflineBusy(false);
    }
  }

  // ========================================
  // EXPORT PDF
  // ========================================

  async function exportToPDF() {
    if (!reviewer || exporting) return;

    setExporting(true);
    setExportError("");

    try {
      if (!reviewerContentRef.current) {
        throw new Error(
          "Reviewer content is not ready for export."
        );
      }

      // Use local diagrams when offline.
      // Online mode still refreshes signed URLs.

      const exportVisuals = usingOffline
        ? visuals
        : await getReviewerVisuals(
            reviewer.id
          );

      await printReviewerPdf({
        title: reviewer.title,
        subject: reviewer.subject,
        updatedAt:
          reviewer.updated_date,
        contentElement:
          reviewerContentRef.current,
        visuals: exportVisuals,
      });
    } catch (exportFailure) {
      setExportError(
        errorMessage(
          exportFailure,
          "Could not prepare the PDF."
        )
      );
    } finally {
      setExporting(false);
    }
  }

  // ========================================
  // LOADING SCREEN
  // ========================================

  if (loading) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />

        <p className="text-sm text-muted-foreground">
          Loading your reviewer...
        </p>
      </div>
    );
  }

  // ========================================
  // ERROR SCREEN
  // ========================================

  if (!reviewer) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center px-4 text-center">
        <BookOpen className="mb-4 h-10 w-10 text-muted-foreground" />

        <h1 className="text-xl font-semibold text-foreground">
          Reviewer unavailable
        </h1>

        <p
          role="alert"
          className="mt-2 max-w-md text-sm text-muted-foreground"
        >
          {error ||
            "The reviewer could not be loaded."}
        </p>

        <Link
          to="/reviewers"
          className="btn btn-primary mt-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Reviewers
        </Link>
      </div>
    );
  }

  // ========================================
  // MAIN REVIEWER PAGE
  // ========================================

  return (
    <div className="space-y-6">
      {/* BACK NAVIGATION */}

      <Link
        to="/reviewers"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Reviewers
      </Link>

      {/* REVIEWER HEADER */}

      <header className="reviewer-detail-header space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              StudyRoom / My Reviewers
            </p>

            <h1 className="break-words text-[28px] font-semibold tracking-tight text-foreground">
              {reviewer.title}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs text-muted-foreground">
                {reviewer.subject || "General"}
              </span>

              {reviewer.is_ai_generated && (
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary">
                  <Sparkles className="h-3 w-3" />
                  AI Generated
                </span>
              )}

              {usingOffline && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs text-muted-foreground">
                  <WifiOff className="h-3 w-3" />
                  Offline copy
                </span>
              )}

              {offlineSaved && !usingOffline && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3 w-3" />
                  Saved offline
                </span>
              )}
            </div>
          </div>

          {/* ACTION BUTTONS */}

          <div className="flex flex-wrap items-center gap-2">
            {!usingOffline && (
              <button
                type="button"
                onClick={() =>
                  void saveOffline()
                }
                disabled={
                  savingOffline ||
                  loadingVisuals
                }
                className="btn btn-secondary disabled:opacity-50"
              >
                {savingOffline ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}

                {savingOffline
                  ? "Downloading..."
                  : offlineSaved
                    ? "Update Offline Copy"
                    : "Save for Offline"}
              </button>
            )}

            {offlineSaved && (
              <button
                type="button"
                onClick={() =>
                  void removeOffline()
                }
                disabled={
                  offlineBusy ||
                  savingOffline
                }
                className="btn btn-secondary disabled:opacity-50"
              >
                {offlineBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}

                Remove Offline Copy
              </button>
            )}

            {!usingOffline && (
              <Link
                to={`/reviewers/${encodeURIComponent(
                  reviewer.id
                )}/edit`}
                className="btn btn-secondary"
              >
                <Pencil className="h-4 w-4" />
                Edit Reviewer
              </Link>
            )}

            <button
              type="button"
              onClick={() =>
                void exportToPDF()
              }
              disabled={exporting}
              className="btn btn-primary disabled:opacity-50"
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4" />
              )}

              {exporting
                ? "Preparing PDF..."
                : "Convert to PDF"}
            </button>
          </div>
        </div>
      </header>

      {/* OFFLINE STATUS */}

      {(offlineMessage ||
        offlineError ||
        usingOffline) && (
        <div
          role={
            offlineError
              ? "alert"
              : "status"
          }
          className={`rounded-lg border p-3 text-sm ${
            offlineError
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-border bg-secondary/20 text-foreground"
          }`}
        >
          {offlineError ||
            offlineMessage ||
            "Showing the downloaded copy. Changes require internet."}
        </div>
      )}

      {/* PDF ERROR */}

      {exportError && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {exportError}
        </p>
      )}

      {/* REVIEWER INFORMATION */}

      <div className="panel p-4 sm:p-5">
        <div className="flex flex-wrap gap-x-8 gap-y-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />

            <div>
              <p className="text-[11px] text-muted-foreground">
                Created
              </p>

              <p className="text-sm text-foreground">
                {formatDate(
                  reviewer.created_date
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />

            <div>
              <p className="text-[11px] text-muted-foreground">
                Last updated
              </p>

              <p className="text-sm text-foreground">
                {formatDate(
                  reviewer.updated_date
                )}
              </p>
            </div>
          </div>

          {reviewer.source_label && (
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />

              <div>
                <p className="text-[11px] text-muted-foreground">
                  Source
                </p>

                <p className="text-sm text-foreground">
                  {reviewer.source_label}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ORIGINAL DIAGRAMS AND FIGURES */}

      {(loadingVisuals ||
        visualsError ||
        visuals.length > 0) && (
        <section className="panel overflow-hidden">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4 sm:px-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
              <Images className="h-5 w-5 text-primary" />
            </div>

            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Original Diagrams &amp; Figures
              </h2>

              <p className="text-xs text-muted-foreground">
                Visual references saved with your reviewer
              </p>
            </div>
          </div>

          <div className="space-y-4 p-5 sm:p-6">
            {loadingVisuals && (
              <div
                role="status"
                className="flex items-center gap-2 py-6 text-sm text-muted-foreground"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading saved diagrams...
              </div>
            )}

            {!loadingVisuals &&
              visualsError && (
                <p
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                >
                  {visualsError}
                </p>
              )}

            {!loadingVisuals &&
              visuals.map((visual) => (
                <figure
                  key={visual.pageNumber}
                  className="overflow-hidden rounded-xl border border-border bg-background"
                >
                  <div className="flex min-h-32 items-center justify-center p-4">
                    <img
                      src={visual.url}
                      alt={`Original diagram from page ${visual.pageNumber}`}
                      className="max-h-[500px] w-full object-contain"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>

                  <figcaption className="border-t border-border bg-secondary/20 px-4 py-3 text-xs text-muted-foreground">
                    Figure / Page {visual.pageNumber}
                  </figcaption>
                </figure>
              ))}
          </div>
        </section>
      )}

      {/* REVIEWER CONTENT */}

      <article className="panel overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4 sm:px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
            <BookOpen className="h-5 w-5 text-primary" />
          </div>

          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Reviewer Content
            </h2>

            <p className="text-xs text-muted-foreground">
              Your saved study notes
            </p>
          </div>
        </div>

        <div
          ref={reviewerContentRef}
          className="p-5 sm:p-7"
        >
          <MathReviewerContent
            content={reviewer.content}
          />
        </div>
      </article>

      {/* BOTTOM NAVIGATION */}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/reviewers"
          className="btn btn-secondary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Library
        </Link>

        {!usingOffline && (
          <Link
            to={`/reviewers/${encodeURIComponent(
              reviewer.id
            )}/edit`}
            className="btn btn-primary"
          >
            <Pencil className="h-4 w-4" />
            Edit Content
          </Link>
        )}
      </div>
    </div>
  );
}
