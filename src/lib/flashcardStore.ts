
import { supabase } from "./supabaseClient";

// ==========================================
// TYPES
// ==========================================

export type Flashcard = {
  id: string;
  front: string;
  back: string;
  difficult: boolean;
  position: number;
};

export type FlashcardSet = {
  id: string;
  title: string;
  subject: string;
  origin: "manual" | "ai";
  card_count: number;
  cards: Flashcard[];
  source_label?: string;
  created_date: string;
  updated_date: string;
};

export type NewCard = {
  front: string;
  back: string;
};

export type CreateSetInput = {
  title: string;
  subject: string;
  origin: "manual" | "ai";
  source_label?: string;
  cards?: NewCard[];
};

type CloudFlashcardRow = {
  id: string;
  title: string;
  subject: string;
  origin: "manual" | "ai";
  card_count: number;
  cards: Flashcard[];
  source_label: string | null;
  created_date: string;
  updated_date: string;
};

// ==========================================
// CONFIGURATION
// ==========================================

const STORAGE_KEY = "studyroom.flashcardSets.v1";

const CLOUD_COLUMNS =
  "id,title,subject,origin,card_count,cards,source_label,created_date,updated_date";

// ==========================================
// EXISTING LOCAL STORAGE FUNCTIONS
// Temporary compatibility during migration
// ==========================================

// READ ALL LOCAL SETS

export function listFlashcardSets(): FlashcardSet[] {
  const stored = localStorage.getItem(STORAGE_KEY);

  if (!stored) return [];

  const parsed: unknown = JSON.parse(stored);

  if (!Array.isArray(parsed)) {
    throw new Error("Invalid flashcard storage.");
  }

  const valid = parsed.every(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      typeof item.id === "string" &&
      typeof item.title === "string" &&
      Array.isArray(item.cards)
  );

  if (!valid) {
    throw new Error("Some flashcard sets are invalid.");
  }

  const sets = parsed as FlashcardSet[];

  return sets.sort(
    (a, b) =>
      new Date(b.updated_date).getTime() -
      new Date(a.updated_date).getTime()
  );
}

// GET ONE LOCAL SET

export function getFlashcardSet(
  id: string
): FlashcardSet | null {
  return (
    listFlashcardSets().find(
      (set) => set.id === id
    ) ?? null
  );
}

// CREATE LOCAL SET

export function createFlashcardSet(
  input: CreateSetInput
): FlashcardSet {
  const existing = listFlashcardSets();
  const now = new Date().toISOString();

  const cards: Flashcard[] = (
    input.cards ?? []
  ).map((card, index) => ({
    id: crypto.randomUUID(),
    front: card.front,
    back: card.back,
    difficult: false,
    position: index,
  }));

  const set: FlashcardSet = {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    subject: input.subject.trim(),
    origin: input.origin,
    card_count: cards.length,
    cards,
    source_label: input.source_label,
    created_date: now,
    updated_date: now,
  };

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify([set, ...existing])
  );

  return set;
}

// UPDATE LOCAL SET

export function updateFlashcardSet(
  updated: FlashcardSet
): void {
  const existing = listFlashcardSets();

  if (!existing.some((set) => set.id === updated.id)) {
    throw new Error("Flashcard set not found.");
  }

  const next = existing.map((set) =>
    set.id === updated.id
      ? {
          ...updated,
          card_count: updated.cards.length,
          updated_date: new Date().toISOString(),
        }
      : set
  );

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(next)
  );
}

// DELETE LOCAL SET

export function deleteFlashcardSet(
  id: string
): void {
  const existing = listFlashcardSets();

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(
      existing.filter((set) => set.id !== id)
    )
  );
}

// ==========================================
// SUPABASE CLOUD FUNCTIONS
// ==========================================

// GET LOGGED-IN USER

async function requireUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw new Error(error.message);
  }

  if (!user) {
    throw new Error(
      "Please log in to access your flashcards."
    );
  }

  return user.id;
}

// CONVERT DATABASE ROW TO FLASHCARD SET

function toFlashcardSet(
  row: CloudFlashcardRow
): FlashcardSet {
  const cards = Array.isArray(row.cards)
    ? row.cards
    : [];

  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    origin: row.origin,
    card_count: cards.length,
    cards,
    source_label: row.source_label ?? undefined,
    created_date: row.created_date,
    updated_date: row.updated_date,
  };
}

// ==========================================
// READ ALL CLOUD FLASHCARD SETS
// ==========================================

export async function listCloudFlashcardSets(): Promise<
  FlashcardSet[]
> {
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from("flashcard_sets")
    .select(CLOUD_COLUMNS)
    .eq("user_id", userId)
    .order("updated_date", {
      ascending: false,
    });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) =>
    toFlashcardSet(row as CloudFlashcardRow)
  );
}

// ==========================================
// GET ONE CLOUD FLASHCARD SET
// ==========================================

export async function getCloudFlashcardSet(
  id: string
): Promise<FlashcardSet | null> {
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from("flashcard_sets")
    .select(CLOUD_COLUMNS)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data
    ? toFlashcardSet(data as CloudFlashcardRow)
    : null;
}

// ==========================================
// CREATE CLOUD FLASHCARD SET
// ==========================================

export async function createCloudFlashcardSet(
  input: CreateSetInput
): Promise<FlashcardSet> {
  const userId = await requireUserId();

  if (!input.title.trim()) {
    throw new Error("Flashcard set title is required.");
  }

  const cards: Flashcard[] = (
    input.cards ?? []
  ).map((card, index) => ({
    id: crypto.randomUUID(),
    front: card.front.trim(),
    back: card.back.trim(),
    difficult: false,
    position: index,
  }));

  const { data, error } = await supabase
    .from("flashcard_sets")
    .insert({
      user_id: userId,
      title: input.title.trim(),
      subject: input.subject.trim(),
      origin: input.origin,
      card_count: cards.length,
      cards,
      source_label: input.source_label ?? null,
    })
    .select(CLOUD_COLUMNS)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return toFlashcardSet(data as CloudFlashcardRow);
}

// ==========================================
// UPDATE CLOUD FLASHCARD SET
// ==========================================

export async function updateCloudFlashcardSet(
  updated: FlashcardSet
): Promise<FlashcardSet> {
  const userId = await requireUserId();

  if (!updated.title.trim()) {
    throw new Error("Flashcard set title is required.");
  }

  const cards: Flashcard[] = updated.cards.map(
    (card, index) => ({
      id: card.id,
      front: card.front,
      back: card.back,
      difficult: Boolean(card.difficult),
      position: index,
    })
  );

  const { data, error } = await supabase
    .from("flashcard_sets")
    .update({
      title: updated.title.trim(),
      subject: updated.subject.trim(),
      origin: updated.origin,
      card_count: cards.length,
      cards,
      source_label: updated.source_label ?? null,
      updated_date: new Date().toISOString(),
    })
    .eq("id", updated.id)
    .eq("user_id", userId)
    .select(CLOUD_COLUMNS)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error(
      "Flashcard set not found or you do not have access."
    );
  }

  return toFlashcardSet(data as CloudFlashcardRow);
}

// ==========================================
// DELETE CLOUD FLASHCARD SET
// ==========================================

export async function deleteCloudFlashcardSet(
  id: string
): Promise<void> {
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from("flashcard_sets")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error(
      "Flashcard set not found or already deleted."
    );
  }
}
