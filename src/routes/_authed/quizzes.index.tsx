
import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import {
  Link,
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import {
  ClipboardCheck,
  Loader2,
  Play,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";

import {
  createCloudQuiz,
  deleteCloudQuiz,
  listCloudQuizzes,
  listCloudQuizAttempts,
  type Quiz,
  type QuizAttempt,
  type QuizQuestion,
  type QuizType,
  type QuestionType,
} from "../../lib/quizStore";

import { listMaterials } from "../../lib/materialStore";
import { listCloudMaterials } from "../../lib/cloudMaterialStore";
import { supabase } from "../../lib/supabaseClient";

type StudySource = {
  value: string;
  label: string;
  subject: string;
  text: string;
};

type Difficulty = "easy" | "medium" | "hard";

type QuizForm = {
  source: string;
  paste: string;
  type: QuizType;
  count: number;
  difficulty: Difficulty;
};

const QUESTION_TYPES: Record<QuizType, string> = {
  multiple_choice: "Multiple choice",
  true_false: "True or false",
  identification: "Identification",
  mixed: "Mixed",
};

const DIFFICULTIES: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

function formatDate(date: string): string {
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

function parseQuestion(
  value: unknown,
  position: number
): QuizQuestion {
  if (!value || typeof value !== "object") {
    throw new Error("AI returned an invalid question.");
  }

  const data = value as Record<string, unknown>;

  if (
    data.type !== "multiple_choice" &&
    data.type !== "true_false" &&
    data.type !== "identification"
  ) {
    throw new Error("Unsupported question type.");
  }

  if (
    typeof data.question !== "string" ||
    !data.question.trim() ||
    typeof data.answer !== "string" ||
    !data.answer.trim()
  ) {
    throw new Error("AI returned an incomplete question.");
  }

  let options = Array.isArray(data.options)
    ? data.options.filter(
        (item): item is string =>
          typeof item === "string" &&
          Boolean(item.trim())
      )
    : [];

  if (
    data.type === "multiple_choice" &&
    options.length < 2
  ) {
    throw new Error(
      "Multiple-choice question has insufficient options."
    );
  }

  let answer = data.answer.trim();

  if (data.type === "true_false") {
    options = ["True", "False"];

    answer =
      answer.toLowerCase() === "false"
        ? "False"
        : "True";
  }

  if (data.type === "identification") {
    options = [];
  }

  return {
    id: crypto.randomUUID(),
    position,
    type: data.type as QuestionType,
    question: data.question.trim(),
    options,
    answer,
    explanation:
      typeof data.explanation === "string"
        ? data.explanation.trim()
        : "",
  };
}

export default function QuizzesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const reviewerId = searchParams.get("reviewer");
  const materialId = searchParams.get("material");

  const selectedFromUrl = reviewerId
    ? `reviewer:${reviewerId}`
    : materialId
      ? `material:${materialId}`
      : "";

  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [attempts, setAttempts] =
    useState<QuizAttempt[]>([]);

  const [loading, setLoading] = useState(true);

  const [loadingSources, setLoadingSources] =
    useState(true);

  const [sources, setSources] =
    useState<StudySource[]>([]);

  const [sourceWarning, setSourceWarning] =
    useState("");

  const [open, setOpen] = useState(
    Boolean(selectedFromUrl)
  );

  const [manualOpen, setManualOpen] =
    useState(false);

  const [manual, setManual] = useState({
    title: "",
    subject: "",
    type: "multiple_choice" as QuizType,
  });

  const [form, setForm] = useState<QuizForm>({
    source: selectedFromUrl,
    paste: "",
    type: "multiple_choice",
    count: 10,
    difficulty: "medium",
  });

  const [busy, setBusy] = useState(false);

  const [deletingId, setDeletingId] =
    useState<string | null>(null);

  const [openAttempt, setOpenAttempt] =
    useState<string | null>(null);

  const [error, setError] = useState("");

  // Load saved quizzes and attempts.
  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [quizRecords, attemptRecords] =
          await Promise.all([
            listCloudQuizzes(),
            listCloudQuizAttempts(),
          ]);

        if (!active) return;

        setQuizzes(quizRecords);
        setAttempts(attemptRecords);
      } catch (err) {
        if (!active) return;

        console.error("Quiz library error:", err);

        setError(
          err instanceof Error
            ? err.message
            : "Could not load your quizzes."
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  // Load reviewers and study materials.
  useEffect(() => {
    let active = true;

    async function loadSources() {
      const available: StudySource[] = [];
      const warnings: string[] = [];

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
          throw authError;
        }

        if (!user) {
          throw new Error("Please log in.");
        }

        const {
          data: reviewers,
          error: reviewerError,
        } = await supabase
          .from("reviewers")
          .select("id, title, subject, content")
          .eq("user_id", user.id)
          .order("updated_date", {
            ascending: false,
          });

        if (reviewerError) {
          throw reviewerError;
        }

        for (const reviewer of reviewers ?? []) {
          available.push({
            value: `reviewer:${reviewer.id}`,
            label: `Reviewer · ${reviewer.title}`,
            subject: reviewer.subject ?? "",
            text: reviewer.content ?? "",
          });
        }
      } catch (err) {
        console.error(
          "Reviewer source loading failed:",
          err
        );

        warnings.push(
          "Saved reviewers could not be loaded."
        );
      }

      const [cloudResult, localResult] =
        await Promise.allSettled([
          listCloudMaterials(),
          listMaterials(),
        ]);

      const materialSources =
        new Map<string, StudySource>();

      if (cloudResult.status === "fulfilled") {
        for (const material of cloudResult.value) {
          materialSources.set(material.id, {
            value: `material:${material.id}`,
            label: `Material · ${material.file_name}`,
            subject: "",
            text: material.extracted_text ?? "",
          });
        }
      } else {
        console.error(
          "Cloud materials loading failed:",
          cloudResult.reason
        );

        warnings.push(
          "Cloud materials could not be loaded."
        );
      }

      if (localResult.status === "fulfilled") {
        for (const material of localResult.value) {
          const existing = materialSources.get(
            material.id
          );

          if (existing) {
            if (
              !existing.text.trim() &&
              material.extracted_text
            ) {
              materialSources.set(material.id, {
                ...existing,
                text: material.extracted_text,
              });
            }

            continue;
          }

          materialSources.set(material.id, {
            value: `material:${material.id}`,
            label: `Material · ${material.file_name} (this device)`,
            subject: "",
            text: material.extracted_text ?? "",
          });
        }
      } else {
        console.error(
          "Local materials loading failed:",
          localResult.reason
        );

        warnings.push(
          "Local materials could not be loaded."
        );
      }

      available.push(...materialSources.values());

      if (!active) {
        return;
      }

      setSources(available);
      setSourceWarning(warnings.join(" "));
      setLoadingSources(false);
    }

    void loadSources();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedFromUrl) return;

    setOpen(true);
    setManualOpen(false);

    setForm((current) => ({
      ...current,
      source: selectedFromUrl,
      paste: "",
    }));
  }, [selectedFromUrl]);

  // Manual quiz creation.
  async function createManual(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (busy) return;

    if (!manual.title.trim()) {
      setError("Quiz title is required.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const created = await createCloudQuiz({
        title: manual.title.trim(),
        subject: manual.subject.trim(),
        origin: "manual",
        question_type: manual.type,
        questions: [],
      });

      navigate(
        `/quizzes/${encodeURIComponent(created.id)}`
      );
    } catch (err) {
      console.error("Create quiz failed:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Could not create the quiz."
      );
    } finally {
      setBusy(false);
    }
  }

  // Authenticated AI quiz generation.
  async function generateQuiz(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (busy) return;

    setError("");

    const selectedSource = sources.find(
      (source) => source.value === form.source
    );

    if (form.source && !selectedSource) {
      setError(
        "Selected study source was not found."
      );
      return;
    }

    const text = form.source
      ? selectedSource?.text.trim() ?? ""
      : form.paste.trim();

    if (text.length < 60) {
      setError(
        "Provide at least 60 characters of study material."
      );
      return;
    }

    if (text.length > 20000) {
      setError(
        "Study material must not exceed 20,000 characters."
      );
      return;
    }

    const apiBaseUrl = String(
      import.meta.env.VITE_API_BASE_URL ?? ""
    ).trim();

    if (!apiBaseUrl) {
      setError("AI service is not configured.");
      return;
    }

    setBusy(true);

    try {
      // Verify current login session.
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error(
          "Your session has expired. Please log in again."
        );
      }

      // Send authenticated request.
      const response = await fetch(
        `${apiBaseUrl.replace(/\/$/, "")}/api/quizzes/generate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            text,
            type: form.type,
            count: form.count,
            difficulty: form.difficulty,
          }),
        }
      );

      const rawResponse = await response.text();

      let result: unknown;

      try {
        result = JSON.parse(rawResponse);
      } catch {
        throw new Error(
          "Could not generate the quiz. Please try again later."
        );
      }

      if (!response.ok) {
        const messages: Record<number, string> = {
          400: "Please check your study material and quiz settings.",
          401: "Your session has expired. Please log in again.",
          403: "You do not have permission to use this feature.",
          429: "Too many requests. Please try again later.",
          503: "Quiz generation is temporarily unavailable. Please try again later.",
        };

        throw new Error(
          messages[response.status] ??
            "Could not generate the quiz. Please try again later."
        );
      }

      if (
        !result ||
        typeof result !== "object" ||
        !("questions" in result) ||
        !Array.isArray(result.questions)
      ) {
        throw new Error("Invalid AI quiz response.");
      }

      const questions = result.questions
        .slice(0, form.count)
        .map((item, index) =>
          parseQuestion(item, index)
        );

      if (questions.length === 0) {
        throw new Error(
          "AI did not generate usable questions."
        );
      }

      const title =
        "title" in result &&
        typeof result.title === "string" &&
        result.title.trim()
          ? result.title.trim()
          : "AI Generated Practice Quiz";

      const created = await createCloudQuiz({
        title,
        subject: selectedSource?.subject ?? "",
        origin: "ai",
        question_type: form.type,
        source_label:
          selectedSource?.label ??
          "Pasted material",
        questions,
      });

      navigate(
        `/quizzes/${encodeURIComponent(created.id)}`
      );
    } catch (err) {
      console.error("AI quiz error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Could not generate the quiz."
      );
    } finally {
      setBusy(false);
    }
  }

  // Delete quiz.
  async function removeQuiz(quiz: Quiz) {
    if (deletingId) return;

    const confirmed = window.confirm(
      `Delete "${quiz.title}" and its quiz history?`
    );

    if (!confirmed) return;

    setDeletingId(quiz.id);
    setError("");

    try {
      await deleteCloudQuiz(quiz.id);

      setQuizzes((current) =>
        current.filter(
          (item) => item.id !== quiz.id
        )
      );

      setAttempts((current) =>
        current.filter(
          (attempt) =>
            attempt.quiz_id !== quiz.id
        )
      );
    } catch (err) {
      console.error("Delete quiz failed:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Could not delete the quiz."
      );
    } finally {
      setDeletingId(null);
    }
  }

  function toggleAttempt(id: string) {
    setOpenAttempt((current) =>
      current === id ? null : id
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            Practice
          </p>

          <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.02em] text-foreground">
            Practice quiz
          </h1>

          <p className="mt-1.5 text-sm text-muted-foreground">
            Create practice quizzes, study your
            lessons, and track your scores.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setManualOpen((current) => !current);
              setOpen(false);
              setError("");
            }}
            className="btn btn-secondary"
          >
            <Plus className="h-4 w-4" />
            Create manually
          </button>

          <button
            type="button"
            onClick={() => {
              setOpen((current) => !current);
              setManualOpen(false);
              setError("");
            }}
            className="btn btn-primary"
          >
            <Sparkles className="h-4 w-4" />
            Generate new quiz
          </button>
        </div>
      </header>

      {manualOpen && (
        <form
          onSubmit={(event) => {
            void createManual(event);
          }}
          className="panel space-y-4 p-5 sm:p-6"
        >
          <h2 className="text-sm font-medium text-foreground">
            Create a manual quiz
          </h2>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="label-xs mb-1.5 block">
                Quiz title
              </span>

              <input
                value={manual.title}
                onChange={(event) =>
                  setManual({
                    ...manual,
                    title: event.target.value,
                  })
                }
                placeholder="e.g. Biology Chapter 4"
                className="input"
                required
              />
            </label>

            <label className="block">
              <span className="label-xs mb-1.5 block">
                Subject
              </span>

              <input
                value={manual.subject}
                onChange={(event) =>
                  setManual({
                    ...manual,
                    subject: event.target.value,
                  })
                }
                placeholder="Optional"
                className="input"
              />
            </label>

            <label className="block">
              <span className="label-xs mb-1.5 block">
                Question type
              </span>

              <select
                value={manual.type}
                onChange={(event) =>
                  setManual({
                    ...manual,
                    type: event.target.value as QuizType,
                  })
                }
                className="select"
              >
                {Object.entries(QUESTION_TYPES).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  )
                )}
              </select>
            </label>
          </div>

          {error && (
            <p
              role="alert"
              className="text-[13px] text-destructive"
            >
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setManualOpen(false)}
              disabled={busy}
              className="btn btn-ghost"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={busy}
              className="btn btn-primary btn-sm disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Create quiz
            </button>
          </div>
        </form>
      )}

      {open && (
        <form
          onSubmit={(event) => {
            void generateQuiz(event);
          }}
          className="panel space-y-4 p-5 sm:p-6"
        >
          <div>
            <h2 className="text-sm font-medium text-foreground">
              Generate a quiz with AI
            </h2>

            <p className="mt-1 text-xs text-muted-foreground">
              Select your lesson and quiz settings.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="label-xs mb-1.5 block">
                Study source
              </span>

              <select
                value={form.source}
                onChange={(event) =>
                  setForm({
                    ...form,
                    source: event.target.value,
                    paste: "",
                  })
                }
                disabled={busy || loadingSources}
                className="select"
              >
                <option value="">
                  {loadingSources
                    ? "Loading sources..."
                    : "Paste material instead"}
                </option>

                {sources.map((source) => (
                  <option
                    key={source.value}
                    value={source.value}
                  >
                    {source.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="label-xs mb-1.5 block">
                Question type
              </span>

              <select
                value={form.type}
                onChange={(event) =>
                  setForm({
                    ...form,
                    type: event.target.value as QuizType,
                  })
                }
                disabled={busy}
                className="select"
              >
                {Object.entries(QUESTION_TYPES).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  )
                )}
              </select>
            </label>

            <label className="block">
              <span className="label-xs mb-1.5 block">
                Difficulty
              </span>

              <select
                value={form.difficulty}
                onChange={(event) =>
                  setForm({
                    ...form,
                    difficulty:
                      event.target.value as Difficulty,
                  })
                }
                disabled={busy}
                className="select"
              >
                {Object.entries(DIFFICULTIES).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  )
                )}
              </select>
            </label>

            <label className="block">
              <span className="label-xs mb-1.5 block">
                Questions
              </span>

              <select
                value={form.count}
                onChange={(event) =>
                  setForm({
                    ...form,
                    count: Number(event.target.value),
                  })
                }
                disabled={busy}
                className="select"
              >
                {[5, 10, 15, 20].map((count) => (
                  <option key={count} value={count}>
                    {count} questions
                  </option>
                ))}
              </select>
            </label>
          </div>

          {sourceWarning && (
            <p
              role="status"
              className="text-xs text-muted-foreground"
            >
              {sourceWarning}
            </p>
          )}

          <label className="block">
            <span className="label-xs mb-1.5 block">
              Or paste study notes
            </span>

            <textarea
              value={form.paste}
              onChange={(event) =>
                setForm({
                  ...form,
                  paste: event.target.value,
                  source: "",
                })
              }
              rows={5}
              placeholder="Paste your lesson or study notes here..."
              disabled={busy}
              className="textarea"
            />
          </label>

          {error && (
            <p
              role="alert"
              className="text-[13px] text-destructive"
            >
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="btn btn-ghost"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={busy || loadingSources}
              className="btn btn-primary btn-sm disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}

              {busy
                ? "Generating questions..."
                : "Generate quiz"}
            </button>
          </div>
        </form>
      )}

      {error && !open && !manualOpen && (
        <p
          role="alert"
          className="text-[13px] text-destructive"
        >
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading quizzes...
        </div>
      ) : quizzes.length === 0 ? (
        <div className="panel flex flex-col items-center justify-center px-6 py-14 text-center">
          <ClipboardCheck className="h-9 w-9 text-muted-foreground" />

          <h2 className="mt-4 text-base font-medium text-foreground">
            No quizzes yet
          </h2>

          <p className="mt-2 max-w-sm text-[13px] text-muted-foreground">
            Create a quiz manually or generate one
            from your study materials.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {quizzes.map((quiz) => {
            const quizAttempts = attempts.filter(
              (attempt) => attempt.quiz_id === quiz.id
            );

            const best = quizAttempts.reduce(
              (maximum, attempt) =>
                Math.max(maximum, attempt.percentage),
              0
            );

            return (
              <article
                key={quiz.id}
                className="panel flex flex-col p-5"
              >
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span>
                    {QUESTION_TYPES[quiz.question_type]}
                  </span>

                  <span>
                    {quiz.questions.length} questions
                  </span>
                </div>

                <Link
                  to={`/quizzes/${encodeURIComponent(quiz.id)}`}
                  className="mt-2.5 text-[15px] font-medium leading-snug text-foreground hover:text-primary"
                >
                  {quiz.title}
                </Link>

                <p className="mt-1.5 text-xs text-muted-foreground">
                  {quiz.subject || "General"}
                  {" · "}
                  {formatDate(quiz.created_date)}
                </p>

                <div className="mt-3">
                  {quizAttempts.length > 0 ? (
                    <>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>Your best score</span>

                        <span className="text-foreground">
                          {Math.round(best)}%
                        </span>
                      </div>

                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{
                            width: `${Math.min(
                              Math.max(best, 0),
                              100
                            )}%`,
                          }}
                        />
                      </div>
                    </>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Not taken yet
                    </p>
                  )}
                </div>

                <div className="mt-4 flex items-center gap-2 border-t border-border pt-3.5">
                  <Link
                    to={`/quizzes/${encodeURIComponent(quiz.id)}`}
                    className="btn btn-primary btn-sm"
                  >
                    <Play className="h-3.5 w-3.5" />

                    {quiz.questions.length === 0
                      ? "Open quiz"
                      : quizAttempts.length > 0
                        ? "Retake"
                        : "Start quiz"}
                  </Link>

                  <button
                    type="button"
                    onClick={() => void removeQuiz(quiz)}
                    disabled={deletingId !== null}
                    aria-label={`Delete ${quiz.title}`}
                    title="Delete quiz"
                    className="ml-auto grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    {deletingId === quiz.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <section className="panel overflow-hidden">
        <header className="px-5 py-3.5">
          <h2 className="text-sm font-medium text-foreground">
            Quiz history
          </h2>
        </header>

        {attempts.length === 0 ? (
          <p className="border-t border-border px-5 py-8 text-center text-[13px] text-muted-foreground">
            No attempts recorded yet.
          </p>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {attempts.map((attempt) => (
              <li
                key={attempt.id}
                className="px-5 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] text-foreground">
                      {attempt.quiz_title}
                    </p>

                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {formatDate(attempt.created_date)}
                    </p>
                  </div>

                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                      attempt.percentage >= 75
                        ? "bg-emerald-500/15 text-emerald-400"
                        : attempt.percentage >= 50
                          ? "bg-amber-500/15 text-amber-400"
                          : "bg-destructive/15 text-destructive"
                    }`}
                  >
                    {attempt.score}/{attempt.total}
                    {" · "}
                    {Math.round(attempt.percentage)}%
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      toggleAttempt(attempt.id)
                    }
                    className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    {openAttempt === attempt.id
                      ? "Hide"
                      : "Review"}
                  </button>
                </div>

                {openAttempt === attempt.id && (
                  <ul className="mt-3 space-y-3 rounded-lg border border-border bg-background/40 p-3">
                    {attempt.answers.length === 0 ? (
                      <li className="text-xs text-muted-foreground">
                        No detailed answers saved.
                      </li>
                    ) : (
                      attempt.answers.map((answer) => (
                        <li
                          key={answer.id}
                          className="text-xs"
                        >
                          <p className="text-foreground/90">
                            {answer.question}
                          </p>

                          <p
                            className={
                              answer.is_correct
                                ? "mt-1 text-emerald-400"
                                : "mt-1 text-destructive"
                            }
                          >
                            {answer.is_correct
                              ? "Correct"
                              : `Your answer: ${
                                  answer.given_answer ||
                                  "—"
                                }`}
                          </p>

                          {!answer.is_correct && (
                            <p className="mt-1 text-muted-foreground">
                              Correct answer:{" "}
                              {answer.correct_answer}
                            </p>
                          )}

                          {answer.explanation && (
                            <p className="mt-1 text-muted-foreground">
                              {answer.explanation}
                            </p>
                          )}
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
