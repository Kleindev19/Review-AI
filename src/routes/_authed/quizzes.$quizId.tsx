
import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import {
  Link,
  useParams,
} from "react-router-dom";

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
  type Quiz,
  type QuizQuestion,
  type QuestionType,
  type QuizAttempt,
} from "../../lib/quizStore";

// ==========================================
// TYPES
// ==========================================

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

const QUESTION_TYPES = {
  multiple_choice: "Multiple choice",
  true_false: "True or false",
  identification: "Identification",
  mixed: "Mixed",
};

const LETTERS = ["A", "B", "C", "D", "E", "F"];

// ==========================================
// HELPERS
// ==========================================

function normalize(value: string): string {
  return value
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

function resolveCorrectAnswer(
  question: QuizQuestion
): string {
  const answer = question.answer.trim();

  if (question.type !== "multiple_choice") {
    return answer;
  }

  const directMatch = question.options.find(
    (option) =>
      normalize(option) === normalize(answer)
  );

  if (directMatch) return directMatch;

  if (/^[A-F]$/i.test(answer)) {
    const index =
      answer.toUpperCase().charCodeAt(0) - 65;

    return question.options[index] ?? answer;
  }

  return answer;
}

function getQuestionOptions(
  question: QuizQuestion
): string[] {
  if (question.type === "true_false") {
    return ["True", "False"];
  }

  if (question.type === "multiple_choice") {
    return question.options;
  }

  return [];
}

// ==========================================
// QUIZ PAGE
// ==========================================

export default function QuizPage() {
  const { quizId } = useParams<{
    quizId: string;
  }>();

  // ========================================
  // QUIZ DATA
  // ========================================

  const [quiz, setQuiz] = useState<Quiz | null>(
    null
  );

  const [answers, setAnswers] = useState<
    Record<string, string>
  >({});

  const [result, setResult] =
    useState<QuizResult | null>(null);

  // ========================================
  // PAGE STATES
  // ========================================

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // ========================================
  // OFFLINE STATES
  // ========================================

  const [isOnline, setIsOnline] = useState(
    () => navigator.onLine
  );

  const [usingOffline, setUsingOffline] =
    useState(false);

  const [hasOfflineCopy, setHasOfflineCopy] =
    useState(false);

  const [
    offlineNeedsUpdate,
    setOfflineNeedsUpdate,
  ] = useState(false);

  const [savingOffline, setSavingOffline] =
    useState(false);

  const [resultSaveNote, setResultSaveNote] =
    useState("");

  // ========================================
  // QUESTION EDITOR STATES
  // ========================================

  const [editorOpen, setEditorOpen] =
    useState(false);

  const [editingId, setEditingId] =
    useState<string | null>(null);

  const [draft, setDraft] =
    useState<QuestionDraft>(makeDraft());

  // ==========================================
  // LISTEN FOR ONLINE / OFFLINE STATUS
  // ==========================================

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }

    function handleOffline() {
      setIsOnline(false);
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
  }, []);

  // ==========================================
  // LOAD QUIZ - CLOUD FIRST / OFFLINE FALLBACK
  // ==========================================

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

        // Check offline copy in IndexedDB.
        // Offline storage is scoped to the
        // current cached Supabase account.

        let localQuiz: Quiz | null = null;

        try {
          localQuiz = await getOfflineQuiz(
            quizId
          );
        } catch (offlineError) {
          console.warn(
            "Offline quiz lookup unavailable:",
            offlineError
          );
        }

        if (!active) return;

        setHasOfflineCopy(
          Boolean(localQuiz)
        );

        let record: Quiz | null = null;
        let offlineSource = false;

        // ====================================
        // DEVICE IS OFFLINE
        // ====================================

        if (!navigator.onLine) {
          record = localQuiz;
          offlineSource = true;

          if (!record) {
            throw new Error(
              "No downloaded copy of this quiz was found. Open it online and select Save for Offline first."
            );
          }
        } else {
          // ==================================
          // DEVICE IS ONLINE
          // ==================================

          try {
            record = await getCloudQuiz(
              quizId
            );
          } catch (cloudError) {
            if (!localQuiz) {
              throw cloudError;
            }

            // Supabase unavailable:
            // use downloaded local copy.

            record = localQuiz;
            offlineSource = true;
          }

          // Cloud record no longer available,
          // but an offline download exists.

          if (!record && localQuiz) {
            record = localQuiz;
            offlineSource = true;
          }
        }

        if (!active) return;

        setQuiz(record);
        setUsingOffline(
          offlineSource
        );

        if (record) {
          const type =
            record.question_type === "mixed"
              ? "multiple_choice"
              : record.question_type;

          setDraft(makeDraft(type));
        }
      } catch (err) {
        if (!active) return;

        console.error(
          "Quiz loading failed:",
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : "Could not load this quiz."
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadQuiz();

    return () => {
      active = false;
    };
  }, [quizId]);

  // ==========================================
  // SAVE QUIZ FOR OFFLINE PRACTICE
  // ==========================================

  async function downloadQuiz() {
    if (
      !quiz ||
      savingOffline ||
      busy ||
      !isOnline
    ) {
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

  // ==========================================
  // QUESTIONS AND PROGRESS
  // ==========================================

  const questions = quiz
    ? [...quiz.questions].sort(
        (a, b) => a.position - b.position
      )
    : [];

  const answeredCount = questions.filter(
    (question) =>
      Boolean(
        (answers[question.id] ?? "").trim()
      )
  ).length;

  const answeredPercent = questions.length
    ? Math.round(
        (answeredCount / questions.length) * 100
      )
    : 0;

  function setAnswer(
    questionId: string,
    value: string
  ) {
    if (busy) return;

    setAnswers((current) => ({
      ...current,
      [questionId]: value,
    }));
  }

  // ==========================================
  // OPEN ADD QUESTION EDITOR
  // ==========================================

  function openAddQuestion() {
    if (
      !quiz ||
      busy ||
      !isOnline ||
      usingOffline
    ) {
      return;
    }

    const type =
      quiz.question_type === "mixed"
        ? "multiple_choice"
        : quiz.question_type;

    setDraft(makeDraft(type));
    setEditingId(null);
    setEditorOpen(true);
    setError("");
  }

  // ==========================================
  // OPEN EDIT QUESTION
  // ==========================================

  function openEditQuestion(
    question: QuizQuestion
  ) {
    if (
      busy ||
      !isOnline ||
      usingOffline
    ) {
      return;
    }

    const correctAnswer =
      resolveCorrectAnswer(question);

    const options = [
      ...question.options,
    ];

    while (options.length < 4) {
      options.push("");
    }

    const correctIndex =
      question.options.findIndex(
        (option) =>
          normalize(option) ===
          normalize(correctAnswer)
      );

    setDraft({
      type: question.type,
      question: question.question,
      options,
      correctIndex:
        Math.max(correctIndex, 0),
      answer: correctAnswer,
      explanation:
        question.explanation ?? "",
    });

    setEditingId(question.id);
    setEditorOpen(true);
    setError("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  // ==========================================
  // SAVE MANUAL QUESTION TO SUPABASE
  // ==========================================

  async function saveQuestion(
    event: FormEvent<HTMLFormElement>
  ) {
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

    const questionText =
      draft.question.trim();

    if (!questionText) {
      setError(
        "Question text is required."
      );
      return;
    }

    const options =
      draft.type === "multiple_choice"
        ? draft.options.map(
            (item) => item.trim()
          )
        : [];

    let answer =
      draft.answer.trim();

    // MULTIPLE CHOICE

    if (
      draft.type === "multiple_choice"
    ) {
      const validOptions =
        options.filter(Boolean);

      if (validOptions.length < 2) {
        setError(
          "Multiple choice requires at least two options."
        );
        return;
      }

      answer =
        options[draft.correctIndex] ??
        "";

      if (!answer) {
        setError(
          "Select a valid correct answer."
        );
        return;
      }
    }

    // TRUE OR FALSE

    if (
      draft.type === "true_false"
    ) {
      answer =
        normalize(answer) === "false"
          ? "False"
          : "True";
    }

    // IDENTIFICATION

    if (
      draft.type === "identification" &&
      !answer
    ) {
      setError(
        "Enter the correct answer."
      );
      return;
    }

    const newQuestion: QuizQuestion = {
      id:
        editingId ??
        crypto.randomUUID(),

      position:
        questions.length,

      type:
        draft.type,

      question:
        questionText,

      options:
        draft.type === "multiple_choice"
          ? options.filter(Boolean)
          : draft.type === "true_false"
            ? ["True", "False"]
            : [],

      answer,

      explanation:
        draft.explanation.trim(),
    };

    // ========================================
    // EDIT EXISTING OR ADD NEW
    // ========================================

    const nextQuestions = editingId
      ? questions.map((question) =>
          question.id === editingId
            ? {
                ...newQuestion,
                position:
                  question.position,
              }
            : question
        )
      : [
          ...questions,
          newQuestion,
        ];

    const orderedQuestions =
      nextQuestions.map(
        (question, position) => ({
          ...question,
          position,
        })
      );

    setBusy(true);
    setError("");

    try {
      const updated =
        await updateCloudQuiz({
          ...quiz,
          questions:
            orderedQuestions,
        });

      setQuiz(updated);

      // The offline copy is now older
      // than the updated cloud version.

      if (hasOfflineCopy) {
        setOfflineNeedsUpdate(true);
      }

      setAnswers({});
      setResult(null);
      setEditorOpen(false);
      setEditingId(null);
    } catch (err) {
      console.error(
        "Question save error:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Could not save the question."
      );
    } finally {
      setBusy(false);
    }
  }

  // ==========================================
  // DELETE MANUAL QUESTION
  // ==========================================

  async function removeQuestion(
    id: string
  ) {
    if (
      !quiz ||
      quiz.origin !== "manual" ||
      !isOnline ||
      usingOffline ||
      busy
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        "Delete this question?"
      );

    if (!confirmed) return;

    const remaining = questions
      .filter(
        (question) =>
          question.id !== id
      )
      .map(
        (question, position) => ({
          ...question,
          position,
        })
      );

    setBusy(true);
    setError("");

    try {
      const updated =
        await updateCloudQuiz({
          ...quiz,
          questions: remaining,
        });

      setQuiz(updated);

      if (hasOfflineCopy) {
        setOfflineNeedsUpdate(true);
      }

      setAnswers({});
      setResult(null);

      if (editingId === id) {
        setEditingId(null);
        setEditorOpen(false);
      }
    } catch (err) {
      console.error(
        "Question delete error:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Could not delete the question."
      );
    } finally {
      setBusy(false);
    }
  }

  // ==========================================
  // SUBMIT QUIZ
  // ==========================================

  async function submitQuiz() {
    if (
      !quiz ||
      busy ||
      result ||
      questions.length === 0
    ) {
      return;
    }

    // ========================================
    // CONFIRM UNANSWERED QUESTIONS
    // ========================================

    if (
      answeredCount <
      questions.length
    ) {
      const confirmed =
        window.confirm(
          `You have ${
            questions.length -
            answeredCount
          } unanswered question(s). Submit anyway?`
        );

      if (!confirmed) return;
    }

    setBusy(true);
    setError("");

    try {
      // ======================================
      // GRADE ANSWERS LOCALLY
      // ======================================

      const graded: GradedAnswer[] =
        questions.map(
          (question) => {
            const given =
              answers[question.id] ??
              "";

            const correctAnswer =
              resolveCorrectAnswer(
                question
              );

            return {
              question,
              given,
              correctAnswer,

              isCorrect:
                normalize(given) ===
                normalize(
                  correctAnswer
                ),
            };
          }
        );

      const score =
        graded.filter(
          (item) =>
            item.isCorrect
        ).length;

      const total =
        questions.length;

      const percentage =
        Math.round(
          (score / total) * 100
        );

      // ======================================
      // CREATE QUIZ ATTEMPT RECORD
      // ======================================

      const attempt: QuizAttempt = {
        id: crypto.randomUUID(),

        quiz_id:
          quiz.id,

        quiz_title:
          quiz.title,

        user_name:
          "You",

        score,
        total,
        percentage,

        created_date:
          new Date().toISOString(),

        answers: graded.map(
          (item) => ({
            id: crypto.randomUUID(),

            question:
              item.question.question,

            given_answer:
              item.given,

            correct_answer:
              item.correctAnswer,

            is_correct:
              item.isCorrect,

            explanation:
              item.question.explanation,
          })
        ),
      };

      // ======================================
      // SAVE SCORE
      // ======================================

      // Offline:
      // Save directly to IndexedDB.
      //
      // Online:
      // Try Supabase first, then
      // save locally if cloud fails.
      //
      // Automatic sync is not yet
      // implemented.

      if (
        !navigator.onLine ||
        usingOffline
      ) {
        await saveOfflineQuizAttempt(
          attempt
        );

        setResultSaveNote(
          "Saved on this device only. This attempt has not synced to your account."
        );
      } else {
        try {
          await saveCloudQuizAttempt(
            attempt
          );

          setResultSaveNote(
            "Saved to your StudyRoom account."
          );
        } catch (cloudError) {
          console.warn(
            "Cloud attempt save failed; trying local storage:",
            cloudError
          );

          await saveOfflineQuizAttempt(
            attempt
          );

          setResultSaveNote(
            "Cloud save failed, but this result was saved on this device. It has not synced to your account."
          );
        }
      }

      // ======================================
      // DISPLAY QUIZ RESULTS
      // ======================================

      setResult({
        score,
        total,
        percentage,
        graded,
      });

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } catch (err) {
      console.error(
        "Submit quiz error:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Your answers could not be saved."
      );
    } finally {
      setBusy(false);
    }
  }

  // ==========================================
  // RETAKE QUIZ
  // ==========================================

  function retakeQuiz() {
    setAnswers({});
    setResult(null);
    setResultSaveNote("");
    setError("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  // ==========================================
  // LOADING STATE
  // ==========================================

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading quiz...
      </div>
    );
  }

  // ==========================================
  // QUIZ NOT FOUND
  // ==========================================

  if (!quiz) {
    return (
      <div className="mx-auto max-w-3xl py-20 text-center">
        <p className="text-sm text-muted-foreground">
          {error ||
            "This quiz could not be found."}
        </p>

        <Link
          to="/quizzes"
          className="btn btn-secondary mt-5"
        >
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
            Your result
          </p>

          <div className="mt-3 flex flex-wrap items-end gap-3">
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
              style={{
                width: `${result.percentage}%`,
              }}
            />
          </div>

          {/* SAVE STATUS */}

          {resultSaveNote && (
            <p
              className="mt-4 text-xs text-muted-foreground"
              role="status"
            >
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

            <span className="text-xs text-muted-foreground">
              {quiz.title}
            </span>
          </div>
        </section>

        {/* ====================================
            ANSWER REVIEW
        ==================================== */}

        <section>
          <h2 className="mb-3 text-sm font-medium text-foreground">
            Review your answers
          </h2>

          <div className="panel divide-y divide-border">
            {result.graded.map(
              (
                {
                  question,
                  given,
                  correctAnswer,
                  isCorrect,
                },
                index
              ) => (
                <div
                  key={question.id}
                  className="flex gap-3 p-4 sm:p-5"
                >
                  <span
                    className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                      isCorrect
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-destructive/15 text-destructive"
                    }`}
                  >
                    {isCorrect ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium leading-relaxed text-foreground">
                      <span className="mr-1.5 text-muted-foreground">
                        {index + 1}.
                      </span>

                      {question.question}
                    </p>

                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Your answer:{" "}
                      <span className="text-foreground">
                        {given || "No answer"}
                      </span>
                    </p>

                    {!isCorrect && (
                      <p className="mt-1 text-xs text-emerald-400">
                        Correct answer:{" "}
                        {correctAnswer}
                      </p>
                    )}

                    {question.explanation && (
                      <p className="mt-2 border-l-2 border-border pl-3 text-xs leading-relaxed text-muted-foreground">
                        {question.explanation}
                      </p>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        </section>
      </div>
    );
  }

  // ==========================================
  // MAIN QUIZ PAGE
  // ==========================================

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* BACK */}

      <Link
        to="/quizzes"
        className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All quizzes
      </Link>

      {/* ======================================
          HEADER
      ====================================== */}

      <header className="space-y-2 border-b border-border pb-5">
        <p className="text-xs text-muted-foreground">
          {QUESTION_TYPES[
            quiz.question_type
          ]}
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

      {/* ======================================
          OFFLINE DOWNLOAD SECTION
      ====================================== */}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {hasOfflineCopy ? (
            <CheckCircle2 className="h-4 w-4 text-primary" />
          ) : (
            <WifiOff className="h-4 w-4" />
          )}

          <span>
            {hasOfflineCopy
              ? offlineNeedsUpdate
                ? "Offline copy needs updating after your edits."
                : "Saved Offline - available on this device."
              : "Not downloaded for offline practice."}

            {usingOffline
              ? " Reading a local copy."
              : ""}
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            void downloadQuiz();
          }}
          disabled={
            savingOffline ||
            busy ||
            !isOnline
          }
          className="btn btn-secondary btn-sm disabled:opacity-50"
        >
          {savingOffline ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}

          {savingOffline
            ? "Saving..."
            : hasOfflineCopy
              ? "Update Offline Copy"
              : "Save for Offline"}
        </button>
      </div>

      {/* OFFLINE STATUS */}

      {!isOnline && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <WifiOff className="h-4 w-4" />

          You're offline. Answers can be
          graded locally.
        </p>
      )}

      {/* ======================================
          MANAGE MANUAL QUESTIONS
      ====================================== */}

      {quiz.origin === "manual" &&
        isOnline &&
        !usingOffline && (
          <section className="panel space-y-4 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium text-foreground">
                  Manage questions
                </h2>

                <p className="mt-1 text-xs text-muted-foreground">
                  Add, edit, or delete your
                  questions.
                </p>
              </div>

              <button
                type="button"
                onClick={
                  editorOpen
                    ? () => {
                        setEditorOpen(false);
                        setEditingId(null);
                        setError("");
                      }
                    : openAddQuestion
                }
                disabled={busy}
                className="btn btn-secondary btn-sm disabled:opacity-50"
              >
                {editorOpen ? (
                  <X className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}

                {editorOpen
                  ? "Close editor"
                  : "Add question"}
              </button>
            </div>

            {/* ==================================
                QUESTION EDITOR
            ================================== */}

            {editorOpen && (
              <form
                onSubmit={(event) => {
                  void saveQuestion(event);
                }}
                className="space-y-4 border-t border-border pt-4"
              >
                <h3 className="text-sm font-medium text-foreground">
                  {editingId
                    ? "Edit question"
                    : "New question"}
                </h3>

                {/* QUESTION TYPE */}

                {quiz.question_type ===
                  "mixed" && (
                  <label className="block">
                    <span className="label-xs mb-1.5 block">
                      Question type
                    </span>

                    <select
                      value={draft.type}
                      onChange={(event) => {
                        const type =
                          event.target
                            .value as QuestionType;

                        setDraft({
                          ...makeDraft(type),
                          question:
                            draft.question,
                          explanation:
                            draft.explanation,
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
                    </select>
                  </label>
                )}

                {/* QUESTION TEXT */}

                <label className="block">
                  <span className="label-xs mb-1.5 block">
                    Question
                  </span>

                  <textarea
                    value={draft.question}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        question:
                          event.target.value,
                      })
                    }
                    rows={3}
                    placeholder="Write your question here"
                    disabled={busy}
                    className="textarea"
                    required
                  />
                </label>

                {/* MULTIPLE CHOICE */}

                {draft.type ===
                  "multiple_choice" && (
                  <div className="space-y-3">
                    <p className="label-xs">
                      Answer options
                    </p>

                    {draft.options.map(
                      (option, index) => (
                        <label
                          key={index}
                          className="flex items-center gap-3"
                        >
                          <input
                            type="radio"
                            name="correct-option"
                            checked={
                              draft.correctIndex ===
                              index
                            }
                            onChange={() =>
                              setDraft({
                                ...draft,
                                correctIndex:
                                  index,
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
                            onChange={(
                              event
                            ) => {
                              const next = [
                                ...draft.options,
                              ];

                              next[index] =
                                event.target.value;

                              setDraft({
                                ...draft,
                                options: next,
                              });
                            }}
                            placeholder={`Option ${LETTERS[index]}`}
                            disabled={busy}
                            className="input flex-1"
                          />
                        </label>
                      )
                    )}

                    <p className="text-xs text-muted-foreground">
                      Select the radio button
                      beside the correct
                      option.
                    </p>
                  </div>
                )}

                {/* TRUE OR FALSE */}

                {draft.type ===
                  "true_false" && (
                  <label className="block">
                    <span className="label-xs mb-1.5 block">
                      Correct answer
                    </span>

                    <select
                      value={draft.answer}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          answer:
                            event.target.value,
                        })
                      }
                      disabled={busy}
                      className="select"
                    >
                      <option value="True">
                        True
                      </option>

                      <option value="False">
                        False
                      </option>
                    </select>
                  </label>
                )}

                {/* IDENTIFICATION */}

                {draft.type ===
                  "identification" && (
                  <label className="block">
                    <span className="label-xs mb-1.5 block">
                      Correct answer
                    </span>

                    <input
                      value={draft.answer}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          answer:
                            event.target.value,
                        })
                      }
                      placeholder="Enter the correct answer"
                      disabled={busy}
                      className="input"
                      required
                    />
                  </label>
                )}

                {/* EXPLANATION */}

                <label className="block">
                  <span className="label-xs mb-1.5 block">
                    Explanation (optional)
                  </span>

                  <textarea
                    value={
                      draft.explanation
                    }
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        explanation:
                          event.target.value,
                      })
                    }
                    rows={3}
                    placeholder="Explain why this answer is correct"
                    disabled={busy}
                    className="textarea"
                  />
                </label>

                {/* EDITOR BUTTONS */}

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditorOpen(false);
                      setEditingId(null);
                      setError("");
                    }}
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
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}

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

      {/* ======================================
          MANUAL EDITOR OFFLINE NOTICE
      ====================================== */}

      {quiz.origin === "manual" &&
        (!isOnline ||
          usingOffline) && (
          <p className="text-xs text-muted-foreground">
            Question editing requires an
            online connection. You can still
            answer this quiz offline.
          </p>
        )}

      {/* ======================================
          ERROR MESSAGE
      ====================================== */}

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-[13px] text-destructive"
        >
          {error}
        </p>
      )}

      {/* ======================================
          EMPTY QUIZ
      ====================================== */}

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
          {/* ==================================
              ANSWER PROGRESS
          ================================== */}

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
                style={{
                  width: `${answeredPercent}%`,
                }}
              />
            </div>
          </div>

          {/* ==================================
              QUIZ QUESTIONS
          ================================== */}

          <div className="space-y-4">
            {questions.map(
              (question, index) => {
                const options =
                  getQuestionOptions(
                    question
                  );

                return (
                  <section
                    key={question.id}
                    className="rounded-xl border border-border bg-card p-5 sm:p-6"
                  >
                    <div className="flex gap-3">
                      {/* QUESTION NUMBER */}

                      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-secondary text-[11px] font-medium text-muted-foreground">
                        {index + 1}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-medium leading-relaxed text-foreground">
                          {
                            question.question
                          }
                        </p>

                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {
                            QUESTION_TYPES[
                              question.type
                            ]
                          }
                        </p>
                      </div>

                      {/* MANUAL ACTIONS */}

                      {quiz.origin ===
                        "manual" &&
                        isOnline &&
                        !usingOffline && (
                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                openEditQuestion(
                                  question
                                )
                              }
                              disabled={busy}
                              title="Edit question"
                              aria-label={`Edit question ${index + 1}`}
                              className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-50"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                void removeQuestion(
                                  question.id
                                );
                              }}
                              disabled={busy}
                              title="Delete question"
                              aria-label={`Delete question ${index + 1}`}
                              className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:text-destructive disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                    </div>

                    {/* ==================================
                        ANSWER OPTIONS
                    ================================== */}

                    <div className="mt-4 space-y-2 sm:pl-9">
                      {options.length > 0 ? (
                        options.map(
                          (
                            option,
                            optionIndex
                          ) => {
                            const selected =
                              answers[
                                question.id
                              ] === option;

                            return (
                              <button
                                key={`${question.id}-${optionIndex}`}
                                type="button"
                                onClick={() =>
                                  setAnswer(
                                    question.id,
                                    option
                                  )
                                }
                                disabled={busy}
                                aria-pressed={
                                  selected
                                }
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
                                  {
                                    LETTERS[
                                      optionIndex
                                    ]
                                  }
                                </span>

                                <span className="min-w-0 break-words">
                                  {option}
                                </span>
                              </button>
                            );
                          }
                        )
                      ) : (
                        <input
                          value={
                            answers[
                              question.id
                            ] ?? ""
                          }
                          onChange={(
                            event
                          ) =>
                            setAnswer(
                              question.id,
                              event.target.value
                            )
                          }
                          placeholder="Type your answer"
                          disabled={busy}
                          className="input"
                        />
                      )}
                    </div>
                  </section>
                );
              }
            )}
          </div>

          {/* ==================================
              SUBMIT QUIZ
          ================================== */}

          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {answeredCount ===
              questions.length
                ? "All questions answered. Submit when you're ready."
                : `${
                    questions.length -
                    answeredCount
                  } question(s) remaining. Your result will be saved ${
                    !isOnline ||
                    usingOffline
                      ? "on this device"
                      : "to your account (or locally if cloud save fails)"
                  }.`}
            </p>

            <button
              type="button"
              onClick={() => {
                void submitQuiz();
              }}
              disabled={
                busy ||
                editorOpen
              }
              className="btn btn-primary disabled:opacity-50 sm:shrink-0"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}

              {busy
                ? "Saving result..."
                : "Submit quiz"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
