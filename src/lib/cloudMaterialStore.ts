
import { supabase } from "./supabaseClient";
import { listMaterials } from "./materialStore";

// ==========================================
// CONFIGURATION
// ==========================================

const BUCKET = "studyroom-materials";
const MAX_FILE_SIZE = 20 * 1024 * 1024;

const SUPPORTED_TYPES = [
  "pdf",
  "docx",
  "txt",
];

const MIME_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
};

const MATERIAL_COLUMNS = `
  id,
  title,
  file_name,
  file_type,
  size_bytes,
  extracted_text,
  storage_path,
  created_date
`;

// ==========================================
// TYPES
// ==========================================

export type CloudMaterial = {
  id: string;
  title: string;
  file_name: string;
  file_type: string;
  size_bytes: number;
  extracted_text: string;
  storage_path: string;
  created_date: string;
};

type UploadOptions = {
  id?: string;
  title?: string;
  created_date?: string;
};

export type MaterialMigrationResult = {
  migrated: number;
  skipped: number;
  failed: {
    file_name: string;
    error: string;
  }[];
};

// ==========================================
// AUTHENTICATION
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
      "Please sign in to manage your materials."
    );
  }

  return user.id;
}

// ==========================================
// FILE VALIDATION
// ==========================================

function getExtension(fileName: string): string {
  return (
    fileName.split(".").pop()?.toLowerCase() ?? ""
  );
}

function validateFile(file: File): string {
  if (!file.name.trim()) {
    throw new Error("Invalid file name.");
  }

  const extension = getExtension(file.name);

  if (!SUPPORTED_TYPES.includes(extension)) {
    throw new Error(
      "Only PDF, DOCX, and TXT files are supported."
    );
  }

  if (file.size === 0) {
    throw new Error("The file is empty.");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(
      "File size must not exceed 20 MB."
    );
  }

  return extension;
}

// ==========================================
// UPLOAD FILE AND SAVE METADATA
// ==========================================

async function uploadMaterial(
  file: File,
  extractedText: string,
  options: UploadOptions = {}
): Promise<CloudMaterial> {
  const extension = validateFile(file);
  const userId = await getUserId();

  const id = options.id ?? crypto.randomUUID();

  // Original filename is stored in the database,
  // not in the object path.
  const storagePath =
    `${userId}/${id}.${extension}`;

  // 1. Upload original file.
  const { error: uploadError } =
    await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType:
          MIME_TYPES[extension],
      });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  // 2. Save searchable file metadata and text.
  const { data, error: insertError } =
    await supabase
      .from("materials")
      .insert({
        id,
        user_id: userId,
        title:
          options.title ??
          file.name.replace(/\.[^.]+$/, ""),
        file_name: file.name,
        file_type: extension,
        size_bytes: file.size,
        extracted_text: extractedText,
        storage_path: storagePath,
        created_date:
          options.created_date ??
          new Date().toISOString(),
      })
      .select(MATERIAL_COLUMNS)
      .single();

  if (insertError) {
    // Best-effort cleanup if database save fails.
    const { error: cleanupError } =
      await supabase.storage
        .from(BUCKET)
        .remove([storagePath]);

    if (cleanupError) {
      console.error(
        "Failed to clean up uploaded file:",
        cleanupError
      );
    }

    throw new Error(insertError.message);
  }

  return data as CloudMaterial;
}

export async function saveCloudMaterial(
  file: File,
  extractedText: string
): Promise<CloudMaterial> {
  return uploadMaterial(file, extractedText);
}

// ==========================================
// LIST MATERIALS FROM CLOUD
// ==========================================

export async function listCloudMaterials():
  Promise<CloudMaterial[]> {
  const userId = await getUserId();

  const { data, error } = await supabase
    .from("materials")
    .select(MATERIAL_COLUMNS)
    .eq("user_id", userId)
    .order("created_date", {
      ascending: false,
    });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as CloudMaterial[];
}

