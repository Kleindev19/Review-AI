
import { supabase } from "./supabaseClient";

export type CreateReviewerInput = {
  title: string;
  subject: string;
  content: string;
  sourceType: "upload" | "text";
  sourceLabel: string;
  sourceId: string | null;
  isAiGenerated: boolean;
};

export async function createReviewer(
  input: CreateReviewerInput
): Promise<string> {

  // Get the currently authenticated user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Please log in to save a reviewer.");
  }

  // Save the reviewer to Supabase
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

  return data.id;
}
