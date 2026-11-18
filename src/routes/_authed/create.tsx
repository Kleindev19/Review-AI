
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  Loader2,
  PenLine,
  Save,
  Sparkles,
  Upload,
  Wand2,
  CheckCircle2,
  FolderOpen,
} from "lucide-react";

import UploadPanel from "../../components/create/UploadPanel";

import {
  getMaterial,
  listMaterials,
} from "../../lib/materialStore";

import {
  getCloudMaterial,
  listCloudMaterials,
} from "../../lib/cloudMaterialStore";

import { createReviewer } from "../../lib/reviewerStore";
import { supabase } from "../../lib/supabaseClient";

// ==========================================
// TYPES
// ==========================================

type Mode = "upload" | "saved" | "paste";

type SourceType = "upload" | "text";

type UploadResult = {
  text: string;
  sourceLabel: string;
  materialId: string | null;
};

type ReviewerDraft = {
  title: string;
  subject: string;
  content: string;
  sourceType: SourceType;
  sourceLabel: string;
  sourceId: string | null;
  isAiGenerated: boolean;
};

type SavedMaterial = {
  id: string;
  title: string;
  fileName: string;
  extractedText: string;
  location: "cloud" | "local";
};

type GeneratedResponse = {
  title?: string;
  subject?: string;
  content: string;
};

// ==========================================
// CONSTANTS
// ==========================================

const MIN_CHARACTERS = 60;
const MAX_AI_CHARACTERS = 100000;

