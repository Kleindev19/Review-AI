
import { supabase } from "./supabaseClient";

import {
  uploadReviewerVisuals,
  MAX_REVIEWER_IMAGES,
  type ReviewerVisual,
} from "./reviewerVisualStorage";

// ==========================================
// TYPES
// ==========================================

export type CreateReviewerInput = {
  title: string;
  subject: string;
  content: string;

  sourceType: "upload" | "text";
  sourceLabel: string;
  sourceId: string | null;

  isAiGenerated: boolean;

  // Optional graphs, diagrams, and image pages.
  visuals?: ReviewerVisual[];
};

// ==========================================
// CREATE AND SAVE REVIEWER
// ==========================================

export async function createReviewer(
  input: CreateReviewerInput
): Promise<string> {
  const visuals = input.visuals ?? [];

  // ========================================
  // VALIDATE VISUAL COUNT
  // ========================================

  if (!Array.isArray(visuals)) {
    throw new Error(
      "Invalid reviewer image collection."
    );
  }

  if (visuals.length > MAX_REVIEWER_IMAGES) {
    throw new Error(
      `Maximum of ${MAX_REVIEWER_IMAGES} images per reviewer.`
    );
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
      "Please log in to save a reviewer."
    );
  }

  // ========================================
  // STEP 1: CREATE REVIEWER RECORD
  // ========================================

  const { data, error } = await supabase
    .from("reviewers")
    .insert({
      user_id: user.id,
      title: input.title.trim(),
      subject: input.subject.trim(),
      content: input.content,
      source_type: input.sourceType,
      source_label: input.sourceLabel,
      source_id: input.sourceId,
      is_ai_generated: input.isAiGenerated,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const reviewerId: string = data.id;

  // ========================================
  // TEXT-ONLY REVIEWER
  // ========================================

  if (visuals.length === 0) {
    return reviewerId;
  }

  let uploadedPaths: string[] = [];

  // ========================================
  // STEP 2: UPLOAD REVIEWER IMAGES
  // ========================================

  try {
    const uploaded = await uploadReviewerVisuals(
      reviewerId,
      visuals
    );

    uploadedPaths = uploaded.map(
      (visual) => visual.storagePath
    );

    // ======================================
    // STEP 3: LINK IMAGES TO REVIEWER
    // ======================================

    const imageRecords = uploaded.map(
      (visual) => ({
        reviewer_id: reviewerId,
        user_id: user.id,
        page_number: visual.pageNumber,
        storage_path: visual.storagePath,
      })
    );

    const { error: imageError } = await supabase
      .from("reviewer_visuals")
      .insert(imageRecords);

    if (imageError) {
      throw new Error(
        `Could not save reviewer images: ${imageError.message}`
      );
    }

    // ======================================
    // SAVE SUCCESS
    // ======================================

    return reviewerId;
  } catch (saveError) {
    console.error(
      "Reviewer image saving failed:",
      saveError
    );

    // ======================================
    // REMOVE UPLOADED IMAGES ON FAILURE
    // ======================================

    if (uploadedPaths.length > 0) {
      const { error: cleanupError } =
        await supabase.storage
          .from("reviewer-visuals")
          .remove(uploadedPaths);

      if (cleanupError) {
        console.error(
          "Storage cleanup failed:",
          cleanupError
        );
      }
    }

    // ======================================
    // ROLLBACK INCOMPLETE REVIEWER
    // ======================================

    const { error: rollbackError } =
      await supabase
        .from("reviewers")
        .delete()
        .eq("id", reviewerId)
        .eq("user_id", user.id);

    if (rollbackError) {
      console.error(
        "Reviewer rollback failed:",
        rollbackError
      );
    }

    throw saveError;
  }
}
