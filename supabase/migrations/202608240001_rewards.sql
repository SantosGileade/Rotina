-- Rotina: recompensas editaveis pelo casal, com resgate validado no banco.
create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  icon text not null default '🎁',
  name text not null check (char_length(name) between 1 and 60),
  price integer not null check (price > 0 and price <= 100000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index rewards_household_idx on public.rewards(household_id, price);

alter table public.rewards enable row level security;
create policy "rewards household all" on public.rewards for all to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
grant select, insert, update, delete on public.rewards to authenticated;

create or replace function public.redeem_reward(target_reward uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare selected_reward public.rewards; current_balance integer;
begin
  select * into selected_reward from public.rewards where id = target_reward;
  if selected_reward.id is null or not public.is_household_member(selected_reward.household_id) then
    raise exception 'Recompensa não encontrada';
  end if;
  select coalesce(sum(amount), 0) into current_balance from public.coin_ledger where household_id = selected_reward.household_id;
  if current_balance < selected_reward.price then
    raise exception 'Moedas insuficientes para essa recompensa';
  end if;
  insert into public.coin_ledger(household_id, user_id, amount, event_type, reference_id, description)
  values (selected_reward.household_id, (select auth.uid()), -selected_reward.price, 'reward_redeemed', target_reward, 'Recompensa resgatada: ' || selected_reward.name);
end;
$$;

grant execute on function public.redeem_reward(uuid) to authenticated;
