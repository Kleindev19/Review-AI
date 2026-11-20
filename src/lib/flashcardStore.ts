
import { supabase } from "./supabaseClient";

import {
  getOfflinePractice,
  listOfflinePractice,
  removeOfflinePractice,
  saveOfflinePractice,
} from "./offlinePracticeStore";

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

const STORAGE_KEY =
  "studyroom.flashcardSets.v1";

const CLOUD_COLUMNS =
  "id,title,subject,origin,card_count,cards,source_label,created_date,updated_date";

// ==========================================
// LEGACY LOCAL STORAGE FUNCTIONS
// ==========================================

export function listFlashcardSets():
  FlashcardSet[] {
  const stored =
    localStorage.getItem(STORAGE_KEY);

  if (!stored) return [];

  const parsed: unknown =
    JSON.parse(stored);

  if (!Array.isArray(parsed)) {
    throw new Error(
      "Invalid flashcard storage."
    );
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
    throw new Error(
      "Some flashcard sets are invalid."
    );
  }

  return (parsed as FlashcardSet[]).sort(
    (a, b) =>
      new Date(b.updated_date).getTime() -
      new Date(a.updated_date).getTime()
  );
}

export function getFlashcardSet(
  id: string
): FlashcardSet | null {
  return (
    listFlashcardSets().find(
      (set) => set.id === id
    ) ?? null
  );
}

export function createFlashcardSet(
  input: CreateSetInput
): FlashcardSet {
  const existing =
    listFlashcardSets();

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
    JSON.stringify([
      set,
      ...existing,
    ])
  );

  return set;
}

export function updateFlashcardSet(
  updated: FlashcardSet
): void {
  const existing =
    listFlashcardSets();

  if (
    !existing.some(
      (set) => set.id === updated.id
    )
  ) {
    throw new Error(
      "Flashcard set not found."
    );
  }

  const next = existing.map(
    (set) =>
      set.id === updated.id
        ? {
            ...updated,
            card_count:
              updated.cards.length,
            updated_date:
              new Date().toISOString(),
          }
        : set
  );

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(next)
  );
}

export function deleteFlashcardSet(
  id: string
): void {
  const existing =
    listFlashcardSets();

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(
      existing.filter(
        (set) => set.id !== id
      )
    )
  );
}

// ==========================================
// SUPABASE AUTHENTICATION
// ==========================================

async function requireUserId():
  Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw new Error(
      error.message
    );
  }

  if (!user) {
    throw new Error(
      "Please log in to access your flashcards."
    );
  }

  return user.id;
}

// ==========================================
// CONVERT CLOUD DATABASE ROW
// ==========================================

function toFlashcardSet(
  row: CloudFlashcardRow
): FlashcardSet {
  const cards =
    Array.isArray(row.cards)
      ? row.cards
      : [];

  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    origin: row.origin,
    card_count: cards.length,
    cards,
    source_label:
      row.source_label ?? undefined,
    created_date: row.created_date,
    updated_date: row.updated_date,
  };
}

// ==========================================
// READ CLOUD FLASHCARD SETS
// ==========================================

export async function listCloudFlashcardSets():
  Promise<FlashcardSet[]> {
  const userId =
    await requireUserId();

  const { data, error } =
    await supabase
      .from("flashcard_sets")
      .select(CLOUD_COLUMNS)
      .eq("user_id", userId)
      .order("updated_date", {
        ascending: false,
      });

  if (error) {
    throw new Error(
      error.message
    );
  }

  return (data ?? []).map(
    (row: CloudFlashcardRow) =>
      toFlashcardSet(row)
  );
}

// ==========================================
// GET ONE CLOUD FLASHCARD SET
// ==========================================

export async function getCloudFlashcardSet(
  id: string
): Promise<FlashcardSet | null> {
  const userId =
    await requireUserId();

  const { data, error } =
    await supabase
      .from("flashcard_sets")
      .select(CLOUD_COLUMNS)
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

  if (error) {
    throw new Error(
      error.message
    );
  }

  return data
    ? toFlashcardSet(
        data as CloudFlashcardRow
      )
    : null;
}

// ==========================================
// CREATE CLOUD FLASHCARD SET
// ==========================================

