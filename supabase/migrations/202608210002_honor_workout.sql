-- Rotina: permite marcar um treino de um dia passado da mesma semana como concluido,
-- para quando o usuario esqueceu de finalizar no app mas realmente treinou.
create or replace function public.finish_workout_for_date(target_workout_day uuid, target_person public.task_assignment, target_date date)
returns boolean language plpgsql security definer set search_path = '' as $$
declare selected_day public.workout_days; inserted_id uuid; today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into selected_day from public.workout_days where id=target_workout_day;
  if selected_day.id is null or selected_day.person<>target_person or not public.is_household_member(selected_day.household_id) then raise exception 'Treino inválido'; end if;
  if target_date > today then raise exception 'Não é possível concluir um treino no futuro'; end if;
  if extract(dow from target_date)::smallint <> selected_day.day_of_week then raise exception 'A data não corresponde ao dia da semana deste treino'; end if;
  insert into public.workout_sessions(household_id,workout_day_id,person,completed_by,completion_date)
  values(selected_day.household_id,target_workout_day,target_person,(select auth.uid()),target_date)
  on conflict do nothing returning id into inserted_id;
  if inserted_id is not null then
    insert into public.coin_ledger(household_id,user_id,amount,event_type,reference_id,description)
    values(selected_day.household_id,(select auth.uid()),80,'workout_completed',inserted_id,'Treino concluído (registro retroativo): '||selected_day.title);
    return true;
  end if;
  return false;
end;
$$;

grant execute on function public.finish_workout_for_date(uuid,public.task_assignment,date) to authenticated;
