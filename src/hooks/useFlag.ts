import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "../lib/supabaseClient";

export function useFlag(name: string): boolean {
  const { data } = useQuery({
    queryKey: ["feature_flag", name],
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("feature_flags")
        .select("enabled")
        .eq("name", name)
        .maybeSingle();
      if (error) return false;
      return data?.enabled ?? false;
    },
    staleTime: 60_000,
  });
  return data ?? false;
}
