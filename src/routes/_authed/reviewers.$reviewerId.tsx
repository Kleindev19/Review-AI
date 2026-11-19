import { printReviewerPdf } from "../../lib/printReviewerPdf";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import MathReviewerContent from "../../components/reviewer/MathReviewerContent";

import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  FileText,
  FileDown,
  Loader2,
  Pencil,
  Sparkles,
  Images,
} from "lucide-react";

import { supabase } from "../../lib/supabaseClient";

import {
  getReviewerVisuals,
  type SavedReviewerVisual,
} from "../../lib/reviewerVisualReader";

// ==========================================
// TYPES
// ==========================================

type Reviewer = {
  id: string;
  title: string;
  subject: string | null;
  content: string;
  source_type: string;
  source_label: string | null;
  is_ai_generated: boolean;
  created_date: string;
  updated_date: string;
};

// ==========================================
// HELPERS
// ==========================================

function formatDate(date: string | null): string {
  if (!date) return "Unknown date";

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return "Unknown date";
  }

  return parsed.toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function ReviewerPage() {
  const { reviewerId } = useParams<{
    reviewerId: string;
  }>();

  // ========================================
  // REVIEWER STATES
  // ========================================

  const [reviewer, setReviewer] =
    useState<Reviewer | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ========================================
  // SAVED DIAGRAM STATES
  // ========================================

  const [visuals, setVisuals] = useState<
    SavedReviewerVisual[]
  >([]);

  const [loadingVisuals, setLoadingVisuals] =
    useState(true);

  const [visualsError, setVisualsError] =
    useState("");

  // ========================================
  // PDF EXPORT STATES
  // ========================================

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  // ========================================
  // LOAD REVIEWER FROM SUPABASE
  // ========================================

  useEffect(() => {
    let active = true;

    async function loadReviewer() {
      setLoading(true);
      setError("");
      setReviewer(null);
      setExportError("");

      try {
        if (!reviewerId) {
          throw new Error("Invalid reviewer ID.");
        }

        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
          throw new Error(
            "Please log in to view your reviewer."
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
          throw new Error(databaseError.message);
        }

        if (!data) {
          throw new Error(
            "Reviewer not found or you do not have permission to view it."
          );
        }

        if (!active) return;

        setReviewer(data as Reviewer);
      } catch (err) {
        if (!active) return;

        console.error(
          "Failed to load reviewer:",
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load reviewer."
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadReviewer();

    return () => {
      active = false;
    };
  }, [reviewerId]);

  // ========================================
  // LOAD SAVED REVIEWER DIAGRAMS
  // ========================================

  useEffect(() => {
    let active = true;

    async function loadVisuals() {
      setVisuals([]);
      setVisualsError("");
      setLoadingVisuals(true);

      try {
        if (!reviewerId) {
          throw new Error("Invalid reviewer ID.");
        }

        const savedImages =
          await getReviewerVisuals(reviewerId);

        if (!active) return;

        setVisuals(savedImages);
      } catch (err) {
        if (!active) return;

        console.error(
          "Failed to load reviewer diagrams:",
          err
        );

        setVisualsError(
          err instanceof Error
            ? err.message
            : "Could not load saved diagrams."
        );
      } finally {
        if (active) {
          setLoadingVisuals(false);
        }
      }
    }

    void loadVisuals();

    return () => {
      active = false;
    };
  }, [reviewerId]);

  // ==========================================
  // NEW: EXPORT REVIEWER WITH DIAGRAMS TO PDF
  // ==========================================

  async function exportToPDF() {
    if (!reviewer || exporting) return;

    setExporting(true);
    setExportError("");

    try {
      const contentElement = document.getElementById(
        "reviewer-pdf-content"
      );

      if (!contentElement) {
        throw new Error(
          "Reviewer content is not ready for PDF export."
        );
      }

      // Generate fresh URLs for private Supabase diagrams.
      const exportVisuals = await getReviewerVisuals(
        reviewer.id
      );

      // Export already-rendered Markdown and KaTeX.
      await printReviewerPdf({
        title: reviewer.title,
        subject: reviewer.subject,
        updatedAt: reviewer.updated_date,
        contentElement,
        visuals: exportVisuals,
      });
    } catch (err) {
      console.error(
        "Failed to export reviewer PDF:",
        err
      );

      setExportError(
        err instanceof Error
          ? err.message
          : "Could not prepare PDF."
      );
    } finally {
      setExporting(false);
    }
  }
  // ========================================
  // LOADING STATE
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
  // NOT FOUND / ERROR
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

      {/* ======================================
          REVIEWER HEADER
      ====================================== */}

      <header className="reviewer-detail-header space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          {/* TITLE AND SUBJECT */}

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
            </div>
          </div>

          {/* ACTION BUTTONS */}

          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/reviewers/${encodeURIComponent(
                reviewer.id
              )}/edit`}
              className="btn btn-secondary"
            >
              <Pencil className="h-4 w-4" />
              Edit Reviewer
            </Link>

            <button
              type="button"
              onClick={() => void exportToPDF()}
              disabled={exporting}
              className="btn btn-primary disabled:opacity-50"
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4" />
              )}

              {exporting
                ? "Converting..."
                : "Convert to PDF"}
            </button>
          </div>
        </div>
      </header>

      {/* PDF ERROR */}

      {exportError && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {exportError}
        </p>
      )}

      {/* ======================================
          REVIEWER INFORMATION
      ====================================== */}

      <div className="panel p-4 sm:p-5">
        <div className="flex flex-wrap gap-x-8 gap-y-4">
          {/* CREATED DATE */}

          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />

            <div>
              <p className="text-[11px] text-muted-foreground">
                Created
              </p>

              <p className="text-sm text-foreground">
                {formatDate(reviewer.created_date)}
              </p>
            </div>
          </div>

          {/* UPDATED DATE */}

          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />

            <div>
              <p className="text-[11px] text-muted-foreground">
                Last updated
              </p>

              <p className="text-sm text-foreground">
                {formatDate(reviewer.updated_date)}
              </p>
            </div>
          </div>

          {/* SOURCE */}

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

      {/* ======================================
          SAVED ORIGINAL DIAGRAMS & FIGURES
      ====================================== */}

      {(loadingVisuals ||
        visualsError ||
        visuals.length > 0) && (
        <section className="panel overflow-hidden">
          {/* DIAGRAM HEADER */}

          <div className="flex items-center gap-3 border-b border-border px-5 py-4 sm:px-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
              <Images className="h-5 w-5 text-primary" />
            </div>

            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Original Diagrams & Figures
              </h2>

              <p className="text-xs text-muted-foreground">
                Visual references saved with your reviewer
              </p>
            </div>
          </div>

          {/* DIAGRAM CONTENT */}

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

            {!loadingVisuals && visualsError && (
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

      {/* ======================================
          REVIEWER CONTENT
      ====================================== */}

      <article className="panel overflow-hidden">
        {/* CONTENT HEADER */}

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

        {/* ACTUAL REVIEWER CONTENT */}

        <div id="reviewer-pdf-content" className="p-5 sm:p-7">
          <MathReviewerContent content={reviewer.content} />
        </div>
      </article>

      {/* ======================================
          BOTTOM NAVIGATION
      ====================================== */}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/reviewers"
          className="btn btn-secondary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Library
        </Link>

        <Link
          to={`/reviewers/${encodeURIComponent(
            reviewer.id
          )}/edit`}
          className="btn btn-primary"
        >
          <Pencil className="h-4 w-4" />
          Edit Content
        </Link>
      </div>
    </div>
  );
}
