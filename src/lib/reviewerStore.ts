
import { supabase } from "./supabaseClient";

import {
  uploadReviewerVisuals,
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

  // Optional uploaded graphs and diagrams
  visuals?: ReviewerVisual[];
};

// ==========================================
// CREATE AND SAVE REVIEWER
// ==========================================

export async function createReviewer(
  input: CreateReviewerInput
): Promise<string> {
  // Get authenticated user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error(
      "Please log in to save a reviewer."
    );
  }

  // Step 1: Create the reviewer record
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

  const visuals = input.visuals ?? [];

  // No images? Text-only reviewer is complete.
  if (visuals.length === 0) {
    return reviewerId;
  }

  let uploadedPaths: string[] = [];

  try {
    // Step 2: Upload original diagrams
    const uploaded = await uploadReviewerVisuals(
      reviewerId,
      visuals
    );

    uploadedPaths = uploaded.map(
      (visual) => visual.storagePath
    );

    // Step 3: Link diagrams to reviewer
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
        `Could not save reviewer diagrams: ${imageError.message}`
      );
    }

    // Everything saved successfully
    return reviewerId;
  } catch (saveError) {
    console.error(
      "Reviewer image saving failed:",
      saveError
    );

    // Remove uploaded images if linking fails
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

    // Best-effort rollback of incomplete reviewer.
    // Requires an existing DELETE RLS policy
    // allowing the user to delete their reviewer.
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
