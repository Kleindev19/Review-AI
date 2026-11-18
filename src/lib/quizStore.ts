
import { supabase } from "./supabaseClient";

export type QuestionType =
  | "multiple_choice"
  | "true_false"
  | "identification";

export type QuizType = QuestionType | "mixed";

export type QuizQuestion = {
  id: string;
  position: number;
  type: QuestionType;
  question: string;
  options: string[];
  answer: string;
  explanation: string;
};

export type Quiz = {
  id: string;
  title: string;
  subject: string;
  origin: "manual" | "ai";
  question_type: QuizType;
  question_count: number;
  source_label: string;
  questions: QuizQuestion[];
  created_date: string;
  updated_date: string;
};

export type QuizAnswer = {
  id: string;
  question: string;
  given_answer: string;
  correct_answer: string;
  is_correct: boolean;
  explanation: string;
};

export type QuizAttempt = {
  id: string;
  quiz_id: string;
  quiz_title: string;
  user_name: string;
  score: number;
  total: number;
  percentage: number;
  answers: QuizAnswer[];
  created_date: string;
};

export type CreateQuizInput = {
  title: string;
  subject: string;
  origin: "manual" | "ai";
  question_type: QuizType;
  source_label?: string;
  questions?: QuizQuestion[];
};

type QuizRow = {
  id: string;
  title: string;
  subject: string | null;
  origin: "manual" | "ai";
  question_type: QuizType;
  source_label: string | null;
  questions: unknown;
  created_date: string;
  updated_date: string;
};

type AttemptRow = {
  id: string;
  quiz_id: string;
  quiz_title: string;
  user_name: string;
  score: number;
  total: number;
  percentage: number;
  answers: unknown;
  created_date: string;
};

// ==========================================
// AUTHENTICATED USER
// ==========================================

async function getUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw new Error(error.message);
  }

  if (!user) {
    throw new Error(
      "Please sign in to access your quizzes."
    );
  }

  return user.id;
}

// ==========================================
// DATABASE ROW CONVERSION
// ==========================================

function normalizeQuestions(
  value: unknown
): QuizQuestion[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (item): item is QuizQuestion =>
        item !== null &&
        typeof item === "object" &&
        typeof item.question === "string" &&
        typeof item.answer === "string"
    )
    .map((question, position) => ({
      id:
        typeof question.id === "string"
          ? question.id
          : crypto.randomUUID(),
      position,
      type: question.type,
      question: question.question,
      options: Array.isArray(question.options)
        ? question.options
        : [],
      answer: question.answer,
      explanation: question.explanation ?? "",
    }));
}

function toQuiz(row: QuizRow): Quiz {
  const questions = normalizeQuestions(row.questions);

  return {
    id: row.id,
    title: row.title,
    subject: row.subject ?? "",
    origin: row.origin,
    question_type: row.question_type,
    question_count: questions.length,
    source_label: row.source_label ?? "",
    questions,
    created_date: row.created_date,
    updated_date: row.updated_date,
  };
}

function toAttempt(row: AttemptRow): QuizAttempt {
  return {
    id: row.id,
    quiz_id: row.quiz_id,
    quiz_title: row.quiz_title,
    user_name: row.user_name,
    score: row.score,
    total: row.total,
    percentage: Number(row.percentage),
    answers: Array.isArray(row.answers)
      ? (row.answers as QuizAnswer[])
      : [],
    created_date: row.created_date,
  };
}

// ==========================================
// CLOUD QUIZ LIBRARY
// ==========================================

export async function listCloudQuizzes(): Promise<Quiz[]> {
  const userId = await getUserId();

  const { data, error } = await supabase
    .from("quizzes")
    .select("*")
    .eq("user_id", userId)
    .order("created_date", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) =>
    toQuiz(row as QuizRow)
  );
}

export async function getCloudQuiz(
  id: string
): Promise<Quiz | null> {
  const userId = await getUserId();

  const { data, error } = await supabase
    .from("quizzes")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? toQuiz(data as QuizRow) : null;
}