const MODES = [
  {
    key: "upload" as const,
    label: "Upload a file",
    icon: Upload,
  },
  {
    key: "saved" as const,
    label: "Saved materials",
    icon: FolderOpen,
  },
  {
    key: "paste" as const,
    label: "Paste notes",
    icon: PenLine,
  },
];

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function CreateReviewerPage() {
  const [searchParams] = useSearchParams();

  const materialId = searchParams.get("material");

  // ========================================
  // INPUT MODE
  // ========================================

  const [mode, setMode] = useState<Mode>("upload");

  const [uploaded, setUploaded] =
    useState<UploadResult | null>(null);

  // ========================================
  // SAVED MATERIALS
  // ========================================

  const [savedMaterials, setSavedMaterials] =
    useState<SavedMaterial[]>([]);

  const [selectedMaterialId, setSelectedMaterialId] =
    useState("");

  const [loadingSavedMaterials, setLoadingSavedMaterials] =
    useState(true);

  const [materialsWarning, setMaterialsWarning] =
    useState("");

  // ========================================
  // PASTED NOTES
  // ========================================

  const [pastedText, setPastedText] = useState("");

  const [pasteTitle, setPasteTitle] = useState("");

  // ========================================
  // REVIEWER DRAFT
  // ========================================

  const [draft, setDraft] =
    useState<ReviewerDraft | null>(null);

  // ========================================
  // LOADING STATES
  // ========================================

  const [loadingMaterial, setLoadingMaterial] =
    useState(Boolean(materialId));

  const [generating, setGenerating] = useState(false);

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");

  const [saved, setSaved] = useState(false);

  const [showSaveSuccess, setShowSaveSuccess] =
    useState(false);

  // ========================================
  // SELECTED MATERIAL
  // ========================================

  const selectedMaterial = savedMaterials.find(
    (material) => material.id === selectedMaterialId
  );

  // ========================================
  // ACTIVE TEXT
  // ========================================

  const activeText =
    mode === "upload"
      ? uploaded?.text ?? ""
      : mode === "saved"
        ? selectedMaterial?.extractedText ?? ""
        : pastedText;

  const characters = activeText.trim().length;

const ready = characters >= MIN_CHARACTERS;
const exceedsAiLimit = characters > MAX_AI_CHARACTERS;

  // ==========================================
  // AUTO-HIDE SUCCESS MESSAGE
  // ==========================================

  useEffect(() => {
    if (!showSaveSuccess) return;

    const timer = window.setTimeout(() => {
      setShowSaveSuccess(false);
    }, 3000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [showSaveSuccess]);

  // ==========================================
  // LOAD CLOUD + LOCAL SAVED MATERIALS
  // ==========================================

  useEffect(() => {
    let active = true;

    async function loadSavedMaterials() {
      setLoadingSavedMaterials(true);

      const [cloudResult, localResult] =
        await Promise.allSettled([
          listCloudMaterials(),
          listMaterials(),
        ]);

      if (!active) return;

      const byId = new Map<string, SavedMaterial>();

      const warnings: string[] = [];

      // CLOUD MATERIALS

      if (cloudResult.status === "fulfilled") {
        for (const material of cloudResult.value) {
          byId.set(material.id, {
            id: material.id,
            title: material.title || material.file_name,
            fileName: material.file_name,
            extractedText: material.extracted_text ?? "",
            location: "cloud",
          });
        }
      } else {
        console.error(
          "Cloud materials loading error:",
          cloudResult.reason
        );

        warnings.push(
          "Cloud materials could not be loaded."
        );
      }

      // LOCAL MATERIALS

      if (localResult.status === "fulfilled") {
        for (const material of localResult.value) {
          const existing = byId.get(material.id);

          if (existing) {
            if (!existing.extractedText.trim()) {
              byId.set(material.id, {
                ...existing,
                extractedText:
                  material.extracted_text ?? "",
              });
            }

            continue;
          }

          byId.set(material.id, {
            id: material.id,
            title: material.title || material.file_name,
            fileName: material.file_name,
            extractedText: material.extracted_text ?? "",
            location: "local",
          });
        }
      } else {
        console.error(
          "Local materials loading error:",
          localResult.reason
        );

        warnings.push(
          "Local materials could not be loaded."
        );
      }

      // COMBINE WITHOUT DUPLICATES

      setSavedMaterials((current) => {
        for (const material of current) {
          if (!byId.has(material.id)) {
            byId.set(material.id, material);
          }
        }

        return [...byId.values()];
      });

      setMaterialsWarning(warnings.join(" "));

      setLoadingSavedMaterials(false);
    }

    void loadSavedMaterials();

    return () => {
      active = false;
    };
  }, []);

  // ==========================================
  // LOAD LINKED MATERIAL FROM URL
  // Example: /create?material=MATERIAL_ID
  // ==========================================

  useEffect(() => {
    if (!materialId) {
      setLoadingMaterial(false);
      return;
    }

    let active = true;

    setLoadingMaterial(true);

    async function loadLinkedMaterial() {
      try {
        const [cloudResult, localResult] =
          await Promise.allSettled([
            getCloudMaterial(materialId!),
            getMaterial(materialId!),
          ]);

        const cloud =
          cloudResult.status === "fulfilled"
            ? cloudResult.value
            : null;

        const local =
          localResult.status === "fulfilled"
            ? localResult.value
            : null;

        if (!active) return;

        if (!cloud && !local) {
          setError(
            "This material was not found in your saved materials."
          );

          return;
        }

        const linked: SavedMaterial = cloud
          ? {
              id: cloud.id,
              title: cloud.title || cloud.file_name,
              fileName: cloud.file_name,
              extractedText:
                cloud.extracted_text ||
                local?.extracted_text ||
                "",
              location: "cloud",
            }
          : {
              id: local!.id,
              title: local!.title || local!.file_name,
              fileName: local!.file_name,
              extractedText:
                local!.extracted_text ?? "",
              location: "local",
            };

        setSavedMaterials((current) => [
          linked,
          ...current.filter(
            (item) => item.id !== linked.id
          ),
        ]);

        setSelectedMaterialId(linked.id);

        setMode("saved");

        setError("");
      } catch (err) {
        if (!active) return;

        console.error(
          "Linked material error:",
          err
        );

        setError(
          "Could not load the selected material."
        );
      } finally {
        if (active) {
          setLoadingMaterial(false);
        }
      }
    }

    void loadLinkedMaterial();

    return () => {
      active = false;
    };
  }, [materialId]);

  // ==========================================
  // SWITCH INPUT MODE
  // ==========================================

  function switchMode(nextMode: Mode) {
    if (nextMode === mode) return;

    setMode(nextMode);

    setUploaded(null);

    setError("");

    setShowSaveSuccess(false);
  }

  // ==========================================
  // SOURCE INFORMATION
  // ==========================================

  function getSourceInfo() {
    // SAVED MATERIAL SOURCE

    if (mode === "saved") {
      const fileName =
        selectedMaterial?.fileName || "Saved material";

      return {
        sourceType: "upload" as SourceType,

        sourceLabel: fileName,

        fallbackTitle:
          selectedMaterial?.title ||
          fileName.replace(/\.[^.]+$/, ""),

        sourceId:
          selectedMaterial?.id ?? null,
      };
    }

    // NEWLY UPLOADED FILE

    if (mode === "upload") {
      const fileName =
        uploaded?.sourceLabel || "Uploaded notes";

      return {
        sourceType: "upload" as SourceType,

        sourceLabel: fileName,

        fallbackTitle:
          fileName.replace(/\.[^.]+$/, "") ||
          "Untitled reviewer",

        sourceId:
          uploaded?.materialId ?? null,
      };
    }

    // MANUALLY PASTED NOTES

    return {
      sourceType: "text" as SourceType,

      sourceLabel:
        pasteTitle.trim() || "Pasted notes",

      fallbackTitle:
        pasteTitle.trim() || "Untitled reviewer",

      sourceId: null,
    };
  }

  // ==========================================
  // PREPARE MANUAL REVIEWER DRAFT
  // ==========================================

  function prepareDraft() {
    if (!ready || loadingMaterial) {
      setError(
        "Please provide at least 60 characters of material."
      );

      return;
    }

    const info = getSourceInfo();

    setDraft({
      title: info.fallbackTitle,

      subject: "",

      content: activeText.trim(),

      sourceType: info.sourceType,

      sourceLabel: info.sourceLabel,

      sourceId: info.sourceId,

      isAiGenerated: false,
    });

    setSaved(false);

    setShowSaveSuccess(false);

    setError("");
  }

  // ==========================================
  // GENERATE REVIEWER WITH AI
  // SECURED WITH SUPABASE AUTH
  // ==========================================

  async function generateReviewer() {
  if (!ready || generating || saving || saved) {
    return;
  }

  if (exceedsAiLimit) {
    setError(
      "This document is too long for one AI request. Please split it into smaller sections."
    );
    return;
  }

    const apiBaseUrl = String(
      import.meta.env.VITE_API_BASE_URL ?? ""
    ).trim();

    if (!apiBaseUrl) {
      setError(
        "AI generation is not connected yet. You can prepare an editable draft instead."
      );

      return;
    }

    setGenerating(true);

    setError("");

    setShowSaveSuccess(false);

    try {
      // Get the current Supabase login session.

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error(
          "Your session has expired. Please log in again."
        );
      }

      // Send the access token to our backend.

      const response = await fetch(
        `${apiBaseUrl.replace(/\/$/, "")}/api/reviewers/generate`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },

          body: JSON.stringify({
            text: activeText.trim(),
          }),
        }
      );

      // Display backend errors.

      if (!response.ok) {
        const errorBody: unknown = await response
          .json()
          .catch(() => null);

        const backendMessage =
          typeof errorBody === "object" &&
          errorBody !== null &&
          "error" in errorBody &&
          typeof errorBody.error === "string"
            ? errorBody.error
            : `Reviewer generation failed (HTTP ${response.status}).`;

        throw new Error(backendMessage);
      }

      const result: unknown = await response.json();

      if (
        typeof result !== "object" ||
        result === null ||
        !("content" in result) ||
        typeof result.content !== "string" ||
        !result.content.trim()
      ) {
        throw new Error(
          "The AI returned invalid reviewer content."
        );
      }

      const generated =
        result as GeneratedResponse;

      const info = getSourceInfo();

      setDraft({
        title:
          typeof generated.title === "string" &&
          generated.title.trim()
            ? generated.title.trim()
            : info.fallbackTitle,

        subject:
          typeof generated.subject === "string"
            ? generated.subject
            : "",

        content: generated.content.trim(),

        sourceType: info.sourceType,

        sourceLabel: info.sourceLabel,

        sourceId: info.sourceId,

        isAiGenerated: true,
      });

      setSaved(false);
    } catch (err) {
      console.error(
        "AI generation error:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Could not generate the reviewer."
      );
    } finally {
      setGenerating(false);
    }
  }

  // ==========================================
  // UPDATE EDITABLE DRAFT
  // ==========================================

  function updateDraft(
    field: "title" | "subject" | "content",
    value: string
  ) {
    if (saved || saving) return;

    setDraft((current) =>
      current
        ? {
            ...current,
            [field]: value,
          }
        : null
    );
  }

  // ==========================================
  // SAVE REVIEWER
  // ==========================================

  async function saveReviewer() {
    if (!draft || saving || generating || saved) {
      return;
    }

    if (!draft.title.trim()) {
      setError(
        "Reviewer title is required."
      );

      return;
    }

    if (!draft.content.trim()) {
      setError(
        "Reviewer content cannot be empty."
      );

      return;
    }

    setSaving(true);

    setError("");

    setShowSaveSuccess(false);

    try {
      await createReviewer({
        title: draft.title.trim(),

        subject: draft.subject.trim(),

        content: draft.content.trim(),

        sourceType: draft.sourceType,

        sourceLabel: draft.sourceLabel,

        sourceId: draft.sourceId,

        isAiGenerated: draft.isAiGenerated,
      });

      setSaved(true);

      setShowSaveSuccess(true);
    } catch (err) {
      console.error(
        "Reviewer save error:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Unable to save reviewer. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  // ==========================================
  // RESET FORM
  // ==========================================

  function resetForm() {
    if (saving || generating) return;

    setMode("upload");

    setUploaded(null);

    setSelectedMaterialId("");

    setPastedText("");

    setPasteTitle("");

    setDraft(null);

    setSaved(false);

    setShowSaveSuccess(false);

    setError("");
  }

  // ==========================================
  // PAGE UI
  // ==========================================

  return (
    <div className="space-y-6">

      {/* ====================================
          PAGE HEADER
      ==================================== */}

      <header className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
          StudyRoom Reviewer
        </p>

        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-foreground">
          Create a reviewer
        </h1>

        <p className="text-sm text-muted-foreground">
          Upload a file, select a saved material,
          or paste your notes to prepare a reviewer.
        </p>
      </header>

      {/* ====================================
          LINKED MATERIAL LOADING
      ==================================== */}

      {loadingMaterial && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />

          Loading selected material...
        </div>
      )}

      {/* ====================================
          SOURCE INPUT
      ==================================== */}

      {!draft && (
        <>

          {/* MODE SELECTOR */}

          <div className="inline-flex flex-wrap rounded-lg border border-border bg-secondary/30 p-1">
            {MODES.map(
              ({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    switchMode(key)
                  }
                  disabled={
                    loadingMaterial ||
                    generating
                  }
                  className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] transition-colors disabled:opacity-50 ${
                    mode === key
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />

                  {label}
                </button>
              )
            )}
          </div>

          {/* =================================
              SOURCE PANEL
          ================================= */}

          <div className="panel p-5 sm:p-6">

            {mode === "upload" ? (

              /* NEW FILE UPLOAD */

              <UploadPanel
                onReady={(result) => {
                  setUploaded(result);
                  setError("");
                }}
              />

            ) : mode === "saved" ? (

              /* =================================
                  SAVED CLOUD / LOCAL MATERIALS
              ================================= */

              <div className="space-y-4">

                <label className="block">
                  <span className="label-xs mb-1.5 block">
                    Choose a saved study material
                  </span>

                  <select
                    value={selectedMaterialId}
                    onChange={(event) => {
                      setSelectedMaterialId(
                        event.target.value
                      );

                      setError("");
                    }}
                    disabled={
                      loadingSavedMaterials ||
                      loadingMaterial
                    }
                    className="select"
                  >
                    <option value="">
                      {loadingSavedMaterials
                        ? "Loading saved materials..."
                        : "Select a material"}
                    </option>

                    {savedMaterials.map(
                      (material) => (
                        <option
                          key={material.id}
                          value={material.id}
                        >
                          {material.fileName}

                          {material.location === "local"
                            ? " (this device)"
                            : ""}
                        </option>
                      )
                    )}
                  </select>
                </label>

                {/* MATERIAL LOAD WARNINGS */}

                {materialsWarning && (
                  <p
                    role="status"
                    className="text-xs text-muted-foreground"
                  >
                    {materialsWarning}
                  </p>
                )}

                {/* EMPTY SAVED MATERIALS */}

                {!loadingSavedMaterials &&
                  savedMaterials.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No saved materials yet.
                      Upload a file from the Materials
                      page, or use the Upload a file tab.
                    </p>
                  )}

                {/* SELECTED MATERIAL PREVIEW */}

                {selectedMaterial && (
                  <div className="space-y-2 rounded-lg border border-border bg-secondary/20 p-4">

                    <p className="text-sm font-medium text-foreground">
                      {selectedMaterial.title}
                    </p>

                   <p className="text-xs text-muted-foreground">
  {selectedMaterial.location === "cloud"
    ? "Saved to your StudyRoom account"
    : "Available on this device"}
</p>

                    {selectedMaterial.extractedText
                      .trim()
                      .length === 0 ? (
                      <p className="text-xs text-destructive">
                        This file has no extracted text.
                        Try another material.
                      </p>
                    ) : (
                      <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">
                        {selectedMaterial.extractedText.slice(
                          0,
                          1200
                        )}

                        {selectedMaterial.extractedText.length >
                        1200
                          ? "…"
                          : ""}
                      </p>
                    )}
                  </div>
                )}
              </div>

            ) : (

              /* =================================
                  PASTE NOTES
              ================================= */

              <div className="space-y-4">

                {/* LESSON TITLE */}

                <label className="block">
                  <span className="label-xs mb-1.5 block">
                    Lesson title
                  </span>

                  <input
                    type="text"
                    value={pasteTitle}
                    onChange={(event) =>
                      setPasteTitle(
                        event.target.value
                      )
                    }
                    placeholder="e.g. Cell division - Chapter 4"
                    className="input"
                  />
                </label>

                {/* PASTED NOTES */}

                <label className="block">
                  <span className="label-xs mb-1.5 block">
                    Source material
                  </span>

                  <textarea
                    value={pastedText}
                    onChange={(event) =>
                      setPastedText(
                        event.target.value
                      )
                    }
                    rows={13}
                    placeholder="Paste your lesson or study notes here..."
                    className="textarea"
                  />
                </label>

                {/* CHARACTER COUNT */}

                <p className="text-xs text-muted-foreground">
  {characters === 0
    ? "Paste your notes to get started."
    : ready
      ? "Your notes are ready."
      : "Add more content to continue."}
</p>
              </div>
            )}

            {/* ERROR */}

            {error && (
              <p
                role="alert"
                className="mt-4 text-[13px] text-destructive"
              >
                {error}
              </p>
            )}

            {/* =================================
                SOURCE ACTIONS
            ================================= */}

            <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">

              <p
  className={`text-xs ${
    exceedsAiLimit
      ? "text-destructive"
      : "text-muted-foreground"
  }`}
>
  {exceedsAiLimit
    ? "This document is too large for one AI request. Split it into smaller sections."
    : ready
      ? "Your material is ready."
      : "Add more study material to continue."}
</p>

              <div className="flex flex-wrap gap-2">

                {/* PREPARE MANUAL DRAFT */}

                <button
                  type="button"
                  onClick={prepareDraft}
                  disabled={
                    !ready ||
                    generating ||
                    loadingMaterial
                  }
                  className="btn btn-secondary disabled:opacity-50"
                >
                  <PenLine className="h-4 w-4" />

                  Prepare editable draft
                </button>

                {/* GENERATE AI REVIEWER */}

               <button
  type="button"
  onClick={() =>
    void generateReviewer()
  }
  disabled={
    !ready ||
    exceedsAiLimit ||
    generating ||
    loadingMaterial
  }
  className="btn btn-primary disabled:opacity-50"
>
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}

                  {generating
                    ? "Generating reviewer..."
                    : "Generate with AI"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ====================================
          EDITABLE REVIEWER DRAFT
      ==================================== */}

      {draft && (
        <div className="space-y-5">

          {/* DRAFT HEADER */}

          <div className="flex flex-wrap items-center justify-between gap-3">

            <div>
              <h2 className="text-sm font-medium text-foreground">
                {saved
                  ? "Reviewer saved"
                  : draft.isAiGenerated
                    ? "Generated draft"
                    : "Editable draft"}
              </h2>

              <p className="mt-1 text-xs text-muted-foreground">
                {saved
                  ? "You can access your reviewer from My Reviewers."
                  : "Review, edit, and save your content to your account."}
              </p>
            </div>

            <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground">
              {saved ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : draft.isAiGenerated ? (
                <Wand2 className="h-3.5 w-3.5" />
              ) : (
                <PenLine className="h-3.5 w-3.5" />
              )}

              {saved
                ? "Saved"
                : draft.isAiGenerated
                  ? "AI generated"
                  : "Prepared from notes"}
            </span>
          </div>

          {/* ====================================
              TEMPORARY SAVE SUCCESS
          ==================================== */}

          {showSaveSuccess && (
            <div
              role="status"
              className="flex items-center gap-3 rounded-xl border border-green-500/30 bg-green-500/10 p-4"
            >
              <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />

              <p className="text-sm font-semibold text-green-500">
                Saved successfully!
              </p>
            </div>
          )}

          {/* ====================================
              EDITABLE REVIEWER FORM
          ==================================== */}

          <div className="panel space-y-5 p-5 sm:p-6">

            {/* TITLE AND SUBJECT */}

            <div className="grid gap-4 sm:grid-cols-2">

              {/* TITLE */}

              <label className="block">
                <span className="label-xs mb-1.5 block">
                  Title
                </span>

                <input
                  type="text"
                  value={draft.title}
                  onChange={(event) =>
                    updateDraft(
                      "title",
                      event.target.value
                    )
                  }
                  placeholder="Reviewer title"
                  disabled={saved || saving}
                  className="input disabled:opacity-60"
                />
              </label>

              {/* SUBJECT */}

              <label className="block">
                <span className="label-xs mb-1.5 block">
                  Subject
                </span>

                <input
                  type="text"
                  value={draft.subject}
                  onChange={(event) =>
                    updateDraft(
                      "subject",
                      event.target.value
                    )
                  }
                  placeholder="e.g. Biology"
                  disabled={saved || saving}
                  className="input disabled:opacity-60"
                />
              </label>
            </div>

            {/* REVIEWER CONTENT */}

            <label className="block">
              <span className="label-xs mb-1.5 block">
                Reviewer content
              </span>

              <textarea
                value={draft.content}
                onChange={(event) =>
                  updateDraft(
                    "content",
                    event.target.value
                  )
                }
                rows={16}
                disabled={saved || saving}
                className="textarea font-mono text-[12.5px] leading-relaxed disabled:opacity-60"
              />
            </label>

            {/* ERROR MESSAGE */}

            {error && (
              <p
                role="alert"
                className="text-[13px] text-destructive"
              >
                {error}
              </p>
            )}

            {/* =================================
                ACTION BUTTONS
            ================================= */}

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">

              {/* BACK / CREATE ANOTHER */}

              <button
                type="button"
                onClick={() => {
                  if (saved) {
                    resetForm();
                  } else {
                    setDraft(null);

                    setShowSaveSuccess(false);

                    setError("");
                  }
                }}
                disabled={
                  saving ||
                  generating
                }
                className="btn btn-ghost mr-auto text-[13px] disabled:opacity-50"
              >
                {saved
                  ? "Create another reviewer"
                  : "Back to material"}
              </button>

              {/* REGENERATE */}

              {!saved && (
                <button
                  type="button"
                  onClick={() =>
                    void generateReviewer()
                  }
                  disabled={
                    generating ||
                    saving ||
                    !ready
                  }
                  className="btn btn-secondary disabled:opacity-50"
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}

                  {generating
                    ? "Generating..."
                    : "Regenerate with AI"}
                </button>
              )}

              {/* SAVE REVIEWER */}

              <button
                type="button"
                onClick={() =>
                  void saveReviewer()
                }
                disabled={
                  saving ||
                  generating ||
                  saved
                }
                className="btn btn-primary disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : saved ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Save className="h-4 w-4" />
                )}

                {saving
                  ? "Saving..."
                  : saved
                    ? "Saved"
                    : "Save reviewer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
