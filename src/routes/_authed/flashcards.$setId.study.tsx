
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Link,
  useParams,
} from "react-router-dom";

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  Eye,
  Flag,
  Loader2,
  RotateCcw,
  Shuffle,
  WifiOff,
} from "lucide-react";

import {
  getCloudFlashcardSet,
  getOfflineFlashcardSet,
  saveFlashcardSetForOffline,
  updateCloudFlashcardSet,
  updateOfflineFlashcardSet,
  type FlashcardSet,
} from "../../lib/flashcardStore";

// ==========================================
// HELPERS
// ==========================================

function getErrorMessage(
  error: unknown
): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

// ==========================================
// FLASHCARD STUDY MODE
// ==========================================

export default function StudyPage() {
  const { setId } = useParams<{
    setId: string;
  }>();

  // ========================================
  // FLASHCARD SET
  // ========================================

  const [flashcardSet, setFlashcardSet] =
    useState<FlashcardSet | null>(null);

  // ========================================
  // STUDY SESSION
  // ========================================

  const [order, setOrder] =
    useState<number[]>([]);

  const [index, setIndex] =
    useState(0);

  const [flipped, setFlipped] =
    useState(false);

  // ========================================
  // PAGE STATES
  // ========================================

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  // ========================================
  // OFFLINE STATES
  // ========================================

  const [isOnline, setIsOnline] =
    useState(() => navigator.onLine);

  const [
    usingOffline,
    setUsingOffline,
  ] = useState(false);

  const [
    hasOfflineCopy,
    setHasOfflineCopy,
  ] = useState(false);

  const [
    savingOffline,
    setSavingOffline,
  ] = useState(false);

  const [
    offlineNeedsUpdate,
    setOfflineNeedsUpdate,
  ] = useState(false);

  const [
    offlineProgressSaved,
    setOfflineProgressSaved,
  ] = useState(false);

  // ========================================
  // SORT FLASHCARDS
  // ========================================

  const cards = useMemo(() => {
    if (!flashcardSet) {
      return [];
    }

    return [
      ...flashcardSet.cards,
    ].sort(
      (a, b) =>
        a.position - b.position
    );
  }, [flashcardSet]);

  // ========================================
  // NETWORK STATUS
  // ========================================

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

  // ========================================
  // LOAD FLASHCARDS
  // CLOUD FIRST / OFFLINE FALLBACK
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

      setUsingOffline(false);
      setHasOfflineCopy(false);
      setOfflineNeedsUpdate(false);
      setOfflineProgressSaved(false);

      if (!setId) {
        setError(
          "Flashcard set ID is missing."
        );

        setLoading(false);
        return;
      }

      try {
        // ==================================
        // CHECK DOWNLOADED COPY
        // ==================================

        let localSet:
          FlashcardSet | null = null;

        let localError: unknown = null;

        try {
          localSet =
            await getOfflineFlashcardSet(
              setId
            );
        } catch (err) {
          localError = err;

          console.warn(
            "Offline flashcard lookup failed:",
            err
          );
        }

        if (!active) {
          return;
        }

        setHasOfflineCopy(
          Boolean(localSet)
        );

        // ==================================
        // SELECT DATA SOURCE
        // ==================================

        let record:
          FlashcardSet | null = null;

        let fromOffline = false;

        if (!navigator.onLine) {
          // Device is offline.
          // Use IndexedDB directly.

          if (!localSet) {
            if (localError) {
              throw localError;
            }

            throw new Error(
              "No downloaded flashcards found. Open this set while online and select Save for Offline first."
            );
          }

          record = localSet;
          fromOffline = true;
        } else {
          // Device is online.
          // Try Supabase first.

          try {
            record =
              await getCloudFlashcardSet(
                setId
              );
          } catch (cloudError) {
            if (!localSet) {
              throw cloudError;
            }

            record = localSet;
            fromOffline = true;
          }

          // Cloud set unavailable,
          // but local copy exists.

          if (!record && localSet) {
            record = localSet;
            fromOffline = true;
          }
        }

        if (!active) {
          return;
        }

        if (!record) {
          throw new Error(
            "Flashcard set not found or you do not have access."
          );
        }

        // ==================================
        // CHECK WHETHER DOWNLOAD IS OLD
        // ==================================

        if (
          localSet &&
          !fromOffline
        ) {
          const cloudUpdated =
            new Date(
              record.updated_date
            ).getTime();

          const localUpdated =
            new Date(
              localSet.updated_date
            ).getTime();

          if (
            Number.isFinite(
              cloudUpdated
            ) &&
            Number.isFinite(
              localUpdated
            ) &&
            cloudUpdated > localUpdated
          ) {
            setOfflineNeedsUpdate(true);
          }
        }

        // ==================================
        // LOAD STUDY SESSION
        // ==================================

        const sortedCards = [
          ...record.cards,
        ].sort(
          (a, b) =>
            a.position - b.position
        );

        setFlashcardSet(record);

        setUsingOffline(
          fromOffline
        );

        setOrder(
          sortedCards.map(
            (_, position) =>
              position
          )
        );
      } catch (err) {
        if (!active) {
          return;
        }

        console.error(
          "Failed to load flashcards:",
          err
        );

        setError(
          getErrorMessage(err)
        );
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
  // SAVE FLASHCARDS FOR OFFLINE
  // ========================================

  async function downloadFlashcards() {
    if (
      !flashcardSet ||
      saving ||
      savingOffline ||
      !isOnline ||
      usingOffline
    ) {
      return;
    }

    // Updating an existing download
    // replaces its locally saved cards.

    if (hasOfflineCopy) {
      const confirmed =
        window.confirm(
          "Update this offline copy?\n\n" +
          "This will replace the downloaded cards, including any offline-only difficult markings that have not been synced."
        );

      if (!confirmed) {
        return;
      }
    }

    setSavingOffline(true);
    setError("");

    try {
      await saveFlashcardSetForOffline(
        flashcardSet
      );

      setHasOfflineCopy(true);

      setOfflineNeedsUpdate(false);

      setOfflineProgressSaved(false);
    } catch (err) {
      setError(
        getErrorMessage(err)
      );
    } finally {
      setSavingOffline(false);
    }
  }

  // ========================================
  // CURRENT CARD
  // ========================================

  const currentPosition =
    order[index];

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
          ((index + 1) /
            order.length) *
            100
        )
      : 0;

  // ========================================
  // DIFFICULT CARD COUNT
  // ========================================

  const difficultCount = useMemo(
    () =>
      cards.filter(
        (card) =>
          card.difficult
      ).length,
    [cards]
  );

  // ========================================
  // NEXT / PREVIOUS CARD
  // ========================================

  function go(step: number) {
    if (
      order.length === 0
    ) {
      return;
    }

    setFlipped(false);

    setIndex(
      (currentIndex) =>
        Math.min(
          Math.max(
            currentIndex + step,
            0
          ),
          order.length - 1
        )
    );
  }

  // ========================================
  // KEYBOARD SHORTCUTS
  // ========================================

  useEffect(() => {
    function handleKeyDown(
      event: KeyboardEvent
    ) {
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }

      const target =
        event.target;

      if (
        target instanceof HTMLElement
      ) {
        // Ignore typing in input fields.

        if (
          target.closest(
            "input, textarea, select, [contenteditable='true']"
          )
        ) {
          return;
        }

        // Preserve normal link/button
        // keyboard behavior.

        if (
          (
            event.key === " " ||
            event.key === "Enter"
          ) &&
          target.closest(
            "button, a"
          )
        ) {
          return;
        }
      }

      if (
        order.length === 0
      ) {
        return;
      }

      // NEXT

      if (
        event.key ===
        "ArrowRight"
      ) {
        event.preventDefault();

        setFlipped(false);

        setIndex(
          (currentIndex) =>
            Math.min(
              currentIndex + 1,
              order.length - 1
            )
        );
      }

      // PREVIOUS

      if (
        event.key ===
        "ArrowLeft"
      ) {
        event.preventDefault();

        setFlipped(false);

        setIndex(
          (currentIndex) =>
            Math.max(
              currentIndex - 1,
              0
            )
        );
      }

      // FLIP

      if (
        event.key === " " ||
        event.key === "Enter"
      ) {
        event.preventDefault();

        setFlipped(
          (value) =>
            !value
        );
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
    setFlipped(
      (value) =>
        !value
    );
  }

  // ========================================
  // SHUFFLE CARDS
  // ========================================

  function shuffleCards() {
    if (
      order.length <= 1
    ) {
      return;
    }

    const nextOrder = [
      ...order,
    ];

    // Fisher-Yates shuffle.

    for (
      let i =
        nextOrder.length - 1;
      i > 0;
      i -= 1
    ) {
      const j = Math.floor(
        Math.random() *
          (i + 1)
      );

      [
        nextOrder[i],
        nextOrder[j],
      ] = [
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
      cards.map(
        (_, position) =>
          position
      )
    );

    setIndex(0);
    setFlipped(false);
  }

  // ========================================
  // SAVE DIFFICULT STATUS LOCALLY
  // ========================================

  async function markDifficultOffline(
    cardId: string
  ) {
    if (!flashcardSet) {
      throw new Error(
        "Flashcard set is missing."
      );
    }

    const localSet =
      await getOfflineFlashcardSet(
        flashcardSet.id
      );

    if (!localSet) {
      throw new Error(
        "This set has not been downloaded. Save it for Offline while online first."
      );
    }

    // Change only the matching card
    // in the downloaded copy.

    const updatedCards =
      localSet.cards.map(
        (card) =>
          card.id === cardId
            ? {
                ...card,
                difficult:
                  !card.difficult,
              }
            : card
      );

    const updatedSet:
      FlashcardSet = {
      ...localSet,
      cards: updatedCards,
      card_count:
        updatedCards.length,
    };

    await updateOfflineFlashcardSet(
      updatedSet
    );

    setFlashcardSet(updatedSet);

    setUsingOffline(true);

    setHasOfflineCopy(true);

    setOfflineProgressSaved(true);
  }

  // ========================================
  // MARK / UNMARK DIFFICULT
  // ========================================

  async function toggleDifficult() {
    if (
      !current ||
      !flashcardSet ||
      saving ||
      savingOffline
    ) {
      return;
    }

    setSaving(true);
    setError("");

    const cardId =
      current.id;

    try {
      if (
        !navigator.onLine ||
        usingOffline
      ) {
        // OFFLINE:
        // Save in IndexedDB.

        await markDifficultOffline(
          cardId
        );
      } else {
        // ONLINE:
        // Save in Supabase.

        const updatedCards =
          flashcardSet.cards.map(
            (card) =>
              card.id === cardId
                ? {
                    ...card,
                    difficult:
                      !card.difficult,
                  }
                : card
          );

        try {
          const updatedSet =
            await updateCloudFlashcardSet({
              ...flashcardSet,
              cards:
                updatedCards,
            });

          setFlashcardSet(
            updatedSet
          );

          // Existing download may
          // need to be refreshed.

          if (hasOfflineCopy) {
            setOfflineNeedsUpdate(
              true
            );
          }
        } catch (cloudError) {
          // Supabase failed.
          // Try downloaded set only
          // if one already exists.

          if (!hasOfflineCopy) {
            throw cloudError;
          }

          await markDifficultOffline(
            cardId
          );
        }
      }
    } catch (err) {
      console.error(
        "Failed to update difficult status:",
        err
      );

      setError(
        getErrorMessage(err)
      );
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

        Preparing your flashcards...
      </div>
    );
  }

  // ========================================
  // EMPTY / MISSING FLASHCARD SET
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
          role={
            error
              ? "alert"
              : undefined
          }
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
      {/* ======================================
          TOP NAVIGATION
      ====================================== */}

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

      {/* ======================================
          OFFLINE DOWNLOAD SECTION
      ====================================== */}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {hasOfflineCopy ? (
            <CheckCircle2 className="h-4 w-4 text-primary" />
          ) : (
            <Download className="h-4 w-4" />
          )}

          <span>
            {hasOfflineCopy
              ? offlineNeedsUpdate
                ? "Saved Offline - update recommended."
                : "Saved Offline - available on this device."
              : "Not downloaded for offline study."}

            {usingOffline
              ? " Using local copy."
              : ""}
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            void downloadFlashcards();
          }}
          disabled={
            !isOnline ||
            usingOffline ||
            saving ||
            savingOffline
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

      {/* ======================================
          OFFLINE STATUS MESSAGES
      ====================================== */}

      {!isOnline && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <WifiOff className="h-4 w-4" />

          You're offline. You can study
          downloaded flashcards without internet.
        </div>
      )}

      {offlineProgressSaved && (
        <p
          role="status"
          className="text-xs text-muted-foreground"
        >
          Difficult-card changes saved on this
          device only. They have not synced
          to Supabase.
        </p>
      )}

      {/* ======================================
          STUDY PROGRESS
      ====================================== */}

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
              width:
                `${progress}%`,
            }}
          />
        </div>
      </div>

      {/* ======================================
          3D FLIP FLASHCARD
      ====================================== */}

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

      {/* ======================================
          PREVIOUS / REVEAL / NEXT
      ====================================== */}

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
            index ===
            order.length - 1
          }
          className="btn btn-secondary flex-1 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
        >
          Next

          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {/* ======================================
          STUDY ACTIONS
      ====================================== */}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        {/* MARK DIFFICULT */}

        <button
          type="button"
          onClick={() => {
            void toggleDifficult();
          }}
          disabled={
            saving ||
            savingOffline
          }
          aria-pressed={
            current.difficult
          }
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
          KEYBOARD HINT
      ====================================== */}

      <p className="pb-4 text-center text-[11px] text-muted-foreground">
        Keyboard shortcuts: ← Previous · → Next · Space to flip
      </p>
    </div>
  );
}
