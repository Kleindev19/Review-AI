
import { supabase } from "./supabaseClient";

// ==========================================
// STUDYROOM - REVIEWER VISUAL STORAGE
// ==========================================

const BUCKET = "reviewer-visuals";

export const MAX_REVIEWER_IMAGES = 30;

const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
const MAX_TOTAL_IMAGE_SIZE = 30 * 1024 * 1024;

// ==========================================
// TYPES
// ==========================================

export type ReviewerVisual = {
  pageNumber: number;
  mimeType: "image/jpeg";
  dataUrl: string;
};

export type UploadedReviewerVisual = {
  pageNumber: number;
  storagePath: string;
};

type PreparedVisual = {
  pageNumber: number;
  blob: Blob;
};

// ==========================================
// CONVERT BASE64 IMAGE INTO BLOB
// ==========================================

function dataUrlToBlob(dataUrl: string): Blob {
  if (typeof dataUrl !== "string") {
    throw new Error("Invalid image data.");
  }

  const match = dataUrl.match(
    /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/
  );

  if (!match) {
    throw new Error("Invalid JPEG image data.");
  }

  const base64 = match[1];

  const estimatedSize = Math.floor(
    (base64.length * 3) / 4
  );

  if (estimatedSize > MAX_IMAGE_SIZE + 2) {
    throw new Error(
      "Each processed image must be 2 MB or smaller."
    );
  }

  const binary = atob(base64);

  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  if (
    bytes.length === 0 ||
    bytes.length > MAX_IMAGE_SIZE ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[2] !== 0xff
  ) {
    throw new Error(
      "Image must be a valid JPEG under 2 MB."
    );
  }

  return new Blob([bytes], {
    type: "image/jpeg",
  });
}

// ==========================================
// VALIDATE AND PREPARE IMAGE BATCH
// ==========================================

function prepareReviewerVisuals(
  visuals: ReviewerVisual[]
): PreparedVisual[] {
  if (!Array.isArray(visuals)) {
    throw new Error("Invalid reviewer visuals.");
  }

  if (visuals.length > MAX_REVIEWER_IMAGES) {
    throw new Error(
      `Maximum of ${MAX_REVIEWER_IMAGES} images per reviewer.`
    );
  }

  const sortedVisuals = [...visuals].sort(
    (a, b) => a.pageNumber - b.pageNumber
  );

  const seenPages = new Set<number>();

  const prepared: PreparedVisual[] = [];

  let totalSize = 0;

  for (const visual of sortedVisuals) {
    if (
      !visual ||
      !Number.isInteger(visual.pageNumber) ||
      visual.pageNumber < 1 ||
      visual.pageNumber > MAX_REVIEWER_IMAGES ||
      visual.mimeType !== "image/jpeg"
    ) {
      throw new Error(
        "Invalid reviewer image information."
      );
    }

    if (seenPages.has(visual.pageNumber)) {
      throw new Error(
        `Duplicate image page ${visual.pageNumber}.`
      );
    }

    seenPages.add(visual.pageNumber);

    const blob = dataUrlToBlob(visual.dataUrl);

    totalSize += blob.size;

    if (totalSize > MAX_TOTAL_IMAGE_SIZE) {
      throw new Error(
        "Combined processed images must be 30 MB or smaller."
      );
    }

    prepared.push({
      pageNumber: visual.pageNumber,
      blob,
    });
  }

  return prepared;
}

// ==========================================
// UPLOAD REVIEWER IMAGES
// ==========================================

export async function uploadReviewerVisuals(
  reviewerId: string,
  visuals: ReviewerVisual[]
): Promise<UploadedReviewerVisual[]> {
  if (
    typeof reviewerId !== "string" ||
    !reviewerId.trim() ||
    reviewerId.includes("/")
  ) {
    throw new Error("Invalid reviewer ID.");
  }

  // Validate all images before uploading.
  const prepared = prepareReviewerVisuals(visuals);

  if (prepared.length === 0) {
    return [];
  }

  // ========================================
  // AUTHENTICATION
  // ========================================

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error(
      "Please log in to upload reviewer images."
    );
  }

  const uploaded: UploadedReviewerVisual[] = [];

  // ========================================
  // UPLOAD IMAGES
  // ========================================

  try {
    for (const visual of prepared) {
      const path =
        `${user.id}/${reviewerId}/` +
        `page-${visual.pageNumber}-` +
        `${crypto.randomUUID()}.jpg`;

      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, visual.blob, {
          contentType: "image/jpeg",
          upsert: false,
          cacheControl: "3600",
        });

      if (error) {
        throw new Error(
          `Page ${visual.pageNumber} upload failed: ${error.message}`
        );
      }

      uploaded.push({
        pageNumber: visual.pageNumber,
        storagePath: path,
      });
    }

    return uploaded;
  } catch (error) {
    // ======================================
    // CLEAN UP PARTIAL UPLOADS
    // ======================================

    if (uploaded.length > 0) {
      const paths = uploaded.map(
        (item) => item.storagePath
      );

      const { error: cleanupError } =
        await supabase.storage
          .from(BUCKET)
          .remove(paths);

      if (cleanupError) {
        console.error(
          "Reviewer image cleanup failed:",
          cleanupError
        );
      }
    }

    throw error;
  }
}
