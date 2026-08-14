-- Fix regenerate_join_code: the previous version's inner
-- `gen_random_bytes(6)` fails on Supabase because pgcrypto lives in the
-- `extensions` schema and the function's `set search_path = public`
-- doesn't include it. Qualify the call explicitly.

set check_function_bodies = off;

create or replace function public.regenerate_join_code(p_store_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_code text;
begin
  if not public.has_role_on(p_store_id, array['owner','manager']::public.role[]) then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  loop
    v_code := lower(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 12));
    begin
      update public.stores set join_code = v_code where id = p_store_id;
      exit;
    exception when unique_violation then
      -- retry
    end;
  end loop;

  return v_code;
end $$;

grant execute on function public.regenerate_join_code(uuid) to authenticated;
