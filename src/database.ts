import { supabase } from "./supabase";

export type DbPerson = "gileade" | "renata";
const startOfWeek=()=>{const now=new Date();now.setDate(now.getDate()-now.getDay());return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;};
const isRealId=(id:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export async function currentHousehold() {
  const { data, error } = await supabase.from("household_members").select("household_id").limit(1).maybeSingle();
  if (error) throw error;
  return data?.household_id as string | undefined;
}

export async function pairHousehold(code:string) {
  const { data, error } = await supabase.rpc("bootstrap_rotina", { access_code: code.trim() });
  if (error) throw error;
  return data as string;
}

export async function loadRotina(householdId:string) {
  const weekStart=startOfWeek();
  const [days,exercises,classes,sessions,swaps]=await Promise.all([
    supabase.from("workout_days").select("*").eq("household_id",householdId),
    supabase.from("workout_exercises").select("*").order("position"),
    supabase.from("group_classes").select("*").eq("household_id",householdId).order("day_of_week").order("position"),
    supabase.from("workout_sessions").select("person,completion_date").eq("household_id",householdId).gte("completion_date",weekStart),
    supabase.from("workout_day_swaps").select("person,day_of_week,source_day").eq("household_id",householdId).eq("week_start",weekStart),
  ]);
  const failed=[days,exercises,classes,sessions].find(result=>result.error);
  if(failed?.error)throw failed.error;
  return {days:days.data||[],exercises:exercises.data||[],classes:classes.data||[],sessions:sessions.data||[],swaps:swaps.error?[]:swaps.data||[]};
}

export async function saveDaySwaps(householdId:string,person:DbPerson,weekStart:string,entries:Array<{day:number;source:number}>){
  const {error:deleteError}=await supabase.from("workout_day_swaps").delete().eq("household_id",householdId).eq("person",person).eq("week_start",weekStart);
  if(deleteError)throw deleteError;
  if(entries.length){const {error}=await supabase.from("workout_day_swaps").insert(entries.map(entry=>({household_id:householdId,person,week_start:weekStart,day_of_week:entry.day,source_day:entry.source})));if(error)throw error;}
}

// Preserva o id dos exercicios existentes (upsert) em vez de apagar e recriar tudo a cada
// salvamento. Recriar tudo gerava ids novos para exercicios de dias que nem foram tocados,
// o que fazia ajustes de carga feitos logo antes (ainda com o id antigo em cache local)
// falharem silenciosamente — a carga nunca chegava a salvar de verdade no banco.
export async function saveWorkoutPlan(householdId:string,person:DbPerson,plan:Record<number,{title:string;muscles:string;duration:number;exercises:Array<{id:string;name:string;sets:number;reps:string;muscle:string;weight:number}>}>){
  for(const [dayKey,item] of Object.entries(plan)){
    const day=Number(dayKey);
    const {data:dayRow,error:dayError}=await supabase.from("workout_days").upsert({household_id:householdId,person,day_of_week:day,title:item.title,muscles:item.muscles,duration_minutes:item.duration,updated_at:new Date().toISOString()},{onConflict:"household_id,person,day_of_week"}).select("id").single();
    if(dayError)throw dayError;
    const {data:existingRows,error:existingError}=await supabase.from("workout_exercises").select("id").eq("workout_day_id",dayRow.id);
    if(existingError)throw existingError;
    const existingIds=new Set((existingRows||[]).map(row=>row.id as string));
    const keepIds=new Set(item.exercises.filter(exercise=>isRealId(exercise.id)).map(exercise=>exercise.id));
    const toDelete=[...existingIds].filter(id=>!keepIds.has(id));
    if(toDelete.length){const {error}=await supabase.from("workout_exercises").delete().in("id",toDelete);if(error)throw error;}
    for(const [index,exercise] of item.exercises.entries()){
      const row={workout_day_id:dayRow.id,position:index,name:exercise.name,sets:exercise.sets,reps:exercise.reps,muscle:exercise.muscle,weight:exercise.weight,updated_at:new Date().toISOString()};
      if(isRealId(exercise.id)&&existingIds.has(exercise.id)){const {error}=await supabase.from("workout_exercises").update(row).eq("id",exercise.id);if(error)throw error;}
      else{const {error}=await supabase.from("workout_exercises").insert(row);if(error)throw error;}
    }
  }
}

export async function saveClasses(householdId:string,person:DbPerson,items:Array<{day:string;name:string;time:string}>){
  const dayNames=["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"];
  const {error:deleteError}=await supabase.from("group_classes").delete().eq("household_id",householdId).eq("person",person);if(deleteError)throw deleteError;
  if(items.length){const {error}=await supabase.from("group_classes").insert(items.map((item,index)=>({household_id:householdId,person,day_of_week:dayNames.indexOf(item.day),name:item.name,class_time:item.time,position:index})));if(error)throw error;}
}

export async function updateExerciseWeight(exerciseId:string,weight:number){
  const {data,error}=await supabase.from("workout_exercises").update({weight,updated_at:new Date().toISOString()}).eq("id",exerciseId).select("id");
  if(error)throw error;
  if(!data||data.length===0)throw new Error("Não foi possível salvar a carga: exercício desatualizado. Recarregue a página e tente novamente.");
}

export async function finishWorkout(dayId:string,person:DbPerson){const {data,error}=await supabase.rpc("finish_workout",{target_workout_day:dayId,target_person:person});if(error)throw error;return Boolean(data);}
export async function finishWorkoutForDate(dayId:string,person:DbPerson,date:string){const {data,error}=await supabase.rpc("finish_workout_for_date",{target_workout_day:dayId,target_person:person,target_date:date});if(error)throw error;return Boolean(data);}
