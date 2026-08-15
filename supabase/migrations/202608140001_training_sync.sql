-- Rotina: vínculo anônimo seguro, conclusões por pessoa, treinos e aulas.
create table if not exists public.household_access (
  household_id uuid primary key references public.households(id) on delete cascade,
  access_code_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_task_completions (
  task_id uuid not null references public.tasks(id) on delete cascade,
  person public.task_assignment not null check (person <> 'both'),
  completed_by uuid not null references auth.users(id),
  completed_at timestamptz not null default now(),
  primary key (task_id, person)
);

create table if not exists public.workout_days (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  person public.task_assignment not null check (person <> 'both'),
  day_of_week smallint not null check (day_of_week between 0 and 6),
  title text not null,
  muscles text not null,
  duration_minutes integer not null default 0 check (duration_minutes between 0 and 600),
  updated_at timestamptz not null default now(),
  unique (household_id, person, day_of_week)
);

create table if not exists public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_day_id uuid not null references public.workout_days(id) on delete cascade,
  position integer not null check (position >= 0),
  name text not null,
  sets integer not null check (sets between 1 and 20),
  reps text not null,
  muscle text not null,
  weight numeric(7,2) not null default 0 check (weight >= 0),
  updated_at timestamptz not null default now(),
  unique (workout_day_id, position)
);

create table if not exists public.group_classes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  person public.task_assignment not null check (person <> 'both'),
  day_of_week smallint not null check (day_of_week between 0 and 6),
  name text not null,
  class_time time not null,
  position integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  workout_day_id uuid not null references public.workout_days(id),
  person public.task_assignment not null check (person <> 'both'),
  completion_date date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  completed_by uuid not null references auth.users(id),
  completed_at timestamptz not null default now(),
  unique (household_id, person, completion_date)
);

create index if not exists workout_days_household_idx on public.workout_days(household_id, person);
create index if not exists group_classes_household_idx on public.group_classes(household_id, person, day_of_week);
create index if not exists workout_sessions_household_idx on public.workout_sessions(household_id, completion_date desc);
alter table public.tasks alter column task_date set default ((now() at time zone 'America/Sao_Paulo')::date);

create or replace function public.bootstrap_rotina(access_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare selected_household uuid;
begin
  if (select auth.uid()) is null then raise exception 'Autenticação necessária'; end if;
  if char_length(trim(access_code)) < 6 then raise exception 'O código deve ter pelo menos 6 caracteres'; end if;

  select household_id into selected_household
  from public.household_members where user_id = (select auth.uid()) limit 1;
  if selected_household is not null then return selected_household; end if;

  select household_id into selected_household from public.household_access
  where access_code_hash = public.crypt(access_code, access_code_hash) limit 1;

  if selected_household is null then
    if exists (select 1 from public.households) then raise exception 'Código do casal inválido'; end if;
    insert into public.households(name, created_by) values ('Gileade e Renata', (select auth.uid())) returning id into selected_household;
    insert into public.household_access(household_id, access_code_hash) values (selected_household, public.crypt(access_code, public.gen_salt('bf')));
    insert into public.household_members(household_id, user_id, role) values (selected_household, (select auth.uid()), 'owner');
  else
    insert into public.household_members(household_id, user_id, role) values (selected_household, (select auth.uid()), 'member') on conflict do nothing;
  end if;
  return selected_household;
end;
$$;

create or replace function public.set_task_completion(target_task uuid, target_person public.task_assignment, should_complete boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare selected_task public.tasks;
begin
  if target_person = 'both' then raise exception 'Escolha Gileade ou Renata'; end if;
  select * into selected_task from public.tasks where id = target_task;
  if selected_task.id is null or not public.is_household_member(selected_task.household_id) then raise exception 'Acesso negado'; end if;
  if should_complete then
    insert into public.daily_task_completions(task_id, person, completed_by) values(target_task, target_person, (select auth.uid())) on conflict do nothing;
    if found then insert into public.coin_ledger(household_id,user_id,amount,event_type,reference_id,description) values(selected_task.household_id,(select auth.uid()),selected_task.coin_reward,'task_completed',target_task,'Tarefa concluída: '||selected_task.title); end if;
  else
    delete from public.daily_task_completions where task_id=target_task and person=target_person;
    if found then insert into public.coin_ledger(household_id,user_id,amount,event_type,reference_id,description) values(selected_task.household_id,(select auth.uid()),-selected_task.coin_reward,'task_reopened',target_task,'Tarefa reaberta: '||selected_task.title); end if;
  end if;
end;
$$;

create or replace function public.finish_workout(target_workout_day uuid, target_person public.task_assignment)
returns boolean language plpgsql security definer set search_path = '' as $$
declare selected_day public.workout_days; inserted_id uuid;
begin
  select * into selected_day from public.workout_days where id=target_workout_day;
  if selected_day.id is null or selected_day.person<>target_person or not public.is_household_member(selected_day.household_id) then raise exception 'Treino inválido'; end if;
  insert into public.workout_sessions(household_id,workout_day_id,person,completed_by)
  values(selected_day.household_id,target_workout_day,target_person,(select auth.uid())) on conflict do nothing returning id into inserted_id;
  if inserted_id is not null then
    insert into public.coin_ledger(household_id,user_id,amount,event_type,reference_id,description)
    values(selected_day.household_id,(select auth.uid()),80,'workout_completed',inserted_id,'Treino concluído: '||selected_day.title);
    return true;
  end if;
  return false;
end;
$$;

alter table public.household_access enable row level security;
alter table public.daily_task_completions enable row level security;
alter table public.workout_days enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.group_classes enable row level security;
alter table public.workout_sessions enable row level security;

create policy "daily completions household read" on public.daily_task_completions for select to authenticated using (exists(select 1 from public.tasks t where t.id=task_id and public.is_household_member(t.household_id)));
create policy "workout days household all" on public.workout_days for all to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "workout exercises household all" on public.workout_exercises for all to authenticated using (exists(select 1 from public.workout_days d where d.id=workout_day_id and public.is_household_member(d.household_id))) with check (exists(select 1 from public.workout_days d where d.id=workout_day_id and public.is_household_member(d.household_id)));
create policy "group classes household all" on public.group_classes for all to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "workout sessions household read" on public.workout_sessions for select to authenticated using (public.is_household_member(household_id));

grant select on public.daily_task_completions, public.workout_sessions to authenticated;
grant select,insert,update,delete on public.workout_days,public.workout_exercises,public.group_classes to authenticated;
grant execute on function public.bootstrap_rotina(text), public.set_task_completion(uuid,public.task_assignment,boolean), public.finish_workout(uuid,public.task_assignment) to authenticated;
