-- Rotina: núcleo de usuários, casal, tarefas e moedas.
create extension if not exists pgcrypto;

create type public.task_difficulty as enum ('easy', 'medium', 'hard');
create type public.task_assignment as enum ('gileade', 'renata', 'both');
create type public.coin_event_type as enum ('task_completed', 'task_reopened', 'goal_completed', 'workout_completed', 'spiritual_completed', 'reward_redeemed', 'manual_adjustment');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_initial text not null check (char_length(avatar_initial) between 1 and 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Gileade e Renata',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  category text not null default 'Casa',
  difficulty public.task_difficulty not null default 'easy',
  coin_reward integer not null default 5 check (coin_reward between 0 and 1000),
  assignment public.task_assignment not null default 'both',
  task_date date not null default current_date,
  task_time time,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.task_completions (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create table public.coin_ledger (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  amount integer not null check (amount <> 0),
  event_type public.coin_event_type not null,
  reference_id uuid,
  description text not null,
  created_at timestamptz not null default now()
);

create index tasks_household_date_idx on public.tasks(household_id, task_date);
create index coin_ledger_household_created_idx on public.coin_ledger(household_id, created_at desc);

create or replace function public.is_household_member(target_household uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_members
    where household_id = target_household and user_id = (select auth.uid())
  );
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar_initial)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    upper(left(coalesce(new.raw_user_meta_data ->> 'display_name', new.email), 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.create_household(household_name text default 'Gileade e Renata')
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_household uuid;
begin
  if (select auth.uid()) is null then raise exception 'Autenticação necessária'; end if;
  if exists (select 1 from public.household_members where user_id = (select auth.uid())) then
    raise exception 'Usuário já pertence a um casal';
  end if;
  insert into public.households(name, created_by)
  values (household_name, (select auth.uid())) returning id into new_household;
  insert into public.household_members(household_id, user_id, role)
  values (new_household, (select auth.uid()), 'owner');
  return new_household;
end;
$$;

create or replace function public.complete_task(target_task uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare selected_task public.tasks;
begin
  select * into selected_task from public.tasks where id = target_task;
  if selected_task.id is null or not public.is_household_member(selected_task.household_id) then
    raise exception 'Tarefa não encontrada ou acesso negado';
  end if;

  insert into public.task_completions(task_id, user_id)
  values (target_task, (select auth.uid()))
  on conflict do nothing;

  if found then
    insert into public.coin_ledger(household_id, user_id, amount, event_type, reference_id, description)
    values (selected_task.household_id, (select auth.uid()), selected_task.coin_reward, 'task_completed', target_task, 'Tarefa concluída: ' || selected_task.title);
  end if;
end;
$$;

create or replace function public.reopen_task(target_task uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare selected_task public.tasks;
begin
  select * into selected_task from public.tasks where id = target_task;
  if selected_task.id is null or not public.is_household_member(selected_task.household_id) then
    raise exception 'Tarefa não encontrada ou acesso negado';
  end if;

  delete from public.task_completions where task_id = target_task and user_id = (select auth.uid());
  if found then
    insert into public.coin_ledger(household_id, user_id, amount, event_type, reference_id, description)
    values (selected_task.household_id, (select auth.uid()), -selected_task.coin_reward, 'task_reopened', target_task, 'Tarefa reaberta: ' || selected_task.title);
  end if;
end;
$$;

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.tasks enable row level security;
alter table public.task_completions enable row level security;
alter table public.coin_ledger enable row level security;

create policy "profiles self read" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "profiles self update" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "households members read" on public.households for select to authenticated using (public.is_household_member(id));
create policy "households authenticated create" on public.households for insert to authenticated with check (created_by = (select auth.uid()));
create policy "members household read" on public.household_members for select to authenticated using (public.is_household_member(household_id));
create policy "tasks household read" on public.tasks for select to authenticated using (public.is_household_member(household_id));
create policy "tasks household create" on public.tasks for insert to authenticated with check (public.is_household_member(household_id) and created_by = (select auth.uid()));
create policy "tasks household update" on public.tasks for update to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "tasks household delete" on public.tasks for delete to authenticated using (public.is_household_member(household_id));
create policy "completions household read" on public.task_completions for select to authenticated using (exists (select 1 from public.tasks t where t.id = task_id and public.is_household_member(t.household_id)));
create policy "ledger household read" on public.coin_ledger for select to authenticated using (public.is_household_member(household_id));

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles, public.households, public.household_members, public.tasks to authenticated;
grant select on public.task_completions, public.coin_ledger to authenticated;
grant execute on function public.complete_task(uuid), public.reopen_task(uuid) to authenticated;
grant execute on function public.create_household(text) to authenticated;

create or replace view public.household_balances with (security_invoker = true) as
select household_id, coalesce(sum(amount), 0)::integer as balance
from public.coin_ledger group by household_id;
grant select on public.household_balances to authenticated;