export async function createCloudQuiz(
  input: CreateQuizInput
): Promise<Quiz> {
  const userId = await getUserId();

  if (!input.title.trim()) {
    throw new Error("Quiz title is required.");
  }

  const questions = normalizeQuestions(
    input.questions ?? []
  );

  const { data, error } = await supabase
    .from("quizzes")
    .insert({
      user_id: userId,
      title: input.title.trim(),
      subject: input.subject.trim(),
      origin: input.origin,
      question_type: input.question_type,
      source_label: input.source_label ?? "",
      questions,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return toQuiz(data as QuizRow);
}

export async function updateCloudQuiz(
  updated: Quiz
): Promise<Quiz> {
  const userId = await getUserId();

  if (!updated.title.trim()) {
    throw new Error("Quiz title is required.");
  }

  const questions = normalizeQuestions(
    updated.questions
  );

  const { data, error } = await supabase
    .from("quizzes")
    .update({
      title: updated.title.trim(),
      subject: updated.subject.trim(),
      question_type: updated.question_type,
      source_label: updated.source_label,
      questions,
      updated_date: new Date().toISOString(),
    })
    .eq("id", updated.id)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Quiz not found.");
  }

  return toQuiz(data as QuizRow);
}

export async function deleteCloudQuiz(
  id: string
): Promise<void> {
  const userId = await getUserId();

  const { error } = await supabase
    .from("quizzes")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  // Related quiz attempts are removed by
  // the database's ON DELETE CASCADE.
}

// ==========================================
// CLOUD QUIZ ATTEMPTS
// ==========================================

export async function listCloudQuizAttempts(
  quizId?: string
): Promise<QuizAttempt[]> {
  const userId = await getUserId();

  let query = supabase
    .from("quiz_attempts")
    .select("*")
    .eq("user_id", userId);

  if (quizId) {
    query = query.eq("quiz_id", quizId);
  }

  const { data, error } = await query.order(
    "created_date",
    { ascending: false }
  );

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) =>
    toAttempt(row as AttemptRow)
  );
}

export async function saveCloudQuizAttempt(
  attempt: QuizAttempt
): Promise<QuizAttempt> {
  const userId = await getUserId();

  const { data, error } = await supabase
    .from("quiz_attempts")
    .insert({
      id: attempt.id,
      user_id: userId,
      quiz_id: attempt.quiz_id,
      quiz_title: attempt.quiz_title,
      user_name: attempt.user_name,
      score: attempt.score,
      total: attempt.total,
      percentage: attempt.percentage,
      answers: attempt.answers,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return toAttempt(data as AttemptRow);
}

// ==========================================
// LEGACY LOCAL STORAGE
// Preserved for compatibility with older pages.
// New quiz pages must use cloud functions.
// ==========================================

const QUIZZES_KEY = "studyroom.quizzes.v1";
const ATTEMPTS_KEY = "studyroom.quizAttempts.v1";

function readArray<T>(key: string): T[] {
  const stored = localStorage.getItem(key);

  if (!stored) return [];

  const parsed: unknown = JSON.parse(stored);

  if (!Array.isArray(parsed)) {
    throw new Error(`Invalid local storage: ${key}`);
  }

  return parsed as T[];
}

function writeArray<T>(
  key: string,
  records: T[]
): void {
  localStorage.setItem(
    key,
    JSON.stringify(records)
  );
}

export function listQuizzes(): Quiz[] {
  return readArray<Quiz>(QUIZZES_KEY).sort(
    (a, b) =>
      new Date(b.created_date).getTime() -
      new Date(a.created_date).getTime()
  );
}

export function getQuiz(id: string): Quiz | null {
  return (
    listQuizzes().find((quiz) => quiz.id === id) ??
    null
  );
}

export function createQuiz(
  input: CreateQuizInput
): Quiz {
  if (!input.title.trim()) {
    throw new Error("Quiz title is required.");
  }

  const now = new Date().toISOString();
  const questions = normalizeQuestions(
    input.questions ?? []
  );

  const quiz: Quiz = {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    subject: input.subject.trim(),
    origin: input.origin,
    question_type: input.question_type,
    question_count: questions.length,
    source_label: input.source_label ?? "",
    questions,
    created_date: now,
    updated_date: now,
  };

  writeArray(QUIZZES_KEY, [
    quiz,
    ...listQuizzes(),
  ]);

  return quiz;
}

export function updateQuiz(updated: Quiz): void {
  const existing = listQuizzes();

  if (
    !existing.some(
      (quiz) => quiz.id === updated.id
    )
  ) {
    throw new Error("Quiz not found.");
  }

  writeArray(
    QUIZZES_KEY,
    existing.map((quiz) =>
      quiz.id === updated.id
        ? {
            ...updated,
            questions: normalizeQuestions(
              updated.questions
            ),
            question_count:
              updated.questions.length,
            updated_date:
              new Date().toISOString(),
          }
        : quiz
    )
  );
}

export function deleteQuiz(id: string): void {
  writeArray(
    QUIZZES_KEY,
    listQuizzes().filter(
      (quiz) => quiz.id !== id
    )
  );

  writeArray(
    ATTEMPTS_KEY,
    listQuizAttempts().filter(
      (attempt) => attempt.quiz_id !== id
    )
  );
}

export function listQuizAttempts(): QuizAttempt[] {
  return readArray<QuizAttempt>(
    ATTEMPTS_KEY
  ).sort(
    (a, b) =>
      new Date(b.created_date).getTime() -
      new Date(a.created_date).getTime()
  );
}

export function getQuizAttempt(
  id: string
): QuizAttempt | null {
  return (
    listQuizAttempts().find(
      (attempt) => attempt.id === id
    ) ?? null
  );
}

export function saveQuizAttempt(
  attempt: QuizAttempt
): void {
  const existing = listQuizAttempts();

  writeArray(ATTEMPTS_KEY, [
    attempt,
    ...existing.filter(
      (item) => item.id !== attempt.id
    ),
  ]);
}
