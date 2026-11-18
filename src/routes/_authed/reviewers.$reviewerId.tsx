
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  FileText,
  FileDown,
  Loader2,
  Pencil,
  Sparkles,
} from "lucide-react";

import { supabase } from "../../lib/supabaseClient";

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

function makePdfFilename(title: string): string {
  const safeTitle = title
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);

  return `${safeTitle || "Reviewer"}.pdf`;
}

function normalizePdfText(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2022/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/\t/g, "    ");
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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
  // EXPORT REVIEWER TO PDF
  // ========================================

  async function exportToPDF() {
    if (!reviewer || exporting) return;

    setExporting(true);
    setExportError("");

    try {
      // Load PDF library only when needed.
      const { jsPDF } = await import("jspdf");

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth =
        pdf.internal.pageSize.getWidth();

      const pageHeight =
        pdf.internal.pageSize.getHeight();

      const margin = 20;
      const contentWidth = pageWidth - margin * 2;
      const bottomLimit = pageHeight - 25;

      let y = 22;

      // ======================================
      // PAGE BREAK HANDLER
      // ======================================

      function ensureSpace(height: number) {
        if (y + height > bottomLimit) {
          pdf.addPage();
          y = 22;
        }
      }

      // ======================================
      // WRITE WRAPPED TEXT
      // ======================================

      function writeText(
        text: string,
        options: {
          fontSize?: number;
          lineHeight?: number;
          bold?: boolean;
          color?: [number, number, number];
        } = {}
      ) {
        const {
          fontSize = 11,
          lineHeight = 6,
          bold = false,
          color = [40, 40, 40],
        } = options;

        pdf.setFont(
          "helvetica",
          bold ? "bold" : "normal"
        );

        pdf.setFontSize(fontSize);
        pdf.setTextColor(...color);

        const normalized = normalizePdfText(text);

        const lines = pdf.splitTextToSize(
          normalized,
          contentWidth
        ) as string[];

        for (const line of lines) {
          ensureSpace(lineHeight);

          pdf.text(line, margin, y);

          y += lineHeight;
        }
      }

      // ======================================
      // PDF HEADER
      // ======================================

      writeText("STUDY REVIEWER", {
        fontSize: 10,
        lineHeight: 7,
        bold: true,
        color: [80, 100, 130],
      });

      y += 4;

      writeText(reviewer.title, {
        fontSize: 19,
        lineHeight: 9,
        bold: true,
        color: [25, 35, 50],
      });

      y += 4;

      if (reviewer.subject?.trim()) {
        writeText(
          `Subject: ${reviewer.subject.trim()}`,
          {
            fontSize: 10,
            lineHeight: 6,
            color: [100, 100, 100],
          }
        );
      }

      writeText(
        `Updated: ${formatDate(
          reviewer.updated_date
        )}`,
        {
          fontSize: 9,
          lineHeight: 6,
          color: [120, 120, 120],
        }
      );

      y += 5;

      ensureSpace(8);

      pdf.setDrawColor(220, 225, 232);
      pdf.line(
        margin,
        y,
        pageWidth - margin,
        y
      );

      y += 10;

      // ======================================
      // PDF REVIEWER CONTENT
      // ======================================

      const paragraphs = reviewer.content
        .replace(/\r\n/g, "\n")
        .split("\n");

      for (const paragraph of paragraphs) {
        const text = paragraph.trim();

        // Blank line
        if (!text) {
          ensureSpace(3);
          y += 3;
          continue;
        }

        // Markdown-style heading
        const markdownHeading =
          text.match(/^#{1,6}\s+(.+)$/);

        if (markdownHeading) {
          ensureSpace(12);
          y += 3;

          writeText(markdownHeading[1], {
            fontSize: 13,
            lineHeight: 7,
            bold: true,
            color: [30, 45, 65],
          });

          y += 2;
          continue;
        }

        // Uppercase section headings
        const isHeading =
          text.length <= 75 &&
          /[A-Z]/.test(text) &&
          text === text.toUpperCase() &&
          !text.startsWith("-");

        if (isHeading) {
          ensureSpace(12);
          y += 3;

          writeText(text, {
            fontSize: 12,
            lineHeight: 7,
            bold: true,
            color: [30, 45, 65],
          });

          y += 2;
          continue;
        }

        // Normal content
        writeText(text, {
          fontSize: 10.5,
          lineHeight: 6,
          color: [45, 45, 45],
        });
      }

      // ======================================
      // PAGE NUMBERS
      // ======================================

      const totalPages =
        pdf.getNumberOfPages();

      for (
        let page = 1;
        page <= totalPages;
        page++
      ) {
        pdf.setPage(page);

        pdf.setDrawColor(225, 225, 225);

        pdf.line(
          margin,
          pageHeight - 19,
          pageWidth - margin,
          pageHeight - 19
        );

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.setTextColor(130, 130, 130);

        pdf.text(
          "StudyRoom",
          margin,
          pageHeight - 13
        );

        pdf.text(
          `Page ${page} of ${totalPages}`,
          pageWidth - margin,
          pageHeight - 13,
          { align: "right" }
        );
      }

      // ======================================
      // DOWNLOAD PDF
      // ======================================

      pdf.save(
        makePdfFilename(reviewer.title)
      );
    } catch (err) {
      console.error(
        "Failed to export reviewer:",
        err
      );

      setExportError(
        "Could not generate the PDF. Please try again."
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

            {/* EDIT REVIEWER */}
            <Link
              to={`/reviewers/${encodeURIComponent(
                reviewer.id
              )}/edit`}
              className="btn btn-secondary"
            >
              <Pencil className="h-4 w-4" />
              Edit Reviewer
            </Link>

            {/* CONVERT TO PDF */}
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
                {formatDate(
                  reviewer.created_date
                )}
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
                {formatDate(
                  reviewer.updated_date
                )}
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

        {/* ACTUAL CONTENT */}
        <div className="p-5 sm:p-7">
          <div className="whitespace-pre-wrap break-words text-[14px] leading-7 text-foreground">
            {reviewer.content}
          </div>
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
