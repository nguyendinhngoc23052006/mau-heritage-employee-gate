import { getSupabase } from "../lib/supabaseClient";

export async function signInWithPassword(email: string, password: string) {
  const supabase = getSupabase();
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUpWithPassword(email: string, password: string) {
  const supabase = getSupabase();
  return supabase.auth.signUp({ email, password });
}

export async function signOut() {
  const supabase = getSupabase();
  return supabase.auth.signOut();
}
