
import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  WifiOff,
  X,
} from "lucide-react";

import {
  getCloudQuiz,
  getOfflineQuiz,
  saveQuizForOffline,
  saveOfflineQuizAttempt,
  updateCloudQuiz,
  saveCloudQuizAttempt,
  EXAM_PARTS,
  examPart,
  sortExamQuestions,
  checkEnumeration,
  enumerationItems,
  type Quiz,
  type QuizQuestion,
  type QuestionType,
  type QuizAttempt,
} from "../../lib/quizStore";

// TYPES

type QuestionDraft = {
  type: QuestionType;
  question: string;
  options: string[];
  correctIndex: number;
  answer: string;
  explanation: string;
};

type GradedAnswer = {
  question: QuizQuestion;
  given: string;
  correctAnswer: string;
  isCorrect: boolean;
};

type QuizResult = {
  score: number;
  total: number;
  percentage: number;
  graded: GradedAnswer[];
};

// CONSTANTS

const QUESTION_TYPES = {
  multiple_choice: "Multiple choice",
  true_false: "True or false",
  identification: "Identification",
  enumeration: "Enumeration",
  mixed: "Mixed exam",
};

const LETTERS = ["A", "B", "C", "D", "E", "F"];

// HELPERS

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function makeDraft(
  type: QuestionType = "multiple_choice"
): QuestionDraft {
  return {
    type,
    question: "",
    options: ["", "", "", ""],
    correctIndex: 0,
    answer: type === "true_false" ? "True" : "",
    explanation: "",
  };
}

function resolveCorrectAnswer(question: QuizQuestion): string {
  const answer = question.answer.trim();

  if (question.type !== "multiple_choice") {
    return answer;
  }

  const directMatch = question.options.find(
    (option) => normalize(option) === normalize(answer)
  );

  if (directMatch) return directMatch;

  if (/^[A-F]$/i.test(answer)) {
    const index = answer.toUpperCase().charCodeAt(0) - 65;
    return question.options[index] ?? answer;
  }

  return answer;
}

function getQuestionOptions(question: QuizQuestion): string[] {
  if (question.type === "true_false") {
    return ["True", "False"];
  }

  if (question.type === "multiple_choice") {
    return question.options;
  }

  return [];
}

function formatAnswer(value: string, type: QuestionType): string {
  return type === "enumeration"
    ? value
        .split(/[;\n]+/)
        .map((item) => item.trim())
        .filter(Boolean)
        .join("\n")
    : value;
}

// MAIN QUIZ PAGE

