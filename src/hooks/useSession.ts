import type { Session, User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { getSupabase } from "../lib/supabaseClient";

interface State {
  session: Session | null;
  user: User | null;
  loading: boolean;
}

export function useSession(): State {
  const [state, setState] = useState<State>({
    session: null,
    user: null,
    loading: true,
  });

  useEffect(() => {
    const supabase = getSupabase();
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setState({
        session: data.session,
        user: data.session?.user ?? null,
        loading: false,
      });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ session, user: session?.user ?? null, loading: false });
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
