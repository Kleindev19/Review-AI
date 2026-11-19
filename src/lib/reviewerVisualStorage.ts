
import { supabase } from "./supabaseClient";

// ==========================================
// STUDYROOM - REVIEWER VISUAL STORAGE
// ==========================================

const BUCKET = "reviewer-visuals";

const MAX_IMAGES = 3;
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

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

// ==========================================
// CONVERT BASE64 IMAGE INTO BLOB
// ==========================================

function dataUrlToBlob(dataUrl: string): Blob {
  const match = dataUrl.match(
    /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/
  );

  if (!match) {
    throw new Error("Invalid JPEG image data.");
  }

  const estimatedSize =
    Math.floor((match[1].length * 3) / 4);

  if (estimatedSize > MAX_IMAGE_SIZE + 2) {
    throw new Error(
      "Each diagram must be 2 MB or smaller."
    );
  }

  const binary = atob(match[1]);

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
// UPLOAD REVIEWER DIAGRAMS
// ==========================================

export async function uploadReviewerVisuals(
  reviewerId: string,
  visuals: ReviewerVisual[]
): Promise<UploadedReviewerVisual[]> {
  if (!reviewerId.trim() || reviewerId.includes("/")) {
    throw new Error("Invalid reviewer ID.");
  }

  if (!Array.isArray(visuals)) {
    throw new Error("Invalid reviewer visuals.");
  }

  if (visuals.length === 0) {
    return [];
  }

  if (visuals.length > MAX_IMAGES) {
    throw new Error(
      "Maximum of 3 diagrams per reviewer."
    );
  }

  // Get authenticated user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error(
      "Please log in to upload reviewer diagrams."
    );
  }

  const uploaded: UploadedReviewerVisual[] = [];

  try {
    for (const visual of visuals) {
      if (
        !Number.isInteger(visual.pageNumber) ||
        visual.pageNumber < 1 ||
        visual.mimeType !== "image/jpeg"
      ) {
        throw new Error(
          "Invalid diagram information."
        );
      }

      const imageBlob = dataUrlToBlob(
        visual.dataUrl
      );

      // User ID / Reviewer ID / Image
      const path =
        `${user.id}/${reviewerId}/` +
        `page-${visual.pageNumber}-` +
        `${crypto.randomUUID()}.jpg`;

      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, imageBlob, {
          contentType: "image/jpeg",
          upsert: false,
          cacheControl: "3600",
        });

      if (error) {
        throw new Error(
          `Diagram upload failed: ${error.message}`
        );
      }

      uploaded.push({
        pageNumber: visual.pageNumber,
        storagePath: path,
      });
    }

    return uploaded;
  } catch (error) {
    // Remove images uploaded in this attempt
    // to avoid leaving incomplete uploads.
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
