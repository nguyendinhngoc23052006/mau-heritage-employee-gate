-- approve_shift_swap: atomic swap of a slot from from_user to to_user.
-- Old approveSwap wrote to shifts.claimed_by which is null on multi-slot
-- shifts. This finds the actual slot the from_user holds and moves it.

set check_function_bodies = off;

create or replace function public.approve_shift_swap(p_swap_id uuid)
returns public.shift_swaps language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_swap public.shift_swaps;
  v_shift public.shifts;
  v_slot_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_swap from public.shift_swaps where id = p_swap_id for update;
  if not found then
    raise exception 'swap not found' using errcode = 'P0002';
  end if;
  if v_swap.status <> 'requested' then
    raise exception 'swap is not pending' using errcode = '22023';
  end if;

  select * into v_shift from public.shifts where id = v_swap.shift_id;
  if not public.has_role_on(v_shift.store_id, array['owner','manager']::public.role[]) then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  -- Find the slot on this shift currently held by from_user_id.
  select id into v_slot_id
    from public.shift_slots
   where shift_id = v_swap.shift_id
     and claimed_by = v_swap.from_user_id
   limit 1;

  if v_slot_id is null then
    raise exception 'from_user does not hold a slot on this shift' using errcode = 'P0002';
  end if;

  update public.shift_slots
     set claimed_by = v_swap.to_user_id, claimed_at = now()
   where id = v_slot_id;

  update public.shift_swaps
     set status = 'approved', decided_at = now(), decided_by = v_uid
   where id = p_swap_id
  returning * into v_swap;

  return v_swap;
end $$;

grant execute on function public.approve_shift_swap(uuid) to authenticated;
