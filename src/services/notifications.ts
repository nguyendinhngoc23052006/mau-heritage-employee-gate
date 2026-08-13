import { getSupabase } from "../lib/supabaseClient";
import type { Notification } from "../types/database";

export async function listMyNotifications({
  unreadOnly = false,
}: { unreadOnly?: boolean } = {}): Promise<Notification[]> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");

  let query = supabase.from("notifications").select("*").eq("user_id", user.id);

  if (unreadOnly) {
    query = query.is("read_at", null);
  }

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function markRead(id: string): Promise<Notification> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function markAllRead(userId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) throw error;
}
