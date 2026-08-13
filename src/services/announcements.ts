import { getSupabase } from "../lib/supabaseClient";
import type { Announcement } from "../types/database";

export async function listAnnouncements(
  storeId: string,
  { activeOnly = false }: { activeOnly?: boolean } = {},
): Promise<Announcement[]> {
  const supabase = getSupabase();
  let query = supabase
    .from("announcements")
    .select("*")
    .eq("store_id", storeId);

  if (activeOnly) {
    query = query.eq("active", true);
  }

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createAnnouncement(input: {
  store_id: string;
  title: string;
  body: string;
}): Promise<Announcement> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");

  const { data, error } = await supabase
    .from("announcements")
    .insert({
      store_id: input.store_id,
      title: input.title,
      body: input.body,
      active: true,
      created_by: user.id,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deactivateAnnouncement(
  id: string,
): Promise<Announcement> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("announcements")
    .update({ active: false })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
