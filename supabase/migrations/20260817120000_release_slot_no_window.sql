-- release_slot: drop the 5-minute window. Employees can release any slot
-- they own until the shift starts. FCFS + per-shift claim_open gate already
-- prevent shift-stealing; the window just prevented legitimate un-signups.

set check_function_bodies = off;

create or replace function public.release_slot(p_slot_id uuid)
returns public.shift_slots language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_slot public.shift_slots;
  v_shift public.shifts;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_slot from public.shift_slots where id = p_slot_id;
  if not found then
    raise exception 'slot not found' using errcode = 'P0002';
  end if;

  if v_slot.claimed_by is null or v_slot.claimed_by <> v_uid then
    raise exception 'this slot is not claimed by you' using errcode = '42501';
  end if;

  select * into v_shift from public.shifts where id = v_slot.shift_id;
  if v_shift.starts_at <= now() then
    raise exception 'cannot release a shift that has already started' using errcode = '42501';
  end if;

  update public.shift_slots
     set claimed_by = null, claimed_at = null
   where id = p_slot_id
  returning * into v_slot;

  return v_slot;
end $$;
