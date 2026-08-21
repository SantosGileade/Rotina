-- Rotina: afazeres rotineiros (repetem todos os dias, com exclusão pontual por dia) e conclusões por data.
alter table public.tasks add column if not exists recurring boolean not null default false;

create table if not exists public.task_exclusions (
  task_id uuid not null references public.tasks(id) on delete cascade,
  excluded_date date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  primary key (task_id, excluded_date)
);

alter table public.daily_task_completions add column if not exists completed_date date not null default ((now() at time zone 'America/Sao_Paulo')::date);
alter table public.daily_task_completions drop constraint if exists daily_task_completions_pkey;
alter table public.daily_task_completions add primary key (task_id, person, completed_date);

create or replace function public.set_task_completion(target_task uuid, target_person public.task_assignment, should_complete boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare selected_task public.tasks; today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if target_person = 'both' then raise exception 'Escolha Gileade ou Renata'; end if;
  select * into selected_task from public.tasks where id = target_task;
  if selected_task.id is null or not public.is_household_member(selected_task.household_id) then raise exception 'Acesso negado'; end if;
  if should_complete then
    insert into public.daily_task_completions(task_id, person, completed_by, completed_date) values(target_task, target_person, (select auth.uid()), today) on conflict do nothing;
    if found then insert into public.coin_ledger(household_id,user_id,amount,event_type,reference_id,description) values(selected_task.household_id,(select auth.uid()),selected_task.coin_reward,'task_completed',target_task,'Tarefa concluída: '||selected_task.title); end if;
  else
    delete from public.daily_task_completions where task_id=target_task and person=target_person and completed_date=today;
    if found then insert into public.coin_ledger(household_id,user_id,amount,event_type,reference_id,description) values(selected_task.household_id,(select auth.uid()),-selected_task.coin_reward,'task_reopened',target_task,'Tarefa reaberta: '||selected_task.title); end if;
  end if;
end;
$$;

alter table public.task_exclusions enable row level security;
create policy "task exclusions household all" on public.task_exclusions for all to authenticated using (exists(select 1 from public.tasks t where t.id=task_id and public.is_household_member(t.household_id))) with check (exists(select 1 from public.tasks t where t.id=task_id and public.is_household_member(t.household_id)));
grant select,insert,update,delete on public.task_exclusions to authenticated;
