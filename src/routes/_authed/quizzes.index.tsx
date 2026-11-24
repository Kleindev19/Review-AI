
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import {
  CheckCircle2,
  ClipboardCheck,
  Download,
  Loader2,
  Play,
  Plus,
  Sparkles,
  Trash2,
  WifiOff,
} from "lucide-react";

import {
  createCloudQuiz,
  deleteCloudQuiz,
  listCloudQuizzes,
  listCloudQuizAttempts,
  listOfflineQuizzes,
  listOfflineQuizAttempts,
  removeOfflineQuiz,
  removeOfflineQuizAttempt,
  saveQuizForOffline,
  getExamPlan,
  examPart,
  sortExamQuestions,
  enumerationItems,
  type Quiz,
  type QuizAttempt,
  type QuizQuestion,
  type QuizType,
} from "../../lib/quizStore";

import { listMaterials } from "../../lib/materialStore";
import { listCloudMaterials } from "../../lib/cloudMaterialStore";
import { supabase } from "../../lib/supabaseClient";

// TYPES

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

type LibraryTab = "online" | "downloaded";

// CONSTANTS

const QUESTION_TYPES: Record<QuizType, string> = {
  multiple_choice: "Multiple choice",
  true_false: "True or false",
  identification: "Identification",
  mixed: "Mixed (exam format)",
};

const DIFFICULTIES: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

const QUESTION_COUNTS = [
  5, 10, 15, 20, 25, 30,
  35, 40, 45, 50, 55, 60,
];

// HELPERS

