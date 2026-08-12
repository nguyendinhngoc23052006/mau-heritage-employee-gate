import { type SupabaseClient, createClient } from "@supabase/supabase-js";

export function buildSupabaseClient(env: {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}): SupabaseClient {
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url) {
    throw new Error("VITE_SUPABASE_URL is not set");
  }
  if (!key) {
    throw new Error("VITE_SUPABASE_PUBLISHABLE_KEY is not set");
  }
  return createClient(url, key);
}

let cached: SupabaseClient | undefined;
export function getSupabase(): SupabaseClient {
  if (!cached) {
    cached = buildSupabaseClient(import.meta.env);
  }
  return cached;
}
