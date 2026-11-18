
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import {
  Link,
  useNavigate,
  useParams,
} from "react-router-dom";

import {
  ArrowLeft,
  Check,
  Layers,
  Loader2,
  MousePointerClick,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";

import {
  getCloudFlashcardSet,
  updateCloudFlashcardSet,
  deleteCloudFlashcardSet,
  type Flashcard,
  type FlashcardSet,
} from "../../lib/flashcardStore";

// ==========================================
// TYPES
// ==========================================

type CardForm = {
  front: string;
  back: string;
};

type EditingCard = CardForm & {
  id: string;
};

// ==========================================
// HELPERS
// ==========================================

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong.";
}

// ==========================================
// FLASHCARD SET PAGE
// ==========================================

export default function FlashcardSetPage() {
  const { setId } = useParams<{ setId: string }>();
  const navigate = useNavigate();

  const [flashcardSet, setFlashcardSet] =
    useState<FlashcardSet | null>(null);

  const [draft, setDraft] = useState<CardForm>({
    front: "",
    back: "",
  });

  const [editing, setEditing] =
    useState<EditingCard | null>(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [revision, setRevision] = useState(0);

  // ========================================
  // SORT CARDS
  // ========================================

  const cards = useMemo(() => {
    if (!flashcardSet) return [];

    return [...flashcardSet.cards].sort(
      (a, b) => a.position - b.position
    );
  }, [flashcardSet]);

  // ========================================
  // LOAD FROM SUPABASE
  // ========================================

  useEffect(() => {
    let active = true;

    async function loadSet() {
      setLoading(true);
      setError("");
      setSuccess("");
      setFlashcardSet(null);

      if (!setId) {
        setError("Flashcard set ID is missing.");
        setLoading(false);
        return;
      }

      try {
        const record = await getCloudFlashcardSet(setId);

        if (!active) return;

        if (!record) {
          setError(
            "Flashcard set not found or you do not have access."
          );
          return;
        }

        setFlashcardSet(record);
      } catch (err) {
        if (!active) return;

        console.error("Failed to load set:", err);
        setError(getErrorMessage(err));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadSet();

    return () => {
      active = false;
    };
  }, [setId, revision]);

  // ========================================
  // SAVE UPDATED CARDS
  // ========================================

  async function persistCards(
    updatedCards: Flashcard[],
    message: string
  ): Promise<boolean> {
    if (!flashcardSet || busy) return false;

    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const updated = await updateCloudFlashcardSet({
        ...flashcardSet,
        cards: updatedCards,
        card_count: updatedCards.length,
      });

      setFlashcardSet(updated);
      setSuccess(message);

      return true;
    } catch (err) {
      console.error("Failed to save cards:", err);
      setError(getErrorMessage(err));

      return false;
    } finally {
      setBusy(false);
    }
  }

  // ========================================
  // ADD CARD
  // ========================================

  async function addCard(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!flashcardSet || busy) return;

    const front = draft.front.trim();
    const back = draft.back.trim();

    if (!front || !back) {
      setError("Both sides of the card are required.");
      return;
    }

    const newCard: Flashcard = {
      id: crypto.randomUUID(),
      front,
      back,
      difficult: false,
      position: flashcardSet.cards.length,
    };

    const saved = await persistCards(
      [...flashcardSet.cards, newCard],
      "Flashcard successfully added."
    );

    if (saved) {
      setDraft({
        front: "",
        back: "",
      });
    }
  }

  // ========================================
  // EDIT CARD
  // ========================================

  function startEditing(card: Flashcard) {
    if (busy) return;

    setEditing({
      id: card.id,
      front: card.front,
      back: card.back,
    });

    setError("");
    setSuccess("");
  }

  async function saveCard() {
    if (!flashcardSet || !editing || busy) return;

    const front = editing.front.trim();
    const back = editing.back.trim();

    if (!front || !back) {
      setError("Both sides are required.");
      return;
    }

    const updatedCards = flashcardSet.cards.map(
      (card) =>
        card.id === editing.id
          ? {
              ...card,
              front,
              back,
            }
          : card
    );

    const saved = await persistCards(
      updatedCards,
      "Flashcard successfully updated."
    );

    if (saved) {
      setEditing(null);
    }
  }

  // ========================================
  // DELETE CARD
  // ========================================

  async function removeCard(id: string) {
    if (!flashcardSet || busy) return;

    if (
      !window.confirm(
        "Are you sure you want to delete this card?"
      )
    ) {
      return;
    }

    const remaining = flashcardSet.cards
      .filter((card) => card.id !== id)
      .sort((a, b) => a.position - b.position)
      .map((card, index) => ({
        ...card,
        position: index,
      }));

    const saved = await persistCards(
      remaining,
      "Flashcard successfully deleted."
    );

    if (saved && editing?.id === id) {
      setEditing(null);
    }
  }

  // ========================================
  // DELETE ENTIRE SET
  // ========================================

  async function removeSet() {
    if (!flashcardSet || busy) return;

    const confirmed = window.confirm(
      `Delete "${flashcardSet.title}" and all its ${cards.length} cards?\n\nThis cannot be undone.`
    );

    if (!confirmed) return;

    setBusy(true);
    setError("");

    try {
      await deleteCloudFlashcardSet(flashcardSet.id);

      navigate("/flashcards", {
        replace: true,
      });
    } catch (err) {
      console.error("Failed to delete set:", err);
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // ========================================
  // LOADING STATE
  // ========================================

  if (loading) {
    return (
      <div className="flex min-h-[350px] items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />

        <p className="text-sm text-muted-foreground">
          Loading flashcards from Supabase...
        </p>
      </div>
    );
  }

  // ========================================
  // NOT FOUND
  // ========================================

  if (!flashcardSet) {
    return (
      <div className="flex min-h-[350px] flex-col items-center justify-center px-5 text-center">
        <Layers className="mb-4 h-10 w-10 text-muted-foreground" />

        <h1 className="text-xl font-semibold text-foreground">
          Flashcard set unavailable
        </h1>

        <p
          role="alert"
          className="mt-2 max-w-md text-sm text-muted-foreground"
        >
          {error || "Flashcard set not found."}
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            to="/flashcards"
            className="btn btn-secondary"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>

          <button
            type="button"
            onClick={() =>
              setRevision((current) => current + 1)
            }
            className="btn btn-primary"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ========================================
  // MAIN UI
  // ========================================

  return (
    <div className="space-y-6">

      {/* BACK NAVIGATION */}
      <Link
        to="/flashcards"
        className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Flashcards
      </Link>

      {/* HEADER */}
      <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            {flashcardSet.origin === "ai"
              ? "AI generated set"
              : "Manual set"}
          </p>

          <h1 className="mt-2 break-words text-[24px] font-semibold tracking-[-0.02em] text-foreground">
            {flashcardSet.title}
          </h1>

          <p className="mt-1.5 text-sm text-muted-foreground">
            {cards.length} cards
            {flashcardSet.subject
              ? ` · ${flashcardSet.subject}`
              : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">

          {/* WORKING START STUDYING BUTTON */}
          {cards.length > 0 ? (
            <Link
              to={`/flashcards/${encodeURIComponent(
                flashcardSet.id
              )}/study`}
              className="btn btn-primary"
            >
              <MousePointerClick className="h-4 w-4" />
              Start studying
            </Link>
          ) : (
            <button
              type="button"
              disabled
              title="Add a flashcard first"
              className="btn btn-primary opacity-50"
            >
              <MousePointerClick className="h-4 w-4" />
              Start studying
            </button>
          )}

          {/* DELETE SET */}
          <button
            type="button"
            onClick={() => void removeSet()}
            disabled={busy}
            className="btn btn-secondary disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Delete set
          </button>
        </div>
      </header>

      <p className="text-xs text-muted-foreground">
        Your flashcards are securely saved to your StudyRoom account.
      </p>

      {/* FEEDBACK */}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {success && (
        <p
          role="status"
          className="rounded-lg border border-green-500/25 bg-green-500/10 p-3 text-sm text-green-500"
        >
          {success}
        </p>
      )}

      {/* ADD CARD */}
      <form
        onSubmit={(event) => void addCard(event)}
        className="panel space-y-4 p-5 sm:p-6"
      >
        <h2 className="text-sm font-medium text-foreground">
          Add a flashcard
        </h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label-xs mb-1.5 block">
              Front
            </span>

            <textarea
              value={draft.front}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  front: event.target.value,
                }))
              }
              rows={3}
              disabled={busy}
              placeholder="Question or term"
              className="textarea"
              required
            />
          </label>

          <label className="block">
            <span className="label-xs mb-1.5 block">
              Back
            </span>

            <textarea
              value={draft.back}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  back: event.target.value,
                }))
              }
              rows={3}
              disabled={busy}
              placeholder="Answer or definition"
              className="textarea"
              required
            />
          </label>
        </div>

        <div className="flex justify-end border-t border-border pt-4">
          <button
            type="submit"
            disabled={
              busy ||
              !draft.front.trim() ||
              !draft.back.trim()
            }
            className="btn btn-primary btn-sm disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add card
          </button>
        </div>
      </form>

      {/* SAVED CARDS */}
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">

        {cards.map((card, index) => (
          <div
            key={card.id}
            className="p-4 sm:px-5"
          >
            {editing?.id === card.id ? (

              /* EDIT CARD */
              <div className="space-y-3">
                <textarea
                  value={editing.front}
                  onChange={(event) =>
                    setEditing((current) =>
                      current
                        ? {
                            ...current,
                            front: event.target.value,
                          }
                        : null
                    )
                  }
                  disabled={busy}
                  rows={2}
                  aria-label="Edit card front"
                  className="textarea"
                />

                <textarea
                  value={editing.back}
                  onChange={(event) =>
                    setEditing((current) =>
                      current
                        ? {
                            ...current,
                            back: event.target.value,
                          }
                        : null
                    )
                  }
                  disabled={busy}
                  rows={2}
                  aria-label="Edit card back"
                  className="textarea"
                />

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void saveCard()}
                    disabled={
                      busy ||
                      !editing.front.trim() ||
                      !editing.back.trim()
                    }
                    className="btn btn-primary btn-sm disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    Save
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    disabled={busy}
                    className="btn btn-ghost btn-sm"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (

              /* CARD DISPLAY */
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-secondary text-[11px] text-muted-foreground">
                  {index + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap break-words text-[13.5px] font-medium text-foreground">
                    {card.front}
                  </p>

                  <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-muted-foreground">
                    {card.back}
                  </p>

                  {card.difficult && (
                    <span className="mt-2 inline-block rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-400">
                      Marked difficult
                    </span>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => startEditing(card)}
                    disabled={busy}
                    aria-label={`Edit card ${index + 1}`}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void removeCard(card.id)
                    }
                    disabled={busy}
                    aria-label={`Delete card ${index + 1}`}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {cards.length === 0 && (
          <p className="px-5 py-10 text-center text-[13px] text-muted-foreground">
            No cards yet. Add your first flashcard above.
          </p>
        )}
      </div>
    </div>
  );
}
