
import { supabase } from "./supabaseClient";

// ==========================================
// STUDYROOM - READ SAVED REVIEWER DIAGRAMS
// ==========================================

const BUCKET = "reviewer-visuals";

export type SavedReviewerVisual = {
  pageNumber: number;
  url: string;
};

export async function getReviewerVisuals(
  reviewerId: string
): Promise<SavedReviewerVisual[]> {
  // Verify logged-in user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error(
      "Please log in to view reviewer diagrams."
    );
  }

  // Get image records for this reviewer
  const { data, error } = await supabase
    .from("reviewer_visuals")
    .select("page_number, storage_path")
    .eq("reviewer_id", reviewerId)
    .eq("user_id", user.id)
    .order("page_number", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  // Generate temporary URLs for private images
  const visuals = await Promise.all(
    (data ?? []).map(async (image) => {
      const { data: signed, error: signedError } =
        await supabase.storage
          .from(BUCKET)
          .createSignedUrl(
            image.storage_path,
            3600
          );

      if (signedError || !signed?.signedUrl) {
        throw new Error(
          "Could not load a saved diagram."
        );
      }

      return {
        pageNumber: image.page_number,
        url: signed.signedUrl,
      };
    })
  );

  return visuals;
}
