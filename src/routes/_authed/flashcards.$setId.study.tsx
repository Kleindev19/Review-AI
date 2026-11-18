
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { Link, useParams } from "react-router-dom";

import {
  ArrowLeft,
  ArrowRight,
  Eye,
  Flag,
  RotateCcw,
  Shuffle,
  Loader2,
} from "lucide-react";

import {
  getCloudFlashcardSet,
  updateCloudFlashcardSet,
  type FlashcardSet,
} from "../../lib/flashcardStore";

// ==========================================
// HELPERS
// ==========================================

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

// ==========================================
// FLASHCARD STUDY MODE
// ==========================================

export default function StudyPage() {
  const { setId } = useParams<{ setId: string }>();

  // CLOUD FLASHCARD SET
  const [flashcardSet, setFlashcardSet] =
    useState<FlashcardSet | null>(null);

  // STUDY SESSION
  const [order, setOrder] = useState<number[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  // UI STATES
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
  // LOAD SET FROM SUPABASE
  // ========================================

  useEffect(() => {
    let active = true;

    async function loadStudyCards() {
      setLoading(true);
      setError("");
      setFlashcardSet(null);

      setOrder([]);
      setIndex(0);
      setFlipped(false);

      if (!setId) {
        setError("Flashcard set ID is missing.");
        setLoading(false);
        return;
      }

      try {
        // FETCH CLOUD FLASHCARD SET
        const record = await getCloudFlashcardSet(
          setId
        );

        if (!active) return;

        if (!record) {
          setError(
            "Flashcard set not found or you do not have access."
          );
          return;
        }

        // SORT CARDS BY POSITION
        const sortedCards = [...record.cards].sort(
          (a, b) => a.position - b.position
        );

        // STORE CLOUD DATA IN REACT
        setFlashcardSet(record);

        // CREATE INITIAL STUDY ORDER
        setOrder(
          sortedCards.map((_, position) => position)
        );
      } catch (err) {
        if (!active) return;

        console.error(
          "Failed to load study cards:",
          err
        );

        setError(getErrorMessage(err));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadStudyCards();

    return () => {
      active = false;
    };
  }, [setId]);

  // ========================================
  // CURRENT CARD
  // ========================================

  const currentPosition = order[index];

  const current =
    currentPosition !== undefined
      ? cards[currentPosition]
      : undefined;

  // ========================================
  // STUDY PROGRESS
  // ========================================

  const progress =
    order.length > 0
      ? Math.round(
          ((index + 1) / order.length) * 100
        )
      : 0;

  // ========================================
  // DIFFICULT CARD COUNT
  // ========================================

  const difficultCount = useMemo(
    () =>
      cards.filter((card) => card.difficult).length,
    [cards]
  );

  // ========================================
  // NEXT / PREVIOUS CARD
  // ========================================

  function go(step: number) {
    if (order.length === 0) return;

    setFlipped(false);

    setIndex((currentIndex) =>
      Math.min(
        Math.max(currentIndex + step, 0),
        order.length - 1
      )
    );
  }

  // ========================================
  // KEYBOARD SHORTCUTS
  // ========================================

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;

      // IGNORE TYPING IN FORM FIELDS
      if (target instanceof HTMLElement) {
        if (
          target.closest(
            "input, textarea, select, [contenteditable='true']"
          )
        ) {
          return;
        }

        // PRESERVE NATIVE BUTTON/LINK BEHAVIOR
        if (
          (event.key === " " ||
            event.key === "Enter") &&
          target.closest("button, a")
        ) {
          return;
        }
      }

      if (order.length === 0) return;

      // NEXT CARD
      if (event.key === "ArrowRight") {
        event.preventDefault();

        setFlipped(false);

        setIndex((currentIndex) =>
          Math.min(
            currentIndex + 1,
            order.length - 1
          )
        );
      }

      // PREVIOUS CARD
      if (event.key === "ArrowLeft") {
        event.preventDefault();

        setFlipped(false);

        setIndex((currentIndex) =>
          Math.max(currentIndex - 1, 0)
        );
      }

      // FLIP CARD
      if (
        event.key === " " ||
        event.key === "Enter"
      ) {
        event.preventDefault();

        setFlipped((value) => !value);
      }
    }

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [order.length]);

  // ========================================
  // FLIP CARD
  // ========================================

  function flipCard() {
    setFlipped((value) => !value);
  }

  // ========================================
  // SHUFFLE CARDS
  // ========================================

  function shuffleCards() {
    if (order.length <= 1) return;

    const nextOrder = [...order];

    // FISHER-YATES SHUFFLE
    for (
      let i = nextOrder.length - 1;
      i > 0;
      i -= 1
    ) {
      const j = Math.floor(
        Math.random() * (i + 1)
      );

      [nextOrder[i], nextOrder[j]] = [
        nextOrder[j],
        nextOrder[i],
      ];
    }

    setOrder(nextOrder);
    setIndex(0);
    setFlipped(false);
  }

  // ========================================
  // RESTART STUDY SESSION
  // ========================================

  function restartStudy() {
    setOrder(
      cards.map((_, position) => position)
    );

    setIndex(0);
    setFlipped(false);
  }

  // ========================================
  // MARK / UNMARK DIFFICULT
  // SAVE TO SUPABASE
  // ========================================

  async function toggleDifficult() {
    if (
      !current ||
      !flashcardSet ||
      saving
    ) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      // UPDATE ONLY THE SELECTED CARD
      const updatedCards =
        flashcardSet.cards.map((card) =>
          card.id === current.id
            ? {
                ...card,
                difficult: !card.difficult,
              }
            : card
        );

      // SAVE UPDATED CARDS TO SUPABASE
      const updatedSet =
        await updateCloudFlashcardSet({
          ...flashcardSet,
          cards: updatedCards,
        });

      // REFRESH REACT STATE
      setFlashcardSet(updatedSet);
    } catch (err) {
      console.error(
        "Failed to save difficult status:",
        err
      );

      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  // ========================================
  // LOADING STATE
  // ========================================

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Preparing your cards from Supabase...
      </div>
    );
  }

  // ========================================
  // MISSING SET / EMPTY CARDS
  // ========================================

  if (!current) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <h1 className="text-lg font-semibold text-foreground">
          {flashcardSet
            ? "No flashcards to study yet"
            : "Flashcard set not found"}
        </h1>

        <p
          role={error ? "alert" : undefined}
          className="mt-2 text-sm text-muted-foreground"
        >
          {error ||
            "This set has no cards yet. Add some cards to start studying."}
        </p>

        <Link
          to={
            flashcardSet && setId
              ? `/flashcards/${encodeURIComponent(
                  setId
                )}`
              : "/flashcards"
          }
          className="btn btn-secondary btn-sm mt-4"
        >
          <ArrowLeft className="h-4 w-4" />

          {flashcardSet
            ? "Back to the set"
            : "Back to flashcards"}
        </Link>
      </div>
    );
  }

  // ========================================
  // MAIN STUDY UI
  // ========================================

  return (
    <div className="mx-auto max-w-2xl space-y-5">

      {/* TOP NAVIGATION */}
      <div className="flex items-center justify-between gap-3">
        <Link
          to={`/flashcards/${encodeURIComponent(
            setId ?? ""
          )}`}
          className="inline-flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5 shrink-0" />

          <span className="truncate">
            {flashcardSet?.title ?? "Flashcards"}
          </span>
        </Link>

        <span className="shrink-0 text-xs text-muted-foreground">
          {difficultCount} marked difficult
        </span>
      </div>

      {/* STUDY PROGRESS */}
      <div className="mt-5">

        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            Card{" "}
            <span className="tabular-nums text-foreground">
              {index + 1}
            </span>{" "}
            of{" "}
            <span className="tabular-nums">
              {order.length}
            </span>
          </span>

          <span className="tabular-nums text-muted-foreground">
            {progress}%
          </span>
        </div>

        {/* PROGRESS BAR */}
        <div className="h-1 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{
              width: `${progress}%`,
            }}
          />
        </div>
      </div>

      {/* =====================================
          3D FLIP FLASHCARD
      ===================================== */}

      <button
        type="button"
        onClick={flipCard}
        aria-label={
          flipped
            ? "Show the term"
            : "Reveal the answer"
        }
        aria-pressed={flipped}
        className="block w-full cursor-pointer text-left [perspective:1800px]"
      >
        <div
          className={`relative h-[300px] w-full transition-transform duration-500 [transform-style:preserve-3d] sm:h-[340px] ${
            flipped
              ? "[transform:rotateY(180deg)]"
              : ""
          }`}
        >

          {/* FRONT SIDE */}
          <div className="absolute inset-0 flex flex-col rounded-2xl border border-border bg-card p-6 [backface-visibility:hidden]">

            <span className="text-[11px] font-medium text-muted-foreground">
              Term
            </span>

            <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-2 text-center">
              <p className="max-w-md whitespace-pre-wrap break-words text-[19px] font-medium leading-snug text-foreground">
                {current.front}
              </p>
            </div>

            <span className="flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
              <Eye className="h-3.5 w-3.5" />
              Click or press space to reveal the answer
            </span>

          </div>

          {/* BACK SIDE */}
          <div className="absolute inset-0 flex flex-col rounded-2xl border border-primary/25 bg-card p-6 [backface-visibility:hidden] [transform:rotateY(180deg)]">

            <span className="text-[11px] font-medium text-primary">
              Answer
            </span>

            <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-2 text-center">
              <p className="max-w-md whitespace-pre-wrap break-words text-[15.5px] leading-relaxed text-foreground/90">
                {current.back}
              </p>
            </div>

            <span className="text-center text-[11px] text-muted-foreground">
              Click to go back to the term
            </span>

          </div>
        </div>
      </button>

      {/* =====================================
          PREVIOUS / REVEAL / NEXT
      ===================================== */}

      <div className="flex items-center gap-2">

        {/* PREVIOUS */}
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={index === 0}
          className="btn btn-secondary flex-1 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
        >
          <ArrowLeft className="h-4 w-4" />
          Previous
        </button>

        {/* REVEAL */}
        <button
          type="button"
          onClick={flipCard}
          className="btn btn-ghost flex-1 text-[13px]"
        >
          {flipped
            ? "Show term"
            : "Reveal answer"}
        </button>

        {/* NEXT */}
        <button
          type="button"
          onClick={() => go(1)}
          disabled={
            index === order.length - 1
          }
          className="btn btn-secondary flex-1 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
        >
          Next
          <ArrowRight className="h-4 w-4" />
        </button>

      </div>

      {/* =====================================
          STUDY ACTIONS
      ===================================== */}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">

        {/* MARK / UNMARK DIFFICULT */}
        <button
          type="button"
          onClick={() => void toggleDifficult()}
          disabled={saving}
          aria-pressed={current.difficult}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors disabled:opacity-50 ${
            current.difficult
              ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Flag
              className={`h-3.5 w-3.5 ${
                current.difficult
                  ? "fill-current"
                  : ""
              }`}
            />
          )}

          {saving
            ? "Saving..."
            : current.difficult
              ? "Marked difficult"
              : "Mark difficult"}
        </button>

        {/* SHUFFLE / RESTART */}
        <div className="flex items-center gap-1">

          <button
            type="button"
            onClick={shuffleCards}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Shuffle className="h-3.5 w-3.5" />
            Shuffle
          </button>

          <button
            type="button"
            onClick={restartStudy}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restart
          </button>

        </div>
      </div>

      {/* ERROR MESSAGE */}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-[13px] text-destructive"
        >
          {error}
        </p>
      )}

      {/* KEYBOARD HINT */}
      <p className="pb-4 text-center text-[11px] text-muted-foreground">
        Keyboard shortcuts: ← Previous · → Next · Space to flip
      </p>

    </div>
  );
}
