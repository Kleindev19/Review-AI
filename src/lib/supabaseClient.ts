import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Check kung nababasa ang environment variables
console.log("Supabase ENV Check:", {
  urlLoaded: Boolean(supabaseUrl),
  keyLoaded: Boolean(supabaseKey),
});

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase configuration.");
}

export const supabase = createClient(
  supabaseUrl,
  supabaseKey
);