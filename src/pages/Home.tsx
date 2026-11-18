
import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import {
  Link,
  useNavigate,
} from "react-router-dom";

import {
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  FileText,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Upload,
} from "lucide-react";

import type { User } from "@supabase/supabase-js";

import CreateStrip from "../components/dashboard/CreateStrip";
import StatStrip from "../components/dashboard/StatStrip";
import StudyTools from "../components/dashboard/StudyTools";

import { supabase } from "../lib/supabaseClient";
import { listMaterials } from "../lib/materialStore";

// ==========================================
// TYPES
// ==========================================

type ReviewerSummary = {
  id: string;
  title: string;
  subject: string | null;
  created_date: string;
  updated_date: string | null;
};

type FlashcardSummary = {
  id: string;
  title: string;
  created_date: string;
};

type QuizSummary = {
  id: string;
  title: string;
  created_date: string;
};

type AttemptSummary = {
  id: string;
  quiz_title: string;
  percentage: number;
  created_date: string;
};

type MaterialSummary = {
  id: string;
  file_name: string;
  file_type: string;
  created_date: string;
};

type ActivityType =
  | "reviewer"
  | "flashcard"
  | "quiz"
  | "material";

type ActivityItem = {
  id: string;
  title: string;
  type: ActivityType;
  date: string;
  to: string;
};

type DashboardCounts = {
  reviewers: string;
  flashcards: string;
  quizzes: string;
  materials: string;
};

type QuizPerformance = {
  attempts: number;
  average: number;
  best: number;
};

const EMPTY_COUNTS: DashboardCounts = {
  reviewers: "—",
  flashcards: "—",
  quizzes: "—",
  materials: "—",
};

const ACTIVITY_LABELS: Record<
  ActivityType,
  string
> = {
  reviewer: "Reviewer",
  flashcard: "Flashcard set",
  quiz: "Practice quiz",
  material: "Study material",
};

// ==========================================
// HELPERS
// ==========================================

function getDisplayName(user: User | null): string {
  if (!user) return "there";

  const metadata = user.user_metadata ?? {};

  const name = [
    metadata.full_name,
    metadata.display_name,
    metadata.name,
  ].find(
    (value): value is string =>
      typeof value === "string" &&
      value.trim().length > 0
  );

  return (
    name?.trim() ||
    user.email?.split("@")[0] ||
    "there"
  );
}

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

function dateValue(date: string): number {
  const value = new Date(date).getTime();

  return Number.isNaN(value) ? 0 : value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Could not load dashboard data.";
}

// ==========================================
// SUPABASE DATA FUNCTIONS
// ==========================================

async function fetchReviewers(
  userId: string
): Promise<ReviewerSummary[]> {
  const { data, error } = await supabase
    .from("reviewers")
    .select(
      "id, title, subject, created_date, updated_date"
    )
    .eq("user_id", userId)
    .order("updated_date", {
      ascending: false,
    });

  if (error) throw new Error(error.message);

  return (data ?? []) as ReviewerSummary[];
}

async function fetchFlashcards(
  userId: string
): Promise<FlashcardSummary[]> {
  const { data, error } = await supabase
    .from("flashcard_sets")
    .select("id, title, created_date")
    .eq("user_id", userId)
    .order("created_date", {
      ascending: false,
    });

  if (error) throw new Error(error.message);

  return (data ?? []) as FlashcardSummary[];
}

async function fetchQuizzes(
  userId: string
): Promise<QuizSummary[]> {
  const { data, error } = await supabase
    .from("quizzes")
    .select("id, title, created_date")
    .eq("user_id", userId)
    .order("created_date", {
      ascending: false,
    });

  if (error) throw new Error(error.message);

  return (data ?? []) as QuizSummary[];
}

async function fetchAttempts(
  userId: string
): Promise<AttemptSummary[]> {
  const { data, error } = await supabase
    .from("quiz_attempts")
    .select(
      "id, quiz_title, percentage, created_date"
    )
    .eq("user_id", userId)
    .order("created_date", {
      ascending: false,
    });

  if (error) throw new Error(error.message);

  return (data ?? []).map((item) => ({
    id: item.id,
    quiz_title: item.quiz_title,
    percentage: Number(item.percentage),
    created_date: item.created_date,
  }));
}

async function fetchCloudMaterials(
  userId: string
): Promise<MaterialSummary[]> {
  const { data, error } = await supabase
    .from("materials")
    .select(
      "id, file_name, file_type, created_date"
    )
    .eq("user_id", userId)
    .order("created_date", {
      ascending: false,
    });

  if (error) throw new Error(error.message);

  return (data ?? []) as MaterialSummary[];
}

