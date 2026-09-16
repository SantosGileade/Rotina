-- Permite trocar o conteudo exibido em dois dias da semana apenas na semana atual,
-- sem alterar o template/plano de treino de cada dia (que continua por dia_of_week).
create table if not exists public.workout_day_swaps (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  person public.task_assignment not null check (person <> 'both'),
  week_start date not null,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  source_day smallint not null check (source_day between 0 and 6),
  updated_at timestamptz not null default now(),
  unique (household_id, person, week_start, day_of_week)
);

create index if not exists workout_day_swaps_household_idx on public.workout_day_swaps(household_id, person, week_start);

alter table public.workout_day_swaps enable row level security;

create policy "workout day swaps household all" on public.workout_day_swaps for all to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));

grant select, insert, update, delete on public.workout_day_swaps to authenticated;