function formatDate(value: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Unknown date"
    : date.toLocaleDateString("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

function errorText(value: unknown, fallback: string): string {
  return value instanceof Error ? value.message : fallback;
}

function parseQuestion(value: unknown, position: number): QuizQuestion {
  if (!value || typeof value !== "object") {
    throw new Error("AI returned an invalid question.");
  }

  const data = value as Record<string, unknown>;

  if (
    data.type !== "multiple_choice" &&
    data.type !== "true_false" &&
    data.type !== "identification" &&
    data.type !== "enumeration"
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
    ? data.options
        .filter(
          (item): item is string =>
            typeof item === "string" && Boolean(item.trim())
        )
        .map((item) => item.trim())
    : [];

  let answer = data.answer.trim();

  if (data.type === "multiple_choice") {
    if (
      options.length !== 4 ||
      new Set(options.map((item) => item.toLowerCase())).size !== 4
    ) {
      throw new Error("Invalid multiple-choice options.");
    }

    const correct = options.find(
      (option) => option.toLowerCase() === answer.toLowerCase()
    );

    if (!correct) {
      throw new Error("Invalid multiple-choice answer.");
    }

    answer = correct;
  }

  if (data.type === "true_false") {
    if (!/^(true|false)$/i.test(answer)) {
      throw new Error("Invalid true or false answer.");
    }

    options = ["True", "False"];

    answer = answer.toLowerCase() === "false" ? "False" : "True";
  }

  if (data.type === "identification" || data.type === "enumeration") {
    options = [];
  }

  if (data.type === "enumeration") {
    const items = enumerationItems(answer);

    if (
      items.length < 2 ||
      new Set(items).size !== items.length
    ) {
      throw new Error("Invalid enumeration answer.");
    }
  }

  return {
    id: crypto.randomUUID(),
    position,
    type: data.type,
    question: data.question.trim(),
    options,
    answer,
    explanation:
      typeof data.explanation === "string"
        ? data.explanation.trim()
        : "",
  };
}

// MAIN PAGE

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

  // DATA STATES

  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);

  const [downloaded, setDownloaded] = useState<Quiz[]>([]);
  const [offlineAttempts, setOfflineAttempts] =
    useState<QuizAttempt[]>([]);

  const [tab, setTab] = useState<LibraryTab>(
    navigator.onLine ? "online" : "downloaded"
  );

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [loading, setLoading] = useState(navigator.onLine);
  const [loadingOffline, setLoadingOffline] = useState(true);
  const [loadingSources, setLoadingSources] =
    useState(navigator.onLine);

  const [sources, setSources] = useState<StudySource[]>([]);
  const [sourceWarning, setSourceWarning] = useState("");

  const [error, setError] = useState("");
  const [offlineError, setOfflineError] = useState("");

  // FORM STATES

  const [open, setOpen] = useState(Boolean(selectedFromUrl));
  const [manualOpen, setManualOpen] = useState(false);

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

  const [downloadingId, setDownloadingId] =
    useState<string | null>(null);

  const [removingId, setRemovingId] =
    useState<string | null>(null);

  const [openAttempt, setOpenAttempt] =
    useState<string | null>(null);

  // LOAD CLOUD QUIZZES

  useEffect(() => {
    let active = true;

    async function loadCloud() {
      if (!navigator.onLine) {
        if (active) setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const [quizList, history] = await Promise.all([
          listCloudQuizzes(),
          listCloudQuizAttempts(),
        ]);

        if (!active) return;

        setQuizzes(quizList);
        setAttempts(history);
      } catch (err) {
        if (active && navigator.onLine) {
          setError(errorText(err, "Could not load online quizzes."));
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    function onOnline() {
      setIsOnline(true);
      void loadCloud();
    }

    function onOffline() {
      setIsOnline(false);
      setTab("downloaded");
      setLoading(false);
    }

    void loadCloud();

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      active = false;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // LOAD DOWNLOADED QUIZZES

  useEffect(() => {
    let active = true;

    async function loadLocal() {
      try {
        const [quizList, history] = await Promise.all([
          listOfflineQuizzes(),
          listOfflineQuizAttempts(),
        ]);

        if (!active) return;

        setDownloaded(quizList);
        setOfflineAttempts(history);
      } catch (err) {
        if (active) {
          setOfflineError(
            errorText(err, "Cannot read downloaded quizzes.")
          );
        }
      } finally {
        if (active) setLoadingOffline(false);
      }
    }

    void loadLocal();

    return () => {
      active = false;
    };
  }, []);

  // LOAD STUDY MATERIALS

  useEffect(() => {
    let active = true;

    async function loadSources() {
      if (!navigator.onLine) {
        if (active) {
          setLoadingSources(false);
          setSourceWarning("AI quiz generation requires internet.");
        }
        return;
      }

      setLoadingSources(true);

      const available: StudySource[] = [];
      const warnings: string[] = [];

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
          throw authError ?? new Error("Please log in.");
        }

        const {
          data: reviewers,
          error: reviewerError,
        } = await supabase
          .from("reviewers")
          .select("id, title, subject, content")
          .eq("user_id", user.id)
          .order("updated_date", { ascending: false });

        if (reviewerError) throw reviewerError;

        for (const reviewer of reviewers ?? []) {
          available.push({
            value: `reviewer:${reviewer.id}`,
            label: `Reviewer · ${reviewer.title}`,
            subject: reviewer.subject ?? "",
            text: reviewer.content ?? "",
          });
        }
      } catch (err) {
        console.error("Reviewer source loading failed:", err);
        warnings.push("Saved reviewers could not be loaded.");
      }

      const [cloudResult, localResult] =
        await Promise.allSettled([
          listCloudMaterials(),
          listMaterials(),
        ]);

      const materialSources = new Map<string, StudySource>();

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
        warnings.push("Cloud materials could not be loaded.");
      }

      if (localResult.status === "fulfilled") {
        for (const material of localResult.value) {
          const existing = materialSources.get(material.id);

          if (existing) {
            if (!existing.text.trim() && material.extracted_text) {
              materialSources.set(material.id, {
                ...existing,
                text: material.extracted_text,
              });
            }
          } else {
            materialSources.set(material.id, {
              value: `material:${material.id}`,
              label: `Material · ${material.file_name} (this device)`,
              subject: "",
              text: material.extracted_text ?? "",
            });
          }
        }
      } else {
        warnings.push("Local materials could not be loaded.");
      }

      available.push(...materialSources.values());

      if (!active) return;

      setSources(available);
      setSourceWarning(warnings.join(" "));
      setLoadingSources(false);
    }

    function onOnline() {
      void loadSources();
    }

    void loadSources();

    window.addEventListener("online", onOnline);

    return () => {
      active = false;
      window.removeEventListener("online", onOnline);
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

  // CREATE MANUAL QUIZ

  async function createManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy) return;

    if (!navigator.onLine) {
      setError("Creating quizzes requires internet.");
      return;
    }

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

      navigate(`/quizzes/${encodeURIComponent(created.id)}`);
    } catch (err) {
      setError(errorText(err, "Could not create the quiz."));
    } finally {
      setBusy(false);
    }
  }

  // GENERATE AI EXAM

  async function generateQuiz(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy) return;

    if (!navigator.onLine) {
      setError("AI quiz generation requires internet.");
      return;
    }

    setError("");

    if (!Number.isInteger(form.count) || form.count < 1 || form.count > 60) {
      setError("Choose between 1 and 60 questions.");
      return;
    }

    const selectedSource = sources.find(
      (source) => source.value === form.source
    );

    if (form.source && !selectedSource) {
      setError("Selected study source was not found.");
      return;
    }

    const text = form.source
      ? selectedSource?.text.trim() ?? ""
      : form.paste.trim();

    if (text.length < 60) {
      setError("Provide at least 60 characters of study material.");
      return;
    }

    if (text.length > 100000) {
      setError("Study material must not exceed 100,000 characters.");
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
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("Your session has expired. Please log in again.");
      }

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

      let result: unknown;

      try {
        result = await response.json();
      } catch {
        throw new Error("Could not generate the quiz. Please try again later.");
      }

      if (!response.ok) {
        const apiError =
          result &&
          typeof result === "object" &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : null;

        const messages: Record<number, string> = {
          400: "Please check your study material and quiz settings.",
          401: "Your session has expired. Please log in again.",
          403: "You do not have permission to use this feature.",
          422: "Not enough supported questions could be generated.",
          429: "AI rate limit reached. Please try again later.",
          503: "Quiz generation is temporarily unavailable.",
        };

        throw new Error(
          apiError ??
          messages[response.status] ??
          "Could not generate the quiz."
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

      if (result.questions.length !== form.count) {
        throw new Error("The generated exam is incomplete.");
      }

      const parsed = result.questions.map(
        (item, index) => parseQuestion(item, index)
      );

      // Validate exact section counts.

      if (form.type === "mixed") {
        for (const part of getExamPlan(form.count)) {
          const actual = parsed.filter(
            (question) => question.type === part.type
          ).length;

          if (actual !== part.count) {
            throw new Error(
              `${part.title} is incomplete. Please try again.`
            );
          }
        }
      } else if (
        parsed.some((question) => question.type !== form.type)
      ) {
        throw new Error("The AI returned an incorrect question type.");
      }

      const questions = sortExamQuestions(
        parsed,
        form.type === "mixed"
      ).map((question, position) => ({
        ...question,
        position,
      }));

      const title =
        "title" in result &&
        typeof result.title === "string" &&
        result.title.trim()
          ? result.title.trim()
          : "AI Generated Practice Exam";

      const created = await createCloudQuiz({
        title,
        subject: selectedSource?.subject ?? "",
        origin: "ai",
        question_type: form.type,
        source_label: selectedSource?.label ?? "Pasted material",
        questions,
      });

      navigate(`/quizzes/${encodeURIComponent(created.id)}`);
    } catch (err) {
      console.error("AI quiz error:", err);
      setError(errorText(err, "Could not generate the quiz."));
    } finally {
      setBusy(false);
    }
  }

  // SAVE OFFLINE

  async function downloadQuiz(quiz: Quiz) {
    if (!navigator.onLine || downloadingId || deletingId) return;

    setDownloadingId(quiz.id);
    setError("");

    try {
      await saveQuizForOffline(quiz);

      setDownloaded((current) => [
        quiz,
        ...current.filter((item) => item.id !== quiz.id),
      ]);
    } catch (err) {
      setError(errorText(err, "Could not save quiz offline."));
    } finally {
      setDownloadingId(null);
    }
  }

  // REMOVE OFFLINE COPY

  async function removeDownload(quiz: Quiz) {
    if (removingId || deletingId) return;

    if (
      !window.confirm(
        `Remove the offline download of "${quiz.title}"? Your online quiz and history will remain.`
      )
    ) {
      return;
    }

    setRemovingId(quiz.id);
    setError("");

    try {
      await removeOfflineQuiz(quiz.id);

      setDownloaded((current) =>
        current.filter((item) => item.id !== quiz.id)
      );
    } catch (err) {
      setError(errorText(err, "Could not remove the download."));
    } finally {
      setRemovingId(null);
    }
  }

  // DELETE CLOUD QUIZ

  async function removeQuiz(quiz: Quiz) {
    if (deletingId || !navigator.onLine) return;

    if (
      !window.confirm(
        `Delete "${quiz.title}" and its quiz history, including downloaded copies on this device?`
      )
    ) {
      return;
    }

    setDeletingId(quiz.id);
    setError("");

    try {
      await deleteCloudQuiz(quiz.id);

      setQuizzes((current) =>
        current.filter((item) => item.id !== quiz.id)
      );

      setAttempts((current) =>
        current.filter((attempt) => attempt.quiz_id !== quiz.id)
      );

      try {
        await removeOfflineQuiz(quiz.id);

        for (const attempt of offlineAttempts.filter(
          (item) => item.quiz_id === quiz.id
        )) {
          await removeOfflineQuizAttempt(attempt.id);
        }

        setDownloaded((current) =>
          current.filter((item) => item.id !== quiz.id)
        );

        setOfflineAttempts((current) =>
          current.filter((item) => item.quiz_id !== quiz.id)
        );
      } catch (err) {
        console.error("Local deletion failed:", err);

        setError(
          "Quiz deleted online, but some device-only data could not be removed."
        );
      }
    } catch (err) {
      setError(errorText(err, "Could not delete the quiz."));
    } finally {
      setDeletingId(null);
    }
  }

  // DISPLAY DATA

  const downloadedIds = new Set(
    downloaded.map((quiz) => quiz.id)
  );

  const localAttemptIds = new Set(
    offlineAttempts.map((attempt) => attempt.id)
  );

  const allAttempts = [
    ...attempts.filter((attempt) => !localAttemptIds.has(attempt.id)),
    ...offlineAttempts,
  ].sort(
    (a, b) =>
      new Date(b.created_date).getTime() -
      new Date(a.created_date).getTime()
  );

  const shownQuizzes = tab === "downloaded" ? downloaded : quizzes;

  const shownAttempts =
    tab === "downloaded" ? offlineAttempts : allAttempts;

  const pageLoading =
    tab === "downloaded" ? loadingOffline : loading;

  const examPlan = getExamPlan(form.count);

  // PAGE UI

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
            Create practice quizzes, study your lessons, and track your scores.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!isOnline || busy}
            onClick={() => {
              setManualOpen((current) => !current);
              setOpen(false);
              setError("");
            }}
            className="btn btn-secondary disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Create manually
          </button>

          <button
            type="button"
            disabled={!isOnline || busy}
            onClick={() => {
              setOpen((current) => !current);
              setManualOpen(false);
              setError("");
            }}
            className="btn btn-primary disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            Generate new quiz
          </button>
        </div>
      </header>

      {/* LIBRARY TABS */}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={tab === "online"}
          onClick={() => setTab("online")}
          className={`chip ${tab === "online" ? "chip-active" : ""}`}
        >
          <ClipboardCheck className="h-3.5 w-3.5" />
          All Quizzes ({quizzes.length})
        </button>

        <button
          type="button"
          aria-pressed={tab === "downloaded"}
          onClick={() => setTab("downloaded")}
          className={`chip ${tab === "downloaded" ? "chip-active" : ""}`}
        >
          <Download className="h-3.5 w-3.5" />
          Downloaded ({downloaded.length})
        </button>
      </div>

      {!isOnline && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <WifiOff className="h-4 w-4" />
          You're offline. Your downloaded quizzes are available to practice.
        </p>
      )}

      {tab === "downloaded" && offlineError && (
        <p role="alert" className="text-xs text-destructive">
          {offlineError}
        </p>
      )}

      {/* MANUAL QUIZ FORM */}

      {manualOpen && isOnline && (
        <form
          onSubmit={(event) => void createManual(event)}
          className="panel space-y-4 p-5 sm:p-6"
        >
          <h2 className="text-sm font-medium text-foreground">
            Create a manual quiz
          </h2>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="label-xs mb-1.5 block">Quiz title</span>

              <input
                className="input"
                required
                disabled={busy}
                placeholder="e.g. Biology Chapter 4"
                value={manual.title}
                onChange={(event) =>
                  setManual({ ...manual, title: event.target.value })
                }
              />
            </label>

            <label className="block">
              <span className="label-xs mb-1.5 block">Subject</span>

              <input
                className="input"
                disabled={busy}
                placeholder="Optional"
                value={manual.subject}
                onChange={(event) =>
                  setManual({ ...manual, subject: event.target.value })
                }
              />
            </label>

            <label className="block">
              <span className="label-xs mb-1.5 block">Question type</span>

              <select
                className="select"
                disabled={busy}
                value={manual.type}
                onChange={(event) =>
                  setManual({
                    ...manual,
                    type: event.target.value as QuizType,
                  })
                }
              >
                {Object.entries(QUESTION_TYPES).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </div>

          {error && (
            <p role="alert" className="text-[13px] text-destructive">
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
              {busy
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Plus className="h-4 w-4" />}
              Create quiz
            </button>
          </div>
        </form>
      )}

      {/* AI EXAM GENERATOR */}

      {open && isOnline && (
        <form
          onSubmit={(event) => void generateQuiz(event)}
          className="panel space-y-4 p-5 sm:p-6"
        >
          <div>
            <h2 className="text-sm font-medium text-foreground">
              Generate a quiz with AI
            </h2>

            <p className="mt-1 text-xs text-muted-foreground">
              Select your study material and exam settings.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="label-xs mb-1.5 block">Study source</span>

              <select
                className="select"
                disabled={busy || loadingSources}
                value={form.source}
                onChange={(event) =>
                  setForm({
                    ...form,
                    source: event.target.value,
                    paste: "",
                  })
                }
              >
                <option value="">
                  {loadingSources
                    ? "Loading sources..."
                    : "Paste material instead"}
                </option>

                {sources.map((source) => (
                  <option key={source.value} value={source.value}>
                    {source.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="label-xs mb-1.5 block">Question type</span>

              <select
                className="select"
                disabled={busy}
                value={form.type}
                onChange={(event) =>
                  setForm({
                    ...form,
                    type: event.target.value as QuizType,
                  })
                }
              >
                {Object.entries(QUESTION_TYPES).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="label-xs mb-1.5 block">Difficulty</span>

              <select
                className="select"
                disabled={busy}
                value={form.difficulty}
                onChange={(event) =>
                  setForm({
                    ...form,
                    difficulty: event.target.value as Difficulty,
                  })
                }
              >
                {Object.entries(DIFFICULTIES).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="label-xs mb-1.5 block">Questions</span>

              <select
                className="select"
                disabled={busy}
                value={form.count}
                onChange={(event) =>
                  setForm({
                    ...form,
                    count: Number(event.target.value),
                  })
                }
              >
                {QUESTION_COUNTS.map((count) => (
                  <option key={count} value={count}>
                    {count} questions
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* MIXED EXAM PREVIEW */}

          {form.type === "mixed" && (
            <section className="rounded-xl border border-border bg-secondary/30 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-foreground">
                  Exam structure
                </h3>

                <span className="text-xs text-muted-foreground">
                  {form.count} items
                </span>
              </div>

              <div className="mt-3 divide-y divide-border">
                {examPlan.map((part, index) => {
                  const start =
                    examPlan
                      .slice(0, index)
                      .reduce((sum, item) => sum + item.count, 0) + 1;

                  return (
                    <div
                      key={part.type}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <div>
                        <p className="text-xs font-semibold text-foreground">
                          {part.title}
                        </p>

                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Items {start}–{start + part.count - 1}
                        </p>
                      </div>

                      <span className="shrink-0 text-xs text-muted-foreground">
                        {part.count} items
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {sourceWarning && (
            <p role="status" className="text-xs text-muted-foreground">
              {sourceWarning}
            </p>
          )}

          <label className="block">
            <span className="label-xs mb-1.5 block">
              Or paste study notes
            </span>

            <textarea
              className="textarea"
              rows={5}
              disabled={busy}
              placeholder="Paste your lesson or study notes here..."
              value={form.paste}
              onChange={(event) =>
                setForm({
                  ...form,
                  paste: event.target.value,
                  source: "",
                })
              }
            />
          </label>

          {form.count > 20 && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Larger exams require enough study material and may use several AI requests.
            </p>
          )}

          {busy && (
            <div
              role="status"
              className="flex items-center gap-3 rounded-xl border border-border bg-secondary/30 p-3"
            >
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />

              <div>
                <p className="text-sm font-medium text-foreground">
                  Generating {form.count} questions...
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  {form.type === "mixed"
                    ? "Preparing the exam sections and checking question counts."
                    : "Preparing and validating your questions."}
                </p>
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="text-[13px] text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              disabled={busy}
              onClick={() => setOpen(false)}
              className="btn btn-ghost"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={busy || loadingSources}
              className="btn btn-primary btn-sm disabled:opacity-50"
            >
              {busy
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Sparkles className="h-4 w-4" />}

              {busy ? "Generating questions..." : "Generate quiz"}
            </button>
          </div>
        </form>
      )}

      {error && (!open || !isOnline) && !manualOpen && (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}

      {/* QUIZ LIBRARY */}

      {pageLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading quizzes...
        </div>
      ) : shownQuizzes.length === 0 ? (
        <div className="panel flex flex-col items-center justify-center px-6 py-14 text-center">
          <ClipboardCheck className="h-9 w-9 text-muted-foreground" />

          <h2 className="mt-4 text-base font-medium text-foreground">
            {tab === "downloaded"
              ? "No downloaded quizzes yet"
              : "No quizzes yet"}
          </h2>

          <p className="mt-2 max-w-sm text-[13px] text-muted-foreground">
            {tab === "downloaded"
              ? "While online, open a quiz and select Save for Offline."
              : "Create a quiz manually or generate one from your study materials."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {shownQuizzes.map((quiz) => {
            const quizAttempts = shownAttempts.filter(
              (attempt) => attempt.quiz_id === quiz.id
            );

            const best = quizAttempts.reduce(
              (maximum, attempt) =>
                Math.max(maximum, attempt.percentage),
              0
            );

            const path = `/quizzes/${encodeURIComponent(quiz.id)}`;

            return (
              <article key={quiz.id} className="panel flex flex-col p-5">
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span>{QUESTION_TYPES[quiz.question_type]}</span>
                  <span>{quiz.questions.length} questions</span>
                </div>

                <Link
                  to={path}
                  className="mt-2.5 text-[15px] font-medium leading-snug text-foreground hover:text-primary"
                >
                  {quiz.title}
                </Link>

                <p className="mt-1.5 text-xs text-muted-foreground">
                  {quiz.subject || "General"} · {formatDate(quiz.created_date)}
                </p>

                {downloadedIds.has(quiz.id) && (
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    Saved Offline
                  </p>
                )}

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
                            width: `${Math.min(Math.max(best, 0), 100)}%`,
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

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3.5">
                  <Link to={path} className="btn btn-primary btn-sm">
                    <Play className="h-3.5 w-3.5" />

                    {quiz.questions.length === 0
                      ? "Open quiz"
                      : quizAttempts.length > 0
                        ? "Retake"
                        : "Start quiz"}
                  </Link>

                  {tab === "online" && (
                    <button
                      type="button"
                      onClick={() => void downloadQuiz(quiz)}
                      disabled={
                        !isOnline ||
                        !!downloadingId ||
                        !!deletingId
                      }
                      title={
                        downloadedIds.has(quiz.id)
                          ? "Update offline copy"
                          : "Save for Offline"
                      }
                      className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                      {downloadingId === quiz.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Download className="h-3.5 w-3.5" />}

                      {downloadedIds.has(quiz.id)
                        ? "Update"
                        : "Save offline"}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      void (
                        tab === "downloaded"
                          ? removeDownload(quiz)
                          : removeQuiz(quiz)
                      )
                    }
                    disabled={
                      !!deletingId ||
                      !!removingId ||
                      !!downloadingId ||
                      (tab === "online" && !isOnline)
                    }
                    aria-label={
                      tab === "downloaded"
                        ? `Remove offline copy of ${quiz.title}`
                        : `Delete ${quiz.title}`
                    }
                    className={`${tab === "downloaded" ? "ml-auto " : ""}grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:text-destructive disabled:opacity-50`}
                  >
                    {deletingId === quiz.id || removingId === quiz.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* QUIZ HISTORY */}

      <section className="panel overflow-hidden">
        <header className="px-5 py-3.5">
          <h2 className="text-sm font-medium text-foreground">
            {tab === "downloaded"
              ? "Offline quiz history"
              : "Quiz history"}
          </h2>
        </header>

        {shownAttempts.length === 0 ? (
          <p className="border-t border-border px-5 py-8 text-center text-[13px] text-muted-foreground">
            No attempts recorded yet.
          </p>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {shownAttempts.map((attempt) => (
              <li key={attempt.id} className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] text-foreground">
                      {attempt.quiz_title}
                    </p>

                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {formatDate(attempt.created_date)}

                      {localAttemptIds.has(attempt.id)
                        ? " · Saved on this device only"
                        : ""}
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
                    {attempt.score}/{attempt.total} · {Math.round(attempt.percentage)}%
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      setOpenAttempt((current) =>
                        current === attempt.id ? null : attempt.id
                      )
                    }
                    className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    {openAttempt === attempt.id ? "Hide" : "Review"}
                  </button>
                </div>

                {openAttempt === attempt.id && (
                  <ul className="mt-3 space-y-3 rounded-lg border border-border bg-background/40 p-3">
                    {attempt.answers.length === 0 ? (
                      <li className="text-xs text-muted-foreground">
                        No detailed answers saved.
                      </li>
                    ) : (
                      attempt.answers.map((answer, index) => (
                        <li key={answer.id} className="text-xs">
                          {answer.type &&
                            new Set(
                              attempt.answers.map((item) => item.type)
                            ).size > 1 &&
                            (index === 0 ||
                              attempt.answers[index - 1].type !== answer.type) && (
                              <p className="mb-3 border-b border-border pb-2 font-semibold text-foreground">
                                {examPart(answer.type)?.title}
                              </p>
                            )}

                          <p className="text-foreground/90">
                            {index + 1}. {answer.question}
                          </p>

                          <p
                            className={`mt-1 whitespace-pre-wrap ${
                              answer.is_correct
                                ? "text-emerald-400"
                                : "text-destructive"
                            }`}
                          >
                            {answer.is_correct
                              ? "Correct"
                              : `Your answer: ${answer.given_answer || "—"}`}
                          </p>

                          {!answer.is_correct && (
                            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                              Correct answer: {answer.correct_answer}
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