export async function createCloudFlashcardSet(
  input: CreateSetInput
): Promise<FlashcardSet> {
  const userId =
    await requireUserId();

  if (!input.title.trim()) {
    throw new Error(
      "Flashcard set title is required."
    );
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

  const { data, error } =
    await supabase
      .from("flashcard_sets")
      .insert({
        user_id: userId,
        title: input.title.trim(),
        subject: input.subject.trim(),
        origin: input.origin,
        card_count: cards.length,
        cards,
        source_label:
          input.source_label ?? null,
      })
      .select(CLOUD_COLUMNS)
      .single();

  if (error) {
    throw new Error(
      error.message
    );
  }

  return toFlashcardSet(
    data as CloudFlashcardRow
  );
}

// ==========================================
// UPDATE CLOUD FLASHCARD SET
// ==========================================

export async function updateCloudFlashcardSet(
  updated: FlashcardSet
): Promise<FlashcardSet> {
  const userId =
    await requireUserId();

  if (!updated.title.trim()) {
    throw new Error(
      "Flashcard set title is required."
    );
  }

  const cards: Flashcard[] =
    updated.cards.map(
      (card, index) => ({
        id: card.id,
        front: card.front,
        back: card.back,
        difficult:
          Boolean(card.difficult),
        position: index,
      })
    );

  const { data, error } =
    await supabase
      .from("flashcard_sets")
      .update({
        title:
          updated.title.trim(),
        subject:
          updated.subject.trim(),
        origin:
          updated.origin,
        card_count: cards.length,
        cards,
        source_label:
          updated.source_label ??
          null,
        updated_date:
          new Date().toISOString(),
      })
      .eq("id", updated.id)
      .eq("user_id", userId)
      .select(CLOUD_COLUMNS)
      .maybeSingle();

  if (error) {
    throw new Error(
      error.message
    );
  }

  if (!data) {
    throw new Error(
      "Flashcard set not found or you do not have access."
    );
  }

  return toFlashcardSet(
    data as CloudFlashcardRow
  );
}

// ==========================================
// DELETE CLOUD FLASHCARD SET
// ==========================================

export async function deleteCloudFlashcardSet(
  id: string
): Promise<void> {
  const userId =
    await requireUserId();

  const { data, error } =
    await supabase
      .from("flashcard_sets")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();

  if (error) {
    throw new Error(
      error.message
    );
  }

  if (!data) {
    throw new Error(
      "Flashcard set not found or already deleted."
    );
  }
}

// ==========================================
// NEW: SAVE FLASHCARDS FOR OFFLINE
// ==========================================

export async function saveFlashcardSetForOffline(
  set: FlashcardSet
): Promise<void> {
  await saveOfflinePractice(
    "flashcard",
    {
      ...set,
      card_count:
        set.cards.length,
    }
  );
}

// ==========================================
// NEW: GET OFFLINE FLASHCARD SET
// ==========================================

export async function getOfflineFlashcardSet(
  id: string
): Promise<FlashcardSet | null> {
  return getOfflinePractice<
    FlashcardSet
  >("flashcard", id);
}

// ==========================================
// NEW: LIST OFFLINE FLASHCARD SETS
// ==========================================

export async function listOfflineFlashcardSets():
  Promise<FlashcardSet[]> {
  const records =
    await listOfflinePractice<
      FlashcardSet
    >("flashcard");

  return records.map(
    (record) =>
      record.payload
  );
}

// ==========================================
// NEW: REMOVE OFFLINE FLASHCARD SET
// ==========================================

export async function removeOfflineFlashcardSet(
  id: string
): Promise<void> {
  await removeOfflinePractice(
    "flashcard",
    id
  );
}

// ==========================================
// NEW: UPDATE OFFLINE FLASHCARD PROGRESS
// ==========================================

// Save local card changes without
// contacting Supabase.
//
// Example: mark a card as difficult.
// Does not automatically sync to cloud.

export async function updateOfflineFlashcardSet(
  set: FlashcardSet
): Promise<void> {
  const existing =
    await getOfflineFlashcardSet(
      set.id
    );

  if (!existing) {
    throw new Error(
      "Flashcard set is not downloaded."
    );
  }

  await saveFlashcardSetForOffline(set);
}