// ==========================================
// GET ONE MATERIAL
// ==========================================

export async function getCloudMaterial(
  id: string
): Promise<CloudMaterial | null> {
  const userId = await getUserId();

  const { data, error } = await supabase
    .from("materials")
    .select(MATERIAL_COLUMNS)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data
    ? (data as CloudMaterial)
    : null;
}

// ==========================================
// DOWNLOAD ORIGINAL FILE
// ==========================================

export async function getCloudMaterialFile(
  id: string
): Promise<File> {
  const material = await getCloudMaterial(id);

  if (!material) {
    throw new Error("Material not found.");
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(material.storage_path);

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error(
      "The original file is unavailable."
    );
  }

  return new File(
    [data],
    material.file_name,
    {
      type:
        MIME_TYPES[material.file_type] ??
        data.type,
    }
  );
}

// ==========================================
// DELETE CLOUD MATERIAL
// ==========================================

export async function deleteCloudMaterial(
  id: string
): Promise<void> {
  const userId = await getUserId();
  const material = await getCloudMaterial(id);

  if (!material) {
    return;
  }

  // Delete the original file through the
  // Storage API, not by deleting storage
  // database metadata directly.
  const { error: storageError } =
    await supabase.storage
      .from(BUCKET)
      .remove([material.storage_path]);

  if (storageError) {
    throw new Error(storageError.message);
  }

  const { error: databaseError } =
    await supabase
      .from("materials")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

  if (databaseError) {
    throw new Error(
      "The original file was removed, but its database record could not be deleted: " +
        databaseError.message
    );
  }
}

// ==========================================
// COPY EXISTING LOCAL MATERIALS TO CLOUD
// ==========================================

export async function migrateLocalMaterialsToCloud():
  Promise<MaterialMigrationResult> {
  // Read the original IndexedDB records.
  const localMaterials = await listMaterials();

  // Read what this account already has
  // to avoid duplicate migrations.
  const cloudMaterials = await listCloudMaterials();

  const existingIds = new Set(
    cloudMaterials.map((material) => material.id)
  );

  const result: MaterialMigrationResult = {
    migrated: 0,
    skipped: 0,
    failed: [],
  };

  for (const material of localMaterials) {
    if (existingIds.has(material.id)) {
      result.skipped += 1;
      continue;
    }

    try {
      const file = new File(
        [material.original_file],
        material.file_name,
        {
          type:
            material.original_file.type ||
            MIME_TYPES[material.file_type] ||
            "application/octet-stream",
        }
      );

      // Preserve the original material ID.
      // Existing reviewer/material links can
      // continue using the same ID.
      await uploadMaterial(
        file,
        material.extracted_text,
        {
          id: material.id,
          title: material.title,
          created_date:
            material.created_date,
        }
      );

      existingIds.add(material.id);
      result.migrated += 1;
    } catch (error) {
      result.failed.push({
        file_name: material.file_name,
        error:
          error instanceof Error
            ? error.message
            : "Migration failed.",
      });
    }
  }

  // IMPORTANT:
  // Nothing is deleted from IndexedDB.
  return result;
}


export async function syncLocalMaterialToCloud(
  id: string
): Promise<CloudMaterial> {
  const local = (await listMaterials()).find(
    (material) => material.id === id
  );

  if (!local) {
    throw new Error("Local material not found.");
  }

  const existing = await getCloudMaterial(id);

  if (existing) return existing;

  if (!(local.original_file instanceof Blob)) {
    throw new Error("Original local file is unavailable.");
  }

  const extension = getExtension(local.file_name);

  const file = new File(
    [local.original_file],
    local.file_name,
    {
      type:
        MIME_TYPES[extension] ||
        local.original_file.type,
    }
  );

  return uploadMaterial(
    file,
    local.extracted_text,
    {
      id: local.id,
      title: local.title,
      created_date: local.created_date,
    }
  );
}
