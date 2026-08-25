-- Move tarefas avulsas não concluídas de ontem para hoje com uma penalidade de 4 pontos.
-- A atualização da própria tarefa torna a operação idempotente, inclusive com várias
-- sessões abertas ao mesmo tempo.
create or replace function public.rollover_incomplete_tasks()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  moved_count integer;
begin
  update public.tasks task
     set task_date = today,
         coin_reward = greatest(0, task.coin_reward - 4),
         updated_at = now()
   where task.task_date = today - 1
     and task.recurring = false
     and public.is_household_member(task.household_id)
     and not exists (
       select 1
         from public.daily_task_completions completion
        where completion.task_id = task.id
          and completion.completed_date = today - 1
     );

  get diagnostics moved_count = row_count;
  return moved_count;
end;
$$;

grant execute on function public.rollover_incomplete_tasks() to authenticated;
