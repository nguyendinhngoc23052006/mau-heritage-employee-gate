import { getSupabase } from "../lib/supabaseClient";

export async function sendMagicLink(email: string) {
  const supabase = getSupabase();
  return supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}/callback` },
  });
}

export async function signOut() {
  const supabase = getSupabase();
  return supabase.auth.signOut();
}
