
import {
  useCallback,
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
  ChevronRight,
  Layers,
  Loader2,
  MousePointerClick,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";

import {
  createCloudFlashcardSet,
  deleteCloudFlashcardSet,
  listCloudFlashcardSets,
  type FlashcardSet,
} from "../../lib/flashcardStore";

import { listMaterials } from "../../lib/materialStore";

import {
  listCloudMaterials,
} from "../../lib/cloudMaterialStore";

import { supabase } from "../../lib/supabaseClient";

// ==========================================
// TYPES
// ==========================================

type Panel = "manual" | "ai" | null;

type StudySource = {
  value: string;
  label: string;
  subject: string;
  text: string;
};

type AIForm = {
  source: string;
  paste: string;
  count: number;
};

// ==========================================
// HELPERS
// ==========================================

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong.";
}

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

// ==========================================
// FLASHCARDS PAGE
// ==========================================

export default function FlashcardsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const reviewerId = searchParams.get("reviewer");
  const materialId = searchParams.get("material");

  const initialSource = reviewerId
    ? `reviewer:${reviewerId}`
    : materialId
      ? `material:${materialId}`
      : "";

  // ========================================
  // FLASHCARD SETS
  // ========================================

  const [sets, setSets] = useState<FlashcardSet[]>([]);

  const [loading, setLoading] = useState(true);

  // ========================================
  // CREATION PANEL
  // ========================================

  const [panel, setPanel] = useState<Panel>(
    initialSource ? "ai" : null
  );

  // ========================================
  // MANUAL FORM
  // ========================================

  const [manual, setManual] = useState({
    title: "",
    subject: "",
  });

  // ========================================
  // AI FORM
  // ========================================

  const [ai, setAi] = useState<AIForm>({
    source: initialSource,
    paste: "",
    count: 15,
  });

  // ========================================
  // STUDY SOURCES
  // ========================================

  const [sources, setSources] = useState<StudySource[]>(
    []
  );

  const [loadingSources, setLoadingSources] =
    useState(true);

  const [sourceWarning, setSourceWarning] =
    useState("");

  // ========================================
  // UI STATES
  // ========================================

  const [busy, setBusy] = useState(false);

  const [deletingId, setDeletingId] = useState<
    string | null
  >(null);

  const [error, setError] = useState("");

  const [success, setSuccess] = useState("");

  // ========================================
  // LOAD SAVED FLASHCARD SETS
  // ========================================

  const loadSets = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const cloudSets =
        await listCloudFlashcardSets();

      setSets(cloudSets);
    } catch (err) {
      console.error(
        "Failed to load flashcard sets:",
        err
      );

      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSets();
  }, [loadSets]);

  // ========================================
  // LOAD REVIEWERS + CLOUD/LOCAL MATERIALS
  // ========================================

  useEffect(() => {
    let active = true;

    async function loadSources() {
      const available: StudySource[] = [];
      const warnings: string[] = [];

      // ======================================
      // 1. REVIEWERS FROM SUPABASE
      // ======================================

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
          throw authError;
        }

        if (!user) {
          throw new Error(
            "Please sign in to load reviewers."
          );
        }

        const {
          data: reviewers,
          error: reviewerError,
        } = await supabase
          .from("reviewers")
          .select(
            "id, title, subject, content"
          )
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
          "Failed to load reviewer sources:",
          err
        );

        warnings.push(
          "Some saved reviewers could not be loaded."
        );
      }

      // ======================================
      // 2. CLOUD AND LOCAL MATERIALS
      // ======================================

      const [cloudResult, localResult] =
        await Promise.allSettled([
          listCloudMaterials(),
          listMaterials(),
        ]);

      // Use a Map so one material ID appears
      // only once in the study-source dropdown.

      const materialSources =
        new Map<string, StudySource>();

      // ======================================
      // 3. CLOUD MATERIALS FIRST
      // ======================================

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
          "Failed to load cloud materials:",
          cloudResult.reason
        );

        warnings.push(
          "Some cloud materials could not be loaded."
        );
      }

      // ======================================
      // 4. LOCAL MATERIALS AS FALLBACK
      // ======================================

      if (localResult.status === "fulfilled") {
        for (const material of localResult.value) {
          // Already available in cloud.
          // Keep cloud version instead.

          if (materialSources.has(material.id)) {
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
          "Failed to load local materials:",
          localResult.reason
        );

        warnings.push(
          "Local materials could not be loaded."
        );
      }

      // ======================================
      // 5. COMBINE ALL SOURCES
      // ======================================

      available.push(
        ...materialSources.values()
      );

      if (!active) {
        return;
      }

      setSources(available);

      setSourceWarning(
        warnings.join(" ")
      );

      setLoadingSources(false);
    }

    void loadSources();

    return () => {
      active = false;
    };
  }, []);

  // ========================================
  // SUPPORT LINKS FROM OTHER PAGES
  // ========================================

  useEffect(() => {
    const selected = reviewerId
      ? `reviewer:${reviewerId}`
      : materialId
        ? `material:${materialId}`
        : "";

    if (!selected) return;

    setPanel("ai");

    setAi((current) => ({
      ...current,
      source: selected,
      paste: "",
    }));
  }, [reviewerId, materialId]);

  // ========================================
  // CREATE MANUAL FLASHCARD SET
  // ========================================

  async function createManual(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (busy) return;

    if (!manual.title.trim()) {
      setError("Set title is required.");
      return;
    }

    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const created =
        await createCloudFlashcardSet({
          title: manual.title.trim(),
          subject: manual.subject.trim(),
          origin: "manual",
          cards: [],
        });

      navigate(
        `/flashcards/${encodeURIComponent(
          created.id
        )}`
      );
    } catch (err) {
      console.error(
        "Create flashcard set failed:",
        err
      );

      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // ========================================
  // AI FLASHCARD GENERATION
  // SECURED WITH SUPABASE AUTH
  // ========================================

  async function createWithAI(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (busy) return;

    setError("");
    setSuccess("");

    // ======================================
    // FIND SELECTED SOURCE
    // ======================================

    const selectedSource = sources.find(
      (item) => item.value === ai.source
    );

    if (ai.source && !selectedSource) {
      setError(
        "Selected study source was not found. Please select another source."
      );

      return;
    }

    // ======================================
    // GET EXTRACTED STUDY TEXT
    // ======================================

    const text = ai.source
      ? selectedSource?.text.trim() ?? ""
      : ai.paste.trim();

    if (text.length < 60) {
      setError(
        "Provide study material with at least 60 characters."
      );

      return;
    }

    if (text.length > 100000) {
      setError(
        "Study material must not exceed 100,000 characters."
      );

      return;
    }

    // ======================================
    // BACKEND URL
    // ======================================

    const apiBaseUrl = String(
      import.meta.env.VITE_API_BASE_URL ?? ""
    ).trim();

    if (!apiBaseUrl) {
      setError(
        "AI backend is not connected yet."
      );

      return;
    }

    setBusy(true);

    try {
      // ====================================
      // VERIFY CURRENT SUPABASE SESSION
      // ====================================

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error(
          "Your session has expired. Please log in again."
        );
      }

      // ====================================
      // REQUEST AI FLASHCARDS
      // WITH AUTHORIZATION TOKEN
      // ====================================

      const response = await fetch(
        `${apiBaseUrl.replace(/\/$/, "")}/api/flashcards/generate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            text,
            count: ai.count,
          }),
        }
      );

      // Read text first so unexpected
      // HTML responses do not cause a raw
      // JSON parsing error.

      const rawResponse =
        await response.text();

      let result: unknown;

      try {
        result = JSON.parse(rawResponse);
      } catch {
        throw new Error(
          "AI server returned an unexpected response. Check that the backend is running."
        );
      }

      if (!response.ok) {
        const message =
          result &&
          typeof result === "object" &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : `AI generation failed (HTTP ${response.status}).`;

        throw new Error(message);
      }

      // ====================================
      // VALIDATE RESPONSE
      // ====================================

      if (
        !result ||
        typeof result !== "object" ||
        !("cards" in result) ||
        !Array.isArray(result.cards)
      ) {
        throw new Error("Invalid AI response.");
      }

      const cards = result.cards
        .map((item: unknown) => {
          if (
            !item ||
            typeof item !== "object" ||
            !("front" in item) ||
            !("back" in item) ||
            typeof item.front !== "string" ||
            typeof item.back !== "string" ||
            !item.front.trim() ||
            !item.back.trim()
          ) {
            throw new Error(
              "AI returned an invalid flashcard."
            );
          }

          return {
            front: item.front.trim(),
            back: item.back.trim(),
          };
        })
        .slice(0, ai.count);

      if (cards.length === 0) {
        throw new Error(
          "AI returned no flashcards."
        );
      }

      const title =
        "title" in result &&
        typeof result.title === "string" &&
        result.title.trim()
          ? result.title.trim()
          : "Generated flashcards";

      // ====================================
      // SAVE SET TO SUPABASE
      // ====================================

      const created =
        await createCloudFlashcardSet({
          title,
          subject:
            selectedSource?.subject ?? "",
          origin: "ai",
          source_label:
            selectedSource?.label ??
            "Pasted material",
          cards,
        });

      navigate(
        `/flashcards/${encodeURIComponent(
          created.id
        )}`
      );
    } catch (err) {
      console.error(
        "AI flashcard generation failed:",
        err
      );

      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // ========================================
  // DELETE FLASHCARD SET
  // ========================================

  async function removeSet(
    set: FlashcardSet
  ) {
    if (busy || deletingId !== null) {
      return;
    }

    const confirmed = window.confirm(
      `Delete "${set.title}" and all its cards?`
    );

    if (!confirmed) return;

    setDeletingId(set.id);

    setError("");
    setSuccess("");

    try {
      await deleteCloudFlashcardSet(
        set.id
      );

      setSets((current) =>
        current.filter(
          (item) => item.id !== set.id
        )
      );

      setSuccess(
        `"${set.title}" was successfully deleted.`
      );
    } catch (err) {
      console.error(
        "Delete flashcard set failed:",
        err
      );

      setError(getErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  }

  // ========================================
  // PAGE UI
  // ========================================

  return (
    <div className="space-y-6">

      {/* PAGE HEADER */}

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            Study
          </p>

          <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.02em] text-foreground">
            Flashcards
          </h1>

          <p className="mt-1.5 text-sm text-muted-foreground">
            Create flashcards and study with flip cards.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">

          {/* MANUAL BUTTON */}

          <button
            type="button"
            onClick={() => {
              setPanel(
                panel === "manual"
                  ? null
                  : "manual"
              );

              setError("");
              setSuccess("");
            }}
            disabled={busy}
            className="btn btn-secondary"
          >
            <Plus className="h-4 w-4" />
            Write your own
          </button>

          {/* AI BUTTON */}

          <button
            type="button"
            onClick={() => {
              setPanel(
                panel === "ai"
                  ? null
                  : "ai"
              );

              setError("");
              setSuccess("");
            }}
            disabled={busy}
            className="btn btn-primary"
          >
            <Sparkles className="h-4 w-4" />
            Generate with AI
          </button>
        </div>
      </header>

      {/* CLOUD SAVING INFORMATION */}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Saved to your StudyRoom account.
        </p>

        <button
          type="button"
          onClick={() =>
            void loadSets()
          }
          disabled={
            loading ||
            busy ||
            deletingId !== null
          }
          className="btn btn-secondary btn-sm"
        >
          <RefreshCw
            className={`h-4 w-4 ${
              loading ? "animate-spin" : ""
            }`}
          />

          Refresh
        </button>
      </div>

      {/* ERROR MESSAGE */}

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {/* SUCCESS MESSAGE */}

      {success && (
        <p
          role="status"
          className="rounded-lg border border-border bg-card p-3 text-sm text-foreground"
        >
          {success}
        </p>
      )}

      {/* ====================================
          MANUAL FLASHCARD CREATION
      ==================================== */}

      {panel === "manual" && (
        <form
          onSubmit={(event) =>
            void createManual(event)
          }
          className="panel space-y-4 p-5 sm:p-6"
        >
          <h2 className="text-sm font-medium text-foreground">
            New flashcard set
          </h2>

          <div className="grid gap-3 sm:grid-cols-2">

            {/* SET TITLE */}

            <input
              value={manual.title}
              onChange={(event) =>
                setManual((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              placeholder="Set title"
              aria-label="Set title"
              required
              className="input"
            />

            {/* SUBJECT */}

            <input
              value={manual.subject}
              onChange={(event) =>
                setManual((current) => ({
                  ...current,
                  subject: event.target.value,
                }))
              }
              placeholder="Subject (optional)"
              aria-label="Subject"
              className="input"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={() =>
                setPanel(null)
              }
              disabled={busy}
              className="btn btn-ghost"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={
                busy ||
                !manual.title.trim()
              }
              className="btn btn-primary btn-sm disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}

              Create set
            </button>
          </div>
        </form>
      )}

      {/* ====================================
          AI FLASHCARD GENERATION
      ==================================== */}

      {panel === "ai" && (
        <form
          onSubmit={(event) =>
            void createWithAI(event)
          }
          className="panel space-y-4 p-5 sm:p-6"
        >
          <div>
            <h2 className="text-sm font-medium text-foreground">
              Generate flashcards with AI
            </h2>

            <p className="mt-1 text-xs text-muted-foreground">
              Choose a reviewer, uploaded material,
              or paste your own text.
            </p>
          </div>

          {/* STUDY SOURCE + CARD COUNT */}

          <div className="grid gap-3 sm:grid-cols-2">

            {/* STUDY SOURCE */}

            <label className="block">
              <span className="label-xs mb-1.5 block">
                Study source
              </span>

              <select
                value={ai.source}
                onChange={(event) =>
                  setAi((current) => ({
                    ...current,
                    source:
                      event.target.value,
                    paste: "",
                  }))
                }
                disabled={
                  loadingSources ||
                  busy
                }
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

            {/* NUMBER OF CARDS */}

            <label className="block">
              <span className="label-xs mb-1.5 block">
                Number of cards
              </span>

              <select
                value={ai.count}
                onChange={(event) =>
                  setAi((current) => ({
                    ...current,
                    count: Number(
                      event.target.value
                    ),
                  }))
                }
                disabled={busy}
                className="select"
              >
                {[10, 15, 20, 25, 30].map(
                  (count) => (
                    <option
                      key={count}
                      value={count}
                    >
                      {count} cards
                    </option>
                  )
                )}
              </select>
            </label>
          </div>

          {/* SOURCE WARNING */}

          {sourceWarning && (
            <p
              role="status"
              className="text-xs text-muted-foreground"
            >
              {sourceWarning}
            </p>
          )}

          {/* PASTE MATERIAL */}

          <label className="block">
            <span className="label-xs mb-1.5 block">
              ...or paste material
            </span>

            <textarea
              value={ai.paste}
              onChange={(event) =>
                setAi((current) => ({
                  ...current,
                  paste:
                    event.target.value,
                  source: "",
                }))
              }
              rows={5}
              disabled={busy}
              placeholder="Paste your lessons or notes here"
              className="textarea"
            />
          </label>

          {/* AI ACTIONS */}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={() =>
                setPanel(null)
              }
              disabled={busy}
              className="btn btn-ghost"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={
                busy ||
                loadingSources
              }
              className="btn btn-primary btn-sm disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}

              {busy
                ? "Generating..."
                : "Generate flashcards"}
            </button>
          </div>
        </form>
      )}

      {/* ====================================
          FLASHCARD LIBRARY
      ==================================== */}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />

          Loading flashcard sets...
        </div>
      ) : sets.length === 0 ? (
        <div className="panel flex flex-col items-center justify-center px-6 py-14 text-center">
          <Layers className="h-9 w-9 text-muted-foreground" />

          <h2 className="mt-4 text-base font-medium text-foreground">
            No flashcard sets yet
          </h2>

          <p className="mt-2 text-[13px] text-muted-foreground">
            Create your first flashcard set to get started.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">

          {sets.map((set) => (
            <article
              key={set.id}
              className="panel flex flex-col p-5"
            >

              {/* SET INFORMATION */}

              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-muted-foreground">
                  {set.origin === "ai"
                    ? "AI generated"
                    : "Manual"}
                </span>

                <span className="text-muted-foreground">
                  {set.cards.length} cards
                </span>
              </div>

              {/* SET TITLE */}

              <Link
                to={`/flashcards/${encodeURIComponent(
                  set.id
                )}`}
                className="mt-2.5 text-[15px] font-medium leading-snug text-foreground hover:text-primary"
              >
                {set.title}
              </Link>

              <p className="mt-1.5 text-xs text-muted-foreground">
                {set.subject || "General"} ·{" "}
                {formatDate(
                  set.updated_date
                )}
              </p>

              {/* SET ACTIONS */}

              <div className="mt-4 flex items-center gap-2 border-t border-border pt-3.5">

                {/* STUDY BUTTON */}

                {set.cards.length > 0 ? (
                  <Link
                    to={`/flashcards/${encodeURIComponent(
                      set.id
                    )}/study`}
                    className="btn btn-primary btn-sm"
                  >
                    <MousePointerClick className="h-3.5 w-3.5" />
                    Study
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled
                    title="Add a flashcard first"
                    className="btn btn-primary btn-sm opacity-50"
                  >
                    <MousePointerClick className="h-3.5 w-3.5" />
                    Study
                  </button>
                )}

                {/* OPEN SET BUTTON */}

                <Link
                  to={`/flashcards/${encodeURIComponent(
                    set.id
                  )}`}
                  className="btn btn-ghost btn-sm"
                >
                  Open set

                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>

                {/* DELETE BUTTON */}

                <button
                  type="button"
                  onClick={() =>
                    void removeSet(set)
                  }
                  disabled={
                    deletingId !== null ||
                    busy
                  }
                  aria-label={`Delete ${set.title}`}
                  className="ml-auto grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:text-destructive disabled:opacity-50"
                >
                  {deletingId === set.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
