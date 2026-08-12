import { getSupabase } from "./lib/supabaseClient";

export function App() {
  const wired = Boolean(getSupabase());
  return (
    <main>
      <h1>Mau Heritage — Internal Gate</h1>
      <p>Baseline app. Supabase client wired: {wired ? "yes" : "no"}.</p>
    </main>
  );
}