// ==========================================
// MAIN DASHBOARD
// ==========================================

export default function Home() {
  const navigate = useNavigate();

  // ========================================
  // USER AND SEARCH
  // ========================================

  const [displayName, setDisplayName] =
    useState("there");

  const [query, setQuery] = useState("");

  // ========================================
  // DASHBOARD DATA
  // ========================================

  const [reviewers, setReviewers] = useState<
    ReviewerSummary[]
  >([]);

  const [materials, setMaterials] = useState<
    MaterialSummary[]
  >([]);

  const [activities, setActivities] = useState<
    ActivityItem[]
  >([]);

  const [counts, setCounts] =
    useState<DashboardCounts>(EMPTY_COUNTS);

  const [performance, setPerformance] =
    useState<QuizPerformance | null>(null);

  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [revision, setRevision] = useState(0);

  const [warning, setWarning] = useState("");

  // ========================================
  // USER DISPLAY NAME
  // Automatically updates when changed
  // in Supabase Authentication.
  // ========================================

  useEffect(() => {
    let active = true;

    async function loadUser() {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (!active) return;

      if (error) {
        console.error(
          "Could not load account name:",
          error
        );
        return;
      }

      setDisplayName(getDisplayName(user));
    }

    void loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!active) return;

        setDisplayName(
          getDisplayName(session?.user ?? null)
        );
      }
    );

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // ========================================
  // LOAD DASHBOARD DATA
  // ========================================

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      if (revision > 0) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setWarning("");

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;

        if (!user) {
          throw new Error(
            "Please sign in to view your dashboard."
          );
        }

        // ====================================
        // LOAD ALL DATA SOURCES
        // ====================================

        const [
          reviewerResult,
          flashcardResult,
          quizResult,
          attemptResult,
          cloudMaterialResult,
          localMaterialResult,
        ] = await Promise.allSettled([
          fetchReviewers(user.id),
          fetchFlashcards(user.id),
          fetchQuizzes(user.id),
          fetchAttempts(user.id),
          fetchCloudMaterials(user.id),
          listMaterials(),
        ]);

        if (!active) return;

        const failures: string[] = [];

        const reviewerRecords =
          reviewerResult.status === "fulfilled"
            ? reviewerResult.value
            : [];

        const flashcardRecords =
          flashcardResult.status === "fulfilled"
            ? flashcardResult.value
            : [];

        const quizRecords =
          quizResult.status === "fulfilled"
            ? quizResult.value
            : [];

        const attemptRecords =
          attemptResult.status === "fulfilled"
            ? attemptResult.value
            : [];

        const cloudMaterials =
          cloudMaterialResult.status === "fulfilled"
            ? cloudMaterialResult.value
            : [];

        const localMaterials =
          localMaterialResult.status === "fulfilled"
            ? localMaterialResult.value
            : [];

        // ====================================
        // RECORD ERRORS
        // ====================================

        if (
          reviewerResult.status === "rejected"
        ) {
          failures.push("reviewers");

          console.error(
            "Dashboard reviewers:",
            reviewerResult.reason
          );
        }

        if (
          flashcardResult.status === "rejected"
        ) {
          failures.push("flashcards");

          console.error(
            "Dashboard flashcards:",
            flashcardResult.reason
          );
        }

        if (
          quizResult.status === "rejected"
        ) {
          failures.push("quizzes");

          console.error(
            "Dashboard quizzes:",
            quizResult.reason
          );
        }

        if (
          attemptResult.status === "rejected"
        ) {
          failures.push("quiz performance");

          console.error(
            "Dashboard attempts:",
            attemptResult.reason
          );
        }

        if (
          cloudMaterialResult.status ===
          "rejected"
        ) {
          failures.push("cloud materials");

          console.error(
            "Dashboard cloud materials:",
            cloudMaterialResult.reason
          );
        }

        if (
          localMaterialResult.status ===
          "rejected"
        ) {
          failures.push("local materials");

          console.error(
            "Dashboard local materials:",
            localMaterialResult.reason
          );
        }

        // ====================================
        // COMBINE LOCAL + CLOUD MATERIALS
        // ====================================

        const combinedMaterials =
          new Map<string, MaterialSummary>();

        for (const material of cloudMaterials) {
          combinedMaterials.set(material.id, {
            id: material.id,
            file_name: material.file_name,
            file_type: material.file_type,
            created_date: material.created_date,
          });
        }

        for (const material of localMaterials) {
          if (!combinedMaterials.has(material.id)) {
            combinedMaterials.set(material.id, {
              id: material.id,
              file_name: material.file_name,
              file_type: material.file_type,
              created_date: material.created_date,
            });
          }
        }

        const materialRecords = [
          ...combinedMaterials.values(),
        ].sort(
          (a, b) =>
            dateValue(b.created_date) -
            dateValue(a.created_date)
        );

        // ====================================
        // UPDATE COUNTS
        // ====================================

        setCounts({
          reviewers:
            reviewerResult.status === "fulfilled"
              ? String(reviewerRecords.length)
              : "—",

          flashcards:
            flashcardResult.status === "fulfilled"
              ? String(flashcardRecords.length)
              : "—",

          quizzes:
            quizResult.status === "fulfilled"
              ? String(quizRecords.length)
              : "—",

          materials:
            cloudMaterialResult.status ===
              "fulfilled" &&
            localMaterialResult.status ===
              "fulfilled"
              ? String(materialRecords.length)
              : "—",
        });

        // ====================================
        // RECENT REVIEWERS
        // ====================================

        setReviewers(
          reviewerRecords.slice(0, 5)
        );

        // ====================================
        // RECENT MATERIALS
        // ====================================

        setMaterials(
          materialRecords.slice(0, 5)
        );

        // ====================================
        // QUIZ PERFORMANCE
        // ====================================

        if (
          attemptResult.status === "fulfilled"
        ) {
          const scores = attemptRecords
            .map((item) => item.percentage)
            .filter(Number.isFinite);

          const average = scores.length
            ? Math.round(
                scores.reduce(
                  (sum, value) => sum + value,
                  0
                ) / scores.length
              )
            : 0;

          const best = scores.length
            ? Math.round(Math.max(...scores))
            : 0;

          setPerformance({
            attempts: attemptRecords.length,
            average,
            best,
          });
        } else {
          setPerformance(null);
        }

        // ====================================
        // RECENT ACTIVITY
        // ====================================

        const recentActivity: ActivityItem[] = [
          ...reviewerRecords.map((item) => ({
            id: `reviewer-${item.id}`,
            title: item.title,
            type: "reviewer" as const,
            date:
              item.updated_date ||
              item.created_date,
            to: `/reviewers/${encodeURIComponent(
              item.id
            )}`,
          })),

          ...flashcardRecords.map((item) => ({
            id: `flashcard-${item.id}`,
            title: item.title,
            type: "flashcard" as const,
            date: item.created_date,
            to: `/flashcards/${encodeURIComponent(
              item.id
            )}`,
          })),

          ...quizRecords.map((item) => ({
            id: `quiz-${item.id}`,
            title: item.title,
            type: "quiz" as const,
            date: item.created_date,
            to: `/quizzes/${encodeURIComponent(
              item.id
            )}`,
          })),

          ...materialRecords.map((item) => ({
            id: `material-${item.id}`,
            title: item.file_name,
            type: "material" as const,
            date: item.created_date,
            to: "/materials",
          })),
        ];

        recentActivity.sort(
          (a, b) =>
            dateValue(b.date) -
            dateValue(a.date)
        );

        setActivities(
          recentActivity.slice(0, 6)
        );

        // ====================================
        // PARTIAL LOADING WARNING
        // ====================================

        if (failures.length > 0) {
          setWarning(
            `Some dashboard data could not be loaded: ${failures.join(
              ", "
            )}.`
          );
        }
      } catch (error) {
        if (!active) return;

        console.error(
          "Dashboard loading failed:",
          error
        );

        setWarning(errorMessage(error));
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      active = false;
    };
  }, [revision]);

  // ========================================
  // SEARCH REVIEWERS
  // ========================================

  function submitSearch(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const search = query.trim();

    navigate(
      search
        ? `/reviewers?q=${encodeURIComponent(
            search
          )}`
        : "/reviewers"
    );
  }

  function refreshDashboard() {
    setRevision((current) => current + 1);
  }

  // ========================================
  // DASHBOARD UI
  // ========================================

  return (
    <div className="space-y-7">

      {/* ====================================
          PERSONALIZED HEADER
      ==================================== */}

      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            Your workspace
          </p>

          <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.02em] text-foreground">
            Hi, {displayName}! 👋
          </h1>

          <p className="mt-1.5 text-sm text-muted-foreground">
            Your study materials, practice tools,
            and learning progress in one place.
          </p>
        </div>

        {/* SEARCH AND CREATE */}

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <form
            onSubmit={submitSearch}
            className="relative w-full sm:w-56"
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

            <input
              type="search"
              value={query}
              onChange={(event) =>
                setQuery(event.target.value)
              }
              placeholder="Search reviewers"
              className="input pl-9"
              aria-label="Search reviewers"
            />
          </form>

          <Link
            to="/create"
            className="btn btn-primary shrink-0"
          >
            <Sparkles className="h-4 w-4" />
            Create reviewer
          </Link>
        </div>
      </div>

      {/* ====================================
          CREATE REVIEWER STRIP
      ==================================== */}

      <CreateStrip />

      {/* ====================================
          REFRESH DASHBOARD
      ==================================== */}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Your saved learning activity
        </p>

        <button
          type="button"
          onClick={refreshDashboard}
          disabled={loading || refreshing}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          {loading || refreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}

          Refresh
        </button>
      </div>

      {warning && (
        <div
          role="alert"
          className="rounded-lg border border-border bg-card px-4 py-3 text-[13px] text-muted-foreground"
        >
          {warning}
        </div>
      )}

      {/* ====================================
          DASHBOARD STATISTICS
      ==================================== */}

      <StatStrip
        items={[
          {
            label: "Reviewers",
            value: counts.reviewers,
            icon: BookOpen,
            to: "/reviewers",
          },
          {
            label: "Flashcard sets",
            value: counts.flashcards,
            icon: Layers,
            to: "/flashcards",
          },
          {
            label: "Quizzes",
            value: counts.quizzes,
            icon: ClipboardCheck,
            to: "/quizzes",
          },
          {
            label: "Materials",
            value: counts.materials,
            icon: FileText,
            to: "/materials",
          },
        ]}
      />

      {/* ====================================
          QUICK ACTIONS
      ==================================== */}

      <div className="flex flex-wrap gap-2">
        <Link
          to="/materials"
          className="btn btn-secondary btn-sm"
        >
          <Upload className="h-3.5 w-3.5" />
          Upload material
        </Link>

        <Link
          to="/flashcards"
          className="btn btn-secondary btn-sm"
        >
          <Layers className="h-3.5 w-3.5" />
          Flashcards
        </Link>

        <Link
          to="/quizzes"
          className="btn btn-secondary btn-sm"
        >
          <ClipboardCheck className="h-3.5 w-3.5" />
          Practice quiz
        </Link>
      </div>

      {/* ====================================
          MAIN CONTENT
      ==================================== */}

      <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">

        {/* LEFT COLUMN */}

        <div className="space-y-6">

          {/* ==============================
              RECENT REVIEWERS
          ============================== */}

          <section className="panel overflow-hidden">
            <header className="flex items-center justify-between gap-3 px-5 py-3.5">
              <h2 className="text-sm font-medium text-foreground">
                Recent reviewers
              </h2>

              <Link
                to="/reviewers"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                View all
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </header>

            <div className="divide-y divide-border border-t border-border">
              {loading ? (
                <div className="flex items-center justify-center gap-2 px-5 py-10 text-[13px] text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading reviewers...
                </div>
              ) : reviewers.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-5 py-12 text-center">
                  <BookOpen className="h-6 w-6 text-muted-foreground" />

                  <h3 className="mt-4 text-sm font-medium text-foreground">
                    No reviewers yet
                  </h3>

                  <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
                    Your saved reviewers will
                    appear here.
                  </p>

                  <Link
                    to="/create"
                    className="btn btn-secondary btn-sm mt-5"
                  >
                    <Sparkles className="h-4 w-4" />
                    Create reviewer
                  </Link>
                </div>
              ) : (
                reviewers.map((reviewer) => (
                  <Link
                    key={reviewer.id}
                    to={`/reviewers/${encodeURIComponent(
                      reviewer.id
                    )}`}
                    className="row-hover flex items-center gap-3 px-5 py-3.5"
                  >
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary">
                      <BookOpen className="h-4 w-4 text-primary" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium text-foreground">
                        {reviewer.title}
                      </p>

                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {reviewer.subject || "General"}

                        {" · "}

                        {formatDate(
                          reviewer.updated_date ||
                          reviewer.created_date
                        )}
                      </p>
                    </div>

                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </Link>
                ))
              )}
            </div>
          </section>

          {/* ==============================
              RECENT ACTIVITY
          ============================== */}

          <section className="panel overflow-hidden">
            <header className="px-5 py-3.5">
              <h2 className="text-sm font-medium text-foreground">
                Recent activity
              </h2>
            </header>

            <div className="divide-y divide-border border-t border-border">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading activity...
                </div>
              ) : activities.length === 0 ? (
                <p className="px-5 py-9 text-center text-[13px] text-muted-foreground">
                  Your recent study activity will
                  appear here.
                </p>
              ) : (
                activities.map((activity) => {
                  const ActivityIcon =
                    activity.type === "reviewer"
                      ? BookOpen
                      : activity.type === "flashcard"
                        ? Layers
                        : activity.type === "quiz"
                          ? ClipboardCheck
                          : FileText;

                  return (
                    <Link
                      key={activity.id}
                      to={activity.to}
                      className="row-hover flex items-center gap-3 px-5 py-3"
                    >
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary">
                        <ActivityIcon className="h-4 w-4 text-muted-foreground" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-foreground">
                          {activity.title}
                        </p>

                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {
                            ACTIVITY_LABELS[
                              activity.type
                            ]
                          }

                          {" · "}

                          {formatDate(activity.date)}
                        </p>
                      </div>

                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </Link>
                  );
                })
              )}
            </div>
          </section>
        </div>

        {/* ====================================
            RIGHT COLUMN
        ==================================== */}

        <div className="space-y-6">

          {/* STUDY TOOLS */}

          <StudyTools />

          {/* ==============================
              QUIZ PERFORMANCE
          ============================== */}

          <section className="panel p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium text-foreground">
                Quiz performance
              </h2>

              <Link
                to="/quizzes"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                View quizzes
              </Link>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 py-8 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading performance...
              </div>
            ) : !performance ? (
              <p className="mt-4 text-xs text-muted-foreground">
                Performance is currently unavailable.
              </p>
            ) : performance.attempts === 0 ? (
              <div className="py-6 text-center">
                <ClipboardCheck className="mx-auto h-7 w-7 text-muted-foreground" />

                <p className="mt-3 text-[13px] text-muted-foreground">
                  Complete a quiz to start tracking
                  your scores.
                </p>

                <Link
                  to="/quizzes"
                  className="btn btn-secondary btn-sm mt-4"
                >
                  Practice now
                </Link>
              </div>
            ) : (
              <>
                <div className="mt-5 flex items-end gap-2">
                  <span className="text-[36px] font-semibold leading-none tracking-tight tabular-nums text-foreground">
                    {performance.average}%
                  </span>

                  <span className="pb-1 text-xs text-muted-foreground">
                    Average score
                  </span>
                </div>

                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(
                          0,
                          performance.average
                        )
                      )}%`,
                    }}
                  />
                </div>

                <div className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4">
                  <div>
                    <p className="text-[11px] text-muted-foreground">
                      Quizzes completed
                    </p>

                    <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                      {performance.attempts}
                    </p>
                  </div>

                  <div>
                    <p className="text-[11px] text-muted-foreground">
                      Best score
                    </p>

                    <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                      {performance.best}%
                    </p>
                  </div>
                </div>
              </>
            )}
          </section>

          {/* ==============================
              RECENT MATERIALS
          ============================== */}

          <section className="panel overflow-hidden">
            <header className="flex items-center justify-between gap-3 px-5 py-3.5">
              <h2 className="text-sm font-medium text-foreground">
                Recent materials
              </h2>

              <Link
                to="/materials"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                All files
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </header>

            <div className="divide-y divide-border border-t border-border">
              {loading ? (
                <div className="flex items-center justify-center gap-2 px-5 py-8 text-[13px] text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading materials...
                </div>
              ) : materials.length === 0 ? (
                <div className="px-5 py-9 text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </div>

                  <p className="mt-3 text-[13px] text-muted-foreground">
                    No study materials yet.
                  </p>

                  <Link
                    to="/materials"
                    className="btn btn-secondary btn-sm mt-5"
                  >
                    Upload material
                  </Link>
                </div>
              ) : (
                materials.map((material) => (
                  <Link
                    key={material.id}
                    to="/materials"
                    className="row-hover flex items-center gap-3 px-5 py-3"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-foreground">
                        {material.file_name}
                      </span>

                      <span className="block text-[11px] text-muted-foreground">
                        {(
                          material.file_type ||
                          "file"
                        ).toUpperCase()}

                        {" · "}

                        {formatDate(
                          material.created_date
                        )}
                      </span>
                    </span>
                  </Link>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