export default function QuizPage() {
  const { quizId } = useParams<{ quizId: string }>();

  // QUIZ STATES

  const [quiz, setQuiz] = useState<Quiz | null>(null);

  const [answers, setAnswers] =
    useState<Record<string, string>>({});

  const [result, setResult] = useState<QuizResult | null>(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // OFFLINE STATES

  const [isOnline, setIsOnline] =
    useState(() => navigator.onLine);

  const [usingOffline, setUsingOffline] = useState(false);
  const [hasOfflineCopy, setHasOfflineCopy] = useState(false);
  const [offlineNeedsUpdate, setOfflineNeedsUpdate] = useState(false);
  const [savingOffline, setSavingOffline] = useState(false);
  const [resultSaveNote, setResultSaveNote] = useState("");

  // MANUAL EDITOR STATES

  const [editorOpen, setEditorOpen] = useState(false);

  const [editingId, setEditingId] =
    useState<string | null>(null);

  const [draft, setDraft] =
    useState<QuestionDraft>(makeDraft());

  // ONLINE/OFFLINE LISTENER

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // LOAD QUIZ

  useEffect(() => {
    let active = true;

    async function loadQuiz() {
      setLoading(true);
      setError("");
      setQuiz(null);
      setAnswers({});
      setResult(null);
      setResultSaveNote("");
      setEditorOpen(false);
      setEditingId(null);
      setUsingOffline(false);
      setHasOfflineCopy(false);
      setOfflineNeedsUpdate(false);

      try {
        if (!quizId) {
          throw new Error("Invalid quiz.");
        }

        let localQuiz: Quiz | null = null;

        try {
          localQuiz = await getOfflineQuiz(quizId);
        } catch (offlineError) {
          console.warn("Offline quiz lookup unavailable:", offlineError);
        }

        if (!active) return;

        setHasOfflineCopy(Boolean(localQuiz));

        let record: Quiz | null = null;
        let offlineSource = false;

        if (!navigator.onLine) {
          record = localQuiz;
          offlineSource = true;

          if (!record) {
            throw new Error(
              "No downloaded copy of this quiz was found. Open it online and select Save for Offline first."
            );
          }
        } else {
          try {
            record = await getCloudQuiz(quizId);
          } catch (cloudError) {
            if (!localQuiz) throw cloudError;

            record = localQuiz;
            offlineSource = true;
          }

          if (!record && localQuiz) {
            record = localQuiz;
            offlineSource = true;
          }
        }

        if (!active) return;

        setQuiz(record);
        setUsingOffline(offlineSource);

        if (record) {
          setDraft(
            makeDraft(
              record.question_type === "mixed"
                ? "multiple_choice"
                : record.question_type
            )
          );
        }
      } catch (err) {
        if (!active) return;

        console.error("Quiz loading failed:", err);

        setError(
          err instanceof Error
            ? err.message
            : "Could not load this quiz."
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadQuiz();

    return () => {
      active = false;
    };
  }, [quizId]);

  // SAVE OFFLINE

  async function downloadQuiz() {
    if (!quiz || savingOffline || busy || !isOnline || usingOffline) {
      return;
    }

    setSavingOffline(true);
    setError("");

    try {
      await saveQuizForOffline(quiz);
      setHasOfflineCopy(true);
      setOfflineNeedsUpdate(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save this quiz offline."
      );
    } finally {
      setSavingOffline(false);
    }
  }

  // ORGANIZED EXAM QUESTIONS

  const mixed = quiz?.question_type === "mixed";

  const questions = quiz
    ? sortExamQuestions(quiz.questions, mixed)
    : [];

  const answeredCount = questions.filter(
    (question) => Boolean((answers[question.id] ?? "").trim())
  ).length;

  const answeredPercent = questions.length
    ? Math.round((answeredCount / questions.length) * 100)
    : 0;

  const sections = EXAM_PARTS.map((part) => ({
    ...part,
    questions: questions.filter(
      (question) => question.type === part.type
    ),
  })).filter((part) => part.questions.length > 0);

  function setAnswer(questionId: string, value: string) {
    if (busy) return;

    setAnswers((current) => ({
      ...current,
      [questionId]: value,
    }));
  }

  // OPEN MANUAL EDITOR

  function openAddQuestion() {
    if (!quiz || busy || !isOnline || usingOffline) return;

    setDraft(
      makeDraft(
        quiz.question_type === "mixed"
          ? "multiple_choice"
          : quiz.question_type
      )
    );

    setEditingId(null);
    setEditorOpen(true);
    setError("");
  }

  function openEditQuestion(question: QuizQuestion) {
    if (busy || !isOnline || usingOffline) return;

    const correctAnswer = resolveCorrectAnswer(question);

    const options = [...question.options];

    while (options.length < 4) {
      options.push("");
    }

    const correctIndex = question.options.findIndex(
      (option) =>
        normalize(option) === normalize(correctAnswer)
    );

    setDraft({
      type: question.type,
      question: question.question,
      options,
      correctIndex: Math.max(correctIndex, 0),
      answer: correctAnswer,
      explanation: question.explanation ?? "",
    });

    setEditingId(question.id);
    setEditorOpen(true);
    setError("");

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditingId(null);
    setError("");
  }

  // SAVE MANUAL QUESTION

  async function saveQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !quiz ||
      quiz.origin !== "manual" ||
      !isOnline ||
      usingOffline ||
      busy
    ) {
      return;
    }

    const questionText = draft.question.trim();

    if (!questionText) {
      setError("Question text is required.");
      return;
    }

    const options =
      draft.type === "multiple_choice"
        ? draft.options.map((item) => item.trim())
        : [];

    let answer = draft.answer.trim();

    if (draft.type === "multiple_choice") {
      const validOptions = options.filter(Boolean);

      if (validOptions.length < 2) {
        setError("Multiple choice requires at least two options.");
        return;
      }

      if (
        new Set(validOptions.map(normalize)).size !== validOptions.length
      ) {
        setError("Answer options must be distinct.");
        return;
      }

      answer = options[draft.correctIndex] ?? "";

      if (!answer) {
        setError("Select a valid correct answer.");
        return;
      }
    }

    if (draft.type === "true_false") {
      answer = normalize(answer) === "false" ? "False" : "True";
    }

    if (draft.type === "identification" && !answer) {
      setError("Enter the correct answer.");
      return;
    }

    if (draft.type === "enumeration") {
      const items = enumerationItems(answer);

      if (
        items.length < 2 ||
        new Set(items).size !== items.length
      ) {
        setError(
          "Enter at least two distinct answers separated by semicolons or new lines."
        );
        return;
      }

      answer = answer
        .split(/[;\n]+/)
        .map((item) => item.trim())
        .filter(Boolean)
        .join("; ");
    }

    const newQuestion: QuizQuestion = {
      id: editingId ?? crypto.randomUUID(),
      position: questions.length,
      type: draft.type,
      question: questionText,
      options:
        draft.type === "multiple_choice"
          ? options.filter(Boolean)
          : draft.type === "true_false"
            ? ["True", "False"]
            : [],
      answer,
      explanation: draft.explanation.trim(),
    };

    const nextQuestions = editingId
      ? questions.map((question) =>
          question.id === editingId
            ? {
                ...newQuestion,
                position: question.position,
              }
            : question
        )
      : [...questions, newQuestion];

    const orderedQuestions = sortExamQuestions(
      nextQuestions,
      mixed
    ).map((question, position) => ({
      ...question,
      position,
    }));

    setBusy(true);
    setError("");

    try {
      const updated = await updateCloudQuiz({
        ...quiz,
        questions: orderedQuestions,
      });

      setQuiz(updated);

      if (hasOfflineCopy) {
        setOfflineNeedsUpdate(true);
      }

      setAnswers({});
      setResult(null);
      closeEditor();
    } catch (err) {
      console.error("Question save error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Could not save the question."
      );
    } finally {
      setBusy(false);
    }
  }

  // REMOVE MANUAL QUESTION

  async function removeQuestion(id: string) {
    if (
      !quiz ||
      quiz.origin !== "manual" ||
      !isOnline ||
      usingOffline ||
      busy
    ) {
      return;
    }

    if (!window.confirm("Delete this question?")) return;

    const remaining = questions
      .filter((question) => question.id !== id)
      .map((question, position) => ({
        ...question,
        position,
      }));

    setBusy(true);
    setError("");

    try {
      const updated = await updateCloudQuiz({
        ...quiz,
        questions: remaining,
      });

      setQuiz(updated);

      if (hasOfflineCopy) {
        setOfflineNeedsUpdate(true);
      }

      setAnswers({});
      setResult(null);

      if (editingId === id) closeEditor();
    } catch (err) {
      console.error("Question delete error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Could not delete the question."
      );
    } finally {
      setBusy(false);
    }
  }

  // SUBMIT AND GRADE EXAM

  async function submitQuiz() {
    if (!quiz || busy || result || questions.length === 0) return;

    if (answeredCount < questions.length) {
      const confirmed = window.confirm(
        `You have ${questions.length - answeredCount} unanswered question(s). Submit anyway?`
      );

      if (!confirmed) return;
    }

    setBusy(true);
    setError("");

    try {
      const graded: GradedAnswer[] = questions.map((question) => {
        const given = answers[question.id] ?? "";
        const correctAnswer = resolveCorrectAnswer(question);

        const isCorrect =
          question.type === "enumeration"
            ? checkEnumeration(given, correctAnswer)
            : Boolean(normalize(given)) &&
              normalize(given) === normalize(correctAnswer);

        return {
          question,
          given,
          correctAnswer,
          isCorrect,
        };
      });

      const score = graded.filter((item) => item.isCorrect).length;
      const total = questions.length;
      const percentage = Math.round((score / total) * 100);

      const attempt: QuizAttempt = {
        id: crypto.randomUUID(),
        quiz_id: quiz.id,
        quiz_title: quiz.title,
        user_name: "You",
        score,
        total,
        percentage,
        created_date: new Date().toISOString(),

        answers: graded.map((item) => ({
          id: crypto.randomUUID(),
          type: item.question.type,
          question: item.question.question,
          given_answer: item.given,
          correct_answer: item.correctAnswer,
          is_correct: item.isCorrect,
          explanation: item.question.explanation,
        })),
      };

      // SAVE RESULTS

      if (!navigator.onLine || usingOffline) {
        await saveOfflineQuizAttempt(attempt);

        setResultSaveNote(
          "Saved on this device only. This attempt has not synced to your account."
        );
      } else {
        try {
          await saveCloudQuizAttempt(attempt);

          setResultSaveNote("Saved to your StudyRoom account.");
        } catch (cloudError) {
          console.warn(
            "Cloud attempt save failed; trying local storage:",
            cloudError
          );

          await saveOfflineQuizAttempt(attempt);

          setResultSaveNote(
            "Cloud save failed, but this result was saved on this device. It has not synced to your account."
          );
        }
      }

      setResult({
        score,
        total,
        percentage,
        graded,
      });

      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error("Submit quiz error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Your answers could not be saved."
      );
    } finally {
      setBusy(false);
    }
  }

  // RETAKE

  function retakeQuiz() {
    setAnswers({});
    setResult(null);
    setResultSaveNote("");
    setError("");

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // LOADING STATE

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading quiz...
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="mx-auto max-w-3xl py-20 text-center">
        <p className="text-sm text-muted-foreground">
          {error || "This quiz could not be found."}
        </p>

        <Link to="/quizzes" className="btn btn-secondary mt-5">
          Back to quizzes
        </Link>
      </div>
    );
  }

  // ==========================================
  // RESULT PAGE
  // ==========================================

  if (result) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Link
          to="/quizzes"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All quizzes
        </Link>

        <section className="panel p-6 sm:p-8">
          <p className="text-xs text-muted-foreground">
            Your exam result
          </p>

          <h1 className="mt-2 text-xl font-semibold text-foreground">
            {quiz.title}
          </h1>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <span className="text-[40px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-foreground">
              {result.percentage}%
            </span>

            <span className="pb-1 text-sm text-muted-foreground">
              {result.score} of {result.total} correct
            </span>
          </div>

          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full rounded-full ${
                result.percentage >= 50
                  ? "bg-primary"
                  : "bg-destructive"
              }`}
              style={{ width: `${result.percentage}%` }}
            />
          </div>

          {/* SCORE BY EXAM PART */}

          {mixed && (
            <div className="mt-6 divide-y divide-border rounded-xl border border-border">
              {sections.map((section) => {
                const items = result.graded.filter(
                  (item) => item.question.type === section.type
                );

                const correct = items.filter(
                  (item) => item.isCorrect
                ).length;

                return (
                  <div
                    key={section.type}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <p className="text-xs font-semibold text-foreground">
                      {section.title}
                    </p>

                    <span className="shrink-0 text-sm font-medium text-muted-foreground">
                      {correct}/{items.length}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {resultSaveNote && (
            <p className="mt-4 text-xs text-muted-foreground" role="status">
              {resultSaveNote}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={retakeQuiz}
              className="btn btn-primary btn-sm"
            >
              <RotateCcw className="h-4 w-4" />
              Retake quiz
            </button>

            <Link
              to="/quizzes"
              className="btn btn-secondary btn-sm"
            >
              Back to practice
            </Link>
          </div>
        </section>

        {/* ORGANIZED ANSWER REVIEW */}

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-foreground">
            Review your answers
          </h2>

          {result.graded.map(
            ({ question, given, correctAnswer, isCorrect }, index) => {
              const isNewSection =
                mixed &&
                (index === 0 ||
                  result.graded[index - 1].question.type !== question.type);

              return (
                <div key={question.id} className="space-y-3">
                  {isNewSection && (
                    <div className="mt-5 rounded-xl border border-border bg-secondary/30 px-5 py-3">
                      <h3 className="text-sm font-semibold text-foreground">
                        {examPart(question.type)?.title}
                      </h3>
                    </div>
                  )}

                  <article className="panel flex gap-3 p-4 sm:p-5">
                    <span
                      className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                        isCorrect
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-destructive/15 text-destructive"
                      }`}
                    >
                      {isCorrect
                        ? <Check className="h-3 w-3" />
                        : <X className="h-3 w-3" />}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium leading-relaxed text-foreground">
                        <span className="mr-1.5 text-muted-foreground">
                          {index + 1}.
                        </span>

                        {question.question}
                      </p>

                      <div className="mt-2 text-xs text-muted-foreground">
                        Your answer:

                        <p className="mt-1 whitespace-pre-wrap break-words text-foreground">
                          {formatAnswer(given, question.type) || "No answer"}
                        </p>
                      </div>

                      {!isCorrect && (
                        <div className="mt-2 text-xs text-emerald-500">
                          Correct answer:

                          <p className="mt-1 whitespace-pre-wrap break-words">
                            {formatAnswer(correctAnswer, question.type)}
                          </p>
                        </div>
                      )}

                      {question.explanation && (
                        <p className="mt-2 border-l-2 border-border pl-3 text-xs leading-relaxed text-muted-foreground">
                          {question.explanation}
                        </p>
                      )}
                    </div>
                  </article>
                </div>
              );
            }
          )}
        </section>
      </div>
    );
  }

  // ==========================================
  // MAIN EXAM PAGE
  // ==========================================

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        to="/quizzes"
        className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All quizzes
      </Link>

      {/* EXAM HEADER */}

      <header className="space-y-2 border-b border-border pb-5">
        <p className="text-xs text-muted-foreground">
          {QUESTION_TYPES[quiz.question_type]}
        </p>

        <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
          {quiz.title}
        </h1>

        <p className="text-sm text-muted-foreground">
          {questions.length} questions

          {quiz.source_label
            ? ` · From ${quiz.source_label}`
            : ""}
        </p>
      </header>

      {/* OFFLINE DOWNLOAD */}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {hasOfflineCopy
            ? <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
            : <WifiOff className="h-4 w-4 shrink-0" />}

          <span>
            {hasOfflineCopy
              ? offlineNeedsUpdate
                ? "Offline copy needs updating after your edits."
                : "Saved Offline - available on this device."
              : "Not downloaded for offline practice."}

            {usingOffline ? " Reading a local copy." : ""}
          </span>
        </div>

        <button
          type="button"
          onClick={() => void downloadQuiz()}
          disabled={savingOffline || busy || !isOnline || usingOffline}
          className="btn btn-secondary btn-sm disabled:opacity-50"
        >
          {savingOffline
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Download className="h-4 w-4" />}

          {savingOffline
            ? "Saving..."
            : hasOfflineCopy
              ? "Update Offline Copy"
              : "Save for Offline"}
        </button>
      </div>

      {!isOnline && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <WifiOff className="h-4 w-4" />
          You're offline. Answers can be graded locally.
        </p>
      )}

      {/* MANUAL QUESTION EDITOR */}

      {quiz.origin === "manual" && isOnline && !usingOffline && (
        <section className="panel space-y-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium text-foreground">
                Manage questions
              </h2>

              <p className="mt-1 text-xs text-muted-foreground">
                Add, edit, or delete your questions.
              </p>
            </div>

            <button
              type="button"
              onClick={editorOpen ? closeEditor : openAddQuestion}
              disabled={busy}
              className="btn btn-secondary btn-sm disabled:opacity-50"
            >
              {editorOpen
                ? <X className="h-4 w-4" />
                : <Plus className="h-4 w-4" />}

              {editorOpen ? "Close editor" : "Add question"}
            </button>
          </div>

          {editorOpen && (
            <form
              onSubmit={(event) => void saveQuestion(event)}
              className="space-y-4 border-t border-border pt-4"
            >
              <h3 className="text-sm font-medium text-foreground">
                {editingId ? "Edit question" : "New question"}
              </h3>

              {mixed && (
                <label className="block">
                  <span className="label-xs mb-1.5 block">
                    Question type
                  </span>

                  <select
                    value={draft.type}
                    onChange={(event) => {
                      const type = event.target.value as QuestionType;

                      setDraft({
                        ...makeDraft(type),
                        question: draft.question,
                        explanation: draft.explanation,
                      });
                    }}
                    disabled={busy}
                    className="select"
                  >
                    <option value="multiple_choice">
                      Multiple choice
                    </option>

                    <option value="true_false">
                      True or false
                    </option>

                    <option value="identification">
                      Identification
                    </option>

                    <option value="enumeration">
                      Enumeration
                    </option>
                  </select>
                </label>
              )}

              <label className="block">
                <span className="label-xs mb-1.5 block">
                  Question
                </span>

                <textarea
                  value={draft.question}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      question: event.target.value,
                    })
                  }
                  rows={3}
                  placeholder={
                    draft.type === "enumeration"
                      ? "e.g. Enumerate the 3 components of..."
                      : "Write your question here"
                  }
                  disabled={busy}
                  className="textarea"
                  required
                />
              </label>

              {/* MANUAL MULTIPLE CHOICE */}

              {draft.type === "multiple_choice" && (
                <div className="space-y-3">
                  <p className="label-xs">Answer options</p>

                  {draft.options.map((option, index) => (
                    <label key={index} className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="correct-option"
                        checked={draft.correctIndex === index}
                        onChange={() =>
                          setDraft({
                            ...draft,
                            correctIndex: index,
                          })
                        }
                        disabled={busy}
                        title="Mark as correct answer"
                      />

                      <span className="w-4 text-xs text-muted-foreground">
                        {LETTERS[index]}
                      </span>

                      <input
                        value={option}
                        onChange={(event) => {
                          const next = [...draft.options];
                          next[index] = event.target.value;

                          setDraft({
                            ...draft,
                            options: next,
                          });
                        }}
                        placeholder={`Option ${LETTERS[index]}`}
                        disabled={busy}
                        className="input min-w-0 flex-1"
                      />
                    </label>
                  ))}

                  <p className="text-xs text-muted-foreground">
                    Select the radio button beside the correct option.
                  </p>
                </div>
              )}

              {/* MANUAL TRUE OR FALSE */}

              {draft.type === "true_false" && (
                <label className="block">
                  <span className="label-xs mb-1.5 block">
                    Correct answer
                  </span>

                  <select
                    value={draft.answer}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        answer: event.target.value,
                      })
                    }
                    disabled={busy}
                    className="select"
                  >
                    <option value="True">True</option>
                    <option value="False">False</option>
                  </select>
                </label>
              )}

              {/* MANUAL IDENTIFICATION */}

              {draft.type === "identification" && (
                <label className="block">
                  <span className="label-xs mb-1.5 block">
                    Correct answer
                  </span>

                  <input
                    value={draft.answer}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        answer: event.target.value,
                      })
                    }
                    placeholder="Enter the correct answer"
                    disabled={busy}
                    className="input"
                    required
                  />
                </label>
              )}

              {/* MANUAL ENUMERATION */}

              {draft.type === "enumeration" && (
                <label className="block">
                  <span className="label-xs mb-1.5 block">
                    Correct answers
                  </span>

                  <textarea
                    rows={4}
                    value={draft.answer}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        answer: event.target.value,
                      })
                    }
                    placeholder={"Answer one\nAnswer two\nAnswer three"}
                    disabled={busy}
                    className="textarea"
                    required
                  />

                  <p className="mt-1 text-xs text-muted-foreground">
                    Write one answer per line. The order of answers will not affect grading.
                  </p>
                </label>
              )}

              <label className="block">
                <span className="label-xs mb-1.5 block">
                  Explanation (optional)
                </span>

                <textarea
                  value={draft.explanation}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      explanation: event.target.value,
                    })
                  }
                  rows={3}
                  placeholder="Explain why this answer is correct"
                  disabled={busy}
                  className="textarea"
                />
              </label>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeEditor}
                  disabled={busy}
                  className="btn btn-ghost btn-sm"
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
                    : <Check className="h-4 w-4" />}

                  {busy
                    ? "Saving..."
                    : editingId
                      ? "Save changes"
                      : "Add question"}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {quiz.origin === "manual" && (!isOnline || usingOffline) && (
        <p className="text-xs text-muted-foreground">
          Question editing requires an online connection.
          You can still answer this quiz offline.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-[13px] text-destructive"
        >
          {error}
        </p>
      )}

      {/* EMPTY QUIZ */}

      {questions.length === 0 ? (
        <section className="panel flex flex-col items-center py-14 text-center">
          <ClipboardCheck className="h-9 w-9 text-muted-foreground" />

          <h2 className="mt-4 text-base font-medium text-foreground">
            No questions yet
          </h2>

          <p className="mt-2 max-w-sm text-[13px] text-muted-foreground">
            {quiz.origin === "manual"
              ? "Click Add question above to create your first question."
              : "This quiz has no questions available."}
          </p>
        </section>
      ) : (
        <>
          {/* EXAM PROGRESS */}

          <div className="rounded-xl border border-border bg-card px-5 py-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                <span className="text-foreground">
                  {answeredCount}
                </span>{" "}
                of {questions.length} answered
              </span>

              <span className="text-muted-foreground">
                {answeredPercent}%
              </span>
            </div>

            <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${answeredPercent}%` }}
              />
            </div>
          </div>

          {/* EXAM SECTION NAVIGATION */}

          {mixed && (
            <div className="panel p-4">
              <h2 className="text-sm font-medium text-foreground">
                Exam sections
              </h2>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {sections.map((section) => {
                  const completed = section.questions.filter(
                    (question) =>
                      Boolean((answers[question.id] ?? "").trim())
                  ).length;

                  return (
                    <button
                      key={section.type}
                      type="button"
                      onClick={() => {
                        document
                          .getElementById(`exam-${section.type}`)
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                      }}
                      className="rounded-lg border border-border p-3 text-left transition hover:bg-secondary/50"
                    >
                      <p className="text-[11px] font-semibold text-foreground">
                        {section.title}
                      </p>

                      <p className="mt-1 text-xs text-muted-foreground">
                        {completed} of {section.questions.length} answered
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ORGANIZED EXAM QUESTIONS */}

          <div className="space-y-4">
            {questions.map((question, index) => {
              const options = getQuestionOptions(question);
              const part = examPart(question.type);

              const isNewSection =
                mixed &&
                (index === 0 ||
                  questions[index - 1].type !== question.type);

              const sectionCount = questions.filter(
                (item) => item.type === question.type
              ).length;

              return (
                <div key={question.id} className="space-y-3">

                  {/* PART I - IV HEADER */}

                  {isNewSection && part && (
                    <header
                      id={`exam-${question.type}`}
                      className="mt-6 scroll-mt-24 rounded-xl border border-border bg-secondary/40 px-5 py-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-sm font-bold tracking-wide text-foreground sm:text-base">
                          {part.title}
                        </h2>

                        <span className="text-xs font-medium text-muted-foreground">
                          Items {index + 1}–{index + sectionCount}
                        </span>
                      </div>

                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        <span className="font-semibold">
                          Directions:
                        </span>{" "}
                        {part.instructions}
                      </p>
                    </header>
                  )}

                  {/* INDIVIDUAL QUESTION */}

                  <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
                    <div className="flex gap-3">
                      <span className="mt-0.5 grid h-7 min-w-7 shrink-0 place-items-center rounded-md bg-secondary px-1 text-xs font-medium text-muted-foreground">
                        {index + 1}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="whitespace-pre-wrap text-[15px] font-medium leading-relaxed text-foreground">
                          {question.question}
                        </p>

                        {!mixed && (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {QUESTION_TYPES[question.type]}
                          </p>
                        )}
                      </div>

                      {/* EDIT AND DELETE */}

                      {quiz.origin === "manual" &&
                        isOnline &&
                        !usingOffline && (
                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              onClick={() => openEditQuestion(question)}
                              disabled={busy}
                              aria-label={`Edit question ${index + 1}`}
                              title="Edit question"
                              className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-50"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => void removeQuestion(question.id)}
                              disabled={busy}
                              aria-label={`Delete question ${index + 1}`}
                              title="Delete question"
                              className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:text-destructive disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                    </div>

                    {/* QUESTION ANSWER FIELD */}

                    <div className="mt-4 space-y-2 sm:pl-10">
                      {options.length > 0 ? (
                        options.map((option, optionIndex) => {
                          const selected =
                            answers[question.id] === option;

                          return (
                            <button
                              key={`${question.id}-${optionIndex}`}
                              type="button"
                              onClick={() => setAnswer(question.id, option)}
                              disabled={busy}
                              aria-pressed={selected}
                              className={`quiz-answer-option flex w-full items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left text-[13.5px] transition-colors disabled:opacity-50 ${
                                selected
                                  ? "border-primary/60 bg-primary/10 text-foreground"
                                  : "border-border text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                              }`}
                            >
                              <span
                                className={`quiz-answer-letter grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] font-medium ${
                                  selected
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border text-muted-foreground"
                                }`}
                              >
                                {question.type === "true_false"
                                  ? option === "True" ? "T" : "F"
                                  : LETTERS[optionIndex]}
                              </span>

                              <span className="min-w-0 break-words">
                                {option}
                              </span>
                            </button>
                          );
                        })
                      ) : question.type === "enumeration" ? (

                        /* ENUMERATION ANSWER */

                        <div className="space-y-2">
                          <textarea
                            value={answers[question.id] ?? ""}
                            onChange={(event) =>
                              setAnswer(
                                question.id,
                                event.target.value
                              )
                            }
                            rows={4}
                            placeholder="Write one answer per line..."
                            aria-label={`Answer for question ${index + 1}`}
                            disabled={busy}
                            className="textarea w-full"
                          />

                          <p className="text-[11px] text-muted-foreground">
                            Separate each answer using a new line or semicolon.
                          </p>
                        </div>
                      ) : (

                        /* IDENTIFICATION ANSWER */

                        <input
                          value={answers[question.id] ?? ""}
                          onChange={(event) =>
                            setAnswer(
                              question.id,
                              event.target.value
                            )
                          }
                          placeholder="Type your answer"
                          aria-label={`Answer for question ${index + 1}`}
                          disabled={busy}
                          className="input"
                        />
                      )}
                    </div>
                  </section>
                </div>
              );
            })}
          </div>

          {/* SUBMIT EXAM */}

          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {answeredCount === questions.length
                ? "All questions answered. Submit when you're ready."
                : `${questions.length - answeredCount} question(s) remaining. Your result will be saved ${
                    !isOnline || usingOffline
                      ? "on this device"
                      : "to your account (or locally if cloud save fails)"
                  }.`}
            </p>

            <button
              type="button"
              onClick={() => void submitQuiz()}
              disabled={busy || editorOpen}
              className="btn btn-primary disabled:opacity-50 sm:shrink-0"
            >
              {busy
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <ArrowRight className="h-4 w-4" />}

              {busy ? "Saving result..." : "Submit quiz"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
