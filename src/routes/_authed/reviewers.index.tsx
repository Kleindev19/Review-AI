
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
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";

import { supabase } from "../../lib/supabaseClient";

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

// ==========================================
// DATE FORMAT
// ==========================================

function formatDate(
  date?: string | null
): string {
  if (!date) return "Unknown date";

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return "Unknown date";
  }

  return parsed.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ==========================================
// REVIEWERS LIBRARY
// ==========================================

export default function ReviewersPage() {
  const [searchParams, setSearchParams] =
    useSearchParams();

  // DATABASE DATA
  const [reviewers, setReviewers] = useState<
    Reviewer[]
  >([]);

  // FILTERS
  const [subject, setSubject] = useState("All");

  // STATES
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [deletingId, setDeletingId] = useState<
    string | null
  >(null);

  // Dashboard search support
  const query = searchParams.get("q") ?? "";

  // ========================================
  // LOAD REVIEWERS FROM SUPABASE
  // ========================================

  const loadReviewers = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      // Get current authenticated user
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error(
          "Please log in to view your reviewers."
        );
      }

      // Retrieve reviewers belonging to user
      const { data, error: databaseError } =
        await supabase
          .from("reviewers")
          .select("*")
          .eq("user_id", user.id)
          .order("updated_date", {
            ascending: false,
          });

      if (databaseError) {
        throw new Error(databaseError.message);
      }

      setReviewers((data ?? []) as Reviewer[]);
    } catch (err) {
      console.error(
        "Failed to load reviewers:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Unable to load reviewers."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // ========================================
  // INITIAL DATABASE LOAD
  // ========================================

  useEffect(() => {
    void loadReviewers();
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
  // SUBJECT FILTERS
  // ========================================

  const subjects = useMemo(() => {
    return [
      "All",
      ...new Set(
        reviewers
          .map(
            (reviewer) =>
              reviewer.subject || "General"
          )
          .filter(
            (value) => value !== "All"
          )
      ),
    ];
  }, [reviewers]);

  // ========================================
  // FILTER REVIEWERS
  // ========================================

  const visible = useMemo(() => {
    const needle = query
      .trim()
      .toLowerCase();

    return reviewers.filter((reviewer) => {
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
        .map((value) => String(value ?? ""))
        .join(" ")
        .toLowerCase();

      const matchesQuery =
        !needle ||
        searchableText.includes(needle);

      return (
        matchesSubject &&
        matchesQuery
      );
    });
  }, [reviewers, query, subject]);

  // ========================================
  // DELETE REVIEWER FROM SUPABASE
  // ========================================

  async function removeReviewer(id: string) {
    if (deletingId) return;

    const reviewer = reviewers.find(
      (item) => item.id === id
    );

    if (!reviewer) return;

    const confirmed = window.confirm(
      `Delete "${reviewer.title}"?\n\nThis reviewer will be permanently deleted from your account.`
    );

    if (!confirmed) return;

    setDeletingId(id);
    setError("");

    try {
      // Verify logged-in user
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error(
          "Please log in again."
        );
      }

      // Delete reviewer owned by this user
      const { data, error: deleteError } =
        await supabase
          .from("reviewers")
          .delete()
          .eq("id", id)
          .eq("user_id", user.id)
          .select("id");

      if (deleteError) {
        throw new Error(deleteError.message);
      }

      if (!data || data.length === 0) {
        throw new Error(
          "Reviewer was not found or could not be deleted."
        );
      }

      // Remove deleted item from UI
      setReviewers((current) =>
        current.filter(
          (item) => item.id !== id
        )
      );
    } catch (err) {
      console.error(
        "Failed to delete reviewer:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Unable to delete reviewer."
      );
    } finally {
      setDeletingId(null);
    }
  }

  // ========================================
  // PAGE UI
  // ========================================

  return (
    <div className="space-y-6">

      {/* PAGE HEADER */}
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
          {/* REFRESH BUTTON */}
          <button
            type="button"
            onClick={() => {
              void loadReviewers();
            }}
            disabled={loading}
            className="btn btn-secondary disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${
                loading ? "animate-spin" : ""
              }`}
            />
            Refresh
          </button>

          {/* CREATE BUTTON */}
          <Link
            to="/create"
            className="btn btn-primary"
          >
            <Sparkles className="h-4 w-4" />
            New reviewer
          </Link>
        </div>
      </header>

      {/* ACCOUNT DATA INFO */}
      <p className="text-xs text-muted-foreground">
        Reviewers saved in your StudyRoom account.
      </p>

      {/* SEARCH AND FILTER */}
      <div className="space-y-3">

        {/* SEARCH BAR */}
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

        {/* SUBJECT FILTER */}
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {subjects.map((item) => (
            <button
              key={item}
              type="button"
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

      {/* ERROR MESSAGE */}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {/* LOADING STATE */}
      {loading ? (
        <div className="panel flex flex-col items-center justify-center px-6 py-14 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />

          <p className="mt-3 text-sm text-muted-foreground">
            Loading your reviewers...
          </p>
        </div>
      ) : visible.length === 0 ? (

        /* EMPTY STATE */

        <div className="panel flex flex-col items-center justify-center px-6 py-14 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-secondary">
            <BookOpen className="h-6 w-6 text-muted-foreground" />
          </div>

          <h2 className="mt-4 text-base font-medium text-foreground">
            {reviewers.length === 0
              ? "No reviewers yet"
              : "No reviewers match your search"}
          </h2>

          <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
            {reviewers.length === 0
              ? "Create your first reviewer to save it to your StudyRoom account."
              : "Try another search term or subject."}
          </p>

          {reviewers.length === 0 && (
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

        /* REVIEWER LIST */

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
                </div>

                {/* PREVIEW */}
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
                  Updated{" "}
                  {formatDate(
                    reviewer.updated_date
                  )}
                </p>

              </div>

              {/* ACTION BUTTONS */}
              <div className="flex shrink-0 items-center gap-2">

                {/* READ */}
                <Link
                  to={`/reviewers/${encodeURIComponent(
                    reviewer.id
                  )}`}
                  className="btn btn-secondary btn-sm"
                >
                  Read
                </Link>

                {/* EDIT */}
                <Link
                  to={`/reviewers/${encodeURIComponent(
                    reviewer.id
                  )}/edit`}
                  aria-label={`Edit ${reviewer.title}`}
                  className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Link>

                {/* DELETE */}
                <button
                  type="button"
                  onClick={() => {
                    void removeReviewer(
                      reviewer.id
                    );
                  }}
                  disabled={
                    deletingId !== null
                  }
                  aria-label={`Delete ${reviewer.title}`}
                  className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive disabled:opacity-50"
                >
                  {deletingId === reviewer.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>

              </div>

            </article>
          ))}

        </div>
      )}
    </div>
  );
}
