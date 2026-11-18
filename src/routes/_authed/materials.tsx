
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Download,
  FileText,
  Layers,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";

import UploadPanel from "../../components/create/UploadPanel";

import {
  cacheMaterialLocally,
  deleteMaterial,
  getMaterial,
  listMaterials,
  type StoredMaterial,
} from "../../lib/materialStore";

import {
  deleteCloudMaterial,
  getCloudMaterialFile,
  listCloudMaterials,
  migrateLocalMaterialsToCloud,
  syncLocalMaterialToCloud,
  type CloudMaterial,
} from "../../lib/cloudMaterialStore";

type MaterialItem = Pick<
  CloudMaterial,
  | "id"
  | "title"
  | "file_name"
  | "file_type"
  | "size_bytes"
  | "extracted_text"
  | "created_date"
> & {
  inCloud: boolean;
};

type UploadResult = {
  text: string;
  sourceLabel: string;
  materialId: string | null;
};

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong.";
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";

  const units = ["B", "KB", "MB", "GB"];

  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );

  return `${(
    bytes / Math.pow(1024, index)
  ).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
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

export default function MaterialsPage() {
  const navigate = useNavigate();

  const [materials, setMaterials] = useState<
    MaterialItem[]
  >([]);

  const [localIds, setLocalIds] = useState<
    Set<string>
  >(new Set());

  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  const [expandedId, setExpandedId] = useState<
    string | null
  >(null);

  const [deletingId, setDeletingId] = useState<
    string | null
  >(null);

  const [downloadingId, setDownloadingId] = useState<
    string | null
  >(null);

  const [openingId, setOpeningId] = useState<
    string | null
  >(null);

  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // ==========================================
  // LOAD CLOUD AND LOCAL MATERIALS
  // ==========================================

  const refreshMaterials = useCallback(async () => {
    const [cloudResult, localResult] =
      await Promise.allSettled([
        listCloudMaterials(),
        listMaterials(),
      ]);

    const cloud =
      cloudResult.status === "fulfilled"
        ? cloudResult.value
        : [];

    const local =
      localResult.status === "fulfilled"
        ? localResult.value
        : [];

    const cloudIds = new Set(
      cloud.map((item) => item.id)
    );

    setLocalIds(
      new Set(local.map((item) => item.id))
    );

    const combined: MaterialItem[] = [
      ...cloud.map((item) => ({
        id: item.id,
        title: item.title,
        file_name: item.file_name,
        file_type: item.file_type,
        size_bytes: item.size_bytes,
        extracted_text: item.extracted_text,
        created_date: item.created_date,
        inCloud: true,
      })),

      ...local
        .filter(
          (item) => !cloudIds.has(item.id)
        )
        .map((item) => ({
          id: item.id,
          title: item.title,
          file_name: item.file_name,
          file_type: item.file_type,
          size_bytes: item.size_bytes,
          extracted_text: item.extracted_text,
          created_date: item.created_date,
          inCloud: false,
        })),
    ];

    combined.sort(
      (a, b) =>
        new Date(b.created_date).getTime() -
        new Date(a.created_date).getTime()
    );

    setMaterials(combined);

    const failures: string[] = [];

    if (cloudResult.status === "rejected") {
      failures.push(
        `Cloud materials unavailable: ${
          errorMessage(cloudResult.reason)
        }`
      );
    }

    if (localResult.status === "rejected") {
      failures.push(
        `Local materials unavailable: ${
          errorMessage(localResult.reason)
        }`
      );
    }

    if (failures.length) {
      setError(failures.join(" "));
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void refreshMaterials();
  }, [refreshMaterials]);

  const localOnlyCount = materials.filter(
    (item) => !item.inCloud
  ).length;

  const working = Boolean(
    deletingId ||
    downloadingId ||
    openingId ||
    syncing
  );

  // ==========================================
  // UPLOAD COMPLETED - SYNC ONE FILE
  // ==========================================

  async function handleUploadReady(
    result: UploadResult | null
  ) {
    if (!result) return;

    if (!result.materialId) {
      setError(
        "The file was read but was not saved to your Materials Library."
      );
      return;
    }

    setSyncing(true);
    setError("");
    setNotice("");

    try {
      await syncLocalMaterialToCloud(
        result.materialId
      );

      setNotice(
        "Material saved to your account."
      );
    } catch (err) {
      setError(
        `Saved on this device, but cloud sync failed: ${
          errorMessage(err)
        }`
      );
    } finally {
      setShowUpload(false);
      await refreshMaterials();
      setSyncing(false);
    }
  }

  // ==========================================
  // IMPORT OLD LOCAL MATERIALS
  // ==========================================

  async function importLocalMaterials() {
    if (working) return;

    setSyncing(true);
    setError("");
    setNotice("");

    try {
      const result =
        await migrateLocalMaterialsToCloud();

      setNotice(
        result.migrated > 0
          ? `${result.migrated} local file(s) copied to your account.`
          : "No new local files needed importing."
      );

      if (result.failed.length > 0) {
        const first = result.failed[0];

        setError(
          `${result.failed.length} file(s) could not be imported. ${
            first.file_name
          }: ${first.error}`
        );
      }
    } catch (err) {
      setError(
        `Import failed: ${errorMessage(err)}`
      );
    } finally {
      await refreshMaterials();
      setSyncing(false);
    }
  }

  // ==========================================
  // DOWNLOAD ORIGINAL FILE
  // ==========================================

  async function downloadOriginal(
    material: MaterialItem
  ) {
    if (working) return;

    setDownloadingId(material.id);
    setError("");

    try {
      let blob: Blob | undefined;

      if (material.inCloud) {
        blob = await getCloudMaterialFile(
          material.id
        );
      } else {
        blob = (
          await getMaterial(material.id)
        )?.original_file;
      }

      if (!blob) {
        throw new Error(
          "The original file is unavailable."
        );
      }

      const url =
        URL.createObjectURL(blob);

      const anchor =
        document.createElement("a");

      anchor.href = url;
      anchor.download = material.file_name;

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      window.setTimeout(
        () => URL.revokeObjectURL(url),
        10000
      );
    } catch (err) {
      setError(
        `Could not download the original file: ${
          errorMessage(err)
        }`
      );
    } finally {
      setDownloadingId(null);
    }
  }

  // ==========================================
  // OPEN MATERIAL IN STUDY TOOL
  // ==========================================

  async function openStudyTool(
    material: MaterialItem,
    destination: "create" | "flashcards" | "quizzes"
  ) {
    if (working) return;

    setOpeningId(material.id);
    setError("");

    try {
      // Existing AI pages read from IndexedDB.
      // Cache a cloud-only file with the same ID.

      if (!localIds.has(material.id)) {
        const file =
          await getCloudMaterialFile(material.id);

        const record: StoredMaterial = {
          id: material.id,
          title: material.title,
          file_name: material.file_name,
          file_type: material.file_type,
          size_bytes: material.size_bytes,
          extracted_text: material.extracted_text,
          created_date: material.created_date,
          original_file: file,
        };

        await cacheMaterialLocally(record);
      }

      navigate(
        `/${destination}?material=${encodeURIComponent(
          material.id
        )}`
      );
    } catch (err) {
      setError(
        `Could not open the material: ${
          errorMessage(err)
        }`
      );
    } finally {
      setOpeningId(null);
    }
  }

  // ==========================================
  // DELETE MATERIAL
  // ==========================================

  async function removeMaterial(
    material: MaterialItem
  ) {
    if (working) return;

    const confirmed = window.confirm(
      `Delete "${material.title}" from your Materials Library?`
    );

    if (!confirmed) return;

    setDeletingId(material.id);
    setError("");
    setNotice("");

    try {
      if (material.inCloud) {
        await deleteCloudMaterial(
          material.id
        );
      }

      const local = await getMaterial(
        material.id
      );

      if (local) {
        await deleteMaterial(material.id);
      }

      if (expandedId === material.id) {
        setExpandedId(null);
      }

      setNotice("Material deleted.");
      await refreshMaterials();
    } catch (err) {
      setError(
        `Could not completely delete the material: ${
          errorMessage(err)
        }`
      );

      await refreshMaterials();
    } finally {
      setDeletingId(null);
    }
  }

  // ==========================================
  // PAGE UI
  // ==========================================

  return (
    <div className="space-y-6">

      {/* PAGE HEADER */}

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            Library
          </p>

          <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.02em] text-foreground">
            Materials
          </h1>

          <p className="mt-1.5 text-sm text-muted-foreground">
            Keep your PDF, Word, and text lessons
            organized in one place.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            setShowUpload((value) => !value)
          }
          disabled={working}
          className="btn btn-primary disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />

          {showUpload
            ? "Close upload"
            : "Upload material"}
        </button>
      </header>

      {/* CLOUD STATUS AND LOCAL IMPORT */}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Cloud files are saved to your account.
          Local-only files remain on this device.
        </p>

        {localOnlyCount > 0 && (
          <button
            type="button"
            onClick={() =>
              void importLocalMaterials()
            }
            disabled={working}
            className="btn btn-secondary btn-sm disabled:opacity-50"
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}

            {syncing
              ? "Syncing..."
              : `Import ${localOnlyCount} local file(s)`}
          </button>
        )}
      </div>

      {/* UPLOAD PANEL */}

      {showUpload && (
        <div className="panel space-y-4 p-5 sm:p-6">
          <div>
            <h2 className="text-sm font-medium text-foreground">
              Upload study material
            </h2>

            <p className="mt-1 text-xs text-muted-foreground">
              Supported formats: PDF, DOCX, TXT
              (up to 20 MB)
            </p>
          </div>

          <UploadPanel
            onReady={(result) =>
              void handleUploadReady(result)
            }
          />

          {syncing && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Saving to your account...
            </p>
          )}
        </div>
      )}

      {/* ERRORS AND NOTICES */}

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-[13px] text-destructive"
        >
          {error}
        </div>
      )}

      {notice && (
        <p
          role="status"
          className="text-[13px] text-muted-foreground"
        >
          {notice}
        </p>
      )}

      {/* MATERIAL COUNT */}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-foreground">
          Saved materials
        </h2>

        <span className="text-xs text-muted-foreground">
          {materials.length}{" "}
          {materials.length === 1
            ? "file"
            : "files"}
        </span>
      </div>

      {/* LOADING */}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading materials...
        </div>
      ) : materials.length === 0 ? (

        /* EMPTY LIBRARY */

        <div className="panel flex flex-col items-center justify-center px-6 py-14 text-center">
          <Layers className="h-9 w-9 text-muted-foreground" />

          <h3 className="mt-4 text-base font-medium text-foreground">
            No materials uploaded yet
          </h3>

          <p className="mt-2 max-w-sm text-[13px] text-muted-foreground">
            Upload your first lesson to use it
            for reviewers, flashcards, or quizzes.
          </p>

          {!showUpload && (
            <button
              type="button"
              onClick={() => setShowUpload(true)}
              className="btn btn-secondary mt-5"
            >
              <Plus className="h-4 w-4" />
              Upload your first file
            </button>
          )}
        </div>
      ) : (

        /* SAVED MATERIALS */

        <div className="space-y-3">
          {materials.map((material) => {
            const expanded =
              expandedId === material.id;

            const opening =
              openingId === material.id;

            return (
              <article
                key={material.id}
                className="panel overflow-hidden"
              >
                <div className="p-5">
                  <div className="flex items-start gap-3">

                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="break-words text-[14px] font-medium text-foreground">
                        {material.title ||
                          material.file_name}
                      </h3>

                      <p className="mt-1 break-all text-xs text-muted-foreground">
                        {material.file_name}
                      </p>

                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {formatBytes(
                          material.size_bytes
                        )}

                        {" · "}

                        {formatDate(
                          material.created_date
                        )}

                        {" · "}

                        {material.extracted_text.length.toLocaleString()} characters

                        {" · "}

                        {material.inCloud
                          ? "Saved to account"
                          : "On this device"}
                      </p>
                    </div>

                    {/* DELETE */}

                    <button
                      type="button"
                      onClick={() =>
                        void removeMaterial(material)
                      }
                      disabled={working}
                      title="Delete material"
                      aria-label={`Delete ${material.file_name}`}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                    >
                      {deletingId === material.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  {/* STUDY TOOL BUTTONS */}

                  <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                    <button
                      type="button"
                      onClick={() =>
                        void openStudyTool(
                          material,
                          "create"
                        )
                      }
                      disabled={working}
                      className="btn btn-primary btn-sm disabled:opacity-50"
                    >
                      {opening ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}

                      Create reviewer
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void openStudyTool(
                          material,
                          "flashcards"
                        )
                      }
                      disabled={working}
                      className="btn btn-secondary btn-sm disabled:opacity-50"
                    >
                      <Layers className="h-3.5 w-3.5" />
                      Flashcards
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void openStudyTool(
                          material,
                          "quizzes"
                        )
                      }
                      disabled={working}
                      className="btn btn-secondary btn-sm disabled:opacity-50"
                    >
                      <ClipboardCheck className="h-3.5 w-3.5" />
                      Quiz
                    </button>
                  </div>

                  {/* PREVIEW AND DOWNLOAD */}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId(
                          expanded
                            ? null
                            : material.id
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      {expanded ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}

                      {expanded
                        ? "Hide extracted text"
                        : "View extracted text"}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void downloadOriginal(material)
                      }
                      disabled={working}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
                    >
                      {downloadingId === material.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}

                      Download original
                    </button>
                  </div>
                </div>

                {/* EXTRACTED TEXT */}

                {expanded && (
                  <div className="border-t border-border bg-secondary/20 p-5">
                    <h4 className="mb-3 text-xs font-medium text-foreground">
                      Extracted text
                    </h4>

                    <div className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-background p-4 text-[12.5px] leading-relaxed text-muted-foreground">
                      {material.extracted_text ||
                        "No readable text was extracted."}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
